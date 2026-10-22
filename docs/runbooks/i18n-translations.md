# Runbook — translations: adding a key, drafting a locale, getting it reviewed

| Field | Value |
|---|---|
| Severity | not an incident: this is the routine procedure for every string on the site |
| Detect | a red `i18n-check` job; a locale stuck at `beta`; a native reviewer asking "what tone?" |
| Owner | founder (author of English), per-locale native reviewer (`plan/13` B12) |
| Last tested | 2026-09-08 (spec 003, TASK-043) |

Spec 003 is the contract behind every step below; `content/i18n/glossary.en.md` is the style
authority; `pnpm i18n:check` is the gate. Nothing here needs a database.

## 0. The five-second model

- `messages/en.json` is the **source of truth**. Every other catalogue is an override of it along
  a fallback chain (`en-gb → en`, `de → en`, `pl → en`), so a missing key is never a crash — it is
  English, reported.
- `messages/<locale>.meta.json` is the **review ledger**: per key, who wrote it (`source`),
  whether a human approved it (`reviewed`) and the hash of the English it was written against
  (`sourceHash`).
- A locale is **indexable only when it is reviewed**: above 5% unreviewed, `isLocaleIndexable()`
  answers `false`, the locale is dropped from `hreflang` and the switcher tags it `beta`. That is
  why `de` and `pl` are live URLs today and still out of every alternates set.
- Nothing about a locale lives in code. Adding one is a row in `src/config/locales.ts` plus, when
  a catalogue exists, one line in `messages.ts` (spec 003 AC-31).

## 1. Add or change an English key

1. Pick the namespace by **where the string is rendered**, not by topic: `meta` (titles and
   descriptions), `chooser`, `banner`, `errors`, `a11y` (accessible names, never visible), `common`.
   No namespace reaches the browser any more (TASK-085, spec 004 §14 A1 addendum): every string is
   resolved on the server, and a client island is handed the text it renders — see §7.
2. Edit `messages/en.json`. ICU only: `{count, plural, …}`, `{name}`, no string concatenation, no
   pre-formatted number, date or price in the value (`fo/no-adhoc-intl` and `formatMoney` own
   those).
3. Add the matching record to `messages/en.meta.json`:
   `{ "source": "human", "reviewed": true, "sourceHash": "…" }`. Do not invent the hash —
   `pnpm i18n:check` prints the expected value for a stale or missing one.
4. Use the key. `useTranslations`/`getTranslations` with the namespace; the key path is typed, so a
   typo is a `tsc` error, not a runtime `??`.
5. `pnpm i18n:check`. An **unused** `en` key fails the gate. If a key must exist before its
   consumer does (a namespace shipped for a later spec), mark it `"retained": true` in
   `messages/en.meta.json` — and know what that flag is: a **repository-only** escape hatch for
   the unused-key check, with no runtime meaning and no column in spec 002's `message_catalog`. It
   is a promise that a consumer is coming, and it should be removed in the PR that adds one.
6. Write the `de` and `pl` drafts of the new value in the same PR (§2): check 10 fails a key that
   is still English in either.
7. `pnpm test && pnpm lint`. `fo/no-literal-strings` fails a component that grew a literal instead
   of a key.

**Changing** an existing English value is the same procedure plus one consequence: every
translation of that key becomes stale, because its `sourceHash` no longer matches the English it
was written against. `pnpm i18n:check` lists them by file and key; that list is the reviewer's
queue, and it is the reason a copy tweak is never "just English".

## 2. Draft a locale (agent drafts, the echo and the policy file)

