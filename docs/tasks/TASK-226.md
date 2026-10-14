# TASK-226 — Buyer copy without relay wording

Row: `TASKS.md` → TASK-226. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Keep it current by editing this
file, not the row.

## Binding

- **Founder ruling, 2026-10-14 (verbatim in `docs/decisions-log.md`):** buyers never learn we relay to partner florists; no "partner", no florist accepting or declining, no offers, re-routing, "another florist", "no florist", "finding a florist", and no card hold wording. The voice stays "we" send it, "our florist" makes it.
- **Founder copy approval, 2026-10-14, in chat ("3 ok"), exactly these `en` texts:**
  - `home.howItWorks.make.title` → "Our florist nearby makes it that morning."
  - `corridor.facts.orderBy.none` → "None yet." (also removes the em dash; drop its entry from `tests/support/forbidden-phrases.ts` `PHRASE_EXCEPTIONS`)
  - the ten guide FAQ answers to "Can you deliver to {country} today?" / "Can you send flowers to {country} now?" in `content/corridors/{en,en-gb}/*-guide.md` → "Not yet. Ordering for {country} is not open. When it opens, this page shows the delivery days and the order-by time." (country name filled per file; drop their `PHRASE_EXCEPTIONS` entries)
  - `checkout.price.currencyLine` → "You pay in {buyerCurrency}." (spec 010 §14 A4)
  - The founder approved these texts in chat on 2026-10-14, but the agent marks nothing reviewed itself: ship them `reviewed: false`, and the orchestrator hands the founder a record-approval script for their own commit (spec 003 A17 clause 5).
  - `de` and `pl`: replace the same keys and FAQ answers with machine drafts of the new text (`source: machine`, `reviewed: false`); no English left in `de`/`pl`.
- **Glossary:** `content/i18n/glossary.en.md` lines ~34 and ~67 tell translators to write "partner florist" and never "our florist(s)": rewrite so buyer-facing copy uses "our florist"; "partner florist" only for florist, admin and founder surfaces.
- **The em dash** in the product date picker (seen 2026-10-14): find its key and replace it with a full stop or comma, same review handling.
- **The scan:** `RELAY_PATTERNS`, `RELAY_EXEMPT` and `relayMatches` in `src/config/honesty.ts` exactly as spec 041 §14 A-founder-2026-10-14 defines them, plus (a) a unit test over every `en`, `en-gb`, `de`, `pl` message value outside `RELAY_EXEMPT` (spec 010 AC-51) and (b) an e2e scan of the rendered text and `alt`/`aria-label`/`title` of the home, a product, a country shop, a country category, a country occasion and a guide page in all four locales (spec 041 AC-30, site-wide half). Each goes red when one banned phrase is put back.

- **Founder copy approval, 2026-10-14 ~17:20Z, in chat ("R ok"): the second batch, exactly the `en`/`en-gb` texts in the table below (the sheet the founder approved) (rows R2, R3, R4, R6/R7, R9, R10, R11, R12, R15a, R15b, R16, R17, R18, R19, R20, R21, R22, R23, R24).** Same handling as the first batch: ship `reviewed: false`, `de`/`pl` get machine drafts (`source: machine`), the founder records the approval with the orchestrator's script. Where a row's "Now" text is not found verbatim, or where the same giveaway appears in a place the row does not name, record it in Escalations instead of writing new copy. R12's new text is "A bottle of local wine, where local law allows it." This widens the fence to the files those rows name: `messages/*.json` keys, `seed/data/copy/{en,en-gb,de,pl}/{categories,occasions,products}.json`, `content/corridors/{en,en-gb}/*-guide.md` (bodies, FAQs, seoDescription).

  The approved table, verbatim (R12 amended as stated):

  | # | Where buyers see it | Now | New |
  |---|---|---|---|
  | R2 | Home, "proof" block | Independent shops we chose ourselves | Made by our florist, a few streets from their door. |
  | R3 | Home, destinations | We open each country only once we have local florists there we can stand behind. | We open one country at a time, and only when we can promise the same flowers and the same care. |
  | R4 | Destinations page intro | We open a country only once we have chosen the florists ourselves, so the guide comes first and the delivery comes after it. | We write the guide first and open delivery after it. |
  | R6/R7 | Every country guide, "how it works" step 2 | We choose every one of them ourselves and we visit before we open a country. They see the recipient's address and your card message, and nothing else about you. | Our florist sees the recipient's address and your card message, and nothing else about you. |
  | R9 | Checkout demo notice | …to show how an order reaches our florist… | …to show how ordering works… |
  | R10 | Product pages, soft toy add-on | A small soft toy, chosen by the florist from what they have in stock. | A small, new soft toy, chosen to suit the bouquet. |
  | R11 | Product pages, chocolates add-on | A box of chocolates, sourced by the florist who makes the bouquet. | A box of good chocolates, delivered with the flowers. |
  | R12 | Wine add-on (not shown yet) | A bottle of local wine, where the florist is licensed to sell it. | A bottle of local wine, where local law allows it. |
  | R15a | English guides (7), "what we can tell you today" section | We are still choosing the shops we want to work with… until one of them has agreed… | We are not delivering in {country} yet. When we start, this page will show the cities, the order-by time and what happens on the day. |
  | R15b | English guides, single lines | "the shop counts it correctly" / "if you leave the composition to the shop" / "We are talking to shops we admire." / heading "Heat, hours and what a shop will agree to" | "our florist counts the stems for you" / "if you leave the composition to our florist" / (line cut) / "Heat, hours and timing" |
  | R16 | British guides (7), FAQ "Who am I buying from?" | Your contract is with us, not with the shop that makes the bouquet. (Germany: "not from whichever shop ends up making the bouquet") | You buy from us, Flowers Overseas, and we look after everything, in English, from order to doorstep. (And "whoever carries the flowers" is cut.) |
  | R17 | Funeral flowers page | If you tell us the funeral home or the cemetery, we pass the details on and the timing is checked against the service. | Tell us the funeral home or cemetery and we time the delivery to the service. |
  | R18 | Gift sets page | …bought by the same florist who makes the flowers. | …chosen to go with the flowers and delivered together. |
  | R19 | Sant Jordi occasion | We cover it where we have a florist in the city… | The Barcelona page shows whether we deliver for Sant Jordi this year. |
  | R20 | Wedding occasion | For anything more, a local florist should be booked directly, months ahead. | For bridal flowers and venue work, book a wedding florist months ahead. |
  | R21 | Valentine's | Red roses cost more that week because they cost our florists more | Red roses cost more that week, everywhere in Europe. |
  | R22 | A few product descriptions | "come from our florist's own shop" / "trust the shop than the catalogue" / "what is in the shop" / "depends on the shop" / "outside the season our florist tells us before we take the order" | "come from our florist" / "trust our florist" / "what is freshest that day" / "depends on the day" / (cut) |
  | R23 | British guides, Google description | …who you buy from and what we can honestly do today | …with sterling prices and what we can do today. |
  | R24 | FAQ and shop lines | "Our florists…" (plural) | "Our florist…" (singular, your approved voice) |

- **Founder copy approval 2026-10-15 ('yes go ahead'), batch 3.** The founder's words, in chat on 2026-10-15, answering `.claude/state/relay-copy-batch-3.md`: "yes go ahead. keep working hard. get everything ready ang top notch till morning". Rows B1 to B89 below, exactly as written. Same handling as batches 1 and 2: everything ships `reviewed: false`, `de`/`pl` get machine drafts, and the founder records all three batches with one run of `.claude/state/record-approval-226.py`. The orchestrator's picks on the sheet's three decisions:
  1. In each English guide, cut the second paragraph of "What we can honestly tell you today" (it now repeats the first).
  2. The em dashes in product `seoTitle`s are **not** this task's. They feed `<title>`, so they become a separate SEO task.
  3. "Shop" stays only for general facts about the country ("shops close on Sunday"). It is never the maker of the buyer's bouquet. Headings such as "What a French shop is good at" become about the country's flower culture ("What French florists are known for"). Each heading change is listed in Result.

