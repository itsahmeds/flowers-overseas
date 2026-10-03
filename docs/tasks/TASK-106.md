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

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
