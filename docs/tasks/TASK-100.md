# TASK-100 — Cloudflare declarative config: `config/cloudflare/zone-settings.json` (the §5.4 enable / do-not-enable table with reasons), `apply-zone-settings.ts` — idempotent apply (`0 changes` on rerun) and `--check` (no writes, one line per drift, non-zero), endpoint allow-list pinned by unit test (any `/accounts/` path fails), 403 → named missing scope, `pnpm cloudflare:check` / `cloudflare:apply`, the `cloudflare-check` CI job (paths, `ci:full`, nightly) pinned in `ci-workflow.test.ts`

Row: `TASKS.md` → TASK-100. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-100`; keep it current by editing this file, not the row.

## Binding

`specs/040-hosting-railway-cloudflare.md` §5.4 and §9 AC-15, AC-17, AC-23, AC-24, AC-29 (tests T-15, T-17, T-24, T-25, and T-27's `cloudflare-check` half). §12 step 4: the settings are applied by the script to the zone while it still points at nothing. `config/cloudflare/zone-settings.json` is the declared state: the nine protocol/TLS settings of AC-15 and the §5.4 do-not-enable table, each row with its reason. `pnpm cloudflare:check` makes no write, prints one line per differing setting and exits non-zero on drift; `pnpm cloudflare:apply` is idempotent (`0 changes` on a second run). The token holds exactly Zone Settings Edit, DNS Edit, Cache Purge and Zone Read on the single zone; a unit test pins the endpoints the script may call and fails on any `/accounts/` path; a 403 is reported as the named missing scope. Cache rules, the rate limit and DNS records are TASK-101's, not this task's.

**The live half is owed to the founder.** No agent holds a Cloudflare token. The contract tests against recorded zone responses are this task's gate. AC-17's "it passes on the current zone" and a first live `cloudflare:apply` are one founder paste, recorded under `## Escalations` exactly as TASK-157 records T-44: the runbook gains the click-by-click token steps (scopes above, one zone) and the commands to paste. The `cloudflare-check` CI job reads the token and zone id from repository secrets the founder adds; say in the runbook which two secret names, and make the job fail with a named message, never pass, when they are absent under a trigger that runs it.

## Read

- `specs/040-hosting-railway-cloudflare.md`: `## 0. Index`, then §5.4, §5.5 (the `cloudflare-check` job), §9 AC-15, AC-17, AC-23, AC-24, AC-29, §10 T-15, T-17, T-24, T-25, T-27, §12 step 4
- `scripts/railway-check.ts`, `src/lib/railway.ts`, `tests/contract/railway-check.test.ts` and `tests/fixtures/railway/`: the house pattern for a drift check against a platform API with recorded fixtures; follow it
- `tests/unit/ci-workflow.test.ts` and `.github/workflows/ci.yml`: where the new job is pinned
- `docs/runbooks/railway-cloudflare-setup.md`: where the founder's token steps go
- `docs/codebase-map.md`

**Fence:** `config/cloudflare/`, `scripts/apply-zone-settings.ts` (or the name `package.json`'s two scripts point at), a `src/lib/cloudflare-zone.ts` if logic belongs in `src/lib`, `tests/contract/` and `tests/unit/` files for this script, `tests/fixtures/cloudflare/`, `package.json` (the two scripts only), `.github/workflows/ci.yml` (the new `cloudflare-check` job only) and its cases in `tests/unit/ci-workflow.test.ts`, the runbook (a new Cloudflare token section), this brief, the row and the map. **Not** `src/lib/cache.ts`, `src/lib/env.ts` or `.env.example`: TASK-102 owns the runtime `CLOUDFLARE_*` keys. The script reads its token and zone id from its own environment, as `railway-check.ts` does.

## Carry-forwards

One dated bullet per `/review`, newest last.

_None yet._

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
