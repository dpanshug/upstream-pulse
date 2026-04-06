# Database Backups

> **Production only.** Automated S3 backups run only on the production cluster.
> Dev and preprod clusters do not need backups — the data is reproducible
> from GitHub APIs by re-running the collectors.

## Backup Overview

| Setting | Value |
|---|---|
| **Database** | PostgreSQL 16, `upstream_pulse` |
| **Backup method** | `pg_dump` (logical, plain SQL) |
| **Destination** | AWS S3 bucket `upstream-pulse-db-backups` |
| **Encryption** | SSE-S3 (AES-256, server-side at rest) |
| **Schedule** | Daily at 2:00 AM UTC |
| **Retention** | 14 days for daily backups |
| **Pre-deploy backups** | Triggered automatically before each deployment |
| **Monitoring** | Daily check at 6:00 AM UTC via CronJob |
| **Restore testing** | Monthly (1st of month, 4:00 AM UTC) via throwaway Postgres pod |
| **RPO** | Maximum 24 hours of data loss |
| **RTO** | ~15 minutes (download + restore + app restart) |

## List Available Backups

```bash
# From your local machine (requires AWS CLI configured)
aws s3 ls s3://upstream-pulse-db-backups/backups/ --region ap-south-1

# From the cluster (using the backup pod's credentials)
oc -n upstream-pulse create job list-backups-$(date +%s) \
  --from=cronjob/postgres-backup \
  -- sh -c 'aws s3 ls s3://${S3_BUCKET}/backups/'
```

## Trigger a Manual Backup

```bash
oc -n upstream-pulse create job manual-backup-$(date +%s) \
  --from=cronjob/postgres-backup

# Watch the logs
oc -n upstream-pulse logs -f -l app.kubernetes.io/name=postgres-backup --tail=50
```

## Check Backup Health

```bash
# View the latest monitor result
oc -n upstream-pulse logs -l app.kubernetes.io/name=postgres-backup-monitor --tail=20

# View the latest restore test result
oc -n upstream-pulse logs -l app.kubernetes.io/name=postgres-restore-test --tail=50

# Check CronJob status
oc -n upstream-pulse get cronjobs
```

## Restore from S3

### Step 1: Identify the backup to restore

```bash
aws s3 ls s3://upstream-pulse-db-backups/backups/ --region ap-south-1
```

Pick a filename, e.g. `upstream-pulse-20260314-020000.sql.gz`.

### Step 2: Scale down the application

```bash
oc -n upstream-pulse scale deploy/backend deploy/worker --replicas=0

# Verify pods are terminated
oc -n upstream-pulse get pods -l 'app.kubernetes.io/name in (backend, worker)'
```

### Step 3: Run the restore Job

Edit the `BACKUP_FILE` value in `deploy/openshift/overlays/prod/postgres-restore-job.yaml` to the filename from step 1, then:

```bash
# Delete any previous restore Job (Job names are immutable)
oc -n upstream-pulse delete job/postgres-restore --ignore-not-found

# Apply and monitor
oc -n upstream-pulse apply -f deploy/openshift/overlays/prod/postgres-restore-job.yaml
oc -n upstream-pulse logs -f job/postgres-restore
```

### Step 4: Scale the application back up

Drizzle migrations run automatically via the init container on backend startup.

```bash
oc -n upstream-pulse scale deploy/backend --replicas=1
oc -n upstream-pulse scale deploy/worker --replicas=1

# Wait for rollout
oc -n upstream-pulse rollout status deploy/backend --timeout=180s
oc -n upstream-pulse rollout status deploy/worker --timeout=120s
```

### Step 5: Verify

```bash
# Check the backend is healthy
oc -n upstream-pulse exec deploy/backend -- \
  node -e "fetch('http://localhost:4321/health').then(r=>r.json()).then(console.log)"

# Spot-check data
oc -n upstream-pulse exec deploy/postgres -- \
  psql -U postgres upstream_pulse -c "SELECT count(*) FROM projects;"
```

## Restore to a Different Cluster

If the original cluster is lost and you need to restore to a new environment:

1. **Create the namespace**:
   ```bash
   oc new-project upstream-pulse
   ```

2. **Create secrets** (see `deploy/openshift/base/secrets.example.yaml`):
   ```bash
   oc create secret generic postgres-credentials --from-literal=... -n upstream-pulse
   oc create secret generic aws-s3-credentials --from-literal=... -n upstream-pulse
   oc create secret generic upstream-pulse-secrets --from-literal=... -n upstream-pulse
   oc create secret generic frontend-proxy-cookie --from-literal=... -n upstream-pulse
   ```

