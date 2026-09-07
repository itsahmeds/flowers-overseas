# 07 — Compliance by Design

These are launch blockers, not polish. Each section states the rule, how it is built into architecture or UX (not bolted on), and what needs a lawyer (⚖️) or accountant (🧾). Two legal regimes apply from day one: **EU** (Estonian OÜ selling to EU consumers) and **UK** (UK buyers in the MVP corridor). Related: ADR-0006, ADR-0007; UX placements in `04`; data model in `01`.

---

## 1. GDPR (and UK GDPR)

### 1.1 Roles

| Party | Role | Basis |
|---|---|---|
| Flowers Overseas OÜ | **Controller** for buyer and recipient data | — |
| Florist partner | **Processor** for recipient delivery data (name, address, phone, message) acting on our instructions; **independent controller** for their own accounting records of the sale (Model A: they invoice us, not the consumer) | Partner agreement includes Art. 28 processor clauses ⚖️ |
| Supabase, host, Stripe/Mollie, Resend, WhatsApp (Meta), Trustpilot, GA4 | Processors (Stripe and Trustpilot are also independent controllers for their own purposes) | DPAs signed/accepted; listed in the privacy policy |

### 1.2 Lawful basis per data flow

| Data | Purpose | Basis | Retention |
|---|---|---|---|
| Buyer name, email, phone, country | Perform the contract, confirmations, delivery photo | Art. 6(1)(b) contract | Order + 10 years for invoice records (EE/PL accounting law 🧾); personal fields pseudonymised after 3 years, invoice archive retained |
| Buyer payment data | Payment | Contract; card data never touches us (Payment Element) | Stripe/Mollie retain; we keep token, last4, brand |
| **Recipient** name, address, phone, card message | Deliver the gift, florist call-ahead | **Art. 6(1)(f) legitimate interest** of buyer and us (delivering a gift the recipient has not consented to receive); balanced by minimisation, no marketing use, transparency at first contact | Delete/pseudonymise recipient contact data 90 days after delivery unless the recipient created an account or a dispute is open; keep city-level data for analytics |
| Recipient contact via card/QR | Inform recipient who sent the gift and how to exercise rights; optional thank-you loop | Legitimate interest for the notice; **consent** for any marketing or account creation | Consent-based |
| Delivery photo | Proof of delivery to buyer; dispute evidence | Contract + legitimate interest | 2 years (chargeback window + margin); public gallery use only with **recipient consent** (photos may show doorsteps, people) |
| Buyer marketing email | Newsletters, occasion reminders | **Consent** (unticked box), or soft opt-in for own similar products where the national ePrivacy law allows (UK PECR soft opt-in; DE/PL stricter) → we use explicit consent everywhere to keep one rule | Until withdrawal |
| Analytics cookies | GA4 | Consent (ePrivacy) | Cookie 6–12 months |
| Fraud signals (IP, device, velocity) | Prevent fraud | Legitimate interest (Recital 47) | 12 months |
| Florist personal data (owner name, phone, bank) | Contract | Contract | Contract + 10 years financial |
| Consent records | Proof | Legal obligation (Art. 7(1)) | 5 years after withdrawal |

### 1.3 Recipient data: the specific handling

- **Minimisation:** only what delivery needs; no recipient email at all; phone required (florist call-ahead, also a fraud/dispute control) and explained.
- **Transparency at first contact (Art. 14):** the printed card and the `/r/{code}` landing page carry a short notice: who we are, why we have their details (sender ordered a gift), that details were shared with the local florist for delivery only, retention, and a link to the privacy policy and to object/erase. The Art. 14 notice must be given within a reasonable period and at the latest at first communication; the card is that communication.
- **No marketing to recipients without consent.** The QR landing offers actions; it does not enrol them.
- **Buyer duty:** checkout copy asks the buyer to confirm they may share the recipient's details for delivery (light-touch acknowledgment, not a legal transfer of responsibility).
- **Florist obligations:** delete order data after payout statement; no use of recipient data for their own marketing; report breaches within 24 h; these are in the partner terms ⚖️.

