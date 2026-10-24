# TASK-185 — de/pl agent-written drafts of the UI catalogue and seed copy

Row: `TASKS.md` → TASK-185. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

- **Source.** `specs/003-i18n-foundation.md` §14 **A15**, clauses 1–8, and AC-33 to AC-39 (T-33 to
  T-39). The founder chose option A on 2026-10-04 ("yes A"). They approved no German or Polish
  text: every value this task writes is `reviewed: false`, and no clause here may be read as their
  review.
- **Approved.** The founder approved A15's text on 2026-10-04, in chat: "all defaults, accept all
  three, do it in Chrome".
  - "all defaults" answers the open items: German uses `Sie`; check 10 is an error, with held keys
    on the `identical` allow-list; and the English parts stay while `de`/`pl` are `noindex`.
  - "accept all three" and "do it in Chrome" answer other questions: the Cloudflare rulings and the
    dashboard steps.
  - "yes A" was their earlier choice of approach.

  The advisor's verdict was GO WITH FIXES (`docs/advice/2026-10-04-spec-003-a15.md`). The spec
  writer applied its four fixes in A15's text, and they are binding here (below). Two of them are
  not founder answers:
  - the three-event native-review gate is **advisor fix 2 (memo 2026-10-04)**;
  - excluding sympathy, funeral and All Saints' copy is **the spec writer's choice between the
    advisor's two options** (fix 4).
- **Dispatch gate and merge order.** TASK-177 has merged. Wait for **TASK-172 and TASK-179** to
  merge. Both edit `messages/{en,de,pl}.json`. TASK-172 adds the freshness-claim scan, and TASK-179
  changes `catalog.floristSentence`, which ends every product description. Spec 041's
  **TASK-182–184 merge after this task** and rebase onto it. With check 10 an error, each of them
  turns red on rebase until it carries its own `de`/`pl` drafts for its new `infoPages.*` keys
  (A15 clause 6, clause 8). `infoPages.legal.*` is already excluded by name. Their promise and
  refund answers join `reviewBeforeOrders`. Do not draft `infoPages.*` keys here unless one of
  them has merged first, against this order.
- **Scope.** Two sets:
  - every `en` key whose value resolved for `de` or `pl` (after the fallback chain) is
    byte-identical to `en`'s, minus the exclusions in A15 clause 4. State the exact counts per
    locale in the PR; the orchestrator estimated about 340 per locale on 2026-10-04;
  - the `de`/`pl` rows in `seed/data/copy/{de,pl}/products.json` with
    `translationStatus: "machine"` (84 per locale), minus the sympathy, funeral and All Saints'
    rows (about 18, which leaves about 66): `descriptionMd` body, `seoTitle`, `seoDescription`.
    State the exact numbers in the PR.
- **Meta (clause 2).** For messages: `source: "machine"`, `reviewed: false`, and `sourceHash` =
  sha256 of the `en` value. For seed rows: `translationStatus: "machine"`, `reviewed: false`, and the
  `en` row's `copySourceHash`.
  - Never write `reviewed: true`, `source: "human"`, `reviewedBy` or `reviewedAt`.
  - Leave every `human` or `reviewed: true` record byte-identical, in value and meta.
  - Do not change `MESSAGE_SOURCES` or `MessageMetaSchema`.
