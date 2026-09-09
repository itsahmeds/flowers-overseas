# 00 — Competitor page-type study: summary

Scope: eight page types across 1-800-Flowers, InternetFlorist, Euroflorist, Interflora (UK / PL / FR / EE / Fleurop DE), FloraQueen, Bloom & Wild, Teleflora and Poczta Kwiatowa, read against `plan/04-ux-conversion-spec.md`, `plan/05-page-inventory.md` §1–§2, `plan/07-compliance.md` §4 and the founder's rules in `CLAUDE.md`.

Method follows `docs/design/homepage-v1/README.md`: read the live page, record what is shown and in what order, mark anything not directly observed as "not visible" or **BLOCKED**, decide what we take (with the source) and what we drop (with the rule it breaks), and hand the founder the questions we cannot answer.

**Dates.** Live fetches: **2026-09-09** (WebFetch). Secondary source for blocked or already-teardown-ed pages: `docs/research/competitors-direct.md`, `competitors-global-and-serp.md`, `competitors-national.md`, research date **2026-09-05**.

## Files

| File | Page type |
|---|---|
| `01-product-page.md` | Product page (PDP) |
| `02-category-and-shop-grid.md` | Category and shop grid |
| `03-destination-and-corridor-pages.md` | Destination / corridor pages |
| `04-checkout.md` | Checkout (observable-only; internals remain UNVERIFIED) |
| `05-occasion-pages.md` | Occasion pages |
| `06-for-florists-recruitment.md` | Florist recruitment |
| `07-track-and-confirmation.md` | Tracking and order confirmation |
| `08-help-contact-and-legal.md` | Help, contact and legal |

## What could not be read (and what was used instead)

| Site | Barrier (2026-09-09) | Fallback |
|---|---|---|
| Teleflora (teleflora.com, international.teleflora.com, /becomeatelefloraflorist) | **HTTP 403**, Cloudflare | myteleflora.com member-benefits page (fetched OK) + WebSearch snippets + `competitors-global-and-serp.md` §4 (floristsonline.net, a legacy Teleflora/FTD relay) |
| Bloom & Wild | 403 to non-browser clients | 2026-09-05 browser reads in `competitors-direct.md` §4 |
| Poczta Kwiatowa (pocztakwiatowa.pl, /bukiet-my-love, /en/gifts) | **HTTP 404 to WebFetch** — bot block, the pages are live in search | interflora.pl, whose operator is **Poczta Kwiatowa Sp. z o. o.** (per interflora.pl/contact) — the same company's platform |
| InternetFlorist | internetflorist.**net** → DNS NXDOMAIN; internetflorist.**biz** → 403 (Bunny Shield) | `competitors-global-and-serp.md` §1 (2026-09-05, browser) |
| euroflorist.com | Not a storefront — group/investor portal with a country dropdown routing to the national ccTLDs | euroflorist.pl and euroflorist.no |
| Euroflorist florist-recruitment page | Soft-404 / wrong content on www and bare host; `/dla-kwiaciarni` 404 | search-result title + snippet only, marked as such |
| Interflora PL `/regulamin` | HTTP 503 | interflora.pl/contact + interflora.co.uk terms |
| All checkouts | Not exercised (robots-disallowed, and placing real orders is out of scope) | route shapes from robots.txt, login/guest affordances, delivery-info and terms copy |

---

## The ten patterns that matter most

