# syntax=docker/dockerfile:1.7
# ISMeta frontend — multi-stage Dockerfile.
# Targets:
#   base         — системные зависимости, пользователь node
#   deps         — установленные npm-пакеты
#   development  — next dev на порту 3000 (bind mount в docker-compose)
#   builder      — production build
#   production   — минимальный runtime на standalone output

ARG NODE_VERSION=20

# ---------- base ----------
FROM node:${NODE_VERSION}-alpine AS base

RUN apk add --no-cache libc6-compat curl

WORKDIR /app

# ---------- deps ----------
FROM base AS deps

COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    if [ -f package-lock.json ]; then npm ci; else npm install; fi

# ---------- development ----------
FROM deps AS development

ENV NODE_ENV=development \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY . /app

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -fsS http://localhost:3000 || exit 1

# next dev с явным портом 3000 (package.json хардкодит 3001,
# переопределяем только в compose-контексте).
CMD ["npx", "next", "dev", "-p", "3000", "-H", "0.0.0.0"]

# ---------- builder ----------
FROM deps AS builder

ENV NEXT_TELEMETRY_DISABLED=1

COPY . /app

RUN npm run build

# ---------- production ----------
FROM base AS production

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
