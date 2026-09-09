# 06 — For-florists recruitment (Interflora, Teleflora, Euroflorist, Fleurop)

Our `/for-florists` landing, `/for-florists/apply` and `/for-florists/how-orders-work` (`plan/05` rows 41–43) are Phase 0. This is the page type where the incumbents are weakest, because none of them has to compete for florists on the open web.

Method as in `docs/design/homepage-v1/README.md`. Live fetches **2026-09-09**.

Access log:
| Target | URL | Result |
|---|---|---|
| Interflora UK membership — join | https://www.interflora-membership.co.uk/join-us | 200, readable |
| Interflora UK membership — packages | https://www.interflora-membership.co.uk/our-packages | 200, readable |
| Interflora UK main site footer | https://www.interflora.co.uk/ | 200 — footer links "Florist membership" and "Become an Interflora Florist", **both to interflora-membership.co.uk** (a separate domain) |
| Fleurop DE — partner | https://www.fleurop.de/partnerfloristen/fleurop-partner | 200, readable |
| Teleflora — become a florist | https://www.teleflora.com/becomeatelefloraflorist | **HTTP 403** (Cloudflare) |
| Teleflora members' site | https://www.myteleflora.com/teleflora-member-benefits.aspx | 200, readable |
| Euroflorist PL — cooperation | https://www.euroflorist.pl/wspolpraca-z-kwiaciarniami, https://euroflorist.pl/wspolpraca-z-kwiaciarniami, /dla-kwiaciarni | **soft-404 / wrong content**: both www and bare-host fetches returned the consumer homepage content, and `/dla-kwiaciarni` returned 404. The consumer footer does carry a "Dla kwiaciarni" link. Page content therefore **not visible**; the search-result title for the page is "Dołącz do największej sieci kwiaciarni w Europie \| Euroflorist" (WebSearch, 2026-09-09) |
| Euroflorist group | https://www.euroflorist.com/ | 200 — group/investor portal; claims "Largest Florist Network In Europe", founded 1982, e-commerce since 1995, "41+ million bouquets delivered", and carries a **"Notice of Potential Data Breach"** link in the header |

---

## 1. Per-competitor table

