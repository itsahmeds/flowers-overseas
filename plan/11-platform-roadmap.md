# 11 — Platform Roadmap: CRM, Vendor Portal, Messaging, Integrations

The website is the first system, not the only one. This document designs what Phase 1 must contain so that CRM, vendor portal, automation and ops tooling arrive later as additive consumers. Related: ADR-0009 (event-sourced orders), ADR-0010 (buy CRM, build portal), ADR-0013 (email provider, created here), `01` §4, `09`.

---

## 1. Identity and roles from day one

| Role | Who | Scope | Phase used |
|---|---|---|---|
| `customer` | buyer with an account (guest buyers have a `customer` row but no auth user) | own orders, recipients, preferences | 1 |
| `vendor` | florist staff | rows where `partner_id ∈ memberships`; sub-roles `owner` (payouts, staff, terms) and `staff` (orders, photos) | 2 (schema in 0) |
| `admin` | founder, later ops staff | everything; sub-roles later (`ops`, `finance`, `content`) | 0 |
| `system` | jobs, webhooks | service role; every write attributed with `actor = system:{job}` | 0 |

Mechanics: Supabase Auth user → `app_metadata.role` and `app_metadata.partner_ids[]` set by a server-side hook on membership change; RLS policies read JWT claims; admin routes double-check server-side. Vendor **org scoping**: `fulfillment_partner` is the org; `partner_member(user_id, partner_id, role)`; one person can belong to several partners (chains). Recipients never authenticate; they act via signed tokens (`/r/{code}`).

Auth flows: magic link (email) for customers and vendors; passkeys later; no passwords at launch (less support load, fewer breaches). Vendors in Phase 1 act through order-scoped magic links without an account; their accounts are created at portal launch and back-linked to their `partner_member` row.

## 2. Order state machine (canonical)

```
                                   ┌──────────────────────── payment_failed (terminal)
placed ──pay──▶ authorised ──route──▶ routed ──accept──▶ accepted ──capture──▶ paid ──start──▶ in_production
   │                 │                 │  └─decline/timeout─▶ routed (next partner) ── exhausted ─▶ no_partner_available ─▶ manual_reroute ─▶ routed
   │                 │                 │                                                          └─▶ cancelled (auth voided / auto-refund)
   │                 └─(immediate-charge methods)──▶ paid_unrouted ──route──▶ routed …                                            
   └─ abandoned (draft expiry)

in_production ──substitution_proposed──▶ awaiting_buyer (2 h, default approve) ──▶ in_production
in_production ──dispatch──▶ out_for_delivery ──deliver──▶ delivered ──photo──▶ photo_uploaded ──review_window(72 h)──▶ closed
out_for_delivery ──fail──▶ delivery_failed ──▶ redelivery_scheduled ──▶ out_for_delivery | cancelled_refunded
delivered/photo_uploaded/closed ──complaint──▶ disputed ──▶ resolved (refund_partial | refund_full | goodwill | rejected) ──▶ closed
any post-paid ──refund_request──▶ refunded_partial | refunded_full (non-terminal until closed)
disputed ──chargeback──▶ chargeback_open ──▶ chargeback_won | chargeback_lost (terminal)
```

Design rules:
- Buyer-visible status is a projection (`placed → confirmed → with your florist → being made → on its way → delivered`); the internal states above are richer.
- `capture` happens on **accept** (06 §2.2); for immediate-charge methods the flow enters `paid_unrouted` and an exhausted route triggers automatic refund.
- Each transition is a named command in `orderService` with a guard (`canTransition(from, event)`), executed in one DB transaction: update `orders.status`, insert `order_events(order_id, seq, type, from, to, actor, payload, occurred_at)`, insert `outbox(event_id, targets[])`.
- `order_events.seq` is monotonic per order; consumers are idempotent on `(order_id, seq)`.
- Timeouts (`assignment.timeout`, `awaiting_buyer` default) are scheduled jobs that emit transitions like any actor.
- Every event type has a versioned zod schema in `modules/orders/events.ts`; adding a field is additive; renaming requires a new version.