### 1.4 Data residency and processors

- Supabase project in **EU (Frankfurt)**; storage bucket in the same region; backups in EU.
- Hosting compute/edge may run globally for cached HTML (no personal data in cached pages); dynamic routes handling personal data are pinned to an EU region where the host allows (08).
- Stripe (Ireland entity for EEA merchants), Mollie (NL), Resend (US company; choose EU region for data at rest and sign DPA with SCCs), Meta WhatsApp (SCCs via Meta's terms), Trustpilot (DK), Google Analytics (US: SCCs under EU-US DPF; IP anonymisation is default in GA4; consider server-side or EU-hosted alternative in Phase 3 if the framework is struck down again).
- **Record of processing activities** (Art. 30) maintained as `docs/compliance/ropa.md`, updated by the `reviewer` when a spec adds a data flow.

### 1.5 Rights handling (DSAR)

- Self-service in the account: export (JSON) and delete; guest buyers via a verified email link (`/account/privacy-request`) that authenticates against the order email.
- Recipients: request via the landing page or email; identity verified by matching order code + phone.
- Deletion = pseudonymise personal fields on `customer`/`recipient` and delete media; orders and invoices retained (legal obligation) with a `redacted` flag.
- 30-day SLA tracked in admin; runbook `docs/runbooks/dsar.md`.

### 1.6 Privacy policy structure (per locale, plain language)

Who we are · what we collect (buyer / recipient / florist / visitor) · why and on what basis (table) · who receives it (processors by name) · international transfers · retention (table) · your rights and how to exercise them · cookies (link) · recipients: a dedicated section written for someone who received a gift · complaints (Estonian DPA AKI; UK ICO for UK users) · changes.

Breach procedure: 72-hour notification to AKI; runbook `docs/runbooks/data-breach.md`.

**Recommendation:** legitimate interest for recipient delivery data with a card-based Art. 14 notice; 90-day recipient contact retention; EU-region processors with signed DPAs.
**Rationale:** it is the standard analysis for gift delivery, it minimises what we hold about non-customers, and it makes the recipient loop lawful by putting consent where consent belongs.

## 2. Consumer contract law

### 2.1 EU Consumer Rights Directive (2011/83, as amended by Omnibus 2019/2161)

| Requirement | Where built |
|---|---|
| Pre-contractual information (Art. 6): main characteristics, trader identity and address, total price incl. taxes and delivery, payment and delivery arrangements, complaint handling, **existence or absence of the right of withdrawal**, guarantee, contract duration | PDP (characteristics, price), checkout Step 3 summary block (all items, server-rendered, printed to the confirmation email) |
| **Withdrawal right exemption for perishable goods (Art. 16(d))**: no 14-day right for goods liable to deteriorate or expire rapidly | Explicit sentence on PDP ("Flowers are perishable, so the 14-day cancellation right does not apply once your order is being prepared. You can cancel free until your florist accepts it.") and in Step 3 before the pay button; repeated in the confirmation email. Add-ons that are not perishable (vase, plush, balloon) technically retain withdrawal rights when sold separately ⚖️: we treat them as part of one gift contract but disclose the position |
| Confirmation on a durable medium (Art. 8(7)) | Email with all Art. 6 information + terms PDF snapshot of the version accepted |
| "Order with obligation to pay" button labelling (Art. 8(2)) | Pay button text: "Pay £45.00 and place order" (DE: "Zahlungspflichtig bestellen" equivalent wording) |
| Delivery within the agreed date; remedies for late/non-delivery | Guarantee page + automatic refund logic (06) |
| No pre-ticked boxes for extras (Art. 22) | Add-ons default off; marketing unticked |
| No surcharges for payment methods beyond cost (Art. 19) | None |
| Omnibus: price reduction announcements must show the prior 30-day lowest price | Any "was/now" pricing renders the 30-day low from `country_price` history; no fake strike-throughs |
| Omnibus: ranking transparency for search/listing | "Sorted by bestsellers" label with a link explaining the criteria |
| Omnibus: reviews (§7) | |

### 2.2 UK regime for UK buyers (en-gb)

| Requirement | Where |
|---|---|
| Consumer Contracts Regulations 2013: same information duties; perishable-goods exemption (reg. 28(1)(c)); durable-medium confirmation | Same components render UK wording under `en-gb`; terms have a UK variant |
| Consumer Rights Act 2015: goods of satisfactory quality, as described; services with reasonable care; remedies | Guarantee page UK variant |
| Digital Markets, Competition and Consumers Act 2024: fake reviews and drip pricing are explicitly banned; total price up front | Already required by our price rule |
| Trader identity for a non-UK trader; UK GDPR representative not required for the OÜ unless processing UK data at scale ⚖️ (Art. 27 UK GDPR applies to non-UK controllers offering goods to UK individuals: **likely required**) | Appoint a UK representative service (~£200–400/yr) before UK sales ⚖️ |
| Distance selling of goods from outside the UK: no customs (nothing crosses a border) | — |

### 2.3 Terms & conditions per locale

One master T&C (EU) + a UK variant; translated to de/pl by a human reviewer; version stored per order (`order.terms_version`). Sections: parties and seller of record; how the relay works (local florist fulfils; substitution policy); ordering and contract formation (contract concluded when we accept, i.e., when payment is captured after florist acceptance — this also supports the "cancel free until acceptance" promise); prices and payment; delivery (dates, windows, recipient unavailable, incorrect address); substitution; cancellation and the perishable exemption; guarantee and remedies; reviews policy; liability; data protection; complaints and ODR (EU ODR platform closed in 2025; provide our complaint path and the national ADR body); governing law (Estonian law for EU consumers without depriving them of mandatory local protections; English law variant for UK) ⚖️.

**Recommendation:** disclose the perishable exemption on the PDP and at pay, promise free cancellation until florist acceptance, and form the contract on capture.
**Rationale:** the exemption is only valid if disclosed before purchase; the free-until-acceptance promise is cheap because we do not capture until then.

## 3. Geo-blocking Regulation (EU 2018/302)

| Rule | Implementation |
|---|---|
| No blocking or redirecting based on nationality/residence/location without explicit consent | No IP redirects (ADR-0006); locale is a link, banner is a suggestion; `/` chooser lists all |
| No different general conditions of access for the same goods by location | Prices differ by **destination** (legitimate: different service, different florist), not by buyer location; a French and a German buyer sending to Warsaw see the same PLN base and the same FX rule |
| No discrimination in payment methods by buyer nationality/location for methods we accept in that currency | Payment-method rendering by buyer country is **availability**, not exclusion: a buyer may change "your country" freely, and a UK buyer selecting Germany sees the German set. Cards are accepted from any country. Klarna/BLIK etc. are gated by the method's own issuer rules, not by us |
| Sellers may choose not to deliver to a territory | Destination not `live` → honest "not yet" state; that is allowed |

## 4. Price display

| Rule | Implementation |
|---|---|
| Total price incl. VAT and all unavoidable charges shown before the buyer commits (CRD Art. 6; Price Indication Directive; UK DMCC drip-pricing ban) | One price on PDP tiers that includes VAT and delivery; date-dependent surcharges (Sunday, Valentine's) shown on the date chip **before** selection; checkout total equals PDP total |
| Currency clarity | Symbol + ISO on hover/aria; "You pay in GBP; the florist is paid in PLN" line in the summary |
| Unit price rules | n/a (bouquets), stems shown |
| No fake urgency/scarcity | Countdown only when it is real cutoff data; capacity messages only from real capacity |
| Invoices 🧾 | PDF per order: seller identity, registry and VAT numbers, sequential number, date, buyer, description, net, VAT rate(s) and amounts by rate (PL 8% flowers / 23% add-ons in Model A), gross, currency (+ PLN equivalent where PL law requires 🧾) |

## 5. Cookies and ePrivacy (with Consent Mode v2)

| Rule | Implementation |
|---|---|
| Consent before non-essential storage/access (ePrivacy Art. 5(3) as transposed: EE ECA, DE TDDDG, PL Telecom Law, UK PECR) | CMP loads first; GA4 in default-denied Consent Mode v2; no other third-party script before consent |
| Consent must be freely given, specific, informed, unambiguous; reject as easy as accept; no dark patterns (EDPB guidelines; CNIL/Datatilsynet/ICO positions) | Equal-weight buttons; categories: necessary / analytics / marketing; granular settings; withdrawable via footer |
| Records of consent | `consent_log` (anonymous id, timestamp, choices, policy version) via `/api/consent` |
| Essential cookies documented | `fo_session`, `fo_csrf`, `fo_locale`, `fo_currency`, `fo_basket`, `fo_consent`, Stripe fraud cookies (`__stripe_mid` is essential for fraud prevention: documented as such) |
| Consent Mode v2 mandatory for Google tags in EEA/UK | `ad_storage`, `ad_user_data`, `ad_personalization`, `analytics_storage` set via CMP integration; URL passthrough off; modelled conversions accepted |

CMP decision: **Cookiebot (Usercentrics) free tier** for Phase 0–1 (≤50 pages... note the free tier is page-limited; our page count exceeds it quickly) → **self-built banner + consent log** is the recommended target by Phase 1 because it is ~2 days of work, has no per-page pricing, loads zero third-party JS pre-consent, and gives us the consent log natively. Google-certified CMP is only required if we run Google Ads with consent-mode requirements through a CMP partner; a self-built implementation that sets Consent Mode signals correctly is acceptable for GA4 and Ads.

**Recommendation:** self-built consent banner with a first-party consent log, Consent Mode v2 default-denied.
**Rationale:** it is the only option that is compliant, fast, and free at 60k pages.

## 6. Distance selling, Impressum, information duties

| Market | Requirement | Implementation |
|---|---|---|
| DE / AT | **Impressum** (TMG §5 / ECG §5): name, legal form, address, registry code, VAT ID, contact email + a fast channel (phone or form), authorised representative; reachable within two clicks from every page; also required for our DE-audience pages even though the OÜ is Estonian, because we target the German market | `/de/impressum` linked in footer of every locale (labelled "Impressum / Legal notice") |
| DE | Button solution wording; withdrawal instructions form (Muster-Widerrufsbelehrung) where withdrawal exists (add-ons ⚖️); Preisangabenverordnung (total price) | Pay button text; withdrawal page with the model instructions for non-perishable items |
| All EU | Trader identity, geographic address, email (Art. 6(1)(c)); complaints procedure | Footer + `/legal/company` + contact page |
| PL | Regulamin (terms) and privacy in Polish; UOKiK consumer rules; invoice language | `/pl/regulamin`, Polish invoices when PL VAT-registered 🧾 |
| UK | Business name, address, email, VAT if registered; Companies Act-style disclosures for the OÜ acting in the UK ⚖️ | Footer |

## 7. Reviews (Omnibus Directive; UK DMCC)

| Rule | Implementation |
|---|---|
| Must state whether and how we ensure reviews come from real purchasers | `/legal/reviews` policy page: reviews are invited only for delivered orders; Trustpilot invitations sent via the verified invitation flow; first-party reviews require a delivered `order_id`; we do not filter negative reviews; we display all moderated only for abuse/PII |
| No fake or commissioned reviews; no incentives that bias | No incentives for reviews; florists never solicit reviews directly |
| Display rules | First-party reviews show order date, destination country, verified badge; negative reviews shown; response by us allowed and labelled |
| Schema | `aggregateRating` only from first-party verified reviews displayed on the page (02 §9) |
| Demo phase | **No reviews shown at all until real ones exist.** Seed data contains zero reviews and zero testimonials. Placeholder "Be the first" state instead |

## 8. Accessibility (European Accessibility Act, from 28 June 2025; UK Equality Act)

E-commerce services are in scope of the EAA. Micro-enterprises (<10 staff, <€2m turnover) providing **services** are exempt from the EAA's requirements, and the OÜ will be a micro-enterprise at launch. We nevertheless commit to WCAG 2.1 AA because (a) the exemption disappears with growth, (b) DE/AT/PL national implementations and public expectations, (c) it is cheaper to build in than to retrofit, and (d) UK Equality Act duties apply regardless of size.

| Item | Implementation |
|---|---|
| WCAG 2.1 AA baseline | Design tokens with contrast-checked palette; semantic HTML; focus management; keyboard-operable date picker and combobox; alt text per locale; captions for any video; error identification and suggestions; consistent navigation; no content flashing |
| Accessibility statement | `/accessibility` per locale: conformance status, known issues, feedback channel, enforcement body |
| Testing | axe in Playwright on key templates in CI; manual screen-reader pass (VoiceOver + NVDA) per phase gate; `reviewer` checklist item |
| Documents | Invoices/PDFs tagged for accessibility where the generator supports it |

## 9. Other rules touching us

| Area | Rule | Implementation |
|---|---|---|
| Digital Services Act | We host user content (reviews, card messages shown to recipients, photos): notice-and-action channel required; not a VLOP | Report link on reviews and recipient page; `docs/runbooks/content-takedown.md` |
| Product safety / plant health | Cut flowers moving within a country: no phytosanitary issue; **never** ship plants cross-border ourselves | By design (relay) |
| Alcohol add-ons (wine) | Age verification and licensing vary by country (PL requires licensed sale; we cannot sell alcohol without licence) | Wine add-on **disabled** in PL and any country where the florist is not licensed; flag per (country, addon) |
| Food add-ons (chocolates, cake) | Allergen information (FIC Regulation) | Add-on pages show ingredient/allergen text supplied by the partner; cake only where partner sources from a registered bakery |
| Anti-money laundering | Low-value consumer payments; processors handle KYC; refunds only to the original payment method | Policy in T&Cs |
| Trademarks | "Flowers Overseas" clearance in EU (EUIPO) and UK (UKIPO) ⚖️; competitor names not used in ads/keywords | Week-2 task: search + file EUTM (~€850) when cash allows |
| Sanctions | Destinations under EU sanctions are `disabled` | Country status |

## 10. Compliance gates in the workflow

- `spec-writer` template has a mandatory "Compliance considerations" section (data flows → RoPA update, consent, price display, consumer info, accessibility).
- `reviewer` checklist: no PII in logs/URLs/analytics; price = schema = total; withdrawal notice present on PDP and pay step; consent gating of scripts; alt text; RTL/i18n; new processor → DPA recorded.
- `launch` gate: privacy policy and terms versions bumped when flows change; consent banner functional test; Impressum reachable; accessibility axe pass.

## 11. Lawyer / accountant checklist before Phase 1 (owner: founder)

1. ⚖️ Partner agreement template with Art. 28 clauses, substitution/photo/SLA duties, payout terms (EN + PL).
2. ⚖️ T&C (EU + UK variants), privacy policy, cookie policy, review policy, accessibility statement: review of our drafts.
3. ⚖️ Add-on withdrawal position (non-perishable items in a gift bundle) and the DE model withdrawal instructions.
4. ⚖️ UK GDPR Art. 27 representative appointment.
5. ⚖️ Governing law/jurisdiction clauses for EU and UK consumers.
6. 🧾 The nine VAT questions in `06` §4.
7. ⚖️ Trademark search and filing.

**Recommendation:** treat items 1, 2, 4 and 6 as MVP blockers; the rest can follow within 30 days of launch.
**Rationale:** those four determine whether we can lawfully take a UK consumer's money for a Polish delivery and hand recipient data to a florist.
