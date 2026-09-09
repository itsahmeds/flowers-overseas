# `docs/design/` — the living design system

**This directory is the design source of truth for Flowers Overseas** (`CLAUDE.md`; spec 004 §14 A3;
TASK-059). Every UI spec adds its flows and wireframes here as `.dc.html` artboards **before**
`/plan-tasks` runs; implementers match them; no page is built from a description alone.

Everything here is static hand-written HTML with inline styles. Nothing is built, bundled or
imported by the application, and nothing under `src/` reads it — the relationship runs the other
way: `src/modules/ui` is the implementation of `system/`, and `system/` is edited when `src/` is.

## The folders

| Folder | What it is | Who edits it |
|---|---|---|
| `homepage-v1/` | The founder-approved homepage, identity and token file from the 2026-09-08 review. **The finished direction**, not a wireframe: every other artboard is drawn in the system it establishes. Extended, never rewritten; its `tokens.css` is kept as the historical record. | the founder's design review |
| `system/` | `tokens.css` (canonical), `components.dc.html` (every shipped primitive at every state), `typography.dc.html` (ramp, measure, script coverage), `colour.dc.html` (palette, semantic aliases, contrast manifest). | whoever changes `src/modules/ui` |
| `flows/` | `buyer-journey.dc.html`, `florist-journey.dc.html`, `consent-and-locale.dc.html` — screen-thumbnail flows annotated with the decision points, the trust moments and the data each step reads. | the spec that changes a journey |
| `wireframes/` | One desktop (1440) and one mobile (390) artboard per Phase 0 page type. Structural, in the approved system: grey photo slots, real registry copy where it exists, `[slot]` markers where it does not, every state and empty state shown. | the spec that owns the page |
| `canvas.json` (root) | Every artboard in the directory, laid out in labelled rows by folder, for the founder's design canvas. `flows/` and `wireframes/` carry their own so a subset can be published alone. | whoever adds an artboard |

## How an artboard is authored

The format is Claude Design's **Design Component** (`.dc.html`), and the conventions come from
`homepage-v1/`:

1. **One self-contained HTML file per artboard.** `<x-dc>` wraps a `<helmet>` (the font link and one
   `<style>` block) and a single root `<div>` whose `width` and `min-height` are the artboard's
   pixel size. No imports, no shared stylesheet, no JavaScript, no images.
2. **Colour comes only from the token custom properties.** The `:root` block at the top of each file
   declares them; every declaration below references `var(--color-…)`. A hex, `rgb` or `hsl` literal
   anywhere under `docs/design/` except the two `tokens.css` files fails
   `tests/unit/design-docs.test.ts`.
3. **Inline styles, logical properties.** `padding-inline`, `margin-block-start`, `border-inline-end`
   — never `left`, `right`, `margin-left`. The same rule the application is linted for, so an
   artboard can be read as a template.
4. **Two widths, and only two.** Desktop artboards are **1440** wide with 56 px inline padding;
   mobile artboards are **390** wide with 16 px. Those are the two ends of the shipped `clamp()` type
   scale, which is why there is no tablet artboard: the type between the two widths is interpolated,
   not designed.
5. **`canvas.json` places it**: `{ file, title, x, y, w, h }`, ≥80 px between artboards in a row and
   ≥120 px between rows, plus `annotations` for the row labels and `launch.view: "canvas"`.
6. **Every flow and wireframe artboard opens with an annotation block** — purpose, URL, index status,
   the data it reads, the states, and the owning spec. It is the first thing in the file and the
   first thing on the canvas, because an artboard without it is a picture rather than a
   specification.

### The honesty rules an artboard must keep

These are `plan/10` §3, `plan/07` §7 and spec 004 AC-15 applied to design work, and they are the
reason a reviewer can trust a wireframe:

- **No photograph we do not have.** Every image is the `--color-photo` gradient with a caption
  saying what the slot will hold. No `<img>`, no stock photo, no placeholder service.
