# Site sweep — the first screen of every page (2026-10-04)

**Why.** The founder, 2026-10-04: *"i dont like the design.. of the birthday, occasions, sympathy,
bouqets ppages etc etc roses plants and destinations too... they look bland at first glance or from
top... only when we scroll down they look somewhat good... you aren't being creative bro... also
some things still have shoit alignment or old deisgns... fix that too.. also now do a full sweep of
redesign pls."* They judge the first screen, at 1440 × 900 and 390 × 844.

**How this was measured.** The live site (`https://flowers-overseas.vercel.app`, commit `b1e8f7e8`,
the v2 home included), `/en-gb`, Playwright Chromium at 1440 × 900 and 390 × 844, first screen and
full page, once as a first visit and once with the consent box answered. A DOM probe recorded every
`h1` box, the left edge of every block in `<main>`, the computed fonts, colours and button radii. Pixel
numbers below are CSS pixels from that probe. Screenshots are not committed; the redrawn artboards
are the record.

**What changed on the canvas.** The seven listing page types the founder named are redrawn in place
with new first screens, the country guide lost its empty photo box, the root chooser and the
suggestion strip give way to a language popup, and the shared chrome strings are brought to what
ships. Every redrawn artboard draws a dashed poppy line where the first screen ends.

| Page type | Artboards | The new first screen, in one line |
|---|---|---|
| Occasion hub | `wireframes/occasion-hub-{desktop,mobile}.dc.html` | **Birthday** on butter: sunflowers under sunflower tape with the printed card tucked in front, an "Any day of the year" stamp and the P.S. saying why there is no price. **Sympathy** (state band) on cream, quiet: the lilies in an arch, no tilt or tape, one verbatim line "we will not deliver early". **Mother's Day** (state band) on blush: seven perforated stamps, one per country, each with that country's date — "country by country" made literal. |
| Category hub | `wireframes/category-hub-{desktop,mobile}.dc.html` | **Roses** on plum-navy ink with the italic in sunflower, the red roses beside it, and the seven destinations as stamps you press to see prices, all above the fold. **Bouquets** (cream, tilted tulips under tape) and **Plants** (leaf wash, the orchid in an arch with a plant label) in the state band. |
| Occasions index | `wireframes/occasions-index-{desktop,mobile}.dc.html` | A sheet of the next six dated occasions in Poland as tinted perforated stamps, cancelled with a "Coming up in Poland" postmark; the everyday occasions as arches right below. |
| Destinations hub | `wireframes/all-destinations-{desktop,mobile}.dc.html` | An envelope: the H1 and intro on the address side, the seven guides as stamps in the corner, cancelled by one postmark whose ring reads "Guide · not delivering yet". |
| Country shop root | `wireframes/country-shop-{desktop,mobile}.dc.html` | The first bouquet large with its price tag (`PLN 229.00 all in`), Poland's next date stamped on its corner, the Poland postmark (ring = the state) beside the P.S. France and the future live state in the band. |
| Country category | `wireframes/country-category-{desktop,mobile}.dc.html` | A magazine grid: the first rose takes two columns and two rows, four priced cards beside it, after a one-line H1, the postmark and the P.S. |
| Country occasion | `wireframes/country-occasion-{desktop,mobile}.dc.html` | The date is the hero: a large blush stamp "26 · May · Wednesday · 2027" beside the P.S., with the first bouquet and its price. |
| Country guide | `wireframes/corridor-country-{desktop,mobile}.dc.html` | The empty "Photo slot · Poland" box becomes the Poland postmark and the next three dates from the guide's own calendar. |
| Language popup (new) | `wireframes/locale-popup-{desktop,mobile}.dc.html` | "Choose your preferred language": four big native-name buttons, English marked Current, the browser's match highlighted; a centred card on desktop, a top sheet on 390. |
| Components | `system/components.dc.html`, group "First screens · sweep 2026-10-04 · proposed" | Every new part, at its states. No new token. |

