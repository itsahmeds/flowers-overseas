# 06 — Payments, Entity, Fraud, VAT and Operations

This document is written for a Pakistan-resident founder operating an Estonian OÜ (ADR-0004) that sells cross-border gifts fulfilled by third-party florists. Payments and VAT are the two areas where a wrong assumption is expensive, so every section separates **what we design for** from **what an accountant or lawyer must confirm**. Flags: 🧾 accountant, ⚖️ lawyer, 💳 processor risk.

---

## 1. Entity

| Criterion | **Estonian OÜ (e-Residency)** | UK Ltd | Irish Ltd | Dutch BV | US LLC (Stripe Atlas) |
|---|---|---|---|---|---|
| Founder eligibility (PK-resident, no EEA director) | Yes; e-Residency card required (apply online, collect at embassy/pick-up point; 3–8 weeks) | Yes | Needs EEA-resident director or ~€25k bond | Yes, but notary + Dutch bank | Yes |
| Processor access | Stripe (Estonia supported), Mollie (EU entities), Adyen (volume), PayPal Business | Stripe UK, Mollie (UK supported), PayPal | Stripe IE, Mollie | Stripe NL, Mollie (home), Adyen | Stripe US; Mollie no |
| Local payment methods | All EU methods via Stripe/Mollie | Most; some EU methods restricted for non-EU entities | All | All | Poor (US-centric) |
| SEPA / EUR banking | Wise Business, Revolut Business (EE), Paysera; LHV possible later with substance | Wise/Revolut (EUR account) | Irish banks or fintech | Dutch banks (hard remotely) | US banks; EUR via Wise |
| VAT / OSS | EU entity → OSS Union scheme available; EE VAT registration threshold €40k domestic | Non-EU: OSS non-Union scheme for services only; goods rules differ | EU | EU | Non-EU |
| Formation cost | €265 state fee + €100–200 service provider; e-Residency €100–150 | ~£50–100 | ~€300 + director/bond issue | €2–5k | $500 + $100/yr |
| Running cost / year | Address + contact person €200–400; accounting €600–1,500 | Registered office ~£100; accounting £600–1,200 | €1,500+ | €2,000+ | $300 + state fees |
| Corporate tax | 0% on retained profit; 22% (from 2025) on distributions | 19–25% | 12.5% | 19–25.8% | pass-through |
| Consumer law regime for our buyers | EU CRD for EU buyers; **UK law still applies to UK buyers** (07) | UK law; EU law still applies when selling to EU consumers | EU | EU | both apply anyway |
| Tax residency risk 🧾 | Company managed from Pakistan may create a permanent establishment / tax residency question in Pakistan; needs a Pakistani and an Estonian accountant's view | Same | Same | Same | Same |
| Substance for banks 💳 | Fintech banking fine; traditional banks want ties | — | — | — | — |

**Recommendation:** Estonian OÜ (decided, ADR-0004). Week-1 tasks: e-Residency application; choose a service provider (registered address + contact person is mandatory for non-resident boards); open Wise Business and Revolut Business as soon as the registry code exists; appoint an Estonian accountant with e-commerce/OSS experience 🧾; ask them and a Pakistani tax adviser about management-and-control residency before the first sale 🧾.
**Rationale:** it is the only option that is simultaneously remote-formable, EU-native for VAT and payments, and cheap to run.

## 2. Payment stack

### 2.1 Processor comparison for a cross-border gifting merchant