1. **Destination and date belong before the basket, and the field is split on it.** FloraQueen, Euroflorist, InternetFlorist and 1-800-Flowers put city/address and date on the product page; Interflora UK, Bloom & Wild and Aquarelle defer them to basket or checkout and therefore reveal "not available on that day" after the buyer has committed. InternetFlorist's numbered, CTA-gating version ("1. Enter Your Delivery City / 2. Select Delivery Date / 3. Select Your Size") is the clearest execution anywhere. Confirms `plan/04` §7.
2. **The fee, printed next to each selectable date, is a one-site idea.** Only FloraQueen does it ("Tomorrow 10 September €8,90"). Every other site either hides the fee until the date is chosen (1-800-Flowers: "the applicable shipping charges, service fees or surcharges … will be shown") or adds it at checkout. This is the highest-value single UI element in the study and it is essentially unoccupied.
3. **Nobody in the field charges what they display.** VAT is usually in; delivery almost never is — Interflora UK ("product prices exclude delivery charges", £7.65–£15 domestic, £12 international), Fleurop ("zzgl. Versandkosten"), FloraQueen (€7–14 by destination/date/time), Euroflorist NO (a "circa 5–10 %" service fee inside the price but only disclosed in fine print). The two exceptions are cross-border pages that *say* so — Interflora PL's "nie pobieramy ukrytych opłat" and Euroflorist PL's PLN-only settlement. All-inclusive pricing (`plan/07` §4) is therefore both a compliance requirement and the field's biggest open flank.
4. **The cross-border explanation that works is three sentences: a local florist makes it, nothing crosses a border, no customs paperwork.** Interflora PL ("bukiet trafia do lokalnej kwiaciarni w kraju odbiorcy, gdzie jest przygotowywany i doręczany") and Euroflorist PL ("no documents or customs forms needed … the bouquet is not physically transported from Poland") are the only two sites that say it plainly. 1-800-Flowers says "international affiliates"; FloraQueen says "bouquet creation centres".
5. **Cutoffs are the trust currency, and almost everyone states them in the seller's time zone.** 1-800-Flowers is the exception and the model: "by the following times in your recipient's time zone: M-F: 3pm, Saturday: 2pm, Sunday: 12pm", delivery window "9AM to 8PM in the recipient's time zone". Interflora UK is the only site putting hard numbers on a country page ("before 2pm on weekdays or before 10am on Saturdays"). Fleurop is the only one warning that the *destination* region may have a local holiday on the chosen date.
6. **Corridor pages are the SEO backbone, and the incumbents either mass-produce them or skip them.** FloraQueen ships 12,610 `flowers-{city}` collections on one shared grid; GBO ships ~240k product×country and origin×destination pages; InternetFlorist ships 230 countries × 12 categories × 32 languages including `florist-antarctica`. At the other extreme Fleurop publishes **no country URLs at all** (a search box), and Euroflorist PL's per-country pages are absent from the sitemap. Nobody occupies the middle: a small number of real corridors with real cutoffs, fees, coverage counts, address-format guidance and `FAQPage` + `BreadcrumbList` + `ItemList` schema.
7. **The one genuinely unique country content in the field is practical, not lyrical.** InternetFlorist's "what a complete Polish address needs", Interflora UK's hospital ward/room and cemetery/crematorium notes, GBO's local-holiday guide and alcohol rules, Euroflorist's customs answer. Everything else is a swapped place name — which is precisely what makes those pages thin.
8. **Occasions are the dominant query class and the calendar is mishandled.** Only 1-800-Flowers prints the date in the occasion navigation ("Labor Day (9/7)", "Grandparents Day (9/13)"). European sites author genuinely local occasions well (Aquarelle's Muguet, Toussaint, Fête des grands-mères; Euroflorist PL's Imieniny and a Polish name-day calendar; Blume2000's Weltfrauentag and Omatag) but none of them reconciles the *sender's* calendar with the *recipient country's* calendar — which is the entire cross-border problem. Occasion × destination pages exist almost nowhere (1-800-Flowers' `/international/englandsympathy` is the only example found).
9. **Post-purchase is empty ground.** No competitor offers no-login order tracking; FloraQueen puts status behind an account and admits "we cannot send a tracking number in all cases because many of our florists use their own transportation"; Interflora UK's tracking URL 404s. The only real proof mechanism in the field is Aquarelle's photo at dispatch with a 48-hour complaint window; GBO's recipient-photo gallery is marketing, not per-order proof. Euroflorist NO's pre-purchase promise of an SMS delivery confirmation, and 1-800-Flowers' "confirmation by 8PM in the recipient's time zone", are the two best individual moves.
10. **Florist recruitment is a marketing page with no numbers.** Interflora's own "Our Packages" page publishes no package, no price and no commission; Fleurop publishes network size (5,500 / 50,000 / 150 countries) and two named partnership models but no fees; Teleflora's only public figures are for a $129–$159/month marketing add-on. Interflora and Teleflora both push florists to a separate domain, shedding the consumer brand's authority, and Interflora's application is an external Microsoft Form. Publishing the commission split, the payout timing and the order channel on a first-party, locally-worded `/for-florists` page is uncontested.

---

## The five most common trust-destroying patterns to avoid