## 1. The ten findings a visitor notices first

Ranked by what a visitor sees first, then by how many pages it touches.

1. **Every hub, index and listing opens on text with nothing beside it.** At 1440 the occasion
   hubs, category hubs, occasions index and destinations hub show an H1 and a 5–9 line paragraph in
   the left 600 px; the right half (x 708–1312, y 200–640) is empty paper. At 390 not one of these
   pages, nor the country shop, shows a flower on the first screen. This is the founder's
   "bland at first glance".
2. **Two overlays eat the first screen on a first visit, and they stack.** The cookie box
   (544 × 200 at x 24, y 675) sits on top of the language strip (1408 × 80 at y 804), covering the
   strip's buttons. On 390 the strip alone is about 210 px, a quarter of the screen. The strip is v1:
   square buttons (2 px radius) and a square 46 px ×. In our run, after its × was pressed it was back
   on the next page. It also offers "English" to a US-English browser that is already reading English
   (UK). The founder has since ruled it out (the popup, R9).
3. **Products past the twelfth can't be reached on any country category.** Poland roses says "15
   bouquets" and shows 12. Birthday flowers shows 12 of 27, mixed flowers 12 of 50 and hand-tied
   bouquets 12 of 40. None of them draws a pager, and `?page=2` serves page 1 again. The shop root
   has a pager; the country categories do not.
4. **The content column is 72 px inside the header.** The logo and the notice bar start at x 56. On
   every page except the home, the breadcrumb, H1 and grid start at x 128, because the content is
   1184 px wide where v2's frame is 1328 (`--page-max`). On 390 the same pages use 16 px gutters
   where the header and v2 use 20, so they sit 4 px off.
5. **The product page is still v1 below the photo.** Its parts:
   - The size picker is square, inside a framed `<fieldset>`, with "selected" in red text.
   - The date cells are square and dashed.
   - The price summary is a square box with an ink border, and "Ordering is not open yet" is a
     square ochre box.
   - The add-ons are a table with a "VAT 23%" column, and they include **"Handwritten card"**,
     which the founder's batch renamed "Printed card".
   - "change destination" is poppy where links are cornflower.
   - At 390 the product name is at y 936, below the first screen.
6. **The country guide's first screen is an empty box.** Its biggest element is a 572 × 380 gradient
   captioned "Photo slot · Poland", next to a 10-line paragraph.
7. **The guide's calendar shows internal code.** The Rule column prints `fixed`, `easter_offset` and
   `nth_weekday` in a monospace font. This is the only monospace text on the site.
8. **The breadcrumb jumps between pages.** It is 10 px under the header rule on the listings
   (y 154) and 50 px under it on the product and guide (y 194). The artboards say 20.
9. **Old shapes are left in the guide.** The three "how we will work" steps are square cards with
   hairline borders and "01/02/03" labels. "See flowers for Germany" is a full-width, square,
   poppy-outlined bar, 1184 px wide.
10. **Some copy reads wrong at a glance.** These are in Appendix A.
    - "Sending Hand-tied bouquets" capitalises mid-sentence.
    - "Flowers for *Birthday*" lacks an article.
    - The country-category grid heading repeats the H1 word for word.
    - The hand-tied bouquets hub says "Prices on this page include delivery and local tax" on a
      page that shows no price.
    - The shop tiles count plants as "8 bouquets".

Also found, lower in the ranking:

11. The 404 page has no chrome and none of its artboard: no letter, no airmail edge, no
    postmark. It is a plain centred column at x 483.
12. On 390 the category chip row is cut at the edge ("Occasio…"). Nothing shows that the row
    scrolls.
13. The occasions index's "Kept on a date we cannot compute here" has no eyebrow, unlike the groups
    above and below it.
14. On the shop root at 1440 the P.S. floats 280 px from the lede, top-aligned to nothing, and
    the first price is at y ~1000.
