# 05 — Page Inventory

Every page type the site has, what it is for, the data it needs, how it renders, whether it indexes, and the query it targets. URL patterns are from `02-seo-spec.md` §4 (en-gb shown; every segment is localised). Rendering codes from `01-architecture.md` §3: **SSG** build-time, **ISR** incremental with tag invalidation, **SSR** dynamic no-store.

The ABC Flowers CSV (`docs/research/abc-flowers-page-inventory.csv`) was used as the checklist skeleton; §9 maps each of its 62 rows to this inventory.

---

## 1. Public commerce pages

| # | Page type | URL (en-gb) | Purpose | Data | Render | Index | SEO target (pattern) | Phase |
|---|---|---|---|---|---|---|---|---|
| 1 | Locale chooser | `/` | List locales; never redirect | locale config | SSG | noindex,follow | — | 0 |
| 2 | Locale home | `/en-gb` | Destination pick in one action; trust; occasions this month | top destinations, occasion calendar (locale market), best sellers, delivery photos, Trustpilot score | ISR 1h | yes | brand; "international flower delivery" | 0 |
| 3 | All destinations | `/en-gb/send-flowers-to` | Hub to every corridor | countries by region + status | ISR | yes | "send flowers abroad", "flower delivery Europe" | 0 |
| 4 | Corridor: country | `/en-gb/send-flowers-to/poland` | The SEO backbone; sets delivery expectations; links to shop | country content, cutoffs, holidays, partner count, occasions, FAQ, photos, top products, cities, reviews | ISR 24h + on flip | yes (live or guide) | "send flowers to poland", "flower delivery poland" | 0 |
| 5 | Corridor: city | `/en-gb/send-flowers-to/poland/warsaw` | Local proof where we have florists | city coverage, florists, city FAQ | ISR | yes if coverage | "flower delivery warsaw", "send flowers to warsaw" | 1 |
| 6 | Country shop root | `/en-gb/poland/flowers` | Full grid for a destination | catalogue × country_price, availability, badges | ISR 1h | yes if live | "flowers poland delivery" | 0 (noindex demo) |
| 7 | Country category | `/en-gb/poland/flowers/roses` | Category × destination | products in category × country | ISR | yes if live & ≥6 | "roses delivery poland" | 0 |
| 8 | Country occasion | `/en-gb/poland/occasions/womens-day` | Occasion × destination with the right date | occasion_country date, tagged products | ISR | per matrix | "women's day flowers poland" | 0 |
| 9 | Product (country-scoped) | `/en-gb/poland/product/amber-rose-bouquet` | Buy; date picker; all-in price | product, translations, media, tiers, country_price, add-ons, cutoff, holidays, reviews | ISR 1h | yes if live | "{product} delivery poland" (long tail) | 0 |
| 10 | Category hub | `/en-gb/flowers/roses` | Generic category intent → choose destination | category, from-prices per live country | ISR | yes | "roses delivery", "send roses" | 0 |
| 11 | Flower-type hub | `/en-gb/flowers/type/tulips` | Optional split of category hub when a flower type is not a category | as above | ISR | yes if ≥6 products | "tulip delivery" | 4 |
| 12 | Colour landing (curated) | `/en-gb/poland/flowers/red-flowers` | Only where authored as a category | products by colour tag | ISR | yes | "red flowers delivery poland" | 4 |
| 13 | Occasion hub | `/en-gb/occasions/mothers-day` | Explains dates per country; routes to country occasions | occasion, occasion_country for live countries | ISR | yes | "mother's day flowers", "when is mother's day in germany" | 0 |
| 14 | Occasions index | `/en-gb/occasions` | All occasions for the locale market | occasion list, next dates | ISR | yes | "flowers for every occasion" | 0 |
| 15 | Add-ons & gifts | `/en-gb/poland/gifts` | Chocolates, plush, balloons, wine with flowers | addons × country | ISR | yes if live | "flowers and chocolates poland" | 1 |
| 16 | Search results | `/en-gb/search?q=` | Internal search | FTS | SSR | noindex | — | 1 |
| 17 | Faceted listing | `…/flowers?colour=red&price=..` | Filters | same as 6/7 | SSR/ISR | noindex → canonical | — | 1 |
| 18 | Basket | `/en-gb/basket` | Multi-item edit | order draft | SSR | noindex | — | 1 |
| 19 | Checkout (3 steps) | `/en-gb/checkout` | Recipient → you → pay | order draft, address formats, payment methods by buyer country | SSR | noindex + disallow | — | 0 (demo guard), 1 (real) |
| 20 | Order confirmation | `/en-gb/checkout/confirmation/{token}` | What happens next; tracking; nudge | order | SSR | noindex | — | 1 |
| 21 | Track order | `/en-gb/track/{token}` | Timeline, florist, photo, help | order, events, delivery_proof | SSR | noindex | — | 1 |
| 22 | Track lookup | `/en-gb/track` | Enter order number + email | — | SSG | yes (utility) | "track my flower order" | 1 |
| 23 | Recipient landing | `/r/{code}` → `/{dest-locale}/thanks/{code}` | Recipient-to-sender loop | order, recipient, sender first name | SSR | noindex | — | 2 |
| 24 | Gift card | `/en-gb/gift-cards` | Digital voucher | voucher product | ISR | yes | "flower gift card" | 4 |

