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

- **From the implementer's self-review (2026-10-24):**
  - Browsers without `reading-flow` (Safari, Firefox in 2026) tab the phone trail **first**, while it
    is drawn under the buy section: a phone-only 2.4.3 mismatch for keyboard and switch users there.
    One DOM order cannot match both AC-50 placements in every browser; the alternative (two trails,
    one hidden) is a spec question the brief forbids answering here. Spec 004 owner to rule if the
    phone fallback is not acceptable.
  - A browser without CSS generated-content alt text (`content: "/" / ""`; Safari before 17.4,
    Firefox before 128) drops the declaration and draws no separators (crumbs still spaced 12 px).
  - The artboards (`docs/design/wireframes/product-*.dc.html` L397, and the shop/corridor artboards)
    still draw `li + li::before`, a leading separator, and the phone artboard clips the trail to one
    line (`.M .crumbs ol` L1722); the build wraps and puts the separator after its crumb. The
    designer should bring the system files into step.
  - The doc comments of `ListingBreadcrumb` and `CorridorBreadcrumb` still say the separator is an
    `aria-hidden` span; left alone (listing and corridor files outside this fence).
  - The change is in the shared `Breadcrumbs` primitive, so every page's desktop trail now wraps the
    same way; on one line nothing moves.

## Escalations

_None recorded._

## Progress

- 2026-10-24: trail moved first in the DOM (phone placement by grid row 3, `reading-flow` on the
  phone grid); separator moved after its crumb as generated content; unit and e2e cases written,
  e2e watched red against the live site (`770c63a4`, the pre-fix code); draft PR opened.

## Result

**What changed.** `src/modules/ui/product/ProductPage.tsx` L186-L199: the trail's wrapper is the
first child of the first block. From `md` it keeps `md:row-start-1` (on top, 20 px under the
header) and is now the first tab stop in `<main>`; below `md` it is `max-md:row-start-3`, under the
buy section (AC-50 unchanged), and the phone grid carries `reading-flow: grid-rows` so the keyboard
follows the rows (gallery, buy section, trail) where the browser supports it.
`src/modules/ui/primitives/Breadcrumbs.tsx` L46-L58: the `/` is now generated content **after**
each crumb but the last (`content: "/" / ""`, silent to assistive technology, like the
`aria-hidden` span it replaces), so a wrapped trail ends a line with `/` and never starts one. On one
line the pixels are the old ones (6 px inside the `<li>`, 6 px across the `<ol>`). One `<nav>`, one
trail in the server HTML, `BreadcrumbList` untouched (its equality tests pass unchanged).

**No local build, e2e or visual run of the new code**: the e2e cases ran once inside the build slot
against the live site (the pre-fix code) to watch them red; green is CI's on the head SHA.

## Self-review

1. **AC proof.**
   - N-07 / spec 004 AC-50 + §8 (WCAG 2.4.3) at 1440: `tests/e2e/product-v3.spec.ts` L781
     ("at 1440 × 900 the first tab stop in <main> is the trail's Home link…"): Tab walk from the top,
     the first stop in `<main>` is exactly `A[/en-gb]`, and the regions are reached in the drawn
     order (trail, gallery, buy). Unit twin: `tests/unit/product-page.test.tsx` L1911 (main's first
     tab stop in the server HTML is the Home link; trail before gallery before buy in the DOM).
   - Phone keyboard order (spec 009 §14 reading order): `tests/e2e/product-v3.spec.ts` L799
     (390 × 844: drawn order gallery, buy, trail; tab order equal to it; trail last). Placement
     classes pinned in `tests/unit/product-page.test.tsx` (second case of the TASK-249 describe).
   - Q1-22 / Q1-27 at 320, 360, 390: `tests/e2e/product-v3.spec.ts` L817: per `<li>`, nothing
     precedes the crumb (`lead` 0), every crumb but the last draws the separator after it on its own
     flex line, the last draws none; at 320 the trail is asserted to wrap (≥ 2 lines). Unit twin:
     `tests/unit/ui-primitives.test.tsx` L427.
   - AC-50's existing T-55 (trail below the buy section at 390, above the gallery at 1440) is
     unchanged and still binds.
2. **Mutations watched red.**
   - Live site (`770c63a4`, trail after the buy section, leading separator span), build slot held,
     `PLAYWRIGHT_BASE_URL=https://flowersoverseas.com`: the 1440 case red (`Expected "A[/en-gb]",
     Received "UL"`, the gallery's thumbnail list), the 320, 360 and 390 cases red (no separator
     after crumb 0). The phone keyboard case passes there, as it should (the old phone DOM order
     already matched the screen); it guards `reading-flow`.
   - Unit, local: the trail block moved back after the buy section, `product-page.test.tsx` red
     (`expected '<ul aria-label="Product images"…' to match /^<a [^>]*href="\/en-gb"/`); the leading
     `aria-hidden` span restored and `CRUMB` reduced to the old classes, `ui-primitives.test.tsx`
     red. Both restored from a copy, green again.
3. **Awkward cases.** Review-only class (presentation, DOM order); no money, date, order or legal
   text. Checked: RTL (`/ar-XB`) needs no mirroring, the separator is a character; the JSON-LD and
   its two equality tests (`tests/e2e/schema.spec.ts`, `tests/unit/catalog-product-schema.test.tsx`)
   are untouched and pass, since `textContent` no longer holds `/` at all; Tailwind compiles
   `after:content-['/'_/_'']` to `--tw-content: '/' / ''` and `max-md:[reading-flow:grid-rows]`
   to `reading-flow: grid-rows` (checked with the Tailwind CLI).
4. **Left, as carry-forwards** (below).