- **Never drafted (clause 4):**
  - legal copy (`consent.*`, `footer.reminders.consent`, `company.operatedBy`, `infoPages.legal.*`
    by that name, and any other `legal.*` key);
  - price-display legal text (`nav.utility.pricesInclude`, `catalog.price.inclusive`,
    `catalog.price.allIn`, `product.vat`, the corridor `fromValue` key);
  - no file under `content/corridors/**`, `content/pages/**` (spec 041's trust pages) or
    `content/legal/**` (spec 041's legal documents) is touched;
  - sympathy, funeral and All Saints' copy (the spec writer's choice between the advisor's two
    options, fix 4). That means every message key with a path segment
    `sympathy`, `funeral` or `allSaints` (today `nav.category.sympathy`,
    `catalog.facet.productType.funeral`, `catalog.facet.occasion.sympathy`,
    `catalog.facet.occasion.allSaints`, `catalog.descriptor.form.funeral`, `occasions.sympathy.*`,
    `occasions.date.allSaints.*`). It also means every seed product row whose record in
    `seed/data/products.json` has `productType: "funeral"`, or has `sympathy` or `all_saints` in
    `occasions` (`FO-FN-001`–`FO-FN-010` among them);
  - `pathSegments`, slugs, brand names and product names.

  Write the complete exclusion list into `content/i18n/draft-policy.json` from the catalogue as it
  stands after the dependencies: keys under `excluded`, product keys under `excludedSeedRows`. List
  both in the PR description so the reviewer can confirm them.
- **`reviewBeforeOrders` (clause 4, advisor fix 2).** A third list in `draft-policy.json` names the
  drafted values that make a promise a buyer can hold us to. At least these:
  - the guarantee and redelivery promises (`trust.guarantee.*`, `home.proof.guarantee.*`,
    `faq.nobodyHome.answer`, and the text of the fresh-flower promise as TASK-172 leaves it);
  - every cutoff line (`nav.utility.cutoff`, `nav.utility.cutoffShort`, `finder.cutoff`,
    `faq.whoDelivers.answerCutoff`, `delivery.picker.live`);
  - every refund, cancellation or withdrawal answer (`faq.lasting.answer` joins when its held English
    is fixed and drafted);
  - `seed:products`, standing for every drafted product row.

  Renamed keys take their new names. No entry is also excluded, and every entry names a key that
  exists. List it in the PR. Write the gate of advisor fix 2 (memo 2026-10-04) into
  `docs/runbooks/i18n-translations.md` §10. The founder's accepted default for (c) asks only that
  a person writes the English strings before the locale becomes indexable. This gate is the
  advisor's stricter addition: a person writes every excluded key, and a native reviewer attests every
  `reviewBeforeOrders` key, before the first of these happens for that locale:
  - the locale becomes indexable;
  - `/de` or `/pl` can take an order;
  - any consent-gated tag switches on there.
- **How the drafts read (clauses 4 and 5):**
  - follow `content/i18n/glossary.{en,de,pl}.md`. Where a glossary disagrees, the decisions log and
    spec 004 §14 A5/A22 win (advisor fix 4). In this PR, rewrite `glossary.en.md` §2's "partner
    florist" and §4's ban on "our florists" to match A5 and A22 (T-38). The sympathy, funeral and
    All Saints' lines in `glossary.de.md` §2 and `glossary.pl.md` §3 stand: those keys are
    excluded;
  - Polish uses informal `Ty`; German uses `Sie` (open item (a), confirmed by the founder
    2026-10-04);
  - A5's banned words in German and Polish (advisor fix 3). Add the target-language forms to
    `src/config/voice.ts` so that `bannedVoiceWordsIn()` matches them in every drafted `de`/`pl`
    value:
    - at least "Netzwerk", "Drittanbieter", "Korridor" and "Relais" in German;
    - at least "sieć", "sieci", "pośrednik", "korytarz" and "strona trzecia" in Polish;
    - complete the list from A5's nine words, and list an inflected form that does not contain its
      base form;
    - keep `BANNED_VOICE_WORDS` and its README pin at the nine English words;
    - list the forms in the PR;
  - "Flowers Overseas" is untranslated and uninflected;
  - ICU placeholder names stay exactly as they are; every Polish plural has
    `one`/`few`/`many`/`other`;
  - no typed price, date, currency symbol or `%` that the `en` value lacks;
  - florists in the present tense;
  - no "partner" letters in any `de`/`pl` value (`home.sentence.who`'s `partner` case is e.g.
    "meinen Schatz" / "mojej drugiej połówki");
  - no number of days or weeks of freshness;
  - no price or VAT/delivery claim in any `home.*` value;
  - the card is printed, never handwritten.
- **Held keys (clause 5).** If an `en` value still carries a claim a founder ruling withdrew, do not
  draft it. List it under `identical` with reason `held` and the id of the task that fixes the
  English, and name it in the PR. Candidates on `main` when this brief was written:
  `faq.lasting.answer`, `home.proof.price.*`, `catalog.addon.card.name`. Re-check after the
  dependencies merge; some may already be fixed.
- **Tooling (clauses 6 and 7):**
  - `scripts/i18n-check.ts` gains check 10, "identical to `en`": an **error** by default (open item
    (b)), with a zod-validated `content/i18n/draft-policy.json`, a closed reason set (`name`,
    `same-word`, `icu-only`, `held`), stale-entry detection and a summary column. Update the
    header comment's check 5 sentence ("`de` echoing English is honest machine-draft debt"), which
    A15 retires.
  - `seed/copy-draft.ts` `draftCopyLocale()`: a machine row whose `sourceHash` is fresh is kept,
    with only its closing sentence re-flowed when `catalog.floristSentence` moved; a stale machine
    row is regenerated as today.
  - `scripts/i18n-draft.ts` needs no change (`draftLocale()` already keeps a fresh machine key);
    update its header comment, which says `de`/`pl` "ship as honest unreviewed echoes".
- **Coupled files:**
  - `src/modules/i18n/error-copy.data.ts` holds the `de`/`pl` `errors.serverError.*` constants, so
    it changes with those keys (`tests/unit/error-document.test.ts`);
  - existing tests that pin an English string on a `de`/`pl` page read the value from the catalogue
    instead of a literal;
  - visual baselines that show `/de` or `/pl` change. Take the build slot for them only if CI
    cannot regenerate them, and say so in `## Result`.
- **Indexing (clause 3).** No change to `src/modules/i18n/review.ts`, `alternates.ts`, the 5 %
  threshold or robots. `de` and `pl` stay `noindex` and "Beta".
- **Gates.** `pnpm gates:cheap` (paste the block), `pnpm i18n:check`, `pnpm seed:check`, and the
  unit files the diff touches. The expensive gates belong to CI.
- **Work order: one sub-agent per locale** (advisor memo, "Building" (1)). The orchestrator
  dispatches the German and the Polish drafting as separate sub-agents, each with the glossary,
  this brief and A15, so that drafts written late in a batch of about 340 strings plus 66 product
  rows are not worse than early ones. One PR still carries both. The tooling and the tests are
  written once, by the agent that owns the PR.
- **Class.** Not review-only: i18n tooling that decides indexability, and copy feeding `<title>`
  and meta descriptions. Both `/review` and `/break` run.

## Read

- `specs/003-i18n-foundation.md`: read `## 0. Index` first, then §14 A15, §2 "Messages", §7
  "Translation review plan", AC-22 to AC-24
- `docs/advice/2026-10-04-spec-003-a15.md`: the advisor's four fixes, now in A15
- `seed/data/products.json` (`productType`, `occasions`: the excluded rows)
- `docs/codebase-map.md`: where everything lives
- `docs/runbooks/i18n-translations.md` §2, §3, §4, §7, §10 (§2, §3 and §10 change here)
- `content/i18n/glossary.en.md`, `glossary.de.md`, `glossary.pl.md` (the status lines change here)
- `scripts/i18n-check.ts`, `scripts/i18n-draft.ts`, `seed/copy-draft.ts`, `src/config/voice.ts`
- `specs/004-design-system-layout.md` §14 A22; `specs/009-product-page-date-picker.md` §14 A11
  and TASK-172's scan; `docs/decisions-log.md` rows of 2026-10-03 and 2026-10-04 on the printed
  card, the home price line and the fresh-flower promise
- `tests/unit/i18n-check.test.ts`, `tests/unit/i18n-draft.test.ts`, `tests/unit/seed-copy.test.ts`,
  `tests/unit/design-docs.test.ts`, `tests/unit/ui-home.test.tsx`

## Tests

Each must be watched red with its subject removed, then green (CLAUDE.md DoD §4).

- **T-33 (unit):** no in-scope `de`/`pl` key resolves to its `en` value except the `identical` list.
  - Red when one drafted value is restored to English.
  - Red when the key is deleted from `de.json`.
- **T-34 (unit + PR check):** every drafted record is `{ machine, false, sha256(en) }`.
  - Red on an altered `sourceHash`.
  - Red on `reviewed: true`.
  - The `git diff` of the two manifests against the base adds or edits no `reviewed: true` or
    `human` record.
- **T-35 (unit):** every excluded key's `de`/`pl` value equals `en`'s or is `human`.
  - Red when `consent.headline` gets a machine German value.
  - Red when `infoPages.legal.*` or `occasions.date.allSaints.*` is removed from `excluded`.
  - `excludedSeedRows` equals the set computed from `seed/data/products.json`; red when
    `FO-FN-001` is removed.
  - `reviewBeforeOrders` contains `seed:products` and `nav.utility.cutoff` (or its successor); red
    when either is removed, when a key is in both `excluded` and `reviewBeforeOrders`, and when an
    entry names a missing key.
  - The PR diff touches nothing under `content/corridors/**`, `content/pages/**` or
    `content/legal/**`, no `pathSegments`, and no seed `name`/`slug`.
- **T-36 (unit):** `isLocaleIndexable` is `false` and `localeBetaTag` is set for `de` and `pl`;
  `alternatesFor("/")` excludes both.
  - A fixture manifest with every record reviewed flips `de` to indexable.
- **T-37 (unit):** `i18n:check` exits 0, and the voice, freshness, home-price, register, brand and
  Polish-plural checks pass on every drafted value. Each check goes red on one seeded fault:
  - "Partner" in a `de` value;
  - "Netzwerk" in a `de` value, and "pośrednik" in a `pl` value. Each must go red only through the
    German or Polish forms; the English list alone would pass them;
  - "7 Tage frisch" in a `de` value;
  - "inkl. MwSt." in a `home.*` value;
  - "du" in a `de` value, or "Państwo" in a `pl` value;
  - "Flowers Overseasie" in a `pl` value;
  - a Polish plural without `few`.
- **T-38 (unit):** drafted seed fields ≠ `en`, the closing sentence equals the locale's
  `catalog.floristSentence`, row meta as AC-38, and `name`/`slug` unchanged; `pnpm seed:check`
  exits 0.
  - Red when one body is restored to English.
  - Red when one `slug` changes.
  - Every `excludedSeedRows` row is byte-identical to the base; red when `FO-FN-001`'s `de` body
    gets a machine draft.
  - `glossary.en.md` has neither "partner florist" nor the ban on "our florists"; red when either
    line is restored.
- **T-39 (unit):** a dry run of `draftLocale` and `draftCopyLocale` on the committed tree changes
  nothing.
  - Red when the keep-fresh rule is reverted.
  - Check 10 exits non-zero, naming file and key, on each of its four seeded faults, and 0 on the
    repaired fixture.
  - The runbook and glossary text name the policy file and check 10, and runbook §10 names
    `reviewBeforeOrders` and the three events.

## Carry-forwards

- **From the site test (2026-10-18, QA-1 and QA-2 on `c8d3b334`; screenshots in `.claude/state/qa-2026-10-18/`):**
  - Q1-02, Q1-03, Q1-13 and Q1-16 (QA-1 and QA-2 re-test, still on `c8d3b334`): de and pl still show English nav, home hero, product body copy, home title and descriptions, every product `<title>`, "(not yet)", "Geburtstag, country by country", the hub's "We have not written a guide in this language yet...", and country names left in the nominative in templates ("Flowers we make for Polen", "Polska", "Sending Rosen"). Polish and German need the country in the case the sentence asks for: restructure the sentence or add per-locale case forms, never inflect the brand (spec 003 glossary). de and pl are hidden by TASK-237 until reviewed, so this reaches no buyer yet.

## Escalations

- **A15 open items (2026-10-04).** Ruled by the founder the same day, in chat: "all defaults,
  accept all three, do it in Chrome"; "all defaults" is the part that answers these items.
  - (a) German register: **`Sie`**. Ruled.
  - (b) check 10's severity: **error**, with held keys on the `identical` allow-list. Ruled.
  - (c) the English that stays on `/de` and `/pl` (excluded and held keys, the consent sheet
    included): **accepted while `noindex`**, and a person writes those strings before either locale
    can become indexable. Ruled; that is the whole of the founder's answer.
  - Not a founder answer: **advisor fix 2 (memo 2026-10-04)**, applied by the spec writer, is
    stricter than (c). A person writes every excluded key, and a native reviewer attests every
    `reviewBeforeOrders` key, before the first of these happens for that locale: it becomes
    indexable; it can take an order; a consent-gated tag switches on there.
  - Not a founder answer: excluding sympathy, funeral and All Saints' copy is **the spec writer's
    choice between the advisor's two options** (fix 4).
- **Memo question 2, open (to: orchestrator; answer: `open`).** Who wrote the `source: "human"`
  German strings `company.description`, `company.support.hours`, `footer.payment.methods` and
  `footer.signoff`? If an agent wrote them, the label is wrong. Confirm this before dispatch. This
  task leaves them byte-identical either way (AC-34).
- **The consent sheet's `lang="en"` (memo, "Law and compliance" (3)).** Declined in A15 ("Still
  open"): it is a component change, not copy. It is out of scope here.
- **Keys excluded beyond A15's named list (four, then five) (to: orchestrator, then the spec writer for an A15
  amendment; answer: `open`).** `content/i18n/draft-policy.json` `excluded` carries four keys A15
  clause 4 does not name, so `/de` and `/pl` show them in English:
  - `trust.price.name` ("The price includes delivery and VAT"), reason `price-display`;
  - `checkout.summary.vat` ("VAT {rate}") and `checkout.summary.vatOf` ("Of which VAT {rate}"),
    reason `price-display`, the checkout twins of the named `product.vat`;
  - `checkout.placeKind.funeralHome` ("A funeral home"), reason `sympathy-funeral-all-saints`: its
    segment is `funeralHome`, which the literal segment rule (`funeral`) misses.
  - `company.controller` ("This website is run by {name}. For questions about your cookie choices
    or your personal data, ..."), reason `legal`: the data controller sentence TASK-183 (PR 375)
    added to the cookie panel, the twin of the named `company.operatedBy`. Added on the
    2026-10-24 rebase, so the list is five.

  Recommendation: keep all four excluded. The three VAT/price lines are price-display legal text of
  the same class as `product.vat` and `nav.utility.pricesInclude`, which clause 4 keeps for a
  person; a machine "inkl. MwSt." on a checkout line is exactly what clause 4 withholds. The
  funeral-home option is the Trauer vocabulary fix 4 withholds. Amend A15 clause 4 to name the three
  price keys and to read the segment rule as "a segment containing `sympathy`, `funeral` or
  `allSaints`", so the policy and the spec agree. All four then fall under runbook §10's gate (a
  person writes every excluded key before a locale is indexable, takes orders or switches on a
  consent-gated tag), so nothing reaches a buyer in English after the gate.

