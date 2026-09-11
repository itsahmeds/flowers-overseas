# TASK-079 — Media loader, `Photo`'s asset path and the honesty note: `src/modules/ui/media/` — `manifest.ts`, the `slots.ts` extension, `staticVariantLoader` + `resolveLoader()`, `Photo`'s asset path with the placeholder fallback, `preload.ts` (the single LCP candidate and its matching `<link rel="preload">`), `MediaProvenanceNote`, and the gallery/placeholder/note states in `/dev/components`

Row: `TASKS.md` → TASK-079. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-079-media-loader-photo-provenance`. Spec 006 §13's 2026-09-09 resolution note is binding: Q1 AI-generated under the locked style guide or free-licence stock (CC0 / public-domain / Unsplash-licence class, never paid stock); Q2 names stay English, descriptors localise; Q3 12 products x 2 assets plus the homepage slots; Q4 <=6 MB derived bytes committed until R2; Q5 AVIF+WebP at seven widths plus one 1200 px JPEG per asset for OG/email; Q6 originals in the founder's store plus a git-ignored `.local/imagery/originals/`; Q7 `fo-media` / `fo-media-preview` / `fo-backups`, `media.flowersoverseas.com`; Q8 both lawyer questions on the October legal-drafts list, label ships now; Q9 founder signs off against the §2.4 checklist; Q10 spec 002 task 10 reads `seed/data/`; Q11 the seven media columns fold into `0003` (spec 002 §14 A1); Q12 watermark mechanism kept, no watermarked asset in Phase 0. Depends on TASK-052 for spec 004's `Media` wrapper, `slots.ts` and `placeholderLoader` — **do not dispatch this while TASK-052…TASK-056 are in flight**, it is the same module. Design source of truth (match pixel-for-pixel): `docs/design/homepage-v1/README.md`, `docs/design/homepage-v1/tokens.css`, `docs/design/homepage-v1/homepage-desktop.dc.html`, `docs/design/homepage-v1/homepage-mobile.dc.html`, `docs/design/homepage-v1/identity.dc.html`, `content/brand/mark.svg`. **AC-2 is the R2-flip proof**: swapping `staticVariantLoader` for a fake `VariantLoader` changes every rendered image URL with **zero** changes outside `src/modules/ui/media/`. The manifest is a plain typed build-time import — **no runtime fetch, no database, no `sharp` in the bundle**. **AC-18 is the accessibility and honesty rule in one**: `Photo` renders an `<img>` **only** when the asset is approved, has variants **and** has alt text for the resolved locale; with any of the three missing it renders spec 004's placeholder box with its caption and **no `<img>`** — so a missing Polish alt degrades to a placeholder instead of shipping an English alt on a Polish page (WCAG 1.1.1 + 3.1.2, `plan/07` §8). `alt` is **data, never generated at render**, never empty on a product image and never derived from the product name. **AC-19**: exactly one `priority` candidate per page, its `<link rel="preload" as="image" imagesrcset imagesizes>` emitted from the *same* manifest lookup that produced the `srcset` so the two cannot disagree, and a two-`priority` fixture page **fails** the test; nothing eager above the LCP candidate. **AC-17**: `MediaProvenanceNote` renders "example arrangement · your florist hand-makes each one" as a **message key** whenever any displayed asset has `source: "ai"`, server-rendered and crawlable (so the structured data and the visible page agree, `plan/02` §15), in all four locales pre-hydration, absent on a page with no image, and **not suppressible — the component's prop type admits no such flag** (ADR-0014's condition, UCPD/CRD and UK DMCC misleading-action risk, `plan/07` §2.1/§2.2). Photographs are **never** mirrored: assert no `Photo` output carries `@utility mirror-in-rtl` (§7). `sizes` per `plan/01` §6 (hero 100vw, grid 50vw/33vw/25vw, thumb 96 px); AVIF-first `srcset` with WebP fallback; `loading="lazy"` + `decoding="async"` below the fold; fixed aspect-ratio boxes and logical properties only (`fo/no-physical-css`). `/media/*` served `Cache-Control: public, max-age=31536000, immutable` from `next.config.ts`; a changed image is a **new asset version, never a mutated URL**. **Note for spec 007 (recorded here and in `docs/runbooks/imagery.md`, TASK-081):** when 007 lifts `Disallow: /`, `/media/*` and later the R2 host **must stay crawlable** or Google cannot fetch the images it evaluates for Core Web Vitals — blocking it is the classic own-goal. Gates: `lint`, `typecheck`, `test-unit`, `build`, `budget:client-js`, `test:e2e`, `test:a11y`, `test:visual`. Tests: T-02, T-17, T-18, T-19.

## Read

- `specs/006-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `seed/data/`
- `docs/design/homepage-v1/README.md`
- `docs/design/homepage-v1/tokens.css`
- `docs/design/homepage-v1/homepage-desktop.dc.html`
- `docs/design/homepage-v1/homepage-mobile.dc.html`
- `docs/design/homepage-v1/identity.dc.html`
- `content/brand/mark.svg`
- `src/modules/ui/media/`
- `plan/07`
- `plan/02`
- `plan/01`
- `docs/runbooks/imagery.md`

## Carry-forwards

- **From `/review 42` (2026-09-09):** two slot vocabularies now exist — `seed/schema/media.ts` `mediaSlots` (`hero`, `occasionTile`, `productHero`, `productDetail`, used by `seed/data/media.json`) and `src/modules/ui/media/slots.ts` `MEDIA_SLOTS` (`hero`, `grid`, `tile`, `thumb`, from TASK-052). This task, where the loader meets the manifest, must map or unify them once and pin the mapping with a test; neither side may be renamed silently.
- **From `/review 41` (spec 006 §14 A2):** bring `docs/design/wireframes/product-{desktop,mobile}.dc.html` and `docs/design/flows/buyer-journey.dc.html` into step with the first-person honesty label ("our florist") that `country-shop-*.dc.html` already carry.

## Escalations

_None recorded._

## Result

Done. PR [#49](https://github.com/itsahmeds/flowers-overseas/pull/49); `/review` pass recorded in `TASKS.md`.