| # | Where buyers see it | Now | Proposed new |
|---|---|---|---|
| B1 | FO-BQ-011, product description (R22, without "freshest") (`seed/data/copy/en/products.json`, FO-BQ-011) | the paper and tie change with what is in the shop. | the paper and tie change with the day. |
| B2 | FO-GS-003, product description (R22, without "freshest") (`seed/data/copy/en/products.json`, FO-GS-003) | We hold the blue scheme; the flowers and the toy are chosen by our florist from what is in the shop, and the toy is new and tagged. | We keep the blue scheme; the flowers and the toy are chosen by our florist on the day, and the toy is new and tagged. |
| B3 | FO-BQ-019, product description (R22; the plain cut left 59 words) (`seed/data/copy/en/products.json`, FO-BQ-019) | Peonies are always the flower; outside the season our florist tells us before we take the order rather than after. | Peonies are always the flower, in season from late spring into early summer. |
| B4 | FO-AR-010, product description (R22 variant) (`seed/data/copy/en/products.json`, FO-AR-010) | Peonies are always the flower; where the season has ended our florist tells us before we take the order. | Peonies are always the flower, in season from late spring into early summer. |
| B5 | Peonies category page (R22 variant; also loses two em dashes) (`seed/data/copy/en/categories.json`, peonies) | The season is short — a few weeks in late spring — and outside it our florist tells us before we take an order rather than substituting something else. | The season is short, a few weeks in late spring, so peony bouquets are only available while it lasts. |
| B6 | Sant Jordi occasion (R19; the approved line left 58 words) (`seed/data/copy/en/occasions.json`, sant_jordi) | We cover it where we have a florist in the city, and the destination page says whether that is the case this year. | The Barcelona page shows whether we deliver for Sant Jordi this year, and it is worth ordering early because the whole city wants roses that morning. |
| B7 | Sant Jordi occasion, Google description (R19 variant) (`seed/data/copy/en/occasions.json`, sant_jordi) | Single red roses for Sant Jordi on 23 April, where we have a florist in the city. | Single red roses for Sant Jordi on 23 April. The Barcelona page shows whether we deliver this year. |
| B8 | Gift sets page, Google description (R18 variant) (`seed/data/copy/en/categories.json`, gift_set) | A bouquet with chocolates, a vase, a balloon or a soft toy, bought by the same florist. | A bouquet with chocolates, a vase, a balloon or a soft toy, chosen to go with the flowers and delivered together. |
| B9 | Spain, British guide, Google description (R23 variant) (`content/corridors/en-gb/es-guide.md`) | with sterling pricing, who your order is with and what we can do today. | with sterling prices and what we can do today. |
| B10 | Germany, British guide, "What we can honestly tell you today" (the R15a text, as the English guide now reads) (`content/corridors/en-gb/de-guide.md`) | We are not making deliveries in Germany. We have written this guide, decided which cities we want to start in, and begun talking to the shops we would like to make your flowers. Until one of them has agreed to work with us there will be no date and no hour on this page, because a promise with nothing behind it is not worth reading. | We are not delivering in Germany yet. When we start, this page will show the cities, the order-by time and what happens on the day. |
| B11 | Spain, British guide, "What we can honestly tell you today" (the R15a text, as the English guide now reads) (`content/corridors/en-gb/es-guide.md`) | We are not making deliveries in Spain. We have written this guide because the customs are worth knowing, and because we would rather publish something true and limited than something complete and invented. Until a shop there has agreed to work with us, this page will carry no arrival claim at all. | We are not delivering in Spain yet. When we start, this page will show the cities, the order-by time and what happens on the day. |
| B12 | France, British guide, "What we can honestly tell you today" (the R15a text, as the English guide now reads) (`content/corridors/en-gb/fr-guide.md`) | We have not begun delivering in France. This page exists because the etiquette is worth knowing. We are choosing shops. Until one of them has agreed to work with us, nothing here will claim an arrival, and when that changes this is the section that will change first. | We are not delivering in France yet. When we start, this page will show the cities, the order-by time and what happens on the day. |
| B13 | Italy, British guide, "What we can honestly tell you today" (the R15a text, as the English guide now reads) (`content/corridors/en-gb/it-guide.md`) | We are not delivering in Italy. We wrote this guide because the customs are worth knowing, and because a page that is true and incomplete is better than one that is complete and made up. Until a shop there has agreed to work with us, nothing here will claim an arrival. | We are not delivering in Italy yet. When we start, this page will show the cities, the order-by time and what happens on the day. |
| B14 | Netherlands, British guide, "What we can honestly tell you today" (the R15a text, as the English guide now reads) (`content/corridors/en-gb/nl-guide.md`) | We are not delivering in the Netherlands. We have written this guide because the habits here are worth explaining to anybody sending from outside, and because a page that is true and limited beats one that is complete and invented. Until a shop there has agreed to work with us there will be no date, no hour and no claim of arrival anywhere on this page. | We are not delivering in the Netherlands yet. When we start, this page will show the cities, the order-by time and what happens on the day. |
| B15 | Poland, British guide, "What we can honestly tell you today" (the R15a text, as the English guide now reads) (`content/corridors/en-gb/pl-guide.md`) | We are not delivering to Poland yet. We have written this guide, chosen the cities we want to begin in, and we are talking to the shops we would like to make your flowers. Until one of them has agreed to work with us there will be no date and no hour on this page. When that changes, this section is the first thing that changes with it. | We are not delivering in Poland yet. When we start, this page will show the cities, the order-by time and what happens on the day. |
| B16 | Romania, British guide, "What we can honestly tell you today" (the R15a text, as the English guide now reads) (`content/corridors/en-gb/ro-guide.md`) | We have not begun delivering in Romania. We have written this guide, chosen the cities we would like to start in, and begun talking to shops. Until one of them has agreed to work with us, this page will carry no date, no hour and no promise of arrival, because a promise with no arrangement behind it is just words. | We are not delivering in Romania yet. When we start, this page will show the cities, the order-by time and what happens on the day. |
| B17 | Germany, British guide, "Money, and where you stand" (R16 in the body) (`content/corridors/en-gb/de-guide.md`) | You are buying from us, and not from whichever shop ends up making the bouquet. A complaint comes to us, in English, rather than to a shop abroad. | You buy from us, Flowers Overseas, and we look after everything, in English, from order to doorstep. |
| B18 | Spain, British guide, "Money, and where you stand" (R16 in the body) (`content/corridors/en-gb/es-guide.md`) | You are contracting with us, not with the shop that arranges the flowers, so a complaint is made to us in English and not to a shop abroad in a language you may not have. | You buy from us, Flowers Overseas, and we look after everything, in English, from order to doorstep. |
| B19 | France, British guide, "Money, and where you stand" (R16 in the body) (`content/corridors/en-gb/fr-guide.md`) | Your contract is with us rather than with the florist who ties the flowers. If something is wrong you take it up with us, in English. | You buy from us, Flowers Overseas, and we look after everything, in English, from order to doorstep. |
| B20 | Italy, British guide, "Money, and where you stand" (R16 in the body) (`content/corridors/en-gb/it-guide.md`) | Your contract is with us and not with the fiorista who makes the bouquet. A complaint comes to us in English, rather than to a shop abroad. | You buy from us, Flowers Overseas, and we look after everything, in English, from order to doorstep. |
| B21 | Netherlands, British guide, "Money, and where you stand" (R16 in the body) (`content/corridors/en-gb/nl-guide.md`) | Your contract is with us, never with the shop that ties the bunch, so a complaint comes to us in English rather than to a shop abroad. | You buy from us, Flowers Overseas, and we look after everything, in English, from order to doorstep. |
| B22 | Poland, British guide, "Money, and where you stand" (R16 in the body) (`content/corridors/en-gb/pl-guide.md`) | If something is wrong you complain to us and we sort it out; you never have to take up an argument with a shop abroad in a language you do not speak. | If something is wrong, tell us and we put it right. |
| B23 | Romania, British guide, "Money, and where you stand" (R16 in the body) (`content/corridors/en-gb/ro-guide.md`) | Your contract is with us, not with the florist who assembles the bouquet, so anything that goes wrong is ours to put right, in English. | You buy from us, Flowers Overseas, and we look after everything, in English, from order to doorstep. |
| B24 | Poland, British guide, counting (`content/corridors/en-gb/pl-guide.md`) | If we compose the bouquet, the shop does the counting and you do not need to think about it. | Our florist counts the stems for you, so you do not need to think about it. |
| B25 | France, British guide, counting (`content/corridors/en-gb/fr-guide.md`) | A shop composes to a shape rather than a count, so the problem disappears if you leave the arrangement to it. | Our florist composes to a shape rather than a count, so the problem disappears if you leave the arrangement to our florist. |
| B26 | Spain, British guide, heading (`content/corridors/en-gb/es-guide.md`) | ## Heat, and what a shop will agree to make | ## Heat, and timing |
| B27 | Spain, British guide, heat (`content/corridors/en-gb/es-guide.md`) | Potted plants, succulents, carnations and firm mixed bunches are what survive, and they are what an experienced shop will offer. | Potted plants, succulents, carnations and firm mixed bunches are what survive, and they are what our florist will suggest. |
| B28 | Spain, English guide, intro (`content/corridors/en/es-guide.md`) | and the heat between June and September governs what a shop will agree to make for you at all. | and the heat between June and September decides which flowers will last at all. |
| B29 | Poland, English guide, FAQ on counting (R24, plural) (`content/corridors/en/pl-guide.md`) | Our florists count the stems so you do not have to. | Our florist counts the stems so you do not have to. |
| B30 | Spain, English guide, local flowers (`content/corridors/en/es-guide.md`) | reservations held further north | reservations felt further north |
| B31 | France, English guide, FAQ on carnations (`content/corridors/en/fr-guide.md`) | still held by enough people to matter | still believed by enough people to matter |
| B32 | France, English guide, body (`content/corridors/en/fr-guide.md`) | sending to holds the superstition | sending to shares the superstition |
| B33 | France, British guide, FAQ on carnations (`content/corridors/en-gb/fr-guide.md`) | The belief is genuine and still widely held. | The belief is genuine and still widely shared. |
| B34 | France, British guide, body (`content/corridors/en-gb/fr-guide.md`) | sending to holds the | sending to shares the |
| B35 | Spain, British guide, FAQ on summer (`content/corridors/en-gb/es-guide.md`) | the advice is worth taking rather than arguing with. | the advice is worth following rather than arguing with. |
| B36 | get_well category page (`seed/data/copy/en/categories.json`, get_well) | light to hold, | light to carry, |
| B37 | get_well category page (`seed/data/copy/en/categories.json`, get_well) | Some wards do not accept flowers, so check before ordering and we will hold the delivery if needed. | Some wards do not allow flowers, so check before ordering; we can deliver to a home address instead. |
| B38 | tulips category page (`seed/data/copy/en/categories.json`, tulips) | so we hold the colour | so we keep the colour |
| B39 | lilies category page (`seed/data/copy/en/categories.json`, lilies) | Stems leave the shop part-closed | Stems arrive part-closed |
| B40 | orchids category page (`seed/data/copy/en/categories.json`, orchids) | in bud and flower when they leave the shop. | in bud and flower on the day they are delivered. |
| B41 | tulips category page, Google description (`seed/data/copy/en/categories.json`, tulips) | Colour held; | Colour fixed; |
| B42 | anniversary occasion page (`seed/data/copy/en/occasions.json`, anniversary) | Choose the date and we hold it. | Choose the date and we keep to it. |
| B43 | get_well occasion page (`seed/data/copy/en/occasions.json`, get_well) | we will hold the delivery for a home address instead. | we will deliver to a home address instead. |
| B44 | just_because occasion page (`seed/data/copy/en/occasions.json`, just_because) | These are the orders our florists like most, because they get to choose | Our florist likes these orders most, because they get to choose |
| B45 | FO-BQ-004 (Quiet Blush), product description (`seed/data/copy/en/products.json`, FO-BQ-004) | We hold the pastel colour scheme rather than the exact stems, so our florist can swap in the stems that came in that morning. | We keep the pastel colour scheme rather than the exact stems, so our florist can swap in the stems that came in that morning. |
| B46 | FO-BQ-004 (Quiet Blush), product Google description (`seed/data/copy/en/products.json`, FO-BQ-004) | Pastel colour scheme held; stems vary by market. | Pastel colour scheme fixed; stems vary by market. |
| B47 | FO-BQ-005 (Northern Light), product description (`seed/data/copy/en/products.json`, FO-BQ-005) | White roses are always the flower; the foliage is whatever holds its shape longest that morning. | White roses are always the flower; the foliage is whatever keeps its shape longest that morning. |
| B48 | FO-BQ-010 (Sunday Market), product description (`seed/data/copy/en/products.json`, FO-BQ-010) | The yellow colour scheme is what we hold — variety and shade depend on the week's growers. | The yellow colour scheme is what we keep; variety and shade depend on the week's growers. |
| B49 | FO-BQ-014 (Tulip Parade), product description (`seed/data/copy/en/products.json`, FO-BQ-014) | We hold the vibrant colour scheme; the exact colours follow the week's crop. | We keep the vibrant colour scheme; the exact colours follow the week's crop. |
| B50 | FO-BQ-017 (Snow Lantern), product description (`seed/data/copy/en/products.json`, FO-BQ-017) | Lilies are always in it; the wrap and tie depend on what our florist has in the shop. | Lilies are always in it; the wrap and tie depend on what our florist has that day. |
| B51 | FO-BQ-020 (Soft June), product description (`seed/data/copy/en/products.json`, FO-BQ-020) | We hold the pastel colour scheme rather than the exact flowers, so the mix follows the market inside those shades. | We keep the pastel colour scheme rather than the exact flowers, so the mix follows the market inside those shades. |
| B52 | FO-BQ-023 (Field of Gold), product description (`seed/data/copy/en/products.json`, FO-BQ-023) | Sunflowers with ruscus and a few stems of seasonal green, tied in a rustic hand-held bunch. | Sunflowers with ruscus and a few stems of seasonal green, tied in a rustic hand-tied bunch. |
| B53 | FO-BQ-023 (Field of Gold), product description (`seed/data/copy/en/products.json`, FO-BQ-023) | Sent for birthdays, congratulations and thank yous, and it holds up well in a warm room. | Sent for birthdays, congratulations and thank yous, and it lasts well in a warm room. |
| B54 | FO-BQ-023 (Field of Gold), product Google description (`seed/data/copy/en/products.json`, FO-BQ-023) | Nine sunflowers with ruscus and seasonal green in a rustic hand-held bunch. | Nine sunflowers with ruscus and seasonal green in a rustic hand-tied bunch. |
| B55 | FO-BQ-024 (High Summer), product description (`seed/data/copy/en/products.json`, FO-BQ-024) | We hold the yellow colour scheme rather than a fixed recipe, so our florist can use whatever summer stems are open that day. | We keep the yellow colour scheme rather than a fixed recipe, so our florist can use whatever summer stems are open that day. |
| B56 | FO-BQ-025 (Late Harvest), product description (`seed/data/copy/en/products.json`, FO-BQ-025) | The orange colour scheme is what we hold; the supporting stems change every week as the season turns. | The orange colour scheme is what we keep; the supporting stems change every week as the season turns. |
| B57 | FO-BQ-026 (Bright Side), product description (`seed/data/copy/en/products.json`, FO-BQ-026) | We hold the vibrant colour scheme rather than named colours; gerbera availability moves daily. | We keep the vibrant colour scheme rather than named colours; gerbera availability moves daily. |
| B58 | FO-BQ-031 (Pastel Weekend), product description (`seed/data/copy/en/products.json`, FO-BQ-031) | We hold the pastel colour scheme and let our florist choose the flowers inside it, so nothing arrives half-open. | We keep the pastel colour scheme and let our florist choose the flowers inside it, so nothing arrives half-open. |
| B59 | FO-BQ-038 (Old Town), product description (`seed/data/copy/en/products.json`, FO-BQ-038) | A long-lasting, unfussy bouquet for a birthday, a name day or a Sunday visit; carnations often hold two weeks in water. | A long-lasting, unfussy bouquet for a birthday, a name day or a Sunday visit; carnations often last two weeks in water. |
| B60 | FO-AR-001 (Small Kindness), product description (`seed/data/copy/en/products.json`, FO-AR-001) | We hold the pastel scheme; the flowers inside it are our florist's choice. | We keep the pastel scheme; the flowers inside it are our florist's choice. |
| B61 | FO-AR-004 (Desk Bloom), product description (`seed/data/copy/en/products.json`, FO-AR-004) | We hold the vibrant colour scheme; the exact colours follow the day's delivery. | We keep the vibrant colour scheme; the exact colours follow the day's delivery. |
| B62 | FO-AR-005 (Paper Window), product description (`seed/data/copy/en/products.json`, FO-AR-005) | The pink colour scheme is what we hold; tulip variety and shade depend on the week. | The pink colour scheme is what we keep; tulip variety and shade depend on the week. |
| B63 | FO-AR-007 (Kitchen Table), product description (`seed/data/copy/en/products.json`, FO-AR-007) | Sent for housewarmings and thank yous, and it holds up in a warm room better than a tied bouquet. | Sent for housewarmings and thank yous, and it lasts in a warm room better than a tied bouquet. |
| B64 | FO-AR-013 (Copper Bowl), product description (`seed/data/copy/en/products.json`, FO-AR-013) | Sent for All Saints' visits, thank yous and housewarmings, and chrysanthemums hold longer than most cut flowers. | Sent for All Saints' visits, thank yous and housewarmings, and chrysanthemums last longer than most cut flowers. |
| B65 | FO-AR-014 (Linen Basket), product description (`seed/data/copy/en/products.json`, FO-AR-014) | Sent for a new baby, a get-well or a birthday; alstroemeria often holds two weeks. | Sent for a new baby, a get-well or a birthday; alstroemeria often lasts two weeks. |
| B66 | FO-AR-014 (Linen Basket), product description (`seed/data/copy/en/products.json`, FO-AR-014) | We hold the pastel scheme, and our florist chooses shades and any filler from the day's delivery. | We keep the pastel scheme, and our florist chooses shades and any filler from the day's delivery. |
| B67 | FO-PT-001 (Moth Orchid White), product description (`seed/data/copy/en/products.json`, FO-PT-001) | One white moth orchid in a plain ceramic pot, staked and in bud and flower when it leaves the shop. | One white moth orchid in a plain ceramic pot, staked and in bud and flower on the day it is delivered. |
| B68 | FO-FN-001 (Farewell Wreath), product description (`seed/data/copy/en/products.json`, FO-FN-001) | We hold the white scheme and the form; the flowers inside it are chosen by our florist from that morning's market. | We keep the white scheme and the form; the flowers inside it are chosen by our florist from that morning's market. |
| B69 | FO-FN-003 (Casket Spray), product description (`seed/data/copy/en/products.json`, FO-FN-003) | The white scheme is held; flowers are chosen on the day from what will hold its shape for the service. | The white scheme stays fixed; flowers are chosen on the day from what will keep its shape for the service. |
| B70 | FO-FN-004 (White Heart), product description (`seed/data/copy/en/products.json`, FO-FN-004) | The white scheme and the heart form are what we hold; rose variety and any filler are chosen by our florist on the morning of the service. | The white scheme and the heart form are what we keep; rose variety and any filler are chosen by our florist on the morning of the service. |
| B71 | FO-FN-005 (Sympathy Basket), product description (`seed/data/copy/en/products.json`, FO-FN-005) | We hold the white scheme; the mix is our florist's choice from that day's market. | We keep the white scheme; the mix is our florist's choice from that day's market. |
| B72 | FO-FN-006 (Grave Bouquet), product description (`seed/data/copy/en/products.json`, FO-FN-006) | We hold the mixed scheme and the flat form; colours follow what our florist can buy that week. | We keep the mixed scheme and the flat form; colours follow what our florist can buy that week. |
| B73 | FO-FN-008 (Quiet Wreath), product description (`seed/data/copy/en/products.json`, FO-FN-008) | We hold the pastel scheme and the round form, and our florist chooses the flowers from what is open that morning. | We keep the pastel scheme and the round form, and our florist chooses the flowers from what is open that morning. |
| B74 | FO-FN-009 (Condolence Bouquet), product description (`seed/data/copy/en/products.json`, FO-FN-009) | The white scheme is held; the foliage follows the season. | The white scheme stays fixed; the foliage follows the season. |
| B75 | FO-FN-010 (Stone Garden), product description (`seed/data/copy/en/products.json`, FO-FN-010) | We hold the white scheme and the low form; the flowers and the container's finish are our florist's choice. | We keep the white scheme and the low form; the flowers and the container's finish are our florist's choice. |
| B76 | FO-GS-001 (Amber Hour + Chocolates), product description (`seed/data/copy/en/products.json`, FO-GS-001) | We hold the orange scheme and swap greenery for what the market has. | We keep the orange scheme and swap greenery for what the market has. |
| B77 | FO-GS-002 (Baltic Dawn + Vase), product description (`seed/data/copy/en/products.json`, FO-GS-002) | The pink scheme is held and the vase is always included; vase height and shape depend on what our florist stocks that week. | The pink scheme stays fixed and the vase is always included; vase height and shape depend on what our florist stocks that week. |
| B78 | FO-GS-004 (Welcome Baby Pink + Plush), product description (`seed/data/copy/en/products.json`, FO-GS-004) | We hold the pink scheme; the flowers and the toy come from our florist, and the toy is new, tagged and suitable from birth. | We keep the pink scheme; the flowers and the toy come from our florist, and the toy is new, tagged and suitable from birth. |
| B79 | FO-GS-005 (Kraków Spring + Chocolates), product description (`seed/data/copy/en/products.json`, FO-GS-005) | We hold the mixed tulip scheme, because tulip colours change from week to week. | We keep the mixed tulip scheme, because tulip colours change from week to week. |
| B80 | FO-GS-006 (Quiet Blush + Vase), product description (`seed/data/copy/en/products.json`, FO-GS-006) | The pastel scheme is held and the vase is always included; the flowers inside the scheme and the vase's shape are our florist's choice. | The pastel scheme stays fixed and the vase is always included; the flowers inside the scheme and the vase's shape are our florist's choice. |
| B81 | FO-GS-007 (Field of Gold + Chocolates), product description (`seed/data/copy/en/products.json`, FO-GS-007) | Our sunflower bunch with a box of chocolates from a shop near the recipient. | Our sunflower bunch with a box of good chocolates, delivered with the flowers. |
| B82 | FO-GS-007 (Field of Gold + Chocolates), product description (`seed/data/copy/en/products.json`, FO-GS-007) | The yellow scheme is held; supporting stems follow the week. | The yellow scheme stays fixed; supporting stems follow the week. |
| B83 | FO-GS-008 (Peony Note + Vase), product description (`seed/data/copy/en/products.json`, FO-GS-008) | The pink scheme is held and the vase is included. | The pink scheme stays fixed and the vase is included. |
| B84 | FO-GS-009 (Warsaw Morning + Balloon), product description (`seed/data/copy/en/products.json`, FO-GS-009) | We hold the mixed scheme; the flowers and the balloon design are our florist's choice on the day. | We keep the mixed scheme; the flowers and the balloon design are our florist's choice on the day. |
| B85 | FO-GS-010 (Bright Side + Balloon), product description (`seed/data/copy/en/products.json`, FO-GS-010) | We hold the vibrant scheme; gerbera colours and the balloon design depend on the day's stock. | We keep the vibrant scheme; gerbera colours and the balloon design depend on the day's stock. |
| B86 | FO-GS-011 (White Linen + Chocolates), product description (`seed/data/copy/en/products.json`, FO-GS-011) | The white scheme is held; lilies arrive part-closed and open over days. | The white scheme stays fixed; lilies arrive part-closed and open over days. |
| B87 | FO-GS-012 (Garden Letter + Plush), product description (`seed/data/copy/en/products.json`, FO-GS-012) | We hold the pastel scheme and our florist chooses the flowers and the toy from the shop; the toy is new, tagged and suitable from birth, and the bouquet is tied light enough to carry. | We keep the pastel scheme and our florist chooses the flowers and the toy on the day; the toy is new, tagged and suitable from birth, and the bouquet is tied light enough to carry. |
| B88 | FO-AR-007, British product description (`seed/data/copy/en-gb/products.json`, FO-AR-007) | Sent for housewarmings and thank yous, and it holds up in a warm room better than a tied bouquet. | Sent for housewarmings and thank yous, and it lasts in a warm room better than a tied bouquet. |
| B89 | FO-GS-006, British product description (`seed/data/copy/en-gb/products.json`, FO-GS-006) | The pastel scheme is held and the vase is always included; the flowers inside the scheme and the vase's shape are our florist's choice. | The pastel scheme stays fixed and the vase is always included; the flowers inside the scheme and the vase's shape are our florist's choice. |

