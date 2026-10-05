# TASK-195 — The phone chrome and the phone primitives

Row: `TASKS.md` → TASK-195. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Keep it current by editing this
file, not the row.

## Binding

- **Spec.** `specs/004-design-system-layout.md` §14 **A24 clauses 3 and 4**. Owns **AC-47, AC-48
  (the primitive), AC-49, AC-50** and **AC-32's phone half**; tests **T-52, T-53, T-54, T-55**.
  Spec 008 §14 A16 (d), spec 007 §14 A12 (b) and spec 041 §14 A1 read their breadcrumb ACs
  through AC-50.
- **Founder.** 2026-10-05: "home 1 and product 2"; the phone home sets "the phone pattern for every
  page" (the `home-mobile` annotation). A24 is approved by the orchestrator on the founder's
  delegation; the founder confirms on return.
- **Artboards (PR 189).**
  - `wireframes/chrome-{desktop,mobile}`, the phone header and the Menu sheet as drawn on
    `home-mobile`, `product-mobile` and `country-shop-mobile`, and the round-2 group in
    `system/components.dc.html`.
  - **The `chrome-mobile` annotation's "Notice bar" row is stale** (it keeps a 44 px phone row).
    The audit and the phone artboards win: below `md` there is no utility strip. If PR 189 has
    not fixed the row, add a dated row to `docs/design/README.md` "Where the sheet and the code
    currently differ".
