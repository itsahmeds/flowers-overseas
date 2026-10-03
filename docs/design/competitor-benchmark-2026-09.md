# Competitor benchmark, 2026-09-21 — the measurements and the argued change list

The founder said the site looks worse than the competition and called it cluttered. The first
diagnosis offered to him was wrong: chrome before content at 1280×900 is **183 px / 20.3%** on
production, not the 377 px / 42% first reported. He chose a measured competitor pass over pointing
at things himself, so this is that pass.

**Method.** Every figure below was read from the live DOM with `getBoundingClientRect()` in a
browser at an emulated **1280×900** and **375×812** on **2026-09-21**. Nothing was estimated from a
screenshot. Our own numbers come from <https://flowers-overseas.vercel.app>.

**Definitions.** *Chrome* is the height of the stacked bars above the first page content.
*Preamble* is the distance from the bottom of the chrome to the top of the first product
photograph. *Photo share* is the photograph's area as a fraction of the whole card.

**Artboards.** `benchmarks/benchmark-measurements.dc.html` draws the measurements; six more draw
current and proposed for the three page types, desktop and mobile. They are on the root canvas in a
row at `y = 183000`. They are **decision artefacts**: an approved change is redrawn on the owning
page wireframe under `wireframes/`, and that is what an implementer builds from.

---

## 1. Who was measured, and why

| Site | Why it is here |
|---|---|
| **FloraQueen** (`floraqueen.com`) | The one competitor with our exact model: one brand, many languages, a florist in the recipient's country making the bouquet. Named in `plan/02` §1 and studied on 2026-09-09; still the closest peer. |
| **Interflora UK** (`interflora.co.uk`) | The incumbent whose `/category/international/{country}` pages `plan/02` §1 calls our quality floor for a country page. Named there; still fits. |
| **Euroflorist NL** (`euroflorist.nl`) | The European site-per-country model. `euroflorist.com` is not a storefront, so a national site is read instead — the same substitution the 2026-09-09 study made and for the same reason. |
| **Bloom & Wild** (`bloomandwild.com`) | **A deliberate addition, not a substitution.** It is not cross-border, and it is included because it is the visual standard a European buyer's eye is calibrated by and the only one of the four a designer would call well made. When the founder says "looks worse than competitors", this is the comparison his eye is running. It is named in `plan/02` §1 already. |

Not re-measured: 1-800-Flowers (not European), Fleurop, Teleflora, Poczta Kwiatowa, GiftBasketsOverseas,
InternetFlorist. The 2026-09-09 study in `benchmarks/` covers their *content patterns* and this pass
does not restate it; this pass measures **space**, which that study did not.

**Consent sheets.** FloraQueen, Interflora UK and Euroflorist NL show a sheet with no plain refusal;
none was accepted and none was dismissed, and each sits at the bottom or centre of the window and
changes no figure above it. Bloom & Wild offers "Reject all" and it was taken.

---

## 2. The measurements

### 2.1 Chrome before content

| Site | Desktop 1280×900 | Mobile 375×812 |
|---|---|---|
| FloraQueen | **128 px** · 14.2% | **57 px** · 7.0% |
| Bloom & Wild | 143 px · 15.9% | 154 px · 19.0% |
| Euroflorist NL | 174 px · 19.3% | 107 px · 13.2% |
| **Flowers Overseas** | **183 px · 20.3%** | **245 px · 30.2%** |
| Interflora UK | 200 px · 22.2% | 156 px · 19.2% |

**Desktop: the complaint is not supported.** 183 px is mid-field — 17 px below Interflora's and 9 px
above Euroflorist's. No change to desktop chrome is proposed.

**Mobile: the complaint is supported, by a wide margin.** We spend 89 px more than the next worst and
188 px more than the best. 113 of our 245 px are one utility strip that stacks into three rows at
375: the delivery-dates sentence (36), a telephone number with its hours (44), and a row carrying
four language links and a currency chip (33). The header below is 132.

### 2.2 The listing page

