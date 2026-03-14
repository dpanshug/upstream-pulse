#!/usr/bin/env bash
# =============================================================================
# Upstream Pulse — OpenShift Deployment Script
#
# Usage:
#   ./deploy/deploy.sh                    # Full deploy (build + push + apply)
#   ./deploy/deploy.sh build              # Build images only
#   ./deploy/deploy.sh push               # Push images to OpenShift registry
#   ./deploy/deploy.sh apply              # Apply OpenShift manifests only
#   ./deploy/deploy.sh status             # Show deployment status
#   ./deploy/deploy.sh logs [component]   # Tail logs (backend|frontend|worker)
# =============================================================================
set -euo pipefail

# --- Configuration ---
PUSH_REGISTRY="${PUSH_REGISTRY:-}"
DEPLOY_REGISTRY="${DEPLOY_REGISTRY:-image-registry.openshift-image-registry.svc:5000}"
REGISTRY_ORG="${REGISTRY_ORG:-upstream-pulse}"
NAMESPACE="${NAMESPACE:-upstream-pulse}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [ -z "${IMAGE_TAG:-}" ]; then
    if git -C "${PROJECT_ROOT}" rev-parse --is-inside-work-tree &>/dev/null; then
        IMAGE_TAG="$(git -C "${PROJECT_ROOT}" rev-parse --short=12 HEAD)"
    else
        IMAGE_TAG="$(date +%Y%m%d%H%M%S)"
    fi
fi

DEPLOY_BACKEND_IMAGE="${DEPLOY_REGISTRY}/${NAMESPACE}/backend:${IMAGE_TAG}"
DEPLOY_FRONTEND_IMAGE="${DEPLOY_REGISTRY}/${NAMESPACE}/frontend:${IMAGE_TAG}"
DEPLOY_BACKUP_IMAGE="${DEPLOY_REGISTRY}/${NAMESPACE}/pg-backup:16-alpine"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log()  { echo -e "${GREEN}[✓]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[✗]${NC} $*" >&2; }
info() { echo -e "${BLUE}[i]${NC} $*"; }

# --- Functions ---

build_images() {
    log "Building backend image: ${PUSH_BACKEND_IMAGE}"
    docker build \
        --platform linux/amd64 \
        -t "${PUSH_BACKEND_IMAGE}" \
        -f "${PROJECT_ROOT}/backend/Dockerfile" \
        "${PROJECT_ROOT}/backend"

    log "Building frontend image: ${PUSH_FRONTEND_IMAGE}"
    docker build \
        --platform linux/amd64 \
        -t "${PUSH_FRONTEND_IMAGE}" \
        -f "${PROJECT_ROOT}/frontend/Dockerfile" \
        "${PROJECT_ROOT}/frontend"

    log "Building backup image: ${PUSH_BACKUP_IMAGE}"
    docker build \
        --platform linux/amd64 \
        -t "${PUSH_BACKUP_IMAGE}" \
        -f "${PROJECT_ROOT}/deploy/openshift/backup.Dockerfile" \
        "${PROJECT_ROOT}/deploy/openshift"

    log "Images built successfully"
}

ensure_docker_login() {
    info "Ensuring Docker is logged in to ${PUSH_REGISTRY}..."
    local token
    token="$(oc whoami -t)"
    if echo "${token}" | docker login "${PUSH_REGISTRY}" -u "$(oc whoami)" --password-stdin &>/dev/null; then
        log "Docker authenticated to ${PUSH_REGISTRY}"
    else
        err "Failed to authenticate Docker to ${PUSH_REGISTRY}"
        err "Try manually: docker login ${PUSH_REGISTRY} -u \$(oc whoami) -p \$(oc whoami -t)"
        exit 1
    fi
}

push_images() {
    ensure_docker_login
    log "Pushing backend image: ${PUSH_BACKEND_IMAGE}"
    docker push "${PUSH_BACKEND_IMAGE}"

    log "Pushing frontend image: ${PUSH_FRONTEND_IMAGE}"
    docker push "${PUSH_FRONTEND_IMAGE}"

    log "Pushing backup image: ${PUSH_BACKUP_IMAGE}"
    docker push "${PUSH_BACKUP_IMAGE}"

    log "Images pushed successfully"
}

