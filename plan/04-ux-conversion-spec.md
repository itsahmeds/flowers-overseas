# 04 — UX & Conversion Specification

Conversion is priority #2 and never overrides indexability (02) or compliance (07). Assume 70%+ mobile. Our product is trust plus routing, so the trust layer is specified per page with the same rigour as the checkout. Evidence base: `docs/research/competitors-*.md`. Checkout internals of competitors (step counts, field order, phone requirement) could not be exercised by the research agents and are marked UNVERIFIED there; this document designs those on first principles and legal requirements.

---

## 1. What the reference sites taught us (UX)

| Adopt | From | Avoid | From |
|---|---|---|---|
| Destination-first hero: ask where/when once, before prices | Interflora.ee/UK, Euroflorist NO | Deferring delivery date to cart or checkout (surprise "not available tomorrow") | Colvin, Bonita, Flora Nordica |
| Delivery fee shown next to each selectable date on the PDP | FloraQueen | Service-fee disclosure buried in PDP fine print ("5–10 % serviceavgift er inkludert") | Euroflorist NO |
| Substitution sentence on the PDP itself | Fleurop, Interflora FR, Euroflorist PL | Substitution only in Help | FloraQueen |
| Postcode + date first for real availability | Bergamotte | Domestic inventory shown on a foreign-destination page | Euroflorist NO, Interflora FR |
| Market payment badges above the fold (Vipps NO, BLIK PL, Klarna DE) | Euroflorist, Bloom & Wild DE | Cards + PayPal only in NL/PL/Nordics | Bonita, Flora Nordica, Colvin (no Bizum) |
| Explicit "Continue as guest" in the login modal | Interflora FR | Account-gated checkout | — |
| Delivery-photo gallery as a trust asset | GiftBasketsOverseas | Stock imagery with no proof of real deliveries | most |
| Photo-before-dispatch / "bouquet conforme" guarantee wording | Aquarelle | Vague "satisfaction" claims | — |
| Cutoff stated in recipient time zone ("3pm recipient time") | 1800flowers | Cutoff in the seller's zone | — |
| Stem-count tiers (S/M/L as stems, not adjectives) | netflorist, 1800flowers | "Deluxe/Premium" with no visible difference | — |
| Card message with live character count (160–350) | Bergamotte (160), netflorist (350) | Unlimited message that gets truncated at the florist | — |

## 2. Design principles

1. **One decision per screen on mobile.** Destination → date → product → details → pay.
2. **Price shown = price charged.** VAT and delivery included; no drip fees (07 §5).
3. **Every promise is a fact from data.** "Delivered today if ordered in 2 h 10 min" is computed from the destination cutoff; "12 florists in Warsaw" is a count; the delivery photo is real. Nothing decorative claims something we cannot show.
4. **Trust before ask.** Each form step is preceded by the reason we need the data.
5. **Server-rendered first paint, islands for interaction.** Date picker, currency menu, banner and cart are hydrated over server-rendered defaults (01 §3).

## 3. Global elements

| Element | Spec |
|---|---|
| Header (mobile) | Logo (links to locale home) · destination chip ("→ Poland", tap to change) · currency chip (GBP) · menu · cart badge. 56 px tall, sticky, no CLS. |
| Header (desktop) | Same plus nav: Destinations · Occasions · Flowers · How it works · For florists. |
| Trust strip (below header on shop pages) | "Hand-made by a local florist" · "Photo of every delivery" · "Trustpilot ★ 4.8 · 1,240 reviews" (hidden until ≥25 reviews) · "Secure payment" icons. Server-rendered text; Trustpilot number fetched at build/ISR time, not client-side. |
| Suggestion banner | 03 §2. Slides over, dismissible, never blocks. |
| Footer | Top 12 destinations · occasions · info · legal · payment method logos for the locale · Trustpilot badge · Impressum (de) · company details (OÜ registry code, address). |
| Cookie consent | §11. Bottom sheet on mobile, non-blocking, equal-weight Accept / Reject / Settings. |