| | Interflora UK (interflora-membership.co.uk) | Fleurop DE (`/partnerfloristen/fleurop-partner`) | Teleflora (myteleflora.com member benefits) | Euroflorist |
|---|---|---|---|---|
| **Is it on the consumer domain?** | **No** — separate domain, linked only from the consumer footer | Yes, inside `/partnerfloristen/` on the consumer ccTLD | No — separate members' domain; the consumer-side `/becomeatelefloraflorist` page is Cloudflare-blocked to fetchers | consumer footer link only; page content not visible |
| **Headline** | "Join Us" / "Apply Now" | "Werden Sie Fleurop-Partner" ("Become a Fleurop partner"), opening "Seien Sie dabei!" | "Member Benefits" | "Dołącz do największej sieci kwiaciarni w Europie" (search-result title) |
| **Value proposition, verbatim** | "over 100 years" in the industry; "the biggest and most respected floral gifting company in the UK and Ireland"; local florists are "the backbone of our brand". Four benefit pillars: **Floral Freedom** ("control over flower purchasing to utilise seasonal/fresh stock and improve profitability"), **Local Support** ("access to more orders and marketing opportunities within local communities"), **Partnership**, **Reliability** ("a stable business partner") | "das größte Floristen-Netzwerk der Welt"; leverage the brand as advertising for your own shop; win new customers and additional orders | 16 named benefits (see below) | "low fees, high commissions from orders and a very wide product offering" (WebSearch summary, page not fetchable) |
| **Numeric claims** | "over 100 years"; **no network size, no order volume, no performance metrics on the join page**. Elsewhere the consumer site says "around 900 florists spanning the whole of the UK" (interflora.co.uk, 2026-09-09) and "over 30,000 florists in over 130 countries" on the international hub; a search snippet cites "over 1000 florists across the UK and Ireland" and "over 2 million products … each year" | "5.500 Betriebe" in Germany; "50.000 Partnerfloristen" globally; "150 Ländern" | "approximately 20,000 member florists throughout the U.S. and Canada" + "20,000 affiliated florists outside North America" (search snippet); FindAFlorist.com "over 225,000 flower buyers a month"; Member Directory "generates millions of orders a year"; Dove Network "the largest communications network and best coverage in the industry" | group site: "41+ million bouquets delivered", founded 1982; search snippet: "over 9,000 affiliated flower shops", 10 countries |
| **Partnership models offered** | "Flexible packages to suit you and your business"; "Freedom of florist choice"; "Same Day, National and International services" — **the packages themselves are not published** | **two models, named**: `Agentur-Partnerschaft` ("reine Auftragsvermittlung" — order placement only) and `Lieferpartnerschaft` ("mit Auftragsauslieferung" — fulfilment) | membership tiers not published; eFlorist marketing sold separately | not visible |
| **Commission / fee transparency** | **None.** No commission rate, no membership fee, no payment terms anywhere on join-us or our-packages. A search snippet mentions "adaptable payment terms and excellent sending and executing commissions" with no figures | **None visible** | **None on the benefits page.** The only published figures found anywhere are marketing add-ons: eFlorist "Online Search Marketing Program for a low monthly fee of **$129, $139, or $159**, depending on location" (search snippet), and a "0% credit card plan created exclusively for florists" | "low fees, high commissions" — **no figures** |
| **What the florist gets, itemised** | order flow, local marketing, brand, stability, freedom to buy own stock | online platform + florist supply shop at competitive prices; **full trademark usage rights**; promotional materials and nationwide advertising; Fleurop-Magazin and GREEN trade magazines; discounted customer magazine; **free seminars**; automatic billing; card-processing advantages; free Fleurop star-programme membership | Credit Card Processing; Dove Network; eFlorist hosting/marketing; FindAFlorist.com directory; Holiday Co-op national advertising; Keepsakes & Marketing Kits; Marketing Support; Member Directory; MyTeleflora.com; Presidents Club & National Accounts; FlowerBuyer flower auction ("farm direct flowers"); Dove POS technology; Teleflora International; Scholarship Academy; Unit Programs; 24 Hour Flowers answering service | not visible |
| **Application form fields** | **none on the page** — a single "Apply Now" button to an **external Microsoft Form**. Fields therefore not visible | **no form at all** — phone "030 / 713 71 - 171", email partnerservice@fleurop.de, hours Mon–Fri 07:30–17:00 | not visible; entry is "call 800.421.2815 or email jointeleflora@teleflora.com" (search snippet) | not visible |
| **Process steps** | not published; contact +44 1522 405 877 or join@interflora.co.uk; a search snippet claims "You could start taking orders in as little as a day" | not published beyond "contact us" | not published | not visible |
| **How orders reach the florist** | **not specified on the page** | not specified (the two models imply it) | **not specified**; Dove Network and Dove POS are named as the channel without explaining it | not visible |
| **How the florist is paid** | **not specified** | "Automatische Abrechnung" (automatic billing) — mechanism not explained | not specified | not visible |
| **Testimonials / proof** | none on the join page | none | none on the benefits page | not visible |
| **Trust / credibility devices** | registered address (Interflora House, Watergate, Sleaford, Lincolnshire NG34 7TB), phone, email | phone with staffed hours, named partner-service email | 800 number, named programmes | group site publishes investor relations — and a data-breach notice |

---

## 2. What we take