verify_deployment_spec_images() {
    info "Verifying deployment specs match expected images"

    local frontend_deploy_image
    local backend_deploy_image
    local worker_deploy_image

    frontend_deploy_image="$(oc -n "${NAMESPACE}" get deployment/frontend -o jsonpath='{.spec.template.spec.containers[?(@.name=="frontend")].image}')"
    backend_deploy_image="$(oc -n "${NAMESPACE}" get deployment/backend -o jsonpath='{.spec.template.spec.containers[?(@.name=="backend")].image}')"
    worker_deploy_image="$(oc -n "${NAMESPACE}" get deployment/worker -o jsonpath='{.spec.template.spec.containers[?(@.name=="worker")].image}')"

    if [ "${frontend_deploy_image}" != "${DEPLOY_FRONTEND_IMAGE}" ]; then
        err "Frontend deployment image mismatch. Expected ${DEPLOY_FRONTEND_IMAGE}, got ${frontend_deploy_image}"
        exit 1
    fi
    if [ "${backend_deploy_image}" != "${DEPLOY_BACKEND_IMAGE}" ]; then
        err "Backend deployment image mismatch. Expected ${DEPLOY_BACKEND_IMAGE}, got ${backend_deploy_image}"
        exit 1
    fi
    if [ "${worker_deploy_image}" != "${DEPLOY_BACKEND_IMAGE}" ]; then
        err "Worker deployment image mismatch. Expected ${DEPLOY_BACKEND_IMAGE}, got ${worker_deploy_image}"
        exit 1
    fi

    log "Deployment spec image verification passed"
}

verify_component_state() {
    local component="$1"
    local expected_image="$2"
    local pod_statuses
    local has_ready=0

    # Filter containerStatuses by the component name to handle multi-container pods (e.g. oauth-proxy sidecar)
    pod_statuses="$(oc -n "${NAMESPACE}" get pods -l "app.kubernetes.io/name=${component}" -o jsonpath='{range .items[*]}{.metadata.name}{"|"}{range .status.containerStatuses[*]}{.name}={.ready}={.state.waiting.reason}={.image},{end}{"\n"}{end}')"

    if [ -z "${pod_statuses}" ]; then
        err "No pods found for component '${component}'"
        exit 1
    fi

    while IFS='|' read -r pod_name container_info; do
        [ -z "${pod_name}" ] && continue
        IFS=',' read -ra containers <<< "${container_info}"
        for entry in "${containers[@]}"; do
            [ -z "${entry}" ] && continue
            IFS='=' read -r cname cready cwaiting cimage <<< "${entry}"
            [ "${cname}" != "${component}" ] && continue

            if [ -n "${cwaiting}" ] && [ "${cwaiting}" != "<no value>" ]; then
                err "Pod ${pod_name} container ${cname} is waiting: ${cwaiting}"
                exit 1
            fi

            if [ "${cready}" = "true" ] && [ "${cimage}" = "${expected_image}" ]; then
                has_ready=1
            fi
        done
    done <<< "${pod_statuses}"

    if [ "${has_ready}" -ne 1 ]; then
        err "No ready ${component} pod is running expected image ${expected_image}"
        exit 1
    fi
}

verify_running_pod_state() {
    info "Verifying running pods are ready with expected images"

    verify_component_state "backend" "${DEPLOY_BACKEND_IMAGE}"
    verify_component_state "worker" "${DEPLOY_BACKEND_IMAGE}"
    verify_component_state "frontend" "${DEPLOY_FRONTEND_IMAGE}"

    log "Running pod verification passed"
}

