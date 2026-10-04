# TASK-172 — The fresh-flower promise, never a number of days (spec 009 §14 A11)

Row: `TASKS.md` → TASK-172. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

- `specs/009-product-page-date-picker.md` §14 **A11** (2026-10-04), which supersedes A9's freshness
  line and re-scopes this task. A9's `{days}` parameter, its ICU plural and its 5 / 7 / absent
  cases are **withdrawn**. `freshnessDays` stays catalogue data and renders nowhere.
- **What is already done elsewhere (checked 2026-10-04):** `nav.utility.guarantee` reads
  "Fresh-flower promise" in all locales (TASK-176, merged). `home.proof.guarantee.title` changes in
  `en`/`de`/`pl` in TASK-177 (PR 174). The PDP's promise line (`product.trust.freshness.*`, the
  72-hour photo terms, no number of days) is in TASK-179 (PR 170).
- **What is left here:**
  - retire `trust.guarantee.name` ("7-day freshness guarantee" on `main` in `en`, `de` and `pl`) as
    "Fresh-flower promise" in every locale, and `home.proof.guarantee.title` in any locale TASK-177
    leaves unchanged;
  - A11's tests: the message-and-content scan over the three keys, the PDP guarantee key and every
    `infoPages.*` / `content/pages/*/guarantee.md` value in four locales (no "7-day", no match of
    `\d+\s*-?\s*(day|days|Tag|Tage|Tagen|dzień|dni)`, case-insensitive); the PDP unit case (the same
    text for `freshnessDays` 5, 7 and none); the e2e case (no number token in the guarantee node
    equals the product's `freshnessDays`; "72" passes); each must go red with its subject restored;
  - A11's AC and T rows written into spec 009 in place of A9's three cases (`pnpm specs:index`);
  - the stale "7-day freshness guarantee" comment on `freshnessGuarantee` in
    `src/modules/catalog/product.ts` (TASK-179's brief, Result).
- **Not here:** the PDP's link to the guarantee page (A11 bullet 1) needs `infoPageExists()`,
  which TASK-182 builds; TASK-182 wires it.
- **Copy:** "Fresh-flower promise" is in the founder's approved batch (decisions log 2026-10-04,
  item 2); `de`/`pl` values are `reviewed: false`.
- **Class:** not review-only (a customer-facing promise). `/review` and `/break` both run.
- **Blocks TASK-182:** spec 041 AC-16 asserts the three keys carry no "7-day" in any locale.

## Read

- `specs/009-product-page-date-picker.md` — `## 0. Index`, then §14 A11 (and A9 for what it
  withdraws).
- `specs/041-trust-help-legal-pages.md` AC-16, T-16, Appendix A.3.
- `docs/tasks/TASK-179.md` (Result, the copy list); `docs/codebase-map.md`.

## Carry-forwards

- **From `/plan-tasks` (2026-10-04):** dispatch after TASK-177 (PR 174) and TASK-179 (PR 170) have
  merged: both edit the three message files and the PDP.

## Escalations

_None recorded._

## Progress

_Not started._

## Result

_Pending._
