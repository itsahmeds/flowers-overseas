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
  links to the same path in each launch locale". Since PR 227 this has an AC: **spec 003 §14
  A-founder-2026-10-14c AC-49 (T-49), owned here** (the amendment gives T-49 to whichever of the
  `shown` task and this one lands first; both are in this PR). On a corridor page, a listing, a
  product page and a trust page, each language link in the header strip, the phone Menu, the
  footer and the popup points to the same page in that locale through `localePath()`, never to
  the locale's home unless the page is the home, and answers 200.
- **One feature PR with TASK-237 (`de`/`pl` hidden, `shownLocales()`) and TASK-238 (the WhatsApp
  help line), one agent, branch `task/TASK-233-…`.** The switcher lists `shownLocales()` (today
  `en` and `en-gb`), so every e2e here iterates `shownLocales()`, not four locales (PR 226 review).
- **Spec 003 §13 Q12 is open** (where a link goes when the target locale lacks the page). With
  only `en` and `en-gb` shown every page exists in both, so build no new fallback: keep §2 L79's
  existing one and do not build Q12's default.
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
  category hub, occasions index, product) in each of `shownLocales()` at 1440 and 390 (T-49's
  four pages among them: `/en-gb/send-flowers-to/poland`, `/en-gb/poland/flowers/roses`,
  `/en-gb/poland/product/amber-hour`, `/en-gb/help` once TASK-182 publishes it) asserting each
  switcher link's `href` equals that page's alternate, or the locale home where none exists.
  Mutations watched red: switcher back to locale homes; an alternate pointing at an unpublished
  guide.

## Read

- `specs/003-i18n-foundation.md` — `## 0. Index`, §2 L79, §5.3 L194, §6 "Internal links", §13 Q12, §14 A16 (the popup), A-founder-2026-10-14c (AC-49, T-49)
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
  and focus return, and no artboard draws the open sheet. Since PR 227 that is spec 004 §13 Q16,
  open for the founder.
- **From PR 226's review (2026-10-14):** spec 003 AC-49 and T-49 now own the same-path rule (the
  brief said "no AC id"); spec 003 AC-45 to AC-48 add `shown` locales, so the switcher shows only
  `en` and `en-GB` and the e2e iterates `shownLocales()`; Q12 stays open. All three are written
  into the Binding above.
- **`SiteHeader.tsx`** is also edited by TASK-232 (the notice bar, home feature PR). Whichever
  merges second rebases and keeps both.

## Escalations

_None recorded._

## Progress

- 2026-10-15: `pageAlternatePaths()` (catalog), `LocaleSwitcher` `paths` prop, the `@switcher` slot and its three mounts; unit and e2e suites; one local build to prove the slot (PR 229).
- 2026-10-15: CI red on the map size budget only; slot trimmed to four files, cap +0.5 KB, flagged.
- 2026-10-15: TASK-237 and TASK-238 joined this PR (feature PR). The switcher now reads
  `shownLocales()`, and `language-links.spec.ts` iterates it; see `docs/tasks/TASK-237.md` and
  `docs/tasks/TASK-238.md`.
- 2026-10-18 (finisher): a11y tab-order fix, rebase onto TASK-226, fresh Linux baselines; see
  `docs/tasks/TASK-237.md` `## Progress`.
- 2026-10-18 (finisher): `/break` round 1 holes H1 to H3 (check 12 and `shown` coercion) belong to
  TASK-237 AC-48 and AC-45; closed there by tests, see `docs/tasks/TASK-237.md`.

## Result

PR https://github.com/itsahmeds/flowers-overseas/pull/229.