save_access_stats() {
    local stats_dir="${PROJECT_ROOT}"
    local timestamp
    timestamp="$(date +%Y-%m-%d)"
    local stats_file="${stats_dir}/access-stats-${timestamp}.txt"

    info "Saving access stats before redeploy..."
    local tmp_stats
    tmp_stats="$(mktemp)"
    if oc -n "${NAMESPACE}" logs deployment/frontend -c oauth-proxy 2>/dev/null \
        | grep "authentication complete" \
        | sed 's/.*\([0-9]\{4\}\/[0-9]\{2\}\/[0-9]\{2\} [0-9]\{2\}:[0-9]\{2\}:[0-9]\{2\}\).*Session{\(.*\)@cluster.local.*/\1  \2/' \
        > "${tmp_stats}" 2>/dev/null; then
        local count
        count="$(wc -l < "${tmp_stats}" | tr -d ' ')"
        if [ "${count}" -gt 0 ]; then
            if [ -f "${stats_file}" ]; then
                local new_lines
                new_lines="$(grep -vFxf "${stats_file}" "${tmp_stats}" 2>/dev/null | wc -l | tr -d ' ' || echo "0")"
                if [ "${new_lines}" -gt 0 ]; then
                    grep -vFxf "${stats_file}" "${tmp_stats}" >> "${stats_file}" 2>/dev/null || true
                fi
                log "Appended ${new_lines} new entries to ${stats_file}"
            else
                cp "${tmp_stats}" "${stats_file}"
                log "Saved ${count} access entries to ${stats_file}"
            fi
        else
            info "No access stats to save"
        fi
    else
        info "Could not retrieve access stats (frontend may not be running)"
    fi
    rm -f "${tmp_stats}"
}

set_runtime_images() {
    info "Setting deployment images to tag: ${IMAGE_TAG}"

    oc -n "${NAMESPACE}" set image deployment/backend \
        backend="${DEPLOY_BACKEND_IMAGE}" \
        db-migrate="${DEPLOY_BACKEND_IMAGE}"
    oc -n "${NAMESPACE}" set image deployment/worker \
        worker="${DEPLOY_BACKEND_IMAGE}"
    oc -n "${NAMESPACE}" set image deployment/frontend \
        frontend="${DEPLOY_FRONTEND_IMAGE}"
}

ensure_cluster_context() {
    local confirm_prompt="${1:-true}"

    if ! oc whoami &>/dev/null; then
        err "Not logged in to OpenShift. Run 'oc login' first."
        exit 1
    fi

    local current_user current_cluster current_project
    local expected_cluster="${EXPECTED_CLUSTER:-}"

    current_user="$(oc whoami)"
    current_cluster="$(oc whoami --show-server)"
    current_project="$(oc project -q 2>/dev/null || true)"

    info "Logged in as:    ${current_user}"
    info "Current cluster: ${current_cluster}"
    info "Current project: ${current_project:-unknown}"
    info "Target namespace: ${NAMESPACE}"

    if [ -n "${expected_cluster}" ] && [ "${current_cluster}" != "${expected_cluster}" ]; then
        err "Cluster mismatch. Expected ${expected_cluster}, got ${current_cluster}"
        exit 1
    fi

    if [ "${confirm_prompt}" != "true" ] || [ "${SKIP_CLUSTER_CONFIRM:-false}" = "true" ]; then
        [ "${SKIP_CLUSTER_CONFIRM:-false}" = "true" ] && warn "Skipping cluster confirmation (SKIP_CLUSTER_CONFIRM=true)"
        return
    fi

    if [ ! -t 0 ]; then
        err "Non-interactive shell detected. Set SKIP_CLUSTER_CONFIRM=true to proceed."
        exit 1
    fi

    echo ""
    warn "You are about to target cluster: ${current_cluster}"
    warn "Project: ${current_project:-unknown} | Namespace: ${NAMESPACE}"
    read -r -p "Proceed? [y/N] " cluster_confirm
    if [[ ! "${cluster_confirm}" =~ ^[Yy]$ ]]; then
        info "Aborted."
        exit 1
    fi
}