- **No invented number.** No florist count, no delivery count, no rating, no "200+ partners". A
  number we do not have is the `Placeholder` bar (`.ph`), which renders no digits at all.
- **No fabricated trust.** Zero reviews, zero testimonials, zero partner logos, zero press strip.
  Reviews are real-only (founder decision, 2026-09-08; EU UCPD/Omnibus).
- **No invented copy where real copy exists.** If a string is in `messages/en.json` or a registry in
  `src/config/`, the artboard uses it verbatim. If it does not exist, it is marked `[slot]` and the
  annotation says which spec owns it.
- **White paper, one accent.** `--color-paper` ground, forest green accent, Newsreader display +
  IBM Plex Sans body. A wireframe is drawn in the approved system, not in grey boxes.

## How implementers use this directory

1. `/implement TASK-XXX` — read the spec, then read the two artboards its page names in the table
   below (desktop and mobile) and the flow artboard its step appears on.
2. Build from `system/` primitives. If a state you need is not on `system/components.dc.html`, it is
   not in `src/modules/ui` either: that is a spec question, not a licence to invent one.
3. Match the artboard's structure, order, copy and states. Where the artboard shows a `[slot]`, the
   spec must say what goes there; if it does not, stop and escalate rather than writing copy.
4. Where the artboard and the shipped code disagree, the artboard is wrong until the founder says
   otherwise — but say so in the PR, and fix the artboard in the same PR. A stale artboard is worse
   than no artboard.

## How a new UI spec adds its wireframes

Before `/plan-tasks` will break a spec into tasks:

1. Add one desktop and one mobile artboard per page type the spec introduces, under `wireframes/`,
   named `<page-slug>-desktop.dc.html` and `<page-slug>-mobile.dc.html`.
2. Extend or add the `flows/` artboard if the spec changes a journey.
3. Update `system/` if the spec adds a primitive or a state — and update `src/modules/ui` in the
   same PR, in whichever direction the change is travelling.
4. Add every artboard to `wireframes/canvas.json` and to the root `canvas.json`, and add its row to
   the table below.
5. The founder reviews the artboards on the canvas. **Approval of the wireframes is part of approval
   of the spec**, which is what makes "implementers match the artboards" a reasonable instruction.

## Keeping the sheet and the code in step

`system/` and `src/modules/ui` are two views of one thing, and the contract is bidirectional:

- **If a state exists in code it exists on the sheet.** Every member of `BUTTON_VARIANTS`,
  `BUTTON_SIZES`, `BUTTON_STATES`, `CHIP_TONES`, `PHOTO_RATIOS`, `DISPLAY_SIZES`, `TEXT_SIZES`,
  `TEXT_TONES`, `GAPS`, `CONTAINER_WIDTHS`, `ICON_NAMES` and `MIRRORED_IN_RTL` is drawn on
  `system/components.dc.html` or `system/typography.dc.html`.
- **Nothing on the sheet is missing from code.** There is no variant, tone, ratio or size on the
  sheet that `src/modules/ui` does not export. The sheet is a mirror, not a wish list — a component
  that should exist but does not belongs in a spec.
- **`system/tokens.css` is the canonical token list; `src/app/globals.css` is the canonical token
  value.** The names must match; the values live in the `@theme` block because that is the one place
  in the repository a colour may be written, and `tests/unit/contrast.test.ts` computes every
  contrast ratio from it. `homepage-v1/tokens.css` is a frozen subset kept as the approved record.
- **`/dev/components`** (the running gallery, `ENABLE_DEV_UI=true`) is the same content as
  `system/components.dc.html` rendered by the real components. The artboard is for reviewing on the
  canvas; the gallery is the axe and visual-regression surface. They are expected to look identical.

### Where the sheet and the code currently differ

