# TASK-052 — Locale-home part 1 — full-bleed hero, the finder card and the four-fact proof row: reserved full-bleed photo slot with the token gradient and its caption, `H1` (text LCP) + proposition, the finder card (type-ahead country field with per-country status → town/city/postcode → delivery date → neutral `Continue` + cutoff line), the four-fact proof row, and the `Media` wrapper (`slots.ts`, `placeholderLoader`)

Row: `TASKS.md` → TASK-052. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-052-home-hero-finder`. Spec §12 task 5 split into four (hero+finder, sections, gated rows, styling pass) because the approved design is several times the §5 "home skeleton" and one PR of it would exceed a day. Spec §13's 2026-09-08 resolution note is binding and overrides §5 defaults where they differ. Design source of truth (match pixel-for-pixel): `docs/design/homepage-v1/README.md`, `docs/design/homepage-v1/tokens.css`, `docs/design/homepage-v1/homepage-desktop.dc.html`, `docs/design/homepage-v1/homepage-mobile.dc.html`, `docs/design/homepage-v1/identity.dc.html`, `content/brand/mark.svg`. — hero is the canvas's 820 px full-bleed photographic band with the finder card overlaid at the inline start on desktop and stacked below the headline on mobile. Photography is a placeholder until the founder supplies imagery: every `.photo` box in the canvas renders the `--color-photo` token gradient with its uppercase caption and **no `<img>`** (`plan/10` §3 honesty rule); the consolidated "photo slots" list is part of TASK-053's PR body. The hero slot renders the gradient + "Photography to supply · a Warsaw florist finishing a hand-tied bouquet, morning light, full bleed" caption and **no `<img>`**, at a fixed aspect ratio, so 006's imagery changes the LCP element from text to image with no layout shift and no template edit. **AC-11 is the finder's country field**: the seven `countries.ts` destinations in `collator(locale)` order (`pl` sorts `ł` correctly), fully usable with JavaScript disabled — a real `<select>`/`<datalist>`-backed labelled control that renders every destination as text with its status line (`Delivering now` | `Not yet` + the waiting-list sentence) while `corridorPagePublished` is false, and renders a link/option that resolves to `localePath(locale, "corridorCountry", slug)` when a fixture flips one flag — with **no change under `src/app/`**. Type-ahead is the progressive enhancement on top and must never be the only way to choose (the combobox proper is 007/008's). **What `Continue` does in 004, stated so nobody invents a route:** it is a submit control on a server-rendered form that targets the destinations route the founder's design implies — `/{locale}/{send-flowers-to}/{country}` (the localised `corridorCountry` segment from `src/config/locales.ts`) — and because **spec 007/008 own that route and no country is published in Phase 0**, the button in Phase 0 leads to the published guide/waiting-list surface instead: for PL, the locale home's destinations section anchor; for the six guide countries, the same, with the onboarding line. Concretely: no `action` to a non-200 URL, no client navigation to a route that does not exist, and the target resolution lives in one helper (`finderTarget(locale, iso)`) whose Phase-0 branch returns the on-page anchor and whose published branch returns the corridor path — the branch is unit-tested both ways so 007 flips data, not code. Town/postcode is optional (price depends on the country); the date field defaults to the soonest possible date and the cutoff sentence sits under the button, both through spec 003's `format.ts` (`fo/no-adhoc-intl` must stay clean — no `Intl` call here, and no date **arithmetic**: occasion/cutoff computation is spec 009's, so Phase 0 shows the canvas's static "order by 14:00 Warsaw time" copy as a message key, not a computed cutoff). Four-fact proof row is the canvas's four claims verbatim (7-day freshness guarantee / Made by a florist in their town / The price you see is final / Photo on delivery) — the `Photo on delivery` fact is a promise about the service, not a claim that a photo is shown, and it must not render a photo. Tests: T-13, and the finder + hero states in `/dev/components`. Design round 7: the country field is a plain type-ahead — as the user types, the matching country name appears beneath the field; no status column, no footnote, no pills. Status (live vs guide) is communicated after selection, in the button line and on the destinations grid.

## Read

- `specs/004-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `docs/design/homepage-v1/README.md`
- `docs/design/homepage-v1/tokens.css`
- `docs/design/homepage-v1/homepage-desktop.dc.html`
- `docs/design/homepage-v1/homepage-mobile.dc.html`
- `docs/design/homepage-v1/identity.dc.html`
- `content/brand/mark.svg`
- `plan/10`
- `src/app/`
- `src/config/locales.ts`

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Result

Done. PR [#40](https://github.com/itsahmeds/flowers-overseas/pull/40); `/review` pass recorded in `TASKS.md`.