| Criterion | **Stripe** | **Mollie** | Adyen | PayPal (standalone) | Checkout.com |
|---|---|---|---|---|---|
| Onboarding for a new OÜ with no history 💳 | Instant sandbox; live review 1–7 days; flowers are not prohibited, "gifting/relay" is medium risk (recipient ≠ cardholder); may request business docs, refund policy, T&Cs | Onboarding review days–2 weeks; tolerant of small EU merchants; asks for website + KYC | Enterprise; minimum volumes | Instant | Enterprise |
| Multi-currency presentment & settlement | Presentment in 135+ currencies; settlement in EUR (or per-currency balances) | Presentment limited per method; EUR settlement | Strong | Strong | Strong |
| Local methods (our list) | Cards, Apple/Google Pay, PayPal, Klarna (incl. former Sofort), iDEAL, Bancontact, P24, BLIK, SEPA DD, Swish, Twint, Link | Cards, Apple/Google Pay, PayPal, Klarna, iDEAL, Bancontact, P24, BLIK, Bizum, Vipps/MobilePay, Twint, SEPA DD, Satispay | All | PayPal only + cards via Braintree | Most |
| 3DS2 / SCA | Built-in, dynamic exemptions (TRA, low value) | Built-in | Built-in | Built-in | Built-in |
| Fraud tooling | Radar (rules, ML, custom rules on metadata like recipient_country) | Basic | RevenueProtect | Seller protection | Fraud Detection Pro |
| Payout to us | T+7 initially for new accounts; rolling reserve possible for higher-risk 💳 | Daily/weekly | Custom | Instant to balance | Custom |
| Fees (EEA cards) | 1.5% + €0.25 EEA; 2.5% + €0.25 UK cards from EE entity; 3.25% non-EEA; +1% currency conversion if settling in another currency; local methods vary (iDEAL €0.29, BLIK ~1.4%) | 1.8% + €0.25 EEA cards; local methods flat fees (iDEAL €0.29, Bancontact €0.39, BLIK 1.6% + €0.10 approx.) | negotiated | 2.99% + €0.35 approx. | negotiated |
| Connect / marketplace payouts to florists | Stripe Connect (Express) available for EE platforms; florists onboard to Stripe | Mollie Connect (limited) | Adyen for Platforms | Payouts API | — |
| Developer experience | Best | Good | Complex | Poor | Good |

**Recommendation:** Stripe primary, Mollie fallback (ADR-0005). Apply to both in week 1 with identical business documentation (website with real legal pages, refund/substitution policy, describe the relay model transparently as "we take the order; a local partner florist fulfils it; we are the seller of record"). Do **not** describe the business as a marketplace at onboarding unless the VAT model in §4 lands on the agent model, in which case describe it consistently to both processors 💳.
**Rationale:** Stripe wins on presentment, Radar and Connect; Mollie wins on onboarding tolerance and Nordic/Iberian methods. Behind one `PaymentProvider` interface either can carry launch.

### 2.2 Application-side payment design

- **Payment Intents** with automatic payment methods filtered by our buyer-country config (04 §10); **manual capture**: authorise at order, capture when a partner **accepts** (or within 7 days at most; card auths expire). If no partner accepts, cancel the authorisation: the buyer is never charged for an undeliverable order. For methods that do not support auth/capture (BLIK, P24, iDEAL, Klarna, Vipps), charge immediately and refund automatically on `no_partner_available`.
- **Charge exactly the displayed amount in the displayed currency.** FX policy: prices are set per destination in local currency; display in buyer currency uses the daily ECB rate + a **2.5% FX buffer**, rounded to psychological endings; the rate snapshot is stored on the order. We settle in EUR (Stripe) and eat conversion cost inside the buffer 🧾 (settlement currency choice affects accounting; confirm).
- **SCA / 3DS2**: always request 3DS on first-time cards and orders > €150 (`request_three_d_secure: 'any'` via Radar rule); rely on TRA exemptions for low-value repeat customers. Liability shift for authenticated transactions is the primary chargeback defence.
- **Idempotency** keys on every create/capture/refund; webhook inbox table before processing (01 §9).
- **Receipts and invoices**: our own PDF invoice per order (07 §5 requirements), not Stripe's receipt.
- **Refunds**: full and partial from admin; reason codes; partial refund suggested amounts (add-on missing = add-on price; late delivery = delivery fee + 20%; substitution complaint = 30%); automatic full refund on cancellation before acceptance.
- **Rolling reserve expectation 💳**: plan cash flow assuming Stripe may impose 5–10% held for 90 days in the first months, and T+7 payouts. Florist payouts (weekly) must be fundable from Wise balance independent of Stripe payout timing; keep a €3–5k float.

### 2.3 Fraud rules (Radar custom rules + our own pre-checks)

| Signal | Rule |
|---|---|
| Recipient country ≠ card country | Expected in our model; **do not block**. Instead: require 3DS; block only if card country is high-risk list and destination is high-risk. |
| First-time card + order value > €120 | Force 3DS; review queue if 3DS unavailable |
| Disposable/temporary email domain | Block (maintained list) |
| Multiple cards on one email/IP within 24 h | Block after 3 attempts |
| Order value > €300 | Manual review before routing (admin approves) |
| Mismatch buyer country (self-declared) vs IP country vs card country, all three different | Force 3DS + review |
| Card message contains payment/crypto/"send money" patterns | Review (gift-card-style scams) |
| Same recipient address, many different buyers in a week | Review (mule/test pattern) |
| Velocity: > 5 orders/hour site-wide from new emails outside peak days | Alert + tighten |
| Chargeback received | Auto-block card fingerprint + email; add evidence pack (delivery photo, recipient acceptance, 3DS result, order timeline) |

