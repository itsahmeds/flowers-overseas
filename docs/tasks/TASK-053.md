# TASK-053 — Locale-home part 2 — occasion tiles, the relay explainer and the trust strip: "Shop by occasion" tile grid from config, the three-step "How a relay works" section with its guarantee link, `TrustStrip` (three true claims), `home.*` and `trust.*` messages, and the honesty gates

Row: `TASKS.md` → TASK-053. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-053-home-occasions-relay-trust`. Spec §13's 2026-09-08 resolution note is binding and overrides §5 defaults where they differ. Design source of truth (match pixel-for-pixel): `docs/design/homepage-v1/README.md`, `docs/design/homepage-v1/tokens.css`, `docs/design/homepage-v1/homepage-desktop.dc.html`, `docs/design/homepage-v1/homepage-mobile.dc.html`, `docs/design/homepage-v1/identity.dc.html`, `content/brand/mark.svg`. Occasion tiles are the canvas's six tiles (Birthday · Name day "Imieniny, the Polish tradition" · Anniversary · Sympathy · Just because · New baby), each a photo slot + title + one-line subtitle, driven by a new `src/config/occasions.ts` in the TASK-047 shape (per-locale slug, name/subtitle message keys, `published: false`, owning spec 008) — so the tiles render as text-and-placeholder cards, **not** links, until 008 publishes the occasion pages, and the grid comes from TASK-045's `Grid` primitive (2-up mobile, 3-up desktop per the artboards). Photography is a placeholder until the founder supplies imagery: every `.photo` box in the canvas renders the `--color-photo` token gradient with its uppercase caption and **no `<img>`** (`plan/10` §3 honesty rule); the consolidated "photo slots" list is part of TASK-053's PR body. Relay explainer is the canvas's `01/02/03` section with its full sentences and the "Read the guarantee in full" control (unpublished target → text, not a link). `TrustStrip` carries the §2/A6 three claims with the guarantee name as its own key (`trust.guarantee.name`) so a rename is a catalogue edit. **AC-10 closes here** — with this PR the locale home is `H1` + proposition + finder/picker + how-it-works + trust strip in all four locales, one `<h1>`, named `banner`/`main`/`contentinfo` landmarks, hero slot present with no `<img>`. **AC-15 is the Phase 0 AC 6 gate and this is the task that can break it:** no review, rating, star, testimonial, review count, Trustpilot mark, partner name, partner photo, delivery-photo claim or florist count anywhere rendered, asserted over all four locale homes and the footer plus a repo grep of `messages/en.json` for the forbidden shapes — note for the reviewer that `common.floristCount` keeps its `retained: true` flag precisely because nothing renders it. **AC-16**: no JSON-LD, canonical or hreflang from any 004 page; `alternatesFor()`/`isLocaleIndexable()` answers unchanged except the recomputed unreviewed share, which keeps `de`/`pl` non-indexable — the honest answer while their copy is a machine draft. The consolidated **"photo slots" list** (hero, six occasion tiles, trending row, review section, delivery-photo band, with the caption and aspect ratio each one expects) is part of this PR's body — it is the shopping list the founder shoots against. Tests: T-12, T-17, T-18. Design round 6: also ship the "Coming up in Poland" occasion-date strip (real dates + order-by cutoffs from config) and the five-question FAQ section (`faq.*` messages, `<details>`).

## Read

- `specs/004-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `docs/design/homepage-v1/README.md`
- `docs/design/homepage-v1/tokens.css`
- `docs/design/homepage-v1/homepage-desktop.dc.html`
- `docs/design/homepage-v1/homepage-mobile.dc.html`
- `docs/design/homepage-v1/identity.dc.html`
- `content/brand/mark.svg`
- `src/config/occasions.ts`
- `plan/10`
- `messages/en.json`

## Carry-forwards

- **Inherited from `/review 27` (nit 3):** `/de` LCP is 2.5–2.9 s and its LCP element is the spec-003 language-suggestion banner island (~2.4 s render delay), so the LCP fix belongs to whichever of this task's hero/`Media` work or TASK-056's budget flip touches that island — measure `/de` before and after the hero lands. **Linux visual baselines — orchestrator ruling (`/review 30`, 2026-09-09):** `linux/` baselines (`en`, `de`, `ar-XB`, `footer-*`) are refreshed once from a single `ci:full` visual-job artifact after TASK-048, TASK-049 and TASK-052 have merged — owned by TASK-053's PR (orchestrator adds the label). No task produces them alone. **Dependency added 2026-09-09:** runs after TASK-085 (option (b)), so the trending/occasion sections are measured against a provider-free document.
- **From `/review 40`:** `home.hero.photoCaption` uses the desktop caption at both breakpoints; the mobile artboard has its own shorter caption ("Photography to supply · Warsaw florist, morning light") — fix in the consolidated photo-slot list.
- **From `/review 41`:** `media.placeholder.delivery` ("the delivery photo we send you") asserts a spec 027 consent-gated feature; resolve the caption's wording before the delivery band renders it.

## Escalations

_None recorded._

## Result

Done. PR [#53](https://github.com/itsahmeds/flowers-overseas/pull/53); `/review` pass recorded in `TASKS.md`.