15. Two catalogue photographs do not show the product they are named for. "Olive Sapling"
    (`fo-pt-006-hero`) shows a hydrangea and "Peace Lily" (`fo-pt-004-hero`) a lily plant. Their alt
    texts describe the photographs, not the products.
16. The product page says "What the price does not include: a vase. The photograph is styled with
    one". The Amber Hour photograph shows kraft paper and no vase.
17. `/en-gb/how-it-works` is a 404. That is expected (spec 041, TASK-182–184 not built), and nothing
    links to it.

**No v1 colour or typeface is left.** The probe found only Fraunces, Alegreya Sans, the outlined
wordmark and the monospace of finding 7. It found no forest green, no Newsreader text and no IBM Plex.
The v1 leftovers are all shapes: square controls, framed fieldsets and hairline cards.

## 2. Page by page

Each entry gives:
- **First screen**: what the first screen shows and why it reads as bland.
- **Alignment**: the alignment faults.
- **v1**: the leftover v1 elements.
- **vs artboard**: where the live page differs from its artboard as it stood before this sweep.

### Home `/en-gb`
- **First screen:** this is the one page that already works: the H1, the hero photograph with the
  postmark, and the sentence letter. On a first visit the cookie box and the strip cover the letter
  (finding 2).
- **Alignment:** none. The H1 is at x 56 and x 20, on the frame.
- **v1:** the language strip.
- **vs artboard:**
  - The letter's button reads "Continue" live and "Show me the flowers" on the artboard.
  - The Poland chip links to the guide live. The artboard was redrawn to match (README row TASK-177).

### Destinations hub `/en-gb/send-flowers-to`
- **First screen:** the H1 "Where we can send flowers" and a 7-line intro, with the right half empty.
  The seven rows begin at y 450 and the first guide at y 555.
- **Alignment:** x 128 (finding 4). The status chip and the guide text share a column, but "Read the
  guide →" floats at the far end with no baseline relation to either.
- **v1:** none.
- **vs artboard:** matches the old artboard, which was itself text-only.

### Occasions index `/en-gb/occasions`
- **First screen:** the H1 "Occasions" and four lines of text. The dated table starts at y 420 on the
  right, and its left column is empty below "The ones with a date".
- **Alignment:** x 128. The table's caption (13 px) sits 90 px above the table head.
- **v1:** none.
- **vs artboard:** matches.

### Occasion hubs `/en-gb/occasions/birthday`, `/en-gb/occasions/sympathy`
- **First screen:** identical templates. A two-line H1 and a 7-line intro, with nothing at the right.
  "We show no price on this page…" is at y 890, which is the fold. The first photograph is at
  y ~980. At 390, the H1 and paragraph fill the screen. Birthday and sympathy look the same: nothing
  tells a grieving visitor and a celebrating one apart.
- **Alignment:** x 128 and x 16.
- **v1:** none.
- **vs artboard:** matches. The old artboard drew no photograph above the fold either.

### Category hubs `/en-gb/flowers/hand-tied-bouquets`, `/roses`, `/plants`
- **First screen:** "ROSES" and "Sending *Roses*", then a 7–8 line intro. "Where are they?" (the way
  to a price) starts at y 672, and its rows run below the fold. At 390 there is no picker on the
  first screen.
- **Alignment:** the picker is a two-column block whose left half (x 128–532) holds only a heading
  and the no-money note, while the countries list starts at x 604. That leaves a 72 px gutter at one
  end and 472 px at the other.
- **v1:** none.
- **vs artboard:** matches. The H1 capitalises "Hand-tied" mid-sentence.

### Country shop root `/en-gb/poland/flowers`, `/en-gb/france/flowers`
- **First screen:** the H1, the lede and a P.S. floating right. The toolbar is at y 590, and the first
  photographs start at y 733 and are cut by the fold, with no price visible. At 390 there is no
  product on the first screen. Poland and France are pixel-identical apart from the name: nothing on
  either says which country it is, except the word.
