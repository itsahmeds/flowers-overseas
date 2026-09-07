# National / regional European florists — reference-site research

Research date: 2026-09-05. Method: WebFetch (rendered-to-markdown) plus `curl` of raw HTML for canonical / hreflang / `application/ld+json` checks, plus Trustpilot / Trusted Shops lookups. Firecrawl and Ahrefs were not available. A live checkout walk-through (add to cart, proceed to checkout) was attempted in the sandboxed browser but was blocked by the session's permission classifier, so every checkout-form claim below (guest checkout, address field order, phone requirement, message limits) is either sourced from a policy/FAQ page or marked **UNVERIFIED**.

Sites: Colvin (ES/PT), Bergamotte (FR/BE), Blume2000 (DE/AT), Bonita Blomster (NO), Flora Nordica (DK), Delejos (ES-language international relay), Aquarelle (FR).

Note on Aquarelle URL: `https://flower-delivery.aquarelle/` does resolve, but it serves an "International Flower Delivery" country-chooser page branded **Universal Flower** ("operating since 1997 ... to over 150 countries") — not the French Aquarelle shop. The Aquarelle analysis below therefore uses `https://www.aquarelle.com/` and the international page is described separately in the Aquarelle section.

---

## 1. Colvin — thecolvinco.com (ES, PT)

Platform: Shopify (robots.txt boilerplate, `/products/`, `/collections/`, `/pages/`, Shop Pay icon). Source: https://www.thecolvinco.com/robots.txt

### robots.txt highlights and sitemap structure
- Standard Shopify robots: disallows `/admin`, `/cart/`, `/checkout`, `/checkouts/`, `/orders`, `/account` (allows `/account/login`); blocks filter/sort crawl traps (`/collections/*sort_by*`, `/collections/*+*`, `/collections/*filter*&*filter*`), preview params; adsbot-google gets its own block. Contains the 2026 Shopify "agents should use UCP/MCP" and "Checkouts are for humans" text. `Sitemap: https://www.thecolvinco.com/sitemap.xml`. Source: https://www.thecolvinco.com/robots.txt
- Sitemap index has 9 children: `sitemap_agentic_discovery.xml`, `sitemap_products_1.xml`, `sitemap_pages_1.xml`, `sitemap_collections_1.xml`, `sitemap_blogs_1.xml`, plus the same four under `/pt/`. Products sitemap = 451 URLs; collections = 74; pages ~60+ (35 of the first 60 are city pages). No `xhtml:link` hreflang inside sitemaps (hreflang is in the HTML head instead). Sources: https://www.thecolvinco.com/sitemap.xml , https://www.thecolvinco.com/sitemap_products_1.xml?from=15552189727093&to=15957294776693 , https://www.thecolvinco.com/sitemap_collections_1.xml?from=701880435061&to=728563581301 , https://www.thecolvinco.com/sitemap_pages_1.xml?from=691541082485&to=703319998837

### URL patterns
- Locale: root = Spanish/Spain (default), `/pt/` = Portuguese/Portugal, same domain, same EUR currency. Footer switcher offers countries "España, Portugal" and languages "Español, Português (portugal)". Source: https://www.thecolvinco.com/
- Occasion (collections, keyword-stuffed slugs):
  - https://www.thecolvinco.com/collections/floristeria-a-domicilio-dia-de-la-madre
  - https://www.thecolvinco.com/collections/flores-a-domicilio-sant-jordi
  - https://www.thecolvinco.com/collections/floristeria-a-domicilio-para-san-valentin-365-dias-de-amor
  - https://www.thecolvinco.com/collections/floristeria-a-domicilio-condolencias-y-recuperate-pronto
- Product: `/products/{slug}` e.g. https://www.thecolvinco.com/products/flores-a-domicilio-ramo-flores-blancas ; PT twin has a *translated slug*: https://www.thecolvinco.com/pt/products/flores-em-casa-ramos-flores-brancas
- Category / type / colour / flower: https://www.thecolvinco.com/collections/flores-a-domicilio-ramos-flores , https://www.thecolvinco.com/collections/flores-rojas , https://www.thecolvinco.com/collections/ramos-de-girasoles , https://www.thecolvinco.com/collections/floristeria-a-domicilio-ramos-de-flores-menos-de-35
- City pages are Shopify *pages* not collections: https://www.thecolvinco.com/pages/envio-flores-domicilio-madrid , https://www.thecolvinco.com/pages/envio-flores-domicilio-barcelona , https://www.thecolvinco.com/pages/envio-flores-domicilio-torrelodones (down to small suburbs), PT: https://www.thecolvinco.com/pages/entrega-flores-lisboa , https://www.thecolvinco.com/pages/entrega-flores-porto . Also a stray https://www.thecolvinco.com/pages/copia-de-flores-a-domicilio-en-sevilla ("copy of") page is in the sitemap. Source: pages sitemap above.

### hreflang and canonical
- Homepage head: `canonical https://www.thecolvinco.com/`; `hreflang x-default → /`, `es-ES → /`, `pt-PT → /pt`. Product page: canonical self; `x-default` and `es-ES` → ES product URL, `pt-PT` → `/pt/products/flores-em-casa-ramos-flores-brancas`. Requesting `/pt/products/{es-slug}` serves the PT page with canonical pointing to the translated PT slug (good). Source: curl of https://www.thecolvinco.com/ and https://www.thecolvinco.com/products/flores-a-domicilio-ramo-flores-blancas
- Duplicate/doorway risk: ~35 near-identical `envio-flores-domicilio-{city}` pages. The Madrid page repeats generic copy ("Averigua cuales son sus flores favoritas...") with 8 products (€38.99–€49.99) and 50+ city links; no Madrid-specific cutoff. Assessed as doorway-like. Source: https://www.thecolvinco.com/pages/envio-flores-domicilio-madrid

### Homepage
- First action: hero "Regala flores bonitas" / "Sorpréndele hoy y envía flores a domicilio en 24h" → browse. No postcode or date capture on homepage; product cards show "Entrega disponible Martes 8 de Septiembre". Source: https://www.thecolvinco.com/
- Nav: Todos los productos; Regalos (Cumpleaños, Nacimiento, Novia, Amor, Porque sí, Condolencias); Flores (Ramos, Arreglos, Plantas con flores, Flores por color, Flores por tipo); Verano (New); Menos de 35€; Suscripciones; Para empresas; Invita a un amigo. Source: https://www.thecolvinco.com/

### Product page (El Clásico – Ramo con flores blancas, €39.99)
- Price "39,99 €" with "Impuestos incluidos"; "Envío desde 6,99€. Personaliza el envío y la entrega en el próximo paso"; free shipping over €79. Date picker is *not* on the PDP — date/slot is chosen at cart/checkout ("en el próximo paso"). Source: https://www.thecolvinco.com/products/flores-a-domicilio-ramo-flores-blancas
- Add-ons on PDP: vases €9.99–€26.99; gift wrap €3; cards €2–€4; chocolates/sweets €7.99–€18.99; Miffy plush €10.95–€22.95; candles €9.99–€15.99; books €9.99–€29.95. Some bouquets flagged "Jarrón gratis". Source: same URL.
- Substitution: "Como cada tallo es único, los colores o las flores utilizadas pueden variar respecto a las de la foto". T&Cs: "COLVIN podrá dar la opción de: (a) suministrar al cliente, sin aumento de precio, un producto de características similares o de superior calidad" or refund. Sources: PDP above; https://www.thecolvinco.com/pages/terminos-y-condiciones
- No on-page reviews, no guarantee block. Care copy present. Source: PDP above.

