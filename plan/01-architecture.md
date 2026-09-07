# 01 — Architecture

Decisions here defer to priority #1 (organic ranking) and #5 (near-zero cost). Hosting provider is chosen in `08-deployment.md`; this document is written so that the same codebase runs on Vercel, Railway (behind Cloudflare) or Cloudflare with no application refactor. Related ADRs: ADR-0008 (stack), ADR-0009 (event-sourced orders), ADR-0007 (what Google sees).

---

## 1. System overview

```
 Buyer (mobile 70%+)                 Googlebot                Florist (Phase 1: email/WhatsApp; Phase 2: portal)
        │                                │                             │
        ▼                                ▼                             ▼
 ┌──────────────────────── CDN / edge cache (HTML for indexable pages, images) ────────────────────────┐
 │                                                                                                    │
 │   Next.js App Router (single app, one repo)                                                        │
 │   ├─ /[locale]/…            public pages: SSG + ISR, edge-cached, hreflang, JSON-LD                 │
 │   ├─ /[locale]/checkout     SSR no-store, Stripe Elements / Mollie Components                      │
 │   ├─ /[locale]/account, /track/[token]      SSR no-store                                           │
 │   ├─ /admin                 SSR, role=admin, noindex, behind auth                                  │
 │   ├─ /vendor                Phase 2 portal, role=vendor, org-scoped                                │
 │   ├─ /api/webhooks/*        Stripe, Mollie, Resend, WhatsApp — signature-verified, idempotent      │
 │   ├─ /api/internal/*        cron + queue endpoints (secret header)                                 │
 │   └─ sitemap.xml, sitemap-*.xml, robots.txt, feeds                                                 │
 └────────────────────────────────────────────────────────────────────────────────────────────────────┘
        │                         │                        │                          │
        ▼                         ▼                        ▼                          ▼
 Supabase Postgres (EU)     Supabase Storage (EU)     Job queue (pg-boss on the       Third parties
 + Auth + RLS               product images,           same Postgres; Redis/BullMQ     Stripe, Mollie, Resend,
 + order_events table       delivery photos           only if 08 chooses Railway)    Trustpilot, WhatsApp,
                                                                                     exchange-rate feed
```

One deployable web app, one database, one object store, one queue. No microservices. Every later system (vendor portal, CRM sync, automations) is a new route group or a new queue consumer inside the same repo until scale forces a split.

**Recommendation:** a modular monolith in one Next.js repo with a domain-layered `src/` and a Postgres-backed job queue.
**Rationale:** a solo founder cannot operate distributed services; a monolith with clean module boundaries splits later without a rewrite.

## 2. Stack

| Layer | Choice | Alternative considered | Why this |
|---|---|---|---|
| Framework | Next.js 15+ App Router, TypeScript strict, React Server Components | Astro (static-first), Remix | Founder fluency; SSG/ISR/SSR per route; RSC keeps client JS small for CWV; one framework for marketing site, checkout, admin, portal. |
| Styling | Tailwind CSS + a small design-token layer (CSS custom properties incl. logical properties for RTL) | CSS Modules | Fast to build; logical properties (`margin-inline-start`) make RTL a token flip, not a rewrite. |
| Database | Supabase Postgres, **EU (Frankfurt)** project | Neon, Railway Postgres | Bundles Auth, Storage, RLS, realtime; EU residency; free tier → $25 Pro; generated types via `supabase gen types`. |
| ORM / query | Drizzle ORM over `postgres` driver, migrations by Drizzle Kit; Supabase client only for Auth/Storage | Prisma, raw SQL | Type-safe SQL, migrations as versioned SQL files, no engine binary, works on any host. RLS policies live in migrations. |
| Auth | Supabase Auth (email magic link + OAuth later), roles in `app_metadata`, org scoping via `vendor_memberships` | Auth.js, Clerk | Already in the database; RLS reads JWT claims; customers stay guest by default. |
| Validation | zod at every boundary; generated DB types + zod schemas derived where possible | valibot | Required by engineering standards; one library. |
| Payments | Stripe (Payment Element, Payment Intents, Radar) behind a `PaymentProvider` interface; Mollie adapter as second implementation | — | ADR-0005; adapter pattern so a rejection or a market-specific method does not stall launch. |
| Object storage | Supabase Storage (EU) with signed URLs; image transforms via Next `<Image>` loader | Cloudflare R2 | Same vendor, same region, same DPA. R2 is the fallback if egress cost bites (see 08). |
| Queue / cron | **pg-boss** (Postgres-backed queue with retries, scheduling, cron) run by a worker process or by a cron-triggered internal route | BullMQ + Redis | No Redis to pay for or babysit at our scale; exactly-once-ish semantics via Postgres; swap to BullMQ only if 08 picks Railway and throughput demands it. |
| Email | Transactional provider chosen in `11` (Resend leading); React Email templates, localised via the same message catalog as the site | — | Templates are code, typed and testable. |
| i18n | `next-intl` with locale segment routing, ICU messages, per-locale JSON catalogs with `reviewed` metadata | i18next, Lingui | Native App Router support, server-side formatting (dates, numbers, currency), typed message keys. |
| Search / filters | Postgres full-text + faceted queries; no external search at launch | Algolia, Meilisearch | Catalogue is small; facets are URL-driven and mostly `noindex` (see 02). |
| Analytics | GA4 via gtag with Consent Mode v2; server-side purchase event from the Stripe webhook | — | Conversion truth comes from the webhook, not the browser. |
| Errors / logs | Sentry (free tier) + structured JSON logs with `request_id` and `order_id` | — | Required by standards; alert rules in 08. |
| Testing | Vitest (unit/integration), Playwright (e2e, visual), MSW for third-party mocks, Stripe CLI for webhook contract tests | Jest | Defined per layer in `12`. |

