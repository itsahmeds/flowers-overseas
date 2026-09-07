# Global relay networks, legacy relay sites, and corridor-query SERPs

Research date: 2026-09-05. Tools: WebFetch, WebSearch, curl (raw HTML for canonical/hreflang/ld+json), Claude browser pane (internetflorist.biz only, which blocks non-browser clients via Bunny Shield). Firecrawl/Ahrefs not used.

Purpose: reference set for Flowers Overseas (one .com, locale subfolders). Sites 1-4 are mostly "what to avoid" with a few structural ideas; section 5 shows who ranks today for two corridor queries.

Conventions: every claim carries the URL it was observed on. Items I could not observe are marked **UNVERIFIED**. "Client-rendered" means the server HTML contained only nav/shell, so WebFetch/curl could not see the body.

---

## 1. internetflorist.biz (international relay, 31 languages, ~230 destination countries)

### robots.txt and sitemap structure
- robots.txt: allows Googlebot/Bingbot/Slurp/DuckDuckBot/Baiduspider/YandexBot explicitly; disallows `/api/` and, for each of 31 language prefixes, `/{lang}/basket`, `/{lang}/orders`, `/{lang}/login`, `/{lang}/create-account`; one `Sitemap: https://www.internetflorist.biz/sitemap.xml` (https://www.internetflorist.biz/robots.txt).
- Sitemap index has **14,750 child sitemaps**: 32 x `/{lang}/sitemap-pages.xml`, 7,359 x `/{lang}/sitemap-cities/{country}/`, 7,359 x `/{lang}/sitemap-products/{country}/` (32 languages x ~230 countries) (https://www.internetflorist.biz/sitemap.xml).
- `/en/sitemap-pages.xml` alone lists 3,463 URLs: 230 country hubs `/en/florist-{country}/`, 230 `/en/florist-{country}/faq.html`, 230 `/en/florist-{country}/terms-conditions.html`, and 2,760 `/en/florist-{country}/{category}-{country}-collection.html` (12 categories x 230 countries) (https://www.internetflorist.biz/en/sitemap-pages.xml).
- Per-country city sitemaps returned 403 to curl (Bunny Shield challenge), so total city-page count is **UNVERIFIED**; the Poland hub links ~70 `send-flowers-{city}/` pages plus 16 province pages (https://www.internetflorist.biz/en/florist-poland/).

### URL patterns
- Language subfolder, then country, then city, then product:
  - Country hub: `https://www.internetflorist.biz/en/florist-poland/` (translated slugs per language, e.g. `/hr/cvjecar-poljska/`, `/cs/kvetinar-polsko/`)
  - Country x category: `https://www.internetflorist.biz/en/florist-poland/gift-baskets-poland-collection.html`, `.../preserved-roses-poland-collection.html`
  - Province: `https://www.internetflorist.biz/en/florist-poland/lesser-poland-province.html`
  - City: `https://www.internetflorist.biz/en/florist-poland/send-flowers-warsaw/`, `.../send-flowers-krakow/`, `.../send-flowers-bedzin/`
  - Product (city-scoped): `https://www.internetflorist.biz/en/florist-poland/send-flowers-warsaw/royal-choice-stunning-six-red-roses-bouquet-flower-delivery.html`
  - Basket is also city-scoped: `https://www.internetflorist.biz/en/florist-poland/send-flowers-warsaw/basket.html` (canonical points to itself; robots only blocks `/en/basket`) (observed in browser).
- Occasion pattern: no occasion URLs found in nav or sitemap-pages; taxonomy is product-type only (https://www.internetflorist.biz/en/sitemap-pages.xml).
- Global category pages exist without a country: `https://www.internetflorist.biz/en/plants-collection.html`, `/en/chocolates-collection.html` (homepage nav).

### hreflang / canonical / thin pages
- Self-referencing canonical on every page checked; 33 hreflang links (31 languages + `en` + `x-default`) on home, country, city, product and basket pages (browser inspection of https://www.internetflorist.biz/, /en/florist-poland/, /en/florist-poland/send-flowers-warsaw/, and the Royal Choice PDP).
- Thin/doorway evidence:
  - Country hub and city page share the same intro copy with the place name swapped: "Looking for the perfect floral gift? Our flowers are beautifully arranged for every occasion..." appears on both https://www.internetflorist.biz/en/florist-poland/ and https://www.internetflorist.biz/en/florist-poland/send-flowers-warsaw/.
  - Every one of ~230 countries gets 12 category pages plus faq/terms pages regardless of catalogue (e.g. `florist-antarctica`, `florist-british-indian-ocean-territory/beauty-...-collection.html`) (https://www.internetflorist.biz/en/sitemap-pages.xml).
  - The same product is republished under every city path (`/send-flowers-warsaw/royal-choice-...html`), so one SKU yields tens of URLs per country, each with its own canonical (browser).
  - Mitigations they do apply: unique FAQ block per country/city (FAQPage schema), a country-specific "What a complete Polish address needs" paragraph, and a real product grid (214 results for Warsaw) (https://www.internetflorist.biz/en/florist-poland/send-flowers-warsaw/).

### Homepage first action; currency
- First action: hero "SHOP NOW" then "Choose Your Destination" continent-grouped country list; language dropdown (31 languages) in the top bar (https://www.internetflorist.biz/).
- Currency: prices shown in the destination currency with three conversions inline, e.g. "PLN 229.20 EUR 53.00 | USD 61.64 | GBP 45.56"; price filter bands in PLN (https://www.internetflorist.biz/en/florist-poland/send-flowers-warsaw/). Country selector in top bar ("Poland") drives this; no standalone currency selector observed.

### Product page
- Steps on PDP: "1. Enter Your Delivery City" (typeahead), "2. Select Delivery Date" (Tomorrow 6 Sept default, "Choose delivery date" calendar), "3. Select Your Size" Standard PLN 229.20 / Deluxe PLN 298.39 / Premium PLN 363.26; "Please select a delivery city to continue" gates Add To Basket (https://www.internetflorist.biz/en/florist-poland/send-flowers-warsaw/royal-choice-stunning-six-red-roses-bouquet-flower-delivery.html).
- Listing shows "DELIVERY TODAY" / "DELIVERY TOMORROW" badges per product and "Prices And Products Depend On Delivery City & Date" (https://www.internetflorist.biz/en/florist-poland/send-flowers-warsaw/).
- All-inclusive? Product schema Offer price = 229.20 PLN with no shipping line seen on PDP; delivery fee at checkout **UNVERIFIED**.
- Substitution: country hub copy states "if a flower isn't available, the florist substitutes one of equal or greater value in a matching style" (https://www.internetflorist.biz/en/florist-poland/).
- Add-ons: none on PDP; only size tiers and quantity. Cross-sell "Other popular Flowers for Poland" (same PDP).

### Checkout
- Guest checkout, steps, recipient phone, card message: **UNVERIFIED** (browser session was interrupted before checkout; curl/WebFetch blocked).
- Payment methods shown in footer badges: Visa, Mastercard, Amex, PayPal, Apple Pay, SOFORT, Bancontact, BLIK, Przelewy24, iDEAL (footer of https://www.internetflorist.biz/).

### Trust signals
- "Our Trustpilot Rating" widget in footer; "Satisfaction Guaranteed / 100% happiness promise"; "120+ Countries / Worldwide Marketplace Network"; a single testimonial ("Marie L., France, January 2025"); UK phone +44 203 109 0569; "Part of EC Global Promotions LTD." (https://www.internetflorist.biz/). No delivery-photo claim seen.

### Schema.org
- Home: `Organization` + `OnlineStore` (@graph), `WebSite`, `Service` (serviceType "Flower delivery", areaServed "Worldwide"), `WebPage`, `BreadcrumbList` (https://www.internetflorist.biz/).
- Country hub: `WebPage`+`CollectionPage`, `Country`, `Service`, `BreadcrumbList`, `FAQPage` with 6 Q/A (https://www.internetflorist.biz/en/florist-poland/).
- City: adds `City` and an `ItemList` of ~40 products (https://www.internetflorist.biz/en/florist-poland/send-flowers-warsaw/).
- PDP: `Product` (sku "Blossom19", `Offer` price 229.20 PLN, InStock), `Brand`, `BreadcrumbList` (Royal Choice PDP above).

### Taxonomy
- Product types only: Flowers, Gift Baskets, Preserved Roses, Plants, Dried Flowers, Beauty, Chocolates, Cakes, Wine, Perfumes, Gifts, Champagne, Silk Flowers (nav on https://www.internetflorist.biz/). No occasion navigation.

---

## 2. 1800flowers.com (US giant; ignore US-only payment)

### robots.txt and sitemap structure
- Disallows `/OrderTrackingLogonView`, `/searchterm`, `/*altPage=*`, `/checkout`, `/account`, `/fhdirect`; separate blocks for AI search bots and AI training bots with the same rules; 10 sitemap URLs listed (https://www.1800flowers.com/robots.txt).
- Sitemap index (8 children, lastmod 2026-08-28): sitemap-static (1 URL), sitemap-collection (890 URLs), sitemap-products (6,124 URLs), marketplace-collections, marketplace-products, productsimage, templates, `local/sitemap.xml` (43 URLs) (https://www.1800flowers.com/sitemap.xml).
- 47 collection URLs contain "international", e.g. `/international/greatbritain-12117`, `/international/englandsympathy-12617`, `/international/englandgetwell-12620` (https://www.1800flowers.com/sitemap-collection.xml).

### URL patterns
- Destination country: `https://www.1800flowers.com/international/poland-12111`, `/international/belgium-12400`, `/international/czechrepublic-12559`, `/international/taiwain-12408` (typo in slug) - linked from the hub `https://www.1800flowers.com/international-flower-delivery`.
- Country x occasion: `/international/englandloveromance`, `/international/englandsympathy-12617` (https://www.1800flowers.com/sitemap-collection.xml).
- Domestic city: `https://www.1800flowers.com/local/usa/tx/austin-flower-delivery`, `/local/usa/ny/buffalo`, `/local/usa/ga/atlanta-flower-delivery` (inconsistent suffix), plus a stray `https://www.1800flowers.com/local/austria` (https://www.1800flowers.com/local/sitemap.xml).
- Occasion: `/birthday-flowers-10359`, `/allsympathyflowersgifts`, `/justbecause`, `/getwell`, `/loveandromance`, `/congratulations`, `/babygifts` (https://www.1800flowers.com/occasions).
- Product: `/{slug}-{id}`, e.g. `https://www.1800flowers.com/october-roses-167925`, `/congratulations-bouquet-211667` (https://www.1800flowers.com/sitemap-products.xml).

### hreflang / canonical / thin pages
- Self-canonical on home, PDP, local pages; **no hreflang anywhere** (single-locale US site) (curl of https://www.1800flowers.com/, /october-roses-167925, /local/usa/tx/austin-flower-delivery).
- `/local/austria`: `<title>testtitle</title>`, body text "Sending to Austria zip code 123456 Go ... test test", `<meta name="robots" content="index, nofollow">`, and it is listed in the live sitemap with priority 1 (https://www.1800flowers.com/local/austria, https://www.1800flowers.com/local/sitemap.xml). Textbook accidental doorway/test page.
- `/local/usa/tx/austin-flower-delivery`: server HTML is nav-only (client-rendered), no ld+json, `index, follow`; content quality **UNVERIFIED**.
- `/international/poland-12111`: server HTML has an empty `<title data-react-helmet="true"></title>` and nav only (client-rendered), so country pages ship no indexable SSR copy (curl of https://www.1800flowers.com/international/poland-12111).
- `/customer-service-faq` is `noindex,nofollow` (https://www.1800flowers.com/customer-service-faq).

### Homepage first action; currency
- Header search is the first interactive element; hero banner "Summer's Final Bloom Sale: Save Up to 30%"; nav Best Sellers / Birthday / Sympathy / Occasions / Flowers / Plants / Food & Keepsakes / Same-Day Delivery / Sale (https://www.1800flowers.com/).
- Currency: USD only, `priceCurrency: USD` in Product schema; no currency selector (https://www.1800flowers.com/october-roses-167925).

### Product page
- SSR PDP shows size options ("12 or 18 long stem red roses") but delivery date picker, zip entry and add-on UI are client-rendered; feature flags `add-on-and-wrap-up-redesign-enabled`, `add-ons-section-ab-test-enabled`, `substitutionMesssageBg` exist in the bundle, and FAQ says "Delivery Date on the product page" (https://www.1800flowers.com/october-roses-167925). Exact add-on list/prices **UNVERIFIED**.
- Same-day cutoff (florist-delivered): "M-F: 3pm Saturday: 2pm Sunday: 12pm" in recipient's time zone (https://www.1800flowers.com/customer-service-faq).
- Not all-inclusive: "the applicable shipping charges, service fees or surcharges ... will be shown" when you choose the date; Celebrations Passport removes them for 2+ business-day lead (same FAQ).
- Substitution: "Our florists select the freshest flowers available, so shade of rose may vary due to local availability" on PDP; Terms of Use: may "substitute an item of equal or greater value" (https://www.1800flowers.com/october-roses-167925; https://www.1800flowers.com/About-Us-Terms-of-Use via search).

### Checkout
- `/checkout` is robots-disallowed; guest checkout **UNVERIFIED** (nav offers "Sign In ... Don't have an account? Click Here").
- Payment (US): Amex, Discover, MasterCard, Visa; express: Amex Express Checkout, Chase Pay, Masterpass, PayPal, Visa Checkout; Apple Pay/Android Pay app-only (https://www.1800flowers.com/customer-service-faq).
- Recipient phone / card message fields **UNVERIFIED**.

### Trust signals
- "100% Smile Guarantee ... we'll make it right" (https://www.1800flowers.com/customer-service-faq); international hub: "Delivery to over 100 countries", "Dedicated 24/7 Customer Service", "100% Smile Guarantee", delivery via "international affiliates" (https://www.1800flowers.com/international-flower-delivery). FAQ claims "international delivery to 195 counties [sic] worldwide" (https://www.1800flowers.com/customer-service-faq). No review platform badge in SSR HTML.

### Schema.org
- Home: `WebSite` + `SearchAction`, `Organization` (+`PostalAddress`, `ContactPoint`), `MemberProgram` (https://www.1800flowers.com/).
- PDP: `Product` with `Brand`, `Offer` (USD, seller Organization, availability OutOfStock on this seasonal SKU), `BreadcrumbList` (https://www.1800flowers.com/october-roses-167925).
- Local/international pages: none (client-rendered).

### Taxonomy (structural idea worth borrowing)
- Occasions split into "Everyday Occasions" (Anniversary, Birthday, Congratulations, Get Well, Graduation, Housewarming, I'm Sorry, Just Because, Love & Romance, New Baby, Retirement, Sympathy, Thank You, Thinking of You, Wedding) and "Seasonal Occasions" with dates (Summer, Back to School, Labor Day (9/7), Grandparents Day (9/13)) (mega-menu on https://www.1800flowers.com/local/usa/tx/austin-flower-delivery).
- Each occasion menu is cross-cut by Product Type, Recipient (Mom/Her/Him/Kids) and Price (Under $30/$50/$75); Flowers menu cross-cut by Flower Type (Carnations, Daisies, Lilies, Orchids, Roses, Sunflowers) and Product Type (Centerpieces, Preserved Roses, Luxury) (same page).

---

## 3. netflorist.co.za (South Africa, single-country; study checkout and gifting add-ons)

### robots.txt and sitemap structure
- `Allow: /` only, one `Sitemap: https://www.netflorist.co.za/sitemap.xml` (https://www.netflorist.co.za/robots.txt).
- Single flat sitemap, 8,283 URLs, all lastmod 2026-09-03. By prefix: `shop/gifts` 4,388, `shop/flowers` 1,234, `shop/plants` 408, `promo/corporate-gifts` 223, `gifts/personalised` 180, `gifts/christmas` 121, `gifts/birthday` 91, `gifts/anniversary` 82 ... (https://www.netflorist.co.za/sitemap.xml). Zero `/Area/` URLs in the sitemap; `flowers/sameday/{city}/` and `gifts/sameday/{city}/` are present.

### URL patterns
- Destination (domestic): `https://www.netflorist.co.za/Area/South_Africa/Gauteng/Johannesburg/`, `/Area/South_Africa/Western_Cape/Cape_Town/`, `/Area/South_Africa/Kwazulu-Natal/Durban/` (footer of https://www.netflorist.co.za/); and `https://www.netflorist.co.za/flowers/sameday/cape-town/`, `/flowers/sameday/johannesburg-north/`, `/gifts/sameday/durban/` (sitemap).
- Occasion: `/gifts/birthday/`, `/flowers/sympathy/`, `/gifts/get-well/`, `/gifts/love-and-romance/`, `/gifts/anniversary/`, `/gifts/thank-you/`, `/gifts/baby/` (https://www.netflorist.co.za/).
- Product: `https://www.netflorist.co.za/shop/flowers/lovely-lilies/`, `/shop/flowers/funeral-wreath/`, `/shop/plants/plant-with-flower-arrangement-in-a-basket/` (sitemap).

### hreflang / canonical / thin pages
- Home: self-canonical, `index, follow`, no hreflang (single locale) (https://www.netflorist.co.za/).
- Next.js app: `/Area/...`, `/shop/...`, `/faq/` and `/flowers/sameday/cape-town/` server HTML has no `<title>`, no canonical, no ld+json - the page is `/Area/[country]/[province]/[city]` rendered client-side (`__NEXT_DATA__` shows only the route params) (https://www.netflorist.co.za/Area/South_Africa/Gauteng/Johannesburg/). Thin-page risk is therefore moderate: few geo URLs, but those that exist ship no SSR content or metadata.
- Footer boilerplate ("Rated 4.4 stars from 51,162 verified Google reviews ... Order by 4pm ... 26720 towns via 4 warehouses") repeats on every page (https://www.netflorist.co.za/).

### Homepage first action; currency
- First action is a delivery finder: "Delivery Date [Today/Tomorrow/SELECT DATE] | Suburb | GO!" (https://www.netflorist.co.za/).
- Currency: ZAR only, "R 585.00" format; price bands "Under R299 / Under R499" (https://www.netflorist.co.za/, /shop/flowers/lovely-lilies/).

### Product page
- Size tiers "10 Stems R 585.00 / 15 Stems R 910.00 / 20 Stems R 1170.00"; "Order For Delivery Today! Sameday delivery is available for gifts ordered by 3 pm"; "Delivery From R 117.00 Additional gifts or delivery to outlying areas will add a small fee. Final fee calculated at checkout" (not all-inclusive; JSON also carries `"deliveryFee":89.95`); "Next Delivery: Sat, 05 Sept"; "Upsells" block; "Gift Together ... invite up to 4 people to share in the cost" (group-pay) (https://www.netflorist.co.za/shop/flowers/lovely-lilies/).
- Substitution policy: not found on PDP or FAQ text extracted - **UNVERIFIED**.
- Gifting add-ons (nav + PDP upsells): balloons, teddy bears, chocolate (Lindt, Ferrero), alcohol, fresh fruit baskets, Chateau Gateaux cakes, personalised items; combos "Flowers & Balloons", "Flowers & Teddy Bears", "Chocolate & Alcohol" (https://www.netflorist.co.za/). Add-on prices **UNVERIFIED**.

### Checkout
- FAQ describes two steps after basket: "Step 1: Basket Summary ... select 'Secure Checkout'. Step 2: Payment Methods ... Don't forget to include a message! Add a standard card (free) to your gift or an occasion card" (https://www.netflorist.co.za/faq/).
- Card message: "350 characters or less. You can even add emojis!" (https://www.netflorist.co.za/faq/).
- Guest checkout: **UNVERIFIED** (nav shows "Sign / SignUp"; FAQ silent).
- Recipient phone: **UNVERIFIED**.
- Payment: FAQ answer to "Which payment methods does NetFlorist accept?" lists loyalty programmes (Clicks Clubcard, Discovery Miles, eBucks, Ucount, ABSA Rewards, Momentum Multiply, Edgars Club, Nedbank Greenbacks) rather than card brands; homepage HTML mentions EFT; card brands otherwise **UNVERIFIED** (https://www.netflorist.co.za/faq/).

### Trust signals
- "Rated 4.4 stars from 51,162 verified Google reviews"; "100% satisfaction guarantee ... we will replace, repair or refund you"; "Since 1999 ... over 10 million orders"; "Order by 4pm & NetFlorist can deliver same-day across 26720 towns via 4 warehouses & an expansive florist network"; "verified by Geotrust, PCI audited" (https://www.netflorist.co.za/, /faq/). No delivery-photo claim found.

### Schema.org
- None found in server HTML of home, PDP, Area, FAQ pages (client-rendered Next.js) (https://www.netflorist.co.za/shop/flowers/lovely-lilies/).

### Taxonomy
- Occasions: Birthday, Sympathy & Funeral, Get Well, Love and Romance, Anniversary, Thank You, Good Luck, Friendship, Congratulations, Apology, New Baby, Wedding, Miss You, Engagement, Graduation, Housewarming, plus dated "Upcoming Occasions" (Rosh Hashanah 11-13 Sep, Grandparents Day 13 Sep, Heritage Day 24 Sep) (https://www.netflorist.co.za/).
- Product types: Flowers & Roses, Plants, Personalised Gifts, Chocolate, Alcohol, Gourmet, Home & Living, Bath & Beauty, Apparel, Office & Desk; recipient cuts (For Her / For Him / For Mom / For Dad / Kids) under every occasion (same page).

---

## 4. floristsonline.net (legacy Teleflora/FTD relay, Canada + US, OpenCart)

### robots.txt and sitemap structure
- `User-agent: SemrushBot Disallow: /`; `User-agent: * Allow: /`; `Crawl-delay: 5`; `SITEMAP: https://www.floristsonline.net/sitemap.xml` (https://www.floristsonline.net/robots.txt).
- Index with 5 children: pages, categories (92 URLs), blog, products (204 URLs), **cities (33,392 `<loc>` entries, only 21,942 distinct - 4,542 URLs are listed more than once**) (https://www.floristsonline.net/sitemap.xml, /sitemap-cities.xml, /sitemap-categories.xml, /sitemap-products.xml).

### URL patterns
- Destination city (flat, no country/region): `https://www.floristsonline.net/flowers/toronto`, `/flowers/new-york`, `/flowers/paris`, `/flowers/london`, `/flowers/quai-de-saint-juste`, `/flowers/ile-aux-noix`, `/flowers/acadia-valley` (sitemap-cities). Ambiguous slugs (`/flowers/london`, `/flowers/paris`) collapse Ontario and European cities into one URL.
- Occasion: `/occasion/birthday`, `/occasion/anniversary`, `/occasion/love-and-romance`, `/occasion/thank-you` (https://www.floristsonline.net/).
- Product: canonical is root-level `https://www.floristsonline.net/a-bit-of-sunshine-basket`, but the same product is also reachable at `/occasion/birthday/a-bit-of-sunshine-basket` (https://www.floristsonline.net/occasion/birthday; canonical seen on the PDP).
- Category: `/colors/red`, `/flower-varieties/roses`, `/fresh-flowers/luxury`, `/plants/green-plants` (sitemap-categories).
- OpenCart internals leak: `index.php?route=product/category`, `route=account/login`, theme path `catalog/view/theme/bt_comohos` (https://www.floristsonline.net/).

### hreflang / canonical / thin pages
- PDP and static pages carry `hreflang="en"` and `hreflang="fr"` pairs (`/a-bit-of-sunshine-basket` <-> `/la-corbeille-rayon-de-soleil`, `/guarantee` <-> `/garantie`); city pages carry canonical but **no hreflang** (https://www.floristsonline.net/a-bit-of-sunshine-basket, /flowers/toronto).
- City pages are templated with the slug injected lowercase into boilerplate: H1 "toronto Flower Delivery", title "Toronto Flower Delivery | Toronto' #1 Flower Delivery by FloristsOnline.net", copy "Order flowers online toronto - anywhere in Canada and the United States", "We are Canada's top toronto Teleflora florist", and the identical ~60-product grid used on the homepage (https://www.floristsonline.net/flowers/toronto). ~22k such pages including hamlets (`/flowers/calling-lake`, `/flowers/radway`).
- Brand inconsistency inside the same template: page says "FlowersEzGo has delivered hundreds of thousands..." while the site is FloristsOnline.net; product brand in schema is "FTD" while header says "TOP TELEFLORA MEMBER" (https://www.floristsonline.net/flowers/toronto, /a-bit-of-sunshine-basket).

### Homepage first action; currency
- First action: "Order flowers online - anywhere in Canada and the United States", "SAME DAY DELIVERY", phone 1-888-219-6922; product carousels (https://www.floristsonline.net/).
- Currency: prices displayed with a bare "$" (e.g. "Twelve Red Roses $94.95") while Product schema says `priceCurrency: CAD`; city page footer "Shipping starting at 4,50$" (French-style formatting) (https://www.floristsonline.net/, /flowers/toronto, /a-bit-of-sunshine-basket).

### Product page
- Size tiers "As shown / Deluxe (+$10.00) / Supreme (+$20.00) / Ultra (+$30.00)"; no delivery date picker on PDP (date chosen later); no per-product add-on prices; add-on categories in menu: Balloons, Chocolate, Fruit Baskets, Gourmet Basket, Greeting Cards, Teddy bear (https://www.floristsonline.net/a-bit-of-sunshine-basket).
- Not all-inclusive: "Shipping starting at 4,50$" (https://www.floristsonline.net/flowers/toronto).
- Cutoff: "same day if the order is placed before 2PM local time of the recipient" (https://www.floristsonline.net/flowers/toronto).
- Substitution: only implicit ("may include palm, pothos, or prayer plants"); no policy text - **UNVERIFIED**. Guarantee page body is empty in server HTML apart from nav and "© 2026 WFN.co" (https://www.floristsonline.net/guarantee).

### Checkout
- Login/Register links; guest checkout **UNVERIFIED**; recipient phone and card message **UNVERIFIED**.
- Payment logos: Visa, MasterCard, American Express (https://www.floristsonline.net/a-bit-of-sunshine-basket).

### Trust signals
- "TOP TELEFLORA MEMBER" badge, three testimonials dated 2018-2019 ("Pierrette Vincent Schroeder Dec 23, 2018"), "Guarantee" footer link, "© 2026 WFN.co" (https://www.floristsonline.net/). No third-party review platform, no delivery-photo claim.

### Schema.org
- Home/city: `Organization` only (https://www.floristsonline.net/, /flowers/toronto).
- PDP: `Product` (sku/mpn "C34-3782", brand `Thing` "FTD", 8 `Thing` categories, `Offer` CAD 81.95 InStock, `priceValidUntil`, empty `review: []`), `BreadcrumbList` (https://www.floristsonline.net/a-bit-of-sunshine-basket).

### Taxonomy
- Holiday (Christmas, Easter, Mother's Day, New Year, Secretaries Week, Valentine's Day, each with "Cheap ... Flowers / Arrangements / Best Sellers"), Fresh Flowers, Plants, Sympathy, Products (add-ons), Colors (10), Flower Varieties (19), Occasions (Anniversary, Birthday, Congratulations, Get Well, Love & Romance, Maternity / Birth, Thanks You, Wedding) (https://www.floristsonline.net/, /sitemap-categories.xml).

---

## 5. Corridor-query SERPs (who ranks today)

Source: WebSearch results returned 2026-09-05 (US-located engine; position = order returned). Locale strategy from curl of each URL's `<link hreflang>`/canonical unless marked UNVERIFIED (Cloudflare 403).

| Query | Rank | Domain | URL | Page type | Locale strategy of domain |
|---|---|---|---|---|---|
| send flowers to Poland from UK | 1 | direct2florist.co.uk | https://www.direct2florist.co.uk/poland/ | Corridor page (country hub listing 18 Product offers + `City` links to `pl.direct2florist.com/{region}/{city}/`) | ccTLD/subdomain per **sender** market (co.uk, .ie, .ca, com.mt, com.cy, gr./au./it. subdomains), all English; 12 hreflang incl. x-default -> .com; recipient country as subdomain `pl.direct2florist.com` |
| send flowers to Poland from UK | 2 | euroflorist.pl | https://www.euroflorist.pl/en | Homepage (Polish ccTLD, English version) | ccTLD per recipient country; language subfolders `/en`, `/uk` on the ccTLD (hreflang en-PL, pl-PL, uk-UA); prices in PLN |
| send flowers to Poland from UK | 3 | ftd.com | https://www.ftd.com/collection/poland-pl | Category/collection page (`/collection/{country}-{iso}`) | US single-locale .com; hreflang **UNVERIFIED** (Cloudflare 403) |
| send flowers to Poland from UK | 4 | floraqueen.com | https://www.floraqueen.com/collections/flowers-poland | Corridor/category page (49 products, city links `/collections/flowers-{city}`) | ccTLD per language (.com en, .es, .de, .fr, .it, .pl, .com.tr, .com.ru, .com.br) with translated slugs; 16 hreflang incl. es-MX/es-CR etc. pointing to .es; x-default -> .com |
| send flowers to Poland from UK | 5 | myglobalflowers.com | https://myglobalflowers.com/international-flower-delivery/poland | Corridor page (marketplace style: 654+ items, "$12.00 Delivery fee within Warsaw", city sub-pages `/poland/{city}`) | ccTLD per sender market with translated paths (.co.uk, .de, .at, .ch, .fr, .es, .it, .ae; 10 hreflang; x-default .com); currency switcher USD/EUR/GBP/CAD/AUD |
| send flowers to Poland from UK | 6 | interflora.co.uk | https://www.interflora.co.uk/category/international/poland | Category page (`/category/international/{country}`, 4 pages, FAQPage schema, no prices in SSR) | ccTLD per market; hreflang only en-GB <-> interflora.ie |
| send flowers to Poland from UK | 7 | flowers4poland.com | https://www.flowers4poland.com/ | Single-country homepage (Flower Connection network; "Prices and available products vary by delivery city and date"; 100+ currency dropdown) | One domain per recipient country, 33 language subfolders (`/es/`, `/ar/`, `/fr/` ...) with hreflang |
| send flowers to Poland from UK | 8 | international.teleflora.com | https://international.teleflora.com/poland?catID=cat1190143 | Category page on international subdomain, query-string category id | Subdomain of US brand; hreflang **UNVERIFIED** (Cloudflare 403) |
| send flowers to Poland from UK | 9 | poland.cyber-florist.com | https://poland.cyber-florist.com/ | Country subdomain homepage | Recipient-country subdomains; hreflang **UNVERIFIED** (403) |
| Blumen nach Polen schicken | 1 | floraprima.de | https://www.floraprima.de/en/blumen/307_poland.html | Category page (41 products, `ItemList` of 10 `Product`/`Offer`, "Prices incl. tax, plus shipping") | One .de domain, language subfolders `/de/` and `/en/` (hreflang de, en, x-default -> /de/); numeric category id in slug |
| Blumen nach Polen schicken | 2 | euroflorist.de | https://www.euroflorist.de/internationaler-blumenversand/polen | Corridor page (`/internationaler-blumenversand/{land}`) | ccTLD per market; hreflang **UNVERIFIED** (Cloudflare 403); 24blooms links to legacy `euroflorist.de/polen-co646` |
| Blumen nach Polen schicken | 3 | fleurop.de | https://www.fleurop.de/fleurop-international/blumen-nach-polen-schicken | Corridor page (162 bouquets "ab 39,00 EUR", "Noch heute lieferbar") - intro copy wrongly says "Empfaenger in Frankreich" | .de domain, hreflang de-DE / en-DE / x-default (English variant on same domain); Fleurop AG |
| Blumen nach Polen schicken | 4 | myglobalflowers.com | https://myglobalflowers.com/international-flower-delivery/poland | Corridor page (same URL as above ranks for the German query despite a .de sibling) | see above |
| Blumen nach Polen schicken | 5 | floraqueen.com | https://www.floraqueen.com/collections/flowers-poland | Corridor/category page (English .com ranking for a German query; .de sibling exists at `/collections/blumen-polen`) | see above |
| Blumen nach Polen schicken | 6 | italianflora.com | https://www.italianflora.com/international/poland/ | Corridor page (`/international/{country}/`) | hreflang **UNVERIFIED** (Cloudflare 403) |
| Blumen nach Polen schicken | 7 | 24blooms.de | https://24blooms.de/blumenversand-polen/ | Affiliate article ("Article"/"Person" schema; outbound Tradedoubler/Awin links to euroflorist.de and floraprima.de) | Single .de, no hreflang |
| Blumen nach Polen schicken | 8 | flowers-deluxe.de | https://flowers-deluxe.de/Versand-Weltweit/Polen/ | Corridor page (`/Versand-Weltweit/{Land}/`, `ItemList` schema, "Kostenloser Versand", "als Gast bestellen") | One .de domain, language subfolders `/en/Shipping-worldwide/Poland/`, `/fr/Expedition-.../Pologne/` (hreflang de-DE, en-GB, fr-FR, x-default) |
| Blumen nach Polen schicken | 9 | blumenversand.aquarelle | https://blumenversand.aquarelle/polen | Corridor page (URL as returned; DNS failed on fetch) | **UNVERIFIED** |

Observations for Flowers Overseas:
- Corridor URL grammar that ranks: `/{country}/` (direct2florist), `/international-flower-delivery/{country}` (myglobalflowers), `/collections/flowers-{country}` (floraqueen), `/internationaler-blumenversand/{land}` (euroflorist.de), `/Versand-Weltweit/{Land}/` (flowers-deluxe). All are one level under a stable hub segment and carry a product grid plus FAQ/City schema.
- English .com pages (floraqueen.com, myglobalflowers.com) rank on the German query even when a German sibling domain exists, i.e. Google is not strictly honouring hreflang for these brands; a single .com with `/de/` subfolders is not disadvantaged by that evidence.
- Only two of the ranking pages show prices in SSR HTML (direct2florist "From EUR 70.00" / floraprima "EUR 19.99-121.99"); interflora shows none.

---

## Comparison table

| Site | Country-in-URL pattern | Thin-page risk | Currency handling | Guest checkout | Payment methods | Review platform | Schema |
|---|---|---|---|---|---|---|---|
| internetflorist.biz | `/{lang}/florist-{country}/send-flowers-{city}/{product}.html`; 31 translated language slugs; province pages `.../{province}-province.html` | **High**: 14,750 sitemaps; 230 countries x 12 categories x 32 languages of templated collection pages; same product duplicated per city; city-scoped basket URLs | Destination currency (PLN) + inline EUR/USD/GBP conversions; Product schema priced in PLN | UNVERIFIED | Visa, MC, Amex, PayPal, Apple Pay, SOFORT, Bancontact, BLIK, Przelewy24, iDEAL (footer) | Trustpilot widget | Organization+OnlineStore, WebSite, Service, CollectionPage, Country, City, ItemList, FAQPage, Product/Offer, BreadcrumbList |
| 1800flowers.com | `/international/{country}-{id}` and `/international/{country}{occasion}`; domestic `/local/usa/{st}/{city}[-flower-delivery]` | **Medium**: 43 local pages incl. a live `testtitle` page; international pages client-rendered with empty titles | USD only | UNVERIFIED (`/checkout` disallowed) | Visa, MC, Amex, Discover, PayPal, Visa Checkout, Masterpass; Apple/Android Pay app-only | None in SSR | WebSite/SearchAction, Organization, MemberProgram, Product/Offer/Brand, BreadcrumbList |
| netflorist.co.za | `/Area/South_Africa/{Province}/{City}/` (not in sitemap) and `/flowers/sameday/{city}/` | **Low-Medium**: few geo URLs, but all client-rendered with no title/canonical/schema | ZAR only, "R 585.00" | UNVERIFIED | EFT + loyalty programmes listed; card brands UNVERIFIED | Google reviews (4.4, 51,162) | None (client-rendered) |
| floristsonline.net | `/flowers/{city}` flat, no country/region; 21,942 distinct city URLs (33,392 sitemap entries) | **Very high**: ~22k templated city pages with lowercase slug injected into copy, identical product grid, ambiguous slugs (`/flowers/london`), 4,542 duplicate sitemap entries | Bare "$" display; schema says CAD; "4,50$" formatting | UNVERIFIED | Visa, MC, Amex logos | None (3 on-site testimonials from 2018-19) | Organization; Product/Offer (CAD), BreadcrumbList on PDP; en/fr hreflang on PDPs only |

---

## Doorway-page anti-patterns observed

1. **internetflorist.biz** - 230 countries x 12 product categories x 32 languages of `/{lang}/florist-{country}/{category}-{country}-collection.html` pages generated regardless of supply (e.g. `florist-antarctica`, `florist-cocos-islands/beauty-...`) (https://www.internetflorist.biz/en/sitemap-pages.xml).
2. **internetflorist.biz** - identical intro paragraph on the country hub and every city page with only the place name swapped ("Looking for the perfect floral gift? ... deliver stunning, affordable flowers to Warsaw") (https://www.internetflorist.biz/en/florist-poland/ vs .../send-flowers-warsaw/).
3. **internetflorist.biz** - one SKU republished under every city path with a self-referencing canonical (`/send-flowers-warsaw/royal-choice-...html`), plus city-scoped `basket.html` URLs that escape the robots `Disallow: /en/basket` rule (browser, https://www.internetflorist.biz/en/florist-poland/send-flowers-warsaw/basket.html).
4. **1800flowers.com** - live, indexable (`index, nofollow`) test page `/local/austria` with `<title>testtitle</title>` and body "zip code 123456 ... test test", submitted in the sitemap at priority 1 (https://www.1800flowers.com/local/austria).
5. **1800flowers.com** - country corridor pages (`/international/poland-12111`) render an empty `<title>` and nav-only HTML server-side; all copy is client-side (https://www.1800flowers.com/international/poland-12111).
6. **1800flowers.com** - inconsistent local slugs for the same template (`/local/usa/ny/buffalo` vs `/local/usa/ga/atlanta-flower-delivery`) and typo slugs frozen by IDs (`/international/taiwain-12408`) (https://www.1800flowers.com/local/sitemap.xml; https://www.1800flowers.com/international-flower-delivery).
7. **floristsonline.net** - ~22k `/flowers/{city}` pages (down to hamlets like `/flowers/radway`) whose H1/copy is the raw lowercase slug in boilerplate ("toronto Flower Delivery", "Canada's top toronto Teleflora florist") with the homepage product grid reused (https://www.floristsonline.net/flowers/toronto).
8. **floristsonline.net** - flat city slugs with no region/country disambiguation (`/flowers/london`, `/flowers/paris`) and 4,542 URLs duplicated inside `sitemap-cities.xml` (https://www.floristsonline.net/sitemap-cities.xml).
9. **floristsonline.net** - same product reachable at `/occasion/birthday/{product}` and root `/{product}` (canonical to root), and brand copy contradicting itself (FlowersEzGo / FloristsOnline / Teleflora / FTD) inside one template (https://www.floristsonline.net/occasion/birthday; https://www.floristsonline.net/a-bit-of-sunshine-basket).
10. **fleurop.de** (SERP set) - corridor page for Poland whose intro copy reads "Sie moechten Blumen an einen Empfaenger in Frankreich verschicken?" - a template variable left pointing at France, the classic tell of mass-generated corridor pages (https://www.fleurop.de/fleurop-international/blumen-nach-polen-schicken).