- **Alignment:** x 128. The P.S. is vertically centred against the H1 block, not aligned to it.
- **v1:** none.
- **vs artboard:**
  - The artboard drew `/en` at €55.90 with equivalents. Live `/en-gb` charges in PLN (stale-rate
    state); both are valid states.
  - No delivery-facts panel (spec 008 A9, already recorded).

### Country category `/en-gb/poland/flowers/roses`
- **First screen:** the H1 in two lines, a lede, a P.S. on the right, then the sibling chips. The grid
  begins near the fold.
- **Alignment:** x 128.
- **v1:** none.
- **vs artboard:**
  - No pagination, and products after the twelfth can't be reached (finding 3).
  - The grid's H2 repeats the H1.

### Country occasion `/en-gb/poland/occasions/mothers-day`
- **First screen:** the H1, then "Mother's Day in Poland is Wednesday, 26 May 2027." as a line of
  text. The page's one distinctive fact is set at body size.
- **Alignment:** x 128. At 390 the six-crumb trail wraps onto two lines.
- **v1:** none.
- **vs artboard:** the artboard drew a date stamp; live prints a sentence.

### Product `/en-gb/poland/product/amber-hour`
- **First screen:** the photograph, the name and a 15 px description. The size picker begins at
  y 545. At 390 the name is below the fold.
- **Alignment:** "Where is it going? Poland · change destination" sits between two rules 46 px apart,
  hard against the breadcrumb.
- **v1:** finding 5.
- **vs artboard:** `product-*` draws the v2 tiers, chips, summary and sticky bar; live does not.

### Country guides `/en-gb/send-flowers-to/poland`, `/germany`
- **First screen:** the empty photo box (finding 6).
- **Alignment:** x 128. The H1 (572 px) and the photo box are top-aligned, but the box is 380 px
  tall against a 470 px text column.
- **v1:** finding 9 (step cards, CTA bar).
- **vs artboard:**
  - The rule column (finding 7).
  - The H1 reads "Sending flowers to Poland from the UK" on en-gb, which is correct per locale.

### A "not yet" country shop `/en-gb/france/flowers`
- **First screen:** identical to Poland apart from the name, with a €53.90 price on the first card.
  The honesty (the P.S.) is there and correct.
- The only problem is that the page has no identity of its own: see the postmark in the redraw.

### How it works `/en-gb/how-it-works`
- A 404 today (finding 17). The spec 041 artboards are v2 and untouched by this sweep.

### Not found `/en-gb/<anything>`
- Finding 11. The artboard (`errors-*`) is right. The page needs building to it, with the chrome.

## 3. What the redraw does about each finding

| Finding | Where it is fixed |
|---|---|
| 1 | The seven redrawn pairs: one lead photograph on every hub and listing, a register per page, and the way to a price (or the price) above the fold at both widths. |
| 2 | `locale-popup-*`: one popup, never stacked with the consent sheet, remembered once closed. The strip is removed. |
| 3 | `country-category-*` draws the pager (spec 008 AC-10). This is a code fix, not a drawing: it needs a task. |
| 4 | Every redrawn artboard uses the 56/20 px frame. The code needs the listing container at `--page-max` 1328 and 20 px gutters below `md`. |
| 5 | `product-*` is already right. Build it. The "Handwritten" string is a copy fix (`catalog.addon.card.*`, founder batch). |
| 6, 7 | `corridor-country-*`: the postmark and dates in place of the box, and human words in the rule column (`[slot A11]`). |
| 8 | Every redrawn artboard puts the breadcrumb 20 px under the header, inside the hero band. |
| 9 | Spec 007's guide is not redrawn beyond its first screen. The steps should use v2's numbered route (`.route`), and the CTA should be the poppy pill, `secondary` at most. Noted for the guide's next task. |
| 10 | Appendix A. |
| 11 | `errors-*` unchanged: build to it. |
| 12–17 | Recorded. Photographs: replace or rename the two products (catalogue data, not design). |

## 4. Rulings the designs need

