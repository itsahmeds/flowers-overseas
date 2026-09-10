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
6. `pnpm test && pnpm lint`. `fo/no-literal-strings` fails a component that grew a literal instead
   of a key.

**Changing** an existing English value is the same procedure plus one consequence: every
translation of that key becomes stale, because its `sourceHash` no longer matches the English it
was written against. `pnpm i18n:check` lists them by file and key; that list is the reviewer's
queue, and it is the reason a copy tweak is never "just English".

## 2. Draft a locale (machine echo, offline)

```sh
pnpm i18n:draft --locale pl          # writes messages/pl.json + messages/pl.meta.json
pnpm i18n:draft --locale pl --dry-run
```

What it does and does not do:

- It is a **deterministic echo**, not a translator (spec 003 §13 Q7): it copies the English value
  and stamps `source: "machine"`, `reviewed: false`, `sourceHash: <hash of the English>`. There is
  no LLM, no API key and no network call in Phase 0 — a unit test with MSW's
  `onUnhandledRequest: "error"` is what proves it.
- It **never overwrites human or reviewed copy.** A key whose meta says `reviewed: true` is left
  alone and reported as stale if the English moved.
- Two consecutive runs produce byte-identical files, so a re-run on a clean tree is a no-op and CI
  cannot flap.

So after a draft the German and Polish pages read as **English under a German or Polish URL**.
That is deliberate and safe, because the review gate keeps them out of the index — and it is
exactly what the reviewed-share table below reports.

## 3. Read the reviewed share

```sh
pnpm i18n:check --summary
```

One row per locale: total keys, missing after fallback resolution, unreviewed count and share,
stale (`sourceHash` drift) count, and `indexable` yes/no. The `i18n-check` CI job appends the same
table to the GitHub step summary on every PR, and it is the **same number `isLocaleIndexable()`
uses** — a locale cannot look ready in CI and be gated in code, or the reverse.

Expected state in Phase 0: `en` 100% reviewed and indexable; `en-gb` a thin override (a redundant
override, i.e. a value identical to `en`, is a failure, not a warning); `de` and `pl` at 0%
reviewed, `beta`, not indexable.

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
2. Unreviewed share ≤ 5% in its review manifest.
3. A localised, non-empty `<title>` and description on every document (`meta` namespace).
4. Its own `pathSegments` set — authored URL segments, never a machine-translated slug.
5. Spec 007's site-wide indexability lift. Until then **everything** is `noindex`, so a green
   review share is necessary and not sufficient.

Pseudo-locales (`en-XA`, `ar-XB`) are never indexable, never in `alternatesFor()` and never in the
switcher; the env schema refuses `ENABLE_PSEUDO_LOCALES` in production.

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

## 10. Common failures

| Symptom | Cause and fix |
|---|---|
| `i18n:check` reports a key `missing after fallback` | the key exists in a translation but not in `messages/en.json`. English is the source of truth: add it there (§1) or delete the orphan |
| `unused key` on a key you just added | its consumer is not merged yet: either use it in this PR or mark `"retained": true` with a note (§1.5) |
| `stale sourceHash` on many keys after an English edit | expected: that is the review queue. Re-run `pnpm i18n:draft --locale <code>` for machine copy, or send the list to the reviewer for human copy |
| `redundant en-gb override` | the British value is identical to the American one. Delete the override; the fallback chain already answers |
| `argument-set mismatch` | a translation dropped or renamed a `{placeholder}`. The braces are code — restore the exact name |
| ICU syntax error naming a file and key | usually an unclosed `{` or a plural category that does not exist in that language. Polish needs `one/few/many/other`; English needs `one/other` |
| A German page shows English | correct until `de` is reviewed. Check `pnpm i18n:check --summary`: 0% reviewed means the echo draft is showing, by design |
| A locale renders but is absent from `hreflang` | its unreviewed share is over 5% (`isLocaleIndexable()` is `false`). Not a bug — spec 003 AC-14 |
| `pnpm i18n:pseudo` exits non-zero with `--check` | the generated `messages/en-XA.json` / `ar-XB.json` are stale. Re-run it without `--check`; the files are git-ignored, the routes derive the same values in memory |

## Communication

None external. A change to the register or tone of a locale is a glossary edit **and** a note in
`docs/decisions-log.md`; a change to what makes a locale indexable is a spec change.

## Post-incident

If a wrong-language or untranslated string reached a published page, add the check that would have
caught it to `scripts/i18n-check.ts` in the same PR. A rule in this runbook that a script can
enforce belongs in the script.
