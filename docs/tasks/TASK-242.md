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

- 2026-10-18: check 13 (head punctuation) in `i18n:check` over `HEAD_MESSAGE_KEYS` (`src/modules/i18n/head-punctuation.ts`), T-50 cases in `tests/unit/i18n-check.test.ts`; copy changed with TASK-243.
- 2026-10-18: `seed:check` and `corridor:check` rules with fixtures; the built-site scan, run locally once (3,546 documents, green). Done; `in_review`.
- 2026-10-18: breaker r1 HOLES 1 to 9 closed, each with a test that went red under its mutation: every Unicode dash and "--" (holes 1, 2: `tests/unit/head-punctuation.test.ts`, one-sided and edge dashes refused, the suspended hyphen kept, NBSP pinned); check 13 on `en-gb`, descriptions, breadcrumbs (hole 3, 7: `i18n-check.test.ts`; `breadcrumb.*`, `common.homeLink`, `destinations.*.name` added to `HEAD_MESSAGE_KEYS`, no dash found in them); seed `name`, every locale's occasions, the ": " shape (holes 4, 5: `seed-check.test.ts`); the `en-gb` guide (hole 6: `corridor-check.test.ts`); the scan pins per-locale counts (en 803, en-gb 803, de 796, pl 796) and counts only documents that answered 200 or the expected 404 (holes 8, 9). The pinned counts change when the catalogue gains or loses a page.
- 2026-10-19: rebased on main after PR 239 (review queue merged by hand, both sides' keys kept; en-gb share now 4.5%). Hole 8 reworked per the orchestrator: the expected per-locale count is read from the build's prerender manifest itself, not pinned; dropping `de` documents from the scan list still goes red (`de` 3 against 796).

## Result

PR: https://github.com/itsahmeds/flowers-overseas/pull/266 (one feature PR with TASK-243).

- **Check number: 13.** Spec 003 calls it "check 12"; TASK-237 (PR 229) took 12 for "shown" and
  10 is reserved for TASK-185's drafts, so the head-punctuation check is **13**, recorded in the
  `scripts/i18n-check.ts` header. Behaviour as the spec gives it.
- **One rule, three gates.** `src/modules/i18n/head-punctuation.ts`: `HEAD_MESSAGE_KEYS` (the
  spec's closed list; `*` is one key segment) and `headDashesIn()` (U+2014; a hyphen or U+2013 with
  whitespace on **both** sides). Both sides, because German's suspended hyphen ("Box- und
  Topfgestecke", a committed `de` occasion description) is correct and the either-side reading of
  `productOffer.ts`'s `Product.name` guard would refuse it.
- `i18n:check` check 13 over every authored catalogue; `seed:check` `copy/dash-in-head` and
  `copy/product-seo-title-shape` (four fixtures under `tests/fixtures/seed/_cases/copy/`; the case
  table is now 40); `corridor:check` rule 19 `dash-in-head` over `seoTitle`, `seoDescription` and
  `faq[i].q` (new case op `setFaqQuestion`).
- **The scan** (`tests/e2e/head-dash-scan.spec.ts`, e2e-desktop only): every route of
  `.next/prerender-manifest.json` in `en`, `en-gb`, `de`, `pl` (3,198 on this build), one Polish
  PDP per SKU per locale (336), the four localised 404s and eight page-2 listings: **3,546
  documents read, zero dashes**, 19 s against a local `next start` (build slot taken for this one
  measurement: the scan cannot be judged without a build; load average 16.7 at the build).
- **Watched red:** check 13 skipping `de`/`pl` (2 cases red); `HEAD_MESSAGE_KEYS` emptied (5 red);
  `copy/dash-in-head` filtered out (2 red); corridor rule skipping `faq[].q` (1 red);
  `meta.home.title` reverted (T-59 red); `catalog.descriptor.name` reverted (T-40 red);
  `shop.category.seoTitle` reverted (T-38 red); the scan's manifest list emptied (read 348,
  "Expected > 1000, Received 0"). The scan with `meta.home.title` reverted needs a rebuild and was
  not run locally; its T-59 case pins the exact served title.
- Copy: see TASK-243's `## Result`.