## Read

- `specs/041-trust-help-legal-pages.md` — `## 0. Index`, §14 A-founder-2026-10-14, AC-30
- `specs/010-checkout.md` — §14 A4, AC-51
- `docs/codebase-map.md`
- `tests/support/forbidden-phrases.ts`, `tests/e2e/phrase-scan.spec.ts`, `tests/unit/neutral-ordering-copy.test.ts`

## Carry-forwards

- **From the orchestrator (2026-10-14):** spec 041 L576 "what we hold" trips the `hold` pattern; that page is not built yet (TASK-182/183), so it is not this task's, but the scan must not exempt it.

## Escalations

**E1. Shipping the approved texts `reviewed: false` takes `en` out of the index (needs the founder's record run before merge).** Three `en` keys that were `reviewed: true` change value here (`home.howItWorks.make.title`, `corridor.facts.orderBy.none`, `delivery.picker.live`), so they ship unreviewed as the brief says. That moves `unreviewedShare("en")` from 4.80 % to **5.35 %**, over the 5 % threshold (`plan/03` §6, `src/modules/i18n/review.ts`), so `isLocaleIndexable("en")` and `("en-gb")` turn false: 48 unit cases in 20 files go red (sitemaps, hreflang, indexability, i18n:check summary, etc.). Simulating the founder's record of those three keys locally leaves only the expected pins red (this file's three "shipped unreviewed" cases, the review queue) and the sitemap fixtures, whose `<lastmod>` moves; so after the record run: `UPDATE_SEO_FIXTURES=1 pnpm exec vitest run --project unit tests/unit/sitemap-fixtures.test.ts`, then flip the three `reviewed: false` assertions in `tests/unit/relay-language.test.ts` to the record, and drop the three keys from `AWAITING_FOUNDER_REVIEW` in `tests/unit/i18n-messages-schema.test.ts`. This is what TASK-193 did (the founder's commit inside the PR). The 14 guide files keep their file-level `reviewed: true` (corridor review is per file, decisions-log 2026-09-16); only `version` and `updatedAt` moved, so the founder's record should restamp `reviewedAt`.

**E2 (founder approved a 20 KB cap, 2026-10-14; spec amendment and task pending). `docs/codebase-map.md` is over its 17 KB budget by 49 bytes** (`tests/unit/codebase-map.test.ts`, 17 × 1024 = 17 408; main is 17 390, so any new config file breaks it). The new row is already the shortest summary that says what the file is. The budget is a spec number, so raising it is the orchestrator's call, not this task's.

**E3 (founder approved, "partner ok", 2026-10-14; spec 041 amendment pending). `RELAY_EXEMPT` carries a third kind.** Spec 041 §14 allows two kinds (non-buyer surfaces, quoted records) and "no per-key exemption on a buyer surface"; the work order rules that "my partner" (`home.sentence.who`, case `partner`, `en`/`en-gb`) gets an entry citing the decisions-log row of 2026-10-04. It is a `decided-string` entry: the exact ICU case in that key and locale, and in rendered HTML only an `<option>` whose whole text is "my partner". Mutations show the word elsewhere still fails. A spec amendment should record it.

**E4. Two readings of the definition, both stricter than the letter.** (a) `de` and `pl` read the `en` list as well as their own, because their Phase 0 drafts echo the English (spec 003 §14 A15): without it, "accepts it" put back into `pl.json` would not go red. (b) Stems take inflections the spec's base words miss (`zaakcept*` for "zaakceptuje", `until (a|our|the) florist`). Key names are not scanned (work order).

**E5 (orchestrator applies the label once the copy is final). Visual baselines.** The home how-it-works step, the corridor facts row and the product picker's cutoff line change text, so the `visual` job needs the `visual:baselines` label (labels are the orchestrator's).

