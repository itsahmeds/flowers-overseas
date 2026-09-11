# TASK-035 — `/` locale chooser, localised titles and the axe exception removal: server-rendered zero-JS chooser whose links carry `nativeName` plus `lang`/`hreflang`, `noindex,follow`, `generateMetadata` titles and descriptions from `meta`, the no-JS locale switcher links, and the spec 001 shell e2e / a11y / visual-baseline updates

Row: `TASKS.md` → TASK-035. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-035-locale-chooser-titles`. Closes the TASK-008 axe decision recorded at `/review 8`: `EXPECTED_PHASE_0_VIOLATIONS = ["document-title"]` in `tests/a11y/shell.spec.ts` is an *equality* assertion, so it must be deleted in the same PR that gives every document a localised `<title>` — the self-clearing exception, self-clearing on schedule. `tests/e2e/shell.spec.ts` today asserts `lang="en"` and `noindex,nofollow` on `/`; it becomes the chooser contract (200, `noindex,follow`, a non-empty `<title>`, one crawlable link per launch locale, still zero `Set-Cookie`, no `Location`, no `Vary`), and the `/` visual baseline is re-committed. §6: `/` is the only `follow` document in Phase 0 and gives crawl depth 1 to every locale root (`plan/02` §7, §11). §8 accessibility: WCAG 2.4.2 Page Titled and 3.1.2 Language of Parts — the locale links declare their target language so a screen reader pronounces "Deutsch" in German; language names, never country flags (`plan/03` §2). AC-25's fourth URL, `/ar-XB`, is re-verified at TASK-042 where that route first exists. Visual design belongs to spec 004; markup here is semantic, accessible and unstyled (§13 Q3). Tests: T-07, T-25, T-26. Carry-forward from `/review 15` (TASK-034): every page under `[locale]` must export `dynamicParams = false`, or the gate moves to one central place — the `[locale]` layout resolves an unknown segment to x-default silently, so a real page at `/fr/about` without the export would be a fabricated duplicate of the English URL, forbidden by spec 003 §6 (recorded in `docs/architecture.md` §2). §5.3 names `src/app/global-error.tsx` rendering an x-default document; not shipped in 034 — add it or record why. **Implemented on `task/TASK-035-locale-chooser-titles`, PR #16, `in_review` 2026-09-08.** Four decisions for the reviewer, all argued in the PR body: (1) the `/review 15` carry-forward is discharged by moving `dynamicParams = false` from the page to the `[locale]` **layout** — a segment config option on a layout governs the whole subtree, so the gate is central and no future page can forget it; the `notFound()`-in-the-layout alternative was rejected because TASK-034 measured that a `notFound()` from a matching route renders inside the framework's `<html id="__next_error__">` with no `lang`, breaking AC-8. (2) `src/app/global-error.tsx` ships as §5.3 asks, x-default with `lang`/`dir` from the registry and its four strings read from the catalogue **as data** rather than through a client `next-intl` provider, because a failure document must not depend on the machinery that just failed; `metadata` cannot be exported from a Client Component so the `<title>` is a rendered element. (3) `src/app/(chooser)/error.tsx` is deleted — it was the last Client Component in the `/` route tree and `global-error.tsx` covers it, which is what makes "served without JavaScript" exact. (4) visual baselines become per-platform (`{platform}` back in `snapshotPathTemplate`, `darwin/` local and `linux/` from the `visual` job's failure artifact, both committed) because `/` now has text and a macOS baseline cannot verify a Linux run at 0.1 %. One deliberate deviation: §7's third `chooser` key, the link `aria-label`, is not shipped — an English accessible name would override the `lang`-declared native link text and defeat the WCAG 3.1.2 pronunciation AC-7 asks for, and an unused key fails `i18n:check` at TASK-040; the `<nav>` is named from `a11y` instead. CI green on all required checks (e2e 50/50 on Linux including the `/EN` case macOS skips, a11y 10/10 with no exception list, visual 2/2, unit 660); `lighthouse` red and informational, and measuring for the first time now that `/` paints: `resource-summary.script.size` 304,272 B against a 122,880 B budget and `categories.performance` flapping 0.91–0.93 against 0.95. Measured before/after: `global-error.tsx` adds one 8.5 KB chunk and the pre-existing browser Sentry SDK from `instrumentation-client.ts` accounts for nearly all of the rest, so AC-27 and the budgets are TASK-043's with real numbers to work from.

## Read

- `specs/003-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `tests/a11y/shell.spec.ts`
- `tests/e2e/shell.spec.ts`
- `plan/02`
- `plan/03`
- `docs/architecture.md`
- `src/app/global-error.tsx`
- `src/app/(chooser)/error.tsx`

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Result

Done. PR [#16](https://github.com/itsahmeds/flowers-overseas/pull/16); `/review` pass recorded in `TASKS.md`.
