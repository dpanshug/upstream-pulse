# =============================================================================
# Frontend Dockerfile for Upstream Pulse
# Multi-stage: build React app with Vite, serve with nginx
# =============================================================================

# --- Stage 1: Build ---
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci && npm cache clean --force

COPY . .

# Build with empty API URL so fetch uses relative paths (nginx proxies /api)
ENV VITE_API_URL=""
RUN npm run build

# --- Stage 2: Serve with nginx ---
FROM nginx:1.27-alpine

LABEL maintainer="Red Hat AI Organization"
LABEL description="Upstream Pulse Frontend Dashboard"

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/upstream-pulse.conf

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# OpenShift runs containers as arbitrary non-root UIDs.
# nginx must listen on a non-privileged port and dirs must be writable.
RUN sed -i 's/listen\s*80;/listen 8080;/' /etc/nginx/conf.d/upstream-pulse.conf && \
    chown -R 1001:0 /var/cache/nginx /var/log/nginx /etc/nginx/conf.d && \
    chmod -R g=u /var/cache/nginx /var/log/nginx /etc/nginx/conf.d && \
    # nginx needs to write its pid file
    touch /var/run/nginx.pid && chown 1001:0 /var/run/nginx.pid && chmod g=u /var/run/nginx.pid

USER 1001

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