Event catalogue (initial): `order.placed`, `order.authorised`, `order.payment_failed`, `order.routed`, `assignment.offered`, `assignment.accepted`, `assignment.declined`, `assignment.timed_out`, `order.no_partner_available`, `order.captured`, `order.in_production`, `order.substitution_proposed`, `order.substitution_resolved`, `order.out_for_delivery`, `order.delivered`, `order.delivery_failed`, `order.photo_uploaded`, `order.closed`, `order.refund_requested`, `order.refunded`, `order.disputed`, `order.resolved`, `order.chargeback_*`, `customer.created`, `recipient.created`, `review.created`, `partner.status_changed`, `country.status_changed`.

**Recommendation:** this machine, implemented in `015`, with the outbox as the only integration point for every later system.
**Rationale:** CRM sync, portal notifications, analytics and automations all become subscribers; none needs a change to the machine.

## 3. Entities: customer, recipient, order are separate

| Entity | Identity | Why separate |
|---|---|---|
| `customer` | email (unique, lowercased); optional auth user | one buyer, many orders and recipients; CRM contact |
| `recipient` | `(customer_id, normalised full_name, normalised phone)`; optional link to a `customer` if they later buy | address book, occasion reminders ("Anna's birthday again next year"), recipient loop, GDPR retention rules distinct from the buyer |
| `order` | id + public token | snapshot of recipient address and message at order time (`order.recipient_snapshot`), so later edits to the address book do not rewrite history |

## 4. CRM: buy, don't build (ADR-0010)

### 4.1 Comparison

| | **HubSpot** (free → Starter) | Brevo (ex-Sendinblue) | Attio | Build on Supabase |
|---|---|---|---|---|
| Fit | Founder knows it; contacts, deals (not needed), marketing email, workflows (paid), forms; EU data hosting selectable at account creation | Marketing + transactional email, SMS/WhatsApp campaigns, CRM-lite, cheap automation; EU company | Modern, flexible objects, API-first, great for B2B (florist pipeline) | Full control; months of work |
| Cost at our scale | Free (1M contacts, limited email 2,000/mo) → Marketing Starter ~€15–20/mo; Professional (real automation) ~€800/mo is the trap | Free 300 emails/day → Starter ~€9/mo → Business ~€18+/mo with automation | Free → ~€30/seat/mo | dev time |
| Marketing automation | Weak on free; good on Professional (expensive) | Good and cheap (workflows, segments) | Basic | build |
| Transactional email | Not its job | Yes (SMTP/API) | No | via provider |
| B2C consumer marketing (occasion reminders, abandoned checkout) | Possible; expensive at scale | **Strong** | Weak | build |
| B2B florist pipeline (recruiting, onboarding stages) | Strong | Weak | **Strong** | build |
| Sync | Contacts + custom objects API, webhooks | Contacts + events API | Objects API, webhooks | n/a |
| Lock-in | Medium | Low | Low | none |

### 4.2 Recommendation

Two CRMs is one too many for a solo founder, so pick by the dominant job: **B2C lifecycle messaging by country calendar**. That is Brevo's sweet spot at a fraction of HubSpot Professional's price. HubSpot free remains the recommended **florist pipeline** tool (B2B deals, notes, tasks) because the founder already lives in it and the volume is tiny; that is a founder tool, not a system integration.

| Job | Tool | Phase |
|---|---|---|
| Florist recruiting pipeline | HubSpot free (manual, founder) | 0 |
| Customer records, segments, campaigns, occasion reminders, abandoned checkout, win-back | Brevo (Business tier when automation is needed) | 3 |
| Transactional email | Resend (§5) — not the CRM | 1 |

If the founder prefers a single tool, HubSpot Starter can do Phase 3's basic reminders; the sync layer below is identical either way.

### 4.3 Sync layer (built once, CRM-agnostic)

```
outbox consumer "crm-sync" → CRMAdapter interface { upsertContact, upsertRecipientRelation, recordEvent, updateConsent, upsertOrderSummary }
adapters: brevo/, hubspot/ (both thin)
```

