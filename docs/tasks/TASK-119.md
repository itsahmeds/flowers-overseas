# TASK-119 — Locale suggestion popup: replace the slide-in strip with a native `<dialog>` — centred card on desktop, compact bottom sheet (≤35 % viewport) on mobile — "You seem to be in {country}. Continue in {native name}?" / "Stay in {current}"; hint = `navigator.languages` then the edge country header read by `hints.ts` through a `no-store` `GET /api/geo` (country code only, nothing stored); country→locale table in `src/config/`; shown before the consent sheet; `fo_locale` silences it forever; zero CLS; +≤3 KB br

Row: `TASKS.md` → TASK-119. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-119`; keep it current by editing this file, not the row.

## Binding

- Spec 003 **§14 A14** is the whole task: read it verbatim. It amends §5.3 (the banner's shape) and §6 (the "language preferences only" narrowing), and re-asserts AC-7 and AC-9 (byte-identical `/` and `/en` with and without `Accept-Language` **and** with and without `cf-ipcountry`; no `Location`, no `Vary`, no `Set-Cookie` on any page).
- **ADR-0006 is unchanged**: no redirect, ever; every locale a crawlable URL; the URL is authoritative; no bot-UA branch anywhere. `fo/no-geo-redirect` stays green — `hints.ts` is the only file that may read a country header, and `/api/geo` is a `no-store` route that calls it.
- Country → locale table lives in `src/config/` (`DE`/`AT` → `de`, `CH` → `de`, `PL` → `pl`, `GB`/`IE` → `en-gb`, else `en`), zod-parsed, unit-tested; `decideSuggestion()` gains the country input (language preference wins over country when both exist).
- Shape: native `<dialog>`; desktop centred card over a dimmed page; **mobile compact bottom sheet ≤ 35 % of the viewport** (Google intrusive-interstitial rule); copy in the suggested locale with the current locale's line beneath; two actions only; `Esc` = stay; focus to the primary action and restored on close; zero CLS; shown **before** the consent sheet, which waits for it. Lazy-imported after hydration; script delta ≤ 3 KB Brotli measured against the committed baseline (spec 004 AC-27 budget).
- Design first: draw the dialog (both widths, both states) in `docs/design/system/components.dc.html` and update the flow annotation in `flows/consent-and-locale.dc.html` in the same PR, before the component (CLAUDE.md: no page from a description alone).
- Compliance: `docs/compliance/ropa.md` gains a row — purpose language suggestion, basis legitimate interest, data IP-derived country code only, in memory, never stored or logged, retention none; `/api/geo` logs no IP and no country.
- Founder ruling 2026-09-16: "this should be a popup".

## Read

- `specs/003-i18n-foundation.md` — `## 0. Index`, §14 A14, §5.3 (suggestion banner), §6, AC-7, AC-9, T-09; `docs/adr/ADR-0006-no-ip-redirects.md`
- `docs/codebase-map.md` → `src/modules/i18n/hints.ts` (`decideSuggestion`, cookie helpers), `src/modules/i18n/ui/LocaleSuggestionBanner*.tsx`, `suggestionCopy.ts`, `src/app/[locale]/layout.tsx` (banner + `ConsentBanner` wiring), the consent island (spec 004 TASK-051) for the sequencing hook, `src/lib/env.schema.ts` `hostPlatform()` (PR #68) for the header name
- `docs/design/system/components.dc.html`, `docs/design/flows/consent-and-locale.dc.html`, `docs/design/README.md` (authoring rules)

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
