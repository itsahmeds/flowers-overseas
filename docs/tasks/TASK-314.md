# TASK-314 — Polish classic-rose prices for the odd stem counts: FO-BQ-001, -003 and -007 in PL at `stems_11` 199 zł, `stems_15` 239 zł, `stems_21` 329 zł (the three-SKU ladder override), the PL `classic` ladder 199/229/259 zł, `catalogue:check` band mode for those SKUs, and the pricing runbook entry

Row: `TASKS.md` → TASK-314. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-314`; keep it current by editing this file, not the row.

## Binding

Spec 005 §14 **A-founder-2026-10-15a** points 2, 3, 9 and its **AC-37, AC-38, AC-39** (read them in full). In short:
- AC-37: in `prices.data.ts`'s expanded retail rows, FO-BQ-001, -003 and -007 in PL are `stems_11` 19 900, `stems_15` 23 900 and `stems_21` 32 900 PLN minor units, default `stems_15`; the PL `classic` ladder is 19 900 / 22 900 / 25 900.
- AC-38: the ladder overrides are exactly point 2's table (three SKUs, PL only, three tier keys each); `catalogue:check` band mode holds those three SKUs in PL to 19 900 to 32 900 and every other row to its unchanged band.
- AC-39: `docs/runbooks/pricing.md` gains a "Changes made in place" entry: merge date, the six cells old and new, FO-BQ-004's count change, and point 9's rule that no reduction is announced.
- Found by TASK-240's implementer and ruled by its reviewer (PR 305, 2026-10-21): today these three bouquets cost 229/259 zł for 15/21 stems against the founder's 239/329 zł, so the shop under-charges. Must land before the indexing flip and before ordering opens (TASK-096).
- Money is integer minor units; price shown = price charged; JSON-LD Offer equals the visible price. Keeps the breaker (money).
- Starts after TASK-240 (PR 305) merges: it builds on the `stems_{n}` keys.

## Read

- `specs/NNN-*.md` — read `## 0. Index` first, then only the sections the ACs name
- `docs/codebase-map.md` — where everything lives
- (the two or three files the deliverable actually touches)

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From self-review (2026-10-24):** the design wireframe `docs/design/wireframes/product-desktop.dc.html` (and its mobile sibling, if it prints a price) still shows Amber Hour at 229 / 259 zł and £46.90 / £52.90; the designer brings it to 239 / 329 zł and £48.90 / £67.90 (implementers do not write under `docs/design/`).
- **From self-review (2026-10-24):** `docs/runbooks/pricing.md` §9 records the merge date as 2026-10-24; if PR #395 merges on another day, the orchestrator corrects that line (and `tests/unit/catalogue-rose-overrides.test.ts`'s "Merged 2026-10-24" assertion) in the merge's follow-up.
- **From self-review (2026-10-24):** `plan/13` row A4's note from spec 005 §14 A-founder-2026-10-15a point 3 is the orchestrator's edit (the spec says so); not done here. Point 5's two side effects (FO-GS-006 at 11/15/21 against FO-BQ-004 at 5/7/9; FO-GS-002 at 349 zł against FO-BQ-003 at 329 zł plus the 35 zł vase) are left to the founder, as the spec says.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-24: `ladderOverrides` on `DestinationPricing` (schema + PL data), override-aware expansion in `prices.data.ts` (module load refuses an unknown or missing tier key), `catalogue:check` band mode holds override SKUs to their own band and `RECORDED_BAND_CHANGES` transcribes it; seed projection and snapshot regenerated (six PL cells). Draft PR #395.
- 2026-10-24: T-38 to T-40 in `tests/unit/catalogue-rose-overrides.test.ts`; runbook §9 "Changes made in place"; tests that pinned Amber Hour at 229/259 zł moved to 239/329 zł; PDP schema fixtures regenerated. 18 mutations each watched red. Rebased on main c81edd9e, gates:cheap green. Next: CI on ci:full, Linux visual baselines for the Amber Hour product pages.
- 2026-10-24 evening (finisher 2): reworded the 107-character commit subject (commitlint header-max-length and subject-case), rebased onto `5a2e9f02` (map regenerated); CI fired on the new head.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