German and Polish are **agent-written drafts** (spec 003 §14 A15; TASK-185): a Claude agent writes
the `de` and `pl` values inside a task and commits them, as values in `messages/de.json` and
`messages/pl.json` and as rows in `seed/data/copy/{de,pl}/products.json`. Nothing calls a model at
build time, in CI or from a script. Every drafted value is committed as `source: "machine"`,
`reviewed: false`, with `sourceHash` = sha256 of the English it translates (seed rows:
`translationStatus: "machine"`, `reviewed: false`, the English row's `copySourceHash`). An agent
never writes `reviewed: true` or `source: "human"`; only a person attests (§4).

**When you add or change an English key, write its `de` and `pl` drafts in the same PR** (A15
clause 6). `pnpm i18n:check` **check 10** fails, naming file and key, on any `de`/`pl` key whose
value is still byte-identical to English, unless `content/i18n/draft-policy.json` excludes it or
lists it under that locale's `identical` with one of four reasons: `name` (a brand, product,
person or place name), `same-word` ("Beta", "Cookies"), `icu-only` (`{name}`) or `held` (the
English carries a claim a founder ruling withdrew; give the `task` that fixes it). Check 10 also
fails a stale `identical` entry, and any drafted value that breaks one of the draft rules: a
banned voice word in English, German or Polish (`src/config/voice.ts`), a number of days or weeks
of freshness, a price or VAT line in a `home.*` value, the wrong register (`du` in German;
`Pan`, `Pani`, `Państwo` in Polish), an inflected "Flowers Overseas", a Polish plural without
`one`, `few`, `many` and `other`, or a number, currency sign or `%` the English lacks.

**What is never drafted** sits under `excluded` and `excludedSeedRows` in the policy file: legal
and consent copy, price-display legal text, sympathy, funeral and All Saints' copy, slugs and
names. Those keys stay English until a person writes them (§10).

```sh
pnpm i18n:draft --locale pl          # fills a missing key with the English echo; keeps every fresh draft
pnpm i18n:draft --locale pl --dry-run
```

`pnpm i18n:draft` is still a **deterministic echo** (spec 003 §13 Q7): no LLM, no API key, no
network. It keeps a `machine` key whose `sourceHash` still matches the English, so a re-run leaves
the drafts alone, and it never overwrites `human` or `reviewed: true` copy. A key whose English
moved is stale: the echo overwrites it with English, and check 10 then fails until the new draft
is written. Seed rows follow the same rule (`draftCopyLocale()`): a fresh machine row is kept, and
only its closing sentence is re-flowed when `catalog.floristSentence` moves. Two consecutive runs
produce byte-identical files.

## 3. Read the reviewed share

```sh
pnpm i18n:check --summary
```

One row per locale: total keys, how many the share counts and how many it does not (§5.1), missing
after fallback resolution, the unreviewed count and share over the counted keys, stale
(`sourceHash` drift) count, and `indexable` yes/no. Below the table is the list of buyer-facing
keys not yet approved (§5.1), or "none". The `i18n-check` CI job appends the same
table to the GitHub step summary on every PR, and it is the **same number `isLocaleIndexable()`
uses** — a locale cannot look ready in CI and be gated in code, or the reverse.

The last column, **identical to `en`**, is check 10: the `de` and `pl` keys still byte-identical
to English with no exclusion and no `identical` entry in `content/i18n/draft-policy.json`. It
reads 0 on a mergeable tree, and `n/a` for English and for a fixture run without `--policy`.

Expected state in Phase 0: `en` reviewed and indexable; `en-gb` a thin override (a redundant
override, i.e. a value identical to `en`, is a failure, not a warning); `de` and `pl` agent-drafted
but 0% reviewed, hidden, `beta`, not indexable, with 0 identical to `en`.

## 4. Hand a locale to a native reviewer

1. Send the reviewer three things and nothing else: `content/i18n/glossary.<locale>.md` (their
   locale's rules), `content/i18n/glossary.en.md` (the brand terms, tone and taboo list that apply
   to every locale) and the preview URL for their locale.
2. Tell them what not to touch: brand terms, `{placeholders}` (the name inside the braces is code,
   not text), ICU plural categories and `a11y.*` strings whose audience is a screen reader.
3. They return edited values. **You** apply them:
   - edit `messages/<locale>.json`;
   - in `messages/<locale>.meta.json` set `"source": "human"`, `"reviewed": true` and the current
     `sourceHash` for each key they touched;
   - `pnpm i18n:check` — argument-set mismatches (a `{count}` dropped in translation) and ICU
     syntax errors are caught here, which is the whole reason a reviewer never edits JSON;
   - one PR per locale per pass, so the reviewed share moves visibly.
