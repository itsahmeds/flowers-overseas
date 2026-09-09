# 08 — Help, contact and legal

Covers `plan/05` rows 32 (FAQ), 34 (Contact), 28 (Guarantee & substitution), 29 (Delivery information) and §4 (legal pages per locale, versioned).

Method as in `docs/design/homepage-v1/README.md`. Live fetches **2026-09-09**.

Access log:
| Target | URL | Result |
|---|---|---|
| Interflora PL | https://www.interflora.pl/contact | 200, readable — **the best legal-identity page in the set** |
| Interflora PL | https://www.interflora.pl/regulamin | **HTTP 503** |
| Interflora UK | https://www.interflora.co.uk/page/terms-and-conditions | 200, readable |
| Interflora UK | https://www.interflora.co.uk/page/delivery-information | 200, readable |
| Interflora UK | /customer-services, /content/help-and-faqs/ | **HTTP 404** (footer names "FAQ", "Contact Us", "Flower Care Tips" without resolvable URLs in the fetch) |
| FloraQueen | https://www.floraqueen.com/pages/help | 200, readable |
| FloraQueen | https://www.floraqueen.com/pages/conditions-of-purchase | 200, readable |
| FloraQueen | https://www.floraqueen.com/pages/terms-and-conditions | 200 but returned nav/product content — actual terms are at `/pages/conditions-of-purchase` and `/pages/privacy` |
| 1-800-Flowers | https://www.1800flowers.com/customer-service-faq | 200, readable (note: this page is `noindex,nofollow` per 2026-09-05) |
| Euroflorist PL | /centrum-pomocy | **HTTP 404**; help links visible in footer ("Obsługa Klienta", "regulamin", "Polityka ochrony prywatności", "Polityka plików cookies") |
| Teleflora | teleflora.com, /info/faq | **HTTP 403** |
| Bloom & Wild | — | **BLOCKED** |
| Poczta Kwiatowa | all URLs | **404 to WebFetch** |

---

## 1. Per-competitor table

