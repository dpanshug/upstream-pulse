# =============================================================================
# Backend Dockerfile for Upstream Pulse
# Builds the Fastify API server and BullMQ worker
# =============================================================================
FROM node:20-alpine

LABEL maintainer="Red Hat AI Organization"
LABEL description="Upstream Pulse Backend API & Worker"

# Create non-root user (OpenShift assigns arbitrary UIDs, but this helps locally)
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup

WORKDIR /app

# Copy dependency manifests and install
COPY package.json package-lock.json* ./
RUN npm ci && npm cache clean --force

# Copy source code and config
COPY tsconfig.json drizzle.config.ts ./
COPY src/ ./src/

# Compile TypeScript
RUN npm run build

# Ensure the app directory is accessible by arbitrary UIDs (OpenShift requirement)
RUN chown -R 1001:0 /app && chmod -R g=u /app

# Switch to non-root user
USER 1001

EXPOSE 3000

# Default: run the API server
# Override with ["node", "dist/worker.js"] for the worker process
CMD ["node", "dist/app.js"]
