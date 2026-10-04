# TASK-185 — de/pl agent-written drafts of the UI catalogue and seed copy

Row: `TASKS.md` → TASK-185. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

- **Source.** `specs/003-i18n-foundation.md` §14 **A15**, clauses 1–8, and AC-33 to AC-39 (T-33 to
  T-39). The founder chose option A on 2026-10-04 ("yes A"). They approved no German or Polish
  text: every value this task writes is `reviewed: false`, and no clause here may be read as their
  review.
- **Dispatch gate.** A15 is a draft until the founder approves its text (after `/advise`). Do not
  start before then. Also wait for TASK-172, TASK-177 and TASK-179 to merge: all three edit
  `messages/{en,de,pl}.json`, TASK-172 adds the freshness-claim scan, and TASK-179 changes
  `catalog.floristSentence`, which ends every product description.
- **Scope.** Two sets:
  - every `en` key whose value resolved for `de` or `pl` (after the fallback chain) is
    byte-identical to `en`'s, minus the exclusions in A15 clause 4. State the exact counts per
    locale in the PR; the orchestrator estimated about 340 per locale on 2026-10-04;
  - the `de`/`pl` rows in `seed/data/copy/{de,pl}/products.json` with
    `translationStatus: "machine"` (84 per locale): `descriptionMd` body, `seoTitle`,
    `seoDescription`.
- **Meta (clause 2).** For messages: `source: "machine"`, `reviewed: false`, and `sourceHash` =
  sha256 of the `en` value. For seed rows: `translationStatus: "machine"`, `reviewed: false`, and the
  `en` row's `copySourceHash`.
  - Never write `reviewed: true`, `source: "human"`, `reviewedBy` or `reviewedAt`.
  - Leave every `human` or `reviewed: true` record byte-identical, in value and meta.
  - Do not change `MESSAGE_SOURCES` or `MessageMetaSchema`.
- **Never drafted (clause 4):**
  - legal copy (`consent.*`, `footer.reminders.consent`, `company.operatedBy`, any `legal.*` key);
  - price-display legal text (`nav.utility.pricesInclude`, `catalog.price.inclusive`,
    `catalog.price.allIn`, `product.vat`, the corridor `fromValue` key);
  - `content/corridors/**` and the legal documents under `content/pages/`;
  - `pathSegments`, slugs, brand names and product names.

  Write the complete exclusion list into `content/i18n/draft-policy.json` from the catalogue as it
  stands after the three dependencies, and list it in the PR description so the reviewer can confirm
  it.
- **How the drafts read (clauses 4 and 5):**
  - follow `content/i18n/glossary.{en,de,pl}.md`;
  - Polish uses informal `Ty`; German uses `Sie` (open item (a): if the founder rules `du` first,
    follow the ruling and update AC-37's register rule in the same PR);
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
- **Class.** Not review-only: i18n tooling that decides indexability, and copy feeding `<title>`
  and meta descriptions. Both `/review` and `/break` run.

## Read

- `specs/003-i18n-foundation.md`: read `## 0. Index` first, then §14 A15, §2 "Messages", §7
  "Translation review plan", AC-22 to AC-24
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
  - The PR diff touches no corridor guide, legal page, `pathSegments` or seed `name`/`slug`.
- **T-36 (unit):** `isLocaleIndexable` is `false` and `localeBetaTag` is set for `de` and `pl`;
  `alternatesFor("/")` excludes both.
  - A fixture manifest with every record reviewed flips `de` to indexable.
- **T-37 (unit):** `i18n:check` exits 0, and the voice, freshness, home-price, register, brand and
  Polish-plural checks pass on every drafted value. Each check goes red on one seeded fault:
  - "Partner" in a `de` value;
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
- **T-39 (unit):** a dry run of `draftLocale` and `draftCopyLocale` on the committed tree changes
  nothing.
  - Red when the keep-fresh rule is reverted.
  - Check 10 exits non-zero, naming file and key, on each of its four seeded faults, and 0 on the
    repaired fixture.
  - The runbook and glossary text name the policy file and check 10.

## Carry-forwards

_None recorded._

## Escalations

- **A15 open items (2026-10-04), to the founder through the orchestrator:**
  - (a) German register: `Sie` (default) or `du`;
  - (b) check 10's severity: error (default) or warning;
  - (c) the English that stays on `/de` and `/pl` (excluded and held keys, the consent sheet
    included): accepted while `noindex` (default).

  All three are `open`; the defaults bind.

## Progress

_Not started._

## Result

_Pending._
