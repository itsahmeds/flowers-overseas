# TASK-059 — Living design system and prototype in the repository: `docs/design/` becomes the design source of truth every design and implementer agent reads — `README.md` index and rules, `system/` (tokens + every shipped primitive and its states, kept in step with `src/modules/ui`), `flows/` (Phase 0 buyer journey home → destination → shop → PDP → checkout → confirmation → track, and the florist journey for-florists → application → vendor inbox, as annotated flow artboards), `wireframes/` (one artboard per Phase 0 page type in `plan/05-page-inventory.md` §1–§2 at desktop and mobile, in the approved system), `canvas.json` for the whole set, published to the founder's design canvas; a `docs.test.ts` pin that every UI spec names its design files

Row: `TASKS.md` → TASK-059. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-059-living-design-system`. Founder, 2026-09-09: "maintain a full design system/prototype as well in HTML in the code … so design agents always know the design. full user flow journey etc etc wireframe and everything." Extends `docs/design/homepage-v1/` (approved) rather than replacing it; the homepage artboards move under `docs/design/` unchanged in content. Every later UI spec (007–012) adds its wireframes here **before** `/plan-tasks`, and implementers match the artboards pixel-for-pixel — recorded as a CLAUDE.md rule. Wireframes for unbuilt pages are wireframes (structure, copy slots, states), not final art; the founder reviews them on the canvas before the owning spec is approved. Delivered 2026-09-09 on PR #32: `docs/design/README.md` (index, authoring rules, honesty rules, the Phase 0 page-type → wireframe table); `system/` (canonical `tokens.css` + components, typography, colour sheets); `flows/` (buyer, florist, consent-and-locale); `wireframes/` (20 Phase 0 page types × 1440 and 390 = 40 artboards); root, `flows/` and `wireframes/` `canvas.json`; `tests/unit/design-docs.test.ts` as the pin (92 assertions: Phase 0 coverage at both widths, no colour literal or undeclared token in any `.dc.html`, every canvas entry resolves, no overlap). Also fixed `homepage-v1/canvas.json`, which named three files that do not exist. Four documented sheet-vs-code differences, all resolved in favour of the code. Not wireframed and why: `plan/05` rows 5, 11, 12, 15–18, 23, 24 (Phase 1–4 variants of drawn templates); 26, 27, 30, 31, 37–40 (need data we do not have); 55–59 (authenticated / internal, admin awaits spec 012); 60–67 (not pages).

## Read

- `specs/004-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `docs/design/homepage-v1/`
- `docs/design/`
- `docs/design/README.md`
- `tests/unit/design-docs.test.ts`
- `plan/05`

## Carry-forwards

- **From `/review 53` round 3:** the dates band renders 106 vs the artboard's 97 px because the artboard uses an off-scale 22 px padding and unstyled `normal` line-height — founder canvas question: snap the drawing to `--space-lg`/the body line-height token, or add a token; at 1280 the date labels wrap (artboard is a 1440 drawing).
- **From `/review 55` (TASK-055):** `components.dc.html` lacks the notice shell and `LiveRegion` — add both; **orchestrator ruling on `/review 40`'s `<h1>` finding:** option (b) — keep `--text-display-s` at 28→42 and give the homepage hero its own display step (`--text-display-hero` 34→46) in `tokens.css`, `globals.css` and the artboards' inline sizes, so no approved wireframe restyles.

## Escalations

_None recorded._

## Result

_Pending._
