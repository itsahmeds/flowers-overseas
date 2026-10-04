# TASK-101 — DNS, cache rules, rate limit and the edge assertions: apex + `www` proxied CNAME-flattened to the Railway origin, `www` → apex 301, GoDaddy parking records removed, `staging.` record; no Cache Everything, bypass for `/api/*`, `/checkout*`, `/account*`, `/admin*`, `/vendor*`, `/track*` in every locale prefix, `utm_*`/`gclid`/`fbclid` off the cache key; one rate-limit rule on `/api/*` + POSTs; e2e: corridor HIT with no `Set-Cookie`/`Vary`, body byte-identical through Cloudflare vs origin (3 URLs × cookies), `robots.txt` byte-identical with one `Sitemap:` line, six crawler UAs 200, 100 document GETs/min all 200

Row: `TASKS.md` → TASK-101. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-101`; keep it current by editing this file, not the row.

## Binding

- Spec 040 §12 rollout step 5 (rules applied against `staging.` first): AC-14, AC-16, AC-18, AC-19, AC-20, AC-21; tests T-14, T-16, T-18, T-19, T-20, T-21 (§10 L665–672). The apex/`www` production flip is **not** this task: it is executed in TASK-104's cutover, where T-14 re-runs.
- The rules are **declarative and reviewable in the repo**, applied by a script in the style of TASK-100's `apply-zone-settings.ts` (`--check` reads, `--apply` writes), never by hand-only steps. Where a change needs a token scope the repo's Cloudflare token lacks, the script prints the exact dashboard steps instead and the runbook lists them; the founder applies them (the founder makes dashboard changes personally; Claude never creates, reads or prints tokens).
- No "Cache Everything". Bypass for `/api/*`, `/checkout*`, `/account*`, `/admin*`, `/vendor*`, `/track*` under every locale prefix; `utm_*`, `gclid`, `fbclid` off the cache key; one rate-limit rule on `/api/*` and POSTs only (AC-21: 100 document GETs/min all 200).
- No IP redirects, ever (ADR-0006); the edge never rewrites HTML (AC-18 byte identity).
- The e2e edge checks (T-16, T-18–T-21) run against `staging.` and are skipped with a named reason when `STAGING_URL`/the zone is not reachable from CI; they never hit production.
- Current state (2026-10-04): `flowersoverseas.com` is on Cloudflare and still serves the old GoDaddy Website Builder page; the GoDaddy parking/builder records are what AC-14 removes at cutover — this task writes their removal into the declarative record set and the runbook, it does not apply it to the apex.

## Read

- `specs/040-hosting-railway-cloudflare.md` — `## 0. Index`, then §5.4, §9 AC-14–AC-21, §10 T-14–T-21, §12, §14 A5
- `docs/codebase-map.md`
- `config/cloudflare/zone-settings.json`, `scripts/cloudflare/` (TASK-100's apply/check), `.github/workflows/ci.yml` `cloudflare-check` job, `docs/runbooks/` (Cloudflare sections)

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