| Direction | Data | When |
|---|---|---|
| **Us → CRM** | Contact: email, name, locale, buyer_country, display_currency, consent (marketing: bool, timestamp, source), lifetime orders, last order date, first/last destination country, occasions bought for (multi-select), recipients count, acquisition channel | on `customer.created`, `order.closed`, `consent.updated` |
| **Us → CRM** | Order summary as a custom object/event: order id, value, currency, destination, occasion, delivery date, status | on `order.captured`, `order.delivered`, `order.refunded` |
| **Us → CRM** | Recipient relation (name + next occasion dates) for reminder campaigns; **never** recipient contact details | on `order.closed` |
| **CRM → Us** | Unsubscribe / consent changes (webhook) → `customer.marketing_consent = false` | real time |
| **CRM → Us** | Nothing else. Orders, prices, recipients live only in our DB | — |

Adopting a CRM later is `CRM_PROVIDER=brevo` plus credentials; switching is a replay of the outbox into the new adapter (we keep events forever). No migration.

**Recommendation:** Brevo for B2C automation in Phase 3, HubSpot free as the founder's B2B pipeline notebook, one outbox-driven adapter.
**Rationale:** the automation we need is calendar-driven B2C messaging; paying HubSpot Professional prices for it is the classic small-company mistake, and the adapter makes the choice reversible.

## 5. Email and messaging

### 5.1 Provider (ADR-0013)

| | **Resend** | Postmark | Loops | Brevo (transactional) |
|---|---|---|---|---|
| Deliverability | Good; dedicated IP optional | Excellent (transactional-only reputation) | Good | Good |
| React Email templates, localisation in code | Native | Any HTML | Own editor | Own editor |
| EU data region | Yes (EU region selectable) | US only (EU DPA with SCCs) | US | EU |
| Webhooks (delivered, bounced, complained) | Yes | Yes | Yes | Yes |
| Cost | Free 3k/mo → $20 for 50k | $15 for 10k | $49+ | free 300/day → cheap |
| Marketing automation | Broadcasts only | No | Yes (its focus) | Yes |
| Fit for our templates-as-code rule | Best | Good | Poor | Poor |

**Decision:** Resend for transactional (templates as React Email components, localised through the same message catalog), EU region, webhooks into our inbox table; marketing automation lives in the CRM (Brevo) from Phase 3. Rationale: templates as typed code, EU residency, and the cheapest path that does not try to be a CRM.

### 5.2 Phase 1 transactional set (all locales; buyer messages in UI locale, vendor messages in partner language)

| # | Trigger | To | Channel | Content |
|---|---|---|---|---|
| T1 | `order.authorised`/`captured` | buyer | email (+WhatsApp opt-in) | confirmation, tracking link, recipient recap, pre-contract info, invoice PDF |
| T2 | `assignment.accepted` | buyer | email + WhatsApp | "your florist in Warsaw has your order" |
| T3 | `order.substitution_proposed` | buyer | email + WhatsApp | swap details, approve/decline link |
| T4 | `order.out_for_delivery` | buyer | WhatsApp/SMS (email fallback) | window |
| T5 | `order.photo_uploaded` | buyer | email + WhatsApp | the photo, one-tap rating |
| T6 | `order.photo_uploaded` + 24 h | buyer | email | review request (Trustpilot invitation link) |
| T7 | `assignment.offered` | vendor | WhatsApp + email | order card, accept/decline links, SLA |
| T8 | `assignment.offered` + 30 min unanswered | vendor | WhatsApp + SMS | reminder |
| T9 | `order.delivered` + 1 h without photo | vendor | WhatsApp | photo reminder |
| T10 | `order.no_partner_available`, webhook failures, SLA exhaustion | admin | WhatsApp + email | alert |
| T11 | `order.refunded` | buyer | email | refund confirmation |
| T12 | `order.delivery_failed` | buyer | WhatsApp + email | options |
| T13 | weekly | vendor | email | payout statement PDF |
| T14 | magic-link login | customer/vendor | email | link |
| T15 | privacy request | customer | email | verification + export link |

### 5.3 Later automation set (Phase 3, via CRM/Brevo, consent-based)

