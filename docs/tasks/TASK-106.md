# TASK-106 — Copy: category and occasion slugs in `de`/`pl` (founder-authored, §13 Q10), hub intros in four locales (`en` reviewed now, `de`/`pl` `reviewed: false`), the founder curation index behind the default sort (PR #67 Q1), and the four new `seed:check` rules of spec 006 §14 (slug presence per launch locale, slug shape/uniqueness, hub-intro 40–120 words, hub-intro ≥60 % token-distinct + banned-word/price/timing scan) with one failing fixture each

Row: `TASKS.md` → TASK-106. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-106`; keep it current by editing this file, not the row.

## Binding

- **AC-2 (spec 008 §9 L254), T-02 (§10 L305).** `pnpm seed:check` fails, naming file, entity and rule, on: a category or occasion with no slug in a launch locale; a slug that is not lowercase ASCII-hyphen, duplicated inside its namespace and locale, or equal to a `PATH_SEGMENT_KEYS` value or a country slug in that locale; a hub intro outside 40–120 words; a hub intro <60 % token-distinct from another hub intro in the same locale; a banned word, a price literal or a delivery-timing claim in an intro. It passes on the committed corpus. T-02: one failing fixture per rule (8 cases), each naming its rule.
- **§5.1 amendment 2 (to spec 006 §2.3):** the four copy rules are additive to `seed:check`; shape, fold and cross-namespace uniqueness already exist in family 4 (spec 006 AC-7) and are composed, not restated.
- **§7 and §13 Q10, with the founder's 2026-10-03 delegation (`## Escalations`):** the `de`/`pl` category and occasion slugs are written by hand, one term at a time, in native search wording, ASCII-folded by `asciiFoldSlug()` (spec 006 AC-7: the slug is the fold of its name); never machine-drafted. `de`/`pl` names and hub intros are `translationStatus: human`, `reviewed: false` (plan/13 B12). No new `en` string unreviewed.
- **`src/modules/catalog/slugs.ts`:** a `machine` row carries no slug; a page exists in `de`/`pl` only once its row is `human`. No logic change there.
- **§14 design round Q1:** the founder-set curation index behind the default sort is authored in this task (delegated by the founder, 2026-10-03).
- **Carry-forward (spec 009 §14 A4):** Andrzejki and Wigilia PL occasions — done here or handed back.
- **Gates:** `pnpm gates:cheap` exit 0; `seed:check` exit 0; CI green on the head SHA; AC-21's crawl pins (`tests/support/shop-crawl-targets.ts`) and the listing URL fixture follow the new existence set.

## Read

