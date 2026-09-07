# Direct competitors: international flower relay — technical and UX teardown

Research date: 2026-09-05. Method: raw HTML fetched with curl (desktop Chrome UA) and parsed for `<link rel=alternate hreflang>`, `<link rel=canonical>`, `<meta name=robots>` and `application/ld+json`; robots.txt and XML sitemaps fetched and counted; JS-rendered pages (Bloom & Wild, Interflora UK PDP, Euroflorist NO PDP) read in a headless browser. Anything not directly observed is marked **UNVERIFIED**. All URL counts are from the sitemaps as served on the research date.

Scope note for Flowers Overseas: none of the five competitors runs the "one .com + locale subfolders" model we plan. FloraQueen (the closest analogue) has moved to one ccTLD per language on Shopify; Interflora/Euroflorist are federations of national ccTLDs; Bloom & Wild mixes a .com with `/de-at/` subfolder and a `.de` ccTLD; GBO uses six separate branded domains per language. The lessons below are therefore about *how they expose destination country and locale*, not a template to copy wholesale.

---

## 1. FloraQueen (floraqueen.com)

### robots.txt and sitemaps
- Shopify store (robots.txt header: "we use Shopify as our ecommerce platform"). Standard Shopify disallows plus custom ones: `/*?city=`, `/*?color=`, `/*?price=`, `/collections/*sort_by*`, `/collections/*+*`, `/*/products/*-[hex8]-remote` (blocks combined-filter and remote variant URLs). Sitemap: `https://www.floraqueen.com/sitemap.xml`. Source: https://www.floraqueen.com/robots.txt
- Sitemap index with 10 children: `sitemap_agentic_discovery.xml` (a single URL, `/agents.md`, changefreq weekly — an LLM-agent discovery file), `sitemap_products_1.xml` (549 URLs, lastmod present on 548), `sitemap_pages_1.xml` (47 URLs), `sitemap_collections_1..6.xml` (**14,443 collection URLs** in total), `sitemap_blogs_1.xml`. Source: https://www.floraqueen.com/sitemap.xml
- Of the 14,443 collections, **12,610 start with `/collections/flowers-`** (country and city landing pages) and 319 are `send-flowers-*`; the remainder are occasions, colours, flower types, seasons and gift baskets. Sources: https://www.floraqueen.com/sitemap_collections_1.xml … `_6.xml`
- No `xhtml:link` hreflang alternates inside the sitemaps (0 matches in collections_1.xml).
- Pages sitemap also lists paginated HTML sitemaps: `/pages/html-sitemap-collections-1` … `-10`, `/pages/html-sitemap-products`, `/pages/html-sitemap-articles*` — a deliberate crawl-path for the 14k programmatic pages. Source: https://www.floraqueen.com/sitemap_pages_1.xml

### URL patterns
- Locale handling: **ccTLD per language, not subfolder.** `https://www.floraqueen.com/de/` 301s to `https://www.floraqueen.de/`; `/de-de/` 404s; `/fr/collections/flowers-berlin` returned 200 (Shopify market route left open — a soft duplicate). Homepage hreflang set: x-default→.com, en→.com, es-ES/es-CR/es-DO/es-GT/es-HN/es-MX→floraqueen.es, de-DE→.de, fr-FR→.fr, it-IT→.it, pl-PL→.pl, tr-TR→.com.tr, ru-RU/ru-BY→.com.ru, pt-BR→.com.br. Source: https://www.floraqueen.com/ (head)
- Destination country: `/collections/flowers-{country}` e.g. https://www.floraqueen.com/collections/flowers-germany, https://www.floraqueen.com/collections/flowers-andorra, https://www.floraqueen.com/collections/flowers-arab-emirates
- Destination city: `/collections/flowers-{city}` e.g. https://www.floraqueen.com/collections/flowers-berlin, https://www.floraqueen.com/collections/flowers-dubai, https://www.floraqueen.com/collections/flowers-kilingi-nomme (tiny Estonian towns are included), plus inconsistent variants that co-exist for the same city: `/collections/flowers-madrid`, `/collections/flowers-madrid-delivery`, `/collections/flower-delivery-madrid`, `/collections/gift-baskets-madrid`, `/collections/gift-baskets-madrid-delivery`. Source: collections sitemaps
- Occasion: `/collections/birthday`, `/collections/anniversary`, `/collections/funeral`, `/collections/get-well`, `/collections/sorry-flowers`, `/collections/thank-you-flowers`, `/collections/new-baby`, `/collections/congratulations-flowers`, `/collections/wedding`; calendar: `/collections/easter-flowers`, `/collections/fathers-day-flowers`, `/collections/mothers-day-gifts`, `/collections/halloween-flowers`, `/collections/hanukkah-flowers`, `/collections/passover-flowers`, `/collections/rosh-hashanah-flowers`, `/collections/st-patricks-day-flowers`, `/collections/thanksgiving-flowers`, `/collections/labor-day-flowers`. Source: https://www.floraqueen.com/sitemap_collections_1.xml
- Flower type/colour: `/collections/roses`, `/collections/tulips`, `/collections/orchids`, `/collections/pink-flowers`, `/collections/red-bouquets`. Product: `/products/{handle}` e.g. https://www.floraqueen.com/products/a-pure-heart-mom (with `-2`, `-3`, `-4` duplicates of the same product in the sitemap). No occasion×country combination pages found (grep for birthday/funeral × germany/berlin returned nothing).
- Localised translations of geo pages exist on each ccTLD with translated slugs (hreflang on the Germany page: `.es/collections/flores-alemania`, `.de/collections/blumen-deutschland`, `.fr/collections/livraison-fleurs-en-allemagne`, `.it/collections/consegna-fiori-in-germania`, `.pl/collections/kwiaty-niemcy`, `.com.tr/collections/cicekler-almanya`, `.com.ru/collections/цветы-германия`; pt-BR points to `.com.br/collections/flowers-germany`, i.e. untranslated). Source: https://www.floraqueen.com/collections/flowers-germany

### hreflang, canonical, duplicates
- Full hreflang cluster with x-default on home, collection and static pages (16 entries each). Product pages: **no hreflang** (0 on `/products/a-pure-heart-mom`). Canonical is self-referencing on all fetched pages. Source: https://www.floraqueen.com/products/a-pure-heart-mom, https://www.floraqueen.com/collections/flowers-berlin
- Doorway-page pattern: 12.6k city/country collections all show the same 24-product grid and the same "Inspired by Barcelona, made for you" block; only a two-sentence intro and a "Deliveries also reach Bernau Bei Berlin… nearby spots like Potsdam too" line are city-specific. Source: https://www.floraqueen.com/collections/flowers-berlin
- Duplicate slugs for the same city (madrid / madrid-delivery / flower-delivery-madrid) and product duplicates (`-2/-3/-4`) are indexable.

### Homepage: destination and currency
- Header USP bar: "Customer favourite since 2005 · Worldwide delivery to 100+ countries". Mega-menu "Destinations" lists Top Countries (Spain, Germany, Italy, France, Belgium, Netherlands, United Kingdom, Poland, United States, Luxembourg), a full A–Z country list, and "Popular Cities" (Madrid, Barcelona, Milan, Rome, Berlin, Paris…). An "Enter address:" search box sits in the Destinations panel. Source: https://www.floraqueen.com/
- Currency: EUR only on .com (`"currenciesAccepted": "EUR"` in the Store schema; prices shown as €43,90). No currency switcher observed on .com. Source: https://www.floraqueen.com/ (ld+json)

