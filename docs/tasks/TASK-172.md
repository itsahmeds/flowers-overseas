# TASK-172 — The fresh-flower promise, never a number of days (spec 009 §14 A11)

Row: `TASKS.md` → TASK-172. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

- `specs/009-product-page-date-picker.md` §14 **A11** (2026-10-04), which supersedes A9's freshness
  line and re-scopes this task. A9's `{days}` parameter, its ICU plural and its 5 / 7 / absent
  cases are **withdrawn**. `freshnessDays` stays catalogue data and renders nowhere.
- **What is already done elsewhere (checked 2026-10-04):** `nav.utility.guarantee` reads
  "Fresh-flower promise" in all locales (TASK-176, merged). `home.proof.guarantee.title` changes in
  `en`/`de`/`pl` in TASK-177 (PR 174). The PDP's promise line (`product.trust.freshness.*`, the
  72-hour photo terms, no number of days) is in TASK-179 (PR 170).
- **What is left here:**
  - retire `trust.guarantee.name` ("7-day freshness guarantee" on `main` in `en`, `de` and `pl`) as
    "Fresh-flower promise" in every locale, and `home.proof.guarantee.title` in any locale TASK-177
    leaves unchanged;
  - A11's tests: the message-and-content scan over the three keys, the PDP guarantee key and every
    `infoPages.*` / `content/pages/*/guarantee.md` value in four locales (no "7-day", and no match
    of the **freshness-claim scan**: case-insensitive, Unicode word boundaries, one sentence at a
    time: a *day count* — a digit run or a spelled-out number (`one`…`thirty`, `ein`…`dreißig`,
    `jeden`…`trzydzieści`) directly followed, hyphenated or not, by a day word (`day`, `days`,
    `Tag`, `Tage`, `Tagen`, `tägig*`, `dzień`, `dni`, `dniow*`) or a week word (`week`, `weeks`,
    `Woche`, `Wochen`, `tydzień`, `tygodnie`, `tygodni`); a week word on its own; or an ICU
    argument whose name contains `day` (`{days}`, `{freshnessDays}`) — with at most three words
    between it and a *freshness word* (`fresh*`, `last`, `lasts`, `lasting`, `frisch*`, `hält`,
    `halten`, `haltbar*`, `Haltbarkeit`, `śwież*`, `trwał*`, `wytrzym*`), in either order; the
    statutory cancellation-right copy has no freshness word within that window and never
    matches); the scan's own fixture case ("14-day right to cancel", "14 days to change your
    mind", "14 Tage", "14 dni", spec 041 A.3's "fresh flowers are one of them" and "we do not
    promise a number of days", and spec 041 help Q9's "Fresh flowers are an exception to the usual
    14-day right to cancel" pass; "fresh for 7 days", "7-day freshness", "7 Tage frisch", "świeże
    przez 7 dni", "lasts a week" and "fresh for {days} days" fail); the PDP unit case (the same text for `freshnessDays` 5, 7 and none);
    the e2e case (no number token in the guarantee node equals the product's `freshnessDays`; "72"
    passes); each must go red with its subject restored;
  - A11's AC and T rows written into spec 009 in place of A9's three cases (`pnpm specs:index`);
  - the stale "7-day freshness guarantee" comment on `freshnessGuarantee` in
    `src/modules/catalog/product.ts` (TASK-179's brief, Result).
- **Not here:** the PDP's link to the guarantee page (A11 bullet 1) needs `infoPageExists()`,
  which TASK-182 builds; TASK-182 wires it.
- **Copy:** "Fresh-flower promise" is in the founder's approved batch (decisions log 2026-10-04,
  item 2); `de`/`pl` values are `reviewed: false`.
- **Class:** not review-only (a customer-facing promise). `/review` and `/break` both run.
- **Blocks TASK-182:** spec 041 AC-16 asserts the three keys carry no "7-day" in any locale.

## Read

- `specs/009-product-page-date-picker.md` — `## 0. Index`, then §14 A11 (and A9 for what it
  withdraws).
- `specs/041-trust-help-legal-pages.md` AC-16, T-16, Appendix A.3.
- `docs/tasks/TASK-179.md` (Result, the copy list); `docs/codebase-map.md`.

## Carry-forwards

- **From `/plan-tasks` (2026-10-04):** dispatch after TASK-177 (PR 174) and TASK-179 (PR 170) have
  merged: both edit the three message files and the PDP.