### Checkout
- Shopify checkout (paths `/checkout`, `/checkouts/` disallowed in robots). Guest checkout: **UNVERIFIED** (Shopify default allows guest; could not load checkout). Delivery slot: help centre says customer "puede elegir la fecha y la franja horaria" with paid 2-hour slots. Source: WebSearch snippet of https://colvin.elevio.help/es/articles/693-puedo-programar-la-hora-de-entrega-de-mi-colvin (article fetch blocked; UNVERIFIED wording).
- Address format / apartment field / postcode position: UNVERIFIED (Shopify ES default puts Código postal before Ciudad/Provincia). Recipient phone: T&Cs only say complete address required; phone requirement UNVERIFIED. Card message limit: UNVERIFIED (photo card offered per T&Cs). Source: https://www.thecolvinco.com/pages/terminos-y-condiciones

### Payment methods
- Footer icons (Shopify `pi-*` classes): American Express, Apple Pay, Diners Club, Discover, Google Pay, JCB, Klarna, Maestro, Mastercard, PayPal, Shop Pay, UnionPay, Visa. **No Bizum, no MB Way/Multibanco** found in HTML. T&Cs additionally mention "Amazon Pay" (likely stale). Sources: curl of https://www.thecolvinco.com/ ; https://www.thecolvinco.com/pages/terminos-y-condiciones

### Trust signals
- No review widget or score on homepage/PDP; HTML loads Okendo/Loox/Yotpo scripts but no visible rating. Trustpilot: "Colvin — TrustScore 3.5, 6,333 reviews". Delivery promise "De puerta a puerta en 24h". No delivery-photo promise found. Sources: https://www.thecolvinco.com/ ; https://www.trustpilot.com/review/thecolvinco.com

### Schema.org (product page)
- `Product` (+ `Brand`, single `Offer`), plus `Organization`; homepage adds `WebSite`/`SearchAction`. No `AggregateRating`, no `OfferShippingDetails`. Source: curl of https://www.thecolvinco.com/products/flores-a-domicilio-ramo-flores-blancas

### Taxonomy
- Occasions (11 collections): San Valentín, Día del Padre, Boda, Nacimientos, **Sant Jordi**, Día de la Madre, Fin de curso, Cumpleaños, Porque sí, Condolencias/Recupérate pronto, "Me lo merezco". Flower types (20): claveles, crisantemos, lirios, orquídeas, girasoles, alstroemerias, eucalipto, gerberas, tulipanes, rosas by colour. Colours (10+): naranjas, moradas, azules, rosa, amarillas, beige, blancas, rojas, bronce, multicolores. Price tier: "Menos de 35€". Collection filters: price slider (to €49.99), colour, flower type; sort by relevance/bestsellers/A-Z/price/date. Sources: collections sitemap above; https://www.thecolvinco.com/collections/flores-a-domicilio-ramos-flores

### Local market conventions
- Sant Jordi (23 April, Catalonia) has its own collection; Día del Padre (19 March), Día de la Madre (first Sunday May), Fin de curso (end of school year). Price band €28.99–€66.99 bouquets, most €35–€50; delivery €6.99, free >€79. Delivery Mon–Sun "throughout the day"; paid 2-hour slots. Sources: https://www.thecolvinco.com/ ; https://www.thecolvinco.com/pages/flores-a-domicilio

---

## 2. Bergamotte — bergamotte.com → bergamotte.fr (FR, BE, MC)

`https://www.bergamotte.com/` 301-redirects to `https://www.bergamotte.fr/`. Source: WebFetch redirect notice for https://www.bergamotte.com/

### robots.txt highlights and sitemap structure
- Disallows payment/success/account paths in three languages (`/payment`, `/paiement`, `/zahlung`, `/erfolgreiche-bezahlung`, `/en/account/...`, `/fr/compte/...`, `/konto/...`), blocks MJ12bot. `Sitemap: https://www.bergamotte.fr/sitemap.xml`. The DE/EN paths are legacy — the live site is FR-only. Source: https://www.bergamotte.com/robots.txt
- Single flat sitemap, ~900+ URLs: 5 category roots, ~100 products, ~400 "Le Journal Végétal" articles, ~350 delivery-zone pages `/zone-de-livraison-fleurs-et-plantes/{region}/{city}/` incl. Belgium. Source: https://www.bergamotte.fr/sitemap.xml

### URL patterns
- Locale: FR only on .fr; "FR BE" toggle in header (Belgium served from same site). No `/en/` or `/de/` live. Source: https://www.bergamotte.fr/
- Occasion (root-level slugs): https://www.bergamotte.fr/fete-des-meres , https://www.bergamotte.fr/fete-des-grands-meres , https://www.bergamotte.fr/saint-valentin , https://www.bergamotte.fr/anniversaire , https://www.bergamotte.fr/naissance
- Product: `/livraison-fleurs/{slug}` https://www.bergamotte.fr/livraison-fleurs/bouquet-cassis ; plants `/livraison-plantes/theo`; accessories `/livraison-accessoires/coffret-gourmand`
- Category: https://www.bergamotte.fr/livraison-fleurs , /livraison-plantes , /livraison-fleurs-sechees , /livraison-jardin , /vases , /nos-petits-prix , /fleurs-prestige
- City: https://www.bergamotte.fr/zone-de-livraison-fleurs-et-plantes/ile-de-france/paris , .../auvergne-rhone-alpes/lyon , .../occitanie/cahors , https://www.bergamotte.fr/zone-de-livraison-fleurs-et-plantes-en-belgique . Sources: sitemap; curl of homepage links.

### hreflang and canonical
- Homepage: `canonical https://www.bergamotte.fr/`; **no hreflang tags**. Product page fetched via curl returned the same 241 KB shell with `canonical https://www.bergamotte.fr/` and `<title>Bergamotte : Livraison fleurs à domicile (Paris 3h / France 24h)` — i.e. the site is a client-rendered SPA; server HTML does not carry per-product canonical or JSON-LD. Google may render it, but this is a risk. Source: curl of https://www.bergamotte.fr/livraison-fleurs/bouquet-cassis
- Doorway risk: ~350 region/city zone pages. Paris page has some unique copy (arrondissements, suburbs) but templated "Votre fleuriste Bergamotte vous garantit" blocks and contradictory "three hours"/"two hours" claims; assessed as likely doorway content. Source: https://www.bergamotte.fr/zone-de-livraison-fleurs-et-plantes/ile-de-france/paris

### Homepage
- **First action is a postcode + date form**: "Ville ou code postal" then "Date de livraison" calendar; "Vous devez d'abord remplir le code postal" — the strongest date/location capture in this set. Source: https://www.bergamotte.fr/
- Nav: Bouquets de Fleurs (Tous, Premium, Roses, Petits prix, Fleurs séchées, Abonnement, Vases); Occasions (Anniversaire, Remerciements, Cadeaux, Amour, Naissance, Mariage, Félicitations); Plantes; Le jardin; Cadeaux (coffrets, pour elle/lui, gourmands, cartes message, carte cadeau); Fleurs séchées; Abonnement; Entreprise. City links Paris, Lyon, Marseille, Bordeaux, Montpellier, Nice, Toulouse, Cahors, Bruxelles, Bruges. Source: https://www.bergamotte.fr/

### Product page (Bouquet Cassis)
- Sizes S €34.90 / M €54.90 / XL €129.90; price shown as "54,90€" (TTC per CGV: "prix ... toutes taxes comprises"). "Frais de livraison à partir de : 9,90€"; "Plus que 45,10€ pour profiter de la livraison gratuite" (free ≥ ~€100). "Disponible jusqu'au 10 septembre !" seasonal availability. Sources: https://www.bergamotte.fr/livraison-fleurs/bouquet-cassis ; https://www.bergamotte.fr/cgv-cgu
- Add-ons: vases +€11.90 (Epure), +€12.90 (Ruby), +€39.90 (Pixel), +€59.90 (Twist, Faro); personalised label +€5; "Carte message offerte". No chocolates/plush on this PDP (gourmet boxes exist as separate products). Source: PDP above.
- Substitution: "La couleur de l'hortensia peut varier légèrement en fonction des disponibilités"; CGV: if unavailable, refund within 15 days or "produit de qualité équivalente". Sources: PDP; https://www.bergamotte.fr/cgv-cgu
- Cutoffs: "jusqu'à 16h45 la veille du jour de livraison" for next-day France/Belgium 8h–13h slot; Paris 3h option Mon–Sat 10h–21h with 2-hour windows, "30min avant le début du créneau"; orders up to 19 days ahead. Source: https://www.bergamotte.fr/comment-ca-marche
- Reviews on PDP: "4.6 / 5" "18 246 avis clients". Source: PDP above.

