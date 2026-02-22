#!/usr/bin/env bash
# =============================================================================
# Upstream Pulse — OpenShift Deployment Script
#
# Usage:
#   ./deploy/deploy.sh                    # Full deploy (build + push + apply)
#   ./deploy/deploy.sh build              # Build images only
#   ./deploy/deploy.sh push               # Push images to Quay.io
#   ./deploy/deploy.sh apply              # Apply OpenShift manifests only
#   ./deploy/deploy.sh status             # Show deployment status
#   ./deploy/deploy.sh logs [component]   # Tail logs (backend|frontend|worker)
# =============================================================================
set -euo pipefail

# --- Configuration ---
REGISTRY="${REGISTRY:-quay.io}"
REGISTRY_ORG="${REGISTRY_ORG:-upstream-pulse}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
NAMESPACE="${NAMESPACE:-upstream-pulse}"

BACKEND_IMAGE="${REGISTRY}/${REGISTRY_ORG}/backend:${IMAGE_TAG}"
FRONTEND_IMAGE="${REGISTRY}/${REGISTRY_ORG}/frontend:${IMAGE_TAG}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

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
    log "Building backend image: ${BACKEND_IMAGE}"
    docker build \
        -t "${BACKEND_IMAGE}" \
        -f "${PROJECT_ROOT}/backend/Dockerfile" \
        "${PROJECT_ROOT}/backend"

    log "Building frontend image: ${FRONTEND_IMAGE}"
    docker build \
        -t "${FRONTEND_IMAGE}" \
        -f "${PROJECT_ROOT}/frontend/Dockerfile" \
        "${PROJECT_ROOT}/frontend"

    log "Images built successfully"
}

push_images() {
    log "Pushing backend image: ${BACKEND_IMAGE}"
    docker push "${BACKEND_IMAGE}"

    log "Pushing frontend image: ${FRONTEND_IMAGE}"
    docker push "${FRONTEND_IMAGE}"

    log "Images pushed successfully"
}

apply_manifests() {
    # Check if logged in to OpenShift
    if ! oc whoami &>/dev/null; then
        err "Not logged in to OpenShift. Run 'oc login' first."
        exit 1
    fi

    info "Current cluster: $(oc whoami --show-server)"
    info "Logged in as:    $(oc whoami)"

    log "Applying OpenShift manifests..."
    oc apply -k "${SCRIPT_DIR}/openshift"

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
    oc -n "${NAMESPACE}" logs -f "deployment/${component}" --tail=100
}

update_images() {
    # Update image references in deployment manifests
    info "Updating image tags in manifests to: ${IMAGE_TAG}"

    if command -v sed &>/dev/null; then
        sed -i.bak "s|image: ${REGISTRY}/${REGISTRY_ORG}/backend:.*|image: ${BACKEND_IMAGE}|g" \
            "${SCRIPT_DIR}/openshift/backend-deployment.yaml" \
            "${SCRIPT_DIR}/openshift/worker-deployment.yaml"
        sed -i.bak "s|image: ${REGISTRY}/${REGISTRY_ORG}/frontend:.*|image: ${FRONTEND_IMAGE}|g" \
            "${SCRIPT_DIR}/openshift/frontend-deployment.yaml"
        rm -f "${SCRIPT_DIR}"/openshift/*.bak
        log "Image tags updated in manifests"
    fi
}

# --- Main ---

case "${1:-deploy}" in
    build)
        build_images
        ;;
    push)
        push_images
        ;;
    apply)
        apply_manifests
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs "${2:-backend}"
        ;;
    deploy)
        warn "=== Full Deployment ==="
        echo ""
        warn "This will:"
        warn "  1. Build Docker images"
        warn "  2. Push to ${REGISTRY}/${REGISTRY_ORG}"
        warn "  3. Apply OpenShift manifests"
        echo ""
        read -r -p "Continue? [y/N] " confirm
        if [[ "${confirm}" =~ ^[Yy]$ ]]; then
            build_images
            push_images
            update_images
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
        echo "  push              Push images to ${REGISTRY}"
        echo "  apply             Apply OpenShift manifests"
        echo "  deploy            Full deploy (build + push + apply)"
        echo "  status            Show deployment status"
        echo "  logs [component]  Tail logs (backend|frontend|worker)"
        echo ""
        echo "Environment variables:"
        echo "  REGISTRY          Container registry (default: quay.io)"
        echo "  REGISTRY_ORG      Registry org/user (default: upstream-pulse)"
        echo "  IMAGE_TAG         Image tag (default: latest)"
        echo "  NAMESPACE         OpenShift namespace (default: upstream-pulse)"
        exit 1
        ;;
esac