## 2. Content and trust pages

| # | Page type | URL | Purpose | Data | Render | Index | SEO target | Phase |
|---|---|---|---|---|---|---|---|---|
| 25 | How it works | `/en-gb/how-it-works` | Relay explained; photo proof; guarantee | static + live stats (florists, countries, deliveries) | SSG/ISR | yes | "how international flower delivery works" | 0 |
| 26 | Our florists | `/en-gb/our-florists` | Network trust; vetting criteria; florist profile cards | partners (active), vetting copy | ISR | yes | "vetted local florists" | 1 |
| 27 | Florist profile | `/en-gb/florists/{slug}` | Optional; real partners who opt in | partner profile, city, photos, reviews | ISR | yes if opted-in & ≥1 order | "florist {city}" (light) | 2 |
| 28 | Guarantee & substitution | `/en-gb/guarantee` | Plain-language promise; substitution policy; refunds | static | SSG | yes | "flower delivery guarantee" | 0 |
| 29 | Delivery information | `/en-gb/delivery` | Cutoffs by country table; holidays; hospitals/funerals | countries, cutoffs, holidays | ISR | yes | "same day flower delivery europe" | 0 |
| 30 | Reviews | `/en-gb/reviews` | First-party verified reviews + Trustpilot | reviews (verified) | ISR | yes | brand + reviews | 1 |
| 31 | Real deliveries gallery | `/en-gb/deliveries` | Photo proof at scale | approved delivery_proof with consent | ISR | yes | "real flower delivery photos" | 2 |
| 32 | FAQ | `/en-gb/help` | General FAQ with schema; links to country FAQs | faq entries | SSG | yes | "flower delivery abroad faq" | 0 |
| 33 | About | `/en-gb/about` | Founder story, company facts (OÜ), mission | static | SSG | yes | brand | 0 |
| 34 | Contact | `/en-gb/contact` | Email, WhatsApp, hours, company address | static | SSG | yes | brand | 0 |
| 35 | Blog index | `/en-gb/blog` | Editorial hub | posts (reviewed) | ISR | yes | — | 0 |
| 36 | Blog post | `/en-gb/blog/{slug}` | Informational/diaspora intent | MDX | SSG | yes if reviewed | per post | 0 |
| 37 | Blog category/tag | `/en-gb/blog/topic/{tag}` | Grouping | posts | ISR | yes if ≥5 posts | — | 2 |
| 38 | Author page | `/en-gb/authors/{slug}` | E-E-A-T | author | SSG | yes | — | 1 |
| 39 | Flower care guide | `/en-gb/blog/flower-care` (evergreen post) | Post-purchase value | MDX | SSG | yes | "how to keep flowers fresh" | 1 |
| 40 | Occasion calendar page | `/en-gb/occasions/calendar` | All dates for all live countries, this and next year | occasion_country | ISR | yes | "flower occasions calendar europe" | 1 |

## 3. B2B: florists