**Recommendation:** the table above, with Drizzle rather than the Supabase JS client for data access.
**Rationale:** Drizzle keeps the data layer portable to plain Postgres if we ever leave Supabase (fallback in 08); Supabase client is used only where Supabase is irreplaceable (Auth, Storage).

## 3. Rendering strategy per page type

Rule: **every indexable page is HTML at the edge**. Personalisation (currency, suggestion banner, cart count) is a client island hydrated after paint, never a reason to SSR an indexable page.

| Page type | Strategy | Revalidation | Cache key | Why |
|---|---|---|---|---|
| Home `/{locale}/` | ISR | 1 h + on-demand tag `home:{locale}` | locale | Content changes daily at most; must be instant for LCP. |
| Corridor `/{locale}/send-flowers-to/{country}[/{city}]` | ISR | 24 h + on-demand when country status, cutoff, florist count or prices change | locale × country × city | Thousands of URLs across locales; build-time SSG of all would be slow; ISR generates on first hit and caches at the edge. |
| Occasion `/{locale}/{occasion}` and occasion × country | ISR | 24 h + on-demand; calendar-driven copy switches via data, not rebuilds | locale × occasion × country | Same as corridor. |
| Category / collection | ISR | 1 h + on-demand tag `catalog:{country}` | locale × country × category | Prices and availability change with country status. |
| Product `/{locale}/flowers/{slug}` | ISR | 1 h + on-demand tag `product:{id}` | locale × country (via cookie? **no**, via URL, see 02) | Price/currency must be in the HTML for Offer schema, so country is part of the URL for indexable product pages. |
| Blog / guides | SSG at build (MDX in repo) with ISR fallback for CMS-sourced posts | on publish | locale | Content is static; fastest possible. |
| Legal, about, how-it-works, for-florists | SSG | on deploy | locale | Rarely change. |
| Search results, faceted filters | SSR, `noindex` | — | — | Infinite combinations; never indexed. |
| Cart, checkout, order confirmation | SSR `no-store`, `noindex` | — | — | Personal, dynamic, PCI-adjacent. |
| Track order `/{locale}/track/{token}` | SSR `no-store`, `noindex` | — | — | Per-order. |
| Account, admin, vendor portal | SSR `no-store`, auth-gated, `noindex` | — | — | Private. |
| `sitemap.xml` index + children | Route handlers, cached 1 h, regenerated by cron | 1 h | locale × type | See 02 §9. |
| `robots.txt` | Static | — | — | Blocks `/api/`, `/admin/`, `/checkout/`, `/search`, query-parameter facets. |

Implementation notes:
- ISR is realised with `revalidate` + `revalidateTag()` on Vercel, and with Cloudflare cache rules + purge-by-tag API when fronting Railway. The application calls one internal `invalidate(tags[])` function; the adapter differs per host. This is the single most important portability seam.
- `generateStaticParams` prebuilds only the **live** country corridors and the top 50 products per live locale, so builds stay under 3 minutes as the catalogue grows. Everything else is generated on demand.
- Country status `demo` pages render with `<meta name="robots" content="noindex,follow">` and are excluded from sitemaps (ADR-0007). Flipping to `live` triggers `invalidate(['country:PL'])` and sitemap regeneration.