### Product page: date, cutoff, price, substitution
- PDP shows three sizes (Classic €62,90 / Premium €75,90 / Delux €95,90, "Regular price €100,00 · Tax included."), then **"Choose delivery city — *Depending on the delivery country the price may change."** then "Select delivery date — Tomorrow 05 September €8,90 · Sunday 06 September €8,90 · Choose from €8,90" (delivery fee shown per date; same-day not offered). Add-ons (vase, Lindor, card) follow. A "This product is currently unavailable in <city>" overlay exists in the template. Source: https://www.floraqueen.com/products/a-pure-heart-mom
- Cutoff messaging on PDP: none beyond the date list. Help page: "If the delivery date is the same as the date the purchase was made, your order might not be processed on time." Source: https://www.floraqueen.com/pages/help
- Substitution: not on the PDP; Help page states "we sometimes cannot guarantee a specific brand in the products that will be added… they will always be of a similar quality" and asks for "a photo of the product and your order number" for complaints. Source: https://www.floraqueen.com/pages/help
- Price all-inclusive: product price is tax-inclusive but delivery (€8,90) is added and can change by destination country — not all-inclusive.

### Checkout
- Shopify Checkout (`shopify-checkout-api-token`, `/checkouts/` disallowed). Login modal offers "Continue with your preferred account: Google, Meta, Amazon, LinkedIn". Guest checkout is Shopify default and the word "Guest" appears in the PDP template, but step count, per-country address fields and recipient-phone requirement were **UNVERIFIED** (checkout not exercised). Source: https://www.floraqueen.com/products/a-pure-heart-mom

### Payment methods
- Store schema `"paymentAccepted": "Credit Card, Paypal, Amazon Pay, Sofort, Google Pay, Apple Pay"`; PayPal in-context metadata `data-currency="EUR"`. No Klarna/iDEAL/Bancontact/BLIK/Vipps/MobilePay/Swish observed. Source: https://www.floraqueen.com/ (ld+json, meta)

### Trust signals
- Reviews: Judge.me widget (66 references on the Berlin page), "4.8/5 Rating (+18K reviews)" and per-product "1770 reviews" (the same 1,770 count appears on many products — looks like a shared/aggregated review pool). No Trustpilot. Source: https://www.floraqueen.com/collections/flowers-berlin
- Claims: "20 Years of Expert International Flower Delivery", "100+ countries", "handcrafted by local florists", "guarantee them to last up to 7 days in the vase", "bouquet creation centres around Europe". No florist-count claim, no delivery-photo promise. Source: https://www.floraqueen.com/pages/international
- "How does International Flower Delivery work?" FAQ block on the international page.

### Schema.org
- Every page: `WebSite`+`SearchAction`, `Store` (with `Brand`, `PostalAddress`, `Country`, `currenciesAccepted`, `paymentAccepted`), `BreadcrumbList`. PDP adds `Product` with `AggregateOffer` (`lowPrice`/`highPrice`, EUR, `offerCount: 3`). Country/city collection pages: only WebSite, Store, BreadcrumbList — **no ItemList/CollectionPage/FAQPage**. Source: https://www.floraqueen.com/products/claire, https://www.floraqueen.com/collections/flowers-germany

### Visibly bad
- 12.6k near-identical geo collections with duplicate slugs; product URL duplicates; ~640 KB HTML per page; product title "A - Pure Heart Mom 1" (internal naming leaks); mixed-language review snippets ("Цветы свежие и радостные", "Ottimo") on the English PDP; a `/collections/test` collection in the sitemap; pt-BR hreflang pointing at untranslated slugs.

### Taxonomy (top nav)
Birthdays · Flowers (Occasions: Birthday, Love & Romance, Anniversary, Congratulations, New Baby, Condolences; Flowers: Roses, Gerberas, Lillies) · Plants (Orchids, Plant Gift Sets, House Plants) · Summer Collection · Personalized gifts (Wall Art; Who is it for? For her/him/babies/kids; Occasions: Love & Romance, Birthday, New baby, Thank You) · Destinations · Corporate Gifts. Collection sitemap adds Get well, Sorry, Thank you, Wedding, seasons, colours, chocolate/christmas baskets, baby gifts. Source: https://www.floraqueen.com/

---

## 2. Interflora — interflora.ee, interflora.co.uk, interflora.fr, fleurop.de

### 2a. Interflora Estonia (interflora.ee)

**robots/sitemap.** robots.txt: `Sitemap: https://www.interflora.ee/sitemap.xml`; disallows `/*/checkout*` and `/*/account*` only. Single urlset, 647 URLs, lastmod on all (2026-08-24), **hreflang `xhtml:link` alternates present in the sitemap** (x-default→/, et→/, ru→/ru, en→/en; 1,923 alternates). Buckets: 571 `et/products`, 58 `et/categories`, 6 `en/products`, 6 `ru/products`, static pages. Source: https://www.interflora.ee/robots.txt, https://www.interflora.ee/sitemap.xml

**URL patterns.** Language subfolder on ccTLD: `/et/`, `/en/`, `/ru/`. Category `/et/categories/{id}-{slug}`; product `/et/products/{id}-{slug}` with translated slugs per language (`/en/products/142-gerberas`, `/ru/products/142-gerbery`). **Destination countries are categories**: `/et/categories/183-valismaale` (abroad), `/et/categories/200-suurbritannia`, `/et/categories/201-usa`, `/et/categories/371-soome`, `/et/categories/203-rootsi`, `/et/categories/204-hispaania`, `/et/categories/205-itaalia`, `/et/categories/214-saksamaa`, `/et/categories/291-lati`, `/et/categories/292-leedu`, `/et/categories/352-ukraina`. No city URLs (cities like "väikekondiitrid Tallinnas/Tartus/Pärnus/Narvas" are product-type categories). Occasions: `/et/categories/184-sunnipaev` (birthday), `/185-aastapaev`, `/186-abielu`, `/187-lapse-sund`, `/188-kaastunne`, `/365-onnitlused`, `/366-tanuavaldus`, `/367-koige-kallimale`, `/377-meestele`, `/394-leinalilled`. Source: https://www.interflora.ee/sitemap.xml

**hreflang/canonical.** **No `<link rel=canonical>` and no hreflang in page HTML** (home, category, product) — hreflang lives only in the sitemap; `<meta name="robots" content="index, follow">`. Source: https://www.interflora.ee/, https://www.interflora.ee/et/categories/200-suurbritannia, https://www.interflora.ee/en/products/142-gerberas

**Homepage destination/currency.** Hero form: "Kuhu soovid lilled saata? Aadress" (address autocomplete) · "Millal soovid saata? Kuupäev" (date) · "Mille puhul? Vali tähtpäev…" (occasion select) → Vaata. Nav has "Välismaale" (abroad) with 10 countries + "Kõik riigid". Currency EUR everywhere, including UK products priced "12 Long Stem Roses 98,00 €" on the UK category. Source: https://www.interflora.ee/, https://www.interflora.ee/et/categories/200-suurbritannia

**PDP.** "Choose delivery time / Select date / Choose delivery location / Address" with states "This product is not available in the selected area", "Delivery is possible on a different date", "Previously chosen delivery date is not available. We automatically chose the earliest possible delivery date for you." Delivery fee stated in copy: "Delivery fee within Estonia is from 9,00 euro, to other countries 12-16 euro." Same-day cutoff on home: "tellimus tööpäevadel enne 16.00" (weekdays before 16:00, Sat before 12:00). Substitution on PDP: "Florist may replace a shade of colour with a similar one, if the requested colour is not available." Guarantee text: "delivery of the ordered product by the florist in fresh and perfect condition on the requested date at the price offered… Only delivery times for funerals can be guaranteed… Please check carefully that the delivery address, including local telephone number, is complete." Source: https://www.interflora.ee/en/products/142-gerberas

**Checkout/payment.** Privacy text: "uses third party payment gateways that direct to a payment page provided by the bank chosen by the User" (Estonian bank-links). Guest checkout, steps, PayPal/cards: **UNVERIFIED**. Source: https://www.interflora.ee/en/products/142-gerberas

