# 02 — Category and shop grid

Method as in `docs/design/homepage-v1/README.md`. Live fetches **2026-09-09**; fallbacks to `docs/research/competitors-*.md` (**2026-09-05**) are marked.

Access log:
| Site | URL fetched 2026-09-09 | Result |
|---|---|---|
| FloraQueen | https://www.floraqueen.com/collections/flowers-poland | 200, readable |
| Euroflorist PL | https://www.euroflorist.pl/kategoria/okazje/urodziny | 200, readable |
| Interflora UK | https://www.interflora.co.uk/category/birthday-flowers | 200, readable (grid itself client-rendered) |
| Interflora PL | https://www.interflora.pl/ (nav + category URLs) | 200, partial |
| 1-800-Flowers | https://www.1800flowers.com/international-flower-delivery | 200, readable |
| Teleflora | https://www.teleflora.com/ | **HTTP 403** |
| Bloom & Wild | — | **BLOCKED**; using 2026-09-05 |
| InternetFlorist | .net NXDOMAIN / .biz 403 | using 2026-09-05 |
| Poczta Kwiatowa | all URLs | **404 to WebFetch** (bot block) |

---

## 1. Per-competitor table

| | FloraQueen (destination grid) | Euroflorist PL (occasion grid) | Interflora UK (occasion grid) | Interflora PL | 1-800-Flowers | Bloom & Wild | Fleurop DE | InternetFlorist |
|---|---|---|---|---|---|---|---|---|
| **Above the fold** | H1 "Send Flowers to Poland \| Fast Delivery Available" → intro line → trust line ("4.8/5 Rating (+18K reviews)", "Customer favourite since 2005") → sort + filters → grid | H1 "Kwiaty na urodziny" → emotional intro → same-day CTA → sort dropdown → grid | H1 "Birthday Flowers Delivery" → intro → **date + address finder above the grid** → grid | Category nav (Kwiaty / Prezenty / Na okazje) with countdown strip and "Kup do 17:00 - dostawa dziś!" | Headline + benefit bullets ("Delivery to over 100 countries", "Same Day & Next-Day Delivery Available in Select Countries") → trending products → A–Z country list | Tag/collection grid, cookie banner first | Grid with "Noch heute lieferbar" badges | Grid with "Prices And Products Depend On Delivery City & Date" banner |
| **Filters / sort** | Sort: Featured, Best Selling, Title A–Z / Z–A, Price ↑/↓, Date ↑/↓. Filters: By Occasion (Birthday, Congratulations, Love & Romance, Thinking of You), Flower Mood (Roses, Lilies, Sunflowers, Gerberas, Carnations, Chrysanthemums, Alstroemerias), Plant Mood ("Easy Going", "Needs Some Love") | one dropdown, "Domyślne sortowanie"; age-based sub-links (18, 30, 40, 50, 60, 70, 80, 90) and style/price sub-collections | **no sort visible**; the two "filters" are delivery date and address | not visible | Occasion menus cross-cut by product type, recipient (Mom/Her/Him/Kids) and price band (Under $30/$50/$75) | tag collections (`/send-flowers/tagonly/{tag}`), robots-disallowed `tag/*` still in the sitemap | static colour-filter URLs (`/alle-blumenstraeusse-rosa`), 15 in the sitemap | price bands in destination currency |
| **Card anatomy** | image, name, flower composition ("Carnations"), review count, badges ("Includes FREE gifts", "Premium gift", "Top for Mother's Day"), **"Order Now" button on the card** | image with overlay badges ("Nowość", "darmowe czekoladki"), name as link; price format not visible in fetch | card details not in server HTML (client-rendered) | price e.g. "157,70 zł" with "Darmowa dostawa" label | image, name, price, "Same-Day" flags | image, name, price, **per-product rating + count** | image, name, price, "Noch heute lieferbar" | image, name, price in destination currency, **"DELIVERY TODAY" / "DELIVERY TOMORROW" badge per card** |
| **Grid size** | 49 results, paginated | not counted | not visible | 6,124 products site-wide | 711 products (UK) | 398 products | 214 results for Warsaw | |
| **Price / VAT / delivery wording on the grid** | **no price or VAT wording visible on the grid at all** | not visible on cards; delivery messaging is about speed, not cost | none | "Darmowa dostawa" per card | none on the hub | product price only | "ab 39,00 EUR" on corridor grids; MwSt/Versand wording on PDP | destination currency + inline EUR/USD/GBP conversions |
| **Trust elements** | rating line repeated above the grid; "Worldwide delivery to 100+ countries" | FAQ block, policy links, payment logos in footer | "What our customers are saying" testimonial block; local-florist claims | three-platform review strip (eKomi / Trustpilot / Google) | "100% Smile Guarantee", "Dedicated 24/7 Customer Service" | Trustpilot-style widget, B Corp | Trusted Shops | Trustpilot widget, "120+ Countries" |
| **Reviews handling** | company score reused on every category page | none on grid | testimonials, unattributed in fetch | company scores only | none in server HTML | per-product ratings on cards | company-level | company-level |
| **Add-ons surfaced on the grid** | "Includes FREE gifts" badge | "darmowe czekoladki" badge | not visible | not visible | product-type cross-cuts (Food & Keepsakes) | Hampers / card shop as sibling collections | gift sets as SKUs | none |
| **Urgency on the grid** | "Next-Day Delivery — Most popular choice"; "Send love today" | "Urodziny są już dzisiaj? … Bez obaw, jeszcze zdążysz"; newsletter "10% taniej" | "Same day delivery requires you to order by 3pm, so make sure you get your order in before!" | live countdown timer to the 17:00 cutoff | "Summer's Final Bloom Sale: Save Up to 30%" | "£10 off your first order" | "Noch heute lieferbar" | "DELIVERY TODAY" badges |
| **Below-grid content** | Delivery Options (Express / Next-Day / Scheduled) → "How Delivery Works" 3 steps → city list (Warsaw, Wrocław, Poznań, Bydgoszcz, Gdańsk) → 6-question FAQ → trending city/country/occasion/flower links | editorial ("Najpiękniejsze kwiaty na urodziny", gendered guidance) → 9-question FAQ → cross-links to cakes, alcohol, local florists | birth-flower-by-month editorial with links → FAQ → related occasions → international (130+ countries) | not visible | trending products by country → A–Z country list | blog links | FAQPage on city pages | per-country FAQ, province and city links |
| **Mobile behaviour** | not verified | not verified | grid client-rendered | not verified | client-rendered | ~4 s to content | not verified | not verified |
| **Add-to-basket on the card?** | **yes** ("Order Now") | no | no | no | no | "Send" per card | no | no (city gate) |

