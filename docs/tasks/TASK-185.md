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

_None recorded._

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

## Progress

_Not started._

## Result

_Pending._