**E6 (resolved by batch 3, 2026-10-15: the scan now finds no hit in any `en`, `en-gb`, `de` or `pl` seed row or guide). Every hit the scan reports, after both copy batches (orchestrator, 2026-10-14: record it, do not reword it, do not exempt it).** The message catalogues are clean. All remaining hits are in seed copy and guide prose. The `de`/`pl` product rows are the English echo, so they repeat the `en` product rows. No row of either batch covers these. The e2e matrix renders none of them, and CI on bbe273ce was green for all 52 relay-scan cases.

Guide prose (`content/corridors/`):

| pattern | where | text |
|---|---|---|
| held | `content/corridors/en/es-guide.md:42` | Carnations above all, which Spain grows and gives without any of the reservations held further north; roses for 23 April; orange blossom in the south in spring; gerberas, lilies and gladioli all year; and potted plants t |
| held | `content/corridors/en/fr-guide.md:23` | The superstition is real and still held by enough people to matter: carnations are the flower you do not bring to a host, and in some professions they are read as an outright bad omen. |
| hold | `content/corridors/en/fr-guide.md:76` | Whether or not the person you are sending to holds the superstition, there is no cost to avoiding it. |
| take | `content/corridors/en-gb/es-guide.md:29` | Between June and September a Spanish florist will steer you to carnations, firm mixed bunches, succulents and potted plants, and the advice is worth taking rather than arguing with. |
| held | `content/corridors/en-gb/fr-guide.md:21` | The belief is genuine and still widely held. |
| hold | `content/corridors/en-gb/fr-guide.md:78` | Whether or not the person you are sending to holds the superstition, there is no cost at all to choosing something else, and a fleuriste will quietly do so on your behalf. |

Seed copy (`seed/data/copy/`):