- `specs/008-country-shop-category-occasion-pages.md` — `## 0. Index`, §2 (existence rules), §5.1, §7, §9 AC-2, §10 T-02, §12 task 2, §13 Q3/Q10, §14 design-round Q1
- `specs/006-seed-catalogue-import-imagery-pipeline.md` — §2.3 (rule families 4 and 6), §14 A4 (no delivery timing)
- `docs/codebase-map.md`
- `seed/check.ts`, `seed/check-cases.ts`, `seed/copy.ts`, `tests/unit/seed-check.test.ts`, `tests/fixtures/seed/_cases/`
- `seed/data/copy/{de,pl}/{categories,occasions}.json`, `src/modules/catalog/{slugs,copy}.ts` (read only)
- `scripts/corridor-check.ts` (the shingle metric and price-literal pattern this composes), `src/config/voice.ts`
- `tests/support/shop-crawl-targets.ts`, `tests/unit/shop-crawl-targets.test.ts`, `tests/fixtures/shop/listing-urls.json`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From TASK-122 / orchestrator ruling (2026-09-18, spec 009 §14 A4):** ship the **Andrzejki (30 Nov) and Wigilia (24 Dec)** PL occasion rows here — two catalogue occasion keys, `seasonalOccasions` / `occasions.data.ts` entries, `catalog.facet.occasion.*` copy in four locales (`pl` authored), the projected `occasions.json` / `taxonomy.json`, the `fixed` rows in `seed/data/occasion-country.json`, and the dataset pins (32 → 34 occasions) — so `seed:check` accepts them. Polish name days stay undated.
- **From `/review 150` round 1 (2026-10-03), required change 1:** German umlauts fold to `ae`/`oe`/`ue`, as spec 008 §14 A12 says. Done: `TRANSLITERATIONS` in `seed/copy.ts` now carries `ä`/`ö`/`ü` (and `Ä`/`Ö`/`Ü`), with a unit case in `tests/unit/seed-copy.test.ts`. `bouquet` → `blumenstraeusse` and `muguet` → `maigloeckchen-zum-1-mai`. No other copy name carries an umlaut.
- **From `/review 150` round 1, nits for the B12 native reviewers:** `gratulation` (people search "Glückwunsch") and `einzug` ("Einweihung") may be weaker search terms, and changing them costs nothing until the rows are reviewed. The native timing and superlative lists are minimal: "in 24 Stunden" and "Lieferung morgen" pass today.
- **From `/break 150` round 1 (2026-10-03), holes 1–5:** closed with tests on the head after `15365638`. Each subject was mutated, and its case went red.
  - **Hole 1:** a category-vs-occasion `intro-distinct` case.
  - **Hole 2:** an exact-0.60 pair passes and a 0.44 pair fails, which pins `>=`.
  - **Hole 3:** `slug-missing` in `pl`, `path-segment` on an occasion, `country-slug` on a category.
  - **Hole 4:** fixtures `bad-hub-english-superlative` and `bad-hub-seo-native-timing`, plus `seoDescription` and `name` cases.
  - **Hole 5:** the intro price scan now also refuses `49,– €`, `EUR 49`, `PLN 149`, `RON 99` and `99 lei`.

  Hole 6 (the native word lists are minimal) is left to the reviewer. Hole 7 (umlauts) was closed on `15365638`.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **2026-10-03 — who authors the `de`/`pl` slugs and the curation order (spec 008 §13 Q10 said the founder). Answered.**
  Founder, in chat, 2026-10-03: "German and Polish web addresses … rest do it yourself." The founder
  delegates both to the orchestrator's fleet for Phase 0. Rule for the author (spec 008 §14
  amendment, landing in parallel on `docs/founder-answers-2026-10-03`): each slug is written by hand,
  one term at a time, in the wording a German or Polish buyer would search (e.g. `rosen`, `roze`),
  ASCII-folded per spec 003's slug rules; never a bulk machine translation. `de`/`pl` names and hub
  intros stay `reviewed: false` for the plan/13 B12 native reviewers. No new **English** string may
  be added unreviewed: English unreviewed copy sits at the 5 % gate (decisions log); if the task
  needs new `en` copy, stop and list it for the founder's batch approval instead.

- **2026-10-03 — carry-forward handed back: the Andrzejki (30 Nov) and Wigilia (24 Dec) PL occasions. Open, to the founder (copy batch) and the orchestrator.**
  Adding two occasion keys needs **new English strings**, which the founder's rule above forbids adding unreviewed: two facet labels (`catalog.facet.occasion.andrzejki`, `catalog.facet.occasion.wigilia` in `messages/en.json`) and two `copy/en/occasions.json` rows (name, slug, a 60–90-word intro, `seoTitle`, `seoDescription`) — `seed:check`'s new `slug-missing` rule requires a human `en` slug for every occasion, and the `en` row is the source every locale hashes. It also edits `src/config/catalogue/occasions.data.ts` and the projections, outside this task's fence. Proposed for the batch: labels "St Andrew's Eve (Andrzejki)" and "Christmas Eve (Wigilia)"; slugs `st-andrews-eve-in-poland` / `christmas-eve-in-poland`; `de` `andreasnacht-in-polen` / `heiligabend-in-polen`; `pl` `andrzejki` / `wigilia`. Once the `en` copy is approved, a follow-up task adds the rows, the `fixed` rows in `occasion-country.json` (PL 11-30, PL 12-24) and the 32 → 34 pins.
