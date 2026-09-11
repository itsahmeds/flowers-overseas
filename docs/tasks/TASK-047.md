# TASK-047 — Phase-0 data registries as config with zod and projections: `src/config/countries.ts` (7 destinations, per-locale slug, name key, `corridorPagePublished`, `guidePublished`, `status`), `src/config/site-links.ts` (every header/footer/category target with owning spec and `published`), `src/config/categories.ts` (the canvas category row), `src/config/company.ts` (`registered: false` colophon identity), `CountryConfigSchema` / `SiteLinkSchema` / `CategoryConfigSchema` / `CompanySchema`, `toCountryRow()`, `isPublished()`, and the `nav` / `footer` / `company` / `destinations` message namespaces

Row: `TASKS.md` → TASK-047. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-047-config-registries`. Spec §12 task 3 split: the data layer lands before the two chrome tasks so header and footer are pure consumers and can be implemented in parallel. Spec §13's 2026-09-08 resolution note is binding and overrides §5 defaults where they differ. Follows spec 003's precedent exactly (`src/config/locales.ts`): zod-parsed at module load, `pnpm check:no-db` clean, one predicate per flag, `toCountryRow()` pinned by a unit test to spec 002 §5.1's `country` columns that exist in Phase 0 (`iso2`, `status`, `guide_published`) so TASK-015/TASK-026 seed from the projection and the two cannot drift. Destinations per §13 Q12: PL (`status: 'live'`, delivering now) plus DE, FR, ES, IT, RO, NL (`guide · waiting list`) — the canvas's destinations grid renders exactly these seven with those two states. `categories.ts` carries the canvas category row verbatim (Best sellers · Birthday · Sympathy · Occasions · Bouquets · Roses · Plants · Add-ons · Same-day delivery · Destinations) **each with `published: false` and the owning spec (005/008/009/011)**, so in Phase 0 the row renders as non-link text per the design's own rule and becomes navigation when 008 flips the flags — no template edit (`plan/09`'s "a new country is data" applied to the nav). `company.ts` holds the colophon copy the canvas shows as `[COMPANY LEGAL NAME], [REGISTERED ADDRESS], [REGISTRATION NO]`: `registered: false`, trading name + contact channel only, registry/VAT/address optional and refined so `registered: true` requires all three (the OÜ does not exist until `plan/09` 1 Nov; inventing a number is a `plan/07` §6 offence). `docs/architecture.md` §2 gains the four config files in this PR. Design source of truth (match pixel-for-pixel): `docs/design/homepage-v1/README.md`, `docs/design/homepage-v1/tokens.css`, `docs/design/homepage-v1/homepage-desktop.dc.html`, `docs/design/homepage-v1/homepage-mobile.dc.html`, `docs/design/homepage-v1/identity.dc.html`, `content/brand/mark.svg`. Tests: T-03, plus the `toCountryRow` column pin and a `CompanySchema` refinement fixture; T-31 keys land here and are gated by TASK-056.

## Read

- `specs/004-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `src/config/locales.ts`
- `plan/09`
- `plan/07`
- `docs/architecture.md`
- `docs/design/homepage-v1/README.md`
- `docs/design/homepage-v1/tokens.css`
- `docs/design/homepage-v1/homepage-desktop.dc.html`
- `docs/design/homepage-v1/homepage-mobile.dc.html`
- `docs/design/homepage-v1/identity.dc.html`
- `content/brand/mark.svg`

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Result

Done. PR [#29](https://github.com/itsahmeds/flowers-overseas/pull/29); `/review` pass recorded in `TASKS.md`.