- **What to build** (in `src/modules/ui`; "the phone" means below `md`):
  - **The minimal header (AC-47).**
    - Below `md`: the logo and **Menu** only, 65 ± 1 px including its rule, sticky as now (§14 A4
      addendum). **No utility strip below `md`.**
    - From `md` up: the header and utility strip exactly as A4 and A7 describe them, unchanged.
    - The header's box is identical before and after hydration at every width (AC-7).
  - **The Menu sheet (AC-47).**
    - A native `<details>`/`<summary>` that opens and closes with JavaScript off.
    - It holds the published header links (spec 008 §14 A14), Send flowers, spec 003's
      `LocaleSwitcher` (markup unchanged, spec 003 AC-3), the currency chip (AC-8 unchanged) and
      the help line.
    - Every target is at least 44 px tall.
    - With JavaScript on, `Esc` closes it and returns focus to the summary. Keep this inside the
      existing budget, or leave it to TASK-194's module and say so.
    - **A20 is lifted for the Menu** (it now opens something real). The basket stays omitted.
  - **The sticky primary-action bar (AC-48).**
    - Fixed to the viewport's foot and opaque (background alpha 1).
    - `padding-block-end` includes `env(safe-area-inset-bottom)`.
    - The page's last block is padded by the bar's size plus the safe area.
    - **It repeats, never replaces:** each action in it has a twin in the page's flow, or is an
      in-page link to one.
    - A price in it comes from the same projection as the visible selected price.
    - The consent sheet and the language popup never intersect its action.
    - CLS is 0 when it shows or hides.
    - Pages use it in TASK-196, TASK-197, TASK-182 and TASK-183. This task ships the primitive, a
      `/dev/components` state and T-53 against a fixture page.
  - **The segmented control (AC-49).** A `<fieldset>` and `<legend>` with native radios, or links
    where the owning spec makes each option a URL. The selection is exposed by `checked` or
    `aria-current`, each segment is at least 44 px tall, and it works with JavaScript off.
  - **The horizontal scroller (AC-49).**
    - It scrolls: `overflow-x: auto`, scroll snap allowed. The artboards' `overflow: hidden` does
      not bind.
    - Every item is reachable by touch and by keyboard, and a scroller with no focusable child
      gets `tabindex="0"` and a name.
    - No page overflow, no auto-advance, no carousel role.
    - Gallery dots only as real `<a href="#…">` links with targets of at least 24 × 24 px.
  - **The back link (AC-50, AC-32's phone half).** Inside the shared `Breadcrumbs` (or its frame),
    so every page gets it at once:
    - below `md`, a `‹ Parent` link to the trail's last ancestor, with that ancestor's label;
    - the chevron is an icon under `mirror-in-rtl`, not a character in copy;
    - its box top is 14 ± 1 px below the header and it is at least 44 px tall;
    - exactly one of the trail and the back link is displayed at a width; the other is
      `display: none`;
    - **the trail stays in the server HTML at every width, and `BreadcrumbList` equals it**;
    - the product page shows the trail below its buy section instead (TASK-197 places it; this
      task provides the switch).
- **Unchanged.** Server rendering, no literal strings, logical properties, tokens only, AC-14's
  crawl (now including the menu's links), budgets (AC-24, AC-25).
- **Dependencies.** Blocked until **PR 189** merges. After **TASK-186** (the frame) and **TASK-176**
  (PR 172, the v2 chrome: the same `SiteHeader` files). Before TASK-187, TASK-188, TASK-189,
  TASK-191, TASK-196, TASK-197 and TASK-182 to TASK-184, which use these primitives.
- **Class.** Keeps the breaker: the breadcrumb's structured-data equality (an SEO gate), the
  header's crawlable links, and the bar's price equality (price display).
- **Tests** (watch each go red by mutating its subject):
  - **T-52** (e2e, JS on and off). Red with the utility strip rendered below `md`.
  - **T-53** (e2e), on a fixture page with a bar. Red with the page's foot padding removed.
  - **T-54** (e2e + a11y). Red with a scroller set to `overflow: hidden`.
  - **T-55** (e2e + contract), on every page type with a breadcrumb that exists today. Red with
    the trail's ancestors removed from the HTML below `md`.

## Read

- `specs/004-design-system-layout.md` — `## 0. Index`, §14 A4 and its addendum, A7, A20, A24
  (clauses 1, 3, 4; AC-47 to AC-50)
- `specs/003-i18n-foundation.md` AC-3 (the switcher's markup); spec 008 §14 A14, A16 (d); spec 007
  §14 A12 (b)
- `docs/design/audits/2026-10-05-round-2.md` (PR 189), the Chrome row and escalation 4
- `docs/codebase-map.md`
- `src/modules/ui/layout/SiteHeader.tsx`, `src/modules/ui/primitives/Breadcrumbs.tsx`,
  `src/config/site-links.ts`, `src/modules/i18n` (the switcher, read only)

## Carry-forwards

One dated bullet per `/review`, newest last.

_None._

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- 2026-10-05 — **A trail whose last ancestor has no page.** AC-50 says every type but the product
  page shows the back link, "its `href` and its text equal the trail's last ancestor". The category
  hub's trail is Home / Flowers / Roses, and "Flowers" is text (no flowers index exists), so a back
  link to it would link to nothing (A20). Built: no back link there, and the trail stays displayed
  on the phone (exactly one of the two is still displayed; `BreadcrumbList` is unaffected). The
  alternative is `‹ Home` (the nearest ancestor with a page), which breaks "text equals the last
  ancestor". To the orchestrator and reviewer in PR 208: **open**. Not blocking: the shipped reading
  is the safe one and flips with one line in `Breadcrumbs.tsx`.
- 2026-10-05 — **The language popup (TASK-119, PR 205) is not merged**, so AC-48's "the popup never
  intersects the bar's action" cannot be tested here. Carry-forward for TASK-119: stand the popup on
  `[data-fo-action-bar]` the way `globals.css` stands the consent sheet on it, and add the case to
  `tests/e2e/action-bar.spec.ts`.

## Progress

One line per coherent step, newest last.

- 2026-10-05 — Phone header with the `<details>` Menu, no strip below `md`, back link in `Breadcrumbs`, the four primitives, gallery states and the bar fixture page (74f45a8c).
- 2026-10-05 — Unit and e2e for T-52 to T-55, header e2e moved to the phone header (8d4df088).
- 2026-10-05 — Local production build in the build slot: fixed the lost `data-fo-menu` attribute (a `"use client"` export is a client reference on the server), the gallery hook, the category hub case; screenshots taken.

## Result

PR [#208](https://github.com/itsahmeds/flowers-overseas/pull/208). AC-47, AC-48 (the primitive), AC-49,
AC-50 and AC-32's phone half; T-52 to T-55.

- **Built.** Below `md`: the logo and a native `<details>` Menu (65 px with the rule), no strip;
  the Menu holds the header's links, Send flowers, spec 003's `LocaleSwitcher`, the currency and
  the help line, and `MenuEscape` (an island that renders nothing) adds `Esc`. `Breadcrumbs` draws
  the `‹ Parent` back link below `md` (14 px under the header, 44 px), keeps the trail in the HTML
  and takes `phone="trail"` for the product page. `StickyActionBar`, `SegmentedControl`,
  `HorizontalScroller` and `GalleryDots` with gallery states and the `/dev/components/action-bar`
  fixture page. No new message key.
- **Local build** (build slot, load average 7.6 to 13.3 during the run): needed to measure the 65 px
  header, the 14 px offset and the safe-area emulation and to take the founder's screenshots. It
  found a real bug a server render could not: an export of a `"use client"` module is a client
  reference on the server, so `data-fo-menu` was lost. e2e-mobile and e2e-desktop: 651 + 178
  passed locally on the touched and neighbouring suites; a11y header and phone: 15 passed.
- **Mutations watched red:** the strip shown below `md` (unit T-52 half); the trail's `max-md:hidden`
  removed (unit T-55 half); `data-fo-menu` lost (unit and e2e).
- **Not done here:** the popup case of AC-48 (TASK-119 unmerged), the product trail "below the buy
  section" (TASK-197 places it), and the category hub's back link (escalation above).
