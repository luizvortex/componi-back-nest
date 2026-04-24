# ─── Stage 1: install all deps (with devDeps, for build) ──────────────
FROM node:20-alpine AS deps
WORKDIR /app
# dumb-init gives us a real PID 1 so SIGTERM reaches the Node process
# instead of being swallowed by the shell — required for graceful
# shutdown hooks to actually run on deploy.
RUN apk add --no-cache dumb-init
COPY package*.json ./
RUN npm ci --include=dev

# ─── Stage 2: compile TypeScript → dist/ ──────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ─── Stage 3: runtime, prod deps only ─────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache dumb-init tini \
 && addgroup -S componi \
 && adduser -S componi -G componi
COPY --from=deps /app/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# Keep docs alongside the image so anything that links /docs/PRIVACY.md
# at runtime (Swagger enrichment, static serve) can resolve it.
COPY --from=build /app/docs ./docs
USER componi
EXPOSE 3000
# dumb-init as PID 1 forwards signals; SIGTERM flows to Node, which
# flushes the shutdown hooks (RedisModule.quit, BullMQ close, TypeORM).
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main"]

# HEALTHCHECK uses the /health endpoint. Tiny Node script avoids a curl
# dependency. Container is marked unhealthy after 3 consecutive failures.
HEALTHCHECK --interval=30s --timeout=4s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