## 4. Homepage

Job: get the visitor to pick a destination country in one action, then see products priced in their currency with a delivery date.

```
[Trust strip]
H1: Send flowers to family and friends anywhere in Europe. Made and delivered by a local florist today.
[ Destination picker: large combobox "Where are the flowers going?" with typeahead over countries AND cities,
  grouped: "Popular from the UK: Poland, Romania, Ireland, Spain…" then A–Z. One tap on a country → /en-gb/send-flowers-to/poland
  (or straight to /en-gb/poland/flowers if the user chose "Shop now" mode; default is corridor page because it sets expectations) ]
[ Next to picker: "Delivering today in Warsaw until 14:00 local time" for the hinted/last destination ]
[ How it works: 3 steps with icons: You choose → A vetted local florist makes it → Photo on delivery ]
[ Popular destinations: 8 cards with flag-free imagery, "from £34" (locale currency), florist count, same-day badge ]
[ Occasions this month: calendar-aware per locale (en-gb in Feb: Valentine's, NO Morsdag (if NO live); pl in Feb/Mar: Dzień Kobiet) ]
[ Best sellers: 8 products with price in locale currency and "to {last destination}" context ]
[ Real deliveries: gallery of approved delivery photos with city + date (hidden until ≥6 photos) ]
[ Reviews: Trustpilot carousel (lazy) ]
[ For florists teaser ]
```

Mobile LCP element = hero image (preloaded, ≤ 120 KB AVIF). The picker is usable before hydration (native `<select>` fallback enhanced into a combobox).

**Recommendation:** country picker → corridor page by default; "Shop {country}" as the secondary CTA.
**Rationale:** the corridor page answers "can you really deliver there, by when, for how much" before showing bouquets, which is the buyer's actual first question for a cross-border gift.

## 5. Corridor page (country / city)

Above the fold (mobile): H1 · delivery promise line with live countdown ("Order in 2 h 10 min for delivery today in Warsaw") · date picker (compact) · florist count · price-from · CTA "See bouquets for Poland". Then: top 8 products · local occasions (next 3 with dates) · what's popular locally / etiquette · how it works for this country · your florists (cards: first name, city, years, photo) · real deliveries in this country · FAQ (accordion, server-rendered open text) · cities · reviews for this corridor · related destinations.

## 6. Category / occasion / shop root

- Grid of 2 columns on mobile, 4 on desktop; each card: image (fixed 4:5 box), name, stem-tier price "from £34", "Today" or "Tomorrow" badge computed from cutoff, add-to-basket is **not** on the card (date must be chosen first).
- Sticky filter bar: occasion, colour, flower type, price band, "same-day only". Facets are query params, `noindex` (02 §7).
- Sort default: bestsellers for the destination; then price asc/desc, newest.
- Empty state for demo countries: honest "We're onboarding florists in Germany. Join the waitlist" with email capture; no fake grid on indexable pages (02 §5).

## 7. Product page (PDP)

