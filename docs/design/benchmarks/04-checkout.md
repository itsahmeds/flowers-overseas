# 04 — Checkout

**Honesty warning up front.** No checkout in this set was exercised — placing a real order is out of scope and every checkout route is robots-disallowed or behind a bot shield. `plan/04` §17 already flags competitor checkout internals as UNVERIFIED, and this round did not change that. What follows is what is **observable from outside** the checkout: robots-declared route shapes, login/guest affordances, delivery-information and terms pages that describe the fields, payment badges, and legal copy. Everything else is "not visible".

Live fetches **2026-09-09**. Fallbacks to `docs/research/competitors-*.md` (**2026-09-05**) marked.

Access log:
| Site | What was fetched 2026-09-09 | Result |
|---|---|---|
| Interflora UK | /page/delivery-information, /page/terms-and-conditions, / | 200, readable |
| Interflora PL | /contact, /zagranica | 200, readable |
| FloraQueen | /pages/help, /pages/conditions-of-purchase, PDP | 200, readable |
| Euroflorist PL | /kwiaty-za-granice, PDP | 200, readable |
| Euroflorist NO | PDP | 200, readable |
| 1-800-Flowers | /customer-service-faq | 200, readable |
| Teleflora | teleflora.com, international.teleflora.com | **HTTP 403** |
| Bloom & Wild | — | **BLOCKED** |
| InternetFlorist | .net NXDOMAIN / .biz 403 | 2026-09-05 only |
| Poczta Kwiatowa | all URLs | **404 to WebFetch** |

---

## 1. Per-competitor table (observable only)