| Page | Chrome | Preamble | First photo | First price | Card | Photo share |
|---|---|---|---|---|---|---|
| FloraQueen collection · 1280 | 118 | 222 | 340 · 38% of the fold | 790 | 411×477 | 377×377 · **72.5%** |
| Bloom & Wild · 1280 | 143 | 276 | 419 · 47% | 908 | 387×583 | 387×387 · 66.4% |
| Interflora UK · 1280 | 200 | 435 | 635 · 71% | 1143 | 294×672 | 294×500 · 74.4% |
| **Ours, `/en/poland/flowers` · 1280** | **183** | **466** | **649 · 72%** | **1026** | **266×475** | **266×333 · 70.1%** |
| Bloom & Wild · 375 | 154 | 232 | 386 · 48% | 815 | 1-up | 327×327 |
| Interflora UK · 375 | 156 | 589 | 745 · 92% | — | 359×580 | 359×436 · 75.2% |
| **Ours · 375** | **245** | **534** | **779 · 96%** | **1023** | **160×362** | **160×199 · 55.0%** |

On desktop our card is inside the field's range (70.1% against 66.4 / 72.5 / 74.4) and our preamble
is worse than two of three but not an outlier — Interflora's is 435 to our 466.

On a phone the card falls to 55.0% photograph, the lowest figure in the study, because the
52-character honesty label wraps to three lines in a 160 px column and takes 60 px of a 362 px card.
And **every one of the 252 px of body prose we print above the grid at 375 is prose neither
comparator prints at all**: Bloom & Wild drops its intro paragraph below 768; Interflora folds its
behind a "Read more".

Our preamble, broken out (desktop / mobile): breadcrumb 20 / 20 · `<h1>` 44 / 30 · intro paragraph
**72 / 96** · ordering-is-not-open notice **48 / 96** · `<h2>` 36 / 25 · ordering sentence **40 / 60**,
plus gaps.

### 2.3 The home page

| Home page | Chrome | First screen below it | First product photo | Price anywhere on the page | Anchors in the document |
|---|---|---|---|---|---|
| FloraQueen · 1280 | 128 | 400 px photograph + a search field | 520 | €62,90 at 833 | **319** |
| Interflora UK · 1280 | 200 | a date/address/occasion bar, then a 452 px photograph | 826 (category discs) | below the fold | **249** |
| Bloom & Wild · 1280 | 143 | a five-tile photographic mosaic from 217 | 217 | below the fold | **159** |
| Euroflorist NL · 1280 | 174 | 600 px photograph | 1303 | below the fold | not counted |
| **Ours, `/en` · 1280** | **183** | **820 px photograph carrying the H1 and the finder** | **1112, unpriced** | **none — zero prices on the whole document** | **19** |

**The single largest gap in this study is the last column**, and it is a ranking finding before it is
a design one. Our locale home carries 19 anchors. Seven are destination links, one the brand, one a
`tel:`, three language links. **Not one of them points at `/en/poland/flowers`** — a live page
holding 84 priced products. The header's ten category items, its search field and its three account
affordances are `<span>` elements: **fourteen of the fifteen things that look clickable in our
header do nothing, carry no link and pass no weight** (`plan/02` §11). That is also the most
plausible cause of "it looks worse": a page reads as unfinished when the things on it do not
respond.

Our listing page carries 35 anchors, 23 of them in `<main>` (20 category links, 3 breadcrumb). The
twelve product cards are **not** links — correctly, while no product page exists.

Two further observations, recorded rather than designed around:

- The home page labels its product row **"Trending now / Most sent this week"** on a site that has
  taken no orders, while `/en/poland/flowers` says in as many words "It is not a ranking by sales,
  by popularity or by payment", and the disclaimer under the row itself says ranking "switches on
  once we have" real orders. See change **H5**.
- The telephone number in the utility strip is **+1 (213) 592-5150**, a United States number, on a
  European site quoting CET hours. Not a design question, but the founder should see it.

### 2.4 The product page

**Ours is not shipped and was not measured.** `src/app/[locale]/` routes `[segment]/[child]` and no
deeper, so no product URL resolves. The comparison is of **block order** against
`wireframes/product-desktop.dc.html`, and that is said on the artboards too.