```
[Gallery: primary image (LCP, preloaded), 3–5 angles, real-delivery photo of THIS product when available, swipe on mobile]
[H1 product name]  [★ 4.9 (23) if ≥3 verified product reviews]
[Delivering to: Poland ▾  (changing country reloads the country-scoped URL)]
[Size tiers as stems: 12 / 18 / 24 stems, price each in display currency, "incl. VAT & delivery"]
[Delivery date picker:
   Today (until 14:00 Warsaw time) · Tomorrow · Sat 14 Feb · Sun (grey: no Sunday delivery in PL except Valentine's/Mother's Day) · …
   Each date shows any fee difference (£0 / +£4 Sunday / +£6 Valentine's surcharge). Holidays greyed with reason ("Public holiday in Poland").
   Server renders "Next available: Today until 14:00" text; picker hydrates over it.]
[Delivery window: morning / afternoon / any (where partners support) ]
[Add-ons: chocolates £6, vase £8, balloon £4, teddy £9, card free — with images; country-specific set and prices]
[CTA: Continue — £45.00 total incl. everything]  (sticky on mobile once the user scrolls past it)
[Trust block: ✔ Hand-made by a vetted florist in Warsaw · ✔ Photo of your delivery · ✔ Freshness guarantee 7 days · ✔ Secure payment (logos for buyer country)]
[Substitution, plain language: "Your florist makes this bouquet locally from fresh stock. If a flower isn't available that day, they use one of equal or higher value in the same colours and style. We'll never swap the main flower without telling you."]
[Photo-proof promise: "You get a photo of the actual bouquet when it's delivered."]
[Description · What's included · Care]
[Delivery in Poland: cutoff, days, hospital/funeral notes, "Recipient not home?" policy]
[Reviews: verified product reviews; then Trustpilot company widget lazy]
[Related products in this country]
[Withdrawal-right notice for perishables (07): one plain sentence + link]
```

Rules: price in schema equals the default tier's displayed price; all-inclusive; VAT wording per locale ("incl. VAT", "inkl. MwSt.", "w tym VAT"); no "from" on the PDP itself. Add-ons default off. Date must be chosen before Continue (pre-selected to the earliest available).

**Recommendation:** date picker on the PDP, not in checkout, with fee-per-date and holiday reasons.
**Rationale:** the delivery date is the purchase decision for a gift; everything downstream is data entry.

## 8. Basket vs direct checkout

Single-item gifting dominates. Default flow: PDP → Continue → Checkout (basket contents editable inline as a collapsed summary). A `/basket` page exists for multi-item orders and for "back" navigation but is not a required step. Cross-sell add-ons live on the PDP and once more as a one-tap row in checkout step 1 ("Add chocolates £6").

## 9. Checkout (guest by default)

Three steps on one URL (`/en-gb/checkout`), state saved server-side per step so refresh and back never lose data; progress indicator; each step ≤ 8 fields on mobile.

**Step 1 — Recipient (why: "Your florist needs this to deliver")**
- Full name (single field) · address per destination format (03 §8) with postcode-first ordering where the country uses it, apartment/floor field where conventional, diacritics accepted and preserved · **recipient phone (required)** with country prefix pre-set to the destination and inline reason "The florist calls if the recipient isn't home. We never share it with anyone else." · optional delivery instructions (120 chars) · "Is this a hospital, hotel, funeral home or office?" toggle that reveals ward/room/company fields and shows country-specific rules.
- Card message: textarea with live counter (max 200 characters; Polish, Turkish, Cyrillic, Arabic, emoji all allowed; the counter counts graphemes), "leave blank for no card", optional "sign as" field prefilled from step 2 later. Preview of the card.
- Delivery date + window (carried from PDP, editable).

**Step 2 — You (why: "So we can confirm your order and send you the delivery photo")**
- Email (required) · full name · phone (optional) · **"Send me delivery updates on WhatsApp/SMS"** opt-in with number reuse · country of residence (drives payment methods, VAT display and legal notices; defaults from locale; must be freely changeable per Geo-blocking Regulation) · "Create a password to track orders faster" (optional, off by default).
- Marketing opt-in unchecked, separate, plain-language (07).

