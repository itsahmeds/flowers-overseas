# TASK-249 — Product page trail: reached first by keyboard on a laptop, and never a lone "/ Amber Hour" line on a phone

Row: `TASKS.md` → TASK-249. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Keep it current by editing this
file, not the row.

## Binding

- **Spec.** `specs/004-design-system-layout.md` AC-50 (on the product page the trail is displayed
  below the buy section at 390 × 844 and at the top at 1440 × 900, in the server HTML at both,
  `BreadcrumbList` equal to it) and §8 accessibility (WCAG 2.1 AA, 2.4.3 focus order);
  `specs/009-product-page-date-picker.md` §14 "Reading order equals DOM order" (WCAG 1.3.2,
  2.4.3: no CSS `order` or grid placement reorders sections).
- **N-07 (P2, QA-2), product page, 1330.** The breadcrumb is at the top of the page but 20th in tab
  order, after the gallery, the size control and the dates. **Done when:** at 1440 × 900 the
  trail's first link is within the first three focusable elements after the skip link and header
  links, and the visual order equals the tab order for trail, gallery and buy section.
- **Q1-22 / Q1-27 (P2, QA-1 and QA-2, still on `c8d3b334`), product page, 390.** The trail below
  the buy section wraps with a lone "/ Amber Hour" on its own line. **Done when:** at 320, 360 and
  390 no trail line holds only a separator and the last crumb; the separator never starts a line.
  AC-50's placement (below the buy section on the phone) is unchanged.
- **If one DOM order cannot satisfy AC-50's two placements,** escalate to the orchestrator before
  building. Do not render the trail twice in the DOM with one copy hidden unless the spec says so:
  a second `BreadcrumbList` source and a hidden duplicate are a spec question.
- **Copy.** None. No new key, no new text.
- **Review class.** Review-only (presentation and DOM order) unless the diff touches the trail's
  JSON-LD or the test that equates `BreadcrumbList` with the trail (an SEO gate): then it keeps the
  breaker. The reviewer confirms the class against the diff.
- **Tests.** `tests/e2e`: one case per bug id, each red on `c8d3b334`: the focus-order index of
  the trail's first link at 1440 (assert the one index, not a range), and the trail's line boxes at
  320, 360, 390. Mutate the DOM order and watch the first go red.

## Read

- `specs/004-design-system-layout.md` — `## 0. Index`, AC-50, §8 accessibility
- `specs/009-product-page-date-picker.md` — the reading-order clause in §14
- `docs/codebase-map.md` — the product page and the breadcrumb component
- `.claude/state/qa-2026-10-18/QA-2.md` (N-07), `QA-1.md` (Q1-22)

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (2026-10-18):** same files as TASK-228, TASK-229 and TASK-230 (the product
  page and its trail); dispatch after their one feature PR merges, never beside it.

## Escalations

_None recorded._

## Progress

_Not started._

## Result

_Pending._
