# TASK-324 — Spec 044 cover image

Row: `TASKS.md` → TASK-324. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-324`; keep it current by editing this file, not the row.

## Binding

Spec 044 §12 slice A task 4. Founder approval 2026-10-21: "044 defaults" (every §13 default) and "blog ok" (Appendix A's ten labels); advisor fixes 1 to 5 of `docs/advice/2026-10-21-044-blog.md` applied. The spec is PR 312 and the design PR 319 (`docs/design-044-blog`); dispatch only after both are merged.
- **ACs owned:** AC-18; test T-18 and T-22's cover variants (`blog-post` and `blog-index` with a cover at 1440 and 390).
- Depends on TASK-322, TASK-323 and TASK-299 (the photo upload route, provenance and attach).
- **Review class: review-only** (presentation); the reviewer may call the breaker and that binds.
- Only a `media_asset` with `review_state = 'approved'` and `depicts` in (`context`, `brand`) attaches; alt text per revision, non-empty and not a file name, in the hash. On the post the cover is the only `priority` image with a preload, at most 200 KB above the fold on the mobile profile; on the index a lazy thumbnail. A post without a cover renders no image block and no `image` in `BlogPosting`.
- **Blocked on a founder copy slot.** Spec 006's visible note (`media.provenance.aiExample`, "Example arrangement · our florist hand-makes each one") describes a bouquet, so it cannot caption an AI cover of a place. The founder supplies the final text of the note for such a cover; the task adds one new key, shipped `reviewed: false`, and the founder records approval (copy headroom is zero). Unblocking: set the row `todo` once the text is recorded in `docs/decisions-log.md`. A non-AI cover needs no new text.

## Read

- `specs/044-blog.md`: `## 0. Index`, then §2.9, §5.3, §9 AC-18, §10 T-18, §13 Q10
- `specs/006-seed-catalogue-import-imagery-pipeline.md` (AC-17, the provenance note), `specs/012b-cms.md` §2.7
- `docs/codebase-map.md`; `src/modules/ui` `MediaAsset`, the post template from TASK-322

## Carry-forwards

One dated bullet per `/review`, newest last.


- **From `/plan-tasks` (orchestrator, 2026-10-21):** the seed needs one approved `context` or `brand` asset for the with-cover fixture; add it to the seed fixtures here if TASK-321 did not, never in production.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

_Not started._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
