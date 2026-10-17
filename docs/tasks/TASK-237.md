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

- 2026-10-15: `shown` field and refinements, `shownLocales()`, the gate term, check 12, the
  switcher and popup on `shownLocales()`; unit tests and fixtures (`b9e5967e`, PR 229).
- 2026-10-15: e2e for the chrome rows, the popup, AC-14's crawl and T-52's Menu (`c5a39a0c`);
  map regenerated (`722121f5`); visual baselines refreshed from the `visual-baselines` artifact.
- 2026-10-15 (session close): rebased onto `origin/main` (TASKS.md conflict only, main's rows kept,
  statuses re-applied), head pushed, `ci:full` toggled. **Done:** AC-45 to AC-48 built and tested,
  cheap gates PASS. **Next:** read CI on the PR's current head; if `visual` is red, re-run the
  `visual-baselines` label and compare with the committed set (`881fee61` carries run
  38693547083's bytes). **A replacement must know:** the `visual:baselines` label is still on PR
  229; TASK-238's copy half is held on `task/TASK-238-support-line-hours` (see that brief).
- 2026-10-18 (finisher): `a11y` red on `2735a129` was `tests/a11y/header.spec.ts` tab order: the
  loop still pressed Tab seven times (sized for four locales), so with `de`/`pl` hidden it reached
  two category links past the five expected stops. The loop now runs once per expected stop
  (`9e5294dd`). Rebased onto `83c8e777` (TASK-226): map regenerated, baseline conflicts held for a
  fresh `visual:baselines` run. Unit suite green at a 120 s timeout (gates' timeouts were load
  average 100+). **Next:** commit the runner's baselines, remove the label, toggle `ci:full`.
- 2026-10-18 (finisher): runner baselines from run 39073535884 committed (`734b1fa9`, 25 PNGs and
  the manifest, `--verify` 112/112, images looked at); `visual:baselines` removed; CI on
  `734b1fa9`: `a11y`, `visual`, `e2e` green. **Next:** `/review` and `/break` on the head.

## Result

PR https://github.com/itsahmeds/flowers-overseas/pull/229 (feature PR with TASK-233, TASK-238).

**How.** `shown: boolean` is a required field of `LocaleData` and `LocaleConfigSchema`
(`src/config/locales.data.ts`, `src/config/locales.ts`): `en`, `en-gb` true; `de`, `pl` and both
pseudo-locales false. `LocaleConfigSchema` refuses `isPseudo ∧ shown` on `shown`;
`LocaleRegistrySchema` refuses a hidden x-default on `N.shown`. `shownLocales()` in
`src/modules/i18n/routing.ts` is `launchLocales().filter(shown)`, exported from the barrel (AC-3's
pinned list +1). `LocaleSwitcher` (strip, phone Menu, footer) and `popupCandidates()` read it, so
on `/de` and `/pl` the rows list English and English (UK) with no current entry, and a German hint
matches no option. `isLocaleIndexable` is `isLaunch ∧ shown ∧ share ≤ 5 %`; `alternatesFor()`, the
sitemaps and the page types read it unchanged. `pnpm i18n:check` check 12 fails, naming the locale
and the registry file, when a locale whose primary language is not `en` is shown above 5 %
unreviewed. Routing, `isLaunch`, `generateStaticParams`, cookie values and messages unchanged.

**Tests (by AC).**
- AC-45 / T-45: `tests/unit/locales-config.test.ts` (pinned `shown` per locale; missing field →
  `2.shown`; shown pseudo → `4.shown`, one issue; hidden x-default → `0.shown`, one issue).
- AC-46 / T-46: unit `i18n-switcher-same-page` (each case on the committed and on an all-shown
  registry; `/de` lists `en`, `en-GB`, no `aria-current`), `ui-site-header`, `ui-phone-chrome`
  (two Menu entries), `site-footer`, `app-shell` (`/de` document), `i18n-language-popup`
  (German hint → `hint: null`, two options; the same hint on an all-shown registry → `de`). E2E:
  `language-links.spec.ts` now iterates `shownLocales()` (ten page types, every locale that has
  the page, `/de` and `/pl` included, 1440 strip + footer, 390 Menu + footer); `language-popup.spec.ts`
  (German browser on `/en`: two options, no hint, no `de`/`pl` node).
- AC-47 / T-47: `i18n-review.test.ts` fixture pair (reviewed `de`: hidden → not indexable, shown
  → indexable); committed tree: `i18n-alternates`, `seo-sitemap`, `e2e/locale-routing.spec.ts`
  (`/de`, `/pl` noindex, not linked from the shown roots).
- AC-48 / T-48: `i18n-check.test.ts` check 12 (`registry-pl-shown.json` → exit 1, the one `pl`
  line pinned; committed tree → 0); `i18n-fifth-locale.test.tsx` flips `de` (switcher gains
  Deutsch, gate and hreflang gain `de`, `src/app/` and `src/modules/` hashed identical).
- Spec 004 A-founder-2026-10-14e: T-52's Menu case (unit and e2e two links); AC-14's crawl
  (`links.spec.ts` on the shown locales plus `/de`, `/pl` by URL, and no shown page links into a
  hidden locale); `shop-reachability.spec.ts` (`/` reaches the shown homes).

**Mutations watched red (unit).** Pseudo refinement deleted: 1 red (`locales-config`).
`LocaleSwitcher` on `launchLocales()`: 11 red (switcher, header, phone chrome, app shell). `shown`
dropped from `isLocaleIndexable`: 2 red (`i18n-review` pair, `i18n-fifth-locale` flip). Check 12
skipping non-English locales: 1 red (`i18n-check`).

**SEO fixtures.** Unchanged: `de` and `pl` were already out of hreflang and the sitemaps by their
share; `sitemap-fixtures.test.ts` is green with no regeneration.

**Gates.** `pnpm gates:cheap` on `722121f5`, run with `CI=1` (the unit project's 30 s timeout)
because the machine's load average was 32 to 41 and three CLI-spawning cases timed out at the
local 5 s default (all 4 963 passed under `CI=1`):

```
gates:cheap · 722121f5d9653f69f7ba067ae1334f760303570d · tree clean · base origin/main · 2026-10-15T06:31:23.735Z
typecheck             exit 0 · 3.2 s
lint                  exit 0 · 33.3 s
format:check          exit 0 · 18.8 s
i18n:check            exit 0 · 1.3 s
check:no-db           exit 0 · 0.3 s
codebase:map --check  exit 0 · 0.3 s
tests                 exit 0 · 177.2 s · changed 173 + map 0 + always 2 · always run: zod-boundaries, lint-coverage, url-pii
format:check covers: every path except node_modules/ .next/ out/ coverage/ playwright-report/ test-results/ pnpm-lock.yaml next-env.d.ts .claude/ plan/ specs/ docs/ README.md TASKS.md CLAUDE.md /tests/fixtures/lint/ /tests/fixtures/seo/_cases/ /tests/fixtures/i18n/_cases/ /src/modules/geo/content/corpus.generated.ts
RESULT: PASS
```

No local build, e2e, a11y or visual run: those are CI's (`ci:full`).

**Observation (not built).** On a hidden locale's page the popup's close writes no `fo_locale`
(the page's own code is not a candidate), so a visitor who reaches `/de` by URL sees the popup
again on the next page. The spec is silent; it affects only URL-reached hidden pages.
