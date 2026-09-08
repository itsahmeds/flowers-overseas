# 00 — Executive Summary & Decisions Log

**Project:** Flowers Overseas · `flowersoverseas.com`
**Status:** Planning complete for Phase 0 design; no application code yet.
**Owner:** Ahmed (founder). Technical co-founder role: Claude Code agents under the workflow in `12-dev-workflow.md`.
**Last updated:** 2026-09-05

---

## 1. What we are building (one paragraph)

An international flower and gift **relay** service for Europe. A buyer in one country orders for a recipient in another. We take payment, own the brand, the customer relationship and the quality promise, and route the order to a vetted local florist near the recipient, who hand-makes and delivers a comparable arrangement the same or next day. We ship nothing. The product is **trust plus routing**, so the website must look and behave like an established, regulated European retailer from day one, even while it runs on seed data.

## 2. The launch bet

| Dimension | Decision | Why |
|---|---|---|
| First corridor | **UK → Poland** | Largest single diaspora corridor in Europe; English UI is already the x-default; GBP buyers pay with cards, Apple/Google Pay and PayPal, so no local-method dependency on day one. |
| Locales at launch | **en, de, pl** (tiered; fr, es, it, nl, ro, tr, then sv in Phase 4) | Three locales cover the two largest corridors and the florist pitch without multiplying translation QA and hreflang surface before a single florist is signed. |
| Entity | **Estonian OÜ via e-Residency** | EU entity unlocks OSS, SEPA and Stripe/Mollie/Adyen; fully remote formation; Pakistan-resident director allowed. |
| Payments | **Stripe primary, Mollie fallback** | Stripe for multi-currency, 3DS2 and Radar; Mollie for iDEAL/Bancontact/Przelewy24/BLIK breadth when NL/BE/PL buyers arrive. |
| Stack | **Next.js App Router + Supabase Postgres (EU)**, edge-cached HTML | Founder knows it; SSG/ISR gives edge-served HTML for every indexable page. Hosting decision in `08`. |
| What Google sees in Phase 0 | **Only true pages indexed** (guides, occasion content, blog, `/for-florists/`, legal). Shop pages render but `noindex` until their country is `live`. | Indexing a fake shop risks a manual action and destroys the trust that is the product. |
| Buyer-facing positioning | **Single brand, seller of record; "your local florist" is a feature, not a secret** | Local means fresher, faster, no customs. Substitution and data-sharing disclosures are legally required and reassure rather than deter. |
| Acquisition in Phase 1 | **Community-led** (Polish diaspora groups, WhatsApp/Facebook, referral); SEO compounds behind it | A new domain will not rank for commercial queries inside 6–12 months. Architecture is built for SEO now because it is expensive to retrofit. |
| Budget | **~$20–40/month** pre-revenue | Allows one paid host plan plus managed Postgres; everything else on free tiers. |
| Dates | **Demo mid-Oct 2026 (committed). MVP Dec 2026 (stretch), mid-Jan 2027 (committed)** | Entity formation plus processor approval is 4–8 weeks and starts week 1; both peaks (Valentine's 14 Feb, Women's Day 8 Mar 2027) remain reachable. |

## 3. Priorities that settle every trade-off

1. **Organic ranking** across European Google markets: crawlability, indexability, Core Web Vitals, programmatic scale across locales.
2. **Conversion:** mobile-first checkout, local payment methods, heavy trust signalling.
3. **Compliance by design:** GDPR, EU and UK consumer law, geo-blocking, price display, accessibility.
4. **Operational simplicity** for a solo founder.
5. **Cost:** near-zero fixed cost until revenue.

When two priorities conflict, the higher one wins and the trade-off is recorded as an ADR.

## 4. Phase plan at a glance

| Phase | Goal | Exit criterion | Target |
|---|---|---|---|
| 0 Demo | Full-looking site on seed data, `/for-florists/` pitch, mock order flow, password-protected demo | 3 florists in Poland verbally committed | mid-Oct 2026 |
| 1 MVP | UK→PL live; en + pl locales; real Stripe payments; order routed by email + WhatsApp; one real paid order delivered with photo | 1 delivered order, 0 chargebacks, Lighthouse ≥95 mobile on PDP + corridor | Dec 2026 stretch / mid-Jan 2027 |
| 2 Vendor portal | Florists accept/decline, upload photos, see payouts in a portal | 100% of orders handled in-portal for 30 days | Q1 2027 |
| 3 CRM + automation | HubSpot (or Attio) sync, occasion-calendar campaigns, abandoned checkout, win-back | First repeat purchase attributed to a campaign | Q2 2027 |
| 4 Scale | More corridors, locales (fr/es/it/nl/ro/tr/sv), local payment methods, ops tooling | 5 live destination countries, 6 locales | H2 2027 |

Detail and acceptance criteria: `09-roadmap.md`.

## 5. Things that could hurt us (tracked, with owner)

| Risk | Where handled | Class |
|---|---|---|
| Indexing seed-data shop pages | `02`, `10` | Google manual action |
| IP-based redirects | `03`, `07` | Google + Geo-blocking Regulation |
| Machine-translated stubs indexed | `03` | Thin content / manual action |
| Cross-border gifting seen as high-risk by processors | `06` | Processor rejection |
| VAT place-of-supply for goods fulfilled in Poland by a Polish florist, sold by an Estonian entity to a UK buyer | `06`, `07` | Regulatory; accountant sign-off is a Phase 1 gate |
| UK consumer law (CRA 2015, CCRs 2013) applies to UK buyers in addition to EU CRD | `07` | Regulatory |
| Recipient personal data held without a contract with the recipient | `07` | GDPR |
| Fake or unverified reviews | `04`, `07` | Omnibus Directive |
| Order state machine not event-sourced from day one | `01`, `11` | Rewrite later |
| Dev workflow overhead for one person | `12` | Velocity |

