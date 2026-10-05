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

_Not started._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