4. When the unreviewed share crosses below 5%, the locale flips to indexable **with no code
   change** — that is spec 003 AC-24, and it is a data flip in the manifest.

## 5. What makes a locale indexable

All five, or it stays out of the index:

1. `isLaunch: true` in `src/config/locales.ts` (in Phase 0 a code flip; spec 002/012 move the
   authority to the database with no caller change).
2. Unreviewed share ≤ 5% in its review manifest, over the keys the share counts (§5.1).
3. A localised, non-empty `<title>` and description on every document (`meta` namespace).
4. Its own `pathSegments` set — authored URL segments, never a machine-translated slug.
5. Spec 007's site-wide indexability lift. Until then **everything** is `noindex`, so a green
   review share is necessary and not sufficient.

Pseudo-locales (`en-XA`, `ar-XB`) are never indexable, never in `alternatesFor()` and never in the
switcher; the env schema refuses `ENABLE_PSEUDO_LOCALES` in production.

### 5.1 What the share counts (spec 003 §14 A17)

The share measures what a crawler can read. It counts a key unless the scope registry classifies
it as non-indexable: a key that only checkout, order confirmation, order tracking, the florist
portal, admin, `/demo/` or the development pages renders, or an email body, which renders on no
page. Such a key is in neither the unreviewed count nor the total. Without this rule the first
checkout PR would push `en` over 5% and turn the whole English site `noindex`.

- **The registry** is `src/modules/i18n/review-scope.ts`. Each entry has a `match` (a top-level
  namespace such as `checkout`, or a dot prefix ending in `.*` such as `meta.checkout.*`), a
  `surface` from a closed list, and `paths`, the source globs that alone may reach the matched
  keys. The task that adds the keys adds their entry in the same PR. It is empty until the first
  such key exists.
- **Counted by default.** A key that no entry matches counts. A new namespace, a typo in `match` or
  a forgotten entry therefore raises the share and moves a locale toward `noindex`; no mistake in
  the registry can move unreviewed copy toward the index. Shared chrome (`nav`, `footer`, `common`,
  `consent`, `a11y`, the `meta` titles of indexable pages) and any key that renders on at least one
  indexable page type always count. `errors.*` counts too.
- `pnpm i18n:check` **check 11** holds each entry to its claim. It is an error and names the
  entry and the file. It fails an entry whose `match` reaches no `en` key, a `surface` outside the
  closed list, a matched key read from a file outside the entry's `paths`, a `paths` glob that
  matches a shared file (`src/modules/ui/`, `seo/`, `catalog/`, `i18n/`, the localised shell), and
  a file under an entry's `paths` that an indexable page imports, directly or through other files.
  When it fails the last one, move the piece out of the entry's `paths`; its keys then count.
  Keys built at run time (`` t(`checkout.${step}`) ``) are invisible to it. Spec 007 adds a
  built-HTML marker check before the indexing flip.
- **Not counted is not exempt from review.** Checkout, confirmation, tracking and buyer emails
  state prices, dates, cutoffs, withdrawal terms and what the buyer agrees to. Every such key a
  buyer can read needs the founder's exact-text approval, recorded by the founder's own
  `record-approval` run, before the merge that ships it to buyers. Price-display text and every
  `legal.*`, `infoPages.legal.*` and `consent.*` key stay reviewed wherever they render. The
  summary's list of unapproved buyer-facing keys is what the reviewer reads; it becomes a blocking
  CI gate before the first real-money order. Founder approval is not the lawyer sign-off that spec
  041 owns.
- **Who attests.** Only the founder's `record-approval` run, or a native reviewer by §4, writes
  `reviewed: true`. An agent never does, and no key is marked reviewed to tidy the summary.

## 6. Bidi and RTL: the `<bdi>` rule