**Step 3 — Pay**
- Order summary with **one total** ("£45.00 · includes VAT and delivery · nothing more to pay") and the currency; a "Pay in PLN instead" link for the curious.
- Payment methods rendered by **buyer country** (table §10) via Stripe Payment Element (with Mollie adapter as fallback), wallets first on mobile (Apple Pay / Google Pay express button also offered at the top of Step 1 to skip typing the buyer's details).
- Billing address: collected only if the method requires it (cards: postcode + country minimum; SCA may need full address).
- Mandatory pre-contract information block (07): summary of main characteristics, total price, delivery date, the perishable-goods withdrawal exclusion in one sentence, link to terms; order button labelled "Pay £45.00 and place order" (EU "button solution" wording requirement for DE).
- 3DS2 challenge handled inline; on failure show a non-technical retry with alternative methods.

Post-pay: confirmation page (`noindex`) with order number, what happens next timeline, tracking link, "add to calendar", recipient details recap, share-to-WhatsApp of the tracking page for the sender, and account-creation nudge (one tap, magic link).

Form quality rules: `autocomplete` attributes per field; inline validation on blur; error copy tells how to fix; phone and postcode validated for the destination; no CAPTCHAs (rate-limit + Radar instead); address autocomplete deferred to Phase 4 (cost).

**Recommendation:** guest-first three-step checkout with express wallets at the top and buyer-country-driven payment methods.
**Rationale:** account creation and card-only payment are the two largest documented drop-offs in EU gifting checkouts, and both are avoidable.

## 10. Payment methods by buyer country (rendered by `config/payment-methods-by-country.ts`)

| Buyer country | Methods shown (order) | Via | Phase |
|---|---|---|---|
| UK | Apple Pay, Google Pay, cards, PayPal, Klarna (Pay in 3, optional) | Stripe | 1 |
| IE | Apple Pay, Google Pay, cards, PayPal | Stripe | 1 |
| DE / AT | PayPal, Klarna (Pay now / Pay later / Rechnung), Apple/Google Pay, cards, SEPA Direct Debit (delivery ≥5 days out only, because settlement is slow) | Stripe (Klarna incl. former Sofort; giropay is discontinued) | 1 (de locale) |
| PL | BLIK, Przelewy24, cards, Apple/Google Pay, PayPal | Stripe (P24/BLIK) or Mollie | 1 |
| NL | iDEAL, Apple/Google Pay, cards, PayPal, Klarna | Stripe or Mollie | 4 |
| BE | Bancontact, cards, PayPal, Apple/Google Pay | Stripe or Mollie | 4 |
| FR | Cards (CB), Apple/Google Pay, PayPal | Stripe | 4 |
| ES | Cards, Bizum (Mollie), PayPal, Apple/Google Pay, Klarna | Mollie for Bizum | 4 |
| IT | Cards, PayPal, Apple/Google Pay, Satispay (later) | Stripe | 4 |
| NO | Vipps (Mollie/Vipps MobilePay direct), cards, Klarna, Apple/Google Pay | Mollie | 4 |
| DK / FI | MobilePay, cards, Klarna | Mollie | 4 |
| SE | Swish, Klarna, cards | Stripe (Swish) or Mollie | 4 |
| CH | Twint, cards, PostFinance | Stripe/Mollie | later |
| RO | Cards, Apple/Google Pay, PayPal | Stripe | 4 |
| TR | Cards | Stripe | 4 |
| Anywhere else | Cards, Apple/Google Pay, PayPal | Stripe | 1 |

Each method is behind a feature flag scoped to (country, method) so a rollout or an incident is a data flip. Availability of a method by destination is never restricted (Geo-blocking Regulation forbids discriminating by buyer location for methods we accept in that currency). Card brands accepted are shown as logos on the PDP trust block per buyer country.

## 11. Cookie consent and Consent Mode v2

- CMP: a lightweight, EU-hosted, TCF-not-required implementation (we run no ad auctions): recommend **Cookiebot** or **CookieYes** free tier, or a self-built banner storing consent in a first-party cookie + `consent_log` table (needed for proof). Decision in 07 §6; either way behaviour below is fixed.
- Before consent: GA4 loads in **Consent Mode v2 default denied** (`ad_storage`, `analytics_storage`, `ad_user_data`, `ad_personalization` = denied). Cookieless pings still allow modelled conversions in GA4/Ads. No other third-party script loads (Trustpilot widget renders a static server-side score until analytics consent or user interaction).
- Banner: bottom sheet, non-blocking, no dark patterns: Accept all / Reject all / Settings as equal buttons; no pre-ticked boxes; re-openable from footer "Cookie settings". Consent stored 6 months (reject) / 12 months (accept).
- After accept: `gtag('consent','update',…)`; Trustpilot widget, WhatsApp click-to-chat and any A/B tool load.
- Essential-only cookies (session, CSRF, locale, currency, basket, consent) are documented in the policy and need no consent.
- Modelling: report conversions in GA4 with consent-mode modelling enabled; server-side `purchase` events from the Stripe webhook are keyed by `client_id` only when consent was granted, otherwise sent as consentless aggregated counts to a first-party analytics table, so the founder's funnel numbers never depend on banner acceptance.

**Recommendation:** Consent Mode v2 with default-denied, an equal-weight banner, and a first-party order-funnel table as the source of truth.
**Rationale:** it is compliant in every EEA market, keeps the banner from blocking LCP or conversion, and gives us honest numbers regardless of consent rate.

## 12. Trust layer placement

| Signal | Home | Corridor | Category | PDP | Checkout | Confirmation | Tracking |
|---|---|---|---|---|---|---|---|
| Local florist explanation | hero + how it works | dedicated block | strip | trust block | step 1 reason line | timeline | florist first name + city once accepted |
| Real delivery photos | gallery | country gallery | — | product's own photos | — | "you'll get one like these" | the actual photo |
| Trustpilot | strip + carousel | corridor reviews | strip | widget (lazy) | compact stars near pay button | invite later | — |
| Guarantee / refund | footer link | block | — | trust block + link | summary line | link | link |
| Secure payment | footer logos | — | — | logos by buyer country | logos + 3DS note | — | — |
| Photo-proof promise | how it works | block | — | explicit line | step 2 reason | timeline | fulfilled |
| Company identity (OÜ, address, VAT) | footer | footer | footer | footer | footer + pre-contract block | invoice | footer |
| Substitution policy | — | FAQ | — | plain sentence | summary link | — | substitution note if any |

## 13. Post-purchase

| Moment | Channel | Content |
|---|---|---|
| Paid | Email (+WhatsApp if opted in) | Confirmation, order number, tracking link, recipient recap, what happens next, invoice PDF |
| Routed/accepted | Tracking page updates; WhatsApp optional | "Your florist in Warsaw, Anna, has accepted your order" (first name + city only) |
| Substitution proposed | Email + WhatsApp, requires no action unless main flower changes (then approve/decline within 2 h, default approve) | photo/description of swap |
| Out for delivery | WhatsApp/SMS if opted in | "Out for delivery this afternoon" |
| Delivered + photo | Email + WhatsApp | The photo, "how did we do?" one-tap rating, Trustpilot invite 24 h later (Omnibus-compliant invitation to a verified buyer) |
| Problem (recipient not home, wrong address) | WhatsApp/SMS + email, actionable | Options: leave with neighbour / redeliver / call recipient |
| 11 months later | Email (Phase 3) | Occasion reminder based on this order's occasion and destination calendar |

**Tracking page** `/{loc}/track/{token}`: no login; timeline; florist first name + city; delivery photo; live "estimated window"; buttons: message us (WhatsApp/email), report a problem, send again / reorder; "Send flowers back" (recipient loop below).

**Recipient-to-sender loop.** Every delivery includes a printed card (florist prints from the order PDF, or a pre-printed card sleeve we ship to florists in Phase 2) with: the sender's message, "Delivered by {florist first name}, a local florist partnered with Flowers Overseas", and a **QR code + short URL** `flowersoverseas.com/r/{code}` (locale of the destination country). Landing page: "Hi {recipient first name}, {sender first name} sent you these. Want to send a thank-you back, or flowers to someone else?" with two CTAs: "Send flowers to {sender first name}" (prefills a new order to the sender's city if we hold a country/city for the sender; never prefills their address without their consent) and "Rate the florist". The recipient becomes a `customer` only if they order; until then they remain a `recipient` with a minimal profile. This is where the `recipient` entity earns its keep. Card copy and privacy wording are in 07 §2.