Chargeback targets: < 0.3% by count. Our best evidence is the delivery photo with timestamp and the florist's acceptance record, so those are stored immutably per order.

## 3. Money flow

```
Buyer pays £45 (GBP) → Stripe → EUR balance (net of fees, buffer covers FX)
                                  → Stripe payout T+7 → Wise Business EUR
Florist payout: 149 PLN fixed for this order (from partner_catalog_mapping) → weekly batch via Wise (PLN) 
   (Phase 2 option: Stripe Connect transfers if florists are onboarded to Stripe Express)
Retail €52 equiv. − VAT (model-dependent) − processor ~€1.10 − florist €35 (149 PLN) − FX/payout fees ~€0.60 = gross margin ≈ €12–15 (23–29%)
```

Target unit economics at €35–90 retail: florist payout 55–65% of net-of-VAT retail; processor + FX + payout 3–4%; contribution 25–35% before marketing. Add-ons carry higher margin (60%+) and are the lever.

## 4. VAT and invoicing 🧾 (design intent, not advice)

Two legally different ways to run a relay; the data model supports both via `order.supply_model`.

| | **Model A — Principal (we sell the flowers)** | **Model B — Agent/intermediary (florist sells the flowers; we sell arrangement services)** |
|---|---|---|
| Who supplies the flowers to the consumer | Flowers Overseas OÜ | The Polish florist |
| Place of supply of the flowers | Poland (goods do not cross a border: made and delivered in PL) → **Polish VAT (8% flowers) on a domestic supply** | Poland; florist accounts for PL VAT on their sale |
| Our VAT registrations needed | **Polish VAT registration** (no threshold for non-established businesses) and, as we add countries, one registration per destination. OSS does **not** cover domestic supplies in the country where goods are located. | Our supply to the consumer is a B2C intermediary/service fee → place of supply rules for intermediary services follow the underlying transaction (Poland), which may still require PL registration **or** may fall under OSS if characterised as an electronically supplied/ordinary service; commission charged to the florist is B2B → reverse charge, no registration. This characterisation is the key question. |
| Who invoices the consumer | We do (full amount) | Florist (flowers) + we (service fee), or we issue a single document "on behalf of" the florist — must be lawful in each destination |
| Invoice requirements | Per destination country rules (PL: NIP, sequential numbers, PLN amounts) | Split invoicing complexity; florists' capability varies |
| Consumer protection / seller of record ⚖️ | Clean: we are the seller, matches our brand promise and processor description | We are an intermediary; must be disclosed; refunds and liability contractually pushed to florists |
| Operational simplicity | Simple for buyer, heavy VAT compliance for us (a registration per country) | Light VAT, heavy contractual and invoicing complexity, weaker brand control |
| Incumbent practice | Many national relay networks act as agents ("we transmit your order"); FloraQueen and GBO act as principals | |

**Recommendation (design intent):** design for **Model A (principal)** because it matches the brand promise, the processor description and the consumer-law position of being seller of record, and accept per-destination VAT registration as a cost of entering each country (PL first; VAT registration fee is small, filing via the accountant ~€50–100/month/country). Keep `supply_model` so the accountant can switch us to Model B if the numbers or the law favour it. **UK buyers:** in Model A the supply is still in Poland; UK VAT should not apply to the flowers, but the accountant must confirm whether any UK-facing service element or the OSS non-Union position is triggered 🧾.
**Rationale:** VAT registrations are a known, bounded cost; a mischaracterised agent model is an unbounded one.

Must-confirm list for the accountant before the first paid order 🧾: (1) principal vs agent characterisation; (2) PL VAT registration for a non-established EU company, filing cadence, fiscal representative not required for EU entities; (3) invoice content and language for PL consumers; (4) treatment of add-ons (chocolates 23% vs flowers 8% in PL: mixed-rate invoices); (5) EE VAT registration timing (€40k threshold) and OSS registration for any B2C services; (6) UK position for UK buyers; (7) settlement currency and FX gains/losses accounting; (8) florist payouts: self-billing invoices vs florist invoices to us; (9) Pakistan management-and-control question.

## 5. Vendor (florist) operations

### 5.1 Onboarding