### Checkout
- Guest checkout: UNVERIFIED. Recipient phone **mandatory** per CGV (mobile and/or landline + postcode). Card message "un message de 160 caractères" plus optional photo, content-moderated. Absence protocol: courier attempts contact, then leaves at designated spot or returns to warehouse. Address field order: UNVERIFIED. Source: https://www.bergamotte.fr/cgv-cgu

### Payment methods
- CGV: "par carte bancaire (Carte Bleue, Carte Visa, Carte Mastercard ou American Express)". No PayPal/Apple Pay/Klarna/Alma listed in CGV; raw HTML contains one "paypal" string (UNVERIFIED whether offered). Source: https://www.bergamotte.fr/cgv-cgu ; curl of https://www.bergamotte.fr/

### Trust signals
- On-site reviews: "4.6/5", "18 246 avis clients", attributed "Vos avis sont mis à jour tous les jours grâce à la plateforme Trustpilot" (older cached copy cites Stamped.io). Independent Trustpilot profile: **3.7, 2,395 reviews** — a large gap vs the on-site 4.6. "Certifié B Corp" (Bergamotte, Bloom & Wild, Bloomon). "La Garantie Bergamotte": "Conforme ou remplacé pendant 30 jours", photo proof within 24h, replacement not refund. No delivery-photo promise. Sources: https://www.bergamotte.fr/avis-clients ; https://www.trustpilot.com/review/www.bergamotte.fr ; https://www.bergamotte.fr/garantie-bergamotte ; https://www.bergamotte.fr/

### Schema.org (product page)
- **None in server HTML** (SPA). UNVERIFIED whether injected client-side. Source: curl of https://www.bergamotte.fr/livraison-fleurs/bouquet-cassis

### Taxonomy
- Occasions: Anniversaire, Remerciements, Cadeaux, Amour, Naissance, Mariage, Félicitations, Fête des mères, Fête des Grands-Mères, Saint-Valentin, Noël, Rétablissement. Product types: bouquets (S/M/L/XL), plantes (intérieur, extérieur, personnalisables, fleuries, XXL), fleurs séchées (bouquets, couronnes), vases, coffrets, cartes message, carte cadeau, abonnement (from €38.60/month). Filters on /livraison-fleurs: Prix, Couleur, Occasion, Type de fleur; 36 products €24.90–€199.90. Price tier "Nos petits prix". Sources: https://www.bergamotte.fr/ ; https://www.bergamotte.fr/livraison-fleurs

### Local market conventions
- **Fête des Grands-Mères** (first Sunday of March) has a dedicated URL; Fête des mères (late May/early June in France); Saint-Valentin; "Sélection canicule" (heatwave selection) in summer. Price band €27.90 ("Bouquet du Marché") to €129.90 XL; delivery from €9.90, free around €100. Cutoff 16h45 day before; Paris 3h. Sources: https://www.bergamotte.fr/ ; https://www.bergamotte.fr/comment-ca-marche

---

## 3. Blume2000 — blume2000.de (DE; sister sites .at, .ch)

### robots.txt highlights and sitemap structure
- `https://www.blume2000.de/robots.txt` and `https://blume2000.de/robots.txt` both return **404**; `https://www.blume2000.de/sitemap.xml` also 404. An HTML sitemap exists at `/sitemap`. XML sitemap location UNVERIFIED. Sources: the three URLs above; link list from curl of https://www.blume2000.de/

### URL patterns
- Locale: country-per-ccTLD — hreflang `de-DE → blume2000.de`, `de-AT → blume2000.at`, `de-CH → blume2000.ch`. No language subfolders. Source: curl of https://www.blume2000.de/
- Occasion: `/anlaesse/{slug}` — https://www.blume2000.de/anlaesse/geburtstag , https://www.blume2000.de/anlaesse/muttertag , https://www.blume2000.de/anlaesse/frauentag , https://www.blume2000.de/anlaesse/omatag , https://www.blume2000.de/anlaesse/trauer
- Product: numeric `/pu/{id}` — https://www.blume2000.de/pu/10187921 ("Herbstsonne"), https://www.blume2000.de/pu/20003465
- Category: `/blumen/blumenstraeusse`, `/blumen/sorten/rosen`, `/blumen/trockenblumen`, `/kraenze`, `/geschenke/pflanzen-geschenke`; price tiers `/blumen/blumen-bis-25-euro`, `/blumen-unter-30-euro`, `/blumen/blumen-von-30-bis-40-euro`
- City: `/blumen-verschicken-{stadt}` — https://www.blume2000.de/blumen-verschicken-berlin , /blumen-verschicken-hamburg , /blumen-verschicken-muenchen (50+ cities per Berlin page footer). Sources: curl of homepage; https://www.blume2000.de/blumen-verschicken-berlin

### hreflang and canonical
- Homepage: self canonical; hreflang de-DE/de-AT/de-CH to the three ccTLDs (no x-default). PDP: self canonical, hreflang only `de-DE`. Source: curl of https://www.blume2000.de/ and https://www.blume2000.de/pu/10187921
- City pages: Berlin page has genuinely local copy ("über 40 Filialen in der Hauptstadt", named districts), 80+ products, so *not* thin. Source: https://www.blume2000.de/blumen-verschicken-berlin
- .at mirrors .de structure with Austrian contact details ("Blumen verschicken in Österreich mit BLUME2000"); potential near-duplicate across ccTLDs but hreflang-separated. Source: https://www.blume2000.at/

### Homepage
- First action: browse ("BLUMEN VERSCHICKEN", "Blumen verschicken zu jedem Anlass") with urgency banner "Heute bis 18 Uhr bestellen, morgen da". No postcode/date capture on homepage. Nav: Blumen & Geschenke, Anlässe, Schnittblumen, Herbstblumen; sub-nav includes price tiers "bis 25/30/40 €", "Last Minute", "XOXO-Box", Sale. Newsletter "15 % Willkommensrabatt". Source: https://www.blume2000.de/

### Product page (Herbstsonne, €29.99)
- "29,99 €" "inkl. gesetzlicher Mehrwertsteuer, zzgl. Versandkosten". **Date picker on PDP**: "Standard: ab 2026-09-10 (Versand: 5,95 €)" or Express from "12,50 €", dates offered 10–25 Sept (up to 28 days ahead per service page). "Lieferung ohne Vase". Grußkarte chooser on PDP ("Grußkarte hinzufügen", "Grußkarte ist an diesem Tag nicht verfügbar..."). Sources: https://www.blume2000.de/pu/10187921 ; https://www.blume2000.de/service/bestellung
- Add-ons: vases and greeting cards (prices UNVERIFIED — chosen "im nächsten Schritt"); gift sets sold as separate products. Source: curl of PDP.
- Substitution wording: not found on PDP or Garantie page (UNVERIFIED). Guarantee: "7-Tage-Frische-Garantie"; "Garantiert schön am Bestimmungsort und dort mindestens sieben Tage frisch"; complaint → "wir schreiben dir den Betrag deines Auftrags gut". Sources: https://www.blume2000.de/service/garantie ; https://www.blume2000.de/service/versand
- Cutoffs: weekdays until 18:00 for next working day; Saturday until 11:00 (standard) / 12:30 (express); DHL delivers "an sechs Werktagen der Woche"; delivery date guaranteed only with Express (+€6.55). Ships to Germany and Austria. Source: https://www.blume2000.de/service/versand