ensure_push_registry() {
    if [ -n "${PUSH_REGISTRY}" ]; then
        info "Using PUSH_REGISTRY from environment: ${PUSH_REGISTRY}"
    else
        info "PUSH_REGISTRY not set — auto-discovering from cluster..."
        PUSH_REGISTRY="$(oc get route default-route -n openshift-image-registry -o jsonpath='{.spec.host}' 2>/dev/null || true)"
        if [ -z "${PUSH_REGISTRY}" ]; then
            err "Could not auto-discover the image registry route."
            err "Ensure the default-route exists in openshift-image-registry, or set PUSH_REGISTRY manually."
            exit 1
        fi
        log "Auto-discovered PUSH_REGISTRY: ${PUSH_REGISTRY}"
    fi

    PUSH_BACKEND_IMAGE="${PUSH_REGISTRY}/${REGISTRY_ORG}/backend:${IMAGE_TAG}"
    PUSH_FRONTEND_IMAGE="${PUSH_REGISTRY}/${REGISTRY_ORG}/frontend:${IMAGE_TAG}"
    PUSH_BACKUP_IMAGE="${PUSH_REGISTRY}/${REGISTRY_ORG}/pg-backup:16-alpine"
}

pre_deploy_backup() {
    if ! oc -n "${NAMESPACE}" get cronjob/postgres-backup &>/dev/null; then
        warn "Backup CronJob not found — skipping pre-deploy backup"
        return 0
    fi

    if ! oc -n "${NAMESPACE}" get secret/aws-s3-credentials &>/dev/null; then
        warn "aws-s3-credentials secret not found — skipping pre-deploy backup"
        return 0
    fi

    local job_name="pre-deploy-backup-$(date +%s)"
    info "Triggering pre-deploy backup: ${job_name}"

    oc -n "${NAMESPACE}" create job "${job_name}" --from=cronjob/postgres-backup

    info "Waiting for pre-deploy backup to complete (timeout: 10 min)..."
    if oc -n "${NAMESPACE}" wait --for=condition=complete "job/${job_name}" --timeout=600s 2>/dev/null; then
        log "Pre-deploy backup completed successfully"
    else
        local job_status
        job_status=$(oc -n "${NAMESPACE}" get "job/${job_name}" -o jsonpath='{.status.conditions[0].type}' 2>/dev/null || echo "Unknown")
        if [ "${job_status}" = "Failed" ]; then
            err "Pre-deploy backup FAILED. Aborting deployment."
            err "Check logs: oc -n ${NAMESPACE} logs job/${job_name}"
            exit 1
        else
            warn "Pre-deploy backup timed out (status: ${job_status}). Proceeding with caution."
        fi
    fi
}

apply_manifests() {
    log "Applying OpenShift manifests..."
    oc apply -k "${SCRIPT_DIR}/openshift"

    # Patch configmap with org-specific values from environment
    if [ -n "${ORG_NAME:-}" ] || [ -n "${ORG_DESCRIPTION:-}" ] || [ -n "${ADMIN_CONTACT_NAME:-}" ]; then
        info "Patching configmap with org-specific values..."
        local patch_data="{\"data\":{"
        local needs_comma=false
        if [ -n "${ORG_NAME:-}" ]; then
            patch_data+="\"ORG_NAME\":\"${ORG_NAME}\""
            needs_comma=true
        fi
        if [ -n "${ORG_DESCRIPTION:-}" ]; then
            ${needs_comma} && patch_data+=","
            patch_data+="\"ORG_DESCRIPTION\":\"${ORG_DESCRIPTION}\""
            needs_comma=true
        fi
        if [ -n "${ADMIN_CONTACT_NAME:-}" ]; then
            ${needs_comma} && patch_data+=","
            patch_data+="\"ADMIN_CONTACT_NAME\":\"${ADMIN_CONTACT_NAME}\""
            needs_comma=true
        fi
        if [ -n "${ADMIN_CONTACT_URL:-}" ]; then
            ${needs_comma} && patch_data+=","
            patch_data+="\"ADMIN_CONTACT_URL\":\"${ADMIN_CONTACT_URL}\""
        fi
        patch_data+="}}"
        oc -n "${NAMESPACE}" patch configmap upstream-pulse-config --type merge -p "${patch_data}"
        log "ConfigMap patched with org / admin contact values"
    else
        warn "ORG_NAME and ORG_DESCRIPTION not set — skipping configmap patch"
    fi

    save_access_stats
    pre_deploy_backup
    set_runtime_images

    log "Waiting for PostgreSQL to be ready..."
    oc -n "${NAMESPACE}" rollout status deployment/postgres --timeout=120s

    log "Waiting for Redis to be ready..."
    oc -n "${NAMESPACE}" rollout status deployment/redis --timeout=120s

    log "Waiting for backend to be ready..."
    oc -n "${NAMESPACE}" rollout status deployment/backend --timeout=180s

    log "Waiting for worker to be ready..."
    oc -n "${NAMESPACE}" rollout status deployment/worker --timeout=120s

    log "Waiting for frontend to be ready..."
    oc -n "${NAMESPACE}" rollout status deployment/frontend --timeout=120s

    verify_deployment_spec_images
    verify_running_pod_state

    echo ""
    log "Deployment complete!"
    show_status
}