**Recommendation:** ISR for all programmatic money pages, SSG for editorial and legal, SSR no-store for transactional and private routes.
**Rationale:** ISR gives edge-served HTML for tens of thousands of URLs without build-time cost, and on-demand invalidation keeps prices and cutoffs accurate within seconds.

## 4. Domain model

Design constraints: `fulfillment_partner` is first-class from day one; `customer` ≠ `recipient` ≠ `order`; a country is `demo | live | disabled`; every order transition appends an event; all money is stored as integer minor units with an explicit currency; every price shown to a buyer is reproducible from stored data.

### 4.1 Entity map

```
country ──< country_locale_content        locale ──< message_catalog (JSON, versioned, reviewed flag)
   │ status: demo|live|disabled
   │ currency, vat_rate, cutoff_local_time, holidays ──< country_holiday
   │ occasion dates ──< occasion_country (occasion × country → date rule, indexable flag)
   │
   ├──< region ──< city (slug per locale) ──< postcode_zone
   │
   ├──< fulfillment_partner (florist business; status demo|onboarding|active|paused|offboarded)
   │        ├──< partner_member (auth user ↔ partner, role owner|staff)
   │        ├──< partner_coverage (postcode_zone or city, capacity/day, blackout dates)
   │        ├──< partner_catalog_mapping (product ↔ partner: can_fulfil, partner_payout_minor, currency)
   │        └──< payout ──< payout_line
   │
   └──< country_price (product × country → retail_minor, currency, vat_rate, active_from)

product ──< product_translation (locale: name, description, slug, seo fields)
   ├──< product_media (asset, alt per locale, sort, is_primary)
   ├──< product_category (m:n) → category ──< category_translation
   ├──< product_occasion (m:n) → occasion ──< occasion_translation
   └──< product_addon_option → addon (chocolates, vase, balloons, plush, wine, card) ──< addon_country_price

customer (buyer; may be guest) ──< address (billing)
recipient (person receiving; belongs to a customer; consent/notification prefs) ──< recipient_address
order
   ├─ customer_id, recipient_id, destination_country_id, city/postcode, delivery_date, delivery_window
   ├─ buyer_currency, buyer_total_minor, fx_rate_snapshot, base_currency_total_minor, vat_breakdown (jsonb)
   ├─ status (derived from latest event; denormalised for queries)
   ├──< order_line (product/addon, qty, unit_retail_minor, partner_payout_minor)
   ├──< order_event (append-only: type, from_status, to_status, actor, payload jsonb, occurred_at)
   ├──< payment (provider, provider_ref, status, amount, method, 3ds outcome, risk_score)
   ├──< refund
   ├──< order_assignment (partner_id, offered_at, responded_at, response accept|decline|timeout, reason)
   ├──< substitution_note
   ├──< delivery_proof (photo asset, uploaded_by, uploaded_at, approved)
   └──< review (source trustpilot|internal, rating, text, verified_order=true, moderation_status)

outbox (event → webhook/email/CRM deliveries with retries)     audit_log (admin actions)
fx_rate (base EUR → currency, date, source)                    feature_flag (key, scope: global|country|locale|payment_method)
```

### 4.2 The order state machine (summary; full definition in `11`)

```
placed → paid → routed → accepted → in_production → out_for_delivery → delivered → photo_uploaded → closed
                 │          │
                 │          └─ declined → routed (re-offer) → … | manual_reroute | cancelled_refunded
                 └─ no_partner_available → manual_reroute | cancelled_refunded
paid → payment_failed (terminal) ; any post-paid → refund_requested → refunded_partial | refunded_full
delivered → disputed → resolved | chargeback_lost
accepted/in_production → substitution_proposed → substitution_accepted | substitution_rejected
```

Transitions are executed only by `orderService.transition(orderId, event, actor, payload)`, which validates the guard, writes `order_event` and updates the denormalised `status` in the same transaction, and enqueues outbox rows. Direct `UPDATE orders SET status` is forbidden and flagged in review.

### 4.3 Multi-currency and pricing