- **2026-10-03 — curation index handed back. Open, to the orchestrator.**
  Spec 008 §2 says only "a founder-set `sortIndex`, tie-broken by SKU". It does not say where the index lives or what shape it has, and the founder's delegation covers the *order*, not a schema. Wiring it means changing `topProductsForPrebuild()` (`src/modules/catalog/read.ts`, spec 005's documented collation order) and `inDefaultOrder()` (`src/modules/catalog/listing.ts`). Both are outside this task's fence. Doing that also moves the first card on every listing, so the `en` visual baselines and spec 008 §14 A11's LCP-nomination pins move too, and TASK-168 owns the baselines now. Proposal: `src/config/catalogue/curation.data.ts` as one ordered SKU list, with a `catalogue:check` rule that every active SKU appears exactly once. `topProductsForPrebuild()` would rank by it and tie-break by SKU. That belongs in its own task, sequenced after TASK-168.
- **2026-10-03 — reading recorded for the reviewer: "token-distinct" is measured as 5-gram shingle distinctness.** AC-2 does not define the metric. The literal token-set reading refuses the committed, reviewed `en` corpus: `category:sympathy` against `occasion:sympathy` scores 0.34, and spec 008 AC-2 says the gate "passes on the committed corpus". So the rule composes `scripts/corridor-check.ts`'s `shingleDistinctness()`, the metric spec 007 §14 A4 adopted for the same words in AC-2 of spec 007, with the 0.60 floor. The weakest committed pair is 0.71 in `en`. The reviewer may overrule this by amendment.
- **2026-10-03 — AC-21 crawl waiver grown by `de`/`pl` country categories. Open, to the reviewer (accept or refuse) and the orchestrator.**
  CI run 37115230193 on `053d5e48`: the e2e crawl from `/de` and from `/pl` reached 38 documents each, and none of the 140 country categories per locale. Their inbound links are the shop root and the sibling chips on other country categories. The shop root is already waived for `de`/`pl` (TASK-113 escalation 2), because its only inbound link is the corridor page and neither locale has one. So this is the same hole, one level down. `tests/support/shop-crawl-targets.ts` now carries it as rule 3 (`{de,pl} countryCategory`), and the waived count is pinned at 140 each. Both rules expire together the day a `de`/`pl` shop root gains an inbound edge (`waivedButReached` goes red). All 280 pages are `noindex,follow` and in no sitemap. Closing it means a link plan (a `de`/`pl` corridor page, or shop-root links from the occasion hubs), which belongs to spec 007/008's link owners, not this task.
- **2026-10-03 — `/review 150` round 1 rulings (reviewer):** **HOLE E1 ACCEPTABLE**: the AC-21 waiver gains `{de,pl} countryCategory` (140 pages each). Condition: the orchestrator files a task that links the `de`/`pl` shop roots, and it lands before either locale is flipped indexable. **Curation index hand-back: accepted.** The orchestrator files the `curation.data.ts` + `catalogue:check` task after TASK-168. **Andrzejki/Wigilia hand-back: accepted.** It goes to the founder's next copy batch, then a follow-up task (32 → 34 pins). **"Token-distinct" as 5-gram shingle distinctness with a 0.60 floor: accepted.** The orchestrator writes the spec 008 §14 amendment. **Umlaut folding: overruled** (see Carry-forwards). **Out-of-fence files accepted:** the `PRICE_LITERAL_PATTERN` export, the `de`/`pl` `catalog.floristSentence`, the `--sync-copy` reflow, and the e2e and crawl-target pins.

## Progress

- 2026-10-03 — brief filled, draft PR #150 opened.
- 2026-10-03 — `seed:check` gains the AC-2 rules; 110 `de`/`pl` rows authored by hand; `catalog.floristSentence` authored in `de`/`pl`; product drafts re-flowed.
- 2026-10-03 — `/review 150` round 1 required change done: umlaut fold to `ae`/`oe`/`ue`, two slugs renamed, fixtures regenerated.
- 2026-10-03 — CI on `053d5e48`: everything green except e2e. Six e2e pins asserted `de`/`pl` URLs 404, and the AC-21 crawl could not reach `de`/`pl` country categories. Re-pinned both, and grew the waiver (see Escalations). `consent-banner` AC-19 was flaky, passed on retry, and is unrelated.
- 2026-10-03 — eight T-02 fixtures, native-language timing/superlative/price scan, unit cases; 36 pins re-pinned; fixtures, snapshot, map regenerated; `gates:cheap` PASS.