- **From the site test (2026-10-18, QA-1 and QA-2 on `c8d3b334`; screenshots in `.claude/state/qa-2026-10-18/`):**
  - N-13 (P2, QA-2): the fresh-flower promise on the home and the product page (`trust.guarantee.body`) reads "send us a photo within 72 hours of delivery and we'll replace them or refund you in full". Ask the founder whether "refund you in full" is allowed before purchase: his no-refund-talk ruling of 2026-10-14 names the confirmation, tracking and emails. Do not change the copy before the answer.

## Escalations

- **E-1 (2026-10-18, implementer): A11's AC and T rows are not written into spec 009.** The brief
  asks for them "in place of A9's three cases (`pnpm specs:index`)", but spec text is the spec
  writer's, with the founder's approval (work order wo-172, rule of the road "no role edits a
  spec"). The tests A11 lists are built as A11 words them. For the spec writer: one AC ("no
  guarantee text, in any locale, states a number of days of freshness; `trust.guarantee.name`,
  `home.proof.guarantee.title` and `nav.utility.guarantee` read the fresh-flower promise") and
  T rows for the four A11 tests (scan fixture case, message and content scan, PDP unit case,
  e2e case), replacing A9's 5 / 7 / absent cases; then `pnpm specs:index`. The reviewer's
  round-1 ruling (PR 265): E-1 does not block the merge; the orchestrator opens a separate
  spec-writer row. That item also carries the words outside A11's closed lists that the reviewer
  listed: "fortnight" ("stays fresh for a fortnight"), "keeps" ("keeps for 7 days"), "vase life"
  ("7 days of vase life"), and "blooms for 7 days".

## Progress

- 2026-10-18: `trust.guarantee.name` retired in `en`/`de`/`pl`; `src/config/freshness-claim.ts`
  and `tests/unit/freshness-claim.test.ts` (fixture case, branch-deletion mutants, four-locale
  message and content scan) pushed; PR 265 opened as draft.
- 2026-10-18: PDP unit case (`tests/unit/product-page.test.tsx`), e2e case
  (`tests/e2e/product-page.spec.ts`), the `freshnessGuarantee` comment, the review queue entry in
  `tests/unit/i18n-messages-schema.test.ts`, the map. Next: rebase, ready, `ci:full`.

## Round 1 fixes (review FAIL and breaker HOLES on `e6a4fa76`)

Each hole, and the test that now closes it (all in `tests/unit/freshness-claim.test.ts` unless
named):

- **Hole 1 / required change 3, "7-day" untested and ASCII-only:** `SEVEN_DAY` takes any dash or
  space, and a new check flags a day count within three words of a guarantee word (`guarant*`,
  `garantie*`, `gwarancj*`, `promis*`, `versprech*`, `obietnic*`). Closed by "each check fires on
  the value only it reads" ("Your 7-day plan." → `sevenDay` only), "catches a day count beside
  every guarantee word" ("7 day guarantee", "7‑day guarantee", "7-Tage-Garantie", "7-dniowa
  gwarancja"…), "goes red when any single guarantee word is deleted", and the per-key
  restorations in four locales.
- **Hole 2, `DAY_ARGUMENT` unguarded:** "Delivered within {days}." → `dayArgument` only, and the
  same value restored in every named key.
- **Hole 3 / required change 1, ICU of any name:** an ICU argument of any name and a plural's `#`
  count as a number, and a claim inside an ICU argument spans the whole argument. "Fresh for
  {count} days.", "{n, number}", "{n, plural, one {# day} other {# days}}", "{n, plural, other
  {fresh for # days}}", `{tage}`, `{dni}` in "fails every round-1 dodge"; the branch-deletion
  sweep covers both new count branches.
- **Hole 4 / required change 2, Unicode:** `normaliseForScan` (NFKC, `&nbsp;`/`&#160;` decoded,
  `\p{Cf}` stripped, lower-case, `ß`→`ss`), `\p{Nd}` digits, `\p{Pd}` and U+2212 joins with
  optional spaces. Fixtures: ٧, ७, ７; ZWSP, word joiner, soft hyphen, `&nbsp;`; U+2011, U+2012,
  U+2014, spaced U+2013, U+2015, U+2212; NFD "świeże" and "Siebentägige"; "DREISSIG",
  "dreissig", "DREIẞIG". Removing NFKC, the `Cf` strip or the `ss` fold each turns cases red.
- **Hole 5, a word between number and day word:** caught, as a widening past A11's "directly
  followed" (stricter, never looser; the reviewer decides): at most one word, or a `+`. "7 full
  days", "7 volle Tage", "7+ days", "seven long days", "7 business days", "7½ days". Two words
  ("seven or more days") still pass, which is A11's letter. Removing the one-word gap turns six
  cases red.
- **Hole 6, vacuous readers:** "selects every infoPages.* value and every key with a guarantee,
  fresh or promise segment" (a built catalogue, exact key list; dropping the `infoPages.` clause
  or `promise` turns it red) and "reads content/pages/<locale>/guarantee.md" (a temp root with a
  seeded claim; pointing the reader elsewhere turns it red).
- **Hole 7, copy outside the guarantee keys** (`faq.photo.answer` + "They stay fresh for 7
  days."): A11's scope is guarantee text, so it is not read; the reader test asserts the FAQ key
  stays out. For the reviewer to accept or route to the spec writer with E-1.
- **Nit 1:** the `de`/`pl` `trust.guarantee.name` literals are pinned. **Nits 2, 4, 5** stay
  carry-forwards (stale comments in `Icon.tsx`/`TrustStrip.tsx`; content root empty until
  TASK-182; "fresh, and you have 14 days to cancel" is a conservative false positive, and so is
  any guarantee sentence with "14 days" within three words of "promise", for TASK-182's
  `pages:check`).

## Result

PR [#265](https://github.com/itsahmeds/flowers-overseas/pull/265).

- **Retired:** `trust.guarantee.name` "7-day freshness guarantee" → `en` "Fresh-flower promise",
  `de` "Frische-Versprechen", `pl` "Obietnica świeżych kwiatów" (the drafted translations
  `nav.utility.guarantee` already carries, TASK-176); `en-gb` inherits `en`. All three
  `reviewed: false`, `source: human`, `sourceHash` of the new `en` value. `home.proof.guarantee.title`
  already read "Fresh-flower promise" in every locale (TASK-177): unchanged.
- **Scan:** `src/config/freshness-claim.ts` (`freshnessClaims`, `FRESHNESS_TERMS`,
  `FRESHNESS_WINDOW`, `DAY_ARGUMENT`), reusing `sentencesOf` from `honesty.ts`; TASK-182's
  `pages:check` can call it. Beyond A11's lists it also reads the Polish combining forms
  (`siedmio-`, `dwu-`…) and the compound week stems (`-wöchig`, `tygodniow-`), and measures the
  window from the end of a whole ICU plural.
- **Tests:** `tests/unit/freshness-claim.test.ts` (17): A11's pass and fail sentences, every
  spelled-out number to thirty in three languages, every term, the window both ways, every
  single-branch deletion of both patterns caught, the four-locale scan over every guarantee key
  (`infoPages.*`, any key segment naming a guarantee, freshness or promise, the five named keys
  asserted present) and `content/pages/*/guarantee.md`, and "7-day" / `{days}` /
  `{freshnessDays}` restored in each named key in each locale reported.
  `tests/unit/product-page.test.tsx` +1 (same trust text for `freshnessDays` 5, 7, 30 in four
  locales; the view carries no `freshnessDays`; "72" present, 5/7/30 absent).
  `tests/e2e/product-page.spec.ts` +8 (four locales × a 5-day and a 7-day product).
- **Watched red:** "7-day freshness guarantee" restored in `de` → 2 red; `{days}` in the `en`
  PDP body → `en` and `en-gb` red; `FRESHNESS_WINDOW` 4 → red; the PDP title with a
  product-dependent number → the unit case red; "7-day freshness guarantee" as the PDP title →
  "expected [7, 72] not to include 7". The e2e case was not run locally (load average 40+);
  CI runs it.
- **Copy share (`en-gb`, spec 003 A17):** 0.6 % (3/541) on `main` → 0.7 % (4/541). With PR 262's
  keys about 3.3 % → 3.5 %.
- **New lines for the founder's next copy batch:** `trust.guarantee.name` `en` "Fresh-flower
  promise" (the batch's own words, re-used on a new key), `de` "Frische-Versprechen", `pl`
  "Obietnica świeżych kwiatów".
- **Not changed (outside the fence), still say "7-day":** code comments in
  `src/modules/ui/icons/Icon.tsx` L46 and `src/modules/ui/trust/TrustStrip.tsx` L7.
