# 02 — SEO Specification

Ranking is priority #1. This document fixes the URL architecture, the programmatic page rules, and the technical SEO contract that every spec, PR and the `seo-auditor` agent enforce. Evidence base: `docs/research/competitors-direct.md`, `competitors-national.md`, `competitors-global-and-serp.md`. Related ADRs: ADR-0001, ADR-0006, ADR-0007.

Demand figures in this document are **estimate-grade** (Ahrefs not authorised); every volume-based ordering must be re-checked once the connector is live (tracked in `13`).

---

## 1. What the reference sites taught us

| Finding | Where observed | Consequence for us |
|---|---|---|
| Nobody runs one .com with locale subfolders and a destination-country model. FloraQueen moved to ccTLD-per-language; Interflora/Euroflorist are ccTLD federations; Bloom & Wild is domestic per site; GiftBasketsOverseas uses six domains. | competitors-direct | We are making a structural bet with no peer to copy. The bet is defended in §2 and monitored per market in Search Console. |
| English .com pages (FloraQueen, MyGlobalFlowers) rank top-5 for the German query "Blumen nach Polen schicken" despite those companies owning .de sites. | competitors-global-and-serp SERP table | A single .com is not evidently penalised for cross-market ranking. |
| Programmatic geo pages that share one product grid: FloraQueen 12,610 of 14,443 collections; internetflorist.biz 14,750 child sitemaps incl. Antarctica; floristsonline.net 33,392 city entries with 4,542 duplicates; GBO ~240k product×country pages. | all three | Corridor pages exist only where we have unique data (§5); city tier only with real florist coverage. |
| Template variables leaking ("Empfänger in Frankreich" on fleurop.de's Poland page; "toronto Flower Delivery" lowercase slug injection). | competitors-global-and-serp | Corridor copy is authored per country, never templated with a place-name variable; `seo-auditor` greps for slug-in-copy. |
| Only Interflora UK's `/category/international/{country}` and GBO's country pages carry real FAQ content + FAQPage schema. | competitors-direct | That is our quality floor for a corridor page, not our ceiling. |
| Client-rendered PDPs with no server title/canonical/schema (Euroflorist NO, netflorist, 1800flowers international pages with empty `<title>`). | competitors-direct, -global | Every indexable page is HTML at the edge (01 §3). |
| hreflang only in sitemap (interflora.ee) or missing on PDPs (FloraQueen). | competitors-direct | hreflang in HTML **and** sitemap, on every indexable URL. |
| Display-only multi-currency with USD settlement and a disclaimer (GBO). | competitors-direct | Charge exactly the displayed amount; currency is a locale property (§3). |
| FloraQueen shows destination-dependent delivery fee per selectable date on the PDP. | competitors-direct | Adopt in PDP (04). |
| Interflora UK carries the richest PDP schema (Offer + OfferShippingDetails + MerchantReturnPolicy). | competitors-direct | Adopt (§9). |
| Only Blume2000's Berlin page reads as genuinely local among ~500 competitor city pages. | competitors-national | City tier requires real coverage and local copy or does not exist. |

## 2. One domain, locale subfolders (ADR-0001)

| Criterion | ccTLD per country (Interflora, Euroflorist) | Subdomain per locale | **Subfolder per locale on flowersoverseas.com** |
|---|---|---|---|
| Authority consolidation | None; each country starts at zero | Weak; treated close to separate hosts | Full; every link to any locale strengthens all |
| Local signal | Strongest (TLD) | None beyond hreflang | hreflang + localised content + local payment/legal pages. Search Console country targeting no longer exists for anyone, so the TLD advantage has shrunk. |
| Cost for 40+ countries | 40 domains, 40 GSC properties, 40 link profiles | 40 hosts | One deploy, one sitemap index, one GSC property with folder filters |
| Blast radius of a penalty | Isolated per country | Partially isolated | Whole site: programmatic-quality gates must be strict |
| Fit for a relay (buyer country ≠ destination country) | Poor: a ccTLD implies one country; incumbents hand users to sister sites ("klikk her for å gå til den irske nettside") | Poor | Natural: locale = buyer's language/currency; destination is a path segment |

**Recommendation:** subfolders on one .com.
**Rationale:** the relay model has two countries per page; a ccTLD can express only one, and authority compounding is the only asset a new brand can build fast.

## 3. Locale prefixes: which combinations get their own URL

Rule: **a language-region combination gets its own URL prefix only when buyer currency or legal regime differs.** Otherwise regional variants share the language URL and are declared via `hreflang` alone.

| Prefix | hreflang values served on the same URL | Currency in HTML | Legal regime | Phase |
|---|---|---|---|---|
| `/en/` | `en`, `x-default`, `en-IE`, `en-NL`, `en-150` | EUR | EU (Estonian OÜ, CRD) | 0 |
| `/en-gb/` | `en-GB` | GBP | UK (CRA 2015, CCRs 2013) | 0 (MVP corridor) |
| `/de/` | `de`, `de-DE`, `de-AT` | EUR | EU; Impressum required | 0 |
| `/pl/` | `pl`, `pl-PL` | PLN | EU | 0 |
| `/fr/` | `fr`, `fr-FR`, `fr-BE`, `fr-LU` | EUR | EU | 4 |
| `/es/` | `es`, `es-ES` | EUR | EU | 4 |
| `/it/` | `it`, `it-IT` | EUR | EU | 4 |
| `/nl/` | `nl`, `nl-NL`, `nl-BE` | EUR | EU | 4 |
| `/ro/`, `/tr/` | `ro-RO`; `tr-TR` | RON; TRY | EU; non-EU | 4 |
| `/sv/` | `sv-SE` | SEK | EU | 4 |
| `/de-ch/`, `/fr-ch/`, `/it-ch/` | `de-CH` etc. | CHF | CH (non-EU) | when CH demand justifies |
| `/en-us/` etc. | `en-US` | USD | later | 5+ |
| `/ar/`, `/ur/` | `ar`, `ur` (RTL) | buyer-selectable | later | 5+; architecture ready (03) |

Notes:
- `x-default` points to `/en/` versions. The bare root `/` is a lightweight locale chooser that lists all locales as plain links (crawlable), never redirects, and is `noindex` itself.
- Display-currency switching by the buyer (cookie) is a **client-side override** of the HTML default; it never changes the canonical HTML or the URL. ISR pages embed a small JSON price table for the supported display currencies so the override repaints without a fetch.
- Polish diaspora in the UK use `/en-gb/` (GBP) or `/pl/` with the GBP display override. `/pl-gb/` is not created unless Search Console shows meaningful Polish-language UK query share.

**Recommendation:** four prefixes at launch: `en`, `en-gb`, `de`, `pl`.
**Rationale:** GBP and UK law make `en-gb` a genuinely different page; every other launch variant differs only by hreflang.

## 4. URL architecture

All slugs are localised per locale (stored in `*_translation.slug`), ASCII only (`polska` not `Polska`, `blumen-verschicken` never with umlauts), lowercase, hyphenated, no trailing slash. Localised path segments (`send-flowers-to`, `blumen-verschicken`, `wyslij-kwiaty`) are defined once per locale in `config/locales.ts`.

### 4.1 Page type → pattern

| Page type | en-gb example | de example | pl example | Indexable |
|---|---|---|---|---|
| Home | `/en-gb` | `/de` | `/pl` | yes |
| All destinations | `/en-gb/send-flowers-to` | `/de/blumen-verschicken` | `/pl/wyslij-kwiaty` | yes |
| **Corridor (country)** | `/en-gb/send-flowers-to/poland` | `/de/blumen-verschicken/polen` | `/pl/wyslij-kwiaty/polska` | yes if country `live` or has a published guide; §5 |
| **Corridor (city)** | `/en-gb/send-flowers-to/poland/warsaw` | `/de/blumen-verschicken/polen/warschau` | `/pl/wyslij-kwiaty/polska/warszawa` | only with ≥1 active partner covering the city |
| Country shop root | `/en-gb/poland/flowers` | `/de/polen/blumen` | `/pl/polska/kwiaty` | yes if `live` |
| Country category | `/en-gb/poland/flowers/roses` | `/de/polen/blumen/rosen` | `/pl/polska/kwiaty/roze` | yes if `live` and ≥6 products |
| Country occasion | `/en-gb/poland/occasions/womens-day` | `/de/polen/anlaesse/frauentag` | `/pl/polska/okazje/dzien-kobiet` | per matrix §6 |
| **Product (country-scoped)** | `/en-gb/poland/product/amber-rose-bouquet` | `/de/polen/produkt/amber-rosenstrauss` | `/pl/polska/produkt/bukiet-roz-amber` | yes if `live`; self-canonical |
| Category hub (no country) | `/en-gb/flowers/roses` | `/de/blumen/rosen` | `/pl/kwiaty/roze` | yes; "choose destination" hub with from-prices |
| Occasion hub (no country) | `/en-gb/occasions/mothers-day` | `/de/anlaesse/muttertag` | `/pl/okazje/dzien-matki` | yes; explains dates per country |
| Blog | `/en-gb/blog/{slug}` | `/de/blog/{slug}` | `/pl/blog/{slug}` | yes |
| For florists | `/en-gb/for-florists` | `/de/fuer-floristen` | `/pl/dla-kwiaciarni` | yes |
| How it works, about, guarantee, contact, FAQ, reviews | `/en-gb/how-it-works` … | localised | localised | yes |
| Legal | `/en-gb/legal/terms` … | `/de/rechtliches/agb`, `/de/impressum` | `/pl/regulamin` … | yes |
| Search, facets | `/en-gb/search?q=`, `?colour=red` | | | **noindex**; canonical to base |
| Cart, checkout, confirmation | `/en-gb/checkout/*` | | | noindex + robots disallow |
| Track | `/en-gb/track/{token}` | | | noindex |
| Account, admin, vendor | `/account/*`, `/admin/*`, `/vendor/*` (no locale prefix) | | | noindex + disallow |

### 4.2 Why destination country is in shop URLs

Price, currency of supply, cutoff, holidays, florist and availability all depend on the destination. Putting the country in the path lets the server render the correct `Offer` (`price`, `priceCurrency`, `eligibleRegion`, `availability`) into cached HTML, keeps one canonical per (locale, country, product), and avoids the incumbents' failure of showing domestic inventory on a foreign-destination page.

Trade-off: the same product exists at N country URLs with largely identical descriptions. Mitigations: (a) products are indexable only in `live` countries, so N stays small for years; (b) each country product page carries a server-rendered country block (cutoff, next available date, florist count, local VAT wording, local add-ons); (c) money pages are corridor and category pages, so PDP consolidation by Google costs little; (d) monitored via GSC "Duplicate, Google chose different canonical" and revisited if it exceeds 10% of PDPs.

**Recommendation:** country in every shop URL; corridor pages under a localised `send-flowers-to` segment; country-less hubs for category and occasion.
**Rationale:** the buyer's query is almost always "flowers to {place}" or "{occasion} flowers {place}"; the URL mirrors the query and the HTML carries the right price.

## 5. Corridor pages: the SEO backbone

### 5.1 Existence and index rules

| Country state | Country page | City page |
|---|---|---|
| `live` (≥1 active partner) | exists, indexable, in sitemap, full shop links | exists and indexable only for cities with ≥1 active partner covering them **and** founder-approved local copy |
| `demo` | exists **only if** the guide section is written (≥600 words country-specific); indexable as a **guide** with an honest "we are onboarding florists in {country}, join the waitlist" state; no product grid; in corridor sitemap only | does not exist |
| `disabled` | 410 (404 if never existed); removed from sitemaps | 410 |

No corridor page is created because a country exists in a list. The `seo-auditor` fails a build where indexable corridor URLs exceed countries with `guide_published = true OR status = live`.

### 5.2 Minimum unique data per corridor page (hard requirement)

| Block | Source | Uniqueness test |
|---|---|---|
| H1 + intro (120–200 words) written for this country and locale | authored `country_locale_content` | ≥70% token-distinct from every other corridor page in the locale |
| Delivery facts: same-day cutoff in local time, next-day window, Sunday/holiday delivery, hospital/funeral-home/hotel rules | `country`, `country_holiday`, partner coverage | — |
| Currency and VAT wording | `country` | — |
| Florist network: count of active partners, cities covered, "your florist" profile card(s) | `fulfillment_partner` (demo partners never shown on indexable pages) | count >0 for `live` |
| Locally popular flowers and taboos (even-numbered stems in PL; chrysanthemums = funerals in PL/FR/IT) | authored | — |
| Local occasion calendar, next 12 months, linking only to indexable country occasion pages | `occasion_country` | — |
| Region-specific FAQ (8–12 Q&A) with `FAQPage` schema | authored | ≥50% of questions country-specific |
| Real delivery photos (≥3 approved `delivery_proof` with consent; block hidden until then) | data | — |
| Top products for this destination, priced in locale currency | `country_price` | — |
| Cities list (only indexable cities are links) | data | — |
| Corridor reviews (verified, when ≥3 exist) | `review` | — |

City pages additionally require city-specific cutoff/coverage, the covering florists, ≥4 city-specific FAQs, and at least two sentences that could not be written about another city. If those cannot be written, the page is not created.

### 5.3 Template hygiene

- No place-name variable in body copy beyond H1, title, breadcrumb and the delivery-facts block.
- `seo-auditor` greps every corridor page for its slug inside sentences and for any other country's name (the fleurop.de failure).
- Title pattern per locale, ≤60 chars, e.g. `Send flowers to Poland · Same-day local florist | Flowers Overseas`; meta description authored per country.

**Recommendation:** at Phase 0 ship a live corridor for PL and written guides for DE, FR, ES, IT, RO, NL; nothing else until a guide or a florist exists.
**Rationale:** ten excellent corridor pages outrank ten thousand grids, and nothing else protects a single domain from a site-wide quality action.

## 6. Occasion × country matrix

Occasions are entities with per-country date rules in `occasion_country` (fixed date, nth-weekday, Easter-relative, none). A country occasion page exists and is indexable only when **all** hold: country `live`; `observed = true` for that country; ≥6 products tagged for the occasion available there.

| Occasion | PL | DE | UK (en-gb) | Notes |
|---|---|---|---|---|
| Birthday, anniversary, get well, sympathy, congratulations, new baby, thank you, romance, just because | yes | yes | yes | Evergreen, same URL year-round |
| Valentine's Day 14 Feb | yes | yes | yes | Live year-round; copy flips to "next year" after the date |
| Women's Day 8 Mar | **yes (top-3 PL)** | yes (moderate) | not created | |
| Mother's Day | 26 May fixed | 2nd Sunday May | **4th Sunday of Lent (March)** | Each country page carries its own date; the hub explains all |
| Father's Day | 23 Jun | Ascension Thursday | 3rd Sunday June | |
| Name days | yes | not created | not created | Name-day calendar content in `/pl/blog` |
| Grandmother's/Grandfather's Day 21/22 Jan | yes | not created | not created | |
| Teacher's Day 14 Oct | yes | not created | not created | |
| All Saints 1 Nov (grave flowers) | **yes (massive)** | not created | not created | Distinct product set: wreaths, chrysanthemums |
| Easter | yes | yes | yes | Easter-relative |
| Christmas / Advent | yes | yes | yes | |
| Sant Jordi, Fête des grands-mères, Muguet, Omatag, 17 mai, Konfirmation, Student | — | Omatag later | — | Activated per country in Phase 4 |

Pages that fail the rule are **not created** (404), not `noindex`; `noindex` is reserved for pages that must exist for users (facets, search, demo shop). The occasion hub `/{loc}/occasions/{occasion}` is always indexable, lists dates for every live country, and is the landing page for generic "{occasion} flowers" queries in that language.

**Recommendation:** matrix above, driven by `occasion_country`, with the six-product threshold enforced in the page loader.
**Rationale:** occasion pages convert when the date on the page is the buyer's date; a wrong Mother's Day is worse than no page.

## 7. Canonicalisation, pagination, facets, noindex

| Case | Rule |
|---|---|
| Canonical | Every indexable page self-canonical to its lowercase, trailing-slash-free, parameter-free URL. Never cross-locale canonicals. |
| Pagination | `?page=N` indexable and self-canonical (not to page 1); title suffix "· Page N"; `?page=1` 301s to the bare URL. |
| Facets (colour, price, flower type) | Query parameters only; `noindex,follow`; canonical to the unparameterised page; **not** blocked in robots so the `noindex` is seen. Facets worth ranking get a real authored path (`/en-gb/poland/flowers/red-roses`). |
| Sort | Never in indexable URLs; default sort deterministic. |
| Search | `noindex`. |
| Retired product | 200 with "not available" + alternatives for 90 days, then 410. Never soft-404. |
| Trailing slash, case, `www`, HTTP | 301 at the edge to canonical form; `www` → apex; HSTS preload. |
| UTM / gclid / fbclid | Stripped from canonical; ignored by cache key. |
| Locale chooser `/` | `noindex,follow`. |
| Demo-country shop pages | `noindex,follow`; excluded from sitemaps (ADR-0007). |
| Account, checkout, track, admin, vendor, api | `noindex` header + robots disallow. |

## 8. hreflang

- In `<head>` on every indexable page **and** in the sitemap (`xhtml:link`); reciprocal and complete: every alternate lists every other alternate, itself, and `x-default`.
- Alternates exist only where the translated page exists and is indexable; a `pl` post without a `de` translation has no `de` alternate.
- Regional variants sharing a URL (§3) are multiple entries pointing to the same URL.
- Generated by one `modules/seo/hreflang.ts` from the same data as the sitemap, so they cannot disagree. `seo-auditor` samples 200 URLs per deploy and asserts reciprocity and 200 status.
- Header locale switcher links to the same entity in every locale, falling back to the locale home.

## 9. Schema.org plan

| Page | Types | Notes and manual-action flags |
|---|---|---|
| Every page | `BreadcrumbList`; `WebSite` + `SearchAction` on home | — |
| Home / about | `Organization`: `name`, `url`, `logo`, `sameAs` (Trustpilot, socials), `contactPoint`, `address` (registered office), `vatID` once registered | **Never** `LocalBusiness` or per-city `FloristShop`: we are not a local business and per-city entities would be fabricated (misleading structured data → manual action). |
| Product (country-scoped) | `Product` (`name`, `image[]`, `description`, `sku`, `brand`) with **one** `Offer`: `price`, `priceCurrency`, `availability`, `eligibleRegion` (destination ISO), `priceValidUntil`, `shippingDetails` → `OfferShippingDetails` (`shippingRate` 0 when included, `shippingDestination` → `DefinedRegion`, `deliveryTime` → `ShippingDeliveryTime` with `cutoffTime`), `hasMerchantReturnPolicy` → `MerchantReturnPolicy` (`returnPolicyCategory: MerchantReturnNotPermitted`, `merchantReturnLink` → guarantee page) | Schema price equals the visible default price to the cent, VAT included. Never emit `Offer` for a country that is not `live`. |
| Product with ≥3 verified reviews | `aggregateRating` + up to 5 `review` from **our own verified-order reviews** | Never put Trustpilot's company rating into `Product`; never mark ratings not visible on the page; store verified-purchase provenance per review (Omnibus). |
| Corridor, occasion, FAQ pages | `FAQPage` for visible Q&A only | FAQ rich results are now limited to authoritative sites; markup stays valid. Never hide FAQ text. |
| Blog | `BlogPosting` with named real `author`, `datePublished`, `dateModified`, `inLanguage` | Machine-translated posts are not indexable, so never carry `BlogPosting`. |
| For florists | `WebPage` + `FAQPage` | Not `JobPosting` (partnership, not employment). |
| Reviews page | `Organization` + `aggregateRating` from first-party verified reviews shown on that page | — |

Typed builders in `modules/seo/schema/*`; CI validates JSON-LD on PDP, corridor, occasion and blog fixtures; `seo-auditor` re-validates live samples.

## 10. Sitemaps

```
/sitemap.xml                          index of per-locale indexes
/sitemaps/{loc}/index.xml
/sitemaps/{loc}/static.xml            home, hubs, info, legal
/sitemaps/{loc}/corridors.xml         countries (guide or live) + indexable cities
/sitemaps/{loc}/categories.xml        live country categories + category hubs
/sitemaps/{loc}/occasions.xml         occasion hubs + indexable country occasions
/sitemaps/{loc}/products-{n}.xml      live country-scoped products, 10,000 per file
/sitemaps/{loc}/editorial.xml         reviewed blog and guides
/sitemaps/images-{n}.xml              Phase 4
```

- `<lastmod>` is the real max `updated_at` across the entity, its translation, price and content; never "now".
- Regenerated hourly and on country flips; `Cache-Control: max-age=3600`.
- ≤10,000 URLs and ≤10 MB per child (headroom under the 50,000 limit).
- `robots.txt` lists only `/sitemap.xml`. Search Console domain property; IndexNow for Bing.
- Nothing `noindex` ever appears in a sitemap (auditor check).

## 11. Internal linking model

Goal: authority flows to corridor and country-category money pages in every locale; crawl depth ≤3 from the locale home.

| From | To |
|---|---|
| Locale home | All-destinations; top 8 corridors by demand; top 6 occasion hubs; how it works; for florists |
| All-destinations | Every indexable corridor page grouped by region |
| Corridor (country) | Country shop root; top 6 country categories; indexable country occasions; indexable cities; 3 related corridors (neighbouring or same-diaspora); 3 blog posts tagged with the country |
| City corridor | Parent corridor; country categories; covering florists' profile cards |
| Country category | Shop root; corridor (breadcrumb); sibling categories; products |
| Product | Corridor (breadcrumb); its category; its occasions; 4 related products **in the same country**. Never in-body links to the same product in another country. |
| Occasion hub | Every live country occasion page; the evergreen category |
| Blog post | ≥1 corridor and ≥1 occasion/category page, in-body, descriptive anchors (enforced in the spec template) |
| Footer | Top 12 destinations for the locale; occasion hubs; info/legal. "All destinations" carries the rest. |
| For florists | Corridors for countries where we recruit |

Anchors are localised and descriptive. Cross-locale linking only via hreflang and the switcher, so equity stays inside each locale's money pages.

## 12. Editorial / blog

- `/{loc}/blog/{slug}`; topics chosen per locale, not translated 1:1. Priority intents: diaspora ("how to send flowers to Poland from the UK", "Polish name days explained", "flowers for a Polish funeral"), occasion timing ("when is Mother's Day in Germany 2027"), etiquette (even vs odd stems), comparison (relay florist vs shipped box).
- Every post links to ≥1 corridor and ≥1 occasion/category page and carries a `country` tag so the corridor page can list it.
- **Machine translation policy.** Allowed as a first draft for UI strings, help centre and internal tooling, always behind the `reviewed` flag. **Not allowed** for indexable blog posts, corridor copy, occasion copy, legal pages and product descriptions: human-written or human-edited in the target language; an unreviewed page is `noindex` (03 §6). The auditor flags any indexable page whose translation record is `machine` and unreviewed.
- Authors are named real people (founder first) with an author page; no fabricated personas.

## 13. Per-market notes

| Market | Materially different | Implication |
|---|---|---|
| **DE / AT** | Trusted Shops and Impressum are trust baselines; "inkl. MwSt." wording; formal Sie; compound-noun keywords ("Blumenversand Polen"); Klarna/PayPal decisive; Blume2000's city pages show genuinely local pages are possible. | `/de/impressum` site-wide; Trusted Shops considered in Phase 4; corridor titles use noun compounds. |
| **FR** | Speed-per-zone claims ("4h Paris"), TTC prices, mandatory recipient phone, 160-char messages, photo-before-dispatch norm; Fête des grands-mères, Muguet; Trustpilot dominant; accent-free slugs. | Delivery-facts block prominent; FR occasions in Phase 4. |
| **ES / PT** | "Impuestos incluidos"; Sant Jordi (Catalonia), Día del Padre 19 Mar; Bizum absent on competitors (gap); no `ca` locale; Portugal as `/pt/` later with MB Way. | Bizum via Stripe/Mollie in Phase 4. |
| **IT** | Deep sympathy segment; Festa della Mamma 2nd Sunday May; Italian copy with local delivery terms ("consegna fiori a domicilio"). | Phase 4; funeral category depth. |
| **NL / BE** | iDEAL (NL) and Bancontact (BE) non-negotiable; Dutch buyers search in Dutch despite high English proficiency; Moederdag 2nd Sunday May; BE splits nl/fr. | `/nl/` serves NL and BE-nl; `/fr/` serves BE-fr. |
| **PL** | Women's Day 8 Mar and All Saints 1 Nov are peaks; name days; BLIK dominant; keyword declension ("kwiaty do Polski" vs "kwiaty Polska"); diaspora searches in Polish from UK/DE/NL; even-stem taboo; Allegro as a shopping competitor. | Keyword research covers declined forms; PL corridor copy by a native speaker; richest occasion set at launch. |
| **Nordics** | High English proficiency, low volume, high AOV; Vipps/MobilePay/Swish table-stakes; Morsdag NO 2nd Sunday Feb, SE last Sunday May, DK 2nd Sunday May; deep funeral taxonomy. | Serve from `/en/` with local payment methods first; add `/sv/` when Swedish query share justifies. |
| **UK / IE** | Mothering Sunday in March; Trustpilot and Klarna common; UK consumer law; IE uses EUR on `/en/`. | `en-gb` is a distinct locale; Mothering Sunday is the first seasonal test. |

## 14. Core Web Vitals and crawl efficiency

- Budgets in 01 §7 are CI gates; RUM per locale via web-vitals → GA4 dimensions `locale`, `page_type`, `country`.
- Crawl budget: no facets in sitemaps, `noindex` facets, 410 for retired entities, honest lastmod, ≤3 clicks to any indexable page, no URL-based calendars.
- Never vary HTML by IP or User-Agent beyond responsive HTML; the suggestion banner renders after hydration and is suppressed for known bot UAs (ADR-0006).
- No indexable content behind client fetch; PDP price, availability summary and schema are server-rendered; the interactive date picker hydrates over a server-rendered "Next available: tomorrow" line.

## 15. Manual-action and quality-collapse risks

| Risk | Guard |
|---|---|
| Corridor/city grids with swapped place names | §5 existence rules, uniqueness thresholds, auditor grep |
| Indexing seed-data shop pages | ADR-0007; `noindex` + sitemap exclusion tied to `country.status` |
| Structured data ≠ visible content | Builders read the same view model as the UI; CI validation |
| `LocalBusiness` per city | Forbidden (§9) |
| Unverified reviews in schema | First-party verified-order reviews only (07) |
| Machine-translated pages indexed | `reviewed` flag gates `noindex`; auditor check |
| IP redirects hiding locales | ADR-0006 |
| hreflang/sitemap disagreement | Single generator; reciprocity test |
| Cross-country PDP duplication | Live-only indexing; country blocks; GSC monitoring, 10% threshold |

## 16. Measurement

- Search Console domain property; weekly export by folder; alert on coverage drops >10% week-on-week.
- Rank tracking of 50 head terms per launch locale once Ahrefs is authorised.
- KPIs: Phase 0 → indexed guides and impressions; Phase 1 → top-20 for "send flowers to poland" (en-gb) and "kwiaty do Polski z Anglii" (pl); Phase 4 → corridor pages ≥40% of organic sessions.

**Recommendation:** adopt this specification as the contract for `spec-writer` (SEO section mandatory in every spec) and `seo-auditor`.
**Rationale:** the incumbents' failures are all template failures; ours is a data and gating problem, solved once in the schema and the page loaders.