- Base list price authored in EUR per product; `country_price` overrides per destination country (e.g. PL retail in PLN, DE in EUR, CH in CHF).
- **Display currency** for the buyer defaults from locale/country hints, is switchable, and is persisted. If display currency ≠ destination country currency, the shown price = `country_price × fx_rate(day)` rounded to a psychological price (x.99 / x.90 by currency), and the **charged** amount is exactly the displayed amount (Stripe multi-currency presentment). The FX snapshot is stored on the order.
- Florist payout = `partner_catalog_mapping.partner_payout_minor` in the florist's currency, fixed at order time.
- VAT is included in every displayed price (EU/UK price-display rule); the breakdown is computed at order time from `country.vat_rate` and stored as jsonb for invoicing. Who invoices whom is decided in `06` with an accountant; the data model supports both "we are the seller" and "partner is the seller, we are the agent" without schema change (a `supply_model` column on `order`).

### 4.4 Locale, country, currency are three fields

`ui_locale` (from URL), `destination_country` (from URL on indexable pages, from selection in the funnel), `display_currency` (cookie, defaults by rules in 03). They are never inferred from IP for bots and never cause redirects (ADR-0006).

**Recommendation:** the schema above, implemented as Drizzle migrations from Phase 0, with `demo` seed rows for six countries and three to five demo partners per country.
**Rationale:** seed → real is a data flip (partner `demo → active`, country `demo → live`); no template or code changes.

## 5. Module boundaries (`src/`)

```
src/
  app/                      routes only; thin. [locale] segment; route groups (marketing) (shop) (checkout) (account) (admin) (vendor) api/
  modules/
    catalog/                products, categories, occasions, pricing, translations
    geo/                    countries, cities, postcodes, holidays, cutoffs, occasion calendar
    orders/                 state machine, order service, assignment/routing rules
    payments/               PaymentProvider interface; stripe/, mollie/ adapters; webhooks
    partners/               fulfillment partners, coverage, payouts
    customers/              customers, recipients, consent
    notifications/          email + whatsapp senders, templates, outbox consumer
    seo/                    hreflang, canonical, JSON-LD builders, sitemap generators, robots
    i18n/                   locale config, message loading, formatters
    analytics/              GA4 event schema, consent state, server-side events
    admin/                  admin queries and actions
  lib/                      db client, env (zod-validated), logger, request-id, cache adapter (invalidate)
  jobs/                     pg-boss job definitions and cron schedule
  emails/                   React Email templates (localised)
  config/                   locales.ts, countries.ts, payment-methods-by-country.ts, feature-flags.ts
tests/                      unit/ integration/ e2e/ contract/ visual/
supabase/migrations/        versioned SQL (generated by Drizzle Kit), each with a documented rollback
seed/                       idempotent seed scripts (demo catalogue, demo partners, occasion calendars)
```

Rules: `app/` imports from `modules/`, never the reverse; `modules/*` do not import each other's internals, only public `index.ts`; third-party SDKs are wrapped in one adapter per module; all env access goes through `lib/env.ts`.

**Recommendation:** modular monolith with these boundaries enforced by ESLint `import/no-restricted-paths`.
**Rationale:** the vendor portal and CRM sync arrive as new consumers of `orders` and `partners` public APIs, not as edits to them.

## 6. Image pipeline

Product imagery is the conversion lever and the LCP element on PDP and category pages.

| Concern | Decision |
|---|---|
| Source | Originals uploaded to Supabase Storage (EU) at ≥2000 px; AI-generated per the style guide in `10`. |
| Formats | AVIF with WebP fallback, generated by the host's image optimiser (`next/image` on Vercel; Cloudflare Images/Polish or a self-hosted `sharp` route when on Railway). |
| Responsive | `sizes` per slot (hero 100vw, grid 50vw/33vw/25vw, thumb 96px); widths 384–1920. |
| LCP | Primary product image `priority` + `<link rel="preload" as="image" imagesrcset imagesizes>`; hero on home likewise. One LCP candidate per page, nothing else eager above it. |
| Below fold | `loading="lazy"`, `decoding="async"`, fixed aspect-ratio boxes to prevent CLS. |
| Alt text | Stored per locale in `product_media`; never auto-generated at render. |
| Delivery photos | Uploaded by florist (Phase 1 via WhatsApp/email, Phase 2 via portal), stripped of EXIF/GPS, stored private, served via signed URL on the tracking page and emails; never indexed. |
| Budget | ≤ 200 KB images above the fold on PDP mobile; enforced by Lighthouse CI budgets. |

**Recommendation:** host-native optimisation with an adapter so the `<Image>` loader can switch between Vercel, Cloudflare and self-hosted `sharp`.
**Rationale:** image optimisation cost is the most likely bill spike (08); the loader adapter keeps the exit cheap.

