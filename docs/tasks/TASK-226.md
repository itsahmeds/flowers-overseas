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

- **Founder copy approval, 2026-10-14 ~17:20Z, in chat ("R ok"): the second batch, exactly the `en`/`en-gb` texts in the table of `.claude/state/relay-copy-batch-2.md` in the main checkout (rows R2, R3, R4, R6/R7, R9, R10, R11, R12, R15a, R15b, R16, R17, R18, R19, R20, R21, R22, R23, R24).** Same handling as the first batch: ship `reviewed: false`, `de`/`pl` get machine drafts (`source: machine`), the founder records the approval with the orchestrator's script. Where a row's "Now" text is not found verbatim, or where the same giveaway appears in a place the row does not name, record it in Escalations instead of writing new copy. R12's new text is "A bottle of local wine, where local law allows it." This widens the fence to the files those rows name: `messages/*.json` keys, `seed/data/copy/{en,en-gb,de,pl}/{categories,occasions,products}.json`, `content/corridors/{en,en-gb}/*-guide.md` (bodies, FAQs, seoDescription).
## Read

- `specs/041-trust-help-legal-pages.md` — `## 0. Index`, §14 A-founder-2026-10-14, AC-30
- `specs/010-checkout.md` — §14 A4, AC-51
- `docs/codebase-map.md`
- `tests/support/forbidden-phrases.ts`, `tests/e2e/phrase-scan.spec.ts`, `tests/unit/neutral-ordering-copy.test.ts`

## Carry-forwards

- **From the orchestrator (2026-10-14):** spec 041 L576 "what we hold" trips the `hold` pattern; that page is not built yet (TASK-182/183), so it is not this task's, but the scan must not exempt it.

## Escalations

**E1. Shipping the approved texts `reviewed: false` takes `en` out of the index (needs the founder's record run before merge).** Three `en` keys that were `reviewed: true` change value here (`home.howItWorks.make.title`, `corridor.facts.orderBy.none`, `delivery.picker.live`), so they ship unreviewed as the brief says. That moves `unreviewedShare("en")` from 4.80 % to **5.35 %**, over the 5 % threshold (`plan/03` §6, `src/modules/i18n/review.ts`), so `isLocaleIndexable("en")` and `("en-gb")` turn false: 48 unit cases in 20 files go red (sitemaps, hreflang, indexability, i18n:check summary, etc.). Simulating the founder's record of those three keys locally leaves only the expected pins red (this file's three "shipped unreviewed" cases, the review queue) and the sitemap fixtures, whose `<lastmod>` moves; so after the record run: `UPDATE_SEO_FIXTURES=1 pnpm exec vitest run --project unit tests/unit/sitemap-fixtures.test.ts`, then flip the three `reviewed: false` assertions in `tests/unit/relay-language.test.ts` to the record, and drop the three keys from `AWAITING_FOUNDER_REVIEW` in `tests/unit/i18n-messages-schema.test.ts`. This is what TASK-193 did (the founder's commit inside the PR). The 14 guide files keep their file-level `reviewed: true` (corridor review is per file, decisions-log 2026-09-16); only `version` and `updatedAt` moved, so the founder's record should restamp `reviewedAt`.

**E2. `docs/codebase-map.md` is over its 17 KB budget by 49 bytes** (`tests/unit/codebase-map.test.ts`, 17 × 1024 = 17 408; main is 17 390, so any new config file breaks it). The new row is already the shortest summary that says what the file is. The budget is a spec number, so raising it is the orchestrator's call, not this task's.

**E3. `RELAY_EXEMPT` carries a third kind.** Spec 041 §14 allows two kinds (non-buyer surfaces, quoted records) and "no per-key exemption on a buyer surface"; the work order rules that "my partner" (`home.sentence.who`, case `partner`, `en`/`en-gb`) gets an entry citing the decisions-log row of 2026-10-04. It is a `decided-string` entry: the exact ICU case in that key and locale, and in rendered HTML only an `<option>` whose whole text is "my partner". Mutations show the word elsewhere still fails. A spec amendment should record it.

**E4. Two readings of the definition, both stricter than the letter.** (a) `de` and `pl` read the `en` list as well as their own, because their Phase 0 drafts echo the English (spec 003 §14 A15): without it, "accepts it" put back into `pl.json` would not go red. (b) Stems take inflections the spec's base words miss (`zaakcept*` for "zaakceptuje", `until (a|our|the) florist`). Key names are not scanned (work order).

**E5. Visual baselines.** The home how-it-works step, the corridor facts row and the product picker's cutoff line change text, so the `visual` job needs the `visual:baselines` label (labels are the orchestrator's).

