#!/usr/bin/env bash
# The origin the Playwright suites run against, served by CI itself (TASK-137).
#
# Why this file exists. `e2e`, `visual` and `a11y` are each `needs: preview`, and `preview` used
# to wait up to fifteen minutes for a Vercel preview deployment before handing over its URL. On
# this repository that deployment answers `/api/health` with 500 — ADR-0018 keeps the Vercel
# project as a cold fallback with an empty environment store — so the three suites were denied an
# origin and **no Playwright suite had ever run in CI** (observed identically on PRs 84, 85, 87).
#
# What it does: start the production server on the runner over the build the `preview` job
# published, then refuse to return until `GET /api/health` answers 200 with `"status":"ok"`. A
# broken origin fails here, loudly, in the job that owns it — never four suites later as a
# skipped check or an obscure timeout.
#
# The environment is the committed `.env.example` placeholders and nothing else: valid in
# `development` (spec 001 §13 Q10), identical to the reviewer's local `pnpm start`, and — the
# ruling of spec 001 §14 A17 and spec 040 §14 A1, which stands — **no real secret is a build
# argument or a run-time value here**.
set -euo pipefail

port="${PREVIEW_PORT:-3000}"
# `localhost`, not `127.0.0.1`: it is the host `.env.example`'s `NEXT_PUBLIC_SITE_URL` names, so
# every canonical, hreflang and absolute URL the build inlined matches the origin under test.
origin="http://localhost:$port"
log="${RUNNER_TEMP:-/tmp}/preview-origin.log"
body="${RUNNER_TEMP:-/tmp}/preview-origin-health.json"

cp .env.example .env.local

PORT="$port" nohup pnpm start > "$log" 2>&1 &
server_pid=$!

code=000
# 90 attempts x 1 s. A `next start` over a warm build answers in a couple of seconds; the margin
# is for a runner that is also unpacking an artifact.
for _ in $(seq 1 90); do
  if ! kill -0 "$server_pid" 2>/dev/null; then
    echo "the server process exited before it answered"
    break
  fi
  code=$(curl -s -o "$body" -w '%{http_code}' "$origin/api/health" || echo 000)
  [ "$code" = "200" ] && break
  sleep 1
done

if [ "$code" != "200" ]; then
  echo "--- server log (last 40 lines) ---"
  tail -40 "$log" || true
  echo "::error::the CI-owned preview origin answered $code on $origin/api/health; the browser suites have no origin to run against (TASK-137)"
  exit 1
fi

if ! grep -q '"status":"ok"' "$body"; then
  echo "--- health body ---"
  cat "$body"
  echo "::error::$origin/api/health answered 200 with a body that is not \"status\":\"ok\" (TASK-137)"
  exit 1
fi

health=$(tr -d '\n' < "$body")

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "preview_url=$origin" >> "$GITHUB_OUTPUT"
fi

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "### preview origin (TASK-137)"
    echo ""
    echo "- origin: \`$origin\` — \`next start\` on this runner, over the build \`preview\` published"
    echo "- \`GET /api/health\`: $code, body \`$health\`"
    echo "- environment: the committed \`.env.example\` placeholders; no secret is a build input"
    echo "  or a run-time value (spec 001 §14 A17, spec 040 §14 A1)"
  } >> "$GITHUB_STEP_SUMMARY"
fi

echo "preview origin ready at $origin ($health)"