3. **Build and push images** to the new cluster's registry:
   ```bash
   ./deploy/deploy.sh build
   ./deploy/deploy.sh push
   ```

4. **Apply manifests** (this creates PVCs, deployments, etc.):
   ```bash
   DEPLOY_ENV=prod ./deploy/deploy.sh apply
   # or: oc apply -k deploy/openshift/overlays/prod/
   ```

5. **Scale down backend/worker** (they'll crash-loop without data):
   ```bash
   oc -n upstream-pulse scale deploy/backend deploy/worker --replicas=0
   ```

6. **Run the restore Job** as described above.

7. **Scale back up** and verify.

## Failure Scenarios

### PVC corruption (Postgres data directory damaged)

1. The Postgres pod will crash-loop
2. Scale down backend and worker
3. Delete the corrupted PVC: `oc -n upstream-pulse delete pvc/postgres-data` (this destroys all data)
4. Reapply manifests to recreate the PVC: `oc apply -k deploy/openshift/overlays/prod/`
5. Wait for Postgres to start with a fresh, empty database
6. Run the restore Job with the latest backup
7. Scale backend and worker back up

### Accidental table drop or data deletion

1. Scale down backend and worker to prevent further writes
2. Run the restore Job with the most recent backup before the incident
3. Scale back up
4. Data between the backup and the incident is lost (up to 24 hours)

### Full cluster loss

Follow the "Restore to a Different Cluster" procedure above. The S3 backups are independent of the cluster and remain accessible.

### AWS credentials rotated or expired

1. Generate new access keys for the `upstream-pulse-backup` IAM user in the AWS Console
2. Update the secret on the cluster:
   ```bash
   oc -n upstream-pulse delete secret/aws-s3-credentials
   oc create secret generic aws-s3-credentials \
     --from-literal=AWS_ACCESS_KEY_ID=<new-key> \
     --from-literal=AWS_SECRET_ACCESS_KEY=<new-secret> \
     --from-literal=AWS_DEFAULT_REGION=ap-south-1 \
     --from-literal=S3_BUCKET=upstream-pulse-db-backups \
     --from-literal=BACKUP_RETENTION_DAYS=14 \
     -n upstream-pulse
   ```
3. No pod restarts needed — the next CronJob run will pick up the new credentials

## Verify Backup Integrity Manually

Download a backup and test restore locally:

```bash
# Download
aws s3 cp s3://upstream-pulse-db-backups/backups/upstream-pulse-20260314-020000.sql.gz ./backup.sql.gz

# Test decompression
gunzip -t ./backup.sql.gz && echo "Gzip OK" || echo "Gzip CORRUPT"

# Test restore to local Docker Postgres
gunzip -c ./backup.sql.gz | docker compose exec -T postgres psql -U postgres upstream_pulse

# Verify
docker compose exec postgres psql -U postgres upstream_pulse -c '\dt'
```

## Architecture Reference

```
Production Cluster (upstream-pulse namespace)
├── PostgreSQL Pod ←→ PVC (5Gi, postgres-data)
├── Daily Backup CronJob (2:00 AM UTC)
│   └── pg_dump → gzip → aws s3 cp --sse AES256
├── Monitor CronJob (6:00 AM UTC)
│   └── aws s3api head-object (check file exists + size)
├── Restore Test CronJob (1st of month, 4:00 AM UTC)
│   └── Download → throwaway Postgres → restore → sanity check
├── Restore Job (manual trigger)
│   └── aws s3 cp → gunzip → psql
└── Pre-Deploy Backup (in deploy.sh)
    └── oc create job --from=cronjob/postgres-backup

Dev / Preprod Clusters
└── No backup CronJobs deployed (data is re-collectable from GitHub)

AWS S3 (upstream-pulse-db-backups, SSE-S3)
├── backups/upstream-pulse-YYYYMMDD-HHMMSS.sql.gz (daily, 14-day retention)
└── backups/pre-deploy/... (pre-deployment, 30-day retention)
```

## Deployment

Backups are managed via Kustomize overlays. The prod overlay includes backup CronJobs;
the dev overlay does not.

```bash
# Dev / Preprod — no backups:
DEPLOY_ENV=dev ./deploy/deploy.sh apply
# or: oc apply -k deploy/openshift/overlays/dev/

# Production — includes backup CronJobs:
DEPLOY_ENV=prod ./deploy/deploy.sh apply
# or: oc apply -k deploy/openshift/overlays/prod/
```
