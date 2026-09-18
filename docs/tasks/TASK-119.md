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

The locale suggestion is a native `<dialog>` (PR below). `src/config/country-locale.data.ts` holds
the country → locale table (AT/CH/DE → `de`, GB/IE → `en-gb`, PL → `pl`, everything else → `en`)
as zod-free constants and `src/config/country-locale.ts` parses them at module load;
`hints.ts` gained `countryFromHeaders()` — still the only file `fo/no-geo-redirect` lets read a
country — and `decideSuggestion()` gained the second pass (languages first, country second, and
`null` rather than a default for anything that is not a country). `GET /api/geo` is `no-store`,
answers `{"country":"DE"}` or `{"country":null}`, reads no IP and logs nothing (RoPA row 8).
`ui/LocaleSuggestionDialog*` resolves its copy **in the locale it offers** (a translator per launch
locale plus `formatCountryName()` through `Intl.DisplayNames`) with the current locale's "Stay in
English" line beneath, opens with `showModal()` (browser-owned focus trap, `Esc` = stay, focus to
the offer and back on close), and `ui/localeGate.ts` makes the consent sheet wait for it and fail
open twice over. The `banner.*` namespace became `suggestion.*`; the dismiss action, its
`sessionStorage` key and its cookie-register row are gone.

**Numbers.** Island chunk 2 775 B Brotli (8 217 B raw, 3 176 B gz) — the §14 A14 budget is
+≤3 KB. Per-route delta against the committed baseline: **+794 B br** on every locale document
(124 387 → 125 181 B) and +244 B on `/`; `tests/fixtures/seo/bundle-baseline.json` regenerated.
Lighthouse through `pnpm lighthouse:origin` (Brotli, the encoding the budget is written in): all
nine URLs pass. Message payload unchanged at 0.6 KB gz per locale; no zod on any client path
(`i18n-hints-zod-free`).

**Tests.** Unit: `country-locale-config` (11), `geo-route` (14), `locale-gate` (8),
`i18n-suggestion-dialog` (30, replacing `i18n-suggestion-banner`), the country half of
`i18n-hints` (+16) and `formatCountryName` in `i18n-format` (+15). e2e: `banner.spec.ts` rewritten
— appearance, the two actions, `Esc` = stay, the country pass over a mocked `/api/geo`, byte
equality of `/en` with and without `Accept-Language` **and** `cf-ipcountry`, and the
suggestion-before-consent sequence (792 e2e green). a11y: modal semantics, focus trap, `Esc`,
focus indicators and the ≤35 % geometry on a 390×844 phone (76 green). Visual: the suggestion and
consent-settings baselines regenerated (43 green).

**Handed on.** `de`/`pl` `suggestion.*` are echoed English drafts like every other key, so the
German sentence a German visitor reads is still English until a native reviewer approves it — the
mechanism is in place (`suggestionCopy` resolves from the target locale's catalogue), the wording
is a translation task. `tests/support/locale-choice.ts` is the shared "returning visitor" seed the
other suites now use where a modal question would otherwise race their clicks.