| | Interflora PL / Poczta Kwiatowa | Interflora UK | FloraQueen | Euroflorist PL | 1-800-Flowers | Fleurop DE | InternetFlorist |
|---|---|---|---|---|---|---|---|
| **Contact channels** | **phone 22 828 95 95**, fax 22 828 95 96, email; hours **Mon–Fri 08:00–20:00, Sat 09:00–16:00, Sun 12:00–17:00** | phone/FAQ/Contact Us named in the footer; hours not visible | **support portal only** — no phone, no email; "No phone or email ordering mentioned; digital channels only" | "Obsługa Klienta" footer group with contact, delivery timelines, help centre | contact form + live chat; **"no specific hours of operation"** | phone 030/713 71-… for partners; consumer channel not fetched | UK phone +44 203 109 0569 |
| **Legal identity published** | **complete**: Poczta Kwiatowa Sp. z o. o., ul. Corazziego 2, 00-087 Warszawa; NIP 525-21-46-705; REGON 016173969; KRS 0000185818; share capital 50 000 PLN | Interflora British Unit, Interflora House, Watergate, Sleaford, Lincolnshire NG34 7TB; company reg. no. 297087; **VAT number not disclosed** | "Flora Queen Flowering the World S.L." named; **no registration number, no full address, no VAT number in the conditions** | not visible in fetch | US corporate identity not fetched | Fleurop AG | "Part of EC Global Promotions LTD." |
| **Help structure** | topic groups: ordering & registration, payments, delivery times, delivery locations (domestic and international), product selection & customisation, order status, special services (weddings, funerals) | footer groups: FAQ, Contact Us, Flower Care Tips; separate `/page/delivery-information` and `/page/terms-and-conditions` | ten topic groups: tracking, delivery timing, availability by country, added products & substitutions, quality, discount codes, modifications/cancellations, invoices & account, payments, newsletter | customer-service group + policy links | one long FAQ page, `noindex,nofollow` | service pages per topic | per-country `faq.html` and `terms-conditions.html` (230 of each) |
| **Price / VAT statement in terms** | int'l page: "nie pobieramy ukrytych opłat" | "Prices include VAT for deliveries within the UK, Republic of Ireland and Channel Islands"; "Except where stated product prices exclude delivery charges" | delivery "between 7 and 14 euros, depending on the destination, the date, and the delivery time"; **no VAT statement in the conditions** | "You will see the full order price before payment" | fees shown at date selection | "inkl. MwSt. zzgl. Versandkosten" | not visible |
| **Right of withdrawal / cancellation** | not visible (503) | perishables: "You may not change, cancel or return an order for perishable goods once your order has been dispatched"; non-perishables 14 calendar days, 48 h notice | **"Once you have placed your order, you will not be able to modify or cancel it under any circumstances"**; separately, "the right of withdrawal does not apply to the supply of goods that are made to the consumer's specifications or are clearly personalised"; non-perishables 14 days | not visible | not stated | not fetched | per-country terms pages |
| **Substitution policy** | footer names a "Product Substitution Policy" as its own document | "In the event of any supply difficulties, we reserve the right to substitute with a product of equivalent value and/or quality **without notice**" | "the substitute will always be of the same or higher value compared to the product" ordered; brand of add-ons not guaranteed | PDP-level wording (see 01) | Terms: may "substitute an item of equal or greater value" | PDP-level wording | country-hub wording |
| **Delivery information page** | delivery times/locations as help topics; a separate "Delivery Terms & Conditions" document | **the most complete in the field**: Florist Delivery Today £10 (8am–6pm), Florist Express £15 (within 3 h), nominated day £7.65 (8am–6pm), AM slot £12 (8am–12pm), PM slot £12 (12pm–6pm), Sunday £11 (9am–2pm), funeral timed delivery at no extra cost, Click & Collect FREE, courier £4.95 (7am–7pm), **international £12 to over 130 countries**; same-day cutoff 3pm | help-page answers only | footer link | FAQ answers | Versand pages | per-country |
| **Guarantee wording** | quality assurances, Fleurop-Interflora guarantee | "We guarantee the freshness of your flowers for 7 days from the date of delivery/collection"; if unable to supply, "reimburse your payment in full no later than 7 days after the intended delivery/collection date" | "97% probability that your order will arrive on the chosen day"; **"we do not process refunds"** for delays/non-delivery | "gwarancja jakości i świeżości" | "100% Smile Guarantee … we'll make it right" | "7-Tage-Frischegarantie" | "100% happiness promise" |
| **Complaint deadline** | not visible | **1 working day** | **24 hours**, buyer must supply photos | not visible | not stated | not fetched | not visible |
| **Failed delivery** | not visible | "We are not responsible is the recipient has moved or refuses the delivery"; card left, "We reserve the right to charge for re delivery" | no refunds where the customer gave a wrong address or the recipient refused | not visible | not stated | not fetched | not visible |
| **Dispute resolution / ODR** | not visible (503) | not visible in fetch | **none detailed** | not visible | not stated | not fetched | not visible |
| **Cookie / privacy policy** | Polityka prywatności, plus Delivery T&Cs, Substitution Policy, Sustainability, all footer-linked | Terms, Privacy, Cookies, Modern Slavery Act | `/pages/privacy` ("Privacy and Legal") | regulamin, Polityka ochrony prywatności, Polityka plików cookies | not fetched | not fetched | not visible |
| **Indexability of help** | not checked | help URLs not resolvable from the fetch | help page indexable | indexable | **`noindex,nofollow`** — the FAQ answering every buyer question is excluded from search | city FAQ pages carry `FAQPage` | 230 country FAQ pages, `FAQPage` |
| **FAQ schema** | not checked | `FAQPage` on country pages | none on the help page | `FAQPage` on home and int'l hub | none | `FAQPage` on city pages | `FAQPage` on country hubs |

---

## 2. What we take

