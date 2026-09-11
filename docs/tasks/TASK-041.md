# TASK-041 — Suggestion banner, switcher beta tags and the `fo_locale` cookie: `hints.ts` (`parseAcceptLanguage`, `preferredLocale` — language preferences only), the lazily imported client island, `LocaleCookieSchema`, the switcher's beta marker above the 5% threshold, and the e2e banner matrix

Row: `TASKS.md` → TASK-041. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-041-suggestion-banner-cookie`. ADR-0006 in its positive form: the banner decides entirely from `navigator.languages` and `document.cookie` after hydration, so no response varies by request header — no `Vary: Accept-Language`, no bot-UA branch, one cache entry per path, and no `Set-Cookie` on any cached page (§5.4, AC-12; spec 001 AC-15 preserved). §7 records the deliberate narrowing of `plan/03` §2 (§13 Q9): the IP-country hint is dropped entirely, so `fo/no-geo-redirect`'s `hints.ts` allowance stays unused rather than exercised, and `hints.ts` reads no IP or geo header at all. §8 compliance: `fo_locale` is strictly necessary and functional per `plan/07` §6 — written only on an explicit user action, holding one of four locale codes and no identifier, `Path=/`, `Max-Age` 31536000, `SameSite=Lax`, `Secure` outside development, not `HttpOnly`, no consent gate (§13 Q4); a forged value such as `fo_locale=zz` is ignored and rewritten. No new RoPA processing row is required (no new processor, category or transfer); the reviewer confirms the `fo_locale` row in the cookie register at PASS. Accessibility: non-modal, dismissible, `Esc`-closable, `aria-live="polite"`, steals no focus, reserves no layout space (CLS delta 0 — WCAG 2.2.2 and 1.4.13). The switcher's links work with JavaScript disabled. Tests: T-12, T-28. **Implemented on `task/TASK-041-suggestion-banner-cookie`, PR #23, `in_review` 2026-09-08.** Four files under `src/modules/i18n`: `hints.ts` (pure — `parseAcceptLanguage`, `languagePreferences`, `preferredLocale`, `readLocaleCookie`, `serialiseLocaleCookie`, `decideSuggestion`, importing nothing but `./schemas.ts` and touching no browser global), `ui/LocaleSuggestionBanner.tsx` (Server Component projecting the registry into four fields plus a `localePath()`-built href), `ui/LocaleSuggestionBannerLoader.tsx` (`next/dynamic`, `ssr: false` — the boundary lives in the module because `ssr: false` is invalid in a Server Component and `plan/01` §5 keeps `app/` thin) and `ui/LocaleSuggestionBannerIsland.tsx`. `LocaleCookieSchema` + `AcceptLanguageSchema` in `schemas.ts`; barrel gains `parseAcceptLanguage`, `preferredLocale`, `LocaleSuggestionBanner`, `LocaleCookieSchema` (pin updated, the island's own seams go to `FORBIDDEN_EXPORTS`); `banner` joins `namespacesFor("localeDocument")`; the four `banner.*` `retained` flags are gone from `messages/en.meta.json` (TASK-040 carry-forward discharged). Five spec-silent points decided and argued in the PR body: (1) **Dismiss and `Esc` write no cookie** — §2 attaches "sets `fo_locale`" to Switch and Stay only, a dismissal is a "not now" rather than a choice, so it is remembered per tab in `sessionStorage` (a boolean, no identifier, same strictly-necessary basis) and "never reappears" stays true exactly for the two actions §2 names; (2) the `next/dynamic` boundary is a module-internal client loader, not the layout; (3) `preferredLocale(preferences, registry)`'s second argument is a **structural list** (`LocaleConfig[]` satisfies it), which is what lets the server and the island share one pure matcher and keeps the registry out of the browser; (4) `decideSuggestion` takes the raw `document.cookie` and validates `fo_locale` itself, so "a forged value is ignored" is a property of the decision; (5) `timeZone="UTC"` added to the layout's `NextIntlClientProvider`, mirroring `request.ts`, because the banner is the first component to read copy in the browser. Measured, not asserted: the island is **1,096 B gzipped** in one chunk that is absent from the prerendered HTML and is the only late request on `/en`; initial `/{locale}` JS moves +4,104 B gz, and only because `src/app/global-error.tsx` is `"use client"` and imports the module **barrel** — flagged for TASK-043/AC-27 as the cheap lever it owns, alongside the pre-existing 304 KB Sentry+zod weight. Unit 999 green (+109, 0 skipped), e2e 19 new cases × 2 projects, a11y in a **new** `tests/a11y/banner.spec.ts` so TASK-042's edits to `shell.spec.ts` do not collide. CI 22/23 green; `lighthouse` red and informational (`resource-summary.script.size` on `/`, which ships no island). **Carry-forward for the reviewer and for TASK-043:** the `fo_locale` cookie-register row §8 asks the reviewer to confirm has no file to live in — `docs/compliance/` holds `ropa.md` only (no RoPA row is needed, per §8). `plan/07` §6 already names the cookie essential, but the register itself needs an owner: TASK-043's docs pass or spec 004's CMP. Also recorded: `pnpm test:visual` fails on macOS on `origin/main` too — the committed `darwin` baselines are an unstyled render (no Tailwind preflight) while the `linux` baselines CI gates on are correct; proven by stashing this branch and re-running, and by the byte-identical `/` HTML with and without this PR. No baseline touched (TASK-042 owns `tests/visual/**`).

## Read

- `specs/003-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `plan/03`
- `plan/07`
- `src/modules/i18n`
- `plan/01`
- `messages/en.meta.json`
- `src/app/global-error.tsx`
- `tests/a11y/banner.spec.ts`
- `docs/compliance/`
- `tests/visual/**`

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Result

Done. PR [#23](https://github.com/itsahmeds/flowers-overseas/pull/23); `/review` pass recorded in `TASKS.md`.