None of these is decided by this PR. Each is a question for the founder, or for a spec amendment,
before `/plan-tasks` turns the drawings into tasks.

- **R1 — A register per listing page** (spec 008 §5.3; spec 004 A21).
  - A closed set of grounds: warm (butter), quiet (cream, no tilt, no tape, italic in ink-2),
    dated (blush), cream, leaf, sky, ink.
  - Chosen per occasion and per category by a registry field, not by the component.
  - Default: warm for celebrations, quiet for sympathy and funeral, dated for every seasonal
    occasion.
- **R2 — A lead product per page.**
  - On the country-scoped pages the lead is `items[0]` at size: one source, one LCP candidate, the
    grid continuing from `items[1]`.
  - On the hubs the order is `collator` (alphabetical), which would put "Casket Spray" at the top of
    Sympathy. So each hub needs an authored `leadSku` in its copy row, falling back to the first
    item.
- **R3 — The occasion register drives the hub's first screen.** A dated occasion draws its
  per-country stamps above the fold. The table stays below as the accessible, rankable form.
- **R4 — The category hub's destination picker moves above the grid as stamps** (spec 008 §5.3
  row 3 lists the picker before the products already; this confirms its placement inside the first
  screen).
- **R5 — The occasions index gains a chronological "next six" sheet.** Design-round Q3 keeps
  `collator` order inside each group; the sheet is a new block above the groups.
- **R6 — The destinations hub's envelope** is presentation of the same list (spec 007). The
  postmark prints `destinations.state.guideNotDelivering`, and stops printing for a live country.
- **R7 — `listingView()` carries the destination's state.** The shop postmark needs
  `guide | live`. Today the view has no state, and spec 008 A9 forbids a second view model.
- **R8 — The country category's toolbar moves under the grid.** The count and disclosure stay
  above it, visually hidden or compact.
- **R9 — Spec 003 amendment (founder ruling 2026-10-04; now spec 003 §14 A16, PR 186).** It
  supersedes A14's two-action dialog and §13 Q3's chooser at `/`:
  - `/` answers one fixed permanent redirect to `/en` for everyone. ADR-0006 bans IP redirects,
    and this is not one.
  - The popup offers four languages, with English marked as the default (A16 clause 2) and the
    page's own language marked current.
  - The highlight is drawn as "matches your browser language" only. **IP hint: founder decision
    pending (recommended: drop).** The founder's wording does not address the IP signal; A16 keeps
    A14's `/api/geo` and its RoPA row until the founder decides. (Corrected 2026-10-05: an earlier
    version of this line attributed dropping the IP hint to the founder.)
- **R10 — The mobile popup is a top sheet, not a bottom sheet.** At 390 × 844 the home's sentence
  letter starts at about y 720, so any bottom sheet taller than about 120 px covers it. The brief
  asked for both a bottom sheet of at most 35 % and a sheet that never covers the letter, and no
  bottom sheet can do both. The top sheet (about 255 px, 30 %) covers only the notice bar, the header
  and the category row. Both are drawn; the founder chooses.

## 5. Constraints kept

- **Honesty.**
  - No review, count, rating or "delivering now" for any country.
  - Every country is drawn "Guide · not delivering yet".
  - The live state appears only as a labelled state, unreachable today.
  - No freshness days. The card is "Printed".
  - Florists in the present tense (spec 004 A22). The authored hub intros keep "will be made"
    byte-identical (A22 open item (iii)).
  - No city list on a country we do not deliver to (spec 007).
- **Price.**
  - Every country page's first screen carries one all-in price: the lead's own card price, at
    `formatMoney`'s en-gb output.
  - Hubs show no money, and say why above the fold.
- **Performance.**
  - One photograph above the fold on every page, the listing's first product at 828 px, with
    `fetchpriority="high"`: the page's one preload (spec 008 §5.4, A11).
  - The occasions index and the destinations hub put no photograph above the fold, so their LCP is
    the H1.
  - No carousel. No client island except the popup (≤ 3 KB, lazy, after hydration).