| | Interflora UK | Interflora PL / Poczta Kwiatowa | FloraQueen | Euroflorist PL/NO | 1-800-Flowers | Bloom & Wild DE | Interflora FR | Fleurop DE | InternetFlorist |
|---|---|---|---|---|---|---|---|---|---|
| **Route shape (from robots)** | `/basket`, `/checkout`, `/finishing-touches` all disallowed → basket → finishing-touches (add-ons) → checkout | not visible | Shopify `/checkouts/` disallowed | `/cart` → `/checkout` → `/payment` → `/order-confirmed` (four routes, enumerated for 9 locale prefixes) | `/checkout`, `/account`, `/OrderTrackingLogonView` disallowed | not visible | not visible | `/checkout/cart` disallowed | `/{lang}/basket`, `/{lang}/orders` disallowed; **city-scoped basket URLs escape the rule** (`/en/florist-poland/send-flowers-warsaw/basket.html`) |
| **Step count** | not visible (≥3 implied) | not visible | Shopify default (not exercised) | **3 URLs implies 3 steps** | not visible | not visible | not visible | not visible | not visible |
| **Guest vs account** | "Sign In … Don't have an account? Click Here" — guest not stated | not visible | login modal offers Google / Meta / Amazon / LinkedIn; Shopify guest is default but not confirmed | not visible | account nudge; guest not stated | not visible | **"Continue as a guest" explicit in the login modal** (2026-09-05) — the only confirmed guest affordance in the set | account benefits copy: "Erinnerungsservice … Adressbuch für Empfänger" | not visible |
| **Recipient-first ordering?** | Not on the PDP — date and address are chosen in the basket, so recipient data comes after product choice | domestic countdown implies date first, then product | **destination city and date are chosen on the PDP**, so the recipient's city precedes the basket | **address field is the first control on the PDP** (NO: "Hvilken adresse skal blomstene sendes til?") | zip/date on the PDP (client-rendered) | date after "Send" | date on PDP | date on PDP | **city is step 1 on the PDP and gates Add-to-Basket** |
| **Address per country** | fields implied by country-page copy: "Enter your recipient's full name, contact number, and address"; hospital copy adds "ward, room number" | not visible | city dropdown per destination country; full address fields not visible | address autocomplete ("f.eks. Akersgata 1") | zip-code based (US) | not visible | not visible | not visible | **per-country address-format explainer** ("What a complete Polish address needs") |
| **Recipient phone** | required per country-page copy ("contact number"); Interflora EE guarantee text warns "check carefully that the delivery address, including local telephone number, is complete" | not visible | not visible | not visible | not visible | not visible | mandatory per FR market convention (`competitors-national.md`) | not visible | not visible |
| **Date confirmation in checkout** | date chosen here, not before — the "not available" reveal happens late | not visible | date fixed on the PDP with its fee | date fixed on the PDP | fees appear **when the date is chosen**: "the applicable shipping charges, service fees or surcharges, and amount will be shown" | date after CTA | date on PDP | date on PDP | date on PDP |
| **Card message** | "custom message" per country copy; character limit not visible | "bezpłatny bilecik" (free card) | free card as a €0 add-on | "W cenę wliczony jest bezpłatny bilecik na Twoją wiadomość"; int'l FAQ: "the local florist prints or handwrites your message on a card delivered with the bouquet, included in the price" | not visible | "Gratis Grußkarte für deine persönliche Nachricht" | not visible | not visible | not visible |
| **Payment methods shown** | Visa, Mastercard, Amex, PayPal, Apple Pay, Google Pay, **Klarna** (`isKlarnaEnabled: true`); Worldpay gateway | payment methods in footer (not enumerated in fetch); int'l FAQ for the sister brand lists cards, BLIK, PayPal, GPay | cards, PayPal, **Amazon Pay**, Sofort, Google Pay, Apple Pay (Store schema) | PL: **BLIK**, Google Pay, PayPal, Mastercard, Visa. NO: **Vipps**, Klarna, PayPal, cards | US only: Visa, MC, Amex, Discover, PayPal, Visa Checkout, Masterpass; Apple/Android Pay app-only | "Rechnung, Kreditkarte, PayPal oder Apple Pay"; "Klarna (Rechnung, Lastschrift und Sofortüberweisung)" | CB, Visa, MC, Amex, PayPal, Google Pay, Apple Pay | cards, PayPal, **Rechnung**, Sofortüberweisung, Apple/Google Pay, Klarna | Visa, MC, Amex, PayPal, Apple Pay, SOFORT, **Bancontact, BLIK, Przelewy24, iDEAL** |
| **Total-price honesty at the point of commitment** | product price excludes delivery ("Except where stated product prices exclude delivery charges"); £7.65–£15 domestic, **£12 international** | "nie pobieramy ukrytych opłat" — delivery included in the displayed price | delivery €7–14 by destination/date/time, added | NO: "serviceavgift på cirka 5–10 % … er inkludert i alle bestillinger"; PL: free courier weekdays, weekends surcharged | **explicitly drip**: fees revealed at date selection | delivery free or "from £5" | flat fee + delivery-pass upsell | "zzgl. Versandkosten" | not visible |
| **Trust marks near payment** | card logos in footer; "flowers guaranteed to last at least 7 days"; Trustpilot overlay | eKomi 98/100 (212 513), Trustpilot 4.5/5 (4747), Google 4.5/5 (8475) | "1770 reviews" pool; payment logos below the fold | payment logos; 7-day quality guarantee; Track & Trace | "100% Smile Guarantee" | Trusted Shops "Sehr gut 4.8 (17,478)" | "Élu Service Client de l'Année 2026", Ecovadis Gold, Trustpilot | Trusted Shops | Trustpilot |
| **Cancellation / amendment stated pre-purchase** | "You may not change, cancel or return an order for perishable goods once your order has been dispatched"; non-perishables 14 days, 48 h notice | not visible | **"Once you have placed your order, you will not be able to modify or cancel it under any circumstances"** | not visible | not visible | not visible | not visible | not visible | not visible |
| **Demo / test-mode convention** | none observed | none observed | a `/collections/test` collection is live in the sitemap | none observed | **a live indexable test page** `/local/austria`, `<title>testtitle</title>`, body "zip code 123456 … test test", in the sitemap at priority 1 | none observed | none observed | none observed | none observed |
| **Mobile behaviour in checkout** | not visible | not visible | not visible | not visible | not visible | not visible | not visible | not visible | not visible |

---

## 2. What we take