**E6. Every hit the scan reports outside this task's fence (orchestrator, 2026-10-14: record, do not reword, do not exempt).** The message catalogues are clean. The hits are in seed copy and guide prose; `de`/`pl` seed rows are the English echo, so they repeat the `en` rows (43 each). The e2e matrix reads `amber-hour` and the Poland, roses and Mother's Day pages, which render none of these as far as the copy shows; CI is the proof. QA-5 §1 (R1 to R24) lists further relay wording that the patterns do not match (for example "the shop that makes the bouquet", "we pass the details on").

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
| hold | `seed/data/copy/de/products.json:989` FO-GS-004 `descriptionMd` | We hold the pink scheme; the flowers and the toy come from our florist's own shop, and the toy is new, tagged and suitable from birth. |
| hold | `seed/data/copy/de/products.json:1002` FO-GS-005 `descriptionMd` | We hold the mixed tulip scheme, because tulip colours change from week to week. |
| held | `seed/data/copy/de/products.json:1015` FO-GS-006 `descriptionMd` | The pastel scheme is held and the vase is always included; the flowers inside the scheme and the vase's shape are our florist's choice. |
| held | `seed/data/copy/de/products.json:1028` FO-GS-007 `descriptionMd` | The yellow scheme is held; supporting stems follow the week. |
| held | `seed/data/copy/de/products.json:1041` FO-GS-008 `descriptionMd` | The pink scheme is held and the vase is included; outside the season our florist tells us before we take the order. |
| take | `seed/data/copy/de/products.json:1041` FO-GS-008 `descriptionMd` | The pink scheme is held and the vase is included; outside the season our florist tells us before we take the order. |
| hold | `seed/data/copy/de/products.json:1054` FO-GS-009 `descriptionMd` | We hold the mixed scheme; the flowers and the balloon design are our florist's choice on the day. |
| hold | `seed/data/copy/de/products.json:1067` FO-GS-010 `descriptionMd` | We hold the vibrant scheme; gerbera colours and the balloon design depend on the day's stock. |
| held | `seed/data/copy/de/products.json:1080` FO-GS-011 `descriptionMd` | The white scheme is held; lilies arrive part-closed and open over days. |
| hold | `seed/data/copy/de/products.json:1093` FO-GS-012 `descriptionMd` | We hold the pastel scheme and our florist chooses the flowers and the toy from the shop; the toy is new, tagged and suitable from birth, and the bouquet is tied light enough to carry. |
| hold | `seed/data/copy/en/categories.json:164` get_well `descriptionMd` | Bouquets and arrangements chosen for a hospital room or a sofa: light to hold, low in scent, and several in a box or pot so no vase is needed. |
| hold | `seed/data/copy/en/categories.json:164` get_well `descriptionMd` | Some wards do not accept flowers, so check before ordering and we will hold the delivery if needed. |
| accept | `seed/data/copy/en/categories.json:164` get_well `descriptionMd` | Some wards do not accept flowers, so check before ordering and we will hold the delivery if needed. |
| hold | `seed/data/copy/en/categories.json:254` tulips `descriptionMd` | A spring flower: growers change varieties weekly, so we hold the colour and let our florist choose the variety. |
| held | `seed/data/copy/en/categories.json:256` tulips `seoDescription` | Colour held; variety by week. |
| take | `seed/data/copy/en/categories.json:314` peonies `descriptionMd` | The season is short — a few weeks in late spring — and outside it our florist tells us before we take an order rather than substituting something else. |
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
| hold | `seed/data/copy/en/products.json:569` FO-BQ-038 `descriptionMd` | A long-lasting, unfussy bouquet for a birthday, a name day or a Sunday visit; carnations often hold two weeks in water. |
| hold | `seed/data/copy/en/products.json:614` FO-AR-001 `descriptionMd` | We hold the pastel scheme; the flowers inside it are our florist's choice. |
| hold | `seed/data/copy/en/products.json:659` FO-AR-004 `descriptionMd` | We hold the vibrant colour scheme; the exact colours follow the day's delivery. |
| hold | `seed/data/copy/en/products.json:674` FO-AR-005 `descriptionMd` | The pink colour scheme is what we hold; tulip variety and shade depend on the week. |
| hold | `seed/data/copy/en/products.json:704` FO-AR-007 `descriptionMd` | Sent for housewarmings and thank yous, and it holds up in a warm room better than a tied bouquet. |
| take | `seed/data/copy/en/products.json:749` FO-AR-010 `descriptionMd` | Peonies are always the flower; where the season has ended our florist tells us before we take the order. |
| hold | `seed/data/copy/en/products.json:794` FO-AR-013 `descriptionMd` | Sent for All Saints' visits, thank yous and housewarmings, and chrysanthemums hold longer than most cut flowers. |
| hold | `seed/data/copy/en/products.json:809` FO-AR-014 `descriptionMd` | Sent for a new baby, a get-well or a birthday; alstroemeria often holds two weeks. |
| hold | `seed/data/copy/en/products.json:809` FO-AR-014 `descriptionMd` | We hold the pastel scheme, and our florist chooses shades and any filler from the day's delivery. |
| hold | `seed/data/copy/en/products.json:944` FO-FN-001 `descriptionMd` | We hold the white scheme and the form; the flowers inside it are chosen by our florist from that morning's market. |
| held | `seed/data/copy/en/products.json:974` FO-FN-003 `descriptionMd` | The white scheme is held; flowers are chosen on the day from what will hold its shape for the service. |
| hold | `seed/data/copy/en/products.json:974` FO-FN-003 `descriptionMd` | The white scheme is held; flowers are chosen on the day from what will hold its shape for the service. |
| hold | `seed/data/copy/en/products.json:989` FO-FN-004 `descriptionMd` | The white scheme and the heart form are what we hold; rose variety and any filler are chosen by our florist on the morning of the service. |
| hold | `seed/data/copy/en/products.json:1004` FO-FN-005 `descriptionMd` | We hold the white scheme; the mix is our florist's choice from that day's market. |
| hold | `seed/data/copy/en/products.json:1019` FO-FN-006 `descriptionMd` | We hold the mixed scheme and the flat form; colours follow what our florist can buy that week. |
| hold | `seed/data/copy/en/products.json:1049` FO-FN-008 `descriptionMd` | We hold the pastel scheme and the round form, and our florist chooses the flowers from what is open that morning. |
| held | `seed/data/copy/en/products.json:1064` FO-FN-009 `descriptionMd` | The white scheme is held; the foliage follows the season. |
| hold | `seed/data/copy/en/products.json:1079` FO-FN-010 `descriptionMd` | We hold the white scheme and the low form; the flowers and the container's finish are our florist's choice. |
| hold | `seed/data/copy/en/products.json:1094` FO-GS-001 `descriptionMd` | We hold the orange scheme and swap greenery for what the market has. |
| held | `seed/data/copy/en/products.json:1109` FO-GS-002 `descriptionMd` | The pink scheme is held and the vase is always included; vase height and shape depend on what our florist stocks that week. |
| hold | `seed/data/copy/en/products.json:1124` FO-GS-003 `descriptionMd` | We hold the blue scheme; the flowers and the toy are chosen by our florist from what is in the shop, and the toy is new and tagged. |
| hold | `seed/data/copy/en/products.json:1139` FO-GS-004 `descriptionMd` | We hold the pink scheme; the flowers and the toy come from our florist's own shop, and the toy is new, tagged and suitable from birth. |
| hold | `seed/data/copy/en/products.json:1154` FO-GS-005 `descriptionMd` | We hold the mixed tulip scheme, because tulip colours change from week to week. |
| held | `seed/data/copy/en/products.json:1169` FO-GS-006 `descriptionMd` | The pastel scheme is held and the vase is always included; the flowers inside the scheme and the vase's shape are our florist's choice. |
| held | `seed/data/copy/en/products.json:1184` FO-GS-007 `descriptionMd` | The yellow scheme is held; supporting stems follow the week. |
| held | `seed/data/copy/en/products.json:1199` FO-GS-008 `descriptionMd` | The pink scheme is held and the vase is included; outside the season our florist tells us before we take the order. |
| take | `seed/data/copy/en/products.json:1199` FO-GS-008 `descriptionMd` | The pink scheme is held and the vase is included; outside the season our florist tells us before we take the order. |
| hold | `seed/data/copy/en/products.json:1214` FO-GS-009 `descriptionMd` | We hold the mixed scheme; the flowers and the balloon design are our florist's choice on the day. |
| hold | `seed/data/copy/en/products.json:1229` FO-GS-010 `descriptionMd` | We hold the vibrant scheme; gerbera colours and the balloon design depend on the day's stock. |
| held | `seed/data/copy/en/products.json:1244` FO-GS-011 `descriptionMd` | The white scheme is held; lilies arrive part-closed and open over days. |
| hold | `seed/data/copy/en/products.json:1259` FO-GS-012 `descriptionMd` | We hold the pastel scheme and our florist chooses the flowers and the toy from the shop; the toy is new, tagged and suitable from birth, and the bouquet is tied light enough to carry. |
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
| hold | `seed/data/copy/pl/products.json:989` FO-GS-004 `descriptionMd` | We hold the pink scheme; the flowers and the toy come from our florist's own shop, and the toy is new, tagged and suitable from birth. |
| hold | `seed/data/copy/pl/products.json:1002` FO-GS-005 `descriptionMd` | We hold the mixed tulip scheme, because tulip colours change from week to week. |
| held | `seed/data/copy/pl/products.json:1015` FO-GS-006 `descriptionMd` | The pastel scheme is held and the vase is always included; the flowers inside the scheme and the vase's shape are our florist's choice. |
| held | `seed/data/copy/pl/products.json:1028` FO-GS-007 `descriptionMd` | The yellow scheme is held; supporting stems follow the week. |
| held | `seed/data/copy/pl/products.json:1041` FO-GS-008 `descriptionMd` | The pink scheme is held and the vase is included; outside the season our florist tells us before we take the order. |
| take | `seed/data/copy/pl/products.json:1041` FO-GS-008 `descriptionMd` | The pink scheme is held and the vase is included; outside the season our florist tells us before we take the order. |
| hold | `seed/data/copy/pl/products.json:1054` FO-GS-009 `descriptionMd` | We hold the mixed scheme; the flowers and the balloon design are our florist's choice on the day. |
| hold | `seed/data/copy/pl/products.json:1067` FO-GS-010 `descriptionMd` | We hold the vibrant scheme; gerbera colours and the balloon design depend on the day's stock. |
| held | `seed/data/copy/pl/products.json:1080` FO-GS-011 `descriptionMd` | The white scheme is held; lilies arrive part-closed and open over days. |
| hold | `seed/data/copy/pl/products.json:1093` FO-GS-012 `descriptionMd` | We hold the pastel scheme and our florist chooses the flowers and the toy from the shop; the toy is new, tagged and suitable from birth, and the bouquet is tied light enough to carry. |