- **Server-rendered.** Every new part is static HTML and CSS. The stamps and postmarks are inline
  SVG and `mask`, and the hint highlight is the popup island's only behaviour.
- **System.**
  - Tokens only. No new token. Logical properties only.
  - The airmail edge stays in its three places.
  - Caveat stays on the product page.
  - `tests/unit/design-docs.test.ts` passes.

## Appendix A — copy for the founder's batch approval

None of this ships until approved. On the artboards each string is followed by `[slot · id]`.

| Id | Where | Proposed | Replaces / note |
|---|---|---|---|
| A1 | Birthday hub, deck under the H1 | Bright flowers for the day itself, made by our florist in the town where they live. | new; one sentence per occasion, authored in the occasion's copy row (e.g. Sympathy uses a verbatim line of its intro instead) |
| A2 | Category hub H1 (`categoryHub.h1`) | *{entity}* to send abroad — "Roses to send abroad", "Hand-tied bouquets to send abroad", "Plants to send abroad" | "Sending {entity}" ("Sending Hand-tied bouquets") |
| A3 | Occasion hub grid heading (`occasionHub.productsHeading`) | {entity} *flowers* — "Birthday flowers", "Sympathy flowers", "Mother's Day flowers" | "Flowers for {entity}". Needs an ICU select or a per-occasion string where "{entity} flowers" reads badly ("I am sorry", "Love and romance") |
| A4 | Hub "about" block, eyebrow and heading | About birthdays · What people *send* (per occasion); About roses · Which rose *says what* (per category) | new; the authored intro moves below the grid under this heading |
| A5 | Category hub decks | Roses: "Red for love, white for a loss, pink and orange for everything in between." · Bouquets: "Tied by hand the morning they go, and handed over wrapped, ready for water." · Plants: "Something that is still there next season." | new |
| A7 | Hand-tied bouquets intro (`copy_category.bouquet.descriptionMd`) | delete "Prices on this page include delivery and local tax, and" → "The size you choose is the size that is made." | the hub shows no price, so the sentence is untrue there |
| A8 | Occasions index eyebrows | "Every occasion, on every calendar" (over the H1) · "Dated elsewhere" (over the undated group) | new; the undated group had no eyebrow |
| A9 | Shop tiles (`shop.root.tileCount`) | "{count} we can make for {country}" with the noun chosen per category ("8 plants", "14 arrangements", "40 bouquets") | "8 bouquets we can make for Poland" on Plants |
| A10 | Country category, label over the toolbar moved under the grid | Change the order | new (R8) |
| A11 | Guide calendar, Rule column | "Same date every year" · "Moves with Easter" · "A set weekday of the month" | `fixed` · `easter_offset` · `nth_weekday`, internal identifiers shown today |
| L1 | Language popup title | Choose your preferred language | replaces `banner.headline` "Would you rather read this page in {language}?" |
| L2 | Popup, desktop sub-lines (`lang` set) | Wählen Sie Ihre bevorzugte Sprache · Wybierz preferowany język | needs the de/pl reviewers |
| L3 | Popup tag on the URL's language | Current | new |
| L4 | Popup tag on the browser's match | Matches your browser (desktop) · Your browser (390) | new |
| L5 | Popup close button, accessible name | Close | new key; same word as `consent.close` |
| L6 | Popup foot | You can change it any time at the top of every page. | new; true: the notice bar carries the switcher on every page |
| B1 | Product add-on (`catalog.addon.card.name` / `.description`) | Printed card · "Your message, printed on a card and tucked into the bouquet." | "Handwritten card" · "written out by hand" (founder batch 2026-10-03, still live) |
| B2 | Hub intros' last sentence (A22 open item (iii)) | Our florist in the recipient's town makes every one by hand and hands it over in person. | "Every order will be made by hand and delivered in person by our florist in the recipient's city." — only if the founder moves the shipped sentence to the present tense |