| pattern | where | text |
|---|---|---|
| hold | `seed/data/copy/de/products.json:53` FO-BQ-004 `descriptionMd` | We hold the pastel colour scheme rather than the exact stems, so our florist can swap in the stems that came in that morning. |
| held | `seed/data/copy/de/products.json:55` FO-BQ-004 `seoDescription` | Pastel colour scheme held; stems vary by market. |
| hold | `seed/data/copy/de/products.json:66` FO-BQ-005 `descriptionMd` | White roses are always the flower; the foliage is whatever holds its shape longest that morning. |
| hold | `seed/data/copy/de/products.json:131` FO-BQ-010 `descriptionMd` | The yellow colour scheme is what we hold — variety and shade depend on the week's growers. |
| hold | `seed/data/copy/de/products.json:183` FO-BQ-014 `descriptionMd` | We hold the vibrant colour scheme; the exact colours follow the week's crop. |
| take | `seed/data/copy/de/products.json:248` FO-BQ-019 `descriptionMd` | Peonies are always the flower; outside the season our florist tells us before we take the order rather than after. |
| hold | `seed/data/copy/de/products.json:261` FO-BQ-020 `descriptionMd` | We hold the pastel colour scheme rather than the exact flowers, so the mix follows the market inside those shades. |
| held | `seed/data/copy/de/products.json:300` FO-BQ-023 `descriptionMd` | Sunflowers with ruscus and a few stems of seasonal green, tied in a rustic hand-held bunch. |
| hold | `seed/data/copy/de/products.json:300` FO-BQ-023 `descriptionMd` | Sent for birthdays, congratulations and thank yous, and it holds up well in a warm room. |
| held | `seed/data/copy/de/products.json:302` FO-BQ-023 `seoDescription` | Nine sunflowers with ruscus and seasonal green in a rustic hand-held bunch. |
| hold | `seed/data/copy/de/products.json:313` FO-BQ-024 `descriptionMd` | We hold the yellow colour scheme rather than a fixed recipe, so our florist can use whatever summer stems are open that day. |
| hold | `seed/data/copy/de/products.json:326` FO-BQ-025 `descriptionMd` | The orange colour scheme is what we hold; the supporting stems change every week as the season turns. |
| hold | `seed/data/copy/de/products.json:339` FO-BQ-026 `descriptionMd` | We hold the vibrant colour scheme rather than named colours; gerbera availability moves daily. |
| hold | `seed/data/copy/de/products.json:404` FO-BQ-031 `descriptionMd` | We hold the pastel colour scheme and let our florist choose the flowers inside it, so nothing arrives half-open. |
| hold | `seed/data/copy/de/products.json:495` FO-BQ-038 `descriptionMd` | A long-lasting, unfussy bouquet for a birthday, a name day or a Sunday visit; carnations often hold two weeks in water. |
| hold | `seed/data/copy/de/products.json:534` FO-AR-001 `descriptionMd` | We hold the pastel scheme; the flowers inside it are our florist's choice. |
| hold | `seed/data/copy/de/products.json:573` FO-AR-004 `descriptionMd` | We hold the vibrant colour scheme; the exact colours follow the day's delivery. |
| hold | `seed/data/copy/de/products.json:586` FO-AR-005 `descriptionMd` | The pink colour scheme is what we hold; tulip variety and shade depend on the week. |
| hold | `seed/data/copy/de/products.json:612` FO-AR-007 `descriptionMd` | Sent for housewarmings and thank yous, and it holds up in a warm room better than a tied bouquet. |
| take | `seed/data/copy/de/products.json:651` FO-AR-010 `descriptionMd` | Peonies are always the flower; where the season has ended our florist tells us before we take the order. |
| hold | `seed/data/copy/de/products.json:690` FO-AR-013 `descriptionMd` | Sent for All Saints' visits, thank yous and housewarmings, and chrysanthemums hold longer than most cut flowers. |
| hold | `seed/data/copy/de/products.json:703` FO-AR-014 `descriptionMd` | Sent for a new baby, a get-well or a birthday; alstroemeria often holds two weeks. |
| hold | `seed/data/copy/de/products.json:703` FO-AR-014 `descriptionMd` | We hold the pastel scheme, and our florist chooses shades and any filler from the day's delivery. |
| hold | `seed/data/copy/de/products.json:820` FO-FN-001 `descriptionMd` | We hold the white scheme and the form; the flowers inside it are chosen by our florist from that morning's market. |
| held | `seed/data/copy/de/products.json:846` FO-FN-003 `descriptionMd` | The white scheme is held; flowers are chosen on the day from what will hold its shape for the service. |
| hold | `seed/data/copy/de/products.json:846` FO-FN-003 `descriptionMd` | The white scheme is held; flowers are chosen on the day from what will hold its shape for the service. |
| hold | `seed/data/copy/de/products.json:859` FO-FN-004 `descriptionMd` | The white scheme and the heart form are what we hold; rose variety and any filler are chosen by our florist on the morning of the service. |
| hold | `seed/data/copy/de/products.json:872` FO-FN-005 `descriptionMd` | We hold the white scheme; the mix is our florist's choice from that day's market. |
| hold | `seed/data/copy/de/products.json:885` FO-FN-006 `descriptionMd` | We hold the mixed scheme and the flat form; colours follow what our florist can buy that week. |
| hold | `seed/data/copy/de/products.json:911` FO-FN-008 `descriptionMd` | We hold the pastel scheme and the round form, and our florist chooses the flowers from what is open that morning. |
| held | `seed/data/copy/de/products.json:924` FO-FN-009 `descriptionMd` | The white scheme is held; the foliage follows the season. |
| hold | `seed/data/copy/de/products.json:937` FO-FN-010 `descriptionMd` | We hold the white scheme and the low form; the flowers and the container's finish are our florist's choice. |
| hold | `seed/data/copy/de/products.json:950` FO-GS-001 `descriptionMd` | We hold the orange scheme and swap greenery for what the market has. |
| held | `seed/data/copy/de/products.json:963` FO-GS-002 `descriptionMd` | The pink scheme is held and the vase is always included; vase height and shape depend on what our florist stocks that week. |
| hold | `seed/data/copy/de/products.json:976` FO-GS-003 `descriptionMd` | We hold the blue scheme; the flowers and the toy are chosen by our florist from what is in the shop, and the toy is new and tagged. |
| hold | `seed/data/copy/de/products.json:989` FO-GS-004 `descriptionMd` | We hold the pink scheme; the flowers and the toy come from our florist, and the toy is new, tagged and suitable from birth. |
| hold | `seed/data/copy/de/products.json:1002` FO-GS-005 `descriptionMd` | We hold the mixed tulip scheme, because tulip colours change from week to week. |
| held | `seed/data/copy/de/products.json:1015` FO-GS-006 `descriptionMd` | The pastel scheme is held and the vase is always included; the flowers inside the scheme and the vase's shape are our florist's choice. |
| held | `seed/data/copy/de/products.json:1028` FO-GS-007 `descriptionMd` | The yellow scheme is held; supporting stems follow the week. |
| held | `seed/data/copy/de/products.json:1041` FO-GS-008 `descriptionMd` | The pink scheme is held and the vase is included. |
| hold | `seed/data/copy/de/products.json:1054` FO-GS-009 `descriptionMd` | We hold the mixed scheme; the flowers and the balloon design are our florist's choice on the day. |
| hold | `seed/data/copy/de/products.json:1067` FO-GS-010 `descriptionMd` | We hold the vibrant scheme; gerbera colours and the balloon design depend on the day's stock. |
| held | `seed/data/copy/de/products.json:1080` FO-GS-011 `descriptionMd` | The white scheme is held; lilies arrive part-closed and open over days. |
| hold | `seed/data/copy/de/products.json:1093` FO-GS-012 `descriptionMd` | We hold the pastel scheme and our florist chooses the flowers and the toy from the shop; the toy is new, tagged and suitable from birth, and the bouquet is tied light enough to carry. |
| hold | `seed/data/copy/en/categories.json:160` get_well `descriptionMd` | Bouquets and arrangements chosen for a hospital room or a sofa: light to hold, low in scent, and several in a box or pot so no vase is needed. |
| hold | `seed/data/copy/en/categories.json:160` get_well `descriptionMd` | Some wards do not accept flowers, so check before ordering and we will hold the delivery if needed. |
| accept | `seed/data/copy/en/categories.json:160` get_well `descriptionMd` | Some wards do not accept flowers, so check before ordering and we will hold the delivery if needed. |
| hold | `seed/data/copy/en/categories.json:250` tulips `descriptionMd` | A spring flower: growers change varieties weekly, so we hold the colour and let our florist choose the variety. |
| held | `seed/data/copy/en/categories.json:252` tulips `seoDescription` | Colour held; variety by week. |
| take | `seed/data/copy/en/categories.json:310` peonies `descriptionMd` | The season is short — a few weeks in late spring — and outside it our florist tells us before we take an order rather than substituting something else. |
| hold | `seed/data/copy/en/occasions.json:29` anniversary `descriptionMd` | Choose the date and we hold it. |
| hold | `seed/data/copy/en/occasions.json:89` get_well `descriptionMd` | If a ward refuses flowers we will hold the delivery for a home address instead. |
| hold | `seed/data/copy/en/products.json:59` FO-BQ-004 `descriptionMd` | We hold the pastel colour scheme rather than the exact stems, so our florist can swap in the stems that came in that morning. |
| held | `seed/data/copy/en/products.json:61` FO-BQ-004 `seoDescription` | Pastel colour scheme held; stems vary by market. |
| hold | `seed/data/copy/en/products.json:74` FO-BQ-005 `descriptionMd` | White roses are always the flower; the foliage is whatever holds its shape longest that morning. |
| hold | `seed/data/copy/en/products.json:149` FO-BQ-010 `descriptionMd` | The yellow colour scheme is what we hold — variety and shade depend on the week's growers. |
| hold | `seed/data/copy/en/products.json:209` FO-BQ-014 `descriptionMd` | We hold the vibrant colour scheme; the exact colours follow the week's crop. |
| take | `seed/data/copy/en/products.json:284` FO-BQ-019 `descriptionMd` | Peonies are always the flower; outside the season our florist tells us before we take the order rather than after. |
| hold | `seed/data/copy/en/products.json:299` FO-BQ-020 `descriptionMd` | We hold the pastel colour scheme rather than the exact flowers, so the mix follows the market inside those shades. |
| held | `seed/data/copy/en/products.json:344` FO-BQ-023 `descriptionMd` | Sunflowers with ruscus and a few stems of seasonal green, tied in a rustic hand-held bunch. |
| hold | `seed/data/copy/en/products.json:344` FO-BQ-023 `descriptionMd` | Sent for birthdays, congratulations and thank yous, and it holds up well in a warm room. |
| held | `seed/data/copy/en/products.json:346` FO-BQ-023 `seoDescription` | Nine sunflowers with ruscus and seasonal green in a rustic hand-held bunch. |
| hold | `seed/data/copy/en/products.json:359` FO-BQ-024 `descriptionMd` | We hold the yellow colour scheme rather than a fixed recipe, so our florist can use whatever summer stems are open that day. |
| hold | `seed/data/copy/en/products.json:374` FO-BQ-025 `descriptionMd` | The orange colour scheme is what we hold; the supporting stems change every week as the season turns. |
| hold | `seed/data/copy/en/products.json:389` FO-BQ-026 `descriptionMd` | We hold the vibrant colour scheme rather than named colours; gerbera availability moves daily. |
| hold | `seed/data/copy/en/products.json:464` FO-BQ-031 `descriptionMd` | We hold the pastel colour scheme and let our florist choose the flowers inside it, so nothing arrives half-open. |
| hold | `seed/data/copy/en/products.json:567` FO-BQ-038 `descriptionMd` | A long-lasting, unfussy bouquet for a birthday, a name day or a Sunday visit; carnations often hold two weeks in water. |
| hold | `seed/data/copy/en/products.json:612` FO-AR-001 `descriptionMd` | We hold the pastel scheme; the flowers inside it are our florist's choice. |
| hold | `seed/data/copy/en/products.json:657` FO-AR-004 `descriptionMd` | We hold the vibrant colour scheme; the exact colours follow the day's delivery. |
| hold | `seed/data/copy/en/products.json:672` FO-AR-005 `descriptionMd` | The pink colour scheme is what we hold; tulip variety and shade depend on the week. |
| hold | `seed/data/copy/en/products.json:702` FO-AR-007 `descriptionMd` | Sent for housewarmings and thank yous, and it holds up in a warm room better than a tied bouquet. |
| take | `seed/data/copy/en/products.json:747` FO-AR-010 `descriptionMd` | Peonies are always the flower; where the season has ended our florist tells us before we take the order. |
| hold | `seed/data/copy/en/products.json:792` FO-AR-013 `descriptionMd` | Sent for All Saints' visits, thank yous and housewarmings, and chrysanthemums hold longer than most cut flowers. |
| hold | `seed/data/copy/en/products.json:807` FO-AR-014 `descriptionMd` | Sent for a new baby, a get-well or a birthday; alstroemeria often holds two weeks. |
| hold | `seed/data/copy/en/products.json:807` FO-AR-014 `descriptionMd` | We hold the pastel scheme, and our florist chooses shades and any filler from the day's delivery. |
| hold | `seed/data/copy/en/products.json:940` FO-FN-001 `descriptionMd` | We hold the white scheme and the form; the flowers inside it are chosen by our florist from that morning's market. |
| held | `seed/data/copy/en/products.json:970` FO-FN-003 `descriptionMd` | The white scheme is held; flowers are chosen on the day from what will hold its shape for the service. |
| hold | `seed/data/copy/en/products.json:970` FO-FN-003 `descriptionMd` | The white scheme is held; flowers are chosen on the day from what will hold its shape for the service. |
| hold | `seed/data/copy/en/products.json:985` FO-FN-004 `descriptionMd` | The white scheme and the heart form are what we hold; rose variety and any filler are chosen by our florist on the morning of the service. |
| hold | `seed/data/copy/en/products.json:1000` FO-FN-005 `descriptionMd` | We hold the white scheme; the mix is our florist's choice from that day's market. |
| hold | `seed/data/copy/en/products.json:1015` FO-FN-006 `descriptionMd` | We hold the mixed scheme and the flat form; colours follow what our florist can buy that week. |
| hold | `seed/data/copy/en/products.json:1045` FO-FN-008 `descriptionMd` | We hold the pastel scheme and the round form, and our florist chooses the flowers from what is open that morning. |
| held | `seed/data/copy/en/products.json:1060` FO-FN-009 `descriptionMd` | The white scheme is held; the foliage follows the season. |
| hold | `seed/data/copy/en/products.json:1075` FO-FN-010 `descriptionMd` | We hold the white scheme and the low form; the flowers and the container's finish are our florist's choice. |
| hold | `seed/data/copy/en/products.json:1090` FO-GS-001 `descriptionMd` | We hold the orange scheme and swap greenery for what the market has. |
| held | `seed/data/copy/en/products.json:1105` FO-GS-002 `descriptionMd` | The pink scheme is held and the vase is always included; vase height and shape depend on what our florist stocks that week. |
| hold | `seed/data/copy/en/products.json:1120` FO-GS-003 `descriptionMd` | We hold the blue scheme; the flowers and the toy are chosen by our florist from what is in the shop, and the toy is new and tagged. |
| hold | `seed/data/copy/en/products.json:1135` FO-GS-004 `descriptionMd` | We hold the pink scheme; the flowers and the toy come from our florist, and the toy is new, tagged and suitable from birth. |
| hold | `seed/data/copy/en/products.json:1148` FO-GS-005 `descriptionMd` | We hold the mixed tulip scheme, because tulip colours change from week to week. |
| held | `seed/data/copy/en/products.json:1163` FO-GS-006 `descriptionMd` | The pastel scheme is held and the vase is always included; the flowers inside the scheme and the vase's shape are our florist's choice. |
| held | `seed/data/copy/en/products.json:1178` FO-GS-007 `descriptionMd` | The yellow scheme is held; supporting stems follow the week. |
| held | `seed/data/copy/en/products.json:1193` FO-GS-008 `descriptionMd` | The pink scheme is held and the vase is included. |
| hold | `seed/data/copy/en/products.json:1206` FO-GS-009 `descriptionMd` | We hold the mixed scheme; the flowers and the balloon design are our florist's choice on the day. |
| hold | `seed/data/copy/en/products.json:1221` FO-GS-010 `descriptionMd` | We hold the vibrant scheme; gerbera colours and the balloon design depend on the day's stock. |
| held | `seed/data/copy/en/products.json:1236` FO-GS-011 `descriptionMd` | The white scheme is held; lilies arrive part-closed and open over days. |
| hold | `seed/data/copy/en/products.json:1251` FO-GS-012 `descriptionMd` | We hold the pastel scheme and our florist chooses the flowers and the toy from the shop; the toy is new, tagged and suitable from birth, and the bouquet is tied light enough to carry. |
| hold | `seed/data/copy/en-gb/products.json:14` FO-AR-007 `descriptionMd` | Sent for housewarmings and thank yous, and it holds up in a warm room better than a tied bouquet. |
| held | `seed/data/copy/en-gb/products.json:29` FO-GS-006 `descriptionMd` | The pastel scheme is held and the vase is always included; the flowers inside the scheme and the vase's shape are our florist's choice. |
| hold | `seed/data/copy/pl/products.json:53` FO-BQ-004 `descriptionMd` | We hold the pastel colour scheme rather than the exact stems, so our florist can swap in the stems that came in that morning. |
| held | `seed/data/copy/pl/products.json:55` FO-BQ-004 `seoDescription` | Pastel colour scheme held; stems vary by market. |
| hold | `seed/data/copy/pl/products.json:66` FO-BQ-005 `descriptionMd` | White roses are always the flower; the foliage is whatever holds its shape longest that morning. |
| hold | `seed/data/copy/pl/products.json:131` FO-BQ-010 `descriptionMd` | The yellow colour scheme is what we hold — variety and shade depend on the week's growers. |
| hold | `seed/data/copy/pl/products.json:183` FO-BQ-014 `descriptionMd` | We hold the vibrant colour scheme; the exact colours follow the week's crop. |
| take | `seed/data/copy/pl/products.json:248` FO-BQ-019 `descriptionMd` | Peonies are always the flower; outside the season our florist tells us before we take the order rather than after. |
| hold | `seed/data/copy/pl/products.json:261` FO-BQ-020 `descriptionMd` | We hold the pastel colour scheme rather than the exact flowers, so the mix follows the market inside those shades. |
| held | `seed/data/copy/pl/products.json:300` FO-BQ-023 `descriptionMd` | Sunflowers with ruscus and a few stems of seasonal green, tied in a rustic hand-held bunch. |
| hold | `seed/data/copy/pl/products.json:300` FO-BQ-023 `descriptionMd` | Sent for birthdays, congratulations and thank yous, and it holds up well in a warm room. |
| held | `seed/data/copy/pl/products.json:302` FO-BQ-023 `seoDescription` | Nine sunflowers with ruscus and seasonal green in a rustic hand-held bunch. |
| hold | `seed/data/copy/pl/products.json:313` FO-BQ-024 `descriptionMd` | We hold the yellow colour scheme rather than a fixed recipe, so our florist can use whatever summer stems are open that day. |
| hold | `seed/data/copy/pl/products.json:326` FO-BQ-025 `descriptionMd` | The orange colour scheme is what we hold; the supporting stems change every week as the season turns. |
| hold | `seed/data/copy/pl/products.json:339` FO-BQ-026 `descriptionMd` | We hold the vibrant colour scheme rather than named colours; gerbera availability moves daily. |
| hold | `seed/data/copy/pl/products.json:404` FO-BQ-031 `descriptionMd` | We hold the pastel colour scheme and let our florist choose the flowers inside it, so nothing arrives half-open. |
| hold | `seed/data/copy/pl/products.json:495` FO-BQ-038 `descriptionMd` | A long-lasting, unfussy bouquet for a birthday, a name day or a Sunday visit; carnations often hold two weeks in water. |
| hold | `seed/data/copy/pl/products.json:534` FO-AR-001 `descriptionMd` | We hold the pastel scheme; the flowers inside it are our florist's choice. |
| hold | `seed/data/copy/pl/products.json:573` FO-AR-004 `descriptionMd` | We hold the vibrant colour scheme; the exact colours follow the day's delivery. |
| hold | `seed/data/copy/pl/products.json:586` FO-AR-005 `descriptionMd` | The pink colour scheme is what we hold; tulip variety and shade depend on the week. |
| hold | `seed/data/copy/pl/products.json:612` FO-AR-007 `descriptionMd` | Sent for housewarmings and thank yous, and it holds up in a warm room better than a tied bouquet. |
| take | `seed/data/copy/pl/products.json:651` FO-AR-010 `descriptionMd` | Peonies are always the flower; where the season has ended our florist tells us before we take the order. |
| hold | `seed/data/copy/pl/products.json:690` FO-AR-013 `descriptionMd` | Sent for All Saints' visits, thank yous and housewarmings, and chrysanthemums hold longer than most cut flowers. |
| hold | `seed/data/copy/pl/products.json:703` FO-AR-014 `descriptionMd` | Sent for a new baby, a get-well or a birthday; alstroemeria often holds two weeks. |
| hold | `seed/data/copy/pl/products.json:703` FO-AR-014 `descriptionMd` | We hold the pastel scheme, and our florist chooses shades and any filler from the day's delivery. |
| hold | `seed/data/copy/pl/products.json:820` FO-FN-001 `descriptionMd` | We hold the white scheme and the form; the flowers inside it are chosen by our florist from that morning's market. |
| held | `seed/data/copy/pl/products.json:846` FO-FN-003 `descriptionMd` | The white scheme is held; flowers are chosen on the day from what will hold its shape for the service. |
| hold | `seed/data/copy/pl/products.json:846` FO-FN-003 `descriptionMd` | The white scheme is held; flowers are chosen on the day from what will hold its shape for the service. |
| hold | `seed/data/copy/pl/products.json:859` FO-FN-004 `descriptionMd` | The white scheme and the heart form are what we hold; rose variety and any filler are chosen by our florist on the morning of the service. |
| hold | `seed/data/copy/pl/products.json:872` FO-FN-005 `descriptionMd` | We hold the white scheme; the mix is our florist's choice from that day's market. |
| hold | `seed/data/copy/pl/products.json:885` FO-FN-006 `descriptionMd` | We hold the mixed scheme and the flat form; colours follow what our florist can buy that week. |
| hold | `seed/data/copy/pl/products.json:911` FO-FN-008 `descriptionMd` | We hold the pastel scheme and the round form, and our florist chooses the flowers from what is open that morning. |
| held | `seed/data/copy/pl/products.json:924` FO-FN-009 `descriptionMd` | The white scheme is held; the foliage follows the season. |
| hold | `seed/data/copy/pl/products.json:937` FO-FN-010 `descriptionMd` | We hold the white scheme and the low form; the flowers and the container's finish are our florist's choice. |
| hold | `seed/data/copy/pl/products.json:950` FO-GS-001 `descriptionMd` | We hold the orange scheme and swap greenery for what the market has. |
| held | `seed/data/copy/pl/products.json:963` FO-GS-002 `descriptionMd` | The pink scheme is held and the vase is always included; vase height and shape depend on what our florist stocks that week. |
| hold | `seed/data/copy/pl/products.json:976` FO-GS-003 `descriptionMd` | We hold the blue scheme; the flowers and the toy are chosen by our florist from what is in the shop, and the toy is new and tagged. |
| hold | `seed/data/copy/pl/products.json:989` FO-GS-004 `descriptionMd` | We hold the pink scheme; the flowers and the toy come from our florist, and the toy is new, tagged and suitable from birth. |
| hold | `seed/data/copy/pl/products.json:1002` FO-GS-005 `descriptionMd` | We hold the mixed tulip scheme, because tulip colours change from week to week. |
| held | `seed/data/copy/pl/products.json:1015` FO-GS-006 `descriptionMd` | The pastel scheme is held and the vase is always included; the flowers inside the scheme and the vase's shape are our florist's choice. |
| held | `seed/data/copy/pl/products.json:1028` FO-GS-007 `descriptionMd` | The yellow scheme is held; supporting stems follow the week. |
| held | `seed/data/copy/pl/products.json:1041` FO-GS-008 `descriptionMd` | The pink scheme is held and the vase is included. |
| hold | `seed/data/copy/pl/products.json:1054` FO-GS-009 `descriptionMd` | We hold the mixed scheme; the flowers and the balloon design are our florist's choice on the day. |
| hold | `seed/data/copy/pl/products.json:1067` FO-GS-010 `descriptionMd` | We hold the vibrant scheme; gerbera colours and the balloon design depend on the day's stock. |
| held | `seed/data/copy/pl/products.json:1080` FO-GS-011 `descriptionMd` | The white scheme is held; lilies arrive part-closed and open over days. |
| hold | `seed/data/copy/pl/products.json:1093` FO-GS-012 `descriptionMd` | We hold the pastel scheme and our florist chooses the flowers and the toy from the shop; the toy is new, tagged and suitable from birth, and the bouquet is tied light enough to carry. |