**Trust.** No review widget found. Claims: "Interflora kohalikud floristid" on country pages; Fleurop-Interflora guarantee text. Login via Google/Facebook. **Schema: none** (no ld+json on home, category or product). Source: as above

**Visibly bad.** No canonical/hreflang tags in HTML; no schema; English product names on Estonian UK page ("Hand-tied Bouquet.", "12 Long Stem Roses." — mixed language); numeric-ID URLs.

**Taxonomy.** Tähtpäevad (Hõissa kool, Kõige kallimale, Sünnipäev, Meestele, Abielu, Lapse sünd, Õnnitlused, Aastapäev, Tänuavaldus, Kaastunne) · Lilled (Suvised kimbud, Roosid, Päeva kimp, Segakimbud, Ühevärvilised, Modernsed, Soodsad pisikimbud, Lõikelilled, Botanicum, Lilleseaded, Luksuslikud lillekarbid, Deluxe, Leinalilled) · Gurmee · Botanicum · Välismaale. Source: https://www.interflora.ee/

### 2b. Interflora UK (interflora.co.uk)

**robots/sitemap.** Disallows `/api/*`, `/worldpay/`, `/basket`, `/checkout`, `/search?*`, `/finishing-touches`. `Sitemap: https://www.interflora.co.uk/sitemap-index.xml` → 5 children: `product-sitemap.xml` (232), `blog-sitemap.xml`, `location-sitemap.xml` (**1,081**), `international-sitemap.xml` (**143**), `sitemap.xml` (184 categories). No lastmod in the index or the international sitemap. Source: https://www.interflora.co.uk/robots.txt, https://www.interflora.co.uk/sitemap-index.xml

**URL patterns.** No locale folders (UK only; Ireland is a separate interflora.ie). Destination country: `/category/international/{country}` e.g. https://www.interflora.co.uk/category/international/germany, `/category/international/albania`, `/category/international/australia`, hub `/category/international`. Domestic locations: `/flower-delivery/{county}/{town}` e.g. https://www.interflora.co.uk/flower-delivery/aberdeenshire/inverurie. Occasions: `/category/birthday-flowers`, `/category/anniversary-flowers`, `/category/funeral-flowers/casket-tributes`, plus long-tail `/category/18th-birthday`, `/category/50th-anniversary`, `/category/birthday-flowers-for-mum`. Product: `/product/{slug}-{sku}` e.g. https://www.interflora.co.uk/product/18-sumptuous-red-roses-ccror1800s. Source: sitemaps above

**hreflang/canonical.** No hreflang (single market). Self-canonical on every page (Next.js `data-next-head`). Source: https://www.interflora.co.uk/category/international/germany

**Homepage destination/currency.** Nav block "International Flower Delivery — Delivering flowers in over 130 countries" listing 16 countries + "View All Countries". Hero has a three-field finder: "Delivery date · Address · Occasion → View gifts". GBP only. Source: https://www.interflora.co.uk/

**Country page (Germany).** Long editorial copy + FAQ: "How to send flowers to Germany… Enter your recipient's full name, contact number, and address… We offer same-day delivery… place your order before 2pm on weekdays and before 9am on Saturdays… funeral… cemetery or crematorium… hospitals… ward, room number". Prices in GBP. FAQPage schema present. Source: https://www.interflora.co.uk/category/international/germany

**International hub.** "With over 30,000 florists in over 130 countries"; A–Z country list; "An Interflora platinum delivery pass costs £22 for the year and gets your free international delivery"; "Delivering beauty abroad for over 70 years… since 1946". Source: https://www.interflora.co.uk/category/international

**PDP.** Size selector ("1. What size would you like? 18 Red Roses £91 · 24 Red Roses £115"), USP bullets "Created by a local florist · Handcrafted bespoke just for you · Made fresh on the day it arrives · Personally delivered by hand", "Buy now" — **date and address are chosen in the basket/checkout, not on the PDP**. Delivery fee is separate (schema `shippingRate 7.65 GBP`). Homepage cutoffs: "Same day flower delivery – order before 3 pm Mon - Sat · Next day – order before midnight Mon-Sun"; config JSON exposes `sundayCutoff: SATURDAY 17:00`. Substitution wording on PDP: **not found**; "For delivery information please see our full Terms & Conditions." Source: https://www.interflora.co.uk/product/18-sumptuous-red-roses-ccror1800s (browser), https://www.interflora.co.uk/

**Checkout.** Not exercised — guest checkout and steps **UNVERIFIED**. Country page copy implies fields: recipient full name, contact number, address, delivery instructions, occasion, custom message.

**Payment.** Footer card icons: Visa, Mastercard, Amex, PayPal, Apple Pay, Google Pay, Klarna (`isKlarnaEnabled: true`). Worldpay gateway. Source: https://www.interflora.co.uk/ (`/images/cards/*.svg`)