show_status() {
    echo ""
    info "=== Deployment Status ==="
    echo ""

    info "Pods:"
    oc -n "${NAMESPACE}" get pods -o wide 2>/dev/null || warn "Could not get pods"

    echo ""
    info "Services:"
    oc -n "${NAMESPACE}" get svc 2>/dev/null || warn "Could not get services"

    echo ""
    info "Routes:"
    oc -n "${NAMESPACE}" get routes 2>/dev/null || warn "Could not get routes"

    # Print the app URL
    ROUTE_HOST=$(oc -n "${NAMESPACE}" get route upstream-pulse -o jsonpath='{.spec.host}' 2>/dev/null || true)
    if [ -n "${ROUTE_HOST}" ]; then
        echo ""
        log "Application URL: https://${ROUTE_HOST}"
    fi
}

show_logs() {
    local component="${1:-backend}"
    info "Tailing logs for ${component}..."
    oc -n "${NAMESPACE}" logs -f "deployment/${component}" -c "${component}" --tail=100
}

# --- Main ---

case "${1:-deploy}" in
    build)
        ensure_push_registry
        build_images
        ;;
    push)
        ensure_cluster_context
        ensure_push_registry
        push_images
        ;;
    apply)
        ensure_cluster_context
        apply_manifests
        ;;
    status)
        ensure_cluster_context false
        show_status
        ;;
    logs)
        ensure_cluster_context false
        show_logs "${2:-backend}"
        ;;
    deploy)
        ensure_cluster_context
        ensure_push_registry

        warn "=== Full Deployment ==="
        echo ""
        warn "This will:"
        warn "  1. Build Docker images"
        warn "  2. Push to ${PUSH_REGISTRY}/${REGISTRY_ORG}"
        warn "  3. Apply manifests and set runtime images at ${DEPLOY_REGISTRY}/${NAMESPACE}"
        echo ""
        read -r -p "Continue? [y/N] " confirm
        if [[ "${confirm}" =~ ^[Yy]$ ]]; then
            build_images
            push_images
            apply_manifests
        else
            info "Aborted."
        fi
        ;;
    *)
        echo "Usage: $0 {build|push|apply|status|logs|deploy}"
        echo ""
        echo "Commands:"
        echo "  build             Build Docker images locally"
        echo "  push              Push images to registry"
        echo "  apply             Apply OpenShift manifests"
        echo "  deploy            Full deploy (build + push + apply)"
        echo "  status            Show deployment status"
        echo "  logs [component]  Tail logs (backend|frontend|worker)"
        echo ""
        echo "Environment variables:"
        echo "  PUSH_REGISTRY         Registry for docker push (auto-discovered from cluster if not set)"
        echo "  DEPLOY_REGISTRY       Registry used in pod image references (default: internal cluster registry)"
        echo "  REGISTRY_ORG          Registry org/user (default: upstream-pulse)"
        echo "  IMAGE_TAG             Image tag (default: git short SHA)"
        echo "  NAMESPACE             OpenShift namespace (default: upstream-pulse)"
        echo "  EXPECTED_CLUSTER      Expected oc server URL; fail if different"
        echo "  SKIP_CLUSTER_CONFIRM  Skip interactive cluster prompt (default: false)"
        echo "  ORG_NAME              Organization name (patched into configmap)"
        echo "  ORG_DESCRIPTION       Organization description (patched into configmap)"
        echo "  ADMIN_CONTACT_NAME    Admin name shown on About page (patched into configmap)"
        echo "  ADMIN_CONTACT_URL     Admin contact URL, e.g. mailto: (patched into configmap)"
        exit 1
        ;;
esac