**E7 (the "Not applied" rows are resolved by batch 3, rows B1 to B9 and B10 to B35, 2026-10-15). Batch 2 (founder, "R ok", 2026-10-14): what was applied with a judgement, what was not applied, and why.** No new copy was written for anything below.

Applied, with a judgement the orchestrator should check:
- **R6/R7.** `corridor.steps.live.twoBody` gets the R6/R7 text, although its current text differs from the "Now" column: "We chose them ourselves and we have stood in their shop. They see the recipient's details and your card message, and nothing about you." I applied it because the row's own label names R7.
- **R15a.** In each of the 7 `en` guides, the new sentence replaces the first paragraph of "What we can honestly tell you today", the one that held "talking to / choosing / meeting the shops … until one of them has agreed". The second paragraph ("When that changes … the cities we cover, what happens on the day, and who to speak to when something goes wrong") now repeats it. I left it; whether to cut it is the founder's call.
- **R16.** The new text replaces the whole answer to each `en-gb` guide's "who" FAQ. The questions differ: de "Who am I actually buying from?", es "Who am I contracting with when I order?", fr "Who is the order with, and who do I chase?", it "Who do I deal with if an order goes wrong?", nl "Who am I buying from, and who handles a complaint?", pl "Who am I buying from, and who do I complain to?", ro "Who is my order with, and who puts it right?". The answers did not match the "Now" text word for word. In the `en-gb/pl` body, the exact sentence "Your contract is with us, not with the shop that makes the bouquet." is replaced. "whoever carries the flowers" is cut in `en-gb` es, fr and it.
- **R24.** `faq.photo.answer` needed the verbs to agree: "Our florist works … and substitutes …".
- **Seed `de`/`pl`.** The German and Polish sentences for funeral, gift_set, valentines and wedding are my drafts inside rows marked `translationStatus: "human"`, `reviewed: false`, with the new `sourceHash`. I kept `human` because the copy drafter regenerates `machine` rows from the English, which would put English back. The `de`/`pl` product rows are machine echoes and carry the same English edit.
- **Indexability.** Eight `en` seed rows now ship `reviewed: false`, which affects catalogue indexability exactly as E1 does. The founder's record run fixes both.

