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

## Spec 008's five listing and hub page types, one row each

The table above maps a *benchmark file* to the wireframes that read it, and it pairs page types that
share a template. Spec 008 §12 asks for the five listing and hub types to be traceable **one at a
time**, because the decisions differ between them — the shop root and the hubs disagree about
whether a price may appear at all. These rows are drawn against the same 2026-09-09 study; where a
row below and a row above cover the same artboard, the row below is the spec 008 reading and wins.

| Wireframe | Benchmark | What we took | What we dropped | Why |
|---|---|---|---|---|
| `wireframes/country-shop-*.dc.html` | `02-category-and-shop-grid.md` §1, §2.1, §3.1 | A **priced product row first**, before any prose (1-800-Flowers and Fleurop both lead with goods); a composition line under the name (FloraQueen); category tiles carrying a real "from" figure rather than an adjective; the destination's own occasion dates printed in the browse block (1-800-Flowers is the only site in the field that prints a date at all); a short "how it reaches Poland" block **below** the grid, not above it | The date control above the grid and the per-card availability badge — both were taken in round 2 and are **dropped here**, because no destination has a cutoff, a delivery day or a soonest date, and a badge computed from data we do not have is an invented claim; "Best sellers" and "Most sent" as a sort or a nav entry; four sort options; a from-price on a product card; add-to-basket on a card; a company review score above the grid; sale banners and urgency copy | A badge is only honest where `operations` is complete, and spec 006 §14 A4 already fixed that rule for seed copy; "bestsellers" without sales is an unfair commercial practice under Omnibus Art. 6a with a free, honest alternative available (§13 Q3); the card price is the **default tier**, a payable configuration, so it needs no "from" |
| `wireframes/country-category-*.dc.html` | `02-category-and-shop-grid.md` §2.2, §3.2 | Sibling-category links as a chip row of **real authored pages** rather than a facet drawer (Interflora UK's category nav is the only one in the field that survives a crawl); the same listing template as the shop root, so a buyer who has learned one page has learned all six; one short cross-border paragraph under the grid | Indexable facet URLs and colour/price filters (the field generates thousands); "load more"; a per-category hero photograph we do not have; a category page for a category with three products | `plan/02` §7: a facet worth ranking gets a real authored path, and everything else is a parameter that is parsed, neutralised and canonicalised. The six-product floor is applied to **existence**, so a thin category has no URL to be thin at (§13 Q7) |
| `wireframes/country-occasion-*.dc.html` | `05-occasion-pages.md` §1, §2.3 | The occasion's date for **that destination**, printed on the page as a sentence (1-800-Flowers prints "Labor Day (9/7)"; nobody else prints a date at all); the occasion treated as a listing with its own copy rather than a re-labelled category; name day as a first-class Polish occasion | A countdown or "order in time" urgency device; occasion × destination generated combinatorially; an emotional-filler intro; a discount as the conversion hook; cross-sell into cakes and alcohol | A countdown may only come from real cutoff data (`plan/07` §4) and we have none; the combinatorial explosion is the doorway pattern the study found at every scale, and the floor plus the observed flag is what keeps our set to the pages a human would want |
| `wireframes/category-hub-*.dc.html` | `02-category-and-shop-grid.md` §3.1 · `03-destination-and-corridor-pages.md` §2.1 | A grid with **no prices at all**, which FloraQueen's Poland grid also does — but with the sentence FloraQueen never writes, saying why there is none; the destination asked for **first**, above the products (`plan/04` §4); the three-sentence cross-border explanation as the intro's spine | FloraQueen's silent priceless grid; a converted "from €X" minimum across countries; a country-less categories index (`/{locale}/flowers` is a 404); a destination list padded out with countries we cannot serve | A cross-country minimum converted at today's rate is a price no configuration matches — the precise shape the Price Indication Directive and the DMCC drip-pricing ban exist to prevent (005 §13 Q10, binding); a page that shows no price must say why, which is the one condition the study's §3.1 attaches to a priceless grid |
| `wireframes/occasion-hub-*.dc.html` | `05-occasion-pages.md` §2.1, §3.1 | The per-country **date table** — the study's single largest open goal: Mother's Day is four different dates across our seven destinations and not one competitor publishes them together; a reference table rather than an essay (Interflora UK's birth-flower table is the model); the countries that have a page rendered as links against the ones that do not, rendered as text with their state said plainly | Occasion pages with no dates (the field's default); a single "Mother's Day" date presented as universal; `Event` schema on a date we do not host; an occasion reminder email field, which is a personal-data flow spec 007 §13 Q4 already deferred | "Mother's Day is three different days for one cross-border buyer" is the problem we exist to solve, and a wrong date here is worse than no page — which is why every cell is `occasionDate(rule, year)` and why Romania's Orthodox Easter is printed as *omitted*, not guessed |

## Spec 009's product page, one row

Spec 009 §12 asks for the PDP to be traceable on its own, for the reason the spec 008 rows exist:
the decisions moved. The row below is drawn against the same 2026-09-09 study and against the
**2026-09-16 founder resolution**, and where it and the `product-*` row in the first table disagree,
**this row wins** — the first table is the round-2 reading, this one is spec 009's.

| Wireframe | Benchmark | What we took | What we dropped | Why |
|---|---|---|---|---|
| `wireframes/product-*.dc.html` | `01-product-page.md` §2.1, §2.3, §2.4, §2.6, §2.9, §3.1, §3.3, §3.9 | **The fee printed on every selectable date, not only the surcharged one** — FloraQueen's "Tomorrow 10 September €8,90" is the only place in the field where money sits next to a day, and ours is the same element with nothing left to add (`plan/04` §7). **The cutoff stated in the recipient's time zone** — 1-800-Flowers' "by the following times in your recipient's time zone"; ours reads "Order by 14:00 in Warsaw — the recipient's time, not yours", absolute, with the city named. Also kept: stem-count tiers over adjectives; the substitution sentence on the page rather than in Help; a closed date carrying its reason **in words** before it is chosen; Fleurop's regional-holiday warning made **factual per destination** instead of "it might be"; "what the price does not include: a vase" (Euroflorist PL); an availability state that is a sentence and a way onward rather than a dead end | **The live countdown** — taken in round 2 from Interflora PL's "Zamówisz w ciągu …", and dropped here **for a caching reason rather than an ethical one**: the PDP is served from cache for up to an hour (300 s once live), so a countdown is wrong within a minute of being rendered and a cached relative "Today" is wrong after destination-midnight. Both would be *false statements rendered by us, by a template, at scale, in four locales*. Also dropped: the struck-through "regular price" on every tier; a shared review pool presented as this product's; the delivery fee revealed at date selection or checkout; a percentage service fee in fine print; "BESTSELGER" on a fixed middle tier; date and address deferred to the basket; a client-rendered price and schema. And three things this round removes from our own draft: the **"Continue" button** and the **add-on checkboxes** (there is no basket), and the **withdrawal-right sentence** and the **photo-on-delivery promise** (lawyer-gated and spec-027-gated) | Drip pricing is banned by the UK DMCC and breaks `plan/07` §4, and the date chip is where we either keep that promise or break it. The countdown is the one item the study made a *must-have* that we now decline: `plan/07` §4 permits one only from real cutoff data, and cached HTML cannot carry a truthful clock — so it returns in Phase 1 with the shorter revalidate window and the scheduled cutoff purge, not as a client timer that would make the JS page say something the no-JS page does not. The three removals from our own draft follow the same rule the whole directory runs on: **a block whose backing is missing renders nothing** |

`wireframes/how-it-works-*.dc.html` draws on `03-destination-and-corridor-pages.md` §2.1 and §2.2
(the three-sentence explanation and the customs answer); `wireframes/category-hub-*.dc.html` has its
own row in the spec 008 table above. `wireframes/blog-*`, `wireframes/errors-*`,
`wireframes/locale-chooser-*` and `wireframes/legal-template-*` took only the voice pass; the study
has nothing to say about them.

## The ten patterns, and where each one landed

| # | Pattern (`00-summary.md`) | Where it is now |
|---|---|---|
| 1 | Destination and date before the basket | The destination in the URL and the date on `product-*`, never deferred to the basket; the date carried into step 1 of `checkout-*`; `flows/buyer-journey.dc.html` step order. The **numbered 1–2–3 gating is gone** with the "Continue" button it gated — in Phase 0 there is no basket, so there is nothing to gate |
| 2 | The fee printed next to each selectable date | Every chip on `product-*` prints "included" or its exact amount ("+£5.00" on Women's Day, Mon 8 Mar 2027, from the committed 25 zł `peak_day` row); the same chips repeat in `checkout-*`. **Not** above the grid on `country-shop-*` any more — spec 008 dropped the date control with the badge, because no destination has a cutoff |
| 3 | Nobody charges what they display | The all-in price on every card and every tier, the "nothing is added at the next step" line on `product-*`, and the one total in `checkout-*` step 3 |
| 4 | The three-sentence cross-border explanation | `how-it-works-*` (as the opening), `corridor-country-*` (under the H1), the below-grid block on `country-shop-*` and `country-category-*`, and the homepage's "How we send your flowers" section |
| 5 | Cutoffs in the recipient's time zone | The **absolute** cutoff line on `product-*` ("Order by 14:00 in Warsaw — the recipient's time, not yours"), the cutoff table on `guarantee-and-delivery-*`, and the timeline on `track-order-*`. The **countdown tile is gone** (spec 009 §13 Q4) and so is the cutoff sentence in `product-*`'s utility strip, which promised same-day delivery to a destination with no florist |
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

15. **The default product order, and what it is called.** The artboards label it **"Our order"**
    with one sentence saying it is not a ranking by sales, popularity or payment. The shipped
    `topProductsForPrebuild()` orders by product *name* through `collator(locale)`, not by a
    founder-set curation index — so the label is honest but the order is alphabetical, and a
    Polish reader gets a different first row from an English one. Confirm the label, and say
    whether the curation index is authored before 008 ships or after. (`02` §4.1, spec 008 §13 Q3)
16. **The date and badge row is gone from the shop grid.** Round 2 took "date controls above the
    grid" and a per-card "DELIVERY TODAY" badge from Interflora UK and InternetFlorist. Neither
    survives Phase 0: no destination has a cutoff, a delivery day or a soonest date. Confirm that
    the grid stays badge-free until a country is genuinely operational, rather than showing a
    date control that cannot be honoured. (`02` §2.1, §4.3)

17. **Four shipped strings still promise same-day delivery to Poland.** `nav.utility.cutoff`
    ("Order by 14:00 in Warsaw for delivery today"), `nav.utility.cutoffShort`, `finder.cutoff` and
    `faq.whoDelivers.answer` are all in `messages/en.json` today, and every one of them states a
    cutoff and a same-day promise for a destination whose picker says, one screen later, that we
    cannot offer a delivery date at all. The spec 009 artboards drop the sentence from the product
    page's own chrome, but the four keys are chrome and FAQ copy that spec 004 and spec 007 own.
    **Either they are rewritten to the honest form, or they are gated on `pickerState() === 'live'`
    the way the picker is.** (`01` §2.3, spec 009 §8)
18. **The Sunday surcharge can never apply in Poland.** `prices.data.ts` carries an 18 zł `sunday`
    surcharge row for every product in PL, and §13 Q3's authored `operations` block sets
    `sundayDelivery: false` — so no Sunday is ever selectable and the 18 zł is unreachable. The
    artboards print it on the closed Sunday chips, because it is real committed data and hiding it
    would make the sheet lie about the dataset. **Either the surcharge rows come out, or Poland
    delivers on Sundays at 18 zł.** The same question applies to the six other destinations, whose
    surcharge rows exist and whose `operations` blocks do not. (`01` §4.3, spec 005 §2)
19. **The surcharge on a chip is a difference of two totals, not a converted fee.** Women's Day,
    Monday 8 March 2027 carries a committed 25 zł `peak_day` row. At `en-gb` that is £4.96 by the
    rate and **£5.00** by the rounding ladder, which is what the chip prints, because the only
    honest figure is `priceProjection(withDate) − priceProjection(withoutDate)` — the number the
    buyer's total actually moves by. **Confirm the chip prints the delta of two projections**, not a
    converted surcharge, and that the summary's surcharge line uses the same figure. (`01` §2.1)
20. **Add-on prices have no display-currency projection.** `listAddons()` and
    `addon_country_price` give a destination-currency amount and its own VAT rate; spec 005 exports
    no add-on equivalent of `priceProjection()`, so the artboards print "25 zł" beside a £46.90
    bouquet. That is honest and it is also two currencies on one page. **Either spec 010 adds an
    add-on projection, or the list stays in the destination's currency with a sentence saying so.**
    (`01` §2.7, spec 005 §5.2)
21. **Does the 7-day freshness guarantee render on the product page?** `trust.guarantee.name` and
    `trust.guarantee.claim` are shipped copy ("7-day freshness guarantee" / "We redeliver or
    refund, your choice."). Spec 009 §2 names only the substitution sentence as the Phase 0 trust
    claim, so the artboards draw one claim and no more. The guarantee is a statement about how we
    work rather than a promise about a florist we do not have, so it is arguably in the same class
    as substitution. **Confirm one claim or two.** (`01` §2.5, spec 009 §13 Q7)

## The 2026-09-21 measurement pass — a second study in this folder

The nine `.md` files above are the **content** study: what competitors say and show, read on
2026-09-09. They measured no pixels. On 2026-09-21 the founder said the site looks worse than the
competition and called it cluttered, and a second pass was run to test that sentence with numbers
instead of taste. It measures **space**: chrome height, how far down the first product photograph
starts, the photograph's share of a card, and how many live links a page carries — for us and for
four competitors, at 1280×900 and 375×812, read from the live DOM with `getBoundingClientRect()`.

Its output is seven artboards in this folder and one argued change list:

| Artboard | What it holds |
|---|---|
| `benchmark-measurements.dc.html` | Every figure, drawn to scale: the two chrome comparisons, the listing table, the home-page table, and the list of things this study measured and decided **not** to change. |
| `benchmark-home-desktop.dc.html` · `benchmark-home-mobile.dc.html` | The locale home, current and proposed, 1:1 at each width, with the change list beneath. |
| `benchmark-listing-desktop.dc.html` · `benchmark-listing-mobile.dc.html` | The country shop root, same treatment. The mobile one carries the study's worst measurement and its clearest case for change. |
| `benchmark-product-desktop.dc.html` · `benchmark-product-mobile.dc.html` | The product page. **Not shipped and not measured** — our side is `wireframes/product-*.dc.html` redrawn at the two widths, and the comparison is of block order. |

The argued change list, with each change marked a fact-preserving rearrangement or a removal, is
`../competitor-benchmark-2026-09.md`.

**These seven are decision artefacts, not build targets.** When the founder approves a change it is
redrawn on the owning page wireframe — `homepage-v1/homepage-*.dc.html`,
`wireframes/country-shop-*.dc.html`, `wireframes/product-*.dc.html` — and *that* is what an
implementer matches. Nothing under `wireframes/` is changed by this study until that happens.

Four sites were measured: FloraQueen, Interflora UK, Euroflorist NL and Bloom & Wild. The first
three are `plan/02` §1's own set. Bloom & Wild is a deliberate addition rather than a substitution:
it is not cross-border, and it is the visual standard a European buyer's eye is calibrated by,
which is the comparison the founder's complaint is actually running.

## Related

- `docs/design/README.md` — the design rules these wireframes obey, the Voice section quoting spec
  004 §14 A5, and the Density section this round added.
- `specs/004-design-system-layout.md` §14 A5 — the brand-voice amendment that is binding on every
  word on every artboard.
- `plan/04-ux-conversion-spec.md`, `plan/07-compliance.md` §4 — the rules the study was read against.
- `docs/research/competitors-direct.md`, `competitors-global-and-serp.md`,
  `competitors-national.md` — the 2026-09-05 browser reads the blocked sites fall back to.
