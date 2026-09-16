# TASK-103 — Lighthouse `median`, worker seat and rollback rehearsal: `lighthouserc.json` `aggregationMethod: "median"` with the spec 004 §14 A12 Brotli origin proxy deleted and one LHCI run over HTTP/2 against the Cloudflare-fronted preview with every `plan/01` §7 assertion evaluated (closes spec 004 §14 A18); `worker` service in `production` and `staging` with the same variable set, no public domain, 0 replicas (`railway:check` asserts); rollback rehearsed (previous-image redeploy <5 min, no rebuild) and written as step 1 of the hosting section of `docs/runbooks/rollback.md`

Row: `TASKS.md` → TASK-103. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-103`; keep it current by editing this file, not the row.

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

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
