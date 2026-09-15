# TASK-087 — Corridor content model and gate: `CountryLocaleContentSchema` (zod) over `content/corridors/{locale}/{iso2}-{state}.md`, `CountryContentProvider` seam with `staticCountryContentProvider`, `toCountryLocaleContentRow()`/`toCountryRow()` projections pinned to spec 002 §5.1, `pnpm corridor:check` (18 rules), and the first corpus file `en/pl-guide.md`

Row: `TASKS.md` → TASK-087. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

Spec 007 AC-1, AC-2, AC-3, AC-4 and T-01…T-05, with every §13 default as the founder resolved them
on 2026-09-15: Q1 (seven `en` + seven `en-gb` files, **no** `de`/`pl` corridor file until a human
writes one), Q2 (no price on a guide page), Q3 (the live state is gated on an
`ActivePartnersProvider` that is false everywhere in Phase 0 — here it is the `operations` block
that makes a `live` file impossible), Q10 (spec 002 `country_locale_content` gains `seo_title` and
`seo_description`, recorded as spec 002 §14 A3). No database, no network, no route: `pnpm
check:no-db` covers every file added. The first file of the site lane; TASK-088 authors the rest of
the corpus and owns AC-18 reciprocity across it, TASK-091 owns the route.

## Read

- `specs/007-corridor-pages.md` §0 index, §2 (content model), §5.1, §5.2, §6, §9 AC-1…AC-4, §10
  T-01…T-05, §13 resolution
- `specs/002-schema-v1.md` §5.1 (`country_locale_content`, `country`), §14 (the amendment record)
- `src/config/countries.ts` (`COUNTRY_ROW_COLUMNS`, `toCountryRow()`), `src/modules/i18n/registry.ts`
  (the AC-5 seam this copies), `seed/check.ts` + `seed/check-cases.ts` (the rule-and-fixture shape),
  `tests/unit/design-docs.test.ts` §5b (the nine banned words), `seed/copy.ts`
  (`DELIVERY_TIMING_PATTERN`, `wordCount`)

## Carry-forwards

- **From `/review 59` (carried into this task):** `DELIVERY_TIMING_PATTERN` missed the
  clock-bearing forms. Extended in `seed/copy.ts` with `order by HH:MM` and
  `… for delivery today|tomorrow`, composed (not copied) into `corridor:check`'s `guide-claims`
  rule, with the fixture `Order by 14:00 and we deliver it.` The committed seed copy stays clean.

- **2026-09-16 — `/review 63` round 1: FAIL.** Three required changes, then re-review.
  1. `price-literal` (rule 15) misses every `NNN zł` form — `129 zł`, `od 129zł`, `Bukiety od
     129 zł` all pass the gate, while `129 złotych`, `129 PLN`, `€29` and `35 EUR` are caught.
     Cause: the trailing `\b` of `PRICE_LITERAL_PATTERN` after an alternation whose first branch
     ends in `ł`, which JS `\b` does not treat as a word character. `zł` is the native price
     literal of the one destination with a corpus file and the form TASK-088's `pl` copy will use.
     Fix with the Unicode-aware lookahead this file already uses in `containsTerm()` /
     `containsSlugAsUrl()` — `(?![\p{L}\p{N}])` — and add a `price-literal` fixture in the `zł`
     form so it cannot regress (the current fixture is `€29`, which is why the gap is invisible).
  2. Record the rule-10 reading as **spec 007 §14 A1** (§14 is still "_None yet._"). The URL-shaped
     grep is accepted (see the ruling in the PR review), but the interpretation must live in the
     spec, not only in the script header and this brief.
  3. Record the codebase-map cap as a **spec 001 §14 amendment** in this PR: AC-33's "Target size
     ≤ 12 KB" stays as the target, the hard assertion is ≤16 KB. The raise is accepted; a feature
     PR must not leave a spec figure and a test disagreeing.
  4. Declare two deviations in `## Escalations` or `## Result`: (a) AC-1's "fails the *build*" is
     not demonstrable here — nothing under `src/app/` imports `src/modules/geo`, so `pnpm build`
     never loads the corpus; the throw-at-module-load mechanism is in place and `corridor:check`
     is the gate today, and the build assertion carries to TASK-091. (b) Spec 007 §2 specifies the
     static provider reads "through a generated typed index" with "no `fs` in the bundle";
     `corpus.ts` uses `readFileSync`/`readdirSync` at module load instead.