**Trust.** Trustpilot widget (overlay + section); score not in HTML — Trustpilot lists Interflora UK at 4.3/5, ~154K reviews (source: https://www.trustpilot.com/review/www.interflora.co.uk, via search). "flowers guaranteed to last at least 7 days"; "TRUSTED ONLINE FLOWER DELIVERY SINCE 1923"; "Designed by our local artisan florists" with named florists on PDP. Source: https://www.interflora.co.uk/

**Schema.** Home: `Organization`+`ContactPoint`+`PostalAddress`, `BreadcrumbList`. PDP: `Product` with per-size `Offer`s (GBP), `MerchantReturnPolicy`, `OfferShippingDetails` (`shippingRate`, `DefinedRegion GB`, `ShippingDeliveryTime` handling 0–1d, transit 1–2d). Country page: `BreadcrumbList` + `FAQPage`. Source: https://www.interflora.co.uk/product/18-sumptuous-red-roses-ccror1800s

**Visibly bad.** PDP is client-rendered (curl text ≈ 2.9 KB); the "same 232 products" grid is re-used across all 143 country pages; the £22 pass upsell competes with the country CTA.

**Taxonomy.** Flower Delivery (All, Same Day, Next Day, Autumn, Corporate, from £25, In a Vase, Letterbox, Lilies, Luxury, Roses, Red Roses, Pastel, Posies, Sunflowers, Vibrant, White) · Occasions (Anniversary, Apology, Baby, Birthday, Congratulations, Friendship, Get Well, Good Luck, Just Because, Romantic, Surprise, Thank You, Thinking of You, Wedding) · Gifts & Plants · International Flower Delivery · Funeral & Sympathy (Casket Sprays, Hearts and Cushions, Letter Tributes, Posies and Baskets, Special Tributes, Sprays and Sheaves, Wreaths, Funeral/Sympathy Messages, Condolence Etiquette) · Discover Interflora. Source: https://www.interflora.co.uk/

### 2c. Interflora France (interflora.fr)

**robots/sitemap.** Aggressive `Disallow: *?*` with explicit `Allow:` for `*?page*`, `*brand*`, `*source=google*`, `*ggshopping*`; `Disallow: /i/*/p/*` (international product pages) and `Allow: */c/0`, `*/0/FR`. `Sitemap: https://www.interflora.fr/sitemap-fr.xml` — 978 URLs: 369 `/p/` products, 282 `/c/` categories, **110 `/i/{cc}/c/0` international country pages**. Source: https://www.interflora.fr/robots.txt, https://www.interflora.fr/sitemap-fr.xml

**URL patterns.** Country: `/i/{iso2}/c/0` e.g. https://www.interflora.fr/i/de/c/0, `/i/us/c/0`, `/i/tr/c/0`, `/i/za/c/0`. Product: `/p/{slug}/{variant}/FR` e.g. https://www.interflora.fr/p/amitie-eternelle-et-livraison-sur-tombe/2/FR. Category: `/c/{slug}`. International products (`/i/*/p/*`) are deliberately **noindexed via robots**. Self-canonical (`data-n-head="ssr"`); no hreflang.

**Homepage.** Nav "International ou Drom-Com": Livraison à l'International, Drom-Com, then Allemagne, Royaume-Uni, Italie, Suisse, Belgique, Espagne, Etats-Unis, Canada. Finder: "Livraison — Sélectionnez une date · Pour — Un anniversaire / … / Une livraison à l'international". Login modal has **"Continue as a guest"** (guest checkout confirmed). Claims: "réseau de plus de 3000 fleuristes… plus de 140 pays", "Livraison de fleurs en 4h", "Garantie Satisfait ou Relivré", "Élu Service Client de l'Année 2026", Ecovadis Gold badge, Trustpilot link. Source: https://www.interflora.fr/

**Country page (Germany).** Product list with "dès 60€" prices (EUR, product names in English: "Pink Orchid in Vase with Flax"), then copy: florists "ne livrent pas le dimanche ou certains jours fériés… 3 octobre", "Commandez vos fleurs le matin… livraison en 4h00 pour l'après-midi", "Vous n'avez pas besoin de parler allemand". Schema: `Itemlist` (sic) + `Product`/`Offer`, `WebPage`, `Organization`. Source: https://www.interflora.fr/i/de/c/0

**PDP.** "Livré dès aujourd'hui ou à la date de votre choix (même le dimanche)"; substitution/visual disclaimer: "Le visuel du produit floral présenté est contractuel mais, s'agissant d'une création réalisée par un artisan fleuriste… pourra parfois en différer légèrement… Vase non compris dans le prix… accessoires à valeur illustrative uniquement, non inclus". Delivery-pass upsell "24,95€/an… frais de livraison offerts". Schema `Product`+`Offer`. Source: https://www.interflora.fr/p/amitie-eternelle-et-livraison-sur-tombe/2/FR

**Payment.** Footer: "Achats 100% sécurisés CB Mastercard Visa Paypal American Express Google Pay Apple Pay"; CSS payment-mode icon set also includes Klarna, Amazon Pay, Bizum, MB Way, Multibanco, MobilePay, Swish, Postepay (shared Interflora Europe component; only the footer list is confirmed for FR). Source: https://www.interflora.fr/

**Visibly bad.** 1.5 MB HTML homepage; English product names on French pages for international products; ~110 near-identical `/i/xx/c/0` pages.

### 2d. Fleurop Germany (fleurop.de)

**robots/sitemap.** Disallows `/checkout/cart`, `/search`, `/wishlist`, `/account/*`. Sitemap index → 7 children under `/seo/sitemaps/`: `sitemap-category.xml` (265), `sitemap-category-filter.xml` (15 colour-filter URLs), `sitemap-partner.xml` (**3,420 florist-store pages**), `sitemap-products.xml` (398), `sitemap-static.xml`, `sitemap-image.xml`, `sitemap-blog.xml`. lastmod only in products. Source: https://www.fleurop.de/robots.txt, https://www.fleurop.de/sitemap.xml

**URL patterns.** Language subfolder `/en/` on the .de ccTLD (hreflang de-DE→/, en-DE→/en, x-default→/). **`/en` is `noindex,nofollow`** — English exists for UX only. City: `/blumenversand-deutschland/blumen-verschicken-{city}` e.g. https://www.fleurop.de/blumenversand-deutschland/blumen-verschicken-berlin (only ~9 cities). Florist pages: `/partnerfloristen/fleurop-filialen/{plz}-{city}/{shop-slug}`. Product: `/{slug}/{7-digit-id}` e.g. https://www.fleurop.de/sonnige-geburtstagsgruesse/0006245 (size variants `-m`, `-l` canonicalise to the base). Occasions: `/anlaesse/…`; colour filters as static URLs `/fleurop-blumen/rosenstrauss-weiss`, `/alle-blumenstraeusse-rosa`. International hub: https://www.fleurop.de/fleurop-international (no per-country URLs in the sitemap — the country is chosen in a search box: "In welchem Land soll die Blumenlieferung erfolgen? … beliebtesten 20 Länder oder… Länder-Suche"). Source: sitemaps; https://www.fleurop.de/fleurop-international

**hreflang/canonical.** Three-entry hreflang + self-canonical on every page; `<meta name=robots content=index,follow>` on DE pages. Source: https://www.fleurop.de/

**Homepage.** No destination prompt; international is a nav item "Weltweite Lieferung". Claims: "rund 5.000 Partner-Floristen deutschlandweit und etwa 50.000 internationalen Blumenfachhändlern… 150 Ländern", "Frisch gebunden von lokalen Floristen seit 1908", "7-Tage-Frischegarantie", "100-Minuten-Service", "Noch heute lieferbar" badges on products. Currency EUR. Source: https://www.fleurop.de/

**PDP.** Sizes M/L/XL/XXL ("34,99 € … Preise inkl. MwSt. zzgl. Versandkosten" — **tax in, delivery extra**), "Noch heute lieferbar", date picker with regional-holiday warning snippet ("Es kann sein, dass in Ihrer Zielregion an diesem Lieferdatum ein regionaler Feiertag ist…"), substitution: "Alle Fotos sind Beispielfotos, jeder Strauß ist ein Unikat und kann je nach Saison und Verfügbarkeit abweichen." Source: https://www.fleurop.de/sonnige-geburtstagsgruesse/0006245

**Payment.** "per Kreditkarte, PayPal, Rechnung oder Sofortüberweisung; vielerorts… Apple Pay und Google Pay"; Klarna referenced in HTML. Source: https://www.fleurop.de/

**Trust.** Trusted Shops (5 references; "Bewertungen" footer link). Trusted Shops profile lists ~154K reviews, 4.69 "Sehr gut" (source: https://www.trustedshops.de/bewertung/info_X43AA527C7FAF2848EBC11CF0EB0DC08F.html, via search — score UNVERIFIED on-page). Source: https://www.fleurop.de/

**Schema.** Home: `WebSite`+`SearchAction`, `Organization`+`ContactPoint`. PDP: `Product`+`Offer` (JSON has a syntax issue — unparsable by a strict parser on the bouquet page). City page: `BreadcrumbList` + `FAQPage`. Source: https://www.fleurop.de/blumenversand-deutschland/blumen-verschicken-berlin

**Checkout.** UNVERIFIED (not exercised). Account benefits copy: "Erinnerungsservice… Adressbuch für Empfänger".

**Taxonomy.** Saisonale Blumen · Anlässe (Geburtstag, Liebe, Geschenke, Dankeschön, Gute Besserung, Feinkost-Geschenke, Geburt, Hochzeitstag, Hochzeit, Blumenabo, Gutscheine, Jubiläum, Trauerblumen, Trauerkränze, Trauergestecke) · Blumen (Sonnenblumen, Hortensien, Rote Rosen, Lilien, Exotische, Rosen, Pflanzen, Fairtrade, Trockenblumen, Nelken, Inkalilien, Gerbera) · Sträuße von Floristen (Überraschungssträuße, Deluxe, Premium, Sternzeichen, 100-Minuten-Service, nach Stilrichtung) · Weltweite Lieferung · Blumen per Post · Firmenkunden. Source: https://www.fleurop.de/

---

## 3. Euroflorist — euroflorist.no and euroflorist.pl

### robots.txt and sitemaps
- Identical robots template on both ccTLDs, enumerating every locale prefix the platform supports (`/en /de /sv /no /nl /da /fr /pl /uk`) for `/checkout`, `/cart`, `/error`, `/my-pages`, `/order-confirmed`, `/payment`. `Sitemap: https://www.euroflorist.no/sitemap.xml` (single urlset, 685 KB) and `https://www.euroflorist.pl/sitemap.xml` (1.29 MB). lastmod on all URLs (2026-09-04); **`xhtml:link` hreflang alternates present in sitemap** (nb-NO/en-NO; pl-PL/en-PL/uk-UA). Sources: https://www.euroflorist.no/robots.txt, https://www.euroflorist.pl/robots.txt, sitemaps
- NO buckets: 900 `/en/…`, 481 `/produkt/`, 93 `/kategori/`, 89 `/blomstereksperter/` (advice), 60 `/blomster/`, **56 `/internasjonal-blomsterlevering/{country}`**, 41 `/anledning/` (occasion content), 26 `/levering-av-blomster/{city}`, 13 `/stjernetegn/`. PL buckets: 969 `/en/`, 747 `/uk/`, 484 `/produkt/`, 145 `/blog/`, 118 `/kategoria/`, 74 `/lokalne-kwiaciarnie/{city}`, 50 `/encyklopedia/`, 13 `/kalendarz-imienin-polskich/{name}` (name-day pages). Source: sitemaps

### URL patterns
- Locale: ccTLD per market + language subfolder for secondary languages (`/en` on .no; `/en` and `/uk` (Ukrainian) on .pl). Translated slugs per language: `/produkt/wielkanocna-elegancja` ↔ `/en/product/spring-elegance-1` ↔ `/uk/tovar/vesnyana-elegantnist`. Source: https://www.euroflorist.pl/produkt/wielkanocna-elegancja
- Destination country (NO): https://www.euroflorist.no/internasjonal-blomsterlevering/tyskland, `/internasjonal-blomsterlevering/irland`, `/internasjonal-blomsterlevering/japan`, hub `/internasjonal-blomsterlevering` (EN: `/en/international/germany`). Note the nav links point to `/international/tyskland`, which resolves to the canonical `/internasjonal-blomsterlevering/tyskland`. PL hub: https://www.euroflorist.pl/kwiaty-za-granice (EN `/en/international`, UK `/uk/dostavka-kvitiv-za-kordon`); PL per-country pages **UNVERIFIED** (not in sitemap; hub uses a "Wybierz kraj" dropdown).
- City: NO https://www.euroflorist.no/levering-av-blomster/oslo (EN `/en/flower-delivery/oslo`); PL https://www.euroflorist.pl/lokalne-kwiaciarnie/krakow (UK `/uk/dostavka-kvitiv/vroclav`).
- Occasion: NO `/kategori/anledning/…` for shopping and `/anledning/morsdag`, `/anledning/valentinsdag/korttekst-til-valentinsdag` for content; PL `/kategoria/okazje/wielkanoc`. Product: `/produkt/{slug}`. Source: sitemaps

### hreflang, canonical, duplicates
- Self-canonical + hreflang (no x-default) on every server-rendered page (home, city, country, PL product). NO product pages are client-rendered; canonical/hreflang appear only after JS (verified in browser on `/produkt/sommervarme`: nb-NO + en-NO). Source: https://www.euroflorist.no/levering-av-blomster/oslo, browser
- Duplicate-ish: 56 country pages on .no share one product grid (Tyskland page lists "12 Røde Roser 809 kr", "Klassisk bårekrans… 3 049 kr" — Norwegian domestic products in NOK). The Ireland page is a **hand-off**: "Send blomster til Irland – klikk her for å gå direkte til Euroflorists irske nettside" (sends the user to the sister ccTLD). Source: https://www.euroflorist.no/internasjonal-blomsterlevering/irland, https://www.euroflorist.no/internasjonal-blomsterlevering/tyskland

### Homepage destination/currency
- NO hero: single field "Hvilken adresse skal blomstene sendes til? f.eks. Akersgata 1" (address autocomplete) → Send blomster. Nav item "Utlandet". Currency NOK ("Fra 429 kr"). FAQ: "kan du sende blomster til over 140 land". Source: https://www.euroflorist.no/
- PL: nav "Zagranica"; "Dostawa w ten sam dzień — Dla zamówień do 17:00"; "Światowa kwiaciarnia internetowa — Wysyłaj kwiaty do Polski i na cały świat"; "30+ lat doświadczenia". Currency PLN. International hub: "Do jakiego kraju wysłać chcesz kwiaty? Wybierz kraj" (18 countries) and "zapłacić w polskich złotych i przejść cały proces po polsku"; FAQ: cost "zależy od kraju… oraz aktualnego kursu walut"; "nie potrzebujesz żadnych dokumentów ani formularzy celnych. Bukiet nie jest fizycznie wysyłany z Polski". Source: https://www.euroflorist.pl/, https://www.euroflorist.pl/kwiaty-za-granice

### Product page
- NO PDP (browser): sizes "Prisvennlig 429 kr / Standard BESTSELGER 499 kr / Premium 599 kr", then "HVILKEN ADRESSE SKAL BLOMSTENE SENDES TIL?" → "VELG LEVERINGSDATO" → "VELG LEVERINGSALTERNATIV" → Legg i handlekurv. Copy: "Du mottar en SMS med leveringsbekreftelse", "Vi kan ikke garantere levering på nøyaktig det valgte tidspunktet", substitution "bildet viser bukettens farge og form. Blomstene kan variere avhengig av sortiment og sesong. Vase følger ikke med.", **"En serviceavgift på cirka 5–10 %… er inkludert i alle bestillinger… Avgiften er en del av det totale beløpet som vises i kassen"** (service fee disclosed on PDP). Source: https://www.euroflorist.no/produkt/sommervarme
- PL PDP: "Wybierz rozmiar Mały/Średni/Duży · Adres dostawy · Wybierz datę dostawy · Opcje doręczenia · Dodaj do koszyka"; "Darmowa dostawa kurierem DHL/DPD… w dni robocze… Dostawy w weekendy… za dodatkową opłatą… Brak możliwości wyboru konkretnej godziny"; "W cenę wliczony jest bezpłatny bilecik… Cena nie obejmuje wazonu"; substitution: "Bukiety są ręcznie wiązane przez lokalną kwiaciarnię i mogą różnić się od produktu przedstawionego na zdjęciu ze względu na sezonową dostępność, wahania cen i różnice w asortymencie kwiaciarni." Source: https://www.euroflorist.pl/produkt/ten-moment-pl, https://www.euroflorist.pl/produkt/wielkanocna-elegancja

### Checkout
- Not exercised; guest checkout and step count **UNVERIFIED**. Robots reveal a `/checkout` → `/payment` → `/order-confirmed` path (three routes). Source: robots.txt

### Payment
- NO: footer logos Vipps, Klarna, PayPal, Mastercard; FAQ "de vanligste betalingskortene samt Vipps"; "Betal med VIPPS — Alltid trygt og sikkert" USP. Source: https://www.euroflorist.no/
- PL: logos "opłatą blikiem", GooglePay, PayPal, MasterCard, Visa; international FAQ: "karty płatnicze, BLIK, PayPal, GPay". iDEAL string present in HTML (platform-wide). Source: https://www.euroflorist.pl/, https://www.euroflorist.pl/kwiaty-za-granice

### Trust
- No third-party review widget on either site. USP row: "Levering samme dag — 6 dager i uken · Beste verdi · Kvalitetsgaranti — Garantert friske blomster i 7 dager · Betal med VIPPS"; PL: "gwarancja jakości i świeżości", "Sprawdzeni dostawcy", "Euroflorist był pierwszym kurierem kwiatowym… bezpieczne płatności online (1995)". Delivery pass "159 kr / 6 måneder". SMS delivery confirmation (NO PDP). Source: https://www.euroflorist.no/, https://www.euroflorist.pl/

### Schema
- Home (both): `Organization`+`ContactPoint`, `WebSite`, **`FAQPage`**. City/country pages: only `Organization` (no Breadcrumb/ItemList). PL PDP: `Product`+`Brand`+`Offer` with `UnitPriceSpecification` (PLN) and `OfferShippingDetails` (`DefinedRegion PL`, `ShippingDeliveryTime` with `OpeningHoursSpecification` business days). NO PDP: `Product` (client-side). International hub PL: `FAQPage`. Source: https://www.euroflorist.pl/produkt/ten-moment-pl, https://www.euroflorist.no/produkt/sommervarme

### Visibly bad
- NO product pages render nothing without JS (curl title empty); ~850 KB HTML per page; nav links to `/international/*` that differ from canonical `/internasjonal-blomsterlevering/*`; country pages recycle the domestic NOK grid; PL product title mismatch ("Wiosenna elegancja" page at `/produkt/wielkanocna-elegancja`, seasonal item "obecnie niedostępny" still indexed); emoji in `<title>` ("Send blomster 💐").

### Taxonomy
- NO: Bestselgere · Bursdag · Sensommerblomster · Anledning (Bursdag, Bare fordi, God bedring, Kjærlighet, Kondolanse, Nyfødt) · Begravelse (Bårebuketter, Båredekorasjoner, Kranser) · Alle buketter (Etter pris: Under 400 kr / Fra 400 kr / Eksklusive; Etter type: Roser, Solsikker, Hortensia, Planter, Orkideer; Etter farge; Gavesett) · Nyheter · Utlandet · Bedrift · Hjelp. Source: https://www.euroflorist.no/
- PL: Kwiaty na dziś · Okazje (Urodziny, Imieniny, Rocznica, Kocham Cię, Gratuluję, Dziękuję, Przepraszam; Kwiaty na pogrzeb: Wiązanki, Kondolencyjne) · Jesień · Darmowe czekoladki · Kwiaty (Jakie kwiaty? Róże, Frezje, Słoneczniki, Goździki, Lilie, Hortensje, Gerbery, Alstremeria; Jaka cena? do 130 zł / do 200 zł / XL premium; Jaka kolekcja? Klasyczne, Nowoczesne, W papierze, Flower boxy, Rośliny, "Z polskiej uprawy"; Jaki kolor?) · Torty · Zagranica · Dla Firm. Source: https://www.euroflorist.pl/

---

## 4. Bloom & Wild (bloomandwild.com, .de, /de-at/, .fr, .at)

### robots.txt and sitemaps
- bloomandwild.com is behind Cloudflare and returns 403 to curl/WebFetch; read in a browser. robots.txt: `Disallow: /en-at/*` (an old English-Austria locale), `/send-to/`, `/send-flowers/tag/*` (tag filters — but `/send-flowers/tag/birthday` still appears in the sitemap), `/search`, `/site-closed-fr-fr.html`, `/site-closed-fr-en.html`, dozens of partner promo slugs, and the same list duplicated under `/de-at/`. No Sitemap line in robots. Source: https://www.bloomandwild.com/robots.txt (browser)
- Sitemap index → `en-gb-pages.xml` (735 URLs, lastmod on all, no hreflang), `pdp-pages.xml` (711 products, lastmod), `de-at-pages.xml`, `de-at/pdp-pages.xml`. bloomandwild.de: robots lists `de-de-pages.xml` (~520 URLs) and `pdp-pages.xml` (~150 products), all lastmod 2026-09-04. Source: https://www.bloomandwild.com/sitemap.xml, https://www.bloomandwild.de/robots.txt, https://www.bloomandwild.de/sitemap.xml
- en-gb buckets: 182 `/send-flowers/*` (tag/tagonly/type collections), 199 `/the-blog/*`, ~120 UK county/city pages (`/greater-london/*` 14, `/london/*` 12, `/kent-flower-delivery`, `/aberdeenshire`…), `/flower-delivery-to-germany`, `/flower-delivery-to-austria`, `/flower-delivery-to-vienna`, `/international-flower-delivery`, `/ireland-flower-delivery`. Source: https://www.bloomandwild.com/en-gb-pages.xml

### URL patterns
- Locale: **mixed** — UK on `.com` root (hreflang en, en-gb), Germany on `.de` ccTLD (de, de-de), Austria as `.com/de-at/` subfolder (de-at); bloomandwild.at 301s to `https://www.bloomandwild.com/de-at/`; **bloomandwild.fr 301s to `https://www.bloomandwild.com/site-closed-fr-fr.html`** (French site closed; UK footer links "Flower delivery France - Bergamotte", the sister brand). Source: https://www.bloomandwild.com/ (head), WebFetch redirects
- Collections: `/send-flowers/tagonly/{tag}` e.g. https://www.bloomandwild.com/send-flowers/tagonly/sympathy-gifts, `/send-flowers/tagonly/thank-you-gifts`, `/send-flowers/tag/birthday`, `/send-flowers/type/subscription`; DE: `/blumen-versenden/tagonly/letterbox`. Product: `/send-flowers/send/{slug}/{id}` e.g. https://www.bloomandwild.com/send-flowers/send/the-faye/2917; DE `/blumen-versenden/Senden/{slug}/{id}` (capital "Senden"). Destination country pages are few and editorial (`/flower-delivery-to-germany`). Source: sitemaps

### hreflang, canonical
- Home: x-default **absent**; hreflang en, en-gb→.com; de, de-de→.de; de-at→.com/de-at/. UK PDP: en + en-gb only. DE PDP: de, de-de→.de and de-at→.com/de-at/…/65634 (same product id shared across DE/AT). `/de-at/` home has only a self de-at hreflang and canonical `https://www.bloomandwild.com/de-at/`. Source: browser reads of https://www.bloomandwild.com/, https://www.bloomandwild.de/blumen-versenden/Senden/lora-de/65634, https://www.bloomandwild.com/de-at/

### Homepage destination/currency
- No destination prompt; ships domestically only (UK site: Royal Mail/DPD; DE site: DHL/Express, "Lieferung nach Österreich via GO!Express", UK/IE via separate sites). Country choice is by site. Currency fixed per site (£ / €). Cookie banner ("Reject all / Accept all") precedes content. Source: https://www.bloomandwild.com/, https://www.bloomandwild.de/lieferinformationen

### Product page
- UK PDP: "The Faye £28 · 4.85 (369)" · "Send" · "Earn 140 Rewards points" · "Arrives in bud, blooms over 48 hours" · Delivery info tab: "FREE next day delivery — Sent with Royal Mail… Place your order before 10pm for tracked next-day delivery", "Guaranteed delivery from £5 — Sent with DPD… Monday to Sunday", greetings cards "before 4:30pm (weekdays) or 1pm (Saturday)". Date is chosen after "Send", not on the PDP. Price shown is product only; delivery is free or from £5. No substitution wording on PDP. Source: https://www.bloomandwild.com/send-flowers/send/the-faye/2917 (browser)
- DE PDP: "Lora 23,95 € · 4,77 (227) · Liefertag frei auswählbar mit DHL oder unserem Express-Service · Sicher zahlen mit PayPal, Klarna (Rechnung, Lastschrift und Sofortüberweisung) oder Kreditkarte · Gratis Grußkarte für deine persönliche Nachricht". Cutoffs: "Bestelle von Montag bis Freitag vor 13 Uhr für eine Lieferung am nächsten Tag" (DHL), "Montag bis Donnerstag vor 16 Uhr" (Express). Source: https://www.bloomandwild.de/blumen-versenden/Senden/lora-de/65634, https://www.bloomandwild.de/lieferinformationen

### Checkout
- Not exercised: guest checkout, steps, phone requirement **UNVERIFIED**. Card message is free and standard ("Gratis Grußkarte").

### Payment
- DE: "Rechnung, Kreditkarte, PayPal oder Apple Pay"; "Klarna (Rechnung, Lastschrift und Sofortüberweisung)". UK: **UNVERIFIED** (not shown on home/PDP text). Source: https://www.bloomandwild.de/

### Trust
- UK: "Excellent 4.6 average | 75,250 reviews" (Trustpilot-style widget on home), per-product ratings, "B Corp", "Bloom & Wild Rewards", "Take £10 off your first order". DE: Trusted Shops "Sehr gut 4.8 durchschnittlich | 17,478 Bewertungen"; AT: "Sehr gut 4.45 durchschnittlich | 519 Bewertungen" and "Deutschlands beliebtester Blumenversand" (German claim shown on the Austrian site). Source: https://www.bloomandwild.com/, https://www.bloomandwild.de/, https://www.bloomandwild.com/de-at/

### Schema
- Home: **no ld+json**. PDP (UK/DE): `Product` (name, image, description, offers). No Breadcrumb/FAQ observed. Source: browser reads above

### Visibly bad
- Closed French site still 301s every .fr URL to a "site-closed" page; robots disallows `/send-flowers/tag/*` while the sitemap lists those URLs; no x-default; German copy on the Austrian storefront; Cloudflare blocks non-browser fetchers (could affect some crawlers/AI agents); 4-second client render before content appears.

### Taxonomy
- UK nav: All · Flowers · Birthday gifts · Autumn picks · Food & drink · Letterbox gifts · Hampers · Plants · The card shop · Subscriptions; occasion tags: birthday, sympathy-gifts, thank-you-gifts, graduation-gifts, fathers-day, mothers-day-*, valentines-flowers, christmas-*, rosh-hashanah, uni-gifting, gifts-for-mother-in-laws, pet-friendly, under30, free-delivery. DE: Nächster Liefertermin · Geburtstag · Blumen · Anlässe (Geburtstag, Vielen Dank, Einfach so, Glückwünsche, Zur Geburt, Neues Zuhause, Mitgefühl, Hochzeitstag) · Geschenkgutscheine · Pflanzen · Geschenksets · Geschenk-Abos. Source: https://www.bloomandwild.com/, https://www.bloomandwild.de/

---

## 5. GiftBasketsOverseas.com (GBO)

### robots.txt and sitemaps
- robots: blocks Bytespider and ImagesiftBot; `Disallow: /change-page/`, `*__hstc=`, `*zip=`, `*ymal=`, `*utm_campaign=`; `crawl-delay: 5`; `Sitemap: https://www.giftbasketsoverseas.com/sitemap.xml`; `Host:` directive. Source: https://www.giftbasketsoverseas.com/robots.txt
- Sitemap index → 8 children `…/www.giftbasketsoverseas.com_1.xml` … `_8.xml`. Each holds up to 30,000 URLs; total ≈ **240k URLs**, of which **~140k are `/gifts/{Product}-to-{country}.htm`** (product × destination) and **≥30k are `/gift-delivery/gifts-from-{origin}-to-{destination}.htm`** (origin × destination corridor pages). No lastmod. Source: https://www.giftbasketsoverseas.com/sitemap.xml, `_1.xml`, `_2.xml`, `_8.xml`

### URL patterns
- Locale: **separate domain per language** (hreflang x-default/en→giftbasketsoverseas.com, es→canastasderegalointernacionales.com, fr→panierscadeauxinternationaux.com, de→geschenkkoerbeversand.de, pt→cestasdepresente.com.br, ru→giftbaskets.ru). Source: https://www.giftbasketsoverseas.com/ (head)
- Destination country: `/{country}/` e.g. https://www.giftbasketsoverseas.com/germany/, `/poland/`, `/germany-apo/`. City: `/{country}/{City}` e.g. https://www.giftbasketsoverseas.com/germany/Regensburg, `/germany/Ulm`, `/italy/Berlingo` (4,961 Italian and 374 German city URLs). Product×country: https://www.giftbasketsoverseas.com/gifts/Seasonal_Sipping-to-vanuatu.htm. Corridor: https://www.giftbasketsoverseas.com/gift-delivery/gifts-from-bermuda-to-guyana.htm. Occasion/audience: `/50th-birthday-gift-baskets`, `/christmas-gift-baskets-for-employees`, `/Gifts-to-Airline-Companies-and-Airline-Staff`. `.htm`/`.php` mixed. Source: sitemaps

### hreflang, canonical, duplicates
- Self-canonical everywhere; 6-language hreflang on home, country and product×country pages (each language domain has its own translated product slug, e.g. de `…/prasent/Saisonales_Schlurfen-nach-vanuatu` — machine-translated "Schlürfen"). Corridor pages carry only en + ru alternates. **Textbook doorway pattern**: 140k product×country pages differ only in the country word ("Send 'Seasonal Sipping' to Vanuatu…") and shipping numbers. Source: https://www.giftbasketsoverseas.com/gifts/Seasonal_Sipping-to-vanuatu.htm, https://www.giftbasketsoverseas.com/gift-delivery/gifts-from-bermuda-to-guyana.htm

### Homepage destination/currency
- Header: language switcher (6) and a **currency dropdown with ~120 currencies** (USD default; EUR, GBP, PLN, NOK, SEK, DKK, CHF…). "Countries — Select a country of delivery — Top Serviced Countries (USA, UK, Australia, Brazil, Canada, China, Germany…) — All Serviced Countries A–Z". Disclaimer: "Our payment processing is always completed in US Dollars (USD). The price in other currency is estimated based on the today's bank rate." FAQ: "Can I pay in my local currency? Our invoice will generate your order total in USD and your local currency… charged in your currency based on the exchange rate used by your card's issuing bank." Source: https://www.giftbasketsoverseas.com/, https://www.giftbasketsoverseas.com/faq.php

### Country page (Germany)
- Title "Gift Baskets to Germany — 680 hampers and gifts to Germany"; "417 serviced locations in Germany" with the full city list; local-holiday guide ("German Asparagus Season…"); FAQPage schema with "Do the gifts to Germany have tax from customs included?", "Can you send alcohol to Germany?", "How long does German gift delivery take?". Source: https://www.giftbasketsoverseas.com/germany/

### Product page
- Price "$129.95" + shipping "$29" to the destination (schema), "handlingTime 0–2 days, transitTime 2–4 days"; "the exact packaging and brands of products may vary depending on the delivery location" (substitution); delivery windows "between 9 am and 9 pm… cannot guarantee an exact delivery time" (FAQ). Not all-inclusive (shipping and possible customs separate; FAQ addresses "Is My Gift Going Through Customs?"). Delivery date picker **UNVERIFIED** (JS). Source: https://www.giftbasketsoverseas.com/gifts/Seasonal_Sipping-to-vanuatu.htm, https://www.giftbasketsoverseas.com/faq.php

### Checkout
- UNVERIFIED (not exercised). Menu shows "Gift Wizard", "Track Order", "GiftyLink Service" (recipient chooses own gift).

### Payment
- Footer icon set: Visa, Mastercard, Amex, Discover, Diners, JCB, UnionPay, Elo, PayPal, Apple Pay, Venmo, Zelle, Sofort, Bitcoin, wire transfer, Ria, PSE, OXXO, Efecty, Boleto, DragonPay, Qiwi. No Klarna/iDEAL/BLIK/Vipps/MobilePay/Swish icons. Source: https://www.giftbasketsoverseas.com/ (sprite icon names)

### Trust
- Organization `AggregateRating 4.92 / 2,043 reviews`; product `AggregateRating 3.3 / 50`; "Industry Accreditations & Reviews — Better Business Bureau, Yahoo Viewpoints, Trust Pilot"; "100% Satisfaction Guarantee"; **"Pictures of Gift Recipients"** (delivery-photo proof gallery); explainer videos ("Is GBO Too Good to be True?", "How Do You Deliver My Gift so quickly?", "Why Do I See Different Prices?"); "200+ countries". Source: https://www.giftbasketsoverseas.com/

### Schema
- Home: `WebSite`+`SearchAction`, `Organization`+`AggregateRating`+`ContactPoint`+`PostalAddress`. Country page: `FAQPage`. Product×country: `Product`+`Offer`+`OfferShippingDetails` (`shippingRate`, `DefinedRegion` = destination, `ShippingDeliveryTime`), `AggregateRating`, `VideoObject`. Source: pages above

### Visibly bad
- ~240k thin programmatic URLs; corridor pages ("gifts from Bermuda to Guyana") are pure doorway pages; 1 MB+ HTML with a 120-currency list and full country list in every page; machine-translated foreign slugs; `crawl-delay: 5` in robots; USD-only settlement despite 120 display currencies.

### Taxonomy
- Countries (destination) · Occasions (Lunar New Year, Valentine's, Women's Day, Graduation, Easter, Mother's/Father's Day, Wedding Season, Back to School, Black Friday, Holiday Season) · audience/corporate ("for employees", "for boss", "to Software Companies") · product type (wine, chocolate, hampers) · Corporate & Bulk. Source: https://www.giftbasketsoverseas.com/

---

## Comparison table

| Site | Locale strategy | Country in URL | Currency handling | Guest checkout | Local payment methods (visible) | Review platform | Schema on PDP / corridor |
|---|---|---|---|---|---|---|---|
| FloraQueen (.com) | ccTLD per language (.com/.es/.de/.fr/.it/.pl/.com.tr/.com.ru/.com.br); x-default→.com | `/collections/flowers-{country}` and `/collections/flowers-{city}` (12.6k) | EUR only on .com; delivery fee varies by destination | Shopify Checkout; UNVERIFIED | Cards, PayPal, Amazon Pay, Sofort, Google/Apple Pay | Judge.me on-site (4.8/5, 18K) | PDP: Product+AggregateOffer, Store, Breadcrumb; corridor: Store+Breadcrumb only |
| Interflora EE | ccTLD + `/et /en /ru` subfolders; hreflang in sitemap only | `/et/categories/{id}-{country}` | EUR incl. for foreign destinations; fee 12–16 € abroad | UNVERIFIED | Estonian bank links (per privacy text) | none | none |
| Interflora UK | single market ccTLD | `/category/international/{country}` (143) | GBP | UNVERIFIED | Cards, PayPal, Apple/Google Pay, Klarna | Trustpilot 4.3 (154K) | PDP: Product+Offer+ShippingDetails+ReturnPolicy; corridor: Breadcrumb+FAQPage |
| Interflora FR | single market ccTLD | `/i/{iso2}/c/0` (110); `/i/*/p/*` blocked | EUR | Yes ("Continue as a guest") | CB/Visa/MC/Amex, PayPal, Google/Apple Pay | Trustpilot link; "Service Client de l'Année" | PDP: Product+Offer; corridor: ItemList+Product+Offer |
| Fleurop DE | ccTLD + noindexed `/en` | none for abroad (country search box); `/blumenversand-deutschland/blumen-verschicken-{city}` | EUR incl. MwSt, zzgl. Versand | UNVERIFIED | Cards, PayPal, Rechnung, Sofort, Apple/Google Pay, Klarna | Trusted Shops (~4.7) | PDP: Product+Offer; city: Breadcrumb+FAQPage |
| Euroflorist NO / PL | ccTLD per market + `/en` (`/uk` on PL) subfolders; hreflang in sitemap + HTML | NO `/internasjonal-blomsterlevering/{country}` (56); PL hub with dropdown | NOK / PLN; 5–10 % service fee disclosed on PDP | UNVERIFIED | NO: Vipps, Klarna, PayPal, cards; PL: BLIK, GPay, PayPal, cards | none | PDP: Product+Offer+ShippingDetails (PL); home: FAQPage |
| Bloom & Wild | .com (UK) + .de ccTLD + `.com/de-at/` subfolder; .fr closed | few editorial pages (`/flower-delivery-to-germany`) | £ / € fixed per site | UNVERIFIED | DE: PayPal, Klarna, Rechnung, Apple Pay; UK UNVERIFIED | Trustpilot-style 4.6 (75K) UK; Trusted Shops 4.8 (17K) DE | PDP: Product only; no corridor pages |
| GiftBasketsOverseas | separate domain per language (6) | `/{country}/`, `/{country}/{City}`, `/gifts/{product}-to-{country}.htm`, `/gift-delivery/gifts-from-X-to-Y.htm` | ~120 display currencies, settled in USD | UNVERIFIED | PayPal, Apple Pay, Venmo, Zelle, Sofort, Bitcoin, LatAm methods | Org AggregateRating 4.92; BBB, Trustpilot links | PDP: Product+Offer+ShippingDetails+AggregateRating+Video; country: FAQPage |

---

## Adopt / Avoid

**Adopt**
1. Put `xhtml:link` hreflang alternates in the sitemap *and* in HTML with an x-default — Interflora.ee has them only in the sitemap and no canonicals; FloraQueen has HTML hreflang but none on PDPs. Do both. (interflora.ee, floraqueen.com)
2. One destination-first hero: "Where / When / What occasion" (Interflora.ee, Interflora UK) or a single address field (Euroflorist NO). Ask for the destination once, before showing prices.
3. Show the destination-dependent delivery fee next to each selectable date on the PDP ("Tomorrow 05 September €8,90") — FloraQueen's clearest UX element.
4. Country corridor pages with real FAQ content (cutoffs, funeral/hospital rules, national-flower tip, local holidays) plus `FAQPage` + `BreadcrumbList` schema — Interflora UK `/category/international/germany` and GBO `/germany/` are the only country pages that are not pure grids.
5. Ship `Product` + `Offer` + `OfferShippingDetails` (rate, `DefinedRegion` = destination country, `ShippingDeliveryTime`) and `MerchantReturnPolicy` on PDPs — Interflora UK, Euroflorist PL and GBO already do; FloraQueen does not.
6. Disclose fees on the PDP in plain words: Euroflorist NO's "serviceavgift på cirka 5–10 % … er inkludert i alle bestillinger" and PL's "Cena nie obejmuje wazonu / bilecik wliczony".
7. Substitution line on the PDP itself (Fleurop "Alle Fotos sind Beispielfotos, jeder Strauß ist ein Unikat…"; Euroflorist PL; Interflora FR "visuel contractuel… pourra différer légèrement") rather than buried in Help as FloraQueen does.
8. Market-specific payment badges above the fold: Vipps (NO), BLIK (PL), Klarna/Rechnung/Sofort (DE), iDEAL/Bancontact for NL/BE; Euroflorist and Bloom & Wild DE do this well.
9. Offer "Continue as a guest" explicitly in the login modal (Interflora FR) and social login (FloraQueen: Google/Meta/Amazon/LinkedIn).
10. Publish an `agents.md` / agentic-discovery sitemap and keep the checkout human-only (FloraQueen/Shopify robots) — cheap future-proofing for AI shopping agents.

**Avoid**
11. Programmatic geo pages that share one product grid — FloraQueen's 12.6k `flowers-{city}` collections, Interflora UK's 143 country pages, GBO's ~240k product×country and origin×destination pages. Launch only country pages (and top cities) that have unique inventory, fees, cutoffs and copy.
12. Duplicate slugs for one entity (`flowers-madrid`, `flowers-madrid-delivery`, `flower-delivery-madrid`; product `-2/-3/-4`) — FloraQueen.
13. Showing domestic products/currency on a foreign-destination page (Euroflorist NO's Germany page lists NOK domestic bouquets; Interflora FR lists English-named German products) or handing the user to a sister site (Euroflorist NO → "irske nettside"). Our corridor pages must show destination inventory, priced in the buyer's currency.
14. Client-side-only rendering of PDPs and canonicals (Euroflorist NO, Interflora UK PDP, Bloom & Wild behind Cloudflare 403) — server-render title, canonical, hreflang, price and schema.
15. Display-only multi-currency with USD settlement and a "rate may differ" disclaimer (GBO) — either charge in the shown currency or show a single currency per locale.