## Result

PR #150. **AC-2 / T-02 covered.** `seed:check` (`seed/check.ts`) gains spec 008 AC-2's rules:
`slugs/slug-missing` (a category or occasion with no routed slug in a launch locale; `en-gb` takes `en`'s, `de`/`pl` take nothing — pinned to `hasSlug()`/`inheritsCopyFrom()`), `slugs/path-segment`, `slugs/country-slug`, `copy/intro-word-range` (40–120), `copy/intro-distinct` (< 0.60 5-gram shingle distinctness, see Escalations), `copy/intro-banned-word` (voice words + English and native superlatives), `copy/intro-price-literal` (the corridor gate's `PRICE_LITERAL_PATTERN`, now exported, plus the number-first `49,90 €` form), and `copy/delivery-timing` extended with German and Polish phrases for hub rows. Shape and uniqueness were already family 4's (spec 006 AC-7) and are not restated.

**Tests:** 8 new fixtures in `tests/fixtures/seed/_cases/` (34 total, each mutated to red by its own rule); 7 new unit cases in `tests/unit/seed-check.test.ts` (corpus-wide parity with `hasSlug()` over 220 key×locale pairs, inheritance both ways, word band at 39/40/120/121, the weakest committed pair per locale, native-language matchers including "Bestellung" not matching "beste"). 36 existing pins re-pinned from "`de`/`pl` have no slugs" to "`de`/`pl` have `en`'s page set under their own slugs, never an English one". Unit suite 6,323 passed; `gates:cheap` PASS.

**Copy:** 23 categories + 32 occasions = 55 entities × `de`, `pl` = **110 rows**, each written by hand: name, slug (= `asciiFoldSlug(name)`, so `ä`/`ö`/`ü`→`ae`/`oe`/`ue`, `ß`→`ss`, `ż`→`z`, per spec 008 §14 A12 and the shipped `anlaesse`/`rumaenien`. The fold in `seed/copy.ts` gained the umlaut mappings in `/review 150` round 1, and two slugs moved: `blumenstraeusse` and `maigloeckchen-zum-1-mai`), intro (51–83 words), `seoTitle`, `seoDescription`; `translationStatus: human`, `reviewed: false`, `sourceHash` of the `en` row. No new English string. The spec's "~31" is the count the spec guessed; the dataset has 55, and AC-2's `slug-missing` requires all of them. Six occasion slugs match the home tiles in `src/config/occasions.ts` exactly (`trauer`, `narodziny` among them). `catalog.floristSentence` is authored in `de` and `pl` (human, unreviewed) so intros close in their own language; `pnpm i18n:draft --sync-copy` reflowed the 168 machine product rows and nothing else. Weakest intro pair: `en` 0.71, `de` 0.69, `pl` 0.74 (all `apology` category vs occasion).

**Pins this diff moved:** `tests/fixtures/shop/listing-urls.json` (de/pl 7 → 206 pages each), `seed/snapshot/product_translation.json`, AC-21 `TARGETS` de/pl `{}` → `{countryOccasion 7, occasionHub 28, occasionsIndex 1}`, `WAIVED` de/pl `{countryShopRoot 7}` → `{categoryHub 23, countryCategory 140, countryShopRoot 7}`. The new `EXCLUDED` rule 3 (`de`/`pl` country categories) is an escalation for the reviewer; see Escalations. The e2e pins in `country-category`, `country-occasion`, `hubs` and `occasions-index` now assert that the `de`/`pl` pages exist and that the English slug under a German or Polish segment is a 404.

**Handed back:** the curation index and the Andrzejki/Wigilia carry-forward (see Escalations). Native-language superlatives and timing phrases are a minimal list, not a thesaurus; the B12 native reviewers should extend them.

