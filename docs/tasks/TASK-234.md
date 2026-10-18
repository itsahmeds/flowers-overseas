# TASK-234 — The locale home emits its canonical

Row: `TASKS.md` → TASK-234. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Keep it current by editing this
file, not the row.

## Binding

A bug in merged work, so a new task (founder rule, 2026-10-14). Keeps the breaker (SEO gate:
canonicals).

- **Spec 007 §2 "Canonical":** "self-canonical, absolute, lowercase, no trailing slash, no
  parameters, built by `absoluteUrl()`; never cross-locale". **AC-10:** "Every indexable page
  emits exactly one self-referencing canonical … a page that is `noindex` emits its canonical
  unchanged". The locale home is in Phase 0's indexable set (`plan/09` Phase 0 AC 1; spec 007 §2
  "Sitemaps": `static.xml` lists the locale home). `/en`, `/en-gb`, `/de` and `/pl` print a title
  and description only (`src/app/[locale]/page.tsx` `generateMetadata`); every other page type
  has its canonical.
- **One rule engine:** the canonical comes from spec 007's `indexability()` / the canonical
  builder for a `PageDescriptor` of the home, the same call that gives the home its robots
  directive, alternates and sitemap membership; no literal URL and no new `noindex` branch in
  `app/` (spec 008 AC-14's grep rule, inherited). The hreflang cluster on the home is unchanged.
- **Spec 004 AC-16** is read as narrowed (the page header comment of `src/app/[locale]/page.tsx`
  and spec 007 AC-15): 004 emits none of its own; 007 owns what the page emits.
- **Not this task:** `Product`/`Offer` and `BreadcrumbList` on product pages (TASK-130, spec 009
  AC-18: `Product`/`Offer` stay gated off in Phase 0) and `BreadcrumbList`/`ItemList` on listings
  (TASK-115; spec 008 AC-18 forbids `Product`/`Offer` there). `/favicon.ico` has no spec clause
  (a spec gap in the PR).
- **Gates:** cheap gates; CI green with `ci:full` (`seo:validate`); `/review` and `/break`. T-11
  extended to the four locale homes; mutations watched red: canonical removed; canonical with a
  trailing slash; canonical pointing at `/en` from `/en-gb`.

## Read

- `specs/007-corridor-pages.md` — `## 0. Index`, §2 "Indexability, canonical, hreflang, robots", AC-9, AC-10, AC-14, T-11
- `docs/codebase-map.md`
- `src/app/[locale]/page.tsx`, `src/modules/seo/indexability.ts` and its canonical builder; how `src/app/[locale]/[segment]/page.tsx` emits its canonical

## Carry-forwards

- **From the site test (2026-10-14):** QA-1 Q1-17 (P1): "The locale home has no canonical (only
  title and description in `generateMetadata`); every other page has one."
  `.claude/state/qa-2026-10-14/QA-1.md`. The test ran on a dev build (`noindex` everywhere, no
  hreflang on `http:`), so check the canonical, not the robots line, there.

## Escalations

_None recorded._

## Progress

- 2026-10-18: tests first (unit half red 4/4), then `generateMetadata` emits `alternates.canonical`
  from `canonicalFor(locale, localePath(locale, "home"))`; mutations watched red; cheap gates
  green; PR 248 opened. Next: CI on head with `ci:full`, then `/review` and `/break`.

## Result

- **PR:** https://github.com/itsahmeds/flowers-overseas/pull/248.
- **AC-10 (T-11):** `/en`, `/en-gb`, `/de`, `/pl` each emit one self canonical from the spec 007
  builder (`src/app/[locale]/page.tsx` `generateMetadata`). Robots stays the layout's segment
  default (TASK-096 lifts it); no hreflang added (the home has none); no new message key.
- **Tests:** `tests/unit/seo-canonical.test.ts` +4 (one exact string per home, no `languages`, no
  `robots`); `tests/e2e/seo-canonical.spec.ts` +8 (the four homes join both observed cases).
- **Mutations watched red (unit):** canonical removed 4/4; trailing slash appended 4/4; `/en-gb`
  pointing at `/en` red on en-gb.
- **Outside the fence:** `tests/unit/app-shell.test.tsx` stubs `NEXT_PUBLIC_SITE_URL` in the AC-25
  case, which calls the home's `generateMetadata` and now needs an origin (the builder throws on
  none, as on every route; the build refuses a missing one). No assertion changed.
- **No expensive gate run locally**; CI is the gate of record (`seo:validate`, e2e).