## Progress

- 2026-10-14: copy, de/pl drafts, glossary, `src/config/honesty.ts`, unit and e2e scans committed and pushed; blocked on E1 (founder's record run) and E2 (map budget).

## Result

PR 225 (draft), branch `task/TASK-226-buyer-copy-no-relay`. Status `blocked` on E1 and E2.

- **AC-51 (spec 010), catalogue half:** `tests/unit/relay-language.test.ts`, 94 cases, green. Mutation: `messages/pl.json` `home.howItWorks.make.title` set back to "A florist a few streets away accepts it." turns 3 cases red ("`pl` gives no relay match outside RELAY_EXEMPT": `expected [ Array(1) ] to deeply equal []`). Reverted.
- **AC-30 (spec 041), site-wide half:** `tests/e2e/relay-scan.spec.ts`, 22 documents (home, product, country shop, category and occasion in en, en-gb, de and pl; the guide in en and en-gb, because de/pl have none). It reads body text plus `alt`/`aria-label`/`title`/meta. The planted cases put a phrase into one page's text and one `alt` and need the same read to fail. CI runs it; no build slot was taken. A real-page mutation (a key put back, then rebuilt) needs the build slot, which the orchestrator has to grant.
- **Gates:** `pnpm gates:cheap` is red on tests only (48 cases, all in the E1 indexability cascade); typecheck, lint, format:check, i18n:check, check:no-db and codebase:map --check are at exit 0. With the founder's record simulated locally, the only red cases left are the expected pins and the sitemap fixtures (E1), the map budget (E2), and two load-timeouts (`dev-os`, `url-pii`, load average about 20).
- **Not done here:** the founder's record run; refreshing the visual baselines (E5); rewording the E6 hits.