### Checkout
- Guest ordering supported: "Wenn du ohne Kunden-Login bestellen möchtest, dann gib bitte die vollständige Lieferadresse sowie die Rechnungsadresse an"; 7-step flow (product → date → Grußkarte → add-on gift → checkout → addresses → payment). Login page `/gast/anmelden`. Cancellation until 2 working days before. Address format, phone, message limit: UNVERIFIED. Source: https://www.blume2000.de/service/bestellung

### Payment methods
- Kreditkarte (Mastercard, Visa, American Express), PayPal, Klarna ("Pay Now" and "Pay Later"), Apple Pay, Google Pay. Raw HTML also contains "Sofort" and "Rechnung" strings (Klarna Sofort / Klarna Rechnung). No giropay, no Lastschrift on the payments page. Sources: https://www.blume2000.de/service/bezahlung ; curl of homepage

### Trust signals
- 7-Tage-Frische-Garantie, "Heute bis 18 Uhr bestellen, morgen da", 15% newsletter discount, DHL. No Trusted Shops/Trustpilot badge visible in HTML. External: Trustpilot **2.8 / 6,219 reviews**; Trusted Shops profile unclaimed, grade **2.71 "Befriedigend"**, "188.590 Bewertungen insgesamt" (an older search snippet cites 4.42/74,051 — treat historical). Sources: https://www.blume2000.de/ ; https://www.trustpilot.com/review/blume2000.de ; https://www.trustedshops.de/bewertung/blume2000-de

### Schema.org (product page)
- Richest in the set: `Product` + `Brand` + `Offer` with `OfferShippingDetails` (`shippingRate` EUR 5.95, `DefinedRegion`, `ShippingDeliveryTime` with `handlingTime` 0–1 day, `transitTime` 1–2 days, `OpeningHoursSpecification` business days), `BreadcrumbList`. Homepage: `OnlineStore`, `ItemList`, `FAQPage`. No `AggregateRating`. Source: curl of https://www.blume2000.de/pu/10187921 and https://www.blume2000.de/

### Taxonomy
- Occasions (31 URLs): Geburtstag, Beste Freundin, Gute Besserung, Liebe & Romantik, Trauer & Beileid, Dankeschön, Liebe Grüße, Hochzeitstag, Jahrestag, Jubiläum, Entschuldigung, Glückwünsche, Einzug, Abschied, Geburt, Pride; seasonal Muttertag, Vatertag, Valentinstag, **Omatag**, Halloween, Thanksgiving, Advent/Weihnachten, Silvester, **Weltfrauentag (08.03.)**, Ostern, Frühlings-/Sommer-/Herbst-/Winterblumen. Price tiers bis 25 €, bis 30 €, 30–40 €. Filters: Farbe (Gelb & Orange, Rosa & Lila...), Blumensorte, Anlass. Sources: https://www.blume2000.de/anlaesse ; https://www.blume2000.de/blumen/blumenstraeusse

### Local market conventions
- Weltfrauentag 8 March and Omatag are promoted; Muttertag second Sunday May; Vatertag (Ascension). Price band €16.99–€59.99 bouquets, most €25–€40; shipping €5.95 standard, express +€6.55; minimum €19.99 for promos; VAT-inclusive with "zzgl. Versandkosten" wording. Klarna Rechnung (pay by invoice) is a must-have expectation in DE. Sources: https://www.blume2000.de/blumen/blumenstraeusse ; https://www.blume2000.de/service/versand ; https://www.blume2000.de/service/bezahlung

---

## 4. Bonita Blomster — bonitablomster.no (NO, Oslo)

Platform: Shopify. Source: https://bonitablomster.no/robots.txt

### robots.txt highlights and sitemap structure
- Standard Shopify robots incl. UCP/MCP agent text; disallows cart/checkout/account; blocks `/collections/*sort_by*`, `+` filters, `ls=` language-picker traps; `Sitemap: https://bonitablomster.no/sitemap.xml`. Source: https://bonitablomster.no/robots.txt
- Index: agentic_discovery + products/pages/collections/blogs at root and under `/nb/`. Products = 793 URLs (incl. non-flower gifts like "after-eight-chocolates"); collections = 47. No hreflang in sitemaps. Sources: https://bonitablomster.no/sitemap.xml ; https://bonitablomster.no/sitemap_products_1.xml?from=10426832617762&to=10426844578082 ; https://bonitablomster.no/sitemap_collections_1.xml?from=667468202274&to=671533334818

### URL patterns
- Locale: **root is English**, `/nb/` is Norwegian Bokmål — unusual for a .no domain; header toggle "EN NB". Slugs are English in both locales. Source: https://bonitablomster.no/ ; curl of /nb/products/autumn-bonanza
- Occasion: https://bonitablomster.no/collections/mothers-day , /collections/valentines-day , /collections/norwegian-national-day , /collections/funerals (+ funeral-wreath, -heart, -sheaf, -casket, -sympathy), /collections/weddings
- Product: https://bonitablomster.no/products/autumn-bonanza , /products/amethyst-love-box
- Category: /collections/bouquets , /collections/flowers-in-a-box , /collections/roses , /collections/plants , /collections/chocolates
- Local: neighbourhood collections https://bonitablomster.no/collections/oslo-flowers , /collections/frogner-flowers , /collections/majorstuen-flowers , /collections/fornebu-flowers , /collections/asker-flowers (14 total). Source: collections sitemap.

### hreflang and canonical
- Homepage and PDP: self canonical; `x-default → EN root`, `en → root`, `nb → /nb/...`. `/nb/` PDP canonical = `/nb/products/autumn-bonanza`. Clean. Source: curl of https://bonitablomster.no/ and https://bonitablomster.no/products/autumn-bonanza
- Duplicate risk: 14 `{area}-flowers` collections likely share the same product set; Oslo page has a unique intro paragraph and 13 filters, so it is a real collection rather than a doorway; the smaller neighbourhood ones were not checked (UNVERIFIED). Source: https://bonitablomster.no/collections/oslo-flowers

### Homepage
- First action: "Shop Now" under "Beautiful hand-tied bouquets delivered to your door in Oslo." No postcode/date capture; static "Same-day delivery in Oslo — order before 14:00 (13:00 Saturdays)". Nav: Flowers (Roses, Bouquets, Flowers in a Box, Arrangements, Seasonal); Occasions (Weddings→Bridal/Groom/Bridesmaids, Funerals→Casket/Heart/Sheaf/Sympathy/Wreath, Mother's Day, Valentine's Day, Norwegian National Day, Gifts); About; Contact. Source: https://bonitablomster.no/

### Product page (Autumn Bonanza, 450 kr)
- "450,00 kr"; no tax/shipping statement on PDP (Shopify default shows tax-inclusive NOK). Sizes: Small / Medium / "As Displayed (approx. 35cm)" / "Large (approx. 45 cm)" (per-size prices not rendered). No date picker on PDP — "Future dates can be scheduled at checkout". Add-ons on PDP: greeting card ("Your card message" textarea, no visible limit), chocolates: Ferrero Rocher +159 kr, Cachet Belgian +129 kr, Belgian pralines +150 kr, Nougat Hearts +220 kr, After Eight +120 kr. Substitution: FAQ "we may substitute it with flowers of equal or greater value, matching the colour and style ... as closely as possible". Sources: https://bonitablomster.no/products/autumn-bonanza ; https://bonitablomster.no/pages/faq
- Delivery cost by postcode "135 kr to 806 kr", Oslo postcodes 0010–0998 plus Lillestrøm, Ski, Asker, Lørenskog; "shown at checkout before you pay". No Sunday delivery "except for selected special occasions"; deliveries "usually before 16:00". Sources: https://bonitablomster.no/pages/delivery-prices ; https://bonitablomster.no/policies/shipping-policy

### Checkout
- Shopify checkout; guest checkout UNVERIFIED. Card message "Add your message at checkout". Recipient phone: shipping policy asks customers to "provide mobile numbers" (not stated as mandatory). Address format: UNVERIFIED (Shopify NO default: Postnummer then Sted). Sources: https://bonitablomster.no/pages/faq ; https://bonitablomster.no/policies/shipping-policy