**How.** The locale layout cannot know its page without reading the path (which would make every
document per-request), so it gets a second parallel-route slot beside `@notice`: `@switcher`
mirrors the three deeper route depths (`[segment]`, `[segment]/[child]`,
`[segment]/[child]/[grandchild]`), and each file hands its params to `PageLocaleSwitcher`
(`src/modules/catalog/ui/PageLocaleSwitcher.tsx`), which renders `LocaleSwitcher` with
`pageAlternatePaths(locale, segments)` (`src/modules/catalog/alternates.ts`). That function asks
`resolveLocalePath()` which page the path is and answers with the builder its route already hands
the popup: `corridorAlternatePaths`, `listingAlternatePaths`, `productAlternatePaths`, every launch
locale for the destinations hub and the home, `{}` for a refused path. The locale home and any
folder with no mirror (`boom`, `_query`) get `@switcher/default.tsx`, the locale homes. The layout passes the one
slot node to `SiteHeader` (utility strip and phone menu) and `SiteFooter` (language row); both
default to the homes switcher when no route is behind them. Still plain `<a>`, no JavaScript, no
redirect; `lang`/`hrefLang`, `aria-current` and the beta tag unchanged.

**The locale list comes from one place:** `LocaleSwitcher` iterates `launchLocales()` (the
launch-locale registry, `src/config/locales.ts`) and nothing else, and `pageAlternatePaths()` /
`languageAlternateEntries()` only ever add a path for a code that registry lists. Taking `de`/`pl`
out of the menu, strip and footer (founder ruling D1, TASK-237) is a change to that registry, with
no edit to the switcher or its mounts.

**Tests.** `tests/unit/i18n-switcher-same-page.test.tsx` (45): `pageAlternatePaths()` for one page
of each of the ten types asked from every locale that has it, equal to the literal cluster in
`tests/support/language-links.ts`; `{}` for refused paths (the German Poland guide, `/en/flowers`,
`boom`, an unknown product, an unknown locale); the switcher's hrefs, fallback and filtering; the
three mounts drawing the node they are handed. `tests/e2e/language-links.spec.ts` (20, e2e-desktop
only, JavaScript off): the ten types in each locale that has the page (37 documents) at 1440
(strip + footer) and 390 (phone Menu opened by its `<summary>` + footer), each row's
`hreflang`→`href` map equal to the expected one, one `aria-current`, and every target 200 with no
redirect. `tests/unit/catalog-barrel.test.ts` lists the new export and file.

**Mutations watched red.** Unit: the guide's alternates plus an unpublished German guide (2 red);
`LocaleSwitcher` back to `localePath(code, pageType)` (5 red); the header strip back to its own
switcher (1 red); the footer back to its own switcher (1 red). E2E, one mutated build: the strip
back to the homes switcher and the corridor alternates plus `/de/blumen-verschicken/polen` gave 10
red: the nine non-home types at 1440 (strip) and the guide at 390 (menu/footer:
`"de": "/de/blumen-verschicken/polen"`); home stayed green, as it should.

**Local build (why).** A new parallel-route slot under `dynamicParams = false` routes cannot be
judged without `next build`: it still prerenders every page as SSG (4 827 static pages, route
table unchanged in kind), and the served HTML carries the slot's links three times. Load average
during the run 15 to 24, so no timing claims. `catalog-pricing-minor.test.ts` (ESLint run per
root, 5 s timeout) timed out locally under that load and touches nothing in this diff; CI judges it.

**Map cap raised (flagged).** CI's `codebase-map.test.ts` budget failed on the first head: main
stood at 17 375 B, 33 B under the 17 KB cap, and any new route file overflows it. With the
component moved into the catalogue module and the home on the slot default, four route lines
remain (map 17 751 B); the cap is now 17.5 KB, with the note beside TASK-200's. TASK-095's
compression is still the remedy. **Superseded on rebase (orchestrator, 2026-10-15):** TASK-236
(PR 233) set the cap to 20 KB per spec 001 A21, so this branch's cap change was dropped and the
test is main's; the regenerated map is 17 966 B.

**Spec gaps (in the PR).** Spec 003 §2 L79 / §5.3 L194 has no AC id. The phone menu's backdrop,
tap-outside close, focus containment and close label stay out (QA-4 #8, QA-4b E02, QA-3 D-16).
