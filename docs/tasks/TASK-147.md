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

- **2026-10-18 (implementer, to the orchestrator): spec 008 §14 needs one row for AC-20.** AC-20 says
  the corridor page renders the five link ids "with **no markup change**"; spec 007 §14 A10 already
  rules that the state-B chip row is a markup change for this one row. Spec 008 §14 should record
  the same amendment (A10 names it as part of this task, but an implementer may not edit a spec).
  Suggested row, at the next free number **A17** (A16 is taken; the highest in spec 008 §14 is A16): "A17 (2026-10-18, TASK-147). AC-20's 'no markup change' holds for state A; the
  state-B corridor page adds the chip row of spec 007 §14 A10 (up to six country categories, the
  country occasions that exist, each behind its own link id)." Status: open.
- **2026-10-18 (implementer): two readings the brief left open, taken and recorded.** (1) "Up to six
  country categories": the six with the most products in the destination, ties in corpus order,
  shown in the locale's collation; the shop has twenty. (2) "The indexable country occasions":
  every country occasion that exists by `listingExists()` (Poland has one, Mother's Day); spec 008's
  indexability is a by-rule verdict of the page, not a second existence set. Say if either should
  change; both are one function.

## Carry-forwards

- **From `/review 249` round 1 (2026-10-18), PASS with one required change:** (1) record spec 008
  §14 **A17** (the one-row AC-20 amendment above) when the orchestrator edits the spec, since an
  implementer may not; (2) readings 1 and 2 above (which six categories; "indexable occasions" =
  every occasion `listingExists()` accepts) are **accepted** by the reviewer. Both are one function
  in `src/modules/catalog/shop-entry.ts` if the founder wants them changed.
- **From `/break 249`:** hole 1 (which six categories) and hole 2 (the chips' collation order) are
  closed by tests in `tests/unit/corridor-shop-chips.test.tsx`: the exact six keys for Poland, the
  get_well/sympathy tie at 17, and the exact German and Polish orders. Watched red under ascending
  sort, no sort, a constant 0 count, a reversed tie-break and `sortBy` removed.

## Progress

- 2026-10-18: view model (`corridorShopEntry(…, { chips: true })`), `CorridorShopEntry` component,
  route wiring, unit tests with one mutation case per family, fixture page
  `/dev/components/corridor-state-b`, e2e, visual and axe specs written.
- 2026-10-18: Linux baselines committed (both images looked at); CI green on 5705f067.
- 2026-10-18: `/break` holes 1 and 2 closed with exact-key and collation tests.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR 249. The corridor page's state-B shop entry now draws the chip row spec 007 §14 A10 describes:
`corridorShopEntry(locale, iso2, { chips: true })` returns up to six country categories (most
products in the destination, ties in corpus order, shown in the locale's collation) and the country
occasions that exist, each family behind its own `isPublished(listingLinkId(...))` plus
`listingExists()`. `corridorView()` keeps chips in the live state only, and the new
`CorridorShopEntry` renders them only when live, under the shop-root link, as a `<nav>` named by the
reviewed key `shop.category.siblingsHeading`. State A is unchanged (A9; the 14-page pins pass
untouched). No new message key. Tests: unit `corridor-shop-chips.test.tsx` (14, one mutation case
per family plus the six, tie and collation pins), e2e `corridor-state-b.spec.ts` (3), visual
`corridor-state-b.spec.ts` (2 Linux baselines), axe on the fixture page
`/dev/components/corridor-state-b`. Expensive gates were CI's. Handed on: spec 008 §14 A17 (the
orchestrator's edit); the unrelated `language-popup-desktop.png` baseline drift.