Any string the site did not author — a recipient name, a gift-card message, a florist's shop name,
a city typed by a buyer — is wrapped in `<bdi>` when it is rendered inside our own text. Without
it, one Arabic or Hebrew character in a name reorders the punctuation of the sentence around it,
and the bug appears only for the visitor, never in review. Never use `<span dir="…">` guessed from
the data, and never concatenate a formatted number with a name: `Intl` output and `<bdi>` are the
two tools. Direction-carrying icons are spec 004's `[dir=rtl]` utility. `/ar-XB` is the
screenshotted proof (Playwright `pseudo-rtl` project); spec 004 inherits this rule for every
component it adds.

## 7. Keep the client payload at zero

**No message catalogue, translator or provider may reach the browser** (spec 004 §13 Q13 option
(b), §14 A1 addendum; TASK-085). `NextIntlClientProvider` and its `localeDocument` payload cost
10 705 B Brotli on every locale document, and a static `messages/en.json` import in the 500
boundary cost another 4 751 B on *every* document — the whole catalogue, because Turbopack
tree-shakes a JSON import only below a size threshold, so each copy edit moved the bill by
kilobytes. Both are gone and the rule that replaced them is simple:

- `useTranslations`/`getTranslations` are **server-only**. A Server Component resolves the copy and
  hands a client island plain strings as props — `suggestionCopy()` for the suggestion banner,
  `consentView()` for the consent sheet, a pre-formatted array for the finder's live region.
- An ICU message with an argument is formatted **on the server**, once per possible value if the
  value is decided in the browser (the banner resolves `banner.headline` for each launch locale;
  the finder resolves `finder.destinations.matches` per match count).
- The two 500 boundaries are Client Components that no server can hand props to, so their four
  strings live in `src/modules/i18n/error-copy.data.ts` as constants, per launch locale.
  `tests/unit/error-document.test.ts` compares every one of them with `loadMessages()`, so editing
  `messages/*.json` without editing that file fails the build with both paths named. **Adding a
  locale adds four strings there.**

Three gates hold it: `tests/unit/client-message-graph.test.ts` walks the imports of every
`"use client"` module (no `next-intl`, no `messages.ts`, no barrel, no `messages/*.json`),
`pnpm budget:client-js` scans the built chunks for `home.*`/`finder.*`/`catalog.*`/`media.*` copy,
and `tests/e2e/client-js-budget.spec.ts` measures the script set in Chromium. `namespacesFor()`
still exists as the per-route subset seam spec 012 serves from Postgres, and AC-27's 4 KB budget
is now an upper bound on a payload that is not sent.

## 8. Two known maintenance points

- **ICU zone and locale names are exact-string assertions.** `formatTimeInZone` renders a zone
  label from CLDR (`timeZoneName: "longGeneric"` — "Central European Time", not "Warsaw time"),
  and the unit tests compare it character by character. CLDR data ships inside Node's ICU, so a
  **Node upgrade can change an expected string** and fail `pnpm test` with no code change. That is
  a working gate, not a broken test: read the new ICU output, confirm it is a rename rather than a
  regression, and update the expectation in the same PR as the Node bump.
- **Space folding in the formatter tests.** CLDR separates a `de` percent sign and groups `pl`
  thousands with non-breaking spaces (U+00A0 / U+202F), and which of the two ICU picks has changed
  between ICU releases. The tests fold exactly those two characters to a plain space before
  comparing, and relax nothing else — digits, separators, symbols and symbol positions are still
  compared exactly. Do not widen that fold to make an assertion pass; a changed separator is a
  changed price format and the founder needs to see it.

## 9. Time zones: there is no default

