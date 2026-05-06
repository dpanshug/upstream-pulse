# =============================================================================
# Backend Dockerfile for Upstream Pulse
# Multi-stage: build with all deps, run with production deps only
# =============================================================================

# --- Stage 1: Build ---
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci && npm cache clean --force

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# --- Stage 2: Production ---
FROM node:20-alpine

LABEL maintainer="Upstream Pulse Contributors"
LABEL description="Upstream Pulse Backend API & Worker"

RUN apk upgrade --no-cache

RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist/
COPY --from=builder /app/src/shared/database/migrations ./dist/shared/database/migrations/

# Ensure the app directory is accessible by arbitrary UIDs (OpenShift requirement)
RUN chown -R 1001:0 /app && chmod -R g=u /app

USER 1001

EXPOSE 3000

# Default: run the API server
# Override with ["node", "dist/worker.js"] for the worker process
CMD ["node", "dist/app.js"]
