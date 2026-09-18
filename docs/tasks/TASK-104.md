# TASK-104 — Cutover, runbook and compliance: `docs/runbooks/railway-cloudflare-setup.md` superseding `vercel-setup.md`, rollback runbook section, RoPA row 2 (Railway + Cloudflare with the §8 categories, basis, retention, transfer text), `docs/compliance/dpa-railway.md` + `dpa-cloudflare.md` filed **before** cutover, production apex/`www` pointed at the Railway production service (§12 step 6 — `noindex` stays; the indexing flip is TASK-096 and is never bundled here), §12 exit-signal checklist; Vercel unlink deferred to the exit signal (§13 Q5)

Row: `TASKS.md` → TASK-104. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-104`; keep it current by editing this file, not the row.

## Binding

What the spec binds this task to, in the spec's own words: the resolution notes that override
defaults, the AC ids owned, the rulings from earlier reviews that apply here, the gates that must
be green. One paragraph or a short list — no restatement of the spec.

## Read

- `specs/NNN-*.md` — read `## 0. Index` first, then only the sections the ACs name
- `docs/codebase-map.md` — where everything lives
- (the two or three files the deliverable actually touches)

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review 80` (2026-09-18, TASK-098):** at the Vercel unlink (spec 040 §13 Q5) delete `VERCEL_ENV`, `VERCEL_GIT_COMMIT_SHA` and their two `NEXT_PUBLIC_` mirrors from the Railway contract so declared == required == 24 and the platform-injected special case disappears.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
