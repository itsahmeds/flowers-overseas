# 10 — Seed Data, Taxonomy and Demo Strategy

We have no vendors yet. The site is the pitch we show florists, so it must look like a complete, operating business on day one while telling Google and buyers the truth. This document fixes the category taxonomy (derived from the reference sites), the seed catalogue, the imagery approach, the seed→real data flip, and what is indexable in the demo phase. Related: ADR-0007 (index only true pages), ADR-0014 (imagery, created here), `02` §5, `05`, `06` §5.

---

## 1. Taxonomy: what the European market expects

Derived from the navigation and sitemaps of FloraQueen, Interflora (EE/UK/FR/DE), Euroflorist (NO/PL), Bloom & Wild, GBO, Colvin, Bergamotte, Blume2000, Bonita, Flora Nordica, Aquarelle (`docs/research/competitors-*.md`). Every reference site organises by **occasion**, **product type**, **flower type**, and a **price tier**; roughly half add **colour**; Nordic and Polish sites treat **funeral** as a first-class branch; German and Nordic sites use explicit **price-tier navigation**; Polish sites add **name days** and **"I'm sorry"**.

### 1.1 Six facets, one product record

| Facet | Values (canonical key → en label) | Role |
|---|---|---|
| **Product type** (exactly one) | `bouquet` Hand-tied bouquet · `arrangement` Arrangement (vase/box/basket) · `plant` Plant (orchid, potted) · `funeral` Funeral & sympathy piece (wreath, spray, casket, heart) · `gift_set` Flowers + gift set · `hamper` Gift hamper (Phase 4) · `voucher` Gift card (Phase 4) | Category root per country: `/flowers` shows bouquet + arrangement + plant; `/funeral` separate |
| **Occasion** (many) | Evergreen: `birthday` · `anniversary` · `romance` (love & romance) · `congratulations` · `new_baby` · `get_well` · `sympathy` · `thank_you` · `apology` (I'm sorry) · `just_because` · `wedding` · `graduation` · `housewarming` · `retirement`. Seasonal (per-country dates in `occasion_country`): `valentines` · `womens_day` · `mothers_day` · `fathers_day` · `grandparents_day` · `easter` · `all_saints` · `christmas` · `new_year` · `name_day` · `teachers_day` · market-specific (`sant_jordi`, `fete_des_grands_meres`, `muguet`, `konfirmation`, `student`, `omatag`, `17_mai`) | Occasion hubs + country occasion pages (02 §6) |
| **Flower type** (many; primary one) | `roses` · `tulips` · `lilies` · `orchids` · `sunflowers` · `peonies` · `gerberas` · `carnations` · `chrysanthemums` · `hydrangeas` · `freesias` · `alstroemeria` · `mixed` · `seasonal` | Category hubs `/flowers/roses`; filters |
| **Colour** (many; primary one) | `red` · `pink` · `white` · `yellow` · `orange` · `purple` · `blue` · `pastel` · `vibrant` · `mixed` | Facets (noindex) by default; curated categories where justified |
| **Price tier** (derived per country) | `essential` · `classic` · `premium` · `luxury` mapped to per-country bands (§3) | Filter + "under X" quick links (DE/PL/NO convention) |
| **Style** (one) | `classic` · `modern` · `rustic` · `luxury` · `minimal` | Filter; copy tone |

Attributes on every product: stem-count tiers (S/M/L as stems), vase-included flag, dimensions, freshness guarantee days, care notes, allergen note (for gift sets), substitution class (main flower must be preserved / colour scheme only / florist's choice).

**Add-ons** (separate entity, country-priced): `chocolates` · `vase` · `balloon` · `plush` (teddy) · `wine` (disabled where unlicensed) · `cake` (partner-sourced only) · `card` (free) · `candle` (Phase 4). Delivery options: `standard` · `sunday` · `express_2h` (city-dependent) · `timed_window` (morning/afternoon).

### 1.2 How the reference sites fold into it

| Reference site | Their structure | Maps to |
|---|---|---|
| FloraQueen | Occasions (Birthday, Love & Romance, Anniversary, Congratulations, New Baby, Condolences) · Flowers (Roses, Gerberas, Lilies) · Plants (Orchids, Plant Gift Sets) · Personalized gifts · Destinations · Corporate | occasion + flower_type + `plant`; personalised gifts **dropped** (fulfilment mismatch); corporate deferred |
| Interflora UK | Same Day/Next Day · from £25 · In a Vase · Letterbox · Luxury · colours (Pastel, Vibrant, White) · Occasions incl. Apology, Friendship, Good Luck, Thinking of You, Surprise · Gifts & Plants | delivery options + price tier + `arrangement` + colour + occasions (`apology`, `just_because` absorbs Friendship/Surprise/Thinking of You; Good Luck → `congratulations`); letterbox **dropped** (shipping model) |
| Interflora EE | Occasions incl. School start, For men, Wedding · Flowers: seasonal, roses, mono-colour, modern, budget minis, cut flowers, arrangements, luxury boxes, funeral | style (`modern`), price tier (`essential`), `funeral`; "for men" → an audience tag, not a category (avoid thin audience pages) |
| Fleurop DE | Anlässe incl. Feinkost-Geschenke, Blumenabo, Gutscheine, Jubiläum, Trauer (Blumen, Kränze, Gestecke) · Blumen incl. Fairtrade, Trockenblumen · Sträuße von Floristen | `funeral` sub-types (wreath/spray/arrangement), `voucher` Phase 4; subscription and dried flowers **dropped** at launch |
| Euroflorist NO | Anledning · Begravelse (bårebuketter, dekorasjoner, kranser) · Alle buketter: by price (Under 400 / Fra 400 / Eksklusive), by type, by colour · Gavesett | price tiers as navigation; `funeral` sub-types; `gift_set` |
| Euroflorist PL | Okazje incl. Imieniny, Przepraszam · Kwiaty na pogrzeb (wiązanki, kondolencyjne) · Jakie kwiaty / Jaka cena (do 130 zł / do 200 zł / XL) / Jaka kolekcja (Klasyczne, Nowoczesne, W papierze) | `name_day`, `apology`; style facet; PLN price bands |
| Bloom & Wild | Occasion tags incl. graduation, uni-gifting, under30, pet-friendly · Hampers · Plants · Subscriptions | `graduation`; `hamper` Phase 4; pet-friendly as an attribute |
| Colvin / Bergamotte / Blume2000 | Colour collections, "Menos de 35 €", flower-type collections, city pages; Blume2000 price tiers bis 25/30/40 € | colour facet, price tiers, flower_type |
| Bonita / Flora Nordica | Deep funeral taxonomy (krans, hjerte, bårebukett, kistedekorasjon, church delivery) · "Fra 250 DKK" variants | `funeral` sub-types with delivery-to-church/cemetery address fields; stem tiers instead of "Fra" variants |
| GBO | Destination-first · corporate · wine/chocolate hampers | destination is our URL axis; `hamper` Phase 4; corporate Phase 4 |

**Recommendation:** the six-facet taxonomy above with `funeral` as its own product type and per-country price tiers.
**Rationale:** every reference market is covered without a single competitor-specific category, and facets that would create thin pages (audience, colour) are filters until demand proves them.

## 2. Seed catalogue

### 2.1 Shape

| Parameter | Value |
|---|---|
| Categories (product types shown) | bouquet, arrangement, plant, funeral, gift_set (5) + 10 occasion categories + 8 flower-type hubs |
| Products | **84**: 40 bouquets, 14 arrangements, 8 plants, 10 funeral pieces, 12 gift sets |
| Tiers | Stem-count tiers per bouquet (e.g. 12/18/24 roses; 15/25/35 tulips); arrangements S/M/L by size; plants single |
| Add-ons | 6 (chocolates, vase, balloon, plush, wine [flag], card) with country prices |
| Countries seeded | PL (live at Phase 1), DE, FR, ES, IT, RO, NL, UK (`demo`) |
| Partners | 3–5 demo `fulfillment_partner` per seeded country, `status = demo` |
| Occasion calendar | `occasion_country` rows for all seeded countries, 2026–2030 |
| Holidays | `country_holiday` from a public holiday dataset for seeded countries, 2026–2027 |
| Reviews | **zero** (07 §7) |
| Delivery photos | **zero** on indexable pages; 6 clearly-labelled sample photos only inside the password-protected demo environment |

### 2.2 Naming and copy (our own; no competitor text)

Naming convention: `{Evocative name} — {flower} {form}`, evocative names drawn from places, light and seasons that travel across locales without translation issues (the name stays, the descriptor localises). Examples (en):

| Type | Names |
|---|---|
| Bouquets (roses) | Amber Hour · Vistula Red · Baltic Dawn · Quiet Blush · Northern Light |
| Bouquets (tulips) | Kraków Spring · Sunday Market · First Thaw |
| Bouquets (mixed/seasonal) | Warsaw Morning · Garden Letter · Late Summer Table · Pastel Weekend · Bright Side |
| Bouquets (lilies/peonies/sunflowers) | White Linen · Peony Note · Field of Gold |
| Arrangements | Small Kindness (box) · Mantelpiece (vase) · Welcome Home (basket) · Desk Bloom |
| Plants | Moth Orchid (white/pink) · Peace Lily · Anthurium · Olive Sapling (DE/IT) |
| Funeral | Farewell Wreath · Standing Spray · Casket Spray · White Heart · Sympathy Basket · Grave Bouquet (All Saints) |
| Gift sets | Amber Hour + Chocolates · Baltic Dawn + Vase · Welcome Baby (blue/pink) + Plush |

Descriptions: 60–90 words, written in plain language: what is in it (stems, greenery), how big it is, who it suits, what the florist may substitute. No superlatives that cannot be backed. Every description ends with the local-florist sentence. Written in en first; de/pl by native reviewer (03 §6).

### 2.3 Price bands (retail, incl. VAT and delivery; base list in EUR; country overrides)

| Tier | EUR base | PL (PLN) | UK buyer view of PL product (GBP, converted) | DE (EUR) | RO (RON) | Florist payout share |
|---|---|---|---|---|---|---|
| essential | 35–45 | 149–189 | £30–38 | 39–49 | 175–225 | 55% |
| classic | 46–60 | 199–259 | £39–51 | 50–65 | 230–300 | 58% |
| premium | 61–80 | 269–349 | £52–68 | 66–89 | 305–400 | 60% |
| luxury | 81–120 | 359–529 | £69–102 | 90–130 | 405–600 | 62% |
| funeral pieces | 60–180 | 259–799 | | | | 60% |
| add-ons | chocolates 6 · vase 8 · balloon 4 · plush 9 · wine 14 · card 0 | 25 · 35 · 18 · 39 · 59 · 0 | | | | 40% (we source margin) |

Stem tiers step ~+30% and +60% from the smallest. Prices end in .90/.99 (EUR/GBP) or 9 (PLN). Sunday surcharge +€4 equivalent; Valentine's/Women's Day surcharge +€6 equivalent shown on the date chip. These are seed values; real partner payouts replace `partner_catalog_mapping.partner_payout_minor` on onboarding.

### 2.4 Demo partner profiles (internal only)

3–5 per seeded country, obviously placeholder to us, never rendered on indexable pages: `Demo Florist Warszawa 1`, coverage = city postcode prefixes, capacity 15/day, payout mapping for all 84 products, `status = demo`. The password-protected demo environment shows them with generic names ("Your florist in Warsaw") and a stock-style portrait marked "sample". Real partner cards appear only when `status = active` and the partner has opted in to a public profile.

### 2.5 Delivery windows and cutoffs (seed)

| Country | Same-day cutoff (local) | Days | Sunday | Notes |
|---|---|---|---|---|
| PL | 14:00 | Mon–Sat | peak days only | Kraków/Wrocław/Gdańsk/Poznań next-day at launch |
| DE | 13:00 | Mon–Sat | no | |
| UK | 14:00 | Mon–Sat | no | (destination later) |
| FR | 13:00 | Mon–Sat | Paris only | |
| ES/IT | 13:00 | Mon–Sat | limited | |
| RO | 13:00 | Mon–Sat | no | |
| NL | 14:00 | Mon–Sat | no | |

## 3. Imagery (ADR-0014)

| Option | Cost | Consistency | Legal | Honesty | Verdict |
|---|---|---|---|---|---|
| Licensed stock | €300–800 for 84 × 3 images (or subscription) | Low (mixed styles, backgrounds) | Licence-bound; competitors use the same images | Not our bouquets | no |
| One-day shoot with a Lahore florist | €300–600 + travel; 84 arrangements is 2–3 days | High | We own everything | Real flowers but not the destination florist's work; Pakistani availability differs from European seasonal stock | possible for a subset |
| **AI-generated with a locked style guide** | ~€50–150 in generation credits + founder time | Very high | We own outputs (check generator terms for commercial use); no competitor copyright risk | Must be labelled honestly and swapped for real delivery photos as they arrive | **yes** |

Style guide (`content/imagery/style-guide.md`): neutral warm-grey seamless background; soft north-light from the left; bouquet centred at 4:5 with 8% margin; consistent paper wrap in kraft or white; no hands, no faces, no text; one hero angle + one detail + one "in a home" context shot per product; colour-accurate to the product's colour facet; stem count visually plausible for the tier; funeral pieces on a neutral stone surface; plants in a plain terracotta or white pot. Generation prompt template stored per product with seed so images can be regenerated consistently; outputs reviewed for anatomy errors (impossible stems, melted petals) before import; AVIF/WebP derivatives produced at import.

Honesty rules: product images are labelled "Example arrangement, your florist hand-makes each one" on the PDP; the "Real deliveries" module uses only approved `delivery_proof` photos; the demo environment's sample photos are watermarked "sample". A short Lahore shoot is kept as an option for hero/brand imagery (hands, wrapping, atmosphere) where AI output looks synthetic.

**Recommendation:** AI-generated catalogue imagery under a locked style guide, replaced progressively by real delivery photos; optional small real shoot for brand/hero shots.
**Rationale:** it is the only option that gives 84 consistent, rights-clean images inside the Phase 0 budget and calendar, and the honesty label keeps it compliant with the "example photo" norm every relay competitor already uses.

## 4. Seed → real is a data change

| Entity | Seed state | Real state | What changes | What does not |
|---|---|---|---|---|
| `country` | `status = demo` | `status = live` | one column; triggers `invalidate(['country:PL'])`, sitemap regen, index flags | templates, routes |
| `fulfillment_partner` | `status = demo`, generic profile | `status = active`, real profile, coverage, capacity, payout details | rows | routing code |
| `partner_catalog_mapping` | seed payouts | negotiated payouts per product | rows | pricing code |
| `country_price` | seed bands | reviewed retail per country | rows | |
| `product` | seed catalogue | same products, or partner-specific additions (`partner_only = true`) | rows | |
| `product_media` | AI imagery | AI imagery + real photos linked from `delivery_proof` | rows | image pipeline |
| `country_locale_content` | guide (demo wording) | live wording (same table, `state = live` variant) | rows | corridor template reads state |
| `review` | none | real | rows | |
| Checkout | demo guard flag on | flag off; Stripe live keys | feature flag + env | checkout code |

Seed scripts are idempotent (`upsert` by natural keys: product `sku`, partner `code`, country `iso2`), run in CI for preview/staging, and never touch rows with `source = 'real'`. Onboarding a florist is: create partner → coverage → payouts → test order → `active`. Nothing in `src/` changes.

**Recommendation:** enforce in review that no PR flips a country or partner status through code or migration; status changes happen in admin and are audit-logged.
**Rationale:** the whole premise of "seed first, real later" is that go-live is an operations action, not a deploy.

## 5. What Google sees (ADR-0007 restated with mechanics)

| Surface | Production (indexable) | Production (exists, noindex) | Demo environment (password) |
|---|---|---|---|
| Corridor guides for seeded countries | yes, honest guide state with waitlist | — | full mock shop state |
| PL corridor before live | guide state | — | live-looking |
| Country shop/category/occasion/product pages for `demo` countries | — | rendered with `noindex,follow`, "coming soon" pricing shown as "from" estimates, no buy button | full grid, buyable via mock checkout |
| For-florists set, how it works, help, about, legal, blog | yes | — | same |
| Checkout | — | demo guard: no charge, no Stripe call | mock order → vendor inbox |
| Reviews, delivery photos, partner cards | none | none | samples watermarked |

Option (b) "index the full site with honest availability states" was rejected: thin, unbuyable product pages across seven countries would be the first thing Google learns about the domain, and "coming soon" commerce pages are a documented quality-signal problem. Trade-off accepted: money pages start indexing only when a country flips; mitigated by strong internal links from already-indexed guides.

## 6. Vendor pitch surface

| Element | Spec |
|---|---|
| `/for-florists` (en, pl, de) | H1 "More orders for your shop, none of the marketing" · why partner (new customers from abroad, no payment risk: we pay you, you never chase a card) · how it works (order arrives on WhatsApp/email → accept in one tap → make and deliver → photo → paid weekly) · payouts (fixed per product, weekly, in your currency, statement PDF) · what we handle (payment, fraud, customer service, translation, refunds) · what we ask (quality, photo, on-time, substitution transparency) · FAQ (exclusivity: none; minimums: none; fees: none) · application CTA · walkthrough link |
| SEO target | "florist partnership", "become a partner florist", "zlecenia dla kwiaciarni", "Aufträge für Floristen"; `WebPage` + `FAQPage` schema; linked from footer and corridor pages of recruiting countries |
| Conversion treatment | Above-the-fold application CTA; social proof block hidden until real partners consent; calculator "3 orders/week × 149 zł = X/month"; trust: company details, contract summary, payout schedule |
| Walkthrough `/for-florists/how-orders-work` | Screens of buyer flow, the WhatsApp/email order card, the magic-link accept screen, photo upload, statement; video later |
| Mock order demo | Founder places an order in the demo environment during the call; it lands in `/demo/vendor-inbox` (the florist can be given the link on their phone) and, optionally, on the founder's WhatsApp as the real message format |
| Application form | Business name, city, coverage radius/postcodes, capacity/day, weekend/holiday availability, business registration number, Instagram/website, 3 photos, preferred channel (WhatsApp/email), language |

**Recommendation:** ship §6 in Phase 0 with real company details and no fake testimonials.
**Rationale:** florists search too, and the page is both a recruiting funnel and the trust anchor for the demo call.

## 7. Risks (flagged)

| Risk | Guard |
|---|---|
| AI imagery looks synthetic or shows impossible flowers | Human review gate at import; style guide; optional real shoot for hero shots |
| Seed prices unrealistic vs real PL florist costs | Validate the PL band with the first three florists before Phase 1; payouts are per-partner data |
| Demo environment leaks into indexing | Password protection at the host + `noindex` + robots disallow on the staging domain |
| Seed data with `source = seed` surviving into live reporting | Reporting excludes `demo` partners/countries; nightly check |
| Taxonomy growth creating thin pages | New category or occasion requires a spec and the six-product rule (02 §6) |

**Recommendation:** approve the taxonomy and seed shape so `006 seed catalogue import` can be specified.
**Rationale:** the taxonomy is the last structural decision the URL scheme depends on; everything after it is content.