| | Order |
|---|---|
| **FloraQueen, measured at 1280×900** | chrome 118 → gallery and `<h1>` 138 → size options each printing an all-in price 226–322 → add-ons with prices 440 → **Add to cart 620** → description behind two accordions at 701 and 826. The whole decision is inside 900 px. |
| **Ours, as drawn** | breadcrumb → destination line → gallery → `<h1>` → **description and care (60–90 authored words)** → tier selector → date picker → delivery facts → add-on prices → price summary. The authored prose sits between the name and the first price. |

---

## 3. Where the evidence contradicts the impression

Said plainly, as the brief asked.

1. **Desktop chrome is not the problem.** 183 px is mid-field. The 377 px / 42% figure that started
   this was wrong and the correction stands.
2. **The desktop product card is not the problem.** 70.1% photograph is in range and above Bloom &
   Wild's 66.4%.
3. **Leading with one large photograph is not the problem.** All four comparators do it, and none of
   the four puts a priced product above the fold on a home page. Our 820 px hero is the largest
   (against 600, 452 and 400) and it is the one place our real photography is used. It is trimmed on
   the proposal to buy the finder's button, not because it is wrong.
4. **The 72 captioned placeholders are a known state**, and nothing here is designed around them.
5. **The breadcrumb costs 20 px and no comparator prints one on a listing page.** It stays: it is the
   `BreadcrumbList` source and ranking is priority 1. Measured, considered, kept.

What *is* supported: **mobile chrome** (245 vs 57–156), **the mobile listing preamble** (96% of the
first screen before any goods), **the mobile card's photograph share** (55.0%, last in the set), and
— most of all — **the number of live links on the home page** (19 vs 159–319).

---

## 4. The argued change list

`Rearrangement` = every fact and every word survives, in a different place.
`Removal` = something stops being printed in that position, and needs the stronger argument.

### Home page

| # | Change | Kind | Argument |
|---|---|---|---|
| **H1** | The header's ten category items become anchors for the seven with a live destination; the three with nowhere to go keep a muted treatment and say so. | Rearrangement | 19 anchors against 319 / 249 / 159, and **no anchor at all reaches the live shop**. Fourteen of fifteen header affordances are inert, costing every internal link `plan/02` §11 expects from the home page. |
| **H2** | The dead search field and the three dead account affordances keep their position and take muted ink; search gains the visible words "Opens with the shop". | Rearrangement | They cannot be made to work, so the honest options are to remove them or to say what they are. Saying it costs nothing, keeps the layout stable for the day they work, and turns four apparent faults into four facts. The screen-reader-only sentence already there becomes visible to everyone. |
| **H3** | Hero photograph 820 px → 500 px; the delivery-dates line moves onto the finder button's row. | Rearrangement | No word and no control lost. Buys H4. Ours is the largest hero in the set; 500 is still the biggest element on the page. |
| **H4** | The unpriced row at 1112 becomes a **priced** six-card row of Poland products inside the first screen. | Rearrangement | The row and its products already exist; the price exists too — 229.00 PLN for Amber Hour, one click away. `CLAUDE.md`'s density rule already requires priced rows under the hero and forbids a card without a price. Scoping the row to the one live destination is what makes the price sayable, so the destination-less-hub rule is preserved rather than broken. **Needs a spec decision (008 owns what a home row may claim), not just a drawing.** |
| **H5** | Delete "Trending now / Most sent this week"; replace with "What we can make for Poland today" plus the ordering sentence the listing page already uses. | **Removal** | We have taken no orders, so nothing has been most sent this week: the claim is unevidenced. It contradicts our own listing page and its own disclaimer. Spec 008 §8 / AC-9 already deleted exactly this language from the navigation ("Best sellers" → "Our selection") on the ground that Omnibus Art. 6a makes an unevidenced popularity claim unfair when an honest alternative is free. The row, its five products and the disclaimer stay; only the claim goes. |
| **H6** | Desktop chrome, the utility strip, the four language links, the currency chip. | **Kept** | Mid-field. Nothing to win. |
| **M1** | Mobile: the utility strip collapses from three rows (113 px) to one (44 px) — delivery-dates sentence, current language, currency chip. | Rearrangement | Bloom & Wild does locale and currency in one control ("UK (£)"); Euroflorist in one ("NL"). Saves 69 px on **every page**. |
| **M2** | Mobile: the three other language links move to the footer. | **Removal** | All four locales stay reachable, crawlable, server-rendered and one tap away — the footer already carries every one as an ordinary `<a>`, so hreflang reciprocity, the sitemap and ADR-0006 are untouched and no IP is read. What changes is a position on a 375 px screen, where four side-by-side language links take a 33 px row above the logo that no competitor spends on anything. Desktop keeps all four in the strip. |
| **M3** | Mobile: the telephone number and its hours move to the footer and the help page. | **Removal** | 44 px — 5.4% of the phone viewport — at the most valuable position on the site, above our own name. **None of the four sites measured puts a telephone number above its logo on a phone.** It stays in the desktop strip, the footer and on contact. |
| **M4** | Mobile: hero 300 px → 225 px, and the three finder fields plus **Continue** fit above the fold (top 748, foot 798). | Rearrangement | Today the single call to action of the page has never been seen without a scroll. Fixed by moving pixels. |
| **M5/M6** | Mobile: the category row becomes links; the 56 px row itself is kept. | Rearrangement / Kept | Once M5 makes it work it is the most valuable 56 px on the screen and the only route into the shop. |