1. **Drip pricing.** Fees revealed at date selection or at the pay step (1-800-Flowers, Interflora UK, Fleurop, FloraQueen), or an unavoidable percentage service fee disclosed only in PDP fine print (Euroflorist NO's "serviceavgift på cirka 5–10 %"). Banned by the UK DMCC, contrary to the Price Indication Directive and to `plan/07` §4.
2. **Reviews and prices that are not what they appear to be.** FloraQueen shows the same 1,770-review pool on many different products, with mixed-language snippets, and a struck-through "regular price" on every tier of every size permanently. Both are UCPD/Omnibus problems, and both are exactly what the founder ruled out in round 6 (real reviews only; no fabricated numbers).
3. **Contracting away the buyer's remedies.** FloraQueen: "Once you have placed your order, you will not be able to modify or cancel it under any circumstances", "we do not process refunds" for delays or non-delivery, and complaints only with buyer-supplied photos "within 24 hours". Interflora UK: substitution "of equivalent value and/or quality **without notice**", "We are not responsible is the recipient has moved or refuses the delivery", "We reserve the right to charge for re delivery", complaints "within 1 working day".
4. **Unverifiable or self-contradicting numbers.** FloraQueen's "97% probability that your order will arrive on the chosen day"; 1-800-Flowers claiming "over 100 countries" on one page and "195 counties [sic] worldwide" on another; Interflora quoting "around 900 florists" on the consumer site, "over 1000" in membership material and "over 30,000" on the international hub. One number, one source, or no number.
5. **Production pages that reveal the machine.** 1-800-Flowers' live, sitemapped, indexable `/local/austria` with `<title>testtitle</title>` and body "zip code 123456 … test test"; FloraQueen's `/collections/test` and "A - Pure Heart Mom 1" internal naming leaking into the H1; Fleurop's Poland corridor page whose intro reads "Empfänger in Frankreich"; Interflora EE's English product names on an Estonian page for UK products; Euroflorist NO's Germany page selling Norwegian bouquets in NOK. Each one tells the buyer the page was generated, not written.

---

## Per-page must-have list (the wireframe round can check itself against this)

### Product page
- [ ] Destination country visible and changeable (reloads the country-scoped URL)
- [ ] Size tiers expressed as **stem counts**, each with an all-inclusive price ("incl. VAT & delivery")
- [ ] Date picker on the page, pre-selected to the earliest available, **fee delta printed on each date chip**
- [ ] Unavailable dates greyed **with the reason** (Sunday, public holiday in the destination)
- [ ] Cutoff line in the **recipient's** time zone, computed, with a real countdown or nothing
- [ ] Add-ons with images and prices, defaulted off; "what the price does not include" (vase) stated
- [ ] Substitution promise in plain language, on the page, not in Help
- [ ] Photo-proof promise stated on the page
- [ ] Per-product reviews only if ≥3 verified, otherwise the block is absent
- [ ] Sticky mobile CTA showing the single total; CTA copy names the amount
- [ ] Withdrawal-right sentence for perishables + link
- [ ] Server-rendered title, canonical, hreflang, price, `Product` + `Offer` (+ `OfferShippingDetails`, `MerchantReturnPolicy`); schema price = default tier's displayed price
- [ ] No struck-through price unless genuinely previously charged; no "from" on the PDP

### Category / shop grid
- [ ] Destination in the URL; date control above the grid
- [ ] Every card carries an all-inclusive price in the buyer's currency
- [ ] Per-card availability badge computed from the destination cutoff ("Today" / "Tomorrow")
- [ ] Card links to the PDP — **no add-to-basket on the card**
- [ ] Sort: curated/bestsellers (destination-scoped), price ↑, price ↓, newest
- [ ] Facets are query params and `noindex`; curated collections are authored pages
- [ ] Honest empty state for demo countries (waitlist, no fake grid)
- [ ] Short "how delivery works" block + city links + sibling occasions below the grid
- [ ] `noindex` on faceted URLs; canonical to the clean collection

### Corridor page (country / city)
- [ ] H1 naming the corridor; delivery promise line with a live countdown
- [ ] The relay explained in one sentence, in the locale's language
- [ ] Customs/paperwork fear answered explicitly
- [ ] Currency and settlement stated ("You pay in GBP; the florist is paid in PLN")
- [ ] "No hidden fees" as a statement we can keep
- [ ] Cutoffs, delivery days, and destination public holidays
- [ ] Florist count for that corridor — a real count or nothing
- [ ] Country-specific address-format guidance
- [ ] Hospital / funeral / office delivery rules for that country
- [ ] Local occasions with dates and order-by cutoffs
- [ ] Real delivery photos for that country (gated ≥6)
- [ ] FAQ accordion, server-rendered open text
- [ ] City links; related destinations; top products priced for that destination
- [ ] `FAQPage` + `BreadcrumbList` + `ItemList`; self-canonical; reciprocal hreflang with x-default
- [ ] No demo-country page indexed with a live grid; guide status stated honestly

### Checkout
- [ ] Guest by default; account offered only after payment
- [ ] Express wallets available before typing
- [ ] Step 1 recipient-first, each step preceded by the reason we need the data
- [ ] Address fields in destination format; diacritics preserved; worked-example placeholders
- [ ] Recipient phone with destination prefix + inline reason + non-sharing promise
- [ ] Hospital/hotel/funeral/office toggle revealing ward/room/company fields and country rules
- [ ] Card message with live grapheme counter, stated as free and produced by the local florist
- [ ] Date carried from the PDP, editable, with the same fee logic
- [ ] **One total**, equal to the PDP total, with "includes VAT and delivery — nothing more to pay"
- [ ] Payment methods rendered by buyer country; logos before the pay step
- [ ] Pre-contract information block; order button naming the amount
- [ ] State saved per step; back and refresh never lose data
- [ ] `noindex` + robots-disallow on basket/checkout/payment/confirmation, by pattern not literal path
- [ ] Test mode unmistakably labelled, `noindex`, and unable to reach a live payment intent
- [ ] Published amendment window tied to the destination cutoff

### Occasion page
- [ ] The occasion's **date in each live destination country**, with the order-by cutoff
- [ ] Everyday vs dated occasions separated
- [ ] Locale-authored occasions (Imieniny, Dzień Kobiet, Muttertag, Toussaint…), not translated from English
- [ ] Occasion × destination page only where the occasion is real and the country is live
- [ ] Reference-grade editorial (what the occasion is, what is customary in that country)
- [ ] FAQ including anonymous sending and workplace/hospital delivery
- [ ] Occasion-reminder signup (double opt-in), no discount bribe
- [ ] Links to sibling occasions and to the corridor pages
- [ ] No manufactured urgency; no sale banner we cannot substantiate

### For-florists
- [ ] On our own domain, in the local language (`/for-florists`, `/pl/dla-kwiaciarni`, `/de/fuer-floristen`)
- [ ] The partnership model named in one line (we route, you make and deliver, we own the customer)
- [ ] **Commission split, payout timing and any fee published on the page**
- [ ] What arrives and how (email / WhatsApp / portal), with the vendor-inbox demo linked
- [ ] Real network numbers or none
- [ ] Application form fields visible on the page before the click; first-party form, `noindex`
- [ ] Human channel: phone/WhatsApp + email + staffed hours a florist actually works
- [ ] Partner terms linked
- [ ] Testimonials only when real and attributable

### Tracking and confirmation
- [ ] Confirmation: order number, what-happens-next timeline, tracking link, recipient recap, add-to-calendar, share link, invoice
- [ ] Tracking at `/track/{token}` with **no login**; `/track` lookup by order number + email
- [ ] Timeline with real states from `orderService.transition`
- [ ] Florist first name + city once accepted
- [ ] Delivery photo, with a stated arrival deadline
- [ ] Substitution note if any, with the approval flow
- [ ] Actionable problem options (neighbour / redeliver / call recipient) — never "we are not responsible"
- [ ] Published complaint window measured from the delivery photo; no buyer-supplied-evidence condition
- [ ] Refund/remake commitment with a clock; no charge for redelivery of our failure
- [ ] Send-again / reorder; recipient loop entry
- [ ] `noindex` on confirmation and tracking

### Help, contact and legal
- [ ] `/help` **indexed**, with `FAQPage` schema
- [ ] Phone + WhatsApp + email with staffed hours including weekends
- [ ] Complete seller identity on every footer: OÜ name, registry code, address, VAT number (+ Impressum for de)
- [ ] `/delivery` — cutoffs by destination country, holidays, hospital/funeral notes, one table
- [ ] `/guarantee` — promise, substitution policy, refund and remake terms, complaint window
- [ ] Withdrawal-right treatment for perishables and separately for non-perishable add-ons
- [ ] Terms, privacy, cookies, partner terms — per locale, versioned, non-contradicting
- [ ] Dispute resolution / ODR information named per market
- [ ] Cookie settings re-openable from the footer; equal-weight banner
- [ ] One number, one source: no claim that contradicts another page
