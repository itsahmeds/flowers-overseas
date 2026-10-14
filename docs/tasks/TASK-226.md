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

**E6. Every hit the scan reports, after both copy batches (orchestrator, 2026-10-14: record it, do not reword it, do not exempt it).** The message catalogues are clean. All remaining hits are in seed copy and guide prose. The `de`/`pl` product rows are the English echo, so they repeat the `en` product rows. No row of either batch covers these. The e2e matrix renders none of them, and CI on bbe273ce was green for all 52 relay-scan cases.

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

**E7. Batch 2 (founder, "R ok", 2026-10-14): what was applied with a judgement, what was not applied, and why.** No new copy was written for anything below.

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
