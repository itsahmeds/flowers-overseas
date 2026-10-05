# TASK-224 — Spec 003 A17 indexable-only unreviewed share: `src/modules/i18n/review-scope.ts` (match, surface, paths; unclassified counts), the scope in `review.ts`, `i18n:check` check 11 (source scan + transitive import rule), the summary columns with the unapproved buyer-facing list, runbook and `review.ts` header

Row: `TASKS.md` → TASK-224. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-224`; keep it current by editing this file, not the row.

## Binding

- **Spec 003 §14 A17 is the whole task**, approved by the founder on 2026-10-05: the rule in clause 1 ("yes") and recommendations (a) to (d) ("2 approve all"). The mechanism (clauses 2 to 7) is the spec writer's, checked by the advisor (GO WITH FIXES, fixes applied) and the reviewer. Read A17 verbatim, with §2's `review.ts` bullet, AC-23, AC-24 and A15.
- **ACs owned:** spec 003 AC-40, AC-41, AC-42, AC-43, AC-44; **tests owned:** T-40 to T-44, each with the mutation A17 names.
- **Fails safe:** a key no registry entry matches is counted. A mistake may cause a needless `noindex`, never index unreviewed copy.
- **Check 11** covers the source scan **and** the transitive import rule (advisor fix 1): a file whose keys are excluded may not be reached, directly or through other files, from a file that renders an indexable page.
- **Unchanged:** the 0.05 threshold, what "reviewed" means, who attests (only the founder's own record-approval run), `de`/`pl` staying out of the index (AC-42).
- **Not counted is not exempt:** price-display, legal and every buyer-facing string still need the founder's approval before they ship (A17 clause 5); the summary lists the unapproved buyer-facing keys (AC-43). No CI gate for that yet (recommendation (b)).
- **Order:** merges before the first spec 010, 011 or 012 task that adds keys to a public catalogue.
- **PR class:** full (i18n tooling that decides indexability): `/review` and `/break`.

## Read

- `specs/003-i18n-foundation.md`: `## 0. Index`, then §14 A15, A16, A17, §2 (`review.ts`), AC-23, AC-24
- `docs/advice/2026-10-05-spec-003-a17.md`: the advisor's memo
- `docs/codebase-map.md`
- `src/modules/i18n/review.ts`, `scripts/i18n-check.ts` (or wherever `i18n:check` lives, per the map), `docs/runbooks/i18n-translations.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- Built `review-scope.ts`, the scope in `review.ts` (`reviewBreakdown`), check 11 in `scripts/i18n-check-scope.ts`, `--scope` flag, summary columns and the unapproved list, runbook §5.1, tests T-40 to T-44; all mutations named in A17 watched red. PR 207.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR 207. Shipped spec 003 §14 A17: `src/modules/i18n/review-scope.ts` (zod-parsed registry, counted by default, `withReviewScope`, `matchReaches`, `scopeEntryFor`), `review.ts` counts only unmatched keys (`reviewBreakdown`, cache keyed by the registry in force; barrel untouched), `i18n:check` check 11 in `scripts/i18n-check-scope.ts` (new file, the check's own module: source scan, shared-file list, transitive import rule via TypeScript's import scanner) with a `--scope <file.json>` fixture flag, the summary columns (keys, counted, not counted, unreviewed counted, share, indexable) and the unapproved buyer-facing list, runbook section 5.1, `review.ts` header.

**Decisions.** (1) The committed registry is empty: no key of today's catalogue is reached only by a non-indexable surface, and check 11 refuses an entry whose `match` reaches no `en` key, so checkout/florist entries cannot be declared before their keys (A17 clause 7: the task that adds the keys adds the entry, in the same PR). TASK-201 adds `checkout.*` with its entry. (2) Committed `en` is already at 4.1 % unreviewed (22 of 537), so the margin to 5 % is 4 keys; this is why the merge order matters.

**Tests.** `tests/unit/i18n-review-scope.test.ts` (15: T-40 four fixtures with exact values, registry parsing, T-42 pins, T-44 docs) and `tests/unit/i18n-check-scope.test.ts` (14: T-41 five faults plus repaired and committed tree, `export from` and `import()`, T-43 summary fixtures a/b and the florist non-listing). `i18n-check.test.ts` summary regexes updated for the new columns. Mutations watched red: scope ignored (5 red), unmatched dropped (case c red), non-counted kept in denominator (5 red); scan half deleted (catalog fixture red), shared lists emptied (ui glob and shared-importer red), direct imports only (intermediate-file fixture red); summary share over every key (3 red), one key dropped from the list (case a red); each clause 5 sentence removed (red); threshold 0.1 (red).

**Carry-forward to TASK-185 (AC-42's check 10).** `i18n:check` check 10 and `content/i18n/draft-policy.json` do not exist on this base (TASK-185 is unmerged), so T-42's "check 10 still fails a `checkout.*` key with no `de` draft" clause cannot be written here. TASK-185 owns it, with the fixture A17 names; the header of `i18n-check.ts` leaves the slot for check 10. AC-42's PR check (no review field and no policy line changes) is clean on this diff: `messages/*` is untouched.

`pnpm gates:cheap`: typecheck, lint, format:check, i18n:check, check:no-db, codebase:map --check all exit 0; tests 133 files, 3760 passed. No build slot used.
