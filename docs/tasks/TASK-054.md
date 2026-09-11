# TASK-054 — Locale-home part 3 — the data-gated rows and the destinations grid: "Most sent this week" trending row (florists' picks, labelled, gated on real orders), the verified-reviews section (hidden until real reviews exist, Trustpilot slot), the destinations grid with live/guide status, the "Somewhere else?" waiting-list block, and the AC-14 link crawl

Row: `TASKS.md` → TASK-054. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-054-home-gated-rows-destinations`. Spec §13's 2026-09-08 resolution note is binding and overrides §5 defaults where they differ. Design source of truth (match pixel-for-pixel): `docs/design/homepage-v1/README.md`, `docs/design/homepage-v1/tokens.css`, `docs/design/homepage-v1/homepage-desktop.dc.html`, `docs/design/homepage-v1/homepage-mobile.dc.html`, `docs/design/homepage-v1/identity.dc.html`, `content/brand/mark.svg`. This task ships the three sections the founder's design gates on data that does not exist, and the gating **is** the deliverable: each reads a static JSON/config stub behind the same provider seam spec 003 used for the locale registry (`TrendingProvider`, `ReviewsProvider`, `DestinationStatusProvider` in `src/modules/ui/`, each with a `staticProvider` now and a spec-002-backed implementation later), so spec 002/008/016 swap the provider inside the module with **zero call-site change** and a fake provider in a test proves the populated branch renders. Rules per the canvas and Phase 0 AC 6: **Trending** renders the florists' picks with the verbatim label "Ranking is by real orders in the last 7 days and switches on once we have them; until then this row shows the florists' picks and says so" — and because 004 knows nothing about products and shows no price (§3), the cards are photo-slot + name + "starting at" **without a figure**, or the row degrades to named picks only; the reviewer decides which of the two is honest and records it. Prices, `Offer` data and the "Bouquets for Poland" product row of the canvas are **out of scope** (005/008/009) and must not be approximated. **Verified reviews** renders **nothing** in Phase 0 — the component exists, its populated branch is covered by a fake provider and the gallery, the Trustpilot slot is a named empty region, and the placeholder rows drawn on the canvas (`[Buyer first name] · sent to Warszawa · [date]`) must never reach a rendered page (AC-15 would fail, and TASK-053 owns that assertion). **Destinations grid**: PL `Delivering now` with its five city names as text, the six guide countries as `Guide · waiting list`, all from `countries.ts`, none of them a link while unpublished; the "Somewhere else?" block is copy only — no email input, because a waiting-list form is a new personal-data flow and a RoPA row (010/016 own it), and shipping an inert input would be a dark pattern. **AC-14 closes here**: an e2e crawl of every `<a href>` in the header, footer and home of all four locales plus `/` finds zero non-200 targets and zero unpublished `site-links.ts` ids; `robots.txt` still `Disallow: /`; localised documents still `noindex,nofollow` and `/` still `noindex,follow`. Photography is a placeholder until the founder supplies imagery: every `.photo` box in the canvas renders the `--color-photo` token gradient with its uppercase caption and **no `<img>`** (`plan/10` §3 honesty rule); the consolidated "photo slots" list is part of TASK-053's PR body. Tests: T-16, plus fake-provider tests for all three populated branches and their gallery states. Design round 7: "Meet the florists" REMOVED by the founder (we are the florists to the buyer; partners stay behind the scenes) — do not build it. Founder ruling 2026-09-08: reviews are real-only, never seeded — enforced by the AC-15 honesty gate.

## Read

- `specs/004-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `docs/design/homepage-v1/README.md`
- `docs/design/homepage-v1/tokens.css`
- `docs/design/homepage-v1/homepage-desktop.dc.html`
- `docs/design/homepage-v1/homepage-mobile.dc.html`
- `docs/design/homepage-v1/identity.dc.html`
- `content/brand/mark.svg`
- `src/modules/ui/`
- `plan/10`

## Carry-forwards

- **From `/review 40`:** `FinderTypeahead`'s `aria-describedby="destinations"` points at the whole section (~200 words on every focus) — point it at a purpose-written `sr-only` summary when this task inherits the id; the finder's `get` form submits the localised display name (`country=Poland`), not `iso2` — decide the contract with spec 007 before building on it.
- **From `/review 53` (TASK-053):** restore the artboard's 6-up desktop occasion grid (keep 2-up mobile) — the 3-up rendering leaves six ~430 px empty placeholder squares; ship the mobile hero caption variant ("Photography to supply · Warsaw florist, morning light").

## Escalations

_None recorded._

## Result

_Pending._
