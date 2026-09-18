# Runbook — Railway + Cloudflare setup (spec 040, ADR-0018)

> **Status: part 1 of 2.** TASK-098 (this task) writes the **staging `web` service** half: the
> container, `config/railway.json`, the variable set, the health endpoint and the access wall.
> The Cloudflare half (zone settings, DNS, cache rules, rate limit) is TASK-100/TASK-101, and the
> production cutover plus the supersession of `docs/runbooks/vercel-setup.md` is TASK-104.
> Until then `vercel-setup.md` stays in place as the cold fallback's runbook (ADR-0018).

**Owner:** founder — every step below is a click or a paste in a dashboard the agents have no
credential for, by ruling (2026-09-16): variable values and `STAGING_BASIC_AUTH` are pasted by the
founder, never by an agent and never into a file in this repository.
**When:** once, after the PR of TASK-098 merges. `APP_ENV` (TASK-097) is already on `main`, which
ADR-0018 makes the precondition for any Railway deploy.
**Time:** ~30 minutes.
**Outcome:** `staging` runs the committed image in Amsterdam, single replica, answers
`/api/health` with `status`/`commit`/`appEnv`/`region`, is behind a 401 wall for everything else,
and reports to Sentry as `environment: staging` with the commit SHA as the release.

Facts this runbook assumes:

| Thing | Value |
| --- | --- |
| Railway project | `flowers-overseas`, in **Grovant's workspace** (founder is a member; 2026-09-16 ruling, reversing spec 040 §13 Q2) |
| Environments | `production`, `staging` (both already exist) |
| Region | `europe-west4` (Amsterdam) — ADR-0018 |
| Replicas on `web` | **1, pinned.** A second replica serves a second, divergent ISR cache; raising it needs the shared cache handler of §13 Q4 |
| Build | the committed `Dockerfile` (Node 24, non-root), config-as-code `config/railway.json` |
| Healthcheck | `GET /api/health`, the one path exempt from the 401 wall |
| Database | Neon **staging** branch, seeded |
| Node | 24, from the image — nothing to select in the dashboard |

---

## 1. Create the `web` service on `staging`

Railway dashboard → project `flowers-overseas` → environment **`staging`** → **New** → **GitHub
Repo** → `flowers-overseas`, branch `main`.

Then Service → **Settings**:

1. **Service name**: `web` (exactly — `pnpm railway:check` looks the service up by this name).
2. **Config as code**: path `config/railway.json`. Save. The region, replica count, healthcheck
   path, restart policy, builder and start command all come from that file; do not set them by
   hand in the dashboard, or the next `railway:check` will report drift against the repository.
3. **Region**: confirm it shows `europe-west4 (Amsterdam)` after the first deploy.
4. **Public networking**: generate the Railway domain for now (`…up.railway.app`). The
   `staging.flowersoverseas.com` record is added with the Cloudflare half (TASK-100/101).
5. **Resources**: 1 GB memory / 1 vCPU (sharp OOMs at 512 MB — spec 040 §5.3).

Do **not** create the `worker` service here: it is TASK-103's seat, at zero replicas.

## 2. Paste the variables (`staging`)

Service → **Variables** → **Raw Editor** and paste the block below in one go, filling each value.
The key set is exactly the 28 keys of `.env.example`; `pnpm env:check` keeps that file and the zod
schemas in step, and `pnpm railway:check --env staging` (step 6) verifies the live key set — key
**names** only, never a value.

```dotenv
APP_ENV=staging
NEXT_PUBLIC_APP_ENV=staging
NEXT_PUBLIC_SITE_URL=https://<the Railway domain from step 1, https, no trailing slash>
DATABASE_URL=<Neon → branch `staging` → pooled connection string>
DATABASE_URL_UNPOOLED=<the same dialog, direct connection string>
INTERNAL_CRON_SECRET=<openssl rand -hex 32>
LOG_LEVEL=info
CSP_REPORT_ONLY=true
ENABLE_PSEUDO_LOCALES=false
ENABLE_DEV_UI=false
R2_ACCOUNT_ID=<Cloudflare → R2 → account details>
R2_S3_ENDPOINT=<https://<account-id>.eu.r2.cloudflarestorage.com>
R2_BUCKET=flowersoverseas-media
R2_BACKUPS_BUCKET=flowersoverseas-backups
R2_ACCESS_KEY_ID=<scoped R2 token>
R2_SECRET_ACCESS_KEY=<scoped R2 token, shown once>
R2_PUBLIC_BASE_URL=<R2 → media bucket → public access URL, no trailing slash>
NEON_API_KEY=
NEON_PROJECT_ID=
NEON_BRANCH=staging
SENTRY_DSN=<EU-org DSN, or blank>
SENTRY_AUTH_TOKEN=
NEXT_PUBLIC_SENTRY_DSN=<EU-org DSN, or blank>
NEXT_PUBLIC_GA4_MEASUREMENT_ID=
```

Two rules that are easy to get wrong:

- **`ENABLE_PSEUDO_LOCALES` and `ENABLE_DEV_UI` must not be `true` on `staging`** — the zod schema
  refuses them there, naming the key (spec 040 AC-5). Since TASK-135 the refusal happens at server
  start rather than at build time: the deployment fails its healthcheck and never turns `● Active`.
  `staging` is shown to florists.
- The four Vercel keys (`VERCEL_ENV`, `VERCEL_GIT_COMMIT_SHA`, `NEXT_PUBLIC_VERCEL_ENV`,
  `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA`) are **not** pasted here. They are part of the declared
  contract but are platform-injected on Vercel only; `railway:check` allows them to be absent and
  `src/lib/railway.ts` says why.