1. **Destination and date locked before checkout.** FloraQueen, Euroflorist, InternetFlorist and 1-800-Flowers all put city/address and date on the PDP; Interflora UK and Bloom & Wild defer them and therefore risk a late "not available" reveal. Confirms `plan/04` §7 and §9 — checkout is data entry, not decision-making.
2. **Address as the very first control** (Euroflorist NO: "Hvilken adresse skal blomstene sendes til? f.eks. Akersgata 1", with a real example in the placeholder). We keep destination-first and borrow the worked-example placeholder per country.
3. **An explicit "Continue as a guest" button in the login modal.** Interflora FR is the only site in the set that says it (2026-09-05). Ours is guest-by-default with account creation offered *after* payment (`plan/04` §9).
4. **The card message stated as free and as physically produced by the local florist.** Euroflorist PL: "the local florist prints or handwrites your message on a card delivered with the bouquet, included in the price". That sentence does two jobs — removes a fee fear and proves the relay model.
5. **A card-message character limit made visible.** netflorist states "350 characters or less. You can even add emojis!"; Bergamotte caps at 160. Ours: live grapheme counter at 200 (`plan/04` §9).
6. **Recipient phone framed as an operational necessity, with the reason attached.** Interflora EE's guarantee text ("check carefully that the delivery address, including local telephone number, is complete") is the closest any competitor comes to explaining why. Ours states the reason inline and promises non-sharing.
7. **Hospital / funeral fields revealed conditionally.** Interflora UK's country copy already asks for ward and room number. We make it a toggle in step 1 with country-specific rules (`plan/04` §9).
8. **Buyer-country payment rendering as the norm to beat.** InternetFlorist shows the widest genuinely-local set (Bancontact, BLIK, Przelewy24, iDEAL, Sofort); Euroflorist shows BLIK in PL and Vipps in NO; Bonita (NO) and Flora Nordica (DK) show neither Vipps nor MobilePay and look foreign for it. `plan/04` §10 is the right shape; the field confirms the cost of getting it wrong.
9. **A three-route checkout with a distinct confirmation URL** (Euroflorist's `/checkout` → `/payment` → `/order-confirmed`). Matches our three-step-one-URL plan with a `noindex` token confirmation page (`plan/05` row 20); the lesson is to keep the confirmation addressable and out of the index.
10. **Robots-disallow the whole basket/checkout/finishing-touches family** — and disallow it by *pattern*, not by literal path. InternetFlorist's city-scoped `basket.html` escaped its own `Disallow: /en/basket` rule and got indexed.

## 3. What we drop and why

1. **Fees appearing at date selection or at the payment step.** 1-800-Flowers ("shipping charges, service fees or surcharges … will be shown"), Interflora UK (£7.65–£15 + £12 international on top), Fleurop ("zzgl. Versandkosten"). Drip pricing is banned by the UK DMCC and breaks `plan/07` §4. The PDP total equals the checkout total, full stop.
2. **"No modification or cancellation under any circumstances"** (FloraQueen conditions of purchase, 2026-09-09). An absolute bar is not lawful in the EU/UK: perishables are exempt from the 14-day withdrawal right, but a trader cannot contract away statutory rights wholesale, and a florist order is amendable up to the cutoff in practice. We publish a real amendment window tied to the destination cutoff plus the statutory position in one plain sentence (`plan/04` §7, `plan/07` §6).
3. **Substitution "without notice"** (Interflora UK T&Cs) and **"we do not process refunds"** for delays or non-delivery (FloraQueen). Both are the opposite of our guarantee.
4. **A 24-hour photographic-evidence deadline for complaints** (FloraQueen: photos "within 24 hours of receiving the delivery", else no complaint handling). We hold the delivery photo ourselves, so we do not push the evidentiary burden onto the buyer.
5. **A published "97% probability" delivery figure** (FloraQueen). Either it is measured and auditable or it is an invented metric; ours would be neither at launch. No such number.
6. **Account-gated or social-login-first checkout** (FloraQueen's Google/Meta/Amazon/LinkedIn modal as the first thing a buyer meets). Guest first, wallets first, account last.
7. **Test and demo artefacts on the production domain.** 1-800-Flowers' indexable `/local/austria` "testtitle" page in the sitemap at priority 1, and FloraQueen's live `/collections/test`. Our demo surfaces are `/demo/vendor-inbox` (password, `noindex`) and demo-country checkout is guarded, never a public indexable page (`plan/05` rows 19, 45).
8. **A delivery-pass upsell inserted into the purchase flow** (Interflora £22/yr, Interflora FR €24,95/an, Euroflorist NO 159 kr/6 mo). It exists to make the drip fee tolerable; with all-inclusive pricing we have nothing to sell here.
9. **Loyalty-programme lists in place of an answer about payment methods** (netflorist's FAQ answers "which payment methods?" with Clicks Clubcard, eBucks, Discovery Miles…). Payment methods are rendered by buyer country from config and shown as logos before the pay step.

## 4. Open questions for the founder

1. **Demo/test-mode convention.** Nothing usable was found in the field (the two examples are accidents). Do we adopt: Stripe test keys + a persistent on-page "TEST MODE — no card will be charged" banner + `noindex` + a distinct order-number prefix, and a hard guard that a demo-country order can never reach a live payment intent?
2. **Amendment window.** What is the real cut-off for changing a recipient address or date — the destination cutoff minus X hours, or "until the florist accepts"? This drives both the checkout copy and the `orderService.transition` states.
3. **Recipient phone: hard-required or required-with-escape?** Every operational signal says required (`plan/04` §9), but a UK buyer often does not have the Polish recipient's mobile. Do we allow "I don't have it" with a warning that we cannot call on failed delivery?
4. **Express wallet placement.** `plan/04` §9 puts Apple/Google Pay at the top of step 1 *and* in step 3. Confirm we want both, given the express button skips buyer details we may need for the invoice.
5. **SEPA Direct Debit for DE** with its slow settlement (currently gated to deliveries ≥5 days out). Keep in Phase 1 or defer?
6. **Card message language.** If the buyer writes in English and the recipient is Polish, do we offer nothing, a translation, or a prompt library per destination locale? (Listed as A/B test 5 in `plan/04` §14 — needs a Phase-1 decision on the default.)
