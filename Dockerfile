# Dockerfile

# ============================================
# Stage 1: Dependencies
# ============================================
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# ============================================
# Stage 2: Builder
# ============================================
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build Next.js application
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN npm run build

# ============================================
# Stage 3: Worker (BullMQ queue consumer)
# ============================================
#
# P-11 / T-006. Before this stage the image had exactly one CMD -- `node
# server.js` -- so every deployment of this platform ran producers and no
# consumers. Jobs were enqueued into Redis by the web process and read by
# nobody.
#
# This stage is deliberately placed BEFORE `runner`. `docker build .` with no
# `--target` builds the LAST stage in the file, and `.github/workflows/ci.yml`'s
# docker job builds exactly that way. Appending the worker at the end would have
# silently changed what CI publishes as `personal-assistant-forge:latest` from
# the app to the worker.
#
# It carries the builder's full node_modules rather than a production-pruned
# tree, because the entrypoint runs TypeScript through `tsx`, a devDependency.
# The alternative -- a second tsconfig and a compiled output directory -- adds a
# build artefact that nothing else in the repo produces or tests. The cost is
# image size on a process that serves no traffic.
FROM node:20-alpine AS worker
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/src ./src
COPY --from=builder /app/prisma ./prisma

USER nextjs

# No EXPOSE and no HEALTHCHECK. This process listens on no port, so an HTTP
# probe would be a lie, and a probe that only pings Redis would report healthy
# for a worker whose event loop is wedged -- the same "retry policy with no
# consumer" shape this package exists to remove. Liveness here is the process
# itself: scripts/worker.ts exits non-zero on a fatal error and Compose's
# `restart: unless-stopped` restarts it.

CMD ["node", "--import", "tsx", "scripts/worker.ts"]

# ============================================
# Stage 4: Runner
# ============================================
FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files from builder
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json

# Copy Next.js standalone output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy Prisma schema and generated client (needed at runtime)
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