Not applied:
- **Fails a gate:**
  - R22 "what is freshest that day" (FO-BQ-011, FO-GS-003) fails `seed:check` `copy/superlative`, because "freshest" is banned.
  - R22's cut on FO-BQ-019 leaves 59 words, and R19 on `sant_jordi` leaves 58, both outside `copy/wordCount` 60–90.
  - These rows need the founder's alternative wording.
- **"Now" text not found word for word:**
  - R18 `gift_set.seoDescription` "…bought by the same florist." (en, and de/pl "gekauft vom selben Floristen", "od tego samego florysty").
  - R19 `sant_jordi.seoDescription` "…where we have a florist in the city." (en, de, pl).
  - R22 FO-AR-010 "where the season has ended our florist tells us before we take the order", and category `peonies` "outside it our florist tells us before we take an order rather than substituting something else".
  - R23 `en-gb/es-guide.md:3` "…who your order is with and what we can do today."
- **Not named by any row:**
  - The `en-gb` guides' "What we can honestly tell you today" sections, which R15a names only for the English guides: de:125, es:132, fr:132 ("We are choosing shops. Until one of them has agreed"), it:131, nl:131, pl:124, ro:128.
  - The `en-gb` "Money, and where you stand" paragraphs: de:119 "not from whichever shop ends up making the bouquet", es:124 "not with the shop that arranges the flowers", fr:126 "rather than with the florist who ties the flowers", it:124 "not with the fiorista who makes the bouquet", nl:124 "never with the shop that ties the bunch", ro:122 "not with the florist who assembles the bouquet", and pl:118 "an argument with a shop abroad".
  - R15b analogues: `en-gb/pl-guide.md:90` "If we compose the bouquet, the shop …", `en-gb/fr-guide.md:87` "A shop composes to a shape …", the `en-gb/es-guide.md:93` heading "Heat, and what a shop will agree to make" and line :99 "shop will offer", and `en/es-guide.md:9` intro "what a shop will agree to".
  - Plural "our florists": `en/pl-guide.md:22` FAQ "Our florists count the stems so you do not have to.", and `seed/data/copy/en/occasions.json` just_because "These are the orders our florists like most …".
  - Seed "shop": FO-BQ-017 "depend on what our florist has in the shop", FO-PT-001 and category `orchids` "when it leaves the shop", category `lilies` "Stems leave the shop part-closed", FO-GS-007 "a box of chocolates from a shop near the recipient", FO-GS-012 "the toy from the shop".

## Progress