| entity · key | `de` slug | `pl` slug |
|---|---|---|
| category · `bouquet` | `blumenstraeusse` | `bukiety` |
| category · `arrangement` | `blumengestecke` | `kompozycje-kwiatowe` |
| category · `plant` | `pflanzen` | `rosliny` |
| category · `funeral` | `trauerfloristik` | `kwiaty-pogrzebowe` |
| category · `gift_set` | `blumen-mit-geschenk` | `kwiaty-z-prezentem` |
| category · `birthday` | `geburtstagsblumen` | `kwiaty-na-urodziny` |
| category · `anniversary` | `blumen-zum-jahrestag` | `kwiaty-na-rocznice` |
| category · `romance` | `romantische-blumen` | `romantyczne-kwiaty` |
| category · `congratulations` | `blumen-zur-gratulation` | `kwiaty-z-gratulacjami` |
| category · `new_baby` | `blumen-zur-geburt` | `kwiaty-na-narodziny` |
| category · `get_well` | `blumen-zur-genesung` | `kwiaty-na-powrot-do-zdrowia` |
| category · `sympathy` | `blumen-zum-beileid` | `kwiaty-kondolencyjne` |
| category · `thank_you` | `blumen-zum-dank` | `kwiaty-na-podziekowanie` |
| category · `apology` | `blumen-zur-entschuldigung` | `kwiaty-na-przeprosiny` |
| category · `just_because` | `blumen-einfach-so` | `kwiaty-bez-okazji` |
| category · `roses` | `rosen` | `roze` |
| category · `tulips` | `tulpen` | `tulipany` |
| category · `lilies` | `lilien` | `lilie` |
| category · `orchids` | `orchideen` | `storczyki` |
| category · `sunflowers` | `sonnenblumen` | `sloneczniki` |
| category · `peonies` | `pfingstrosen` | `piwonie` |
| category · `gerberas` | `gerbera` | `gerbery` |
| category · `mixed` | `gemischte-blumen` | `bukiety-mieszane` |
| occasion · `birthday` | `geburtstag` | `urodziny` |
| occasion · `anniversary` | `jahrestag` | `rocznica` |
| occasion · `romance` | `liebe-und-romantik` | `milosc-i-romantyzm` |
| occasion · `congratulations` | `gratulation` | `gratulacje` |
| occasion · `new_baby` | `geburt` | `narodziny` |
| occasion · `get_well` | `gute-besserung` | `powrot-do-zdrowia` |
| occasion · `sympathy` | `trauer` | `kondolencje` |
| occasion · `thank_you` | `danke` | `podziekowania` |
| occasion · `apology` | `entschuldigung` | `przeprosiny` |
| occasion · `just_because` | `einfach-so` | `bez-okazji` |
| occasion · `wedding` | `hochzeit` | `slub` |
| occasion · `graduation` | `abschluss` | `ukonczenie-studiow` |
| occasion · `housewarming` | `einzug` | `parapetowka` |
| occasion · `retirement` | `ruhestand` | `emerytura` |
| occasion · `valentines` | `valentinstag` | `walentynki` |
| occasion · `womens_day` | `frauentag` | `dzien-kobiet` |
| occasion · `mothers_day` | `muttertag` | `dzien-matki` |
| occasion · `fathers_day` | `vatertag` | `dzien-ojca` |
| occasion · `grandparents_day` | `grosselterntag` | `dzien-babci-i-dziadka` |
| occasion · `easter` | `ostern` | `wielkanoc` |
| occasion · `all_saints` | `allerheiligen` | `wszystkich-swietych` |
| occasion · `christmas` | `weihnachten` | `boze-narodzenie` |
| occasion · `new_year` | `neujahr` | `nowy-rok` |
| occasion · `name_day` | `namenstag` | `imieniny` |
| occasion · `teachers_day` | `lehrertag` | `dzien-nauczyciela` |
| occasion · `sant_jordi` | `sant-jordi` | `sant-jordi` |
| occasion · `fete_des_grands_meres` | `grossmuttertag-in-frankreich` | `dzien-babci-we-francji` |
| occasion · `muguet` | `maigloeckchen-zum-1-mai` | `konwalie-na-1-maja` |
| occasion · `konfirmation` | `konfirmation` | `konfirmacja` |
| occasion · `student` | `schulabschluss` | `zakonczenie-szkoly` |
| occasion · `omatag` | `grossmuttertag-in-estland` | `dzien-babci-w-estonii` |
| occasion · `17_mai` | `17-mai-in-norwegen` | `swieto-konstytucji-norwegii` |