| # | Page type | URL | Purpose | Data | Render | Index | SEO target | Phase |
|---|---|---|---|---|---|---|---|---|
| 41 | For florists landing | `/en-gb/for-florists` (`/pl/dla-kwiaciarni`, `/de/fuer-floristen`) | Recruit partners: why, payouts, what we handle, how orders arrive, FAQ, apply | static + live stats + testimonials (real only) | SSG/ISR | yes | "florist partnership", "become a partner florist", "zlecenia dla kwiaciarni" | 0 |
| 42 | Florist application | `/en-gb/for-florists/apply` | Form: business, city, coverage, capacity, photos, payout details (later) | → `partner_application` | SSR | noindex | — | 0 |
| 43 | Florist walkthrough | `/en-gb/for-florists/how-orders-work` | Screens/video of order arriving (email/WhatsApp/portal), accept, photo upload, payout | static | SSG | yes | "how flower relay orders work" | 0 |
| 44 | Florist terms | `/en-gb/legal/partner-terms` | Partner agreement | MDX | SSG | yes | — | 1 |
| 45 | Demo order sandbox | `/demo/vendor-inbox` (password) | Pitch: mock order lands in a vendor inbox | seed data | SSR | noindex, protected | — | 0 |

## 4. Legal and compliance pages (per locale, versioned)

| # | Page | URL | Notes | Phase |
|---|---|---|---|---|
| 46 | Terms & conditions | `/en-gb/legal/terms` (`/de/rechtliches/agb`) | Per legal regime: EU (OÜ) and UK variants | 0 |
| 47 | Privacy policy | `/en-gb/legal/privacy` | Structure in 07 §2; recipient data section | 0 |
| 48 | Cookie policy + settings | `/en-gb/legal/cookies` | Re-open consent | 0 |
| 49 | Withdrawal / cancellation & refunds | `/en-gb/legal/cancellation` | Perishable exemption disclosure; our voluntary cancellation window | 0 |
| 50 | Impressum | `/de/impressum` (also linked from en for AT/DE buyers) | Mandatory for DE/AT audience | 0 |
| 51 | Substitution policy | folded into 28; separate URL `/en-gb/legal/substitution` 301 → 28 | | 0 |
| 52 | Accessibility statement | `/en-gb/accessibility` | EAA requirement | 1 |
| 53 | Review policy | `/en-gb/legal/reviews` | Omnibus: how reviews are collected and verified | 1 |
| 54 | Company information | footer block + `/en-gb/legal/company` | OÜ registry code, address, VAT, contact | 0 |

## 5. Authenticated surfaces

| # | Page | URL | Role | Render | Phase |
|---|---|---|---|---|---|
| 55 | Magic-link login | `/account/login` | any | SSR | 1 |
| 56 | Customer account: orders, recipients (address book), preferences, data export/delete | `/account/*` | customer | SSR | 1 (minimal), 3 (full) |
| 57 | Admin: order queue, order detail, manual re-route, refunds, partner CRUD, coverage, prices/margins per country, occasion calendar, translations queue, reviews moderation, country/locale/payment flags, exports | `/admin/*` | admin | SSR | 0 (partners, catalogue, flags, translations), 1 (orders, refunds), 2+ (rest) |
| 58 | Vendor portal: inbox, accept/decline, capacity & blackout dates, substitution notes, photo upload, payouts, ratings, staff | `/vendor/*` | vendor (org-scoped) | SSR | 2 |
| 59 | Vendor magic-link actions (no login): accept/decline/upload from email or WhatsApp link | `/v/{token}` | token | SSR | 1 |

## 6. System endpoints

| # | Endpoint | Purpose | Phase |
|---|---|---|---|
| 60 | `/sitemap.xml`, `/sitemaps/{loc}/*.xml` | 02 §10 | 0 |
| 61 | `/robots.txt` | 02 §7 | 0 |
| 62 | `/api/webhooks/stripe`, `/mollie`, `/resend`, `/whatsapp` | signature-verified, idempotent | 1 |
| 63 | `/api/internal/cron/*` | queue tick, sitemap regen, fx refresh | 0 |
| 64 | `/api/health`, `/api/ready` | uptime checks | 0 |
| 65 | `/api/consent` | consent log write | 0 |
| 66 | `/api/track/{token}.json` | polling for tracking page updates | 1 |
| 67 | `/.well-known/security.txt`, `/humans.txt`, `/agents.md` | hygiene; agentic-discovery (cheap future-proofing) | 1 |
| 68 | 404 / 410 / 500 pages | localised, with destination picker | 0 |