## 6. Decisions log

Every architectural or business decision below has an ADR in `docs/adr/`. ADRs are immutable once accepted; new thinking supersedes rather than edits. The running log is `docs/decisions-log.md`.

| ADR | Decision | Status | Date |
|---|---|---|---|
| [ADR-0001](../docs/adr/ADR-0001-single-domain-locale-subfolders.md) | One `.com` domain with locale subfolders, not ccTLDs or subdomains | accepted | 2026-09-05 |
| [ADR-0002](../docs/adr/ADR-0002-first-corridor-uk-to-poland.md) | First live corridor is UK → Poland | accepted | 2026-09-05 |
| [ADR-0003](../docs/adr/ADR-0003-tiered-locale-rollout.md) | Tiered locale rollout: en, de, pl first | accepted | 2026-09-05 |
| [ADR-0004](../docs/adr/ADR-0004-estonian-ou-entity.md) | Operating entity is an Estonian OÜ via e-Residency | accepted | 2026-09-05 |
| [ADR-0005](../docs/adr/ADR-0005-stripe-primary-mollie-fallback.md) | Stripe primary processor, Mollie fallback | accepted | 2026-09-05 |
| [ADR-0006](../docs/adr/ADR-0006-no-ip-redirects.md) | No IP-based redirects; suggestion banner with persisted choice | accepted | 2026-09-05 |
| [ADR-0007](../docs/adr/ADR-0007-index-only-true-pages-in-demo.md) | Phase 0 indexes only true pages; shop pages `noindex` until country is `live` | accepted | 2026-09-05 |
| [ADR-0008](../docs/adr/ADR-0008-nextjs-supabase-stack.md) | Next.js App Router + Supabase Postgres (EU region) | superseded-by ADR-0015 (data layer only) | 2026-09-05 |
| [ADR-0009](../docs/adr/ADR-0009-event-sourced-order-lifecycle.md) | Order lifecycle as a state machine emitting events to a single `order_events` table | accepted | 2026-09-05 |
| [ADR-0010](../docs/adr/ADR-0010-buy-crm-build-vendor-portal.md) | Buy the CRM, build the vendor portal | accepted | 2026-09-05 |
| [ADR-0011](../docs/adr/ADR-0011-spec-driven-dev-os.md) | Spec-driven development OS with agents, task IDs and an edit guard | accepted | 2026-09-05 |
| [ADR-0012](../docs/adr/ADR-0012-hosting-vercel-supabase-railway-fallback.md) | Vercel + Supabase EU; Railway-behind-Cloudflare fallback | accepted | 2026-09-05 |
| [ADR-0013](../docs/adr/ADR-0013-resend-transactional-email.md) | Resend for transactional email (EU); marketing automation in the CRM | accepted | 2026-09-05 |
| [ADR-0014](../docs/adr/ADR-0014-ai-generated-seed-imagery.md) | AI-generated seed imagery under a locked style guide | accepted | 2026-09-05 |
| [ADR-0015](../docs/adr/ADR-0015-portable-postgres-neon-hetzner-r2-authjs.md) | Portable Postgres (Neon now, Hetzner later), Cloudflare R2 for images, Auth.js for identity; Supabase dropped | accepted | 2026-09-08 |
| [ADR-0016](../docs/adr/ADR-0016-csp-allowlist-hash-on-cached-html.md) | CSP on cached HTML: per-environment allowlist + inline-script hash; nonce + `'strict-dynamic'` reserved for `no-store` routes; Report-Only first | accepted | 2026-09-08 |

## 7. Document map

| Doc | Answers |
|---|---|
| `01-architecture.md` | Stack, rendering strategy per page type, data model |
| `02-seo-spec.md` | URL architecture, programmatic pages, technical SEO, per-market notes |
| `03-i18n-spec.md` | Locale, language, currency, geo handling, translation workflow |
| `04-ux-conversion-spec.md` | Page-by-page UX, checkout, trust, payments UX, analytics |
| `05-page-inventory.md` | Every page type, purpose, data, SEO target |
| `06-payments-and-ops.md` | Payment stack, entity, fraud, VAT, vendor routing, admin, peak days |
| `07-compliance.md` | GDPR, consumer rights (EU + UK), geo-blocking, price display, cookies, accessibility |
| `08-deployment.md` | Hosting comparison and recommendation, CI/CD, EU residency, monitoring |
| `09-roadmap.md` | Phased build order with acceptance criteria and dates |
| `10-seed-data-and-taxonomy.md` | Taxonomy, seed catalogue, imagery, seed→real swap, demo strategy |
| `11-platform-roadmap.md` | Identity/roles, order state machine, CRM, email, vendor portal, integrations |
| `12-dev-workflow.md` | Engineering standards, agents, skills, hooks, definition of done, worked example |
| `13-open-questions.md` | Everything still needing a founder decision, with deadline |

Research inputs: `docs/research/competitors-*.md`, `docs/research/abc-flowers-page-inventory.csv`.
