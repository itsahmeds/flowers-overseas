# `docs/design/` — the living design system

**This directory is the design source of truth for Flowers Overseas** (`CLAUDE.md`; spec 004 §14 A3;
TASK-059). Every UI spec adds its flows and wireframes here as `.dc.html` artboards **before**
`/plan-tasks` runs; implementers match them; no page is built from a description alone.

Everything here is static hand-written HTML with inline styles. Nothing is built, bundled or
imported by the application, and nothing under `src/` reads it — the relationship runs the other
way: `src/modules/ui` is the implementation of `system/`, and `system/` is edited when `src/` is.

## The identity: v2, "the letter home" (locked 2026-10-03)

The founder locked the look on 2026-10-03: **direction A's layout in direction C's colours, on a
lighter ground** ("A is good", "I like A with C colors better not the researched one… main background
color could just be a little lighter", "a bit more light", "Good. Now lets lock in the design and start
building"). The approved pages are `directions/warm-c/` (`home.html`, `shop.html`, `product.html`,
`README.md`); `directions/research-colour.md` is context only. The other directions (`warm/`, `bold/`,
`playful/`, `warm-r/`) are kept as the record of what was compared.

**The idea.** Sending flowers home is like writing a letter home: paper, ink, a postmark, a card. The
buyer starts with a sentence ("I'd like to send flowers to *my mum* in *Poland* for *a birthday*") — a
server-rendered GET form whose action is spec 004 §14 A21 clause 4's `no-store`, `noindex` route under
`/api/`, answering 303 to the country occasion page, else the country shop root, else the destinations
hub; only `country` and `occasion` have a `name`, "who it's for" has none; the
destination's own dates are drawn as stamps; the card is **printed** and tucked into the bouquet, never
shown as handwritten.