- **`/pl` header shift on Linux from the Polish nav labels (to: orchestrator; answer: option (1), built as TASK-377, merged in PR 360 as 1f88cade on 2026-10-24; closed).** CI run 39964055125 on b9631763: every job green except `e2e` (and `audit`, repo-wide). `tests/e2e/header.spec.ts:138` "/pl renders the header at its artboard's reserved height" fails at 1280 px, `headerShift` 0.000246 (expected 0; it was 0.000355 before faaeb8b6 removed "kogoś" from the H1). Evidence: the trace's screencast frames before and after the font swap show every nav item left of "Rośliny" moving about 3 px (at 800 px scale) while the logo, utility strip and hero copy stay put; the nav is `xl:justify-end`, so a width change in "Róże", "Rośliny" or "Wyślij kwiaty" moves every item to its left. Those labels need Alegreya Sans Latin-Ext (`ż`, `ś`), which A21 clause 3 forbids preloading and which `src/modules/ui/fonts/index.ts` declares with `adjustFontFallback: false`, against A21's "matched fallback metrics on every face". On `main` the two category labels were English, so the shift is new with the drafts. Not reproducible on macOS: a local `next start` of CI's own build, with the Latin-Ext files delayed 1.2 s, records no header shift. No copy fixes it: Polish has no spelling of "roses" without `ż`.
  Options. (1) Recommended: a small spec 004 font task adds the eight Polish letters outside Latin-1 and their capitals (U+0104-0107, U+0118-0119, U+0141-0144, U+015A-015B, U+0179-017C) to the preloaded Alegreya Sans Latin files and moves them out of the Latin-Ext range, so Polish chrome renders from the preloaded face at first paint (a few hundred bytes per file against the 50 KB preload budget); TASK-185 then rebases and re-runs CI unchanged. (2) Keep `nav.category.roses` and `nav.category.plants` English on `/pl` until (1) lands; this needs a reason outside clause 6's closed set (an A15 amendment), so I have not done it. (3) Bound the header test's shift instead of 0: weakens AC-7, not recommended.
