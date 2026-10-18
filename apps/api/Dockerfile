# ==============================================================================
# Production Dockerfile for LPU Lost & Found Express REST API
# Multi-stage build for minimal container footprint and secure non-root execution
# ==============================================================================

# Stage 1: Build & Dependencies
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for Sharp native module
RUN apk add --no-cache python3 make g++ vips-dev

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build
RUN npm prune --production

# Stage 2: Production Runtime
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5000

# Install runtime library for Sharp image processor
RUN apk add --no-cache vips

# Create non-root system group and user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Create uploads directory with non-root ownership
RUN mkdir -p /app/uploads && chown -R appuser:appgroup /app/uploads

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json

USER appuser

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/v1/health || exit 1

CMD ["node", "dist/server.js"]