1. **Name the partnership models explicitly.** Fleurop is the only one that does: `Agentur-Partnerschaft` (order placement only) vs `Lieferpartnerschaft` (fulfilment). A florist reading our page needs to know in one line which one we are: we route an order to them, they make and deliver it, we handle the customer.
2. **A staffed human channel with published hours.** Fleurop: phone, a named partner-service mailbox, and "Montag–Freitag, 07:30–17:00". Interflora publishes a phone and a join@ address. A florist deciding whether to trust a new platform wants a person, and 07:30 is a florist's working hour, not an office's.
3. **Benefits framed as the florist's own economics, not ours.** Interflora's "Floral Freedom — control over flower purchasing to utilise seasonal/fresh stock and improve profitability" is the best sentence on any of these pages, because it answers "will this platform make me buy your stock at your prices?".
4. **Concrete operational goods, itemised.** Teleflora's list works because the items are things ("POS system", "answering service", "flower auction", "scholarship academy") rather than adjectives. Ours: order arrives by email/WhatsApp/portal, one-tap accept, photo upload, payout schedule, no software to buy.
5. **Real network numbers where they exist.** Fleurop's "5.500 / 50.000 / 150" and Teleflora's "20,000 + 20,000" are the credibility anchors on those pages. We will have small numbers at launch — publish the small real number ("3 partner florists in Warsaw, accepting orders since March") rather than an adjective.
6. **Keep the recruitment page on the main domain, in the local language.** Interflora and Teleflora both push florists to a separate domain, which sheds all the ranking authority of the consumer brand. `plan/05` row 41 already puts ours at `/for-florists` with `/pl/dla-kwiaciarni` and `/de/fuer-floristen` — the field evidence is that this is uncontested SEO ground ("zlecenia dla kwiaciarni" has no incumbent optimising for it).
7. **A trade-facing "how orders work" walkthrough.** Nobody in the field shows a florist what an incoming order actually looks like. `plan/05` row 43 plus the password-protected `/demo/vendor-inbox` (row 45) is a genuine differentiator: let the florist see the inbox before signing anything.

## 3. What we drop and why

1. **Hiding commission and fees entirely.** All four hide them. Interflora's own "packages" page publishes no package, no price and no percentage; Teleflora's only public numbers are for a marketing add-on. Our fifth priority is operational simplicity and our whole pitch to a florist is that we are not the old relay: **publish the commission split, the payout timing and the fee (if any) on the public page**. This is the single biggest opportunity on this page type.
2. **Adjectives in place of figures** — "excellent sending and executing commissions", "low fees, high commissions", "flexible packages to suit you". A florist reads these as "we will tell you after you have committed".
3. **An external Microsoft Form as the application.** Interflora's "Apply Now" leaves the brand entirely; the fields cannot even be seen before clicking. Ours is a first-party `noindex` form (`plan/05` row 42) with the fields visible on the page beforehand.
4. **No form at all, only a phone number** (Fleurop). Fine for a 1908 brand; fatal for a new one.
5. **A separate recruitment domain** (interflora-membership.co.uk, myteleflora.com). Splits authority, and in Interflora's case the two domains contradict each other on network size ("around 900 florists" on the consumer site vs "over 1000" in the membership material vs "over 30,000" globally).
6. **Selling the florist marketing services on top** (Teleflora's $129/$139/$159 monthly search-marketing programme, the flower auction, the POS). We are the demand channel; we do not monetise the partner twice, and we should say so.
7. **Contradictory network claims across pages.** Interflora's "around 900" / "over 1000" / "over 30,000", 1-800-Flowers' "over 100 countries" / "195 counties [sic]". One number, one source, one place.
8. **Unverifiable testimonials.** None of these pages has any, which is honest. Ours are real-only per the round-6 founder decision — until we have a real partner willing to be quoted, the slot stays empty.

## 4. Open questions for the founder

1. **Do we publish the commission split publicly?** This is the decision that defines the page. A number on the public page is our strongest recruitment asset and our least reversible pricing commitment.
2. **Payout timing and currency.** Florists are paid in local currency (`plan/04` §9 says "the florist is paid in PLN"). What is the published payout schedule — per order, weekly, monthly — and who bears the FX and the payout fee?
3. **Application form fields.** Proposed from `plan/05` row 42: business name, legal form and registry number, VAT status, city and coverage radius (or postcode list), daily capacity, opening days/hours, same-day cutoff they can commit to, photo samples, contact person and phone, preferred order channel (email / WhatsApp / portal), payout details (later stage). Confirm, and confirm which are required before we can reply.
4. **Vetting criteria published or not?** `plan/05` row 26 (`/our-florists`) promises vetting copy to consumers. Do we publish the same criteria to florists, so the application feels like a standard rather than a gate?
5. **Exclusivity.** Fleurop's agency/delivery split exists partly to manage exclusivity. Do we ask a partner for exclusivity in a city, and do we say so on the page?
6. **Partner terms page.** `plan/05` row 44 puts `/legal/partner-terms` at Phase 1 while the landing and form are Phase 0. Is it acceptable to take applications before the partner agreement is published, or does the terms page move to Phase 0?
