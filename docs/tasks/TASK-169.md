# TASK-169 — Spec 006 §13 Q7: record the real R2 bucket names, and decide whether previews get their own image bucket

Row: `TASKS.md` → TASK-169. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-169`; keep it current by editing this file, not the row.

## Binding

- **The deviation** (TASK-138's escalation of 2026-09-21, carried here when TASK-138 closed):
  spec 006 §13 Q7 (resolved 2026-09-09, "accept defaults") binds the buckets `fo-media`, `fo-media-preview` and `fo-backups`. All three
  404. What exists is `flowersoverseas-media` (served at `media.flowersoverseas.com`, spec 006 §14
  A8) and `flowersoverseas-backups`, with **no preview bucket**. Nothing is broken today: preview
  deploys read production's public images, and nothing on a preview writes to the bucket
  (uploads are the operator's `pnpm media:upload`, run by hand).
- **What this task does:** a spec 006 §14 amendment (the next one, A9) that records the two real names as the
  binding ones (renaming the live media bucket would break `media.flowersoverseas.com`, and
  the backup bucket is already named in `src/lib/env.schema.ts`, for no gain), and states the preview position: either "previews read production's public
  images and never write" as the Phase 0 rule, or a `flowersoverseas-media-preview` bucket. The
  second costs a bucket, a second public host and CSP entries, so it is the founder's call.
- **Who:** the spec writer drafts the amendment; the founder answers the preview question. Default
  if unanswered: previews read production's public images and never write.

## Read

- `specs/006-seed-catalogue-import-imagery-pipeline.md` — `## 0. Index`, then §13 Q7 and §14 A8.
- `docs/tasks/TASK-138.md` — the 2026-09-21 escalations (they say "spec 002 §13 Q7"; it is spec 006's).
- `docs/runbooks/imagery.md`, `src/lib/media-origin.ts`, `src/lib/env.schema.ts`.

## Carry-forwards

One dated bullet per `/review`, newest last.

_None recorded._

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **2026-10-03 — does a preview environment get its own image bucket? (founder, `open`).** Default
  if unanswered: no; previews read production's public images and never write.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

_Not started._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