### Country shop root (listing)

| # | Change | Kind | Argument |
|---|---|---|---|
| **L1** | Delete the intro paragraph's first sentence ("Our florist in the recipient's town makes the bouquet the morning it is delivered and hands it over in person."). | **Removal** | It is not lost: it is already printed **verbatim** 2,700 px lower on the same page, as the second sentence of "How it reaches Poland". We were paying 72 px (96 on mobile) of the first screen to say one sentence twice. Its companion sentence about the all-in price is unique and is kept, moved into the summary line under the heading. |
| **L2** | The ordering-is-not-open notice becomes a `Chip` on the heading's line. | Rearrangement | Every fact survives and gains prominence: at the heading's baseline it is inside the first thing anyone reads; at 431 it was the fourth paragraph of a stack. **This notice may never disappear and does not.** |
| **L3** | The second `<h2>` and the ordering sentence merge into the `<h1>` block as one line carrying the count, the all-in-price fact and the ordering fact. | Rearrangement | Two headings 257 px apart said nearly the same thing. `id="our-selection"` (spec 008 AC-9) moves to the `<h1>` unchanged. Every word of the ordering sentence is kept. Adds the count (84) the page computes and did not show at the top. |
| **L4** | Net: first photograph 649 → ~343; first price 1026 → ~700; preamble 466 → 160. | Rearrangement | Puts us between FloraQueen (222) and Bloom & Wild (276) instead of behind Interflora (435), with a full row of photographs and the first prices inside the fold. |
| **L5/L6** | The desktop card, the 4:5 photograph, the all-in-price line, the honesty label and the breadcrumb. | **Kept** | 70.1% photograph is in range. The label is a founder ruling and a spec 006 requirement. The breadcrumb is the `BreadcrumbList` source. |
| **LM1–LM4** | Mobile: chrome 245 → 176 (M1–M3); the duplicated sentence goes (L1); the notice becomes a chip under the `<h1>`; heading and ordering sentence collapse into one `--text-xs` line. | Rearrangement / Removal | Same arguments, worth more at 375 where each paragraph is four lines. The notice ends **higher** on the page than it is now (~270 vs 503). |
| **LM5** | The card photograph 199 → 209 px and the honesty label set at `--text-xs`, taking the photo share from 55.0% to ~66%. | Rearrangement | 55.0% is last in the study and the cause is measurable: a 52-character label wrapping to three lines in a 160 px column takes 60 px of a 362 px card. The label keeps **every word**; only its type size changes, to the size the label style already uses. |
| **LM6** | Net: grid 779 → ~382; first price 1023 → ~600. | Rearrangement | Two whole photographs and two prices above the fold, where 33 px of one photograph is today. Level with Bloom & Wild (386) instead of Interflora (745). |
| **LM7** | Two cards across on mobile, not one. | **Kept, flagged** | Both comparators go one-up at 375 (327 px square; 359×436), buying a far larger photograph and halving how many products a thumb passes. Two-up with LM5 reaches Bloom & Wild's ratio at half the size. The evidence does not decide it. **Founder's call.** |