- **2026-09-16 — round 2 (this PR's second push): all four applied.** (1) `PRICE_LITERAL_PATTERN`
  closes on `(?![\p{L}\p{N}])` instead of `\b`, with the trap written into its doc-comment for the
  next currency word; the fixture now carries **both** `129 zł` and `€29`, and
  `tests/unit/corridor-check.test.ts` runs the eight caught forms and four legitimate numbers
  through the gate. (2) Spec 007 §14 **A1** records the URL-shaped own-slug reading, plus the
  seven-destination scope of `other-country-in-body` and the deliberate absence of word boundaries
  in `bannedVoiceWordsIn()` (also written into `src/config/voice.ts`'s doc-comment). (3) Spec 001
  §14 **A16** records the 12 KB target / 16 KB hard cap, with TASK-095 named as the owner of any
  compression. (4) The two deviations are declared in `## Result` below and in the PR body.

## Escalations

- **2026-09-16 — `plan/02` §5.3's "own slug in body prose" grep, read literally, is unsatisfiable.**
  The English slug for Poland *is* `poland`, so a case-insensitive word grep would forbid the word
  "Poland" from Poland's guide. Implemented as a **URL-shaped** grep instead — the slug adjacent to
  a `/` or a `-` (`send-flowers-to/poland`, `poland-guide`), which is the leak the rule exists to
  catch — and documented in the script header. **Open for the reviewer to confirm**; no founder
  decision is needed unless they want the stricter reading, which would mean renaming the slugs.
- **2026-09-16 — `docs/codebase-map.md` passed spec 001 AC-33's 12 KB figure.** Four rows (the
  `geo` barrel's tests, `src/config/voice.ts`, the two corridor-gate scripts) put the generated map
  at 12 661 B with every purpose line already shortened to the generator's truncation width. AC-33
  words it as a **target** ("Target size ≤ 12 KB"); `tests/unit/codebase-map.test.ts` asserted it
  as a hard cap. The cap is raised to 16 KB with the reason in the test, so a runaway map still
  fails. **Needs a spec 001 §14 amendment, or a generator that compresses the tests column** —
  TASK-095's docs close is the natural owner. Flagged in the PR.

## Result

Shipped in PR (see the row): the corridor content model (`src/modules/geo/content/` —
`schemas.ts`, `parse.ts`, `corpus.ts`, `provider.ts`, `projections.ts`, `view.ts`), the
`CountryContentProvider` seam with `staticCountryContentProvider` and the `withCountryContentProvider`
injection hook (not exported from the barrel), `toCountryLocaleContentRow()` pinned to spec 002
§5.1 plus the two amended columns, `pnpm corridor:check` (`scripts/corridor-check.ts` +
`corridor-check-cases.ts`, 18 rules, one failing fixture each, a `corridor-check` CI job on
`needs: typecheck`), `src/config/voice.ts` (the nine banned words, now imported by both readers),
an optional `operations` block on the country registry (absent for all seven, which is what makes a
`live` file impossible), and the first corpus file `content/corridors/en/pl-guide.md` — 795-word
body, 169-word intro, 10 FAQ items all country-specific, `reviewed: false`, `source: human`,
awaiting the founder's skim. Tests: 58 unit assertions across four files (T-01 15, T-03 31, T-04 7,
T-05 5); the whole unit suite is 3 161 tests green. Left for TASK-088: the remaining six `en` files,
the seven `en-gb` override files (rule 17 and rule 18 bite once they exist) and the reciprocity of
`relatedIso2` across the corpus. Left for TASK-091: the route, `corridorState()` and the
`ActivePartnersProvider`.

### Deviations declared (`/review 63`)

- **AC-1's "fails the build naming file and field" is proven by the gate, not by `pnpm build`.**
  The mechanism is in place — `parseCorridorContentOrThrow()` throws naming the file and the field,
  `countryContentProviderOf()` calls it at module load, and `pnpm check:no-db` covers
  `src/modules/geo` — but nothing under `src/app/` imports `src/modules/geo` in this PR, so the
  build never loads the corpus and the build-failure half of AC-1 is not observable here.
  `pnpm corridor:check` (a required CI job) is the gate that bites today. **The build-failure
  assertion carries to TASK-091**, which adds the route that imports the barrel.
- **`src/modules/geo/content/corpus.ts` reads the corpus with `node:fs` at module load.** Spec 007
  §2 specifies the static provider reads "through a generated typed index" with "no `fs` in the
  bundle"; `corpus.ts` uses `readFileSync`/`readdirSync` over a fixed directory instead. Harmless
  while nothing imports the barrel, but it puts `node:fs` into the server bundle the moment
  TASK-091 imports it, and it forecloses the edge runtime. **Not fixed here** (it would mean adding
  a generator and a build step to a content PR). **TASK-091 must resolve it** — generate the typed
  index at build time, or mark the module server-only — and this is carried into that task.