- 2026-10-14: copy, de/pl drafts, glossary, `src/config/honesty.ts`, unit and e2e scans committed and pushed; blocked on E1 (founder's record run) and E2 (map budget).
- 2026-10-15: the founder's record script `.claude/state/record-approval-226.py` (not committed; tested on a throwaway worktree, where it reached APPROVE and made the E1 cascade green, leaving only the map budget, E2); `valentines` loses its em dash so it can be recorded; the task-226 pins accept the record. Batch-3 proposals in `.claude/state/relay-copy-batch-3.md` (89 rows).
- 2026-10-14: batch 2 (R2 to R24) applied where its text was found and passes the gates; the rest is recorded in E7. Every changed key and field is listed in Result.

## Result

PR 225 (draft), branch `task/TASK-226-buyer-copy-no-relay`. Status `blocked` on E1 and E2.

- **AC-51 (spec 010), catalogue half:** `tests/unit/relay-language.test.ts`, 94 cases, green. Mutation: `messages/pl.json` `home.howItWorks.make.title` set back to "A florist a few streets away accepts it." turns 3 cases red ("`pl` gives no relay match outside RELAY_EXEMPT": `expected [ Array(1) ] to deeply equal []`). Reverted.
- **AC-30 (spec 041), site-wide half:** `tests/e2e/relay-scan.spec.ts`, 22 documents (home, product, country shop, category and occasion in en, en-gb, de and pl; the guide in en and en-gb, because de/pl have none). It reads body text plus `alt`/`aria-label`/`title`/meta. The planted cases put a phrase into one page's text and one `alt` and need the same read to fail. CI runs it; no build slot was taken. A real-page mutation (a key put back, then rebuilt) needs the build slot, which the orchestrator has to grant.
- **Gates (batch 1, aec23907):** `pnpm gates:cheap` is red on tests only (48 cases, all in the E1 indexability cascade); typecheck, lint, format:check, i18n:check, check:no-db and codebase:map --check are at exit 0. With the founder's record simulated locally, the only red cases left are the expected pins and the sitemap fixtures (E1), the map budget (E2), and two load-timeouts (`dev-os`, `url-pii`, load average about 20).
- **Not done here:** the founder's record run; refreshing the visual baselines (E5); rewording the E6 hits.

- **Batch 2:** the de drafts avoid "Blumen", which `home-honesty`'s partner-name shape reads as a shop name, and the pl FAQ draft avoids "dostaw" (`ui-home` H3). `seed/snapshot/product_translation.json` is regenerated (`pnpm seed:diff --write`).

- **CI on 95b68a50:** e2e has 1794 passed, including all 52 relay-scan cases. 5 failed: 4 are the language-popup "beta" mark (the E1 cascade), and 1 is an unexpected pass. `/en-gb/send-flowers-to` at 1280 × 800 now has its primary action in view, because R4 shortened the hub intro, so the `destinationsHub` row leaves `PENDING` in `tests/e2e/frame-laptop-band.spec.ts`, as that file asks. Visual fails as E5 expects. test-unit and test-integration fail with the E1 cascade.

### Every `en`/`en-gb` key and content or seed field changed, with its final text (for the founder's record script)

Everything below ships `reviewed: false`, apart from the 14 guide files: corridor review is per file and they keep their file-level `reviewed: true`, so the record script should restamp `reviewedAt`. `de`/`pl` carry `source: machine` drafts for every message key below.

Batch 1:
- `home.howItWorks.make.title` → "Our florist nearby makes it that morning."
- `corridor.facts.orderBy.none` → "None yet."
- `checkout.price.currencyLine` → "You pay in {buyerCurrency}."
- `delivery.picker.live` → "Order by {time} in {city}, the recipient's time, not yours"
- 14 guide FAQ answers (`content/corridors/{en,en-gb}/{de,es,fr,it,nl,pl,ro}-guide.md`, the "today / now / at the moment" question) → "Not yet. Ordering for {Germany|Spain|France|Italy|the Netherlands|Poland|Romania} is not open. When it opens, this page shows the delivery days and the order-by time."

Batch 2:
- `home.proof.local.body` → "Made by our florist, a few streets from their door."
- `home.destinations.body` → "We open one country at a time, and only when we can promise the same flowers and the same care."
- `destinationsHub.intro` → "Seven countries in Europe, and we have written a guide to every one of them: what is given, what is never given, how an address is written, and which dates matter in a year there. We write the guide first and open delivery after it. Where we are not delivering yet, this page says so in the same words on every row."
- `corridor.steps.guide.twoBody` → "Our florist sees the recipient's address and your card message, and nothing else about you."
- `corridor.steps.live.twoBody` → "Our florist sees the recipient's address and your card message, and nothing else about you."
- `checkout.privacy.demoNotice` → "<b>Please use sample details, not a real person's.</b> We keep what you type here for {period, select, hours24 {24 hours} other {7 days}} to show how ordering works, then we delete the personal details. {controllerLine}"
- `catalog.addon.plush.description` → "A small, new soft toy, chosen to suit the bouquet."
- `catalog.addon.chocolates.description` → "A box of good chocolates, delivered with the flowers."
- `catalog.addon.wine.description` → "A bottle of local wine, where local law allows it."
- `faq.photo.answer` → "Close, not identical. Our florist works with what is fresh that morning and substitutes like for like in colour and value. Every change is noted on your delivery photo."
- `corridor.shop.body` → "Bouquets our florist in {country} can make, priced for {country}, with delivery and VAT already in the price."
- `shop.category.seoDescription` → "The {entity} our florist can make in {country}, each with one price that includes VAT and delivery. Nothing can be ordered yet."
- `shop.root.seoDescription` → "Every bouquet our florist can make in {country}, with one all-in price that includes VAT and delivery. Nothing can be ordered yet."
- `seed/data/copy/en/categories.json` funeral `descriptionMd` → "Wreaths, sprays, a cross, a heart, grave bouquets and low memorial arrangements, in the forms each country expects. Tell us the funeral home or cemetery and we time the delivery to the service. Sympathy flowers to a home are here too, for when a framed tribute would be too formal. Every order is made by hand and delivered in person by our florist in the recipient's city."
- `seed/data/copy/en/categories.json` gift_set `descriptionMd` → "A bouquet with one thing added: chocolates, a glass vase, a balloon or a small soft toy, chosen to go with the flowers and delivered together. Nothing is shipped separately, so the whole gift arrives at once and in one condition. Sets that contain food carry allergen information at checkout, and every price includes delivery and local tax. Every order is made by hand and delivered in person by our florist in the recipient's city."
- `seed/data/copy/en/occasions.json` valentines `descriptionMd` → "Valentine's Day is one date across the whole of Europe and the busiest day of our year. Red roses cost more that week, everywhere in Europe, and a surcharge applies on the day itself — both are shown before you pay. Order early: cutoffs move forward that week. Every order is made by hand and delivered in person by our florist in the recipient's city."
- `seed/data/copy/en/occasions.json` wedding `descriptionMd` → "We deliver flowers to a wedding as a gift or a table piece, not as a wedding contract: no bridal work, no venue installation, no consultation. White roses, white peonies, lilies and an orchid are what people send to a couple. For bridal flowers and venue work, book a wedding florist months ahead. Every order is made by hand and delivered in person by our florist in the recipient's city."
- `seed/data/copy/en/products.json` FO-BQ-034 `descriptionMd` → "Whatever is at its peak that week, tied by hand in mixed colour: usually a focal flower, two supporting stems and seasonal foliage. Eighteen stems as standard, with twelve and twenty-four sizes. A birthday bouquet or a just-because delivery when you would rather trust our florist. The whole mix is our florist's choice on the day. Every order is made by hand and delivered in person by our florist in the recipient's city."
- `seed/data/copy/en/products.json` FO-GS-004 `descriptionMd` → "A pink and white bouquet with a small soft toy for a new baby, tied to be light in the hand. Eighteen stems as standard, with twelve and twenty-four sizes. Sent for new babies and congratulations. We hold the pink scheme; the flowers and the toy come from our florist, and the toy is new, tagged and suitable from birth. Every order is made by hand and delivered in person by our florist in the recipient's city."
- `seed/data/copy/en/products.json` FO-GS-008 `descriptionMd` → "Our pink peony bouquet with a heavier glass vase, priced at the top of the range because peonies are. Fifteen stems as standard, nine or twenty-one available. Sent for anniversaries, weddings and romance in the peony months. The pink scheme is held and the vase is included. Every order is made by hand and delivered in person by our florist in the recipient's city."
- `seed/data/copy/en/products.json` FO-PT-002 `descriptionMd` → "One pink moth orchid, staked and potted in a plain container, in bud and flower on the day it is delivered. A single size. Sent for birthdays, Mother's Day and thank yous, and it asks for very little care. The plant is always a pink moth orchid; shade ranges from pale to deep, and the pot depends on the day. Every order is made by hand and delivered in person by our florist in the recipient's city."
- `content/corridors/en/de-guide.md` body, "What we can honestly tell you today", first paragraph → "We are not delivering in Germany yet. When we start, this page will show the cities, the order-by time and what happens on the day."
- `content/corridors/en-gb/de-guide.md` faq "Who am I actually buying from?" → "You buy from us, Flowers Overseas, and we look after everything, in English, from order to doorstep."
- `content/corridors/en/es-guide.md` body, "What we can honestly tell you today", first paragraph → "We are not delivering in Spain yet. When we start, this page will show the cities, the order-by time and what happens on the day."
- `content/corridors/en/es-guide.md` body heading → "Heat, hours and timing"
- `content/corridors/en-gb/es-guide.md` faq "Who am I contracting with when I order?" → "You buy from us, Flowers Overseas, and we look after everything, in English, from order to doorstep."
- `content/corridors/en-gb/es-guide.md` body → "…because the customs are worth knowing, and because…" ("whoever carries the flowers" cut)
- `content/corridors/en/fr-guide.md` body, "What we can honestly tell you today", first paragraph → "We are not delivering in France yet. When we start, this page will show the cities, the order-by time and what happens on the day."
- `content/corridors/en/fr-guide.md` body → "…if you leave the composition to our florist it will be handled for you."
- `content/corridors/en-gb/fr-guide.md` faq "Who is the order with, and who do I chase?" → "You buy from us, Flowers Overseas, and we look after everything, in English, from order to doorstep."
- `content/corridors/en-gb/fr-guide.md` body → "…the etiquette is worth knowing." ("whoever carries the flowers" cut)
- `content/corridors/en/it-guide.md` body, "What we can honestly tell you today", first paragraph → "We are not delivering in Italy yet. When we start, this page will show the cities, the order-by time and what happens on the day."
- `content/corridors/en-gb/it-guide.md` faq "Who do I deal with if an order goes wrong?" → "You buy from us, Flowers Overseas, and we look after everything, in English, from order to doorstep."
- `content/corridors/en-gb/it-guide.md` body → "…the customs are worth knowing, and because…" ("whoever carries the flowers" cut)
- `content/corridors/en/nl-guide.md` body, "What we can honestly tell you today", first paragraph → "We are not delivering in the Netherlands yet. When we start, this page will show the cities, the order-by time and what happens on the day."
- `content/corridors/en-gb/nl-guide.md` faq "Who am I buying from, and who handles a complaint?" → "You buy from us, Flowers Overseas, and we look after everything, in English, from order to doorstep."
- `content/corridors/en-gb/nl-guide.md` seoDescription → "Tulip season, Moederdag, Koningsdag and why less is more. For British senders, with sterling prices and what we can do today."
- `content/corridors/en/pl-guide.md` body, "What we can honestly tell you today", first paragraph → "We are not delivering in Poland yet. When we start, this page will show the cities, the order-by time and what happens on the day."
- `content/corridors/en/pl-guide.md` body → "When we make a bouquet for you, our florist counts the stems for you as a matter of course."
- `content/corridors/en-gb/pl-guide.md` faq "Who am I buying from, and who do I complain to?" → "You buy from us, Flowers Overseas, and we look after everything, in English, from order to doorstep."
- `content/corridors/en-gb/pl-guide.md` body, "Money, and where you stand" → "You buy from us, Flowers Overseas, and we look after everything, in English, from order to doorstep." (replaces "Your contract is with us, not with the shop that makes the bouquet.")
- `content/corridors/en/ro-guide.md` body, "What we can honestly tell you today", first paragraph → "We are not delivering in Romania yet. When we start, this page will show the cities, the order-by time and what happens on the day."
- `content/corridors/en-gb/ro-guide.md` faq "Who is my order with, and who puts it right?" → "You buy from us, Flowers Overseas, and we look after everything, in English, from order to doorstep."

Batch 3 (founder, 2026-10-15, "yes go ahead"):
- Rows B1 to B89 of the Binding table are applied exactly. Their "Proposed new" column is the final text. `de`/`pl` product rows repeat the English. The `de`/`pl` category and occasion rows (get_well, tulips, lilies, orchids, peonies, gift_set, anniversary, just_because, sant_jordi) carry my German and Polish drafts of the changed sentences, keep `translationStatus: "human"` (see E7) and have `reviewed: false`.
- Seed rows now unreviewed, waiting for the record: 57 `en` rows (13 categories and occasions, 44 products) and 2 `en-gb` product rows (FO-AR-007, FO-GS-006). The record script lists them.
- Pick 1: the second paragraph of "What we can honestly tell you today" is cut in all 7 English guides (`content/corridors/en/{de,es,fr,it,nl,pl,ro}-guide.md`), each beginning "When that changes …". Each section now reads only "We are not delivering in {country} yet. When we start, this page will show the cities, the order-by time and what happens on the day."
- Pick 3: heading changes, "shop" to the country's flower culture:
  - `content/corridors/en-gb/de-guide.md`: "What a German shop will make you" → "What German florists are known for"
  - `content/corridors/en-gb/it-guide.md` and `content/corridors/en/it-guide.md`: "What an Italian shop is good at" → "What Italian florists are known for"
  - `content/corridors/en-gb/ro-guide.md` and `content/corridors/en/ro-guide.md`: "What a Romanian shop is good at" → "What Romanian florists are known for"
  - `content/corridors/en-gb/pl-guide.md`: "What a shop there will build" → "What Polish florists are known for"
  - `content/corridors/en/fr-guide.md`: "What a French shop is good at" → "What French florists are known for"
  - Kept as general facts about the country: "How the shops and markets work" (nl, both guides) and body lines such as "shops close on Sunday".
  - Left for the founder: the body under the British German heading still ends "the least interesting thing in the shop", where "the shop" means the local trade.
- Punctuation only, so the record script's em-dash check passes on every recorded row (the founder's no-em-dash rule): FO-BQ-014 "Tulips in strong mixed colour (orange, pink and red together), tied …", FO-BQ-031 "Soft pastels only (pale pink, cream, white), cut …", FO-FN-008 "A wreath in pastel rather than pure white (pale pink, cream and soft green on a round frame), for …" (`de`/`pl` echoes follow). Product `seoTitle` em dashes are untouched (pick 2).
- The record script covers all three batches in one run: 17 message keys, 73 catalogue lines over 59 rows and 73 guide lines (8 of the lines are cuts), so **163 numbered texts**.