| | v2 |
|---|---|
| Ground | milk `--color-paper`, cream bands `--color-paper-2`, white letters, cards and fields `--color-card` |
| Ink | plum-navy `--color-ink` / `-2` / `-3` (16.1, 8.5, 6.0 ∶ 1) |
| Act | poppy `--color-accent`: Send, primary actions, the one italic phrase in a heading |
| Go | cornflower `--color-sky`: links, eyebrows, the postmark, step numbers, every selected chip, day and tier |
| Highlight | sunflower `--color-sun`: on ink, as tape, as an underline; never text on paper |
| Included | leaf `--color-stem` |
| Tints | `--color-blush`, `--color-butter`, `--color-sage-wash` (warm-c's name for the cornflower wash), `--color-leaf-wash` (stamps, note card, summary, picker note) |
| Type | Spec 004 §14 A21 clause 3: Fraunces roman 400 and italic 300 (SOFT 100, opsz pinned) · Alegreya Sans 400 and 700 · Caveat 500 **only in the printed-card preview on the product page** · the wordmark as the committed SVG, Newsreader 500 outlined to paths (no Newsreader file). Every note warm-c drew in Caveat — the sentence's choices, the P.S., the margin note, the sign-off, occasion tags — is Fraunces 300 italic. Budget: ≤ 90 KB font transfer (≤ 120 KB on `pl`), + ≤ 30 KB Caveat on the product page, ≤ 2 preloads. The artboards load these faces from Google Fonts only to draw them; nothing ships from there. |
| Marks | the airmail edge (three places only: the sentence letter, the recap, the footer) · the postmark · perforated date stamps · the P.S. with sunflower tape · the printed-card preview |
| Logo | unchanged (`--color-logo-ink`, `--color-logo-accent`) |

**What changed from v1.** Forest green on white with Newsreader + IBM Plex Sans became plum-navy,
poppy and cornflower on milk with Fraunces, Alegreya Sans and Caveat. Pill buttons replace square ones;
photographs get 18 px radii (28 on the home hero); the home leads with the sentence instead of the
finder card; listing pages lead with a P.S. instead of a demo banner; the date picker is drawn as chips
with hand-lettered occasion tags. The **chrome** follows spec 004 §14 A20: every control is a link to a
page that exists or is absent (no search, account, basket, menu button or Add-ons; footer Company and
Legal groups wait for TASK-174). Real catalogue photographs replace the grey slots. Spec 004 §14 A21 makes `directions/warm-c/` and these v2 files the design source of truth and the v1 artboards superseded. `system/tokens.css`
keeps every v1 token *name* (with v2 values) so the artboards not yet redrawn still resolve.

**Where each v2 artboard is.**

| Page type | Artboards |
|---|---|
| Home | `wireframes/home-desktop.dc.html` · `wireframes/home-mobile.dc.html` (supersede `homepage-v1/`, kept as the 2026-09-08 record) |
| Chrome: notice bar, header, footer | `wireframes/chrome-desktop.dc.html` · `wireframes/chrome-mobile.dc.html` |
| Country shop root · country category · country occasion | `wireframes/country-shop-*`, `wireframes/country-category-*`, `wireframes/country-occasion-*` |
| Category hub · occasion hub · occasions index | `wireframes/category-hub-*`, `wireframes/occasion-hub-*`, `wireframes/occasions-index-*` |
| Destinations hub · country guide | `wireframes/all-destinations-*`, `wireframes/corridor-country-*` |
| Product (unavailable, preview, live) | `wireframes/product-*` |
| Not found and error | `wireframes/errors-*` |
| Tokens, colour, type, components | `system/tokens.css`, `system/colour.dc.html`, `system/typography.dc.html`, `system/components.dc.html` |

The v2 artboards **replace the v1 files in place** (same names, so every spec, brief and README row that
names them still points at the right page; git history keeps v1). Still in v1 and redrawn by the task
that next builds them: locale chooser, checkout, confirmation, track order, for florists, legal
template, how it works, guarantee and delivery, about/contact/help, blog, and the three `flows/`.

### What the warm-c direction draws that the specs forbid

`directions/warm-c/` sets the look; it is a clickable preview and draws behaviour the specs do not
allow. **Never build any of these from the direction files** (spec 004 §14 A21 clause 1); the v2
artboards already leave them out or redraw them:

| warm-c draws | The rule | v2 draws instead |
|---|---|---|
| The shop's client-side filters (type chips as buttons, occasion and flower selects), “Show 12 more” / load more, and the “For your mum” line | spec 008 AC-9, AC-23, §13 Q6: a `GET` sort form, server pagination, no island; no filters | type chips as links to country category pages, the sort form, numbered pagination, no relationship line |
| The product page's add-on checkboxes that change the total | spec 009 §13 Q6: a priced read-only list in Phase 0 | the read-only list; checkboxes only as a spec 010 state |
| Selectable dated chips and a working Send | spec 009 §14 A19, AC-8: dates are selectable only when `pickerState` is `live`; Phase 0 shows the demo sentence in place of Send | the `preview` grid (every date disabled) and the demo sentence |
| “7-day freshness guarantee” | founder copy batch, 2026-10-03 | “Freshness guarantee” |
| The “Occasion reminders” e-mail form | A21 clause 1, A20: a personal-data flow with no spec | nothing |
| Caveat on the sentence's choices, the P.S., the margin note, the sign-off, the tags | A21 clause 3: Caveat only in the product page's printed-card preview | Fraunces 300 italic |
| `fonts.googleapis.com` `<link>`s | A21 clause 3, ADR-0016: self-hosted subsets, never Google Fonts | the artboards keep the links only to draw; nothing ships from there |
| “card-sub” stem lines on cards (“18 stems · roses”) | spec 008 AC-6: exactly photo, name, one all-in price and the honesty label | no stem line |

### A21 clause 2 names → `tokens.css`

Spec 004 §14 A21 clause 2 names warm-c's tokens; `tokens.css` uses the code's `--color-*` namespace.
One answer for TASK-175's T-01: the name on the right, with the value on the right.

| A21 / warm-c name | `tokens.css` | Value | Note |
|---|---|---|---|
| `--paper` · `--paper-2` | `--color-paper` · `--color-paper-2` | `oklch(99.8% 0.002 85)` · `oklch(98.9% 0.006 85)` | as A21 |
| `--card` | `--color-card` | **`oklch(100% 0 0)`** | The rendered value. warm-c's README table said `oklch(99.6% 0.004 85)` until 2026-10-03, when it was corrected to the 100 % the pages render: 99.6 % sat below the 99.8 % page and the letter, cards and fields lost their lift. |
| `--ink` · `--ink-2` · `--ink-3` | `--color-ink` · `-2` · `-3` | `oklch(25% 0.06 285)` · `42% 0.05` · `50% 0.04` | as A21 |
| `--accent` · `--accent-strong` | `--color-accent` · `--color-accent-strong` | `oklch(54% 0.2 30)` · `oklch(47% 0.19 30)` | as A21 |
| `--sky` · `--sky-strong` | `--color-sky` · `--color-sky-strong` | `oklch(48% 0.16 262)` · `oklch(40% 0.15 262)` | as A21 |
| `--sun` | `--color-sun` | `oklch(87% 0.15 92)` | as A21 |
| `--blush` · `--butter` · `--sage-wash` · `--leaf-wash` | `--color-blush` · `--color-butter` · **`--color-sage-wash`** · `--color-leaf-wash` | `93.5% 0.04 30` · `96.5% 0.055 95` · `94% 0.03 250` · `94.5% 0.04 155` | A21's name adopted; warm-c's “sage-wash” has always been the cornflower wash (hue 250), so the look does not change |
| `--stem` | `--color-stem` | `oklch(44% 0.1 155)` | as A21 |
| `--logo-ink` · `--logo-accent` | `--color-logo-ink` · `--color-logo-accent` | `oklch(19% 0.01 250)` · `oklch(42% 0.1 155)` | as A21 |

## The folders

| Folder | What it is | Who edits it |
|---|---|---|
| `homepage-v1/` | The founder-approved homepage, identity and token file from the 2026-09-08 review: **the v1 record**. Superseded as the direction by v2 (2026-10-03, `wireframes/home-*`); never edited again. | nobody |
| `directions/` | The 2026-10-03 brand directions the founder compared, the colour research, and the chosen `warm-c/` pages v2 is drawn from. Under spec 004 §14 A21, **`warm-c/` is binding for the look** (palette, type, shapes); the v2 `system/` and `wireframes/` are binding for the build, and they win wherever they differ from `warm-c/` (see “What the warm-c direction draws that the specs forbid”). The other directions are a record only. | nobody |
| `system/` | `tokens.css` (canonical, v2), `components.dc.html` (every shipped primitive at every state), `typography.dc.html` (ramp, measure, script coverage), `colour.dc.html` (palette, semantic aliases, contrast manifest). | whoever changes `src/modules/ui` |
| `flows/` | `buyer-journey.dc.html`, `florist-journey.dc.html`, `consent-and-locale.dc.html` — screen-thumbnail flows annotated with the decision points, the trust moments and the data each step reads. | the spec that changes a journey |
| `wireframes/` | One desktop (1440) and one mobile (390) artboard per Phase 0 page type. Structural, in the approved system: grey photo slots, real registry copy where it exists, `[slot]` markers where it does not, every state and empty state shown. | the spec that owns the page |
| `benchmarks/` | The 2026-09-09 competitor study — nine files across eight page types and nine brands — plus a `README.md` mapping every page type's wireframe to its benchmark file with "what we took / what we dropped / why", the ten patterns and where each landed, and the fourteen questions only the founder can answer. Evidence, not instructions: where the study and `CLAUDE.md` disagree, `CLAUDE.md` wins. | the study that replaces it |
| `canvas.json` (root) | Every artboard in the directory, laid out in labelled rows by folder, for the founder's design canvas. `flows/` and `wireframes/` carry their own so a subset can be published alone. | whoever adds an artboard |

## How an artboard is authored

The format is Claude Design's **Design Component** (`.dc.html`), and the conventions come from
`homepage-v1/`:

1. **One self-contained HTML file per artboard.** `<x-dc>` wraps a `<helmet>` (the font link and one
   `<style>` block) and a single root `<div>` whose `inline-size` is the artboard's pixel width. No
   imports, no shared stylesheet, no JavaScript, no `<img>`: a real photograph is painted as the
   `background-image` of its fixed-ratio box with `role="img"` and its spec 006 alt as `aria-label`,
   and the annotation says it ships as the `Photo` component (`<img srcset sizes>`).
2. **Colour comes only from the token custom properties.** The `:root` block at the top of each file
   declares them; every declaration below references `var(--color-…)`. A hex, `rgb` or `hsl` literal
   anywhere under `docs/design/` except the two `tokens.css` files fails
   `tests/unit/design-docs.test.ts`.
3. **Inline styles, logical properties.** `padding-inline`, `margin-block-start`, `border-inline-end`
   — never `left`, `right`, `margin-left`. The same rule the application is linted for, so an
   artboard can be read as a template.
4. **Two widths, and only two.** Desktop artboards are **1440** wide with 56 px inline padding;
   mobile artboards are **390** wide with 20 px (v2; v1 artboards used 16). Those are the two ends of the shipped `clamp()` type
   scale, which is why there is no tablet artboard: the type between the two widths is interpolated,
   not designed.
5. **`canvas.json` places it**: `{ file, title, x, y, w, h }`, ≥80 px between artboards in a row and
   ≥120 px between rows, plus `annotations` for the row labels and `launch.view: "canvas"`.
6. **Every flow and wireframe artboard opens with an annotation block** — purpose, URL, index status,
   the data it reads, the states, and the owning spec. It is the first thing in the file and the
   first thing on the canvas, because an artboard without it is a picture rather than a
   specification. Its label ends `· [internal]`: the marker says the block is the specification an
   implementer reads and not copy a buyer sees, and it is the one place the banned-word scan lets
   the internal word "corridor" through (see **Voice** below).

### The honesty rules an artboard must keep

These are `plan/10` §3, `plan/07` §7 and spec 004 AC-15 applied to design work, and they are the
reason a reviewer can trust a wireframe:

- **No photograph we do not have.** A photograph is either a real catalogue asset from
  `https://media.flowersoverseas.com/media/<id>/<w>.webp` (the same files the site serves), with the
  honesty label "Example arrangement · our florist hand-makes each one" wherever it is an AI asset, or
  the `--color-photo` placeholder with a caption saying what the slot will hold. No stock photo, no
  placeholder service, no photograph of a florist, a shop or a delivery we have not made.
- **No invented number.** No florist count, no delivery count, no rating, no "200+ partners". A
  number we do not have is the `Placeholder` bar (`.ph`), which renders no digits at all.
- **No fabricated trust.** Zero reviews, zero testimonials, zero partner logos, zero press strip.
  Reviews are real-only (founder decision, 2026-09-08; EU UCPD/Omnibus).
- **No invented copy where real copy exists.** If a string is in `messages/en.json` or a registry in
  `src/config/`, the artboard uses it verbatim. If it does not exist, it is marked `[slot]` and the
  annotation says which spec owns it.
- **Drawn in the approved system.** v2: milk paper, plum-navy ink, poppy to act, cornflower to go,
  Fraunces + Alegreya Sans + Caveat. A wireframe is drawn in the approved system, not in grey boxes.
- **No claim the data cannot carry.** Florists are spoken of in the future tense until one is live
  ("our florist … will make it"). No "most sent", no ranking we cannot evidence ("Popular choices" is
  the founder-approved heading, with an honest basis line). The guarantee is the "Freshness guarantee",
  never "7-day". Cards are printed, never "handwritten".

## Voice

Spec 004 **§14 A5** is binding on every word on every artboard, and the words on an artboard are the
words that ship — an implementer copies them into a message key:

> all customer-facing copy speaks as Flowers Overseas in the first person — *we* make it, *our
> florist in Warsaw* delivers it, *our team* checks it […] The words "relay", "corridor", "partner",
> "third party" and "vendor" never appear in customer copy (they stay in plan/, specs/ and admin).
> Two honesty guardrails hold: geographic claims match live coverage (Phase 0: "across Europe",
> never "anywhere in the world", until destinations exist […]); and specific beats superlative
> ("made fresh the morning it's delivered", "photographed at the door") over "super fresh" or
> "best". We never claim to own the shops; "our florists", "our team in Poland" and "hand-picked by
> us" are true and sufficient.

In practice, on an artboard:

- **First person, always.** "Our florist in the recipient's town makes your bouquet the morning it is
  delivered. We chose every one of them ourselves." Not "a vetted local florist makes and delivers".
  We are the seller, the guarantee and the person the buyer complains to.
- **Nine banned words**, scanned case-insensitively by `tests/unit/design-docs.test.ts` over every
  `.dc.html` — and, since TASK-084, over every `messages/*.json` value and every prose string
  literal under `src/`: *relay, corridor, partner, third party, third-party, vendor, network,
  anywhere in the world, super fresh*. A key *name* may keep the word (`noPartner`,
  `corridorPagePublished`); the sentence a buyer reads may not. `corridor` survives only inside an annotation block marked `[internal]`, because
  `plan/05` and the specs use it as internal vocabulary; everything else is banned everywhere,
  including designer notes and state stubs. Identifiers inside `<code>` are exempt — a route or a
  table name is not copy (`/demo/vendor-inbox`, `partner_application`, `corridorPagePublished`).
- **Say the specific thing.** "Order by 14:00 in Warsaw — the recipient's own time" beats "order
  early" — but only once a destination is live: in Phase 0 that sentence is superseded, see the
  2026-09-18 TASK-120 row under "Where the sheet and the code currently differ". "+29 zł" on the chip beats "surcharge may apply". A number we do not have is the
  `Placeholder` bar, never an adjective standing in for it.
- **Cap the geography at live coverage.** "Across Europe", "Poland today, six more countries as we
  choose florists" — never a count of countries we do not serve.

## Density

Round 2, founder direction 2026-09-09: *"less boutique, more shop — without losing trust."* The
white paper, the type pairing and the honesty rules are unchanged; the commercial density is not.

- **Products before prose.** Every shop page opens with a priced product row — six cards, an all-in
  price on each — before any editorial section. On the locale home the two priced rows now sit
  directly under the hero and the four-fact proof strip, ahead of the occasion tiles and the
  date strip.
- **Every price is all-in and visible.** No card without a price, no "from" where the price shown
  must equal the price charged, no price that grows at the next step. The only page type allowed to
  show a product without a price is the destination-less category hub, and it must say in a sentence
  *why* there is none.
- **The delivery promise repeats wherever a product is shown**: the date, the cutoff in the
  **recipient's** time zone, and the fee on the date chip. It is one tile, and it appears on the
  product page, above every grid, and in checkout step 1.
- **v2 spacing.** The home and the editorial sections of the guide keep warm-c's generous rhythm
  (`--space-3xl` 128 between home sections, 64 on mobile); every listing keeps products before prose
  and no more than 72 between a grid and the next block.
- **Tighter vertical rhythm.** Section gap on a commercial page is `--space-xl` (40 px) or less;
  `--space-2xl` (72 px) and `--space-3xl` (128 px) belong to editorial and trust pages, and no new
  artboard introduces one between two rows of products.
- **Larger photography slots, fewer words per section.** Cards use 4∶5 rather than 1∶1 where the
  page is a grid; a section is a heading, one sentence and the goods.
- **Real dates in navigation.** The category row prints the destination's next occasions with their
  dates ("All Saints 1 Nov"), from the occasion calendar rather than from a copy deck.

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
| **2026-10-03 — v2, the letter home.** `system/tokens.css`, `colour`, `typography` and `components` and the 22 redrawn page artboards (plus `chrome-*`) are drawn in v2; `src/app/globals.css`, `src/modules/ui` and every shipped page are still v1 (forest green, Newsreader + IBM Plex Sans, square buttons). | **the sheet**, until the v2 implementation tasks land | The founder locked v2 on 2026-10-03. Like the 007/009 groups below, this is the sheet deliberately leading the code; the implementer who ships v2 tokens and primitives updates this row out of existence. Mapping the implementer needs: v1 token names are kept (values change); new tokens are added (`--color-card`, `--color-sky`, `--color-sun`, `--color-stem`, the four tints, `--color-shade`, `--color-field-edge`, the logo pair, `--airmail-edge`, `--font-hand`, `--font-logo`, the two-value type steps); `BUTTON_VARIANTS` maps `accent` → send (new size, 60 px), `primary` → the poppy pill, `secondary` → the ink outline, `quiet` → cornflower text (`system/components.dc.html`). **Copy the redraw needs** (founder copy batch; each is listed in its artboard's Copy row): “Handwritten card” → “Printed card” (`catalog.addon.card.*`, and the Poland guide's card-language answer); “7-day freshness guarantee” → “Freshness guarantee” (`trust.guarantee.name`, `home.proof.guarantee.title`, `nav.utility.guarantee`); “Most sent this week” → “Popular choices” with a new basis line (`home.trending.*`); florist sentences in the future tense, including `company.description` (the footer: “…a local florist in the recipient's town will make the bouquet and hand it over in person.”) and `media.placeholder.product` (“…this bouquet as our florist will make it”); “Poland today.” → “Poland first.”; “all in” beside card prices; the sentence picker's strings; the equivalents line (“about … at the rate of {date}”). **Resolved by the redraw:** the TASK-120 chrome strings, the TASK-109/110/111 delivery-facts panel and stem line, TASK-112 (a), (c), (d) and TASK-113 (a)–(c) below are all drawn the way the code ships them. **Ruled (spec 004 §14 A21, coordinator 2026-10-03):** the sentence's action is A21 clause 4's route under `/api/` (303); fonts follow clause 3 (Caveat only in the product page's printed-card preview, every other hand note in Fraunces italic, the wordmark outlined); the occasion-reminder form is not rendered (clause 1, A20); the Popular-choices basis line is “Our picks until real orders start.” (founder-approved). The printed-card field and preview are on the Phase 0 product page (clause 5). **Round 1 of PR 166:** the listing, home and product artboards are drawn in the **fresh-rate** state — `/en` charges €55.90 and the clause 6 equivalents line sits under every destination-specific price and under the product page's total (USD as a placeholder bar until TASK-178 commits its rate); a drawn state shows the stale fallback (229.00&nbsp;PLN, the currency sentence, no equivalents), which is production today. Every amount is `formatMoney`'s output, never hand-formatted (`/en` 229.00&nbsp;PLN, `/en-gb` PLN&nbsp;229.00, `/de` 229,00&nbsp;PLN, `/pl` 229,00&nbsp;zł, U+00A0). The footer's Stripe sentence is hidden in Phase 0 (A10). |
| `homepage-v1/tokens.css` has no status colours, no semantic aliases, no `--color-accent-strong`, no separate photo stops, no radius/shadow/motion/layer scales, and fixed rather than fluid type steps. | the code | Spec 004 added all of them on top of the approved ramp. `system/tokens.css` is the superset and is the file to read; `homepage-v1/tokens.css` stays as the 2026-09-08 record. |
| Spacing is `--space-*` on the canvas and `--spacing-*` in code. | both | Same seven values. `system/tokens.css` declares both names so a reader of either file recognises the other; Tailwind's theme namespace requires `--spacing-*`. |
| The canvas's "medium" weight is 500; the shipped `--font-weight-medium` is **600**. | the code | Only two IBM Plex Sans faces ship (400, 600) to stay inside the 45 KB font budget, so 500 would be matched down to 400. The artboards are drawn at 600 where a canvas file says 500. |
| The canvas's `.photo` caption ink is written inline as an `oklch()` value. | the code | It is `--color-photo-ink` in `globals.css` and a contrast-manifest pair. New artboards use the token. |
| `system/components.dc.html` carries a **Country-page blocks (spec 007)** group — breadcrumb trail, fact list, FAQ list, occasion calendar, related-destinations row, status chip — that `src/modules/ui` does not export. | the sheet, for now | The one deliberate exception to "the sheet is a mirror, not a wish list": `CLAUDE.md` requires a UI spec's artboards **before** `/plan-tasks`, so the blocks spec 007 fixes are drawn before the tasks that build them exist. The group says so on itself. The implementer who ships them updates this row out of existence in the same PR. None of the six introduces a token: all are composed from `Chip`, `Stack`, `Grid`, `Text` and the existing scales. |
| The product card as first drawn carried a **stem-count line** under each name and **no** honesty label; the shipped card has neither the stem line nor a card without the label. | the code | Spec 008 AC-6 says a card renders *exactly* photo, name, one all-in price with the `catalog.price.inclusive` wording, and the provenance note where an `ai` asset is shown — and `ProductCardViewSchema` (§5.2) has no field a stem count could arrive in, so the type refuses it before a renderer sees it. §2 owes the spec 006 §2.5 label "wherever an `ai` asset is displayed", and every card on a Phase-0 listing displays one. Both corrections were made **on the sheet** by TASK-108, in the pull request that shipped the components; the drawing and `/dev/components` now agree. Spec 008 §14 A2 then ruled the placement for good — **one note per card** that shows an `ai` asset, never one sentence per grid or per page — and the same pull request redrew the listing-grid cells of `system/components.dc.html` and the page artboards `wireframes/country-shop-desktop.dc.html`, `country-shop-mobile.dc.html` and `country-category-desktop.dc.html` to match. The from-price chip’s stale-FX state keeps its `from` qualifier, which the drawing omits: the chip still quotes the floor of a set. |
| The listing artboards spec 008 §14 A2 did **not** name still draw the honesty note **once after the grid**, and every page artboard not yet redrawn still draws a **stem-count line** under each card name. | the code | A2 is the ruling for all of them (one note per card, no stem line, because `ProductCardViewSchema` has no field for one); TASK-108 redrew only the four artboards A2 names, because the rest belong to the page tasks that build them. TASK-109 and TASK-117 redraw the artboard they implement as they implement it, and must not copy either detail into a page. **2026-09-18: TASK-110 redrew `country-category-{desktop,mobile}.dc.html` and TASK-111 redrew `country-occasion-{desktop,mobile}.dc.html`** — the stem line is gone from every card on all four, and each mobile sheet's single after-the-grid note is now one note per card, so both pairs left this row. **TASK-112 redrew `category-hub-{desktop,mobile}.dc.html` and `occasion-hub-{desktop,mobile}.dc.html`** in the pull request that shipped the two hubs: the note is now on every card and the after-grid sentence is gone, and neither ever drew a stem line. |
| `system/components.dc.html` carries a **Product and date-picker blocks (spec 009)** group — date picker, date chip, tier selector, add-on price row, price summary block, delivery-facts summary, gallery — that `src/modules/ui` does not export. | the sheet, for now | The remaining deliberate exception, on the same footing and for the same reason as the 007 row above (the 008 row is gone: TASK-108 shipped its seven components, `/dev/components` and the sheet in one pull request): spec 009 §5.2 names six of the seven as `src/modules/ui/product/DeliveryDatePicker.tsx`, `DateChip.tsx`, `TierSelector.tsx`, `AddonPriceList.tsx`, `PriceSummary.tsx` and `Gallery.tsx`, and `CLAUDE.md` requires the artboards **before** `/plan-tasks` splits the spec into the tasks that build them. The seventh, the delivery-facts summary, is spec 007's block redrawn in the two states the product page puts it in, so it leaves this row with the 007 group. None of the seven exists in `src/modules/ui` today and the group says so on itself. The implementer of spec 009's UI-primitives task (§12 task 6) ships them, `/dev/components` and this row's deletion in one pull request. No new token: all seven are composed from `Chip`, `Photo`, `Stack`, `Grid`, `Text` and the existing space, rule, ink and accent scales. |
| **2026-09-18 (TASK-120) — the chrome promise band.** Forty artboards under `wireframes/` still draw four strings the code no longer renders: the category-row labels **"Best sellers"** and **"Same-day"**, the footer link **"Delivery times and cutoffs"**, and the utility-strip sentence **"Order by 14:00 in Warsaw — the recipient's own time — and we deliver today"** (drawn as "Order by 14:00 Warsaw time for same-day delivery" in the brief). | the code | Spec 008 §8 / AC-9 forbids naming the default order a ranking we cannot evidence, and spec 004 §14 A19 gates every same-day and cutoff promise on the destination's picker state, false everywhere in Phase 0. In code: `nav.category.bestSellers` is now `nav.category.ourSelection` ("Our selection"); the `same-day-delivery` category row and the `delivery-times` footer row carry `requiresDeliveryDates` and are filtered out of `headerCategoryItems()` and `footerView()`; the utility strip prints `nav.utility.datesPending` ("Delivery dates open when we confirm our first florist"). The two homepage artboards (`homepage-v1/homepage-{desktop,mobile}.dc.html`) were redrawn by TASK-120; the forty page wireframes were **not**, because each belongs to the page task that builds it. **Do not copy the four strings into a page.** Redraw the band as you implement your artboard — `tests/e2e/chrome-honesty.spec.ts` and `tests/unit/chrome-honesty.test.tsx` fail the whole document if any of them reaches the DOM. This row goes away when the last page wireframe is redrawn. |
| **2026-09-18 (TASK-112) — four details of the two hub artboards.** (a) `category-hub-desktop.dc.html` draws a **state chip** ("Guide · not delivering yet") on the linked destination; the shipped picker does not render one. (b) Both hub drawings show **one** destination with a page and six without; the shipped `en` page links **all seven**. (c) The category hub's link reads "See them with Poland's prices" on the sheet and **"See them with prices for {country}"** in code. (d) `occasion-hub-desktop.dc.html` captions the table "Mother's Day in **2027**, in every destination we cover"; the shipped caption carries no year. | the code | (a) §5.3 row 3's normative block list names the picker and the country list in `collator` order, not a per-destination state chip; a corridor state is the corridor page's fact and reading one here would need a second view model (§5.2's one source), which is spec 008 §14 **A9**'s rule applied again. (b) Not a drawing error but data: §2 row 7 gives a country category page to every **published** destination with ≥6 products in it, and the committed corpus satisfies that for all seven — the sheet was drawn against "only Poland is published". The text-only state the sheet draws is live and asserted, on a category that is below the floor everywhere (`/en/flowers/orchids`). (c) "the Netherlands's prices" is not English; one wording is right for all seven destinations. (d) **AC-11** forbids a date literal in any component *or message string*, and a year in the caption is one — the years in the table are `occasionDate(rule, year)`'s. (e) Two strings the sheet does not draw at all are authored by the implementer and carry `reviewed: false` in `messages/en.meta.json` until the founder reads them: `occasionHub.dateUnknown` (the Romania row's honest blank, which the sheet states only as an annotation) and `occasionHub.destinationsHeading` (the sheet's block label is “Out of this page”, which is architecture, not copy). `categoryHub.destinationLink` and `occasionHub.datesCaption` are unreviewed for the same reason: (c) and (d) reworded them off the sheet. Redraw (a), (c) and (d) into the sheets when they are next opened; (b) needs no redraw, only this note. |
| **2026-09-18 (TASK-109) — the delivery-facts panel on the country shop root.** `wireframes/country-shop-desktop.dc.html` draws spec 007's delivery-facts panel between the demo sentence and the product grid. The shipped page does **not** render it. | the code | Spec 008 §5.3 row 1's normative block list does not name the panel, and §5.2 makes `listingView()` the only source for this page — rendering it would need a second view model (a `CorridorView`) on a page the spec gives one source. Ruled as **spec 008 §14 A9**: the spec text governs and the drawing is the stale artefact. Do not copy the panel into a listing page; the panel belongs to the corridor page, where spec 007 owns it. This row goes away when the artboard is redrawn. |
| **2026-09-18 (TASK-110) — the country category: the delivery-facts panel, the stem line, the toolbar and the pagination.** `wireframes/country-category-{desktop,mobile}.dc.html` draw spec 007's delivery-facts panel between the demo sentence and the sibling row, a sort form and a page nav around the grid, and (on mobile) the honesty note once after the grid. The shipped page renders none of the four. | the code | Three separate rulings, one row. (1) The **panel** is spec 008 §14 **A9** applied to the artboard that shares it with the shop root: §5.3 row 2's normative block list does not name it, and §5.2 makes `listingView()` the only source for this page, so drawing it would need a second view model (a `CorridorView`). It belongs to the corridor page the breadcrumb links to. (2) The **toolbar and the pagination** are spec 008 §14 **A8 (c)**: both are driven by `searchParams`, which TASK-114 reads; until then a `<select>` that cannot sort and a `?page=2` link that renders page 1 would be controls the page only pretends to have. The honest half of the band — the result count and the ranking-disclosure sentence — does ship. (3) The **stem line** and the **once-after-the-grid honesty note** were redrawn out by this task, as the 2026-09-18 TASK-108 row above instructs the page task to do: `ProductCardViewSchema` has no field a stem count could arrive in, and spec 008 §14 **A2** puts the provenance note on every card that shows an `ai` asset. The superseded footer link "Delivery times and cutoffs" was redrawn out of both files in the same pass (the TASK-120 row's standing instruction). Rows (1) and (2) go away when the artboard is redrawn and when TASK-114 lands; row (3) is already fixed on the sheet. |
| **2026-09-18 (TASK-111) — the country occasion, and the shop root's third column.** Three differences, all now settled in the code's favour and all recorded rather than left to be rediscovered. (1) `wireframes/country-occasion-{desktop,mobile}.dc.html` drew spec 007's **delivery-facts panel** under the demo sentence; it is **not** rendered, and both drawings were redrawn without it in the same pull request. (2) The drawn breadcrumb is five crumbs (Home / Send flowers to / Poland / Occasions / Mother's Day); the shipped trail is **six** — it keeps the `Flowers` shop-root crumb. (3) The drawn occasion table on the **shop root** fills its third column with a reviewer's explanation of the floor and makes the occasion *name* the link; the shipped table puts one link in the third column and leaves the name as text. | the code | (1) §5.3 row 2's normative block list does not name the panel and §5.2 makes `listingView()` the only source for this page, so rendering it would need a second view model (a `CorridorView`) — spec 008 §14 **A9**'s ruling for the shop root, applied to the page type §5.3 describes as "the same, minus the tiles". The panel belongs to the corridor page, which the breadcrumb links to. (2) `breadcrumbFor()` gives every country-scoped listing the same parent chain, and the shop root is genuinely this page's parent while the occasions index is not country-scoped; §2 "Links" also requires the shop-root link from this page. The occasions crumb stays, as **text** until TASK-113 publishes its link id. (3) §14 **A10** defines the column as "which of these is a link", and the drawing's cell text ("5 tagged, below the floor of six…") is an annotation for the implementer, not buyer copy — it would also print our floor rule to a reader. A row whose page does not exist renders an **empty cell**, never a disabled link (spec 004 AC-14). The artboards' "Also in Poland" row additionally draws an occasion-hub and an occasions-index chip: the hub has no link id in `ListingLinks` until TASK-112 and the index is reached from the breadcrumb, so the shipped row carries the sibling occasions that exist plus the shop root. |
| **2026-09-21 (TASK-114) — `?page=1` answers 308, not 301.** `wireframes/country-shop-desktop.dc.html`'s pagination caption says "`?page=1` is a **301** to the bare URL", and spec 008 AC-10 says the same. The shipped response is a **308**. | both, for now | A Next page render cannot choose a status code (`permanentRedirect()` is 308), a `next.config` redirect cannot strip the parameter it matched — its destination query is `{…requestQuery, …destinationQuery}`, so a rule matching `?page=1` redirects to `?page=1` forever (measured on Next 16.3.4) — and `src/proxy.ts` is closed to redirects by spec 001 §11 and `fo/no-geo-redirect`. Spec 007 §14 **A6** already ruled this shape for the trailing slash: "Next's 308 today; Cloudflare's 301 once spec 040 fronts the origin", with the e2e asserting `301\|308` and the `Location`. 301 and 308 are the same permanent signal to a crawler. This row goes away when spec 040's edge normalisation lands or the caption is redrawn. |
| **2026-09-23 (TASK-113, `/review 98` round 1) — the corridor's guide-state shop entry, and the occasions index's captions.** (a) `corridor-country-{desktop,mobile}.dc.html` drew state A's shop entry as "Nothing renders here"; the shipped guide page renders the shop-root link alone ("See flowers for Poland"), with no heading and no body. (b) Both sheets' state B still draw the shop entry as the shop root **plus** up to six category chips and the indexable occasions; the shipped live state renders the shop root link with its heading and body and **no chips**. (c) `occasions-index-{desktop,mobile}.dc.html` captioned the table "in Poland — the one destination we have published" and drew Sant Jordi, Grandmothers' Day in France and the May Day lily of the valley as "observed nowhere we have published". | (a), (c) the code; (b) the sheet | (a) Spec 008 AC-20 published `country-shop-root` and no destination is live in Phase 0, so the guide state is the only state that can carry the link. State B's heading ("See what can arrive in…") and body ("Bouquets our florists in… can make…") are florist, delivery and availability claims a guide page may not make, so they stay state B's. Both sheets' state A and state C are amended, and this is a spec 007 §2 deviation recorded in `docs/tasks/TASK-113.md`. (b) Not redrawn: the chips are escalated in `docs/tasks/TASK-113.md` against AC-20's "no markup change", and they are unreachable today because no destination is live. (c) TASK-091 published all seven guides, so §14 Q4's premise no longer holds. The caption now names the date country and nothing else, the three occasions sit in the undated group because their day is not on Poland's calendar, and both sheets are amended. The two reworded strings (`occasionsIndex.datedCaption`, `occasionsIndex.undatedNote`) carry `reviewed: false` until the founder approves them. |

## Phase 0 page types → wireframes

Every row of `plan/05` §1 and §2 whose Phase column is 0. Rows outside §1–§2 that Phase 0 also needs
(the florist set, the legal template, the error pages) are listed after the table.

| plan/05 # | Page type | Wireframe artboards | Owning spec |
|---|---|---|---|
| 1 | Locale chooser | `wireframes/locale-chooser-desktop.dc.html` · `wireframes/locale-chooser-mobile.dc.html` | 003 (shipped) |
| 2 | Locale home | `wireframes/home-desktop.dc.html` · `wireframes/home-mobile.dc.html` (v2; v1 record: `homepage-v1/homepage-desktop.dc.html` · `homepage-v1/homepage-mobile.dc.html`) · chrome: `wireframes/chrome-desktop.dc.html` · `wireframes/chrome-mobile.dc.html` | 004 |
| 3 | All destinations | `wireframes/all-destinations-desktop.dc.html` · `wireframes/all-destinations-mobile.dc.html` | 007 |
| 4 | Corridor: country (guide and live states) | `wireframes/corridor-country-desktop.dc.html` · `wireframes/corridor-country-mobile.dc.html` | 007 |
| 6 | Country shop root | `wireframes/country-shop-desktop.dc.html` · `wireframes/country-shop-mobile.dc.html` — priced row, category tiles with `from` prices, the dated occasion table, toolbar (default and sorted), pagination, empty, no-photo, stale FX, card as tile and as link | 008 |
| 7 | Country category | `wireframes/country-category-desktop.dc.html` · `wireframes/country-category-mobile.dc.html` — sibling-category chip row, breadcrumb, toolbar (default and sorted), the last page, why empty is unreachable | 008 |
| 8 | Country occasion | `wireframes/country-occasion-desktop.dc.html` · `wireframes/country-occasion-mobile.dc.html` — the destination's own dated line, single-page listing (no pagination), the observed-but-below-the-floor state | 008 |
| 9 | Product (country-scoped) | `wireframes/product-desktop.dc.html` · `wireframes/product-mobile.dc.html` — the three picker states `unavailable` / `preview` / `live`, past-cutoff, surcharge date, holiday date with its reason, occasion-marked date, unavailable-for-every-date, no-photo (the common case), stale FX, single tier, the demo summary in place of a CTA, the sticky mobile summary | 009 |
| 10 | Category hub (destination-less) | `wireframes/category-hub-desktop.dc.html` · `wireframes/category-hub-mobile.dc.html` — the no-money state and its explanation sentence, the destination picker, the country list in `collator` order, unpriced cards | 008 |
| 13 | Occasion hub | `wireframes/occasion-hub-desktop.dc.html` · `wireframes/occasion-hub-mobile.dc.html` — the per-country date table, country links that exist against the text-only ones, products without prices | 008 |
| 14 | Occasions index | `wireframes/occasions-index-desktop.dc.html` · `wireframes/occasions-index-mobile.dc.html` — the everyday group and the dated group with their next dates | 008 |
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
  every file it names exists, no `.dc.html` writes a colour literal, every `canvas.json` entry
  points at a real file, **no artboard uses a banned word outside an `[internal]` annotation block
  or a `<code>` identifier**, and `benchmarks/README.md` maps every benchmark file and every
  wireframe row it claims.
- `docs/design/benchmarks/` — the study every round-2 wireframe was reworked against, and the
  founder questions it left open.
- `specs/004-design-system-layout.md` §2, §5, §13, §14 A3 — the spec this directory serves.
- `plan/05-page-inventory.md` §1–§2 — the page inventory the wireframe table maps.
