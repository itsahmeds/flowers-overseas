# syntax=docker/dockerfile:1

# Flowers Overseas web image (spec 040 §5.3, AC-8; TASK-098).
#
# Why a Dockerfile rather than Nixpacks (§13 Q1): the Node major, the pnpm version and sharp's
# native build are lines in this repository instead of inferences in a dashboard, and the same
# image builds on a laptop, in CI and on Railway.
#
# Three facts this file is asserted on by `tests/unit/container.test.ts` (the half of AC-8 that
# does not need a Docker daemon): Node 24, a non-root runtime user, and a runtime stage that
# copies the standalone output only — no `.env*` file (also excluded by `.dockerignore`) and no
# development `node_modules` tree.

# --- deps: production-complete install, cached on the lockfile -------------------------------
FROM node:24-slim AS deps
WORKDIR /app
# corepack pins pnpm to the version in `package.json#packageManager`.
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
RUN corepack install && pnpm install --frozen-lockfile

# --- build: `next build` with `output: "standalone"` ------------------------------------------
FROM node:24-slim AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `NEXT_PUBLIC_*` values are inlined into the browser bundle at build time, so they are build
# arguments; Railway passes the service variables to the build automatically. `APP_ENV` is a
# build argument too because `next.config.ts` bakes the per-environment headers (spec 040 §5.2).
# The defaults keep a credential-free local `docker build` working: unset `APP_ENV` resolves to
# `development`, which is `noindex` — fail-closed (AC-1, AC-4).
ARG APP_ENV=""
ARG NEXT_PUBLIC_APP_ENV=""
ARG NEXT_PUBLIC_SITE_URL="http://localhost:3000"
ARG NEXT_PUBLIC_SENTRY_DSN=""
ARG NEXT_PUBLIC_GA4_MEASUREMENT_ID=""
ENV APP_ENV=$APP_ENV \
    NEXT_PUBLIC_APP_ENV=$NEXT_PUBLIC_APP_ENV \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    NEXT_PUBLIC_GA4_MEASUREMENT_ID=$NEXT_PUBLIC_GA4_MEASUREMENT_ID \
    NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# --- runtime: standalone server only, non-root -------------------------------------------------
FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# `node:24-slim` ships an unprivileged `node` user (uid 1000); the image never runs as root.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
