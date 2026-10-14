# TASK-237 — Hide `de` and `pl` until reviewed: the `shown` switch

Row: `TASKS.md` → TASK-237. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Keep it current by editing this
file, not the row.

## Binding

Founder ruling D1 A, 2026-10-14 ("R ok, D1–D5, …"; `docs/decisions-log.md`). Keeps the breaker
(i18n tooling that decides indexability, an SEO gate; `CLAUDE.md` DoD §4). **One feature PR with
TASK-233 and TASK-238, one agent, branch `task/TASK-233-…`**: all three edit `LocaleSwitcher`,
`LanguagePopup`, the header strip, the phone Menu and the footer.

- **Spec 003 §14 A-founder-2026-10-14c, clauses 1 to 7. Owned: AC-45, AC-46, AC-47, AC-48
  (T-45 to T-48).**
  1. `LocaleConfigSchema` gains a required `shown: boolean` in `src/config/locales.ts`: `en` and
     `en-gb` true, `de` and `pl` false. The schema refuses `shown: true` with `isPseudo`; the
     registry refuses an x-default that is not shown.
  2. Read only through `LocaleRegistryProvider`. The routing module gains `shownLocales()`
     (registry order, launch locales with `shown: true`); AC-3's pinned barrel list gains that one
     name.
  3. The header strip, the phone Menu, the footer's language links and the first-visit popup list
     `shownLocales()`, never `launchLocales()`. A `de` or `pl` browser hint highlights nothing
     beyond English's default mark. On `/de` or `/pl`, reached by URL, the switcher lists the shown
     locales and not the page's own.
  4. `isLocaleIndexable` becomes `isLaunch ∧ shown ∧ share ≤ 5 %`. `alternatesFor()`, the
     sitemaps and every page type read the gate already and change nothing.
  5. `pnpm i18n:check` fails, naming the locale, when a locale whose primary language is not
     English is `shown: true` with an unreviewed share above 5 %. `en`/`en-gb` stay outside that
     check.
  6. Showing a locale again is a data flip: AC-48's harness flips `de` in a fixture registry with
     no file changed under `src/app/` or `src/modules/`.
  - **Unchanged:** `isLaunch`, routing (`/de`, `/pl` answer 200, no redirect, ADR-0006, no 404),
    the `fo_locale` cookie values, `generateStaticParams`, A15's drafting duty. No new message key.
- **Spec 004 §14 A-founder-2026-10-14e:** AC-47's third bullet reads "the language links of
  `shownLocales()`, today English and English (UK)"; T-52's Menu case asserts two language links;
  AC-14's crawl reads "the shown locales plus `/`" for its locale set, and `/de`, `/pl` stay
  reachable by URL with AC-14's link rule on their own pages. No new AC there; the tests named are
  updated in this PR.
- **Not this task:** spec 003 AC-49 and T-49 (the switcher keeps the path) are TASK-233's, in the
  same PR. §13 Q12 (where a link goes when the target locale lacks the page) is open and is not
  built: with only `en` and `en-gb` shown, every page exists in both.
- **Gates:** `pnpm gates:cheap` with the block pasted; CI green on the head with `ci:full`
  (e2e, a11y, visual for the chrome at 390 and 1440); `/review` and `/break`. Mutations watched
  red, each named in T-45 to T-48: the pseudo-locale refinement deleted; `LocaleSwitcher` reading
  `launchLocales()` again; the `shown` term dropped from `isLocaleIndexable`; the new `i18n:check`
  branch skipping non-English locales.

## Read

- `specs/003-i18n-foundation.md`: `## 0. Index`, then §14 A-founder-2026-10-14c, A14, A16, A17
  (the share), AC-3, AC-24, AC-31 (the data-flip harness)
- `specs/004-design-system-layout.md`: §14 A-founder-2026-10-14e, A24 AC-47, AC-14
- `docs/codebase-map.md`
- `src/config/locales.ts`, `src/config/locales.data.ts`, `src/modules/i18n/routing.ts`,
  `src/modules/i18n/review.ts`, `src/modules/i18n/hints.ts`, `src/modules/i18n/ui/LocaleSwitcher.tsx`,
  `src/modules/i18n/ui/LanguagePopup.tsx`, `scripts/i18n-check.ts`

## Carry-forwards

- **From the site test (2026-10-14):** QA summary item 4: the `de` and `pl` pages are about 90 %
  English ("Geburtstagsblumen we make for Polen"), and the menu, the footer and the popup offer
  them to every visitor. `.claude/state/qa-2026-10-14/QA-2-03.png`, `QA-2-04.png`, `QA-1-19.jpg`.
- **From PR 226's review (2026-10-14):** TASK-233's e2e iterates `shownLocales()`, not four
  locales; this task supplies the function, so build it first inside the feature PR.

## Escalations

_None recorded._

## Progress

_Not started._

## Result

_Pending._
