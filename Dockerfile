# syntax=docker/dockerfile:1

# Flowers Overseas web image (spec 040 §5.3, AC-8; TASK-098).
#
# Why a Dockerfile rather than Nixpacks (§13 Q1): the Node major, the pnpm version and sharp's
# native build are lines in this repository instead of inferences in a dashboard, and the same
# image builds on a laptop, in CI and on Railway.
#
# Four facts this file is asserted on by `tests/unit/container.test.ts` (the half of AC-8 that
# does not need a Docker daemon): Node 24, a non-root runtime user, a runtime stage that copies the
# standalone output only — no `.env*` file (also excluded by `.dockerignore`) and no development
# `node_modules` tree — and, since TASK-135, a build-argument set that is exactly the build half of
# the env contract, so the image builds with no credential in the environment.

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
# The build arguments are exactly `BUILD_ENV_KEYS` (`src/lib/env.schema.ts`): `APP_ENV`, because
# `next.config.ts` bakes the per-environment headers from it (spec 040 §5.2), plus the
# `NEXT_PUBLIC_*` set, which Next inlines into the browser bundle. Railway passes a service
# variable to the build when — and only when — an `ARG` for it is declared here.
#
# **No server key is a build argument, and none may become one** (spec 001 §14 A17, spec 040 §14
# A1; TASK-135). A build argument is recoverable from the build stage's layer history, and no
# build reads `DATABASE_URL`, the R2 credentials or `INTERNAL_CRON_SECRET` — `next.config.ts`
# asserts only the keys above, and `instrumentation.ts` asserts the rest at server start, where a
# miss fails `/api/health` and therefore the Railway healthcheck. `tests/unit/container.test.ts`
# pins the two sets against each other, so a key added to `serverEnvSchema` cannot arrive here
# quietly.
#
# The defaults keep a credential-free `docker build` working: unset `APP_ENV` resolves to
# `development`, which is `noindex` — fail-closed (AC-1, AC-4).
ARG APP_ENV=""
ARG NEXT_PUBLIC_APP_ENV=""
ARG NEXT_PUBLIC_SITE_URL="http://localhost:3000"
ARG NEXT_PUBLIC_SENTRY_DSN=""
ARG NEXT_PUBLIC_GA4_MEASUREMENT_ID=""
ARG NEXT_PUBLIC_VERCEL_ENV=""
ARG NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA=""
ENV APP_ENV=$APP_ENV \
    NEXT_PUBLIC_APP_ENV=$NEXT_PUBLIC_APP_ENV \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    NEXT_PUBLIC_GA4_MEASUREMENT_ID=$NEXT_PUBLIC_GA4_MEASUREMENT_ID \
    NEXT_PUBLIC_VERCEL_ENV=$NEXT_PUBLIC_VERCEL_ENV \
    NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA=$NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA \
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