1. **Full legal identity, in one findable place.** Interflora PL publishes company form, street address, NIP, REGON, KRS and share capital (interflora.pl/contact, 2026-09-09). That is the model for our OÜ registry code, address and VAT number in the footer and the Impressum (`plan/04` §3, `plan/07` §6).
2. **Contact hours that are actually stated, including weekend hours.** Interflora PL: Mon–Fri 08:00–20:00, Sat 09:00–16:00, Sun 12:00–17:00. Flowers are a weekend product; "contact form and live chat" with no hours (1-800-Flowers) is a non-answer, and FloraQueen's portal-only support with no phone is worse. Our round-6 utility strip already carries phone + WhatsApp + hours — this validates it.
3. **A dedicated, complete delivery-information page with every service, price, window and cutoff in one table.** Interflora UK's `/page/delivery-information` is the single best artefact found in this study. Ours becomes cutoffs by destination country with holidays and hospital/funeral notes (`plan/05` row 29) — same rigour, cross-border axis.
4. **A separate, named substitution policy document.** Interflora PL lists "Product Substitution Policy" as its own footer item. Ours is `/guarantee` covering promise + substitution + refunds (`plan/05` row 28), linked from the PDP sentence.
5. **A supply-failure refund commitment with a clock.** Interflora UK: "reimburse your payment in full no later than 7 days after the intended delivery/collection date". Concrete, checkable, and rare.
6. **Help topics organised by the buyer's moment, not by our departments.** Interflora PL's groups (ordering, payments, delivery times, delivery locations incl. international, customisation, order status, weddings & funerals) and FloraQueen's ten groups both work. Ours must add the cross-border questions the corridor pages already answer (customs, currency, language).
7. **`FAQPage` schema on help and country FAQs.** Euroflorist, Fleurop, Interflora UK and InternetFlorist all ship it; FloraQueen's help page ships none.
8. **Per-country FAQ and terms pages as a concept** (InternetFlorist has 230 of each) — but only for corridors we actually serve; see drops.

## 3. What we drop and why

1. **`noindex,nofollow` on the FAQ** (1-800-Flowers' `/customer-service-faq`, the page that carries their cutoff times and guarantee). Priority #1 says every page that answers a query should be indexable. Our `/help` is SSG and indexed with `FAQPage` schema (`plan/05` row 32).
2. **Support with no phone and no email** (FloraQueen: "digital channels only"). For a gift going to another country on a fixed date, a human channel is the product. We publish phone and WhatsApp with hours.
3. **Contact channels with no hours** (1-800-Flowers). Hours or nothing.
4. **Incomplete seller identity.** FloraQueen names an S.L. with no registration number, address or VAT number; Interflora UK publishes a company number but no VAT number. Both fall short of the EU/UK information duties in `plan/07` §6 (and the German Impressum requirement). Ours is complete on every page footer.
5. **Absolute bars on cancellation and blanket refusal of refunds** (FloraQueen, both). Unlawful in shape and against our guarantee.
6. **Substitution "without notice"** (Interflora UK) and unbounded add-on substitution ("we sometimes cannot guarantee a specific brand", FloraQueen).
7. **A 24-hour complaint window with a buyer-supplied-photo condition** (FloraQueen) and a **1-working-day** window (Interflora UK). See `07-track-and-confirmation.md`.
8. **"We are not responsible" plus a redelivery charge** (Interflora UK).
9. **No dispute-resolution or ODR information anywhere in the set.** EU traders selling to consumers owe information duties here; the field's silence is a compliance gap, not a precedent. Ours goes on the terms page and in the pre-contract block.
10. **230 auto-generated per-country FAQ and terms pages** (InternetFlorist), including for countries with no supply. Country FAQs only where the corridor exists.
11. **Terms that contradict the storefront.** FloraQueen's help page says orders cannot be modified "under any circumstances" while the conditions page grants a 14-day return on non-perishables; Interflora publishes three different florist-network sizes across three pages. One source of truth, versioned per locale (`plan/05` §4).

## 4. Open questions for the founder

1. **Phone coverage.** The round-6 design carries a help phone and WhatsApp with hours. What are the real staffed hours at launch, and do they cover Saturday and Sunday (when flowers are sent and deliveries fail)?
2. **Withdrawal-right wording.** Flowers are perishable and largely exempt, but add-ons (vase, chocolates, teddy) may not be. Do we write one sentence covering the bouquet and a second for non-perishable add-ons, and does that change the refund flow?
3. **Refund clock.** Do we adopt an Interflora-style commitment ("refunded in full within N days of the intended delivery date")? If so, N.
4. **ODR / dispute resolution.** Which body do we name per market, and does an Estonian OÜ selling into UK/DE/PL need more than one?
5. **Language of legal pages.** `plan/05` §4 says per locale and versioned. Is a legally-reviewed translation required for each locale at launch, or does one authoritative language plus informational translations suffice? (This is a cost and a compliance question, not a design one.)
6. **Invoice VAT presentation.** `plan/07` §4 requires VAT by rate (PL 8% flowers / 23% add-ons in Model A). Confirm which model is in force, because it determines whether an all-inclusive single price can be broken out correctly on the invoice PDF.