| Difference | Which is right | Note |
|---|---|---|
| `homepage-v1/tokens.css` has no status colours, no semantic aliases, no `--color-accent-strong`, no separate photo stops, no radius/shadow/motion/layer scales, and fixed rather than fluid type steps. | the code | Spec 004 added all of them on top of the approved ramp. `system/tokens.css` is the superset and is the file to read; `homepage-v1/tokens.css` stays as the 2026-09-08 record. |
| Spacing is `--space-*` on the canvas and `--spacing-*` in code. | both | Same seven values. `system/tokens.css` declares both names so a reader of either file recognises the other; Tailwind's theme namespace requires `--spacing-*`. |
| The canvas's "medium" weight is 500; the shipped `--font-weight-medium` is **600**. | the code | Only two IBM Plex Sans faces ship (400, 600) to stay inside the 45 KB font budget, so 500 would be matched down to 400. The artboards are drawn at 600 where a canvas file says 500. |
| The canvas's `.photo` caption ink is written inline as an `oklch()` value. | the code | It is `--color-photo-ink` in `globals.css` and a contrast-manifest pair. New artboards use the token. |

## Phase 0 page types → wireframes

Every row of `plan/05` §1 and §2 whose Phase column is 0. Rows outside §1–§2 that Phase 0 also needs
(the florist set, the legal template, the error pages) are listed after the table.

| plan/05 # | Page type | Wireframe artboards | Owning spec |
|---|---|---|---|
| 1 | Locale chooser | `wireframes/locale-chooser-desktop.dc.html` · `wireframes/locale-chooser-mobile.dc.html` | 003 (shipped) |
| 2 | Locale home | `homepage-v1/homepage-desktop.dc.html` · `homepage-v1/homepage-mobile.dc.html` | 004 (approved direction) |
| 3 | All destinations | `wireframes/all-destinations-desktop.dc.html` · `wireframes/all-destinations-mobile.dc.html` | 007 |
| 4 | Corridor: country (guide and live states) | `wireframes/corridor-country-desktop.dc.html` · `wireframes/corridor-country-mobile.dc.html` | 007 |
| 6 | Country shop root | `wireframes/country-shop-desktop.dc.html` · `wireframes/country-shop-mobile.dc.html` | 008 |
| 7 | Country category | `wireframes/country-category-desktop.dc.html` · `wireframes/country-category-mobile.dc.html` | 008 |
| 8 | Country occasion | `wireframes/country-occasion-desktop.dc.html` · `wireframes/country-occasion-mobile.dc.html` | 008 |
| 9 | Product (country-scoped) | `wireframes/product-desktop.dc.html` · `wireframes/product-mobile.dc.html` | 009 |
| 10 | Category hub (destination-less) | `wireframes/category-hub-desktop.dc.html` · `wireframes/category-hub-mobile.dc.html` | 008 |
| 13 | Occasion hub | `wireframes/occasion-hub-desktop.dc.html` · `wireframes/occasion-hub-mobile.dc.html` | 008 |
| 14 | Occasions index | `wireframes/occasions-index-desktop.dc.html` · `wireframes/occasions-index-mobile.dc.html` | 008 |
| 19 | Checkout (3 steps, demo guard) | `wireframes/checkout-desktop.dc.html` · `wireframes/checkout-mobile.dc.html` | 010 |
| 25 | How it works | `wireframes/how-it-works-desktop.dc.html` · `wireframes/how-it-works-mobile.dc.html` | 007 |
| 28 | Guarantee & substitution | `wireframes/guarantee-and-delivery-desktop.dc.html` · `wireframes/guarantee-and-delivery-mobile.dc.html` | 007 |
| 29 | Delivery information | `wireframes/guarantee-and-delivery-desktop.dc.html` · `wireframes/guarantee-and-delivery-mobile.dc.html` | 007 |
| 32 | FAQ / help | `wireframes/about-contact-help-desktop.dc.html` · `wireframes/about-contact-help-mobile.dc.html` | 007 |
| 33 | About | `wireframes/about-contact-help-desktop.dc.html` · `wireframes/about-contact-help-mobile.dc.html` | 007 |
| 34 | Contact | `wireframes/about-contact-help-desktop.dc.html` · `wireframes/about-contact-help-mobile.dc.html` | 007 |
| 35 | Blog index | `wireframes/blog-desktop.dc.html` · `wireframes/blog-mobile.dc.html` | 007 |
| 36 | Blog post | `wireframes/blog-desktop.dc.html` · `wireframes/blog-mobile.dc.html` | 007 |

