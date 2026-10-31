# TASK-426 — Search relevance for real de/pl text: a typo match only for a query word that matches nothing firmly in the searched set, and the engine tests restated as ranking properties (same list across spellings, the named flower's products first at tier 4)

Row: `TASKS.md` → TASK-426. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-426`; keep it current by editing this file, not the row.

## Binding

- Owns spec 045 AC-6, AC-7 and AC-8 **as amended by §14 A-orchestrator-2026-10-25b** (T-06 to T-08), re-owned from TASK-401. The amendment is an orchestrator default: it binds until the founder answers §13 Q16 ("OK, or keep exact lists?"). If he answers "keep exact lists" before this merges, stop and escalate.
- **Item 1, the engine (§2.3 as amended):** a query token takes typo matches only when no field of any document of the searched set (the destination's listing set in the request locale's index, or `coreRange(locale)` when country-less) matches it exactly, by stem or, for the last token, by prefix, as `fieldMatch` defines those kinds. A token with a firm match anywhere takes no typo match anywhere. This replaces the per-document fallback in `src/modules/search/match.ts` (`matchDocument` drops typo hits only inside a document that matched the token firmly). Tiers, bands, §2.5's key, `didYouMean`, the Pages block and every signature stay as they are. AC-28's p95 budget still binds: decide "firm anywhere" once per token per query (for example in `planTokens`), not once per document.
- **Item 2, the tests (§9 as amended):** each group of spellings is compared with the others as exact ordered arrays (assert the one value); each lead is checked against the entity set the test computes from the catalogue (`listProducts` flower types), never a literal SKU list; tiers read through `matchDocuments`. The `Strauß` case becomes a fixture word with `ß` that no other `de` document carries, asserted absent from the unmodified index first. New: the no-tier-2 cases (`rose`, `roses`, `Rose`, `róża`) on the committed catalogue **and** on a fixture source whose `de` pink label is `Rosa` and whose one non-rose product has `różne` in its `pl` description; the tier never rising over every T-06 to T-09 query.
- **Must hold on both catalogues:** `main`'s (de/pl copy still largely English) and TASK-185's drafts (PR 328, branch `task/TASK-185-de-pl-drafts`). Before ready, run `tests/unit/search-engine.test.ts` alone on this branch, and once on a scratch merge of this branch with PR 328's head (a throwaway worktree, removed after; never `git stash`), and paste both results in the PR.
- Mutations to watch red (T-06 to T-08 name them): NFKD removed; the `ß` table row removed; the Polish suffix list dropped; prefix on every token; the per-document fallback restored (the `Rosa` fixture goes red); distance 2 for 6 letters; plain Levenshtein.
- Class: review-only (search relevance; no money, order, date, auth, migration or legal text). You are your own reviewer: `## Self-review` in the PR per `.claude/state/wo-1022-common.md`. Gates: `pnpm gates:cheap`, the touched unit files only, `--maxWorkers=2`; CI on the head with `ci:full`.

## Read

- `specs/045-site-search.md`: `## 0. Index`, then §2.3, §9's lead, AC-6 to AC-8, T-06 to T-08, §13 Q16 and §14 A-orchestrator-2026-10-25b
- `docs/codebase-map.md`: where everything lives
- `src/modules/search/match.ts` (`planTokens`, `fieldMatch`, `matchDocument`), `src/modules/search/text.ts`, `tests/unit/search-engine.test.ts`
- `docs/tasks/TASK-185.md` on PR 328's branch, Escalations, "Search exact lists vs real German and Polish copy" (the probe numbers)

## Carry-forwards

One dated bullet per `/review`, newest last.

_None recorded._

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **2026-10-25, spec 045 §13 Q16 (to: founder; answer: `open`).** Ranking properties and typo-only-when-nothing-matches (orchestrator default), or keep exact lists? The default binds until he answers.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-01, WIP, stopped on the orchestrator's order (founder reprioritised): engine change done in `src/modules/search/match.ts` (`typoOnlyWhereUnmatched`, once per token per query; per-document fallback removed); AC-6 to AC-8 tests restated as properties in `tests/unit/search-engine.test.ts` (Rosa/różne fixture, Maßliebchen `ß` fixture). Local run: 38 of 39 green on `main`'s catalogue. **Open finding, escalate before continuing:** `/de/suche` `Rose` vs `Rosen` are not one ordered list on `main`'s catalogue: the `de` descriptions of FO-BQ-025, -028, -029 still carry the English word `roses`, which `Rose` (last token) prefix-matches at tier 3 and `Rosen` (stem `ros`, `roses` stems to `rose` in German) does not; the old per-document typo let `Rosen` reach them. The lead (the 15 roses at tier 4) is equal. Likely holds on PR 328's German drafts (not yet run: the scratch merge conflicts in `messages/de.json`, `docs/codebase-map.md` and a visual baseline). Next: the founder/orchestrator decides whether AC-6's de group compares whole lists or the lead on `main`'s copy; then the scratch-merge run, mutations, gates, draft PR. No PR opened, no CI fired.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
