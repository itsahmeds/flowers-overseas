# TASK-168 — Approve photo batch 2 on the founder's word: flip the approved rows, add FO-BQ-004's chosen pair, record the sign-off instant(s), upload the approved ids

Row: `TASKS.md` → TASK-168. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-168`; keep it current by editing this file, not the row.

## Binding

- **Input: the founder's own recorded word, and nothing else.** The orchestrator records the
  founder's chat answer to the batch-2 approval page (https://claude.ai/artifact/SMqQmEETfD9UjB7n1byDvP)
  under `## Escalations` here, with the message's instant and the exact words: which numbers are
  approved (each number is a row's `n` in `content/imagery/remaining-images.csv`), which are to be
  redone, and FO-BQ-004's pair (**A** = the un-suffixed files, **B** = the `(1)` files). This task
  is not dispatched before that entry exists. No agent approves anything the founder did not.
- **The data edit** (spec 006 §14 A7 clause 5, the parts TASK-167 left): for each approved row,
  `reviewState: "approved"`, `reviewedBy: "founder"`, `reviewedAt` = the instant of the founder's
  message; a row the founder asks to redo stays `pending` and is listed in `## Result`.
- **FO-BQ-004:** stage only the chosen pair into the main checkout's
  `.local/imagery/originals/` under the canonical names, give it its two `media.json` rows and prompt
  records as TASK-167 did for the others, derive its variants; the other pair is neither staged nor
  given rows.
- **The sign-off case** in `tests/unit/seed-media-manifest.test.ts` gains the batch-2 sign-off
  instant(s) and asserts the approved count exactly; batch 1's assertion is unchanged.
- **Upload only the approved ids:** `pnpm media:upload --only <assetId>` for each approved id (check
  in `scripts/media-upload.ts` how `--only` takes several ids), then `--verify` with the same
  `--only` set. Never run it without `--only`. Never print a `.env.local` value.
- **LCP:** approved product heroes start rendering in the locale homes' trending row
  (`src/modules/ui/home/trending-provider.ts`). Spec 006 §14 A8 clause 4: `/en`'s margin was 55 ms.
  CI's Lighthouse on this PR's head is the measurement; if a locale home misses the 2,000 ms budget,
  stop and report, do not tune.
- **Visual baselines:** pages that now show photos change; refresh only the baselines this task
  causes, through the repo's `visual:baselines` label flow, and inspect each.
- **Gates.** `pnpm seed:check`, `pnpm media:variants --check`, the unit files touched, then
  `pnpm gates:cheap`; CI green on the head, browser jobs and Lighthouse included.

## Read

- `docs/tasks/TASK-167.md` (what landed, and how the originals were staged).
- `specs/006-seed-catalogue-import-imagery-pipeline.md` — `## 0. Index`, then §14 A6, A7, A8.
- `docs/runbooks/imagery.md`, `scripts/media-upload.ts`, `tests/unit/seed-media-manifest.test.ts`.

## Carry-forwards

One dated bullet per `/review`, newest last.

_None recorded._

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **2026-10-03 — the founder's approval of batch 2 and FO-BQ-004's pair (founder, `open`).**

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

_Not started._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