Three pairs cover two page types each — guarantee with delivery information, about with contact and
help, blog index with blog post — because in each case the two pages share one template and differ
only in content. Both are drawn on the shared artboard, labelled, so an implementer sees the
template and its variants together rather than inferring one from the other.

### Also wireframed, from outside §1–§2

| plan/05 # | Page type | Wireframe artboards | Owning spec |
|---|---|---|---|
| 41, 42, 43 | For florists: landing, application, walkthrough | `wireframes/for-florists-desktop.dc.html` · `wireframes/for-florists-mobile.dc.html` | 011 |
| 45 | Demo vendor inbox (mock) | `flows/florist-journey.dc.html` (steps 03–04) | 011 |
| 46–51, 54 | Legal page template: terms, privacy, cookies + settings, cancellation, Impressum, company information | `wireframes/legal-template-desktop.dc.html` · `wireframes/legal-template-mobile.dc.html` | 007 + founder/lawyer content |
| 68 | 404 / 410 / 500 | `wireframes/errors-desktop.dc.html` · `wireframes/errors-mobile.dc.html` | 003 (shipped) + 004 |
| 20, 21, 22 | Order confirmation, track order, track lookup — **Phase 1** in `plan/05`, drawn now because the 16 October demo shows them and because designing them after the checkout is how the two disagree | `wireframes/confirmation-desktop.dc.html` · `wireframes/confirmation-mobile.dc.html` · `wireframes/track-order-desktop.dc.html` · `wireframes/track-order-mobile.dc.html` | 010 · 015 |

### Deliberately not wireframed

| plan/05 # | Page type | Why not |
|---|---|---|
| 5, 11, 12, 15–18, 23, 24 | Corridor city, flower-type hub, colour landing, add-ons & gifts, search, faceted listing, basket, recipient landing, gift card | Phase 1–4. Each is a variant of a template that **is** drawn here (city = corridor, flower-type = category hub, facets = shop root with a noindex header, basket = the checkout's editable summary as its own page), and each is noted as such on the artboard it varies from. Drawing them now would be designing against specs that do not exist. |
| 26, 27, 30, 31, 37–40 | Our florists, florist profile, reviews, deliveries gallery, blog topic, author, care guide, occasion calendar | Phase 1–2, and every one of them needs data we do not have: real partners, real reviews, real consented delivery photos, five posts. A wireframe of a reviews page in Phase 0 would have to invent the reviews. |
| 55–59 | Authenticated surfaces: login, customer account, admin, vendor portal, vendor magic-link actions | Phase 1+ and internal. The one Phase 0 authenticated-ish surface — the mock vendor inbox — is drawn on `flows/florist-journey.dc.html`. Admin (spec 012) gets its own artboards when it is specified; a design system for an internal tool is a different problem from a design system for a shop. |
| 60–67 | Sitemaps, robots, webhooks, cron, health, consent API, tracking JSON, `security.txt` | Not pages. Nothing renders. |

## Related

- `content/brand/mark.svg` — the production brand asset (hex equivalents of the tokens, for a
  favicon, an email or a partner pack). `src/modules/ui/icons/Mark.tsx` is what the site renders,
  and a unit test pins the two against each other geometry by geometry.
- `src/app/(dev)/dev/components/` — the running component gallery.
- `tests/unit/design-docs.test.ts` — the pin: the table above covers every Phase 0 §1–§2 row and
  every file it names exists, no `.dc.html` writes a colour literal, and every `canvas.json` entry
  points at a real file.
- `specs/004-design-system-layout.md` §2, §5, §13, §14 A3 — the spec this directory serves.
- `plan/05-page-inventory.md` §1–§2 — the page inventory the wireframe table maps.