## 14. Analytics and event plan (GA4 + first-party)

Dimensions on every event: `locale`, `destination_country`, `display_currency`, `buyer_country` (when known), `page_type`, `country_status` (live/demo), `consent_state`.

| Funnel step | Event | Key params |
|---|---|---|
| Landing | `page_view` (enhanced) | page_type |
| Destination chosen | `select_destination` | country, source (picker/corridor/nav) |
| Date chosen | `select_delivery_date` | days_ahead, is_same_day, fee_delta |
| Product viewed | `view_item` | item_id, price, currency, tier |
| Add-on added | `add_addon` | addon_id |
| Continue to checkout | `begin_checkout` | value, currency |
| Step completed | `checkout_progress` | step (recipient/buyer/pay) |
| Payment method selected | `select_payment_method` | method |
| Payment attempt / 3DS challenge | `payment_attempt`, `payment_3ds` | method, outcome |
| Purchase (server-side from webhook) | `purchase` | transaction_id, value, currency, items, method, destination |
| Tracking page viewed | `view_tracking` | order_age_hours |
| Recipient QR landing | `recipient_landing` | destination_country |
| Recipient order | `purchase` with `acquisition=recipient_loop` | |
| Banner interaction | `locale_suggestion` | action (switch/stay/dismiss) |
| Consent | `consent_update` | analytics, ads |
| Florist page CTA | `florist_lead_start`, `florist_lead_submit` | country |