A relay has no single local zone. A cut-off is the **florist's** zone, a delivery slot is the
**recipient's**, a receipt is the **buyer's**, and no page may render a time without saying which.
`formatDate`/`formatTimeInZone` therefore *require* an IANA zone — omitting it is a type error,
and a zone arriving from data is parsed. `src/modules/i18n/request.ts` pins next-intl's own zone to
`UTC` for exactly this reason: it is a neutral value for a formatter nobody told a zone, not a
claim that anything happens in UTC. (The same value used to be repeated on the client provider in
`src/app/[locale]/layout.tsx`, to keep client and server markup identical; TASK-085 removed the
provider, so there is no second environment to disagree with the server's.) If a future spec ever
wants a "site time zone", it is wrong.

## 10. Before a German or Polish locale is shown, indexable or takes orders

The drafts are unreviewed, so three events are gated by people, not by the 5 % rule alone (spec 003
§14 A15, advisor fix 2, memo 2026-10-04; it is stricter than the founder's accepted default, which
asks only that a person writes the English parts before the locale becomes indexable). **For a
locale, a person writes every key and seed row under `excluded` and `excludedSeedRows` in
`content/i18n/draft-policy.json`, and a native reviewer (`plan/13` B12) attests every key and row
under `reviewBeforeOrders`, before the first of these happens for that locale:**

1. the locale becomes indexable (`isLocaleIndexable` turns `true`, it is set `shown: true`, or
   any change puts it in hreflang or a sitemap);
2. `/de` or `/pl` can take an order (the payment or corridor go-live data flip that lets a buyer
   on that locale pay);
3. any consent-gated tag is switched on for that locale.

`reviewBeforeOrders` names the drafted values a buyer can hold us to (EU 2019/771 Art. 17): the
fresh-flower promise and redelivery answers, every cutoff line, every refund, cancellation or
withdrawal answer, and every drafted product description (`seed:products`). A task that adds a
key of that kind adds it to the list in the same PR. The gate is procedural: the admin data flip
for ordering and the `/launch` checklist check it by hand, and the flip's PR names it. The 5 %
rule cannot enforce it, because `isLocaleIndexable` counts unreviewed keys and does not know who
wrote an excluded one. For `pl`, a Polish lawyer also confirms the Language Act reading before
checkout opens (spec 041).

## 11. Common failures

| Symptom | Cause and fix |
|---|---|
| `i18n:check` reports a key `missing after fallback` | the key exists in a translation but not in `messages/en.json`. English is the source of truth: add it there (§1) or delete the orphan |
| `unused key` on a key you just added | its consumer is not merged yet: either use it in this PR or mark `"retained": true` with a note (§1.5) |
| `stale sourceHash` on many keys after an English edit | expected: that is the review queue. Re-run `pnpm i18n:draft --locale <code>` for machine copy, or send the list to the reviewer for human copy |
| `i18n:check` reports a scope entry and a file | an entry claims keys that an indexable page can render. Read the reason: move the reader into the entry's `paths`, move the key to a counted namespace, or move the piece out of the entry's `paths` (§5.1) |
| `redundant en-gb override` | the British value is identical to the American one. Delete the override; the fallback chain already answers |
| `argument-set mismatch` | a translation dropped or renamed a `{placeholder}`. The braces are code — restore the exact name |
| ICU syntax error naming a file and key | usually an unclosed `{` or a plural category that does not exist in that language. Polish needs `one/few/many/other`; English needs `one/other` |
| A German page shows English | an excluded key (legal, consent, price-display, sympathy) by design until a person writes it (§10), or a key whose English moved and was re-echoed: check 10 names it, and the PR that moved the English writes the draft (§2) |
| check 10: `is identical to en in de` | draft the key in `messages/de.json` with `source: "machine"`, `reviewed: false` and the new `sourceHash`, or list it under `identical.de` in `content/i18n/draft-policy.json` with a reason from `name`, `same-word`, `icu-only`, `held` |
| A locale renders but is absent from `hreflang` | its unreviewed share is over 5% (`isLocaleIndexable()` is `false`). Not a bug — spec 003 AC-14 |
| `pnpm i18n:pseudo` exits non-zero with `--check` | the generated `messages/en-XA.json` / `ar-XB.json` are stale. Re-run it without `--check`; the files are git-ignored, the routes derive the same values in memory |

## Communication

None external. A change to the register or tone of a locale is a glossary edit **and** a note in
`docs/decisions-log.md`; a change to what makes a locale indexable is a spec change.

## Post-incident

If a wrong-language or untranslated string reached a published page, add the check that would have
caught it to `scripts/i18n-check.ts` in the same PR. A rule in this runbook that a script can
enforce belongs in the script.