## 7. URL volume estimates

| Scope | Corridor country | City | Country categories | Country occasions | Products | Hubs & content | Total indexable |
|---|---|---|---|---|---|---|---|
| Phase 0 (PL live; 6 guides; 4 locales) | 7 × 4 = 28 | 0 | 10 × 1 × 4 = 40 | ~12 × 1 × 4 = 48 | 80 × 1 × 4 = 320 | ~60 × 4 = 240 | **~680** |
| Phase 4 (8 live countries, 8 locales, 25 cities) | 40 × 8 = 320 | 25 × 8 = 200 | 10 × 8 × 8 = 640 | ~12 × 8 × 8 = 768 | 100 × 8 × 8 = 6,400 | ~100 × 8 = 800 | **~9,100** |
| 40 live countries, 12 locales, 150 cities | 480 | 1,800 | 4,800 | ~5,000 | 48,000 | 1,500 | **~62,000** |

The 50K+ sitemap architecture in 02 §10 is sized for the last row; product pages dominate and are the ones we would prune first if consolidation is observed.

## 8. Per-page data contract (what `spec-writer` must fill for every page spec)

`purpose · URL pattern + localised segments · indexability + canonical + hreflang set · data sources (tables) · render mode + revalidation tags · required trust elements (04 §12) · schema types (02 §9) · analytics events (04 §14) · performance budget (01 §7) · empty/demo/disabled states · accessibility notes · legal notices present · tests (unit/integration/e2e/visual)`.

## 9. Mapping the ABC Flowers CSV to this inventory

| CSV rows | CSV page(s) | Disposition |
|---|---|---|
| Homepage, Shop All Flowers, Search | 1–3 | Adopted as #2, #6 (per country) + #10 hubs, #16 |
| Occasions hub + 12 occasion categories incl. seasonal | 4–16 | Adopted as #13/#14 hubs and #8 country occasions; seasonal pages stay live year-round as the CSV notes; dates become per-country data |
| Shop by flower (roses…seasonal) | 17–24 | Adopted as categories (#7/#10); "Seasonal" becomes a rotating curated collection, not a permanent URL |
| Shop by colour ×5 | 25–29 | **Facets by default (noindex)**; promoted to curated category (#12) only where demand and inventory justify |
| Product types (bouquets, arrangements, plants, hampers, add-ons, gift cards) | 30–35 | Bouquets/arrangements/plants → categories; hampers → Phase 4 category; add-ons → #15 (never standalone products at launch); gift cards → #24 Phase 4 |
| Product template | 36 | Adopted as #9 with country scope |
| Delivery info, same-day landing, city delivery template | 37–39 | Delivery info → #29; "same-day" → corridor + delivery page sections (no separate thin landing); city → #5 with strict existence rules |
| Cart, checkout, thank-you, wishlist | 40–43 | #18–#20; **wishlist dropped** (gifting has near-zero save-for-later behaviour; revisit Phase 4) |
| Login, register, account, orders, track | 44–48 | #55–#56, #21–#22; register merged into magic-link |
| About, contact, FAQ, care guide, substitution, reviews | 49–54 | #33, #34, #32, #39, #28, #30 |
| Blog hub + post | 55–56 | #35–#36 |
| Privacy, T&Cs, refund, shipping policy | 57–60 | #46–#49; "shipping policy" renamed **delivery information + cancellation** because we ship nothing |
| Sitemap, robots | 61–62 | #60–#61 |
| Not in CSV, added | — | Corridors (#3–#5), country-scoped shop (#6–#9), occasion hubs with per-country dates, for-florists set (#41–#45), tracking, recipient loop, our florists, real deliveries, guarantee, Impressum, accessibility statement, review policy, admin/vendor, `agents.md` |

**Recommendation:** freeze this inventory as the scope for Phase 0–1 page specs; new page types require a spec and an ADR if they add an indexable pattern.
**Rationale:** every indexable URL pattern is a programmatic-SEO liability as well as an asset; adding one should be a deliberate decision, not a template side effect.
