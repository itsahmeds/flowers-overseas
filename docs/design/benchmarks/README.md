# `docs/design/benchmarks/` — the competitor study, and what each page type took from it

Round 2 of TASK-059 (the competitor pass). Nine files, read on **2026-09-09**, covering eight page
types across 1-800-Flowers, InternetFlorist, Euroflorist, Interflora (UK / PL / FR / EE / Fleurop
DE), FloraQueen, Bloom & Wild, Teleflora and Poczta Kwiatowa. `00-summary.md` carries the ten
patterns that matter, the five trust-destroying patterns, and a per-page must-have list; the eight
numbered files carry the per-competitor tables, the take/drop decisions with their sources, and the
questions only the founder can answer.

**These files are evidence, not instructions.** Where the study and `CLAUDE.md` disagree, `CLAUDE.md`
wins; where the study and a spec disagree, the spec wins until an ADR says otherwise. Nothing here
was copied into a wireframe without being checked against the honesty rules in
`docs/design/README.md`.

## Each page type → its benchmark file → what we took and dropped

| Wireframe | Benchmark | What we took | What we dropped | Why |
|---|---|---|---|---|
| `wireframes/product-*.dc.html` | `01-product-page.md` | The fee printed on **every** date chip, not only the surcharged one (FloraQueen is the only site in the field that prints money next to a day); numbered, gated steps 1 destination → 2 date → 3 size (InternetFlorist); the cutoff stated in the **recipient's** time zone (1-800-Flowers); stem-count tiers; substitution and the photo promise on the page rather than in Help; a closed date carrying its reason; "what the price does not include: a vase" (Euroflorist PL) | Struck-through "regular price" on every tier; a shared review pool presented as this product's; the delivery fee revealed at date selection or checkout; a percentage service fee in fine print; adjective tiers; "BESTSELGER" on a fixed middle tier; date and address deferred to the basket | Drip pricing is banned by the UK DMCC and breaks `plan/07` §4; seeded or pooled reviews are UCPD/Omnibus blacklist items and the founder ruled real-only on 2026-09-08; a reference price never charged is a misleading omission |
| `wireframes/country-shop-*.dc.html`, `wireframes/country-category-*.dc.html` | `02-category-and-shop-grid.md` | Date and destination controls **above** the grid rather than in a filter drawer (Interflora UK); a per-card availability badge computed from the destination cutoff (InternetFlorist "DELIVERY TODAY", Fleurop "Noch heute lieferbar"); a composition line on the card (FloraQueen); four sort options and no more; a short honest "how delivery works" block plus city and sibling-occasion links under the grid | A grid with no prices at all (FloraQueen's Poland grid); add-to-basket on the card; indexable facet URLs; one product grid recycled across every destination; a company review score pasted above every grid; sale banners and "jeszcze zdążysz" urgency; a newsletter discount interstitial | Every card must carry an all-in price in the buyer's currency (priority #3); the date must be chosen before the basket (`plan/04` §6); facets are query params and `noindex` (`plan/02` §7); we have no discount programme and inventing one is the fastest way to look like the incumbents |
| `wireframes/corridor-country-*.dc.html`, `wireframes/all-destinations-*.dc.html` | `03-destination-and-corridor-pages.md` | The cross-border explanation in **three sentences** high on the page (Interflora PL, Euroflorist PL); the customs fear answered explicitly, as its own FAQ row; the settlement currency stated plainly; "no hidden fees" as a promise we can actually keep (Interflora PL); named cutoffs and destination public holidays (Interflora UK, Fleurop); country-specific address format (InternetFlorist's Polish-address note — the single most useful piece of country content in the field); hospital, funeral and office rules; a real florist count or none (Fleurop); featured-then-A–Z destination lists; `FAQPage` + `BreadcrumbList` + `ItemList` | Country pages for countries we cannot serve (`florist-antarctica`, 12,610 `flowers-{city}` collections, ~240k origin×destination URLs); domestic inventory in the sender's currency; publishing no country URLs at all (Fleurop); template variables pointing at the wrong country; handing the buyer to a sister site; display-only multi-currency with foreign settlement; unverifiable network claims | A page exists for a live destination or an honest guide, never because it appears in a list; origin×destination multiplication is a doorway pattern and our locale already encodes the origin; one number, one source (`plan/04` §3) |
| `wireframes/checkout-*.dc.html` | `04-checkout.md` | Express wallets **above the first field**, naming the amount; guest by default with the account offered only after payment (Interflora FR's explicit "continue as a guest"); each step preceded by the reason we are asking; worked-example placeholders in the destination's address format (Euroflorist NO); the recipient phone framed as the thing that rescues a failed delivery, with a non-sharing promise; a hospital/hotel/funeral/office toggle revealing only the fields that address needs; the card message stated as free and hand-written by our florist (Euroflorist PL); a live grapheme counter; the date carried from the product page with the same fee on the chip | Fees appearing at date selection or the pay step; "no modification or cancellation under any circumstances" (FloraQueen); substitution "without notice" (Interflora UK); a 24-hour buyer-supplied-photo condition; a published "97% probability"; account- or social-login-first checkout; a delivery-pass upsell inside the flow; test artefacts on the production domain | The product-page total must equal the checkout total; an absolute bar on amendment is not lawful in the EU/UK, so we publish a real amendment window tied to the destination cutoff; with all-inclusive pricing there is no drip fee for a delivery pass to make tolerable |
| `wireframes/occasion-hub-*.dc.html`, `wireframes/occasions-index-*.dc.html`, `wireframes/country-occasion-*.dc.html` | `05-occasion-pages.md` | Occasions split into **dated** and **everyday**, with the date printed per destination country (1-800-Flowers prints "Labor Day (9/7)" and is the only site that prints a date at all); a reference table rather than an essay (Interflora UK's birth-flower table); name day (imieniny) as a first-class Polish occasion (Euroflorist PL); a substantial FAQ including the two questions nobody answers — anonymous sending and workplace delivery; an occasion reminder with double opt-in; occasions authored per market, never translated out of English | Occasion pages with no dates; occasion × destination generated combinatorially; emotional filler as the whole intro; manufactured urgency as the hook; a newsletter discount as the conversion device; cakes and alcohol cross-sell; "Plant Mood" style tags as indexable collections | Mother's Day is three different days for one cross-border buyer, which is the whole problem we exist to solve; a countdown may only come from real cutoff data (`plan/07` §4); our email capture is the reminder, not a coupon |
| `wireframes/for-florists-*.dc.html` | `06-for-florists-recruitment.md` | The model named in one line; the commission split, the payout timing and any fee **published on the page**; itemised operational goods rather than adjectives (Teleflora's list works because the items are things); a staffed human channel with a florist's hours, 07:30 (Fleurop); benefits framed as the florist's own economics (Interflora's "Floral Freedom" is the best sentence on any of these pages); the inbox demo linked before anything is signed; small real numbers or none | Hiding commission and fees entirely (all four incumbents do); adjectives instead of figures; an external Microsoft Form as the application; a separate recruitment domain; selling the florist marketing services on top; contradictory network claims; unverifiable testimonials | Publishing the split is uncontested ground and it is our whole pitch; a separate domain sheds the consumer brand's authority; we are the demand channel and we do not monetise a florist twice |
| `wireframes/confirmation-*.dc.html`, `wireframes/track-order-*.dc.html` | `07-track-and-confirmation.md` | A stated deadline for the delivery confirmation (1-800-Flowers, "by 8PM in the recipient's time zone"); the post-purchase experience announced **pre**-purchase (Euroflorist NO's SMS promise); a photo tied to a complaint window (Aquarelle); explaining honestly why there is no carrier tracking number (FloraQueen admits the gap and does not fill it); a what-happens-next timeline; reorder as a first-class action; disallowed routes enumerated per locale prefix | Tracking behind a login; "we do not process refunds"; charging the buyer for redelivery; "we are not responsible" as the failed-delivery policy; a 24-hour photo-evidence burden; a one-working-day complaint window; a marketing gallery of recipient photos in place of per-order proof; silence between "paid" and "delivered" | No competitor offers no-login tracking, which makes `/track/{token}` free ground; we hold the photograph, so pushing the evidentiary burden onto the buyer is both unnecessary and hostile; if our routing failed the buyer does not pay twice |
| `wireframes/about-contact-help-*.dc.html`, `wireframes/guarantee-and-delivery-*.dc.html`, `wireframes/legal-template-*.dc.html` | `08-help-contact-and-legal.md` | Full legal identity in one findable place (Interflora PL publishes form, address, NIP, REGON, KRS); contact hours actually stated, including the weekend (Interflora PL runs Sunday 12–17 — flowers are a weekend product); one complete delivery-information table with every cutoff, day and holiday (Interflora UK's page is the best single artefact in the study); a named substitution policy document; a refund commitment with a clock; help topics organised by the buyer's moment; `FAQPage` schema; dispute-resolution and ODR information | `noindex` on the FAQ that carries the cutoffs (1-800-Flowers); support with no phone and no email; contact channels with no hours; incomplete seller identity; absolute cancellation bars and blanket refund refusals; 230 auto-generated per-country FAQ pages; terms that contradict the storefront | Every page that answers a query should be indexable (priority #1); the EU/UK information duties in `plan/07` §6 are not optional, and not one site in the study publishes ODR information — the field's silence is a compliance gap, not a precedent |

`wireframes/how-it-works-*.dc.html` and `wireframes/category-hub-*.dc.html` draw on
`03-destination-and-corridor-pages.md` §2.1 and §2.2 (the three-sentence explanation and the customs
answer) and on `02-category-and-shop-grid.md` §3.1 (a grid with no price is only acceptable when the
page says *why* there is no price). `wireframes/blog-*`, `wireframes/errors-*`,
`wireframes/locale-chooser-*` and `wireframes/legal-template-*` took only the voice pass; the study
has nothing to say about them.

## The ten patterns, and where each one landed

| # | Pattern (`00-summary.md`) | Where it is now |
|---|---|---|
| 1 | Destination and date before the basket | Numbered steps 1–2–3 on `product-*`; the date control above the grid on `country-shop-*`; the date carried into step 1 of `checkout-*`; `flows/buyer-journey.dc.html` step order |
| 2 | The fee printed next to each selectable date | Every chip on `product-*` prints "included" or "+29 zł"; the same chips repeat in `checkout-*` and above the grid on `country-shop-*` |
| 3 | Nobody charges what they display | The all-in price on every card and every tier, the "nothing is added at the next step" line on `product-*`, and the one total in `checkout-*` step 3 |
| 4 | The three-sentence cross-border explanation | `how-it-works-*` (as the opening), `corridor-country-*` (under the H1), the below-grid block on `country-shop-*` and `country-category-*`, and the homepage's "How we send your flowers" section |
| 5 | Cutoffs in the recipient's time zone | The utility strip on every artboard, the countdown tile on `product-*`, the cutoff table on `guarantee-and-delivery-*`, and the timeline on `track-order-*` |
| 6 | Country pages as the SEO backbone | `corridor-country-*` (live and guide states on one artboard) plus `all-destinations-*` featured-then-A–Z; seven destinations, not 143 |
| 7 | The unique country content is practical, not lyrical | The four-tile "Practical, for Poland" block on `corridor-country-*`: address format, hospitals, funerals, offices |
| 8 | Occasions are the dominant query class and the calendar is mishandled | Dated vs everyday on `occasion-hub-*`; the three-country date table on `occasions-index-*`; the date and cutoff in the header category row on every artboard; the destination's date on `country-occasion-*` |
| 9 | Post-purchase is empty ground | The four take-aways and the complaint clock on `confirmation-*`; the four problem actions and the photo deadline on `track-order-*` |
| 10 | Florist recruitment is a marketing page with no numbers | The published payout example, the nine visible form fields and the new human-channel block on `for-florists-*` |

The five trust-destroying patterns are absent by construction: drip pricing (one all-in number,
asserted by `resolvePrice`), fabricated reviews (no review block renders below three verified ones),
contracted-away remedies (the amendment window and the guarantee are printed, not buried),
unverifiable numbers (the `Placeholder` bar renders no digits), and production pages that reveal the
machine (`[slot]` markers, and no artboard shows a generated string as if it were content).

## Still open — the founder's, not the designer's

These come from the eight files' §4 sections. The wireframes are drawn so that each answer is a data
or copy change, never a re-design; where an answer is missing, the artboard shows a `[slot]` and
names it here.

1. **Staffed hours, including the weekend.** The utility strip and the footer publish Mon–Sat 8–20
   CET. Interflora PL staffs Sunday 12:00–17:00, and Sunday is when deliveries fail. What are the
   real hours at launch? (`08` §4.1)
2. **The commission split, the payout schedule and who bears the FX.** `for-florists-*` publishes an
   example with every line shown; the numbers in it are `[slot]`. This is the least reversible
   pricing commitment on the site. (`06` §4.1, §4.2)
3. **The refund clock.** `guarantee-and-delivery-*` says "full refund within `[slot] N days` of the
   date you chose". Interflora UK publishes seven. (`08` §4.3)
4. **Dispute resolution and ODR.** `about-contact-help-*` carries the block with a `[slot]`: which
   body per market, and does an Estonian OÜ selling into the UK, Germany and Poland need more than
   one? (`08` §4.4)
5. **The complaint window, measured from our delivery photo.** `confirmation-*` and `track-order-*`
   both say `[slot] N hours`. The field runs 24 h (with buyer-supplied photos), 48 h and one working
   day. (`07` §4.1, `01` §4.5)
6. **"From" price on cards versus the default tier.** The round-2 grids print a single all-in price
   per card rather than "from", because price shown = price charged. Confirm that the card shows the
   **default** tier and not the cheapest. (`02` §4.1)
7. **A bestseller badge before real order counts exist.** The grids show "our picks", labelled.
   Confirm that tier badges follow the same gate as "Most sent this week". (`01` §4.1)
8. **The vase.** `product-*` states "what the price does not include: a vase" and sells one as an
   add-on. Confirm, or photograph bouquets without vases entirely. (`01` §4.2)
9. **Anonymous sending and workplace delivery.** Both are now answered in the FAQ on
   `country-occasion-*`; neither is in `plan/04` yet. Confirm the answers before 008 ships them.
   (`05` §4.2, §4.3)
10. **Funerals and hospitals in Phase 1 for Poland.** `corridor-country-*` publishes rules for both,
    and both carry real operational risk (timed delivery, ward access). In or out for the first
    destination? (`03` §4.6, `05` §4.4)
11. **Same-day on the product page** — promised from Phase 1 for Poland, or held until florist
    capacity is measured? (`01` §4.3)
12. **The public name of the florist agreement.** `plan/05` row 44 calls the URL
    `/legal/partner-terms`; A5 bans "partner" from customer copy, so the artboards label the link
    "Terms for florists". Either the slug changes or the label and the slug differ — a founder call,
    and the only place in this pass where a spec and A5 pull against each other.
13. **How many destinations at launch** — live only (few, strong) or live plus guides (more,
    crawlable)? The artboards draw one live and six guides. (`03` §4.2)
14. **Do we ever show a discount at all?** The whole field leads with sales. The founding-customer
    offer is our only planned incentive. (`05` §4.6)

## Related

- `docs/design/README.md` — the design rules these wireframes obey, the Voice section quoting spec
  004 §14 A5, and the Density section this round added.
- `specs/004-design-system-layout.md` §14 A5 — the brand-voice amendment that is binding on every
  word on every artboard.
- `plan/04-ux-conversion-spec.md`, `plan/07-compliance.md` §4 — the rules the study was read against.
- `docs/research/competitors-direct.md`, `competitors-global-and-serp.md`,
  `competitors-national.md` — the 2026-09-05 browser reads the blocked sites fall back to.