### Payment methods
- FAQ: "You can pay securely by card (Visa, Mastercard) or with PayPal." HTML mentions PayPal, Visa, Mastercard, Amex. **No Vipps, no Klarna** found — a gap versus Norwegian norms. Sources: https://bonitablomster.no/pages/faq ; curl of PDP

### Trust signals
- None on site (no review widget, no guarantee block). Refund policy: report damage within 24h. Trustpilot profile unclaimed: 3.7 from **1 review** (2017). Sources: https://bonitablomster.no/ ; https://bonitablomster.no/pages/faq ; https://www.trustpilot.com/review/bonitablomster.no

### Schema.org (product page)
- **No JSON-LD found** in server HTML (theme has stripped Shopify's default Product schema). Source: curl of https://bonitablomster.no/products/autumn-bonanza

### Taxonomy
- Filters on /collections/bouquets: Product type, Price min/max, Season (Spring/Summer/Autumn/Winter), Colour (Multicolor, Orange, Pink, Purple, Red, White), Occasion (Anniversary, Birthday, Christmas, Mother's Day, Newborn, Romance, Valentine's Day); 17 bouquets 300–1,200 kr; sort Featured/Best selling/A-Z/Price/Date. Heavy funeral taxonomy (5 sub-types). Source: https://bonitablomster.no/collections/bouquets

### Local market conventions
- Norwegian National Day (17. mai) collection; Morsdag is **second Sunday of February** in Norway (site lists Mother's Day but date not shown — UNVERIFIED which date they promote); Valentinsdag. Price band 300–1,200 kr bouquets (~€25–€100); delivery 135–806 kr by postcode; cutoff 14:00 / 13:00 Sat; no Sunday delivery. Sources: https://bonitablomster.no/ ; https://bonitablomster.no/pages/delivery-prices

---

## 5. Flora Nordica — floranordica.dk (DK, North Zealand + Copenhagen)

Platform: Shopify. Source: https://floranordica.dk/robots.txt

### robots.txt highlights and sitemap structure
- Standard Shopify robots with UCP/MCP text; `Sitemap: https://www.floranordica.dk/sitemap.xml`. Index: agentic_discovery + products/pages/collections/blogs at root (Danish) and `/en/`. Products = 161; collections = 122 (most are geo variants); pages = 7. Sources: https://floranordica.dk/robots.txt ; https://www.floranordica.dk/sitemap.xml ; https://www.floranordica.dk/sitemap_products_1.xml?from=4763756134500&to=10216229503323 ; https://www.floranordica.dk/sitemap_collections_1.xml?from=173620985956&to=665165136219 ; https://www.floranordica.dk/sitemap_pages_1.xml?from=50063999076&to=120185094491

### URL patterns
- Locale: root Danish, `/en/` English; Dansk/English selector in header and footer. Source: https://www.floranordica.dk/
- Occasion: https://www.floranordica.dk/collections/mors-dag , /collections/fars-dag , /collections/valentinsdag , /collections/konfirmation-1 , /collections/student , /collections/vaertindegave , /collections/indflyttergave
- Product: https://www.floranordica.dk/products/flora-nordica-buket , /products/barebuket-natur , /products/kistepynt-lyserod
- Category: /collections/buketter , /collections/begravelse , /collections/gavekurve , /collections/bryllup , /collections/jul-1
- Local: `blomster-{by}` and `begravelse-{by}` collections (~70), e.g. https://www.floranordica.dk/collections/blomster-kobenhavn , /collections/blomster-nordsjaelland , plus a page https://www.floranordica.dk/pages/blomster-i-rungsted . Sources: collections and pages sitemaps.

### hreflang and canonical
- Homepage/PDP: self canonical; `x-default → da root`, `da → root`, `en → /en/...`. Clean. Source: curl of https://www.floranordica.dk/ and https://www.floranordica.dk/products/flora-nordica-buket
- Doorway risk: **high**. ~40 `blomster-{town}` + ~34 `begravelse-{town}` collections with boilerplate ("Vi leverer dagligt til alle bydele"), identical product sets; the Copenhagen page shows 99 products including a data-error price "3.945.601.526,40 DKK". Source: https://www.floranordica.dk/collections/blomster-kobenhavn

### Homepage
- First action: "Send Buket" button → bouquet collection. No postcode/date capture; static "Vi leverer blomster mandag til lørdag. Bestil inden kl. 08:00" and "Bestil bårebuketter og begravelsesblomster dagen før". Nav: Buketter, Begravelse, Gavekurve, Bryllup, Jul, Anledninger (19 items), Inspiration, Levering. Source: https://www.floranordica.dk/

### Product page (Buket Flora Nordica, from 250 DKK)
- "Inklusive skatter"; "Levering beregnes ved betaling". Price-tier variants instead of sizes: 250/300/350/400/450 ("som foto") /500/550/600/650/700 DKK, "Luksus", "Luksus XL", "Overdådig" (14 variants). No date picker, no add-ons, no card field on PDP (delivery date and card presumably at cart/checkout — UNVERIFIED). Substitution: "Billedet er vejledende, og blomsterne kan variere efter sæson". Source: https://www.floranordica.dk/products/flora-nordica-buket
- Cutoff inconsistency across pages: homepage/levering "Bestil inden kl. 08:00"; bouquets collection "inden 13:30 hverdage / 12:00 lørdag"; shipping policy "inden kl 14"; delivery fee "79 kr" on homepage vs "75 kr" on collection page. Sources: https://www.floranordica.dk/pages/levering ; https://www.floranordica.dk/collections/buketter ; https://www.floranordica.dk/policies/shipping-policy
- Delivery window 14:00–19:00 (funeral excluded). Source: https://www.floranordica.dk/pages/levering

### Checkout
- Shopify checkout; guest UNVERIFIED. Terms: "Kunden bedes oplyse navn, adresse og telefonnummer" (phone requested). Complaints within 24h with photo; replacement bouquet on validated complaint; cancellation ≥30 days before → voucher. Card message limit UNVERIFIED. Sources: https://www.floranordica.dk/policies/shipping-policy ; https://www.floranordica.dk/pages/flora-nordicas-forretningsbetingelser

### Payment methods
- Footer icon: PayPal only (`pi-paypal`). Terms: "Kortbetaling" and PayPal. **No MobilePay, no Dankort icon, no Klarna** found. Sources: curl of https://www.floranordica.dk/ ; https://www.floranordica.dk/pages/flora-nordicas-forretningsbetingelser

### Trust signals
- No review widget, no e-mærket, no Trustpilot badge; sustainability copy about own fields/local production. Trustpilot unclaimed: 4.0 from **5 reviews**. Sources: https://www.floranordica.dk/ ; https://www.trustpilot.com/review/floranordica.dk

### Schema.org (product page)
- Shopify default: `ProductGroup` with 14 `Product` variants each with `Offer` (`price 250.00`, `priceCurrency DKK`, `InStock`, variant URLs) + `Brand`; `Organization`; homepage `WebSite`/`SearchAction`. Source: curl of https://www.floranordica.dk/products/flora-nordica-buket

### Taxonomy
- Occasions (12): Mors dag, Fars dag, Fødselsdag, Jubilæum, Valentinsdag, God bedring, Barsel og fødselsgaver, Bare fordi, **Værtindegave** (hostess gift), **Indflyttergave** (housewarming), Årsdag, **Konfirmation**; plus Student, Tillykke. Funeral taxonomy: kranse, hjerter, bårebuket, bårededekoration, kistepynt, bånd, nedkastningsroser, begravelsespakker. Filters: availability, price ≤2,000 DKK; sort options standard Shopify. Sources: collections sitemap; https://www.floranordica.dk/collections/buketter

### Local market conventions
- Mors dag in Denmark is second Sunday of May; Fars dag 5 June (Grundlovsdag); Konfirmation season (April–May) and Student (June) are major gifting moments; Værtindegave and Indflyttergave as everyday occasions. Price band 250–700 DKK (~€34–€94) with 250 DKK entry; delivery 79 DKK flat; VAT 25% included ("inklusiv dansk moms 25%"). Sources: https://www.floranordica.dk/ ; https://www.floranordica.dk/pages/flora-nordicas-forretningsbetingelser

---

## 6. Delejos — es.delejos.com (ES-language; international relay incl. Spain)

Legacy custom platform; Spanish-language storefront on `es.` subdomain, English on `en.delejos.com`. Source: https://es.delejos.com/ ; http://en.delejos.com/

### robots.txt highlights and sitemap structure
- `User-agent: *`, `Sitemap: https://es.delejos.com/sitemap.xml`; disallows `/{country}/carro_de_compras/` and `/{country}/shopping_cart/` for 23 countries, `/*user`, and (invalidly) full URLs `http://admin.delejos.com`, `http://beta.delejos.com`. Source: https://es.delejos.com/robots.txt
- Flat sitemap, **3,210 URLs**, of which **940 are `http://`** and 2,270 `https://` — protocol duplicates listed at lower priority (0.26). Country folders `flores-{pais}` (23) and a *second* folder style `{pais}` (e.g. `brasil` 250 URLs, `mexico` 119) — two URL schemes for the same content. Source: https://es.delejos.com/sitemap.xml

### URL patterns
- Country: `/flores-espana`, `/flores-francia`, `/flores-italia`, `/flores-portugal` (…23 countries). `/espana/` 301 → `/flores-espana/`. Source: sitemap; WebFetch redirect of https://es.delejos.com/espana/
- Occasion: https://es.delejos.com/flores-espana/dia_de_la_madre , /flores-espana/amor_y_romance , /flores-espana/condolencias , /flores-espana/solo_porque_si
- Category: https://es.delejos.com/flores-espana/rosas , /flores-espana/girasoles , /flores-espana/orquideas , /flores-espana/mas_vendidos , /flores-espana/regalos
- Product: `/flores-espana/{category}/{slug}` e.g. https://es.delejos.com/flores-espana/chocolates/doce-rosas-bouquet-chocolates , /flores-espana/arrangements/una-docena-de-rosas-rosadas-y-rojas-florero
- City: **two duplicate schemes** — https://es.delejos.com/espana/flores-a-madrid and http://es.delejos.com/flores-espana/flores-a-madrid (60+ Spanish cities). Sources: sitemap grep; https://es.delejos.com/flores-espana/rosas

### hreflang and canonical
- **No canonical, no hreflang, no JSON-LD** on homepage or country page (raw HTML checked). ES and EN subdomains are unlinked by hreflang. Heavy duplication: http/https, `/espana/` vs `/flores-espana/`, and country pages sharing templated copy (Spain page even contains text about "Argentina"). Textbook doorway/duplicate pattern. Sources: curl of https://es.delejos.com/ and http://es.delejos.com/flores-espana/ ; https://es.delejos.com/sitemap.xml

### Homepage
- First action: **country selector** ("Escoge el país de envio") with CTA "Envía tu Regalo Ahora!". No date capture. Nav: Información de Envío, Testimonios, login/register, cart; language flag → en.delejos.com; currency dropdown (20+ currencies). Christmas creative shown in September (stale). Source: https://es.delejos.com/

### Product page (Bouquet de doce rosas con chocolates)
- "$99.00 USD + envío" — priced in **USD even for Spain**; no delivery date field on PDP; "Tarjeta para tu mensaje gratis"; chocolates included ("Lindt Lindor, Pacari, Guylian, Ferrero or similar"). Substitution: "La disponibilidad de bases, accesorios, colores y flores está sujeta a stock. Las fotos son ilustrativas. Siempre procuramos hacerlo lo más parecido a la foto." No reviews, no VAT mention. Source: https://es.delejos.com/flores-espana/chocolates/doce-rosas-bouquet-chocolates
- Spain listings: 6 roses $99, 12 roses $89–$99, 24 roses $135–$157, 36 roses $174–$199; vase/chocolates/teddy bundled into SKUs rather than add-ons. Source: https://es.delejos.com/flores-espana/rosas
- Delivery: "Las entregas se realizan de lunes a domingo"; same-day if ordered "antes de las 12:00 AM" (sic) else next day; fixed "$10.00" delivery fee to major Spanish cities, others quote by email. Source: https://es.delejos.com/flores-espana/informacion-de-envio

### Checkout
- Login/register links in header; guest checkout UNVERIFIED. Address format, phone, message limit UNVERIFIED (preguntas_frecuentes and sobre_nosotros return 404). Sources: https://es.delejos.com/ ; https://es.delejos.com/preguntas_frecuentes/ (404)

### Payment methods
- PayPal ("La forma más rápida y segura ... a través de tarjetas de crédito por medio de Paypal"), credit cards via merchant processors, local bank deposit in 7 LatAm countries, Western Union. **No Bizum**, no Apple/Google Pay. Source: https://es.delejos.com/formas_de_pago/

### Trust signals
- "Servicio desde 1999", "más de 24 años de experiencia", testimonials page, generic payment icon. No review platform badge; Trustpilot 4.5 from 14 reviews. Sources: https://es.delejos.com/ ; https://www.trustpilot.com/review/delejos.com

### Schema.org (product page)
- None found in server HTML. Source: curl of http://es.delejos.com/flores-espana/

### Taxonomy
- Categories: flores, rosas, girasoles, lirios, gerberas, orquídeas, flores-variadas, más vendidos, arreglos, regalos (cestas, chocolates, peluches, "regalos para él"). Occasions: amor y romance, cumple, día de la madre, día del padre, navidad, condolencias, aniversario, valentín, disculpas, felicitaciones, mejórate, nacimiento, solo porque sí. No colour or price filters. Source: https://es.delejos.com/sitemap.xml ; http://es.delejos.com/flores-espana/

### Local market conventions
- Behaves as an international relay: USD pricing, "+ envío" fee, country-first funnel, no Spain-specific occasions (no Sant Jordi, no Reyes). Useful mainly as an anti-pattern for Flowers Overseas (duplicate URLs, no hreflang, foreign currency). Source: pages cited above.

---

## 7. Aquarelle — aquarelle.com (FR); plus flower-delivery.aquarelle (Universal Flower)

### robots.txt highlights and sitemap structure
- Disallows `/marketing/mailing/`, `/pg/*`, `/ufs/*`, `/ufn/*`, `/activite/*`, `/infos/*subject=*`, `/login*`, `/boutique/mail*`, unsubscribe paths. `Sitemap: https://www.aquarelle.com/sitemap.xml`. Source: https://www.aquarelle.com/robots.txt
- Index → `/plan/product.xml` (247 URLs, FR+EN duplicates), `/plan/catalog.xml` (~200 category/occasion URLs, FR+EN), `/plan/static.xml` (info pages, FR+EN), `/plan/product-image.xml`. No city pages in the XML sitemaps even though city pages exist. Sources: https://www.aquarelle.com/sitemap.xml ; https://www.aquarelle.com/plan/product.xml ; https://www.aquarelle.com/plan/catalog.xml ; https://www.aquarelle.com/plan/static.xml
- `https://flower-delivery.aquarelle/` resolves to **Universal Flower** "International Flower Delivery" (since 1997, 150+ countries), a country-selector landing page with 15+ countries and 10+ languages — this is the group's international relay brand, separate from aquarelle.com. Source: https://flower-delivery.aquarelle/

### URL patterns
- Locale: one domain, **translated path segments** rather than a language folder: FR `/`, `/occasions/…`, `/boutique/…`, `/produit/{slug}-{id}`, `/page/…`; EN `/shop/home`, `/special-occasions/…`, `/shop/…`, `/product/{slug}-{id}`, `/info/…`. Source: https://www.aquarelle.com/plan/catalog.xml ; https://www.aquarelle.com/plan/product.xml
- Occasion: https://www.aquarelle.com/occasions/fete-des-meres , /occasions/fete-grand-meres , /occasions/toussaint , /occasions/muguet , /occasions/roch-hachana , /occasions/fete-des-belles-meres , /occasions/deuil
- Product: https://www.aquarelle.com/produit/bouquet-de-grandes-roses-rouges-41884 ↔ EN https://www.aquarelle.com/product/bouquet-of-tall-red-roses-roses-delivery-41884 (numeric id suffix keeps pairing)
- Category: https://www.aquarelle.com/boutique/bouquets-roses , /boutique/fleurs-de-france , /boutique/fleurs-sechees-rosa , /boutique/gerbes-de-deuil , /boutique/fleurs-jaunes (colour categories exist as URLs)
- City: département + postcode scheme https://www.aquarelle.com/livraison-fleurs/75/75000-paris , /livraison-fleurs/69/69000-lyon , /livraison-fleurs/13/13000-marseille , with per-arrondissement links "Paris 01…Paris 20" and "Voir toutes les villes du département". Sources: curl of homepage; https://www.aquarelle.com/livraison-fleurs/75/75000-paris

### hreflang and canonical
- Homepage: canonical `/`; hreflang `fr → /`, `en → /shop/home` (no x-default). PDP: self canonical; `fr` ↔ `en` pair. Correct but minimal. Source: curl of https://www.aquarelle.com/ and https://www.aquarelle.com/produit/bouquet-de-grandes-roses-rouges-41884
- Doorway risk: moderate — city pages have a unique intro and a Paris FAQ but repeat "Why Aquarelle" blocks; 20 arrondissement + all-département sub-pages multiply thin variants. Source: https://www.aquarelle.com/livraison-fleurs/75/75000-paris

### Homepage
- First action: browse/"Commander" on featured bouquets; USP "Livraison de fleurs rapide à domicile (4h Paris/24h France)". No postcode/date capture on homepage (date chosen on PDP/cart). Nav: Occasions, Bouquets (Gros bouquets, Fleurs de France, Fleurs séchées by Rosa, Petits +), Roses (responsables & solidaires, rouges), Plantes, Chocolats (bouquets de bonbons/chocolats), Bougie, Bonnes Affaires, Abonnement, Deuil; international links DOM-TOM, Allemagne, Belgique & Luxembourg, Espagne, Pays-Bas. Source: https://www.aquarelle.com/

### Product page (Grandes Roses Rouges)
- Tiers 15 roses €38 / 20 roses €46 / 25 roses €54; CGV "prix ... en euros toutes taxes comprises". "Frais de livraison fixes : 10,90 €". Add-ons: Grand bocal en verre €9; Ballotin de rochers €9.90; Bougie €12.90; Carte Anniversaire €12.90; Carte 3D €12.90; chocolate eggs €8.50; astro booklet €3.50. Reassurance strip: "Bouquet 100% conforme", "30 ans de savoir-faire", "Fraicheur maximale – Vos fleurs voyagent les pieds dans l'eau", "Livraison à la date de votre choix". Date picker and message field are JS (not visible in fetch) — "MESSAGE" label present in HTML; limit UNVERIFIED. Sources: https://www.aquarelle.com/produit/bouquet-de-grandes-roses-rouges-41884 ; https://www.aquarelle.com/page/conditions-vente
- Substitution (CGV): "En cas de rupture de stocks, Aquarelle prendra contact avec l'acheteur ... livrer un produit offrant des caractéristiques identiques". Absence: "un avis de passage ... ou le colis sera déposé devant la porte du destinataire en lieu sûr". Source: https://www.aquarelle.com/page/conditions-vente
- Cutoffs (most granular in set): Province next-day "la veille avant 17h30"; Monday AM "samedi avant 12h00"; Paris morning "la veille avant 17h30"; Paris 14h–17h30 "le jour même avant 11h"; Paris 19h–22h "le jour même avant 16h"; Paris city page: "jusqu'à 4h avant la date de livraison", Mon–Sat 9h–21h45, Sun 9h–13h. Delivery Mon–Sat France (no Corsica), Sundays Paris region only. Sources: https://www.aquarelle.com/page/questions-frequentes ; https://www.aquarelle.com/livraison-fleurs/75/75000-paris

### Checkout
- Guest checkout: UNVERIFIED (account link `/compte`, password reset path exists). Recipient phone: UNVERIFIED. 48-hour withdrawal on bouquets. Source: https://www.aquarelle.com/page/conditions-vente

### Payment methods
- FAQ: carte bancaire, PayPal, Apple Pay, Google Pay, cheque by post. The dedicated payments page is older and lists only "Carte Bancaire (Visa, Carte Bleue, Eurocard-Mastercard)", chèque cadeau, TPE, monthly invoicing for companies. No Klarna/Alma. Sources: https://www.aquarelle.com/page/questions-frequentes ; https://www.aquarelle.com/page/moyens-paiement

### Trust signals
- Trustpilot widget script on PDP; reviews page links Trustpilot and "Google Avis". Trustpilot: **3.8, 45,377 reviews** (largest volume in set). Promises: "LIVRAISON À DATE FIXE", "BOUQUET 100% CONFORME", **delivery-photo**: "Photo prise au moment de l'expédition et envoyée par mail" (free, kept 15 days), "Si votre création florale ne correspond pas à la photo reçue, contactez notre service client dans les 48h" → resend or refund; "30 ANS DE SAVOIR-FAIRE / Artisans fleuristes depuis 1987", family-founded. Sources: https://www.aquarelle.com/ ; https://www.aquarelle.com/page/avis-clients ; https://www.trustpilot.com/review/aquarelle.com ; https://www.aquarelle.com/page/questions-frequentes

### Schema.org (product page)
- `Product` + `Brand` + 24 `Offer`s (tiers × options) with 3 `OfferShippingDetails`/`MonetaryAmount`; homepage `ItemList` of 19 `Product`s with `Offer`s. No `AggregateRating` in HTML. Source: curl of https://www.aquarelle.com/produit/bouquet-de-grandes-roses-rouges-41884 and https://www.aquarelle.com/

### Taxonomy
- Occasions (26 in sitemap): anniversaire, remerciements, amour, mariage, naissance, noël, meilleurs vœux, saint-valentin, **fête des grands-mères**, pâques, fête des mères, **muguet (1 May)**, deuil, fête des pères, **toussaint**, fiançailles, journée de l'amitié, **fête des belles-mères**, fête nationale, baptême, bon rétablissement, plaisir d'offrir, félicitations, **Roch Hachana**. Product types: roses (by colour), bouquets, plantes/orchidées/bonsaïs/olivier, fleurs séchées, chocolats/bonbons, bougies, deuil (gerbes, coussins, raquettes, couronnes). Colour categories: fleurs jaunes/violettes/roses/bleues/blanches. Price tiers: "Petits prix", "Bonnes affaires"; Zodiac collection. Sources: https://www.aquarelle.com/plan/catalog.xml ; https://www.aquarelle.com/occasions

### Local market conventions
- Muguet du 1er mai, Toussaint (1 Nov, chrysanthèmes) and Fête des grands-mères are uniquely French gifting moments; Roch Hachana targeted too. Price band €24.90–€120; flat delivery €10.90 (€7.90 small items); Paris 4h same-day; photo-before-dispatch is a category norm in FR. Sources: https://www.aquarelle.com/ ; https://www.aquarelle.com/page/questions-frequentes

---

## Comparison table

| Site | Market | Payment methods (as displayed) | Review platform / score | Guest checkout | Add-ons on PDP | Notable local occasions | Price band (bouquets) |
|---|---|---|---|---|---|---|---|
| Colvin thecolvinco.com | ES (+PT via /pt) | Visa, MC, Maestro, Amex, Diners, Discover, JCB, UnionPay, PayPal, Klarna, Apple Pay, Google Pay, Shop Pay; **no Bizum/MB Way** | None on site; Trustpilot 3.5 (6,333) | UNVERIFIED (Shopify) | Vase €9.99–26.99, wrap €3, card €2–4, chocolates €7.99–18.99, Miffy plush €10.95–22.95, candles, books | Sant Jordi, Día del Padre, Día de la Madre, Fin de curso | €28.99–€66.99; ship €6.99, free >€79 |
| Bergamotte bergamotte.fr | FR, BE, MC | Cards (CB, Visa, MC, Amex) per CGV; PayPal UNVERIFIED | On-site 4.6 (18,246, "Trustpilot"); public Trustpilot 3.7 (2,395); B Corp | UNVERIFIED | Vases €11.90–59.90, label €5, card free | Fête des grands-mères, Fête des mères, Saint-Valentin, canicule | €27.90–€129.90 (S/M/XL); ship from €9.90, free ~€100 |
| Blume2000 blume2000.de | DE (+AT, CH ccTLDs) | Visa, MC, Amex, PayPal, Klarna (Pay Now/Pay Later, Sofort, Rechnung), Apple Pay, Google Pay | None on site; Trustpilot 2.8 (6,219); Trusted Shops 2.71 (188,590, unclaimed) | Yes ("ohne Kunden-Login bestellen") | Vase, Grußkarte on PDP (prices next step); gift sets as SKUs | Weltfrauentag 8.3, Omatag, Muttertag, Vatertag, Halloween, Pride | €16.99–€59.99; ship €5.95, express +€6.55 |
| Bonita Blomster bonitablomster.no | NO (Oslo) | Visa, MC, PayPal (+Amex icon); **no Vipps/Klarna** | None on site; Trustpilot 3.7 (1) | UNVERIFIED (Shopify) | Card (free), chocolates 120–220 kr | 17. mai, Morsdag, Valentinsdag | 300–1,200 kr; ship 135–806 kr by postcode |
| Flora Nordica floranordica.dk | DK (N. Zealand, CPH) | Card + PayPal (only PayPal icon); **no MobilePay/Dankort** | None on site; Trustpilot 4.0 (5) | UNVERIFIED (Shopify) | None on PDP; price-tier variants 250–700 DKK | Mors dag, Fars dag, Konfirmation, Student, Værtindegave, Indflyttergave | 250–700 DKK; ship 79 DKK flat |
| Delejos es.delejos.com | ES-language relay (23 countries) | PayPal, cards, LatAm bank deposit, Western Union; **no Bizum** | None on site; Trustpilot 4.5 (14) | UNVERIFIED | Bundled into SKUs (chocolates, teddy, vase); free card | None Spain-specific | $89–$199 USD; ship $10 |
| Aquarelle aquarelle.com | FR (EN mirror) | CB, PayPal, Apple Pay, Google Pay, cheque (FAQ) | Trustpilot widget; Trustpilot 3.8 (45,377); Google Avis | UNVERIFIED | Jar €9, chocolates €9.90, candle €12.90, cards €12.90, booklet €3.50 | Muguet 1 May, Toussaint, Fête des grands-mères, Fête des belles-mères, Roch Hachana | €24.90–€120; ship €10.90 flat |

Sources: the per-site sections above.

---

## Per-market conventions

**DE (from Blume2000).** German shoppers expect "inkl. MwSt., zzgl. Versandkosten" price wording, a visible order cutoff ("Heute bis 18 Uhr bestellen, morgen da"), a chosen Wunschtermin with Standard vs Express pricing, DHL as carrier, a Frische-Garantie in days, and Klarna Rechnung/Pay Later alongside PayPal, cards, Apple/Google Pay; Trusted Shops is the reference review badge (even if absent here). Occasion calendar includes Weltfrauentag (8 March), Muttertag (2nd Sunday May), Vatertag (Ascension) and Omatag; price tiers "bis 25/30/40 €" are a navigation convention. Country separation is by ccTLD (.de/.at/.ch) with `de-DE/de-AT/de-CH` hreflang. Sources: https://www.blume2000.de/service/versand ; https://www.blume2000.de/service/bezahlung ; https://www.blume2000.de/anlaesse

**FR (from Bergamotte, Aquarelle).** French sites lead with speed claims per zone ("3h Paris / 24h France", "4h Paris") and publish granular cutoffs per zone and slot; postcode-first date availability (Bergamotte) is best-in-class. Prices are TTC; delivery is a flat €9.90–€10.90 with free-shipping thresholds. A photo of the bouquet before dispatch and "bouquet conforme" guarantees are category norms; Trustpilot is the review reference (Aquarelle 45k reviews), and B Corp is used as a differentiator. Recipient phone is mandatory and card messages are capped (160 chars). Unique occasions: Fête des grands-mères (1st Sunday March), Muguet 1er mai, Fête des mères (late May/June), Toussaint chrysanthemums, Fête des belles-mères. Payment: CB dominant, PayPal, Apple/Google Pay; Klarna/Alma not seen. Sources: https://www.bergamotte.fr/cgv-cgu ; https://www.bergamotte.fr/comment-ca-marche ; https://www.aquarelle.com/page/questions-frequentes

**ES (from Colvin, Delejos).** Spanish UX is browse-first with "Impuestos incluidos" pricing, "Envío desde 6,99 €" and a free-shipping threshold (~€79); delivery date/slot is picked after add-to-cart, with paid 2-hour slots; Sunday delivery is offered. Regional occasions matter: Sant Jordi (23 April, Catalonia), Día del Padre 19 March, Día de la Madre 1st Sunday May, Fin de curso. Colour and flower-type collections (`flores-rojas`, `ramos-de-girasoles`) and a "Menos de 35 €" tier are standard. Notably **neither Spanish site offers Bizum**, which is a gap versus Spanish e-commerce norms; PayPal, cards, Apple/Google Pay and Klarna are shown. Portugal is served as `/pt/` on the same domain with translated slugs and `pt-PT` hreflang; MB Way/Multibanco absent. Sources: https://www.thecolvinco.com/products/flores-a-domicilio-ramo-flores-blancas ; https://www.thecolvinco.com/sitemap_collections_1.xml?from=701880435061&to=728563581301 ; https://es.delejos.com/formas_de_pago/

**NO (from Bonita Blomster).** Prices in "kr" (NOK) with tax included implicitly; same-day cutoff 14:00 (13:00 Saturday), no Sunday delivery, delivery fee by postcode shown at checkout (135–806 kr). Funeral flowers are a first-class category with several sub-types (krans, hjerte, bårebukett, kistedekorasjon). Norwegian occasions: 17. mai (Nasjonaldagen), Morsdag (2nd Sunday February), Valentinsdag. Market-standard payments Vipps and Klarna were **not** offered here — Flowers Overseas should treat Vipps as table-stakes in NO. Bilingual EN/NB via `/nb/` subfolder with `x-default` on EN. Sources: https://bonitablomster.no/policies/shipping-policy ; https://bonitablomster.no/pages/delivery-prices ; https://bonitablomster.no/pages/faq

**DK (from Flora Nordica).** Prices "inkl. moms" (25%) in DKK with "Fra 250 DKK" price-tier variants rather than S/M/L; flat 79 kr delivery; Mon–Sat delivery with early cutoffs (08:00 stated on homepage; 13:30/14:00 elsewhere — publish one consistent cutoff). Funeral (begravelse) taxonomy is deep (bårebuket, kistepynt, kranse, hjerter, bånd, nedkastningsroser) and church delivery is a distinct page. Danish occasions: Mors dag (2nd Sunday May), Fars dag 5 June, Konfirmation (spring), Student (June), plus everyday Værtindegave/Indflyttergave. MobilePay and Dankort are Danish payment norms but were absent here (PayPal + card only) — treat MobilePay as required. Bilingual DA/EN via `/en/`. Sources: https://www.floranordica.dk/pages/levering ; https://www.floranordica.dk/pages/flora-nordicas-forretningsbetingelser ; https://www.floranordica.dk/sitemap_collections_1.xml?from=173620985956&to=665165136219