Occasion reminders per destination calendar (e.g. "Dzień Kobiet in Poland is in 10 days") · anniversary of last order to the same recipient · abandoned checkout (2 h, 24 h) · post-delivery cross-sell (add-on or plant for the recipient's home) · win-back at 6 and 11 months · recipient-to-sender nudge (only if the recipient consented on the landing page) · vendor performance digests (monthly: acceptance rate, on-time, rating, photo compliance) · NPS at 30 days.

Template rules: every template has a `key`, a locale variant, a plain-text part, an unsubscribe/preference link for anything non-transactional, and a Playwright visual snapshot per locale.

## 6. Vendor portal (Phase 2), sketched

| Capability | Phase 1 (no portal) | Phase 2 portal |
|---|---|---|
| Receive order | WhatsApp + email card | Inbox with badge; push via WhatsApp template |
| Accept / decline with reason | magic link | one tap; reasons (capacity, out of area, product unavailable, holiday) |
| Capacity & blackout dates | founder edits in admin from WhatsApp messages | self-serve calendar; per-day capacity; holiday closures |
| Substitution note | magic link form | inline with photo |
| Mark out for delivery / delivered | magic link | one tap; optional GPS-free timestamp |
| Delivery photo upload | magic link (camera) | in-app camera; quality hints; auto EXIF strip |
| Card printing | order PDF by email | print view with QR |
| Payout history & statements | weekly email | ledger, statements, expected next payout |
| Ratings & feedback | none | per-order buyer rating, trends |
| Staff management | none | invite staff, roles |
| Coverage editing | admin | self-serve postcodes/cities with map |
| Product availability toggles | WhatsApp to founder | per-product on/off ("no peonies this week") |
| Language | partner language via templates | full portal in en/pl/de + partner language later |

The portal is server-rendered pages under `/vendor` with RLS; mobile-first because florists work from phones. It consumes `order_events` for timelines and calls `orderService.transition` for every action.

## 7. Admin ops tooling (Phase 4 additions)

Analytics dashboards (orders by corridor, margin, acceptance rates, SLA), partner scorecards and automated pause rules, fraud tuning UI, bulk price updates per country with preview, occasion campaign calendar view, translation coverage dashboard, incident console (webhook replays, job retries), exports.

## 8. Integration surface

| Consumer | Plugs into | Mechanism | Phase |
|---|---|---|---|
| GA4 / Looker Studio | `purchase` and funnel events; first-party `analytics_events` table | gtag + server-side; SQL views | 1 |
| PowerBI / any BI | read-only Postgres role over reporting views (`rpt_orders`, `rpt_partners`, `rpt_corridors`) | direct DB connection or nightly Parquet export to R2 | 3 |
| Accounting (EE accountant's tool, e.g. Merit/Xero) | invoices, VAT breakdown by country, payouts | monthly CSV/UBL export from admin; later API | 1 |
| Payout system | `payout_line` → Wise batch (CSV → API) → Stripe Connect option | `PayoutProvider` interface | 1 → 2 |
| CRM | outbox → adapter | webhooks | 3 |
| WhatsApp Business Platform | notification sender interface (`Notifier`) | Cloud API | 2 |
| Trustpilot | invitation API after `photo_uploaded`; reviews import (read) for display of company score | API | 1 |
| Search Console / IndexNow | sitemap pings, URL submission on publish | API | 0 |
| Future marketplace/API partners | public read API for corridors/products (rate-limited) | REST, versioned | 4+ |

All integrations are adapters behind interfaces in their module; none writes to `orders` except through `orderService`.

## 9. Risks (flagged)

| Risk | Guard |
|---|---|
| Two CRMs (HubSpot for B2B, Brevo for B2C) confuse ownership | Written boundary: HubSpot is a founder notebook, never integrated; Brevo is the integrated system |
| CRM requiring synchronous checkout writes | Forbidden; outbox only |
| Vendor portal duplicating order logic | Portal calls `orderService`; reviewer checks |
| Template drift across locales | Templates as code with per-locale snapshots |
| WhatsApp template approval delays (Meta) | Submit templates in Phase 1 for Phase 2 use |

**Recommendation:** approve ADR-0013 (Resend) and the sync-layer contract in §4.3 as the interface every Phase 3 spec must implement against.
**Rationale:** with the state machine, entities and outbox in place, every later system is an adapter, which is the whole point of designing them now.
