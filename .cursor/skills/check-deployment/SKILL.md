---
name: check-deployment
description: Checks deployment health of Upstream Pulse on OpenShift — inspects pods, services, routes, database connectivity, queue health, and worker status. Use when asked to check deployment status, verify health, or diagnose infrastructure issues.
---

# Check Deployment Health

All commands in this skill are read-only (`oc get`, `oc describe`, `oc logs`, `SELECT` queries). Safe to run without user approval per cluster-safety rules.

## Step 1: Pod Status

```bash
oc get pods -n upstream-pulse -o wide
```

All pods should show `Running` with `READY` matching expected container count:

| Deployment | Expected containers | Notes |
|------------|-------------------|-------|
| `postgres` | 1/1 | Single replica, Recreate strategy |
| `redis` | 1/1 | Single replica |
| `backend` | 1/1 | Has init container `db-migrate` (runs before main) |
| `worker` | 1/1 | Same image as backend, runs `node dist/worker.js` |
| `frontend` | 2/2 | nginx + oauth-proxy sidecar |

If pods are in `CrashLoopBackOff` or `Init:Error`, check logs (Step 4).

## Step 2: Service and Route

```bash
oc get svc -n upstream-pulse
oc get route -n upstream-pulse
```

Expected services: `backend` (port 3000), `frontend` (port 4180 via oauth-proxy), `postgres` (port 5432), `redis` (port 6379).

Check the route URL is accessible and TLS is configured.

## Step 3: Health Endpoints

Backend liveness and readiness:

```bash
oc exec -n upstream-pulse deploy/backend -- node -e "
Promise.all([
  fetch('http://127.0.0.1:3000/health').then(r=>r.json()),
  fetch('http://127.0.0.1:3000/ready').then(r=>r.json())
]).then(([h,r])=>console.log('health:', JSON.stringify(h), 'ready:', JSON.stringify(r)))
"
```

## Step 4: Logs

Check recent logs for errors:

```bash
oc logs -n upstream-pulse deploy/backend --tail=50
oc logs -n upstream-pulse deploy/worker --tail=50
oc logs -n upstream-pulse deploy/frontend -c frontend --tail=50
```

For the oauth-proxy sidecar:

```bash
oc logs -n upstream-pulse deploy/frontend -c oauth-proxy --tail=50
```

## Step 5: Database Connectivity

```bash
oc exec -n upstream-pulse deploy/postgres -- psql -U postgres -d upstream_pulse \
  -c "SELECT COUNT(*) as projects FROM projects; SELECT COUNT(*) as contributions FROM contributions; SELECT COUNT(*) as team_members FROM team_members;"
```

## Step 6: Queue and Worker Health

```bash
oc exec -n upstream-pulse deploy/backend -- node -e "
fetch('http://127.0.0.1:3000/api/system/status')
  .then(r=>r.json())
  .then(d=>console.log(JSON.stringify(d, null, 2)))
"
```

This returns queue stats, recent jobs, worker health, and next scheduled cron runs.

## Step 7: Resource Usage

```bash
oc adm top pods -n upstream-pulse
```

Compare against resource limits:

| Component | CPU limit | Memory limit |
|-----------|-----------|-------------|
| Backend | 500m | 512Mi |
| Worker | 500m | 512Mi |
| Frontend | 200m | 128Mi |
| Postgres | 500m | 512Mi |
| Redis | 250m | 256Mi |

If any pod is near its memory limit, it may be OOMKilled.

## Step 8: Recent Deployments

```bash
oc get replicasets -n upstream-pulse --sort-by=.metadata.creationTimestamp | tail -10
```

Check if recent rollouts completed successfully:

```bash
oc rollout status deploy/backend -n upstream-pulse
oc rollout status deploy/worker -n upstream-pulse
oc rollout status deploy/frontend -n upstream-pulse
```

## Quick Summary Template

After running the checks, summarize:

```
Deployment Status: [Healthy / Degraded / Down]
- Pods: [all running / issues with X]
- Backend: [healthy / unhealthy - reason]
- Worker: [healthy / unhealthy - reason]
- Frontend: [healthy / unhealthy - reason]
- Database: [connected / issues - reason]
- Queues: [healthy / backlog of N jobs]
- Last sync: [timestamp]
- Next scheduled: [timestamp]
```