Key funnels: home → destination → PDP → begin_checkout → purchase (by locale × destination); PDP → purchase by device; checkout step drop-off by buyer country and payment method; recipient loop conversion.

First A/B tests (Phase 1–2, in order): (1) homepage CTA: corridor page vs country shop root; (2) PDP tier default: 12 vs 18 stems; (3) express wallet button at top of checkout vs pay step only; (4) trust block above vs below the date picker; (5) card message prompt suggestions vs blank. Tooling: a feature-flag based split with server-side assignment stored in a cookie (no client-side flicker; no third-party A/B script until consent).

## 15. Mobile specifics

- Sticky CTA bar on PDP and checkout with total. Inputs ≥16 px font (prevents iOS zoom), `inputmode` set (`numeric` for postcode where numeric, `tel` for phone). Date picker is a horizontal scroll of day chips, not a calendar grid, for the next 14 days; "more dates" opens a grid.
- Tap targets ≥44 px; no hover-only affordances; back button always restores state (server-side draft).
- Offline/poor network: form drafts persist; payment step shows a clear "reconnecting" state.

## 16. Accessibility baseline (EAA / WCAG 2.1 AA, detail in 07 §9)

Semantic landmarks; visible focus; colour contrast ≥4.5:1; every image alt localised; date picker keyboard-operable with `aria-live` announcements of price changes; error messages linked via `aria-describedby`; forms usable at 200% zoom; no time limits on checkout except payment session (extendable). Playwright + axe on PDP, corridor, checkout in CI.

## 17. Gaps and assumptions (flagged)

- Competitor checkout internals are UNVERIFIED (research agents could not exercise checkouts). Our checkout is designed from first principles and legal requirements; validate with 5 recorded user tests (Polish diaspora in the UK) before Phase 1 launch.
- Klarna availability per method and Stripe's exact local-method coverage per market changes; `config/payment-methods-by-country.ts` is reviewed at each phase gate.
- Trustpilot free plan limits invitations and widgets; upgrade cost is in 06.

**Recommendation:** adopt this as the UX contract; the `spec-writer` derives page specs from §4–§13 and the `reviewer` checks §2 principles.
**Rationale:** the corridor-first flow, date-on-PDP and buyer-country payment rendering are the three places the incumbents leak conversion, and all three are cheap for us to get right from the start.