- **Flaky, not failing:** `tests/e2e/deferred-chunks.spec.ts:286` (phone, language link inside the Menu) failed once and passed on retry in both branch runs (39850868368, 39964055125): the consent sheet's reject button intercepts the click. Worth a look by the Menu's owner if it recurs on `main`.

## Progress

- 2026-10-22: started on `task/TASK-185-de-pl-drafts` from `origin/main` 0ccafb2b. TASK-172, TASK-179 and TASK-182 are merged (TASK-182 before this task, so its seven echoed `infoPages.*` keys are drafted here, as the brief allows); TASK-183 and TASK-184 are not. One agent drafts both locales (no sub-agent tool in this run).
- 2026-10-22, d0aeeac0: tooling. `scripts/i18n-check-drafts.ts` (check 10 + the six AC-37 value rules + clause 4's typed-formatting rule), wired into `scripts/i18n-check.ts` (`--policy`, summary column "identical to `en`"; a fixture tree with no `--policy` skips check 10, as check 11 does with its registry), `content/i18n/draft-policy.json` (zod-validated), `BANNED_VOICE_FORMS` in `src/config/voice.ts`, keep-fresh rule in `seed/copy-draft.ts` (`keepFreshRow`).
- 8eaec081: messages. de 510 + pl 509 keys drafted (de 524 / pl 520 in scope minus 14 / 11 `identical`); `error-copy.data.ts` synced. `pnpm i18n:check` exit 0 with 0 identical for both.
- 1615eb6a: seed. 66 of 84 product rows per locale (18 excluded, FO-FN-001..010 among them); `pnpm seed:check` exit 0; `i18n:draft --dry-run` writes nothing for de or pl.
- 52d65245: runbook §1, §2, §3, new §10 (advisor fix 2's gate; old §10 is now §11), glossary.en §2 row, de/pl status lines, `scripts/i18n-draft.ts` header.
- e7883327: `tests/unit/i18n-drafts.test.ts`, T-33..T-39, 43 cases; each AC-carrying assertion watched red under its mutation (keep-fresh reverted; de/pl forms dropped from the scan; identical check disabled; `few` dropped; brand, register, home and freshness rules disabled; stale-entry checks disabled; FO-FN-001 and `infoPages.legal.*` removed from the policy).
- 2533319e: the full unit run (339 files) found 43 failures in 17 files. Fixed: de home copy without "Lieferung"/"Zustellung" (ui-home H3), pl home copy without "dostaw"/"opłat"/"koszt", pl `corridor.facts.orderBy.label` (chrome-honesty), "Morgen" removed from de PDP copy (product-page RELATIVE), duplicate "Partner" forms dropped (design-docs, seed-check), seed snapshot regenerated (`node seed/diff.ts --write`), and the tests that pinned English on de/pl pages now read the drafted value (app-shell, destinations-hub, home-round2, neutral-ordering-copy, ui-home picker, ui-media-asset). `home-honesty` and `tests/e2e/honesty.spec.ts`: the "partner name" pattern banned the German word "Blumen"; it now has a case-sensitive "German shop name" entry (`Blumen Schmidt`, `Blumenhaus Meyer`) instead.
- **Left (time limit reached at 180 min), for the finisher:** a re-run of the 15 previously failing files still shows 7 red: (1) `codebase-map.test.ts` x2: run `pnpm codebase:map` (my `pnpm -s codebase:map` errored) and commit; (2) `design-docs.test.ts` "wireframes/cookies-mobile.dc.html uses no banned word": a German/Polish form in `BANNED_VOICE_FORMS` probably matches that artboard, or it timed out (59 s); read the failure and drop or narrow the form; (3) `product-page.test.tsx` A8 "no cutoff time on a past-cutoff `preview` chip" and HOLE 5 "a closed date never says included": check the de/pl `delivery.*` and `product.included`/`catalog.surcharge.*` drafts against those assertions; (4) `seed-check.test.ts` x2 (`prices/case-float-amount`, `media/alt-missing`): timings of 9 966 s and 59 s suggest the machine slept, so re-run alone first. Then `pnpm gates:cheap`, rebase on `origin/main`, PR ready + `ci:full`, Self-review in the PR body. `dev-os.test.ts` and `no-literal-disable.test.ts` timed out in the full run only (environment, not this diff), worth one re-run alone.
- Carry-forwards found: the English rows FO-BQ-038 ("carnations often last two weeks") and FO-AR-014 ("alstroemeria often lasts two weeks") carry a freshness duration A11 withdrew; the drafts drop the number ("lange Freude", "długo cieszy oko"), and the English needs its own fix task. `catalog.descriptor.form.funeral` stays English (excluded) while the flower names it interpolates are now German/Polish, so a funeral descriptor reads mixed ("Chrysanthemen funeral tribute") until a person writes it. `checkout.placeKind.funeralHome`, `trust.price.name`, `checkout.summary.vat` and `checkout.summary.vatOf` are excluded beyond A15's named list (the reviewer confirms). Memo question 2 (who wrote the `human` German strings) is still open; those records are byte-identical.

- 2026-10-22, finisher: the seven red cases re-run alone are green (design-docs `cookies-mobile`, product-page A8 and HOLE 5, seed-check x2: load or sleep, not the diff); codebase map regenerated. Rebased on `origin/main` 08c05034 (TASK-240 merged first; `seed:check`, `seed:diff`, `i18n:check` exit 0 after it). Two more tests pinned English on de/pl pages and now read the catalogue: `ui-site-header` (currency `aria-label`, `nav.currency.label`) and `ui-media-provenance` (`media.provenance.aiExample`). Mutations re-watched red: `de` `nav.send` restored to English (T-33 x3 red, `i18n:check` exit 1 naming file and key); FO-FN-001 removed from `excludedSeedRows` (T-35 red); `reviewed: true` on the machine record `home.hero.heading` (T-34 red).
- Carry-forward found after the rebase: TASK-240 moved default stem counts (FO-BQ-001: 18 to 15), but the English seed copy still says "Eighteen stems as standard, with twelve and twenty-four" (and so do the de/pl drafts, which follow the English). The English rows need their own fix task; the drafts then go stale by `copySourceHash` and are regenerated.

- 2026-10-23, second finisher: the `visual-baselines` run 39962125137 on faaeb8b6 re-rendered 10 Linux baselines; all ten opened before commit. Eight are /de and /pl pages whose copy is now German and Polish; `language-popup-desktop` and `product-desktop-first` (/en) differ below the 0.1 % threshold with no visible change and are taken with the manifest so `--verify` matches all 114 (`--check` exit 0). Committed as 84be935b.
- Carry-forward found in the baselines: on `/pl` at 1280 px the hero picker sentence wraps so its second line opens with the comma (", wysyłka do kraju: Polska"). Layout of the picker's segmented sentence, not the draft text; a native reviewer or the picker's owner should settle the Polish sentence shape.
- 2026-10-23, second finisher: CI 39964055125 on b9631763 green except `e2e` (one case, the `/pl` header shift at 1280 px) and `audit` (repo-wide). Root cause traced to the Latin-Ext swap under the Polish nav labels; escalated (see Escalations), row set `blocked`. Local measurement: CI's own `preview-build` served by `next start` inside the build slot (no local build), stopped by PID, slot released.

- 2026-10-24, third finisher: TASK-377 (PR 360, 1f88cade) merged the Polish letters into the Latin font subsets, which answers the `/pl` header-shift escalation (option 1). Rebased on `origin/main` 1f88cade: one conflict, the Linux baselines `home-pl-{desktop,mobile}` and the manifest (PR 360 re-rendered them); took main's, then re-rendered through `visual-baselines` run 40054379119 (3 PNGs moved: the two `/pl` homes, and `product-desktop-first` by 11 px of anti-aliasing in the utility strip); all three opened, manifest is the runner's, `--verify` 114 matched, `--check` exit 0 (12786376). `TASKS.md` and the codebase map rebased cleanly (`codebase:map --check` exit 0).
- The `/de` 0.0917 shift from PR 360's proof run 40010857514 (`header.spec.ts:138`, `/de` at 1280 px, failed once, passed on retry): not this PR. It ran 2 s after `header-in-context.spec.ts:304` timed out at 5.0 min on the same server, so the origin was saturated; `/de` at 1280 px passed first try in all three of this PR's own full e2e runs (39850868368, 39964055125, 40042467215). Local check inside the build slot on CI's own `preview-build` of 45f2a430 (`next start`, stopped by PID, slot released, load 1.4 to 2.5): `/en`, `/de`, `/pl` at 1280 x 720, two runs each, with nothing delayed, all `.woff2` delayed 1.5 s, CPU throttled 6x, both, CSS delayed 0.8 s, images delayed 2 s, JS delayed 2 s, JS delayed 4 s with CPU 4x: the header test's measure (`shiftOutside` the hero copy and sentence) is 0 everywhere except the all-fonts delay, where it is 0.00038 on `/en`, 0.00034 on `/de`, 0.00063 on `/pl` (nav and utility strip, the same on English), never near 0.09. No fix made; nothing in this PR's German strings moves the page.

- 2026-10-24, fourth finisher: after the rebase on `origin/main` efcd895b, CI 40072937197 on d4b1ea8c failed `i18n-check` and 12 unit cases (`i18n-check.test.ts` x6, `i18n-drafts.test.ts` x6), all on check 10: TASK-183 (PR 375) merged two `en` keys whose `de`/`pl` values were echoed English, `company.controller` and `infoPages.cookies.change` (the `payments.*` list in the log is the informational "not yet approved" list, not a problem). Fixed: `company.controller` excluded as legal copy (the GDPR controller sentence, twin of `company.operatedBy`; escalation list updated to five); `infoPages.cookies.change` drafted (de "Cookie-Einstellungen ändern", pl "Zmień ustawienia plików cookie", following the `human` `footer.cookieSettings` wording; meta was already `machine`, `reviewed: false`, sha256 of `en`). `i18n:check --summary` exit 0 with 0 identical for both; `i18n:draft --dry-run` writes nothing for de or pl. Mutation: `de` `company.controller` given a German value, T-35 red (2 cases); reverted.
- 2026-10-24, fourth finisher, second rebase on `origin/main` ceb8e091 (TASK-376, TASK-189 PR 374, spec 004 PR 317): `messages/{de,pl}.json` conflicted in the drafts commit. Resolved key by key with main's `en` key set: this PR's draft kept wherever the `en` value it was drafted from is unchanged (de 509, pl 508; none had moved), `corridor.photo.caption` dropped as main retired it; codebase-map conflicts regenerated. Main's three new Rule-column keys arrived as English echoes, so check 10 named them; drafted (de "Jedes Jahr am selben Datum", "Richtet sich nach Ostern", "Ein fester Wochentag im Monat"; pl "Ten sam dzień co roku", "Zależy od Wielkanocy", "Określony dzień tygodnia w miesiącu"; meta already `machine`, `reviewed: false`). `i18n:check --summary` exit 0 with 0 identical; `i18n:draft --dry-run` 0 drafted, 0 stale for both; 7 i18n and corridor unit files, 290 cases green.

## Result

- **Counts.** Messages: de 524 in scope, 510 drafted, 14 `identical`; pl 520 in scope, 509 drafted, 11 `identical`; no `held` entry (the three candidates were fixed upstream). Seed: 66 of 84 machine product rows per locale drafted (`descriptionMd`, `seoTitle`, `seoDescription`), 18 excluded (`excludedSeedRows`). `excluded` 21 entries, `reviewBeforeOrders` 31. After the 2026-10-24 rebase onto TASK-183: one more key drafted per locale (`infoPages.cookies.change`) and `excluded` 22 entries (`company.controller`). After the rebase onto TASK-189: de 512 and pl 511 keys drafted (the three `corridor.calendar.rule*` keys added, `corridor.photo.caption` retired by main).
- **AC-33 (T-33)** `tests/unit/i18n-drafts.test.ts:195`; **AC-34 (T-34)** `:258`, plus a script check over the base: no human or `reviewed: true` record changed in value or meta, 0 `reviewed: true` in either manifest; **AC-35 (T-35)** `:309`, no file under `content/{corridors,pages,legal}/**` touched; **AC-36 (T-36)** `:384`; **AC-37 (T-37)** `:441`; **AC-38 (T-38)** `:675`; **AC-39 (T-39)** `:740` and `:928`. 43 cases, green.
- **Gates.** `gates:cheap` on the rebased head: typecheck, lint, format:check, i18n:check, check:no-db, codebase:map --check exit 0; the changed unit/contract files (177) green with `--maxWorkers=2` after the two test fixes. `seed:check` exit 0. No build slot taken: visual baselines for `/de` and `/pl` are CI's.
- **Relationship to PR 360 (TASK-377).** PR 360 moved the 16 Polish letters outside Latin-1 into the preloaded Alegreya Sans Latin files (and the Latin files of every face). This PR's `/pl` header test, red at 0.000246 before, now has no late Latin-Ext file to wait for: every character of `messages/{de,pl}.json` and `seed/data/copy/{de,pl}/products.json` is inside the new Latin subset (scanned against `SUBSET_RANGES` after the rebase, 0 outside). The `/pl` hero heading workaround of faaeb8b6 ("Kwiaty dla bliskich w innym kraju." instead of "Kwiaty dla kogoś, kto jest daleko.") is no longer needed for the fonts; it stays, as a carry-forward for the native reviewer.
- **Gates after the rebase (45f2a430).** `gates:cheap` RESULT PASS: typecheck, lint, format:check, i18n:check, check:no-db, codebase:map --check exit 0; tests 179 files, 5286 cases (changed 177 + always 2), `--maxWorkers=2`. `seed:check` exit 0; `tests/unit/fonts.test.ts` 32 green. Build slot taken once, for the `/de` shift measurement above (no local build: CI's artifact).

### Self-review

1. **ACs.** AC-33 `tests/unit/i18n-drafts.test.ts:195`, AC-34 `:258`, AC-35 `:309`, AC-36 `:384`, AC-37 `:441`, AC-38 `:675`, AC-39 `:740`, `:928`; 43 cases green on the rebased tree. The rebase changed no file of the drafts, tooling or tests (only baselines conflicted).
2. **Mutations, re-watched after the rebase.** `de` `nav.send` restored to English: T-33 and T-35 cases red (6 failed), `i18n:check` exit 1; reverted, 43 green. Earlier rounds (Progress): keep-fresh reverted, de/pl banned forms dropped, identical check disabled, `few` dropped, brand/register/home/freshness rules disabled, stale-entry checks disabled, FO-FN-001 and `infoPages.legal.*` removed from the policy, `reviewed: true` on a machine record: each red.
3. **Awkward cases.** Price-display and VAT keys and legal/consent keys never drafted (A15 clause 4 plus the four escalated). No em or en dash added by the diff (`git diff origin/main` of messages and seed copy: 0); the two em dashes left in `de`/`pl` values are excluded consent English and the `human` `shop.category.lede`, byte-identical to main. Polish letters render from the Latin subset (0 characters outside it).
4. **Left.** Carry-forwards above: the `/pl` picker comma wrap, the English stem counts after TASK-240, FO-BQ-038/FO-AR-014 freshness numbers, the mixed funeral descriptor, the four extra exclusions (escalation open, does not block), memo question 2, the `/pl` hero heading that could return to "kogoś" now that the font allows it.

- PR: https://github.com/itsahmeds/flowers-overseas/pull/328.