---

## 2. What we take

1. **Delivery date + destination controls sitting above the grid, not in a filter drawer.** Interflora UK puts "Delivery date" and "Address" at the top of an occasion page (interflora.co.uk/category/birthday-flowers, 2026-09-09). For us the same slot carries destination country (already in the URL) and date, so the grid can honestly badge availability.
2. **A per-card availability badge computed from the cutoff.** InternetFlorist's "DELIVERY TODAY" / "DELIVERY TOMORROW" per card, and Fleurop's "Noch heute lieferbar", are the two clearest. Ours is already specified (`plan/04` §6) — the field evidence is that it works as a card-level element, not a page-level banner.
3. **Occasion sub-collections that match real search demand.** Euroflorist PL's age splits (18/30/40/…/90) and Interflora UK's `/category/18th-birthday`, `/50th-anniversary`, `/birthday-flowers-for-mum` are cheap long-tail wins built from one product set — but only where the collection is genuinely different (see drops).
4. **A short, honest "how delivery works" block under the grid.** FloraQueen's three-step block plus a delivery-options explainer is the only below-grid content in the set that answers the cross-border question rather than padding word count.
5. **Cross-links to sibling occasions and to cities at the foot of the grid.** Euroflorist PL and Interflora UK both do it; it is our internal-link flow to money pages (priority #1).
6. **Editorial that is actually reference material.** Interflora UK's birth-flower-by-month table earns its place. Our equivalent per destination: occasion dates with order-by cutoffs (already in the homepage round-6 additions).
7. **Sort options that a buyer would actually use.** FloraQueen's set minus the noise: bestsellers (destination-scoped), price ↑, price ↓, newest. Drop "Title A–Z".
8. **Composition line on the card.** FloraQueen prints the main flower ("Carnations") under the name — useful for a gift buyer scanning, and free from our product data.

## 3. What we drop and why

1. **A grid with no prices.** FloraQueen's Poland grid shows no price and no VAT/delivery wording at all (2026-09-09). Price transparency is priority #3 and `plan/07` §4; every card carries an all-inclusive "from" price in the buyer's currency.
2. **Add-to-basket on the card.** FloraQueen's "Order Now" and Bloom & Wild's "Send" skip the date decision. Our card links to the PDP because the date must be chosen before the basket (`plan/04` §6).
3. **Faceted filter URLs left indexable.** Bloom & Wild disallows `/send-flowers/tag/*` in robots while listing those URLs in the sitemap; FloraQueen blocks `?color=`/`?price=` but keeps duplicate colour collections. Facets are query params and `noindex` (`plan/02` §7); curated colour/type collections are separate authored pages.
4. **One product grid recycled across every destination.** FloraQueen's 12.6k `flowers-{city}` collections and Interflora UK's 143 country pages share a single grid. Our shop grid is `country_price`-scoped and only indexes where the country is live with ≥6 products.
5. **Company review score pasted onto every category page as the trust element.** FloraQueen repeats "4.8/5 (+18K reviews)" above every grid. Ours appears once, real, and is hidden below 25 reviews (`plan/04` §3).
6. **Manufactured urgency in category copy.** "Bez obaw, jeszcze zdążysz", "Send love today", "Most popular choice" on a delivery tier. Replaced by the computed cutoff line.
7. **Sale banners as the top-of-grid message** (1-800-Flowers "Save Up to 30%"). We have no discount programme to advertise and inventing one is the fastest way to look like the incumbents.
8. **"Plant Mood: Easy Going / Needs Some Love" style filters.** Cute, unmappable to intent, and they generate thin facet pages.
9. **Newsletter discount pop-in as the grid's conversion device** (Euroflorist PL "10% taniej"). Our email capture is the occasion-reminder signup with double opt-in, not a discount interstitial over the grid.

## 4. Open questions for the founder

1. **"From" price on cards vs default-tier price.** `plan/04` §6 says "from £34" on cards but no "from" on the PDP. Does the card show the cheapest tier or the default (18-stem) tier, given that price shown = price charged?
2. **Sub-collection threshold.** Do we author age/relationship sub-collections (18th, 50th, "for mum") in Phase 1 for Poland, or wait for search data? They are the field's main long-tail play but each needs unique copy to avoid the doorway pattern.
3. **Sort default per destination.** Bestsellers-for-the-destination requires order volume we will not have at launch. What is the honest default in week one — curated "our picks", or price ascending?
4. **Do we show a composition line on cards** (main flower) for every SKU, which means the product data must carry it for every locale translation?
