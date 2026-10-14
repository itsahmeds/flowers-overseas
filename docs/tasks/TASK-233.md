# TASK-233 — Language links keep the page

Row: `TASKS.md` → TASK-233. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Keep it current by editing this
file, not the row.

## Binding

A bug in merged work (TASK-035's switcher as mounted by TASK-176 and TASK-195), so a new task
(founder rule, 2026-10-14). Keeps the breaker: the change rewrites internal links on every page
and reads the alternates that also feed hreflang.

- **Spec 003 §2 L79:** "Header locale switcher: `localePath()`-built links to the same path in
  every launch locale, falling back to the locale home; no JS required." **§5.3 L194:** "Plain
  links to the same path in each launch locale". There is no AC id for this clause (listed as a
  spec gap in the PR); the task owns it explicitly, as TASK-004 did for its unnumbered clause.
- **Every place the switcher renders:** the desktop utility strip, the phone Menu sheet (spec 004
  §14 A24 AC-47: "the four locale links (spec 003's `LocaleSwitcher` markup)") and the footer
  language row. Each link goes to the **same page** in that locale: the page's own alternate path
  for that locale, from the same source the first-visit popup already uses (`LanguageAlternates`,
  `productAlternatePaths()`; QA-4b Part E: the popup keeps the page on products, categories and
  occasion hubs). Where that page does not exist in a locale (no `de`/`pl` corridor guide, an
  unslugged entity), the link goes to that locale's home, exactly as §2 L79 says.
- **Never a link to a 404 or an unpublished target:** spec 004 AC-14 and spec 008 AC-21 crawls
  stay green; the alternate is the existence answer of the page type (`productPageExists`,
  `listingExists`, the corridor rule), not a string rewrite of the path.
- **Unchanged:** no JavaScript (the switcher stays plain links, spec 003 §5.3); `lang` and
  `hrefLang` on each link; the current locale stays `<span aria-current="page">`; the beta tag
  (`localeBetaTag()`); ADR-0006 (no redirect, the user chooses). The 404 has no switch today
  (QA-4b Part E); leave it unless TASK-191's notice document gives it one.
- **Gates:** cheap gates; CI green with `ci:full`; `/review` and `/break`. Tests: an e2e over one
  page of each type (home, destinations hub, guide, shop root, category, occasion, occasion hub,
  category hub, occasions index, product) in four locales at 1440 and 390 asserting each
  switcher link's `href` equals that page's alternate, or the locale home where none exists.
  Mutations watched red: switcher back to locale homes; an alternate pointing at an unpublished
  guide.

## Read

- `specs/003-i18n-foundation.md` — `## 0. Index`, §2 L79, §5.3 L194, §6 "Internal links", §14 A16 (the popup)
- `specs/004-design-system-layout.md` — §14 A24 AC-47, AC-14
- `docs/codebase-map.md`
- `src/modules/i18n/ui/LocaleSwitcher.tsx`, `src/modules/i18n/ui/LanguagePopup.tsx`, `src/modules/ui/layout/SiteHeader.tsx`, `MenuSheet.tsx`, `SiteFooter.tsx`, `src/modules/catalog/product.ts` (`productAlternatePaths`)

## Carry-forwards

- **From the site test (2026-10-14):** QA-4 #4 (P1), QA-2 11 (P1): from a product, guide or hub,
  English (UK), Deutsch and Polski in the menu, the utility strip and the footer land on `/en-gb`,
  `/de`, `/pl`. QA-4b Part E: confirmed on all 11 page types at 1330.
  `.claude/state/qa-2026-10-14/QA-4-interactions.md` (QA-4 #4, Part E), `QA-2.md` 11.
- **Not this task (spec gaps in the PR):** the phone menu's backdrop, tap-outside close, focus
  containment and close label (QA-4 #8, QA-4b E02, QA-3 D-16): spec 004 AC-47 asks only for `Esc`
  and focus return, and no artboard draws the open sheet.

## Escalations

_None recorded._

## Progress

_Not started._

## Result

_Pending._
