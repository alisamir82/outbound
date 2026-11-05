# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
RUN corepack enable && apk add --no-cache libc6-compat
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
ARG BASE_PATH=""
ENV BASE_PATH=$BASE_PATH
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Dummy values so `next build` can import modules that validate env at load time.
ENV DATABASE_URL=postgres://build:build@localhost:5432/build AUTH_SECRET=build-secret
RUN pnpm build

# ---- web: Next.js standalone ----
FROM node:22-alpine AS web
ARG BASE_PATH=""
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 BASE_PATH=$BASE_PATH
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]

# ---- worker: BullMQ + migrations/seed tooling ----
FROM base AS worker
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
CMD ["pnpm", "worker"]
