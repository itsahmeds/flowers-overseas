# TASK-242 — No em dash in head copy: the gates

Row: `TASKS.md` → TASK-242. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Keep it current by editing this
file, not the row.

## Binding

Founder rulings 2026-10-05 ("approve the wording just no em dash") and 2026-10-14 ("yes go
ahead"), and the approval of the amendments, 2026-10-15 ("specs ok (237 and 240), dashes yes,
prices: your picks"). "Dashes yes" makes the spaced hyphen and spaced en dash ban binding (spec 003
A-founder-2026-10-15a, resolution 1). Until PR 237 merges, read the amendments with
`git show origin/docs/spec-emdash-titles:specs/<file>`.

- **One feature PR with TASK-243**, branch `task/TASK-242-no-dash-in-titles`, title
  `fix(seo): no em dash in titles, meta or structured data (TASK-242)`, the description closing
  both IDs. One agent builds both. Why: the gates must exit 0 on the committed tree (AC-50, AC-33,
  AC-36), which holds only with TASK-243's copy. `error-copy.data.ts` is changed by the copy and
  read by this task's unit test. T-51's red case reverts `meta.home.title`.
- **Class: keeps the breaker.** It changes copy that feeds `<title>`, meta descriptions and JSON-LD,
  and it changes the i18n, seed and corridor gates (`CLAUDE.md` DoD §4).
- **Spec 003 §14 A-founder-2026-10-15a, owned: AC-50 (T-50), AC-51 (T-51).**
  - Clause 1 sets the scope: `<title>`, `<meta name="description">`, `og:`/`twitter:` title and
    description, JSON-LD `name`/`headline`, and their sources.
  - Clause 2, third bullet: refuse U+2014, " - " and " – ". Hyphenated words and unspaced ranges
    pass. The "·" and "|" separators stay.
  - Clause 4: `HEAD_MESSAGE_KEYS` in `src/modules/i18n/` is the closed list the clause names. The
    check is an error naming the locale and the key, in `en`, `en-gb`, `de` and `pl`. The same unit
    test reads `error-copy.data.ts`.
  - **Check number.** The spec calls it "check 12", but PR 229 (TASK-237) already adds check 12
    ("shown"). Rebase onto PR 229 and take the next free number. Record the number in `## Result`
    and in the `i18n-check.ts` header. Behaviour is as the spec says; only the number differs.
  - AC-51: the scan covers every document the build prerenders in the four locales, plus one Poland
    PDP per SKU per locale, plus the localised 404. It prints the count it read and fails when that
    count is below the prerender manifest's count plus the sample. Pseudo-locales are out of scope.
    Each owning spec's page types are named cases: spec 004 T-59, spec 007 T-37, spec 008 T-38 and
    spec 009 T-40. The cases are written here and asserted against TASK-243's values.
- **Spec 006 §14 A-founder-2026-10-15a, owned: AC-33 (T-33), the rules half.** Clause 4 adds
  `copy/dash-in-head` (name, `seoTitle`, `seoDescription`; products, categories, occasions,
  add-ons; every locale) and `copy/product-seo-title-shape`. Each problem is one line naming the
  file, entity key, locale and field. The four fixtures are red and "Amber Hour: hand-tied, all-in"
  is green.
- **Spec 007 §14 A-founder-2026-10-15a, owned: AC-36 (T-37).** `corridor:check` `dash-in-head`
  covers `seoTitle`, `seoDescription` and `faq[].q`, naming the file and the field (FAQ by index).
  It has four fixtures. No guide copy changes and no `reviewed: true` is touched. The guides and
  the destinations hub are named cases of T-51.
- **Not this task:** body copy em dashes (spec 003 clause 9; the copy batches own them). Canonicals,
  slugs, hreflang, sitemaps and robots are unchanged.
- **Watched red (each AC's subject removed):** check skips `de` and `pl`; `HEAD_MESSAGE_KEYS`
  emptied; `copy/dash-in-head` removed; `dash-in-head` skips `faq[].q`; `meta.home.title`
  reverted; the scan's document list empty or short.
- **Order.** After TASK-226 (PR 225), which rewrites the same catalogue and seed rows, and after
  TASK-233's feature (PR 229), which changes `scripts/i18n-check.ts` and its test. Never beside
  TASK-240 (`seed/check.ts`). Merges before TASK-096 (spec 003 clause 6).
- **Gates:** `pnpm gates:cheap` with the block pasted; `pnpm seed:check` and
  `pnpm corridor:check` exit 0; CI green on the head with `ci:full`; `/review` and `/break`.

## Read

- `specs/003-i18n-foundation.md`: `## 0. Index`, then §14 A15, A17, A-founder-2026-10-15a
- `specs/006-seed-catalogue-import-imagery-pipeline.md`, `specs/007-corridor-pages.md`: §14
  A-founder-2026-10-15a
- `docs/codebase-map.md`
- `scripts/i18n-check.ts`, `seed/check.ts`, `seed/check-cases.ts`, `scripts/corridor-check.ts`,
  `scripts/corridor-check-cases.ts`, `src/modules/i18n/error-copy.data.ts`,
  `tests/e2e/phrase-scan.spec.ts` (and `relay-scan.spec.ts` from PR 225, the closest built-site scan)

## Carry-forwards

- **From QA-1 of the 2026-10-14 site test:** an em dash in the head of 3,476 of 3,870 crawled pages
  (`.claude/state/qa-2026-10-14/QA-1.md`, Q1-03).

## Escalations

_None recorded._

## Progress

- 2026-10-18: check 13 (head punctuation) in `i18n:check` over `HEAD_MESSAGE_KEYS` (`src/modules/i18n/head-punctuation.ts`), T-50 cases in `tests/unit/i18n-check.test.ts`; copy changed with TASK-243. Next: `seed:check` and `corridor:check` rules, the built-site scan.

## Result

_Pending._
