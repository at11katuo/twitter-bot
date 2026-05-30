# ── Stage 1: deps ───────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/db/package.json       packages/db/
COPY packages/shared/package.json   packages/shared/
COPY apps/dashboard/package.json    apps/dashboard/

RUN pnpm install --frozen-lockfile

# ── Stage 2: builder ─────────────────────────────────────────
FROM deps AS builder
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY packages/ packages/
COPY apps/dashboard/ apps/dashboard/

RUN apk add --no-cache libc6-compat openssl
RUN pnpm install prisma @prisma/client -w
RUN cd packages/db && pnpm exec prisma generate
RUN pnpm --filter @hana/dashboard build

# Prisma client copy
RUN set -e; \
    PRISMA_DIR=$(find /app/node_modules/.pnpm -type d -name "client" \
        -path "*/.prisma/client" 2>/dev/null | head -1); \
    if [ -z "$PRISMA_DIR" ]; then \
      PRISMA_DIR=$(find /app/packages/db/node_modules -type d -name "client" \
          -path "*/.prisma/client" 2>/dev/null | head -1); \
    fi; \
    if [ -n "$PRISMA_DIR" ]; then \
      REL_DIR=$(echo "$PRISMA_DIR" | sed 's|^/app/||'); \
      DEST_DIR="/app/apps/dashboard/.next/standalone/$REL_DIR"; \
      mkdir -p "$DEST_DIR"; \
      cp -r "$PRISMA_DIR/." "$DEST_DIR/"; \
    fi

RUN set -e; \
    BINARY=$(find /app -name "libquery_engine-linux-musl-openssl-3.0.x.so.node" \
        -path "*@prisma*" 2>/dev/null | head -1); \
    if [ -n "$BINARY" ]; then \
      mkdir -p /app/apps/dashboard/.next/standalone/prisma-engine; \
      cp "$BINARY" /app/apps/dashboard/.next/standalone/prisma-engine/; \
    else \
      echo "ERROR: prisma engine not found" >&2; exit 1; \
    fi

# ── Stage 3: runner ──────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3001
ENV HOSTNAME=0.0.0.0
ENV PRISMA_QUERY_ENGINE_LIBRARY=/app/prisma-engine/libquery_engine-linux-musl-openssl-3.0.x.so.node

RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

COPY --from=builder --chown=nextjs:nodejs /app/apps/dashboard/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/dashboard/.next/static ./apps/dashboard/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/dashboard/public ./apps/dashboard/public

USER nextjs
EXPOSE 3001

CMD ["node", "apps/dashboard/server.js"]
