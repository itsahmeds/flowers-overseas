# TASK-147 — Corridor state B shop entry: render the chip row spec 007 §2 draws — up to six country categories and the indexable country occasions beside the shop-root link — in `CorridorPage`, fed by `corridorShopEntry()` from the published link ids, each chip gated by `isPublished(listingLinkId(…))`; amend spec 008 AC-20's "no markup change" for this one row; e2e + visual on a state-B fixture

Row: `TASKS.md` → TASK-147. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-147`; keep it current by editing this file, not the row.

## Binding

- **Spec 007 §14 A10 (2026-09-23, orchestrator ruling).** The state-B chip row §2 draws (up to six
  country categories and the indexable country occasions beside the shop-root link) is this
  task's. Spec 008 AC-20's "no markup change" is amended for this one row only, and the amendment
  is recorded in spec 008 §14 as part of this task.
- **Spec 007 §14 A9.** State A stays the reviewed shop-root link alone. Nothing from this task may
  render in state A. The TASK-113 guard that refuses florist, delivery and price claims on guide
  pages must stay green, unchanged.
- **Every chip is gated** by `isPublished(listingLinkId(…))`, the same gate TASK-113 put on
  `listingView()`. Setting a family to `published: false` removes its chips. Prove it by mutation,
  one case per family.
- **Must land before any destination's corridor enters state B**, and so before TASK-096 indexes a
  live corridor. State B renders on no page in Phase 0, so this is tested on a state-B fixture
  (`withActivePartnersProvider`), with e2e and visual on that fixture.
- **Copy.** English is at 25/511 = 4.9 % unreviewed against the 5 % gate (2026-09-23), so reuse
  existing reviewed labels (category and occasion names). Any new string is founder-draft and must
  not cross the gate.

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
