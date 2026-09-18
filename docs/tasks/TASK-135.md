# TASK-135 — Container build-time env contract: `next build` inside the image fails `assertEnv` because `next.config.ts` asserts the whole 28-key contract at config load while the `Dockerfile` declares build arguments for the five `NEXT_PUBLIC_*`/`APP_ENV` keys only — split the gate into a build-time subset (public + `APP_ENV`) asserted by `next.config.ts` and a runtime assertion of the server keys at server start, so a container build never needs a credential and a missing one still fails fast

Row: `TASKS.md` → TASK-135. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-135`; keep it current by editing this file, not the row.

## Binding

- **The defect, reproduced.** Railway staging build log, 2026-09-18: `RUN pnpm build` → `EnvValidationError: Invalid environment (staging). 10 problem(s)` naming `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `INTERNAL_CRON_SECRET` and the seven `R2_*` keys. `APP_ENV=staging` **did** reach the build, so Railway passes a service variable to the build when — and only when — the `Dockerfile` declares an `ARG` for it. The image declares five (`APP_ENV`, `NEXT_PUBLIC_APP_ENV`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_GA4_MEASUREMENT_ID`); `next.config.ts` asserts all 28.
- **Orchestrator ruling (2026-09-18), binding:** do **not** declare the ten server keys as build arguments. A build argument is recoverable from the build stage's layer history, and a container build has no business holding a database credential. **Split the gate instead**: `next.config.ts` (via `assertEnv`) asserts only the keys the build actually inlines — `APP_ENV` and the `NEXT_PUBLIC_*` set; the server-only keys are asserted **at server start** (`instrumentation.ts` or the standalone server's first request path — implementer's choice, stated in `## Result`), where a missing key fails `/api/health` and therefore the Railway healthcheck, fail-closed.
- Spec 001 **AC-10**'s "a missing variable fails `pnpm build`" is preserved for every key the build consumes, and its intent — a miss is caught before traffic — is preserved for the rest by the boot assertion. Record the split as a spec 001 §14 amendment **and** a spec 040 §14 amendment, naming this build log as the trigger. Spec 040 **AC-8** gains the fact that the image builds without credentials.
- Keep: no `.env*` in the image, non-root runtime, Node 24, standalone-only runtime stage, and every assertion in `tests/unit/container.test.ts`. Extend that test so the ARG/assert split is pinned — a future key added to the server set must not silently re-enter the build gate.
- **Verification is the point of this task.** A green local `docker build` with **no** credentials in the environment is the acceptance evidence (Docker is not installed on the founder's Mac — if it is unavailable to you too, say so plainly and add the `container` CI job from TASK-099's carry-forward here instead, so CI proves it). Then the Railway redeploy must reach `● Active` with `/api/health` 200 and `/en` 401.

## Read

- The Railway build log quoted above; `Dockerfile`; `next.config.ts`; `src/lib/env.assert.ts`, `src/lib/env.schema.ts`, `src/lib/env.ts`; `instrumentation.ts`.
- `specs/040-hosting-railway-cloudflare.md` §0 Index then AC-8, §5.2–§5.3; `specs/001-repo-dev-os-bootstrap.md` §0 Index then AC-10 and §5.2.
- `docs/tasks/TASK-098.md` (`## Result` and the `/review 80` carry-forwards — the container runtime proof it owed is this task's evidence); `docs/runbooks/railway-cloudflare-setup.md` §4–§5.
- `docs/codebase-map.md` for the touched files.

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