### Product page (drawn, not shipped)

| # | Change | Kind | Argument |
|---|---|---|---|
| **P1 / PM2** | The 60–90-word description and care block moves from between the `<h1>` and the tier selector to below the delivery facts. | Rearrangement | FloraQueen reaches priced size options at 226 and its buy control at 620, with the description behind accordions at 701 and 826. We put four to six lines of prose between the name and the price. The block keeps every word and stays in the server-rendered HTML in full — a position change, not a disclosure. **Moved rather than collapsed on purpose:** a `<details>` is the field's answer and it shifts the page when it opens; the brief holds CLS at zero. |
| **P2** | The price summary moves up to sit directly under the tier selector. | Rearrangement | It is the number the buyer is asked to accept and it is currently the tenth block. "Price shown = price charged" is a project rule; the price belongs where the decision is made. |
| **P3 / PM3** | The destination line moves from above the gallery to beside the name. | Rearrangement | Same words, same link. It is the first thing a cross-border buyer confirms, and beside the name it is read. |
| **P4 / PM4** | Gallery 400 → 440 px desktop, 250 → 280 px mobile. | Rearrangement | Consequential on P1 and P3. Bloom & Wild gives a product 327 px of width on a phone in a *list*; a product page should not give it less. Fixed ratio, so the placeholder-to-photograph swap still costs zero layout shift. |
| **P5 / PM5 / PM6** | The `unavailable` date state, the demo sentence in place of a button, no countdown, the vase exclusion, the sticky mobile summary, the honesty label under the photograph. | **Kept** | Spec 009 §13 Q4 and Q6 settled these and this pass found no evidence to reopen either. FloraQueen's date-and-fee chips remain the best single element in the field and remain unreachable until a destination has a cutoff. |

---

## 5. Constraints checked against every change above

| Constraint | How it holds |
|---|---|
| Four locales reachable and crawlable; no IP redirects (ADR-0006) | M2 moves three language links from the mobile strip to the footer, which already carries all four as ordinary `<a>` elements. Desktop keeps all four in the strip. Nothing reads an IP, nothing redirects, hreflang and the sitemap are untouched. |
| The `datesPending` line may move but never disappear | It keeps the top-left of the utility strip on every frame, and appears again beside the finder button on the home page. |
| "Example arrangement · our florist hand-makes each one" and the placeholder captions never disappear | Kept on every card that shows an `ai` asset (spec 008 §14 A2, one per card) and under the product gallery. LM5 changes its type size and nothing else. |
| No literal user-facing strings in components; no physical CSS properties; server-rendered HTML for anything indexable | The artboards use logical properties throughout, quote shipped copy verbatim where it exists, and propose no client-rendered content. P1 moves the description rather than collapsing it, so it stays in the HTML. |
| The header ships no JavaScript and CLS stays 0 | Every header change is a link, a colour or a row that is removed at build time. No disclosure widget, no measurement-driven layout, no animation. H1's anchors replace `<span>` elements of the same size. |
| `our-selection` is fixed by spec 008 AC-9 | L3 moves the id to the `<h1>` of the same section; the id string does not change. |
| Price shown = price charged, VAT and delivery included | H4 prints the same all-in PLN figures `/en/poland/flowers` already publishes, with the same "Includes VAT and delivery" wording. |

## 6. What this pass could not settle

1. **H4** needs a spec decision from 008 on what a locale-home product row may claim when one
   destination is live and six are not.
2. **LM7**, one card across or two on a phone, is a founder preference; the measurement supports
   either.
3. **The product page** cannot be benchmarked properly until it ships. When it does, it should be
   measured again against the same four sites at the same two widths.