## 3. Switch on the access wall

Still in **Variables**, add one more:

```dotenv
STAGING_BASIC_AUTH=<a user name>:<a long random password>
```

That single variable is the wall (spec 040 AC-25): every document request to `staging` answers
`401` with a browser prompt until the credential is given, and **`/api/health` stays open** so the
Railway healthcheck, the uptime monitor and CI can reach it. Absent means off — `production` never
gets this variable, and `railway:check --env production` reports it as an unexpected key if it
ever appears there.

Give the credential to the florists you demo to; do not put it in the repository, in an issue or
in a PR description.

## 4. Deploy, and watch the first build

Deployments → **Deploy**. The build runs the committed `Dockerfile`: `pnpm install
--frozen-lockfile`, `pnpm build` (standalone), then a runtime stage that copies `.next/standalone`,
`.next/static` and `public/` only and runs as the unprivileged `node` user.

**The build sees no credential, by design** (spec 001 §14 A17, spec 040 §14 A1; TASK-135). Railway
passes a service variable to a build only when the `Dockerfile` declares an `ARG` for it, and the
image declares one for `APP_ENV` and the `NEXT_PUBLIC_*` keys only — a build argument would survive
in the image's layer history. `next.config.ts` therefore asserts exactly those keys; `DATABASE_URL`,
the `R2_*` keys and `INTERNAL_CRON_SECRET` are asserted when the **server starts** and on every
`/api/health`.

What that changes for you when something is wrong:

| symptom | where to look |
|---|---|
| the build fails naming `NEXT_PUBLIC_*` or `APP_ENV` | the variable is missing or malformed in the service's variables; fix and redeploy |
| the build succeeds, the deploy never turns `● Active`, and the deploy log shows `Invalid environment (staging). N problem(s)` with server keys | a server variable is missing or still a `.env.example` placeholder; paste the real value — no rebuild is needed, only a redeploy |
| `/api/health` answers 500 | the same thing, seen from the outside: the report names keys and never prints a value |

The deploy is healthy when Railway's healthcheck gets a 200 from `/api/health` inside the grace
window.

## 5. Verify by hand (5 minutes)

With `DOMAIN` = the Railway domain from step 1 and `CRED` = the `STAGING_BASIC_AUTH` value:

```bash
# 1. health is open, and reports the right four fields (AC-31)
curl -s "https://$DOMAIN/api/health" | tee /dev/stderr | grep -q '"appEnv":"staging"'
#    expect: {"status":"ok","version":"<sha>","env":"staging","commit":"<sha>","appEnv":"staging","region":"europe-west4"}

# 2. health is fast: under 200 ms, and it makes no database call by construction
curl -s -o /dev/null -w '%{time_total}\n' "https://$DOMAIN/api/health"

# 3. a document is walled (AC-25)
curl -s -o /dev/null -w '%{http_code}\n' "https://$DOMAIN/en"          # expect 401
curl -s -o /dev/null -w '%{http_code}\n' -u "$CRED" "https://$DOMAIN/en"  # expect 200

# 4. staging is never indexable (AC-4)
curl -sI -u "$CRED" "https://$DOMAIN/en" | grep -i x-robots-tag        # expect: noindex
```

If (1) reports `"appEnv":"development"`, `APP_ENV` did not reach the runtime: fix the variable
rather than anything in the code — unset is *meant* to fail closed to `noindex`.

## 6. Run the drift gate

From a clean checkout of `main`, with a Railway **project token** (Railway → project → Settings →
Tokens) exported in your shell only:

```bash
export RAILWAY_API_TOKEN='<project token>'
export RAILWAY_PROJECT_ID='<project id>'
export RAILWAY_ENVIRONMENT_ID='<the staging environment id>'

pnpm railway:check                 # the four AC-9 values of `web` against config/railway.json
pnpm railway:check --env staging   # the key set: missing or unexpected keys, names only
```

Both must exit 0. `railway:check` prints key names and configuration values only; it never reads a
variable value, which is why it is safe to paste its output into a PR.

## 7. The verification that is still outstanding

Spec 040 §12 step 2 asks for the **full Playwright + LHCI suite against the staging URL**,
origin-direct (no Cloudflare yet). That needs the live URL and the credential, so it is yours:

```bash
export PLAYWRIGHT_BASE_URL="https://$DOMAIN"
export STAGING_BASIC_AUTH='<the same credential>'   # the auth spec skips without it
pnpm test:e2e
pnpm test:a11y
pnpm lighthouse
```

Record the result in `docs/tasks/TASK-098.md` `## Result` (spec 040 AC-30: while GitHub Actions is
billing-blocked, the local/manual gate run is the evidence). Nothing in this repository claims that
run has happened.

## 8. What must not be done here

- **No production deploy** until the Cloudflare half and the cutover task (§12 steps 4–6). ADR-0018
  states it as a rule.
- **No second `web` replica** without the shared ISR cache handler (§13 Q4).
- **No lifting of `noindex`.** The indexing flip is spec 007 §12 / TASK-096, on the founder's word,
  and must not be bundled with a hosting change.
- **No `STAGING_BASIC_AUTH` on `production`** — AC-25: the public site has no auth wall.

## Rollback

Deleting the `staging` service or environment has no user impact (§12's per-step rollback). A bad
deploy inside Railway is a **redeploy of the previous image** from Deployments → the previous
deploy → **Redeploy**: no rebuild, under five minutes (AC-13, rehearsed and documented by
TASK-103 in `docs/runbooks/rollback.md`).
