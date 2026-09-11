# TASK-034 — i18n module seam and `[locale]` routing: `routing.ts`, `registry.ts`, `messages.ts`, `request.ts`, a barrel that exports no provider, the `[locale]` segment with the empty `plan/01` §5 route groups, `<html lang dir>` from `bcp47`/`dir`, minimal `messages/en.json` shell namespaces, localised 404/500, unknown-locale 404, header-invariant responses

Row: `TASKS.md` → TASK-034. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-034-locale-routing-documents`. §5.3 gives latitude on the document shape (two root layouts, or one `src/app/layout.tsx` with a shared `resolveDocumentLocale()`); what is not negotiable is AC-6, AC-7, AC-8 and AC-11, and that whichever shape is chosen is recorded in `docs/architecture.md` §2. Deletes the `lang="en"` literal and its `docs/architecture.md` §4 row (the last locale literal in the repo, spec 001 §7). AC-9 is ADR-0006 in its strongest form: the same URL with and without `Accept-Language: de-DE`, and under a Googlebot UA, byte-identical by hash, 200, no `Location`, no `Vary`. No next-intl middleware, no `localeDetection`, no `NEXT_LOCALE` cookie — the gate for that shipped in TASK-032. AC-5 is the seam test: a fake five-locale `LocaleRegistryProvider` injected inside the module changes rendered output with zero changes outside `src/modules/i18n/`, which is how spec 002/012 hydrate from Postgres without touching callers. `loadMessages(locale, namespaces)` hands the client a per-route subset only, never the whole catalogue (§6 CWV; the byte budget is AC-27 on TASK-043). §8 accessibility: WCAG 3.1.1 Language of Page closes here per locale; 2.4.2 follows with AC-25 on TASK-035. §6 indexability is unchanged — `robots.ts` keeps `Disallow: /` and localised pages stay `noindex,nofollow` until spec 007. Tests: T-03, T-05, T-06, T-08, T-09. **Implemented on `task/TASK-034-locale-routing-documents`, PR #15, `in_review` 2026-09-08.** §5.3's recommended two-root-layout shape was implemented first and measured to break AC-8 on Next 16.3.4 — with two root layouts `src/app/not-found.tsx` *is* reached, but the framework wraps it in a bare `<html>` of its own, so the effective document has nested `html`/`body` and no `lang` attribute at all (AC-8 and WCAG 3.1.1 broken); the shipped shape is §5.3's accepted alternative in its cheapest form — a pass-through `src/app/layout.tsx` plus one document per leaf (`(chooser)/` for `/`, `[locale]/` per locale, `not-found.tsx` for the 404 in x-default), no `headers()` read, so `/{locale}` stays ISR — recorded in `docs/architecture.md` §2. Three deviations for the reviewer, all in the PR body: no `[locale]/not-found.tsx` (a nested 404 boundary *is* rendered in 16.3.4 when a matching route calls `notFound()`, but inside the framework's `<html id="__next_error__">` with no `lang`, so a per-locale 404 document is not expressible and `/de/nope` answers in x-default); `dynamicParams = false` rather than `notFound()` is the unknown-locale gate, which closes the locale set at build time; and `/EN` is skipped locally on macOS APFS (case-insensitive prerender lookup) and asserted on Linux, where CI proved it (e2e 46 passed, 0 skipped, against the preview). `next-intl@4.14.2` is the only new runtime dependency. CI green except the pre-existing informational `lighthouse` (`NO_FCP` on the still-copy-free `/`; the URL set gains `/en` at TASK-043).

## Read

- `specs/003-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `src/app/layout.tsx`
- `docs/architecture.md`
- `src/modules/i18n/`
- `src/app/not-found.tsx`

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Result

Done. PR [#15](https://github.com/itsahmeds/flowers-overseas/pull/15); `/review` pass recorded in `TASKS.md`.