| Step | Phase 1 (manual) | Phase 2 (portal) |
|---|---|---|
| Sourcing | Google Maps + Instagram scouting of independent florists in the target city; warm intro via Polish contacts; `/for-florists` applications | inbound from `/for-florists`, referrals from existing partners |
| Vetting | Video call; portfolio review; 3 test bouquets photographed; check business registration (NIP/KRS or CEIDG), reviews ≥4.5, capacity, delivery radius, weekend/holiday availability | Same + self-serve document upload |
| Agreement | Partner terms (⚖️ template: payout, quality, photo obligation, substitution rules, SLA, data protection clauses as processor of recipient data, termination) e-signed | Same in-portal |
| Setup | Admin creates `fulfillment_partner`, coverage zones (postcodes/cities), capacity per day, blackout dates, catalogue mapping with payout per product, payout details (bank/Wise), notification channel | Partner self-manages coverage, capacity, blackouts |
| Status | `onboarding` → `active` after first successful test order | same |

Target for PL launch: 3 partners in Warsaw + 1 each in Kraków, Wrocław, Gdańsk, Poznań (coverage of ~40% of PL population and most diaspora recipients). Everything else routed manually or declined at checkout ("we don't deliver to this postcode yet: notify me").

### 5.2 Routing rules (`order.route` job)

1. Candidates = active partners whose coverage includes the recipient postcode/city and who can fulfil the product (catalogue mapping) and have capacity on the delivery date and no blackout.
2. Rank by: (a) rating (rolling 90-day), (b) acceptance rate, (c) lowest payout for this product (tie-breaker only within 5% of the best rating), (d) round-robin fairness.
3. Offer to the top candidate with an SLA: **60 minutes** 08:00–20:00 local; orders placed at night are offered at 07:30 with SLA to 09:00. Same-day orders: 30 minutes.
4. On decline/timeout: next candidate; after all candidates → `no_partner_available` → admin alert (WhatsApp + email) → manual reroute (call a florist) or cancel + auto-refund with an apology voucher.
5. Peak days: capacity caps are enforced strictly; when city capacity is exhausted, the date is greyed out on the PDP for that city in real time (cache tag `capacity:{city}:{date}`).

### 5.3 Notification channel

| Channel | Penetration among florists | Phase 1 | Phase 2 |
|---|---|---|---|
| WhatsApp | Very high in ES, IT, NL, DE, TR; high in PL among SMEs (Messenger also strong); lower in Nordics/FR (SMS/iMessage/email) | WhatsApp Business **app** on a company number; order card sent as text + PDF + magic links (`/v/{token}` accept/decline/upload) | WhatsApp Business **Platform (Cloud API)** via Meta directly or 360dialog/Twilio; templated messages; requires Meta Business Verification of the OÜ (start in Phase 1) |
| Email | Universal | Always sent in parallel with the same magic links | Same |
| SMS | Universal fallback | For urgent SLA reminders | Same |
| Portal | — | — | Primary in Phase 2; WhatsApp/email become notifications pointing to it |
| Phone | — | Founder calls on SLA breach | On-call rota later |

Magic-link actions (`/v/{token}`): accept, decline (reason picklist), propose substitution (text + photo), mark out for delivery, upload delivery photo (mobile camera), report problem. Tokens are order+partner scoped, expire after closure, and are logged as `order_event.actor = partner`.

### 5.4 Quality, substitution, photos, payouts

- Substitution: partner must report any main-flower substitution before delivery via the link; buyer notified (04 §13). Unreported substitution complaints count against rating.
- Delivery photo: mandatory within 2 h of delivery; reminder at +1 h; payout for the order is released only when the photo exists (or admin waives with reason). EXIF stripped; consent for public use is separate (recipient loop page asks the recipient; default no).
- Payout ledger: `payout_line` per closed order in partner currency; weekly statement email; batch payout via Wise API (Phase 1: Wise batch CSV upload manually; Phase 2: API). Statement doubles as self-billing invoice where the accountant confirms 🧾.
- Rating: internal 1–5 from buyer post-delivery + timeliness + photo compliance + substitution transparency; below 4.2 for 30 days → paused and coached.

## 6. Admin (Phase 0–1 scope; the rest in 11)