## 7. Performance budgets (mobile, 4G, EU edge)

| Metric | Budget | Enforced where |
|---|---|---|
| LCP | < 2.0 s | Lighthouse CI on PDP + corridor + home, per locale sampled |
| INP | < 200 ms | Lighthouse CI + RUM (web-vitals → GA4) |
| CLS | < 0.05 | Lighthouse CI |
| TTFB (cached HTML) | < 200 ms from FRA/AMS/LHR/ARN/WAW | Synthetic checks in 08 |
| JS shipped to indexable pages | ≤ 120 KB gzipped, no client-side data fetching for indexable content | bundle budget in CI |
| Fonts | 1 variable font, `font-display: swap`, subset per script (Latin, Latin-Ext for pl/ro/tr, Cyrillic later, Arabic later) | build step |
| Third-party scripts | GA4 only; Trustpilot widget lazy-loaded on interaction/viewport; no chat widget at launch | reviewer checklist |

**Recommendation:** budgets as CI gates from the first PR.
**Rationale:** CWV is a ranking input and the cheapest to protect from day one.

## 8. Background jobs and scheduling

| Job | Trigger | Notes |
|---|---|---|
| `order.route` | on `paid` | picks partner by coverage → capacity → rating → payout; creates `order_assignment`; sends offer |
| `assignment.timeout` | scheduled at offer + SLA (60 min day / next-morning night) | re-offer to next partner or raise `no_partner_available` alert |
| `notification.deliver` | outbox rows | email/WhatsApp with retries and dead-letter |
| `fx.refresh` | daily 06:00 CET | ECB reference rates; stores `fx_rate` |
| `sitemap.regenerate` | hourly + on country flip | writes sitemap files to storage or cache |
| `occasion.reminders` | daily | Phase 3; reads `occasion_country` calendar |
| `review.request` | delivered + 24 h | Trustpilot invitation link |
| `payout.accrue` | on `closed` | adds `payout_line`; weekly batch export for Wise |

All jobs are idempotent (keyed by order id + job name) and observable (job row + log line with `request_id`).

**Recommendation:** pg-boss in a single worker process (or invoked by a minute-cron internal route where a long-lived worker is not available).
**Rationale:** one fewer managed service; Postgres is already the source of truth.

## 9. Security and boundaries

- Webhooks: verify signatures (Stripe, Mollie), store raw payload + `event_id` in `webhook_inbox` before processing, process idempotently, respond 2xx fast, work in a job.
- RLS on every table with user data; admin bypass via service role only in server code; vendor rows filtered by `partner_id` from JWT.
- PII minimisation: recipient phone and address are required for delivery but never exposed to the buyer UI after order; card data never touches our servers (Payment Element).
- Secrets only via host env store; `lib/env.ts` fails the build if any required variable is missing; `.env.example` is CI-checked against the zod schema.
- Rate limits on checkout, tracking and contact endpoints (host WAF or `@upstash/ratelimit` equivalent behind an interface).
- Content Security Policy with nonces for GA4 and payment iframes.

## 10. Environments

| Env | Data | Purpose |
|---|---|---|
| local | Supabase CLI local stack or a dev branch DB; seed script | development |
| preview (per PR) | shared `staging` DB seeded with demo data; Stripe test mode | reviewer + Playwright smoke |
| staging | own DB, production-like config, Stripe test mode, password-protected | launch checklist, demo for florists |
| production | EU DB, Stripe live, indexable | buyers |

Preview environments never point at production data. Detailed CI/CD in `08`.

## 11. Things that would force a rewrite if wrong (flagged)

| Risk | Mitigation built in |
|---|---|
| Country not in indexable product URL → price/currency cannot be in HTML → weak Offer schema and duplicate content across currencies | URL design in `02` puts destination country in indexable shop URLs |
| Status column without events | ADR-0009 |
| Host-specific ISR/image APIs called directly from modules | `lib/cache.ts` and image loader adapters |
| Supabase client used for data access everywhere | Drizzle for data; Supabase only for Auth/Storage |
| Hard-coded strings and LTR-only CSS | next-intl typed keys; logical CSS properties; reviewer checklist |
| Partner or country added by editing templates | All partner/country behaviour is data + feature flags |

**Recommendation:** accept this architecture as the baseline for specs `001`–`010`.
**Rationale:** it satisfies the SEO constraint (HTML at the edge for every indexable page), keeps fixed cost at one host plan plus one database, and leaves every later system as an additive consumer.