| Function | Phase |
|---|---|
| Order queue with states, filters (date, country, partner, risk), timeline, raw events | 1 |
| Manual re-route, cancel, refund full/partial with reason, resend notifications, edit recipient details before acceptance | 1 |
| Partner CRUD, coverage, capacity, blackout dates, catalogue mapping and payouts, status | 0 |
| Country management: status demo/live/disabled, currency, VAT rate, cutoff, holidays, occasion calendar rows, price bands | 0 |
| Catalogue: products, translations queue, media, tiers, add-ons, per-country prices, margin view (retail − payout − fees) | 0 |
| Feature flags: locale, country, payment method, experiment | 0 |
| Review moderation (first-party), delivery-photo approval for public use | 1 |
| Exports: orders CSV, payouts CSV (Wise), accounting export (invoices, VAT breakdown by country) | 1 |
| Audit log of admin actions | 0 |

Admin is a set of server-rendered pages with Supabase RLS + role checks; no separate app.

## 7. Peak-day readiness

| Peak | Dates 2027 | What breaks | Prevention |
|---|---|---|---|
| Valentine's | 14 Feb (Sun) | Florist capacity; red-rose supply and price spikes; every buyer wants the same day; chargebacks from non-delivery | Capacity caps per partner/day set by 1 Feb; Valentine's surcharge and "guaranteed 13–14 Feb window" product; red-rose products switch to "florist's choice red" tier with explicit wording; cutoff pulled forward (12 Feb 18:00 for 14 Feb); pre-authorisation policy holds until acceptance so capacity failures do not charge buyers |
| Women's Day PL | 8 Mar (Mon) | Tulip supply; Monday morning office deliveries; volume 3–5× | Same caps; tulip products pinned; office-address fields prominent; partners confirm Sunday prep |
| Mothering Sunday UK (for UK→UK later) / Mother's Day PL 26 May / DE 9 May / NO 14 Feb (collides with Valentine's) | various | Capacity, cutoff confusion across countries | Per-country occasion calendar drives copy and cutoffs automatically; no hard-coded dates |
| All Saints PL | 1 Nov | Wreath/chrysanthemum-specific products; cemetery deliveries need plot info | Seasonal product set with extra address fields (cemetery, section) enabled by occasion |
| Christmas | 20–24 Dec | Closures, courier chaos | Blackout dates from partners collected by 1 Dec |

Technical: ISR keeps HTML cached regardless of traffic; checkout and webhook paths are the only dynamic load. Load-test checkout at 10× expected peak (k6) before each peak; queue workers scale horizontally; Stripe rate limits are far above our needs. On-call: founder, with a written runbook (`docs/runbooks/peak-day.md`) and a partner phone list.

## 8. Monthly operating costs (pre-revenue → Phase 1)

| Item | € / month | Notes |
|---|---|---|
| Hosting + DB (08) | 20–45 | within the agreed ceiling at Phase 0; grows with traffic |
| Domain, email (Google Workspace 1 seat) | ~8 | |
| Estonian service provider (address + contact person) | 25–35 | annual, amortised |
| Accountant (EE) | 50–120 | from first transaction |
| PL VAT filing (if Model A) | 50–100 | from PL registration |
| Trustpilot | 0 (free) → 200+ (paid) | free tier suffices until Phase 3 |
| Sentry, uptime monitor, Resend | 0 | free tiers |
| WhatsApp Business app | 0 | Cloud API later: ~€0.03–0.08/conversation |
| Native reviewers (de, pl) | 100–250 | ~6–10 h/locale/release at €10–15/h |
| Wise Business | 0 + ~0.5% payout FX | |
| **Total** | **~€250–560** | Hosting is the smallest line; people and compliance dominate |

## 9. Risks (flagged)

| Risk | Class | Mitigation |
|---|---|---|
| Stripe rejects or reserves after go-live | 💳 | Mollie live in parallel behind the adapter; €3–5k float; transparent onboarding description |
| VAT model wrong | 🧾 | Accountant sign-off is a Phase 1 gate; `supply_model` column |
| Florist stops responding on a peak day | ops | SLA timeouts, capacity caps, second partner per city before any peak |
| Payout FX loss on TRY/PLN swings | finance | Weekly payouts; buffer; fixed payouts reviewed monthly |
| Chargebacks from "recipient says nothing arrived" | 💳 | Photo + acceptance evidence pack; recipient phone confirmation |
| Pakistan tax residency / PE | 🧾 | Advice before first sale; board minutes and decisions taken in Estonia where practical |

**Recommendation:** treat §1 week-1 tasks and the §4 accountant list as the critical path to the MVP, ahead of any code.
**Rationale:** the build can be finished in December; the ability to take money and pay florists lawfully cannot be rushed after the fact.
