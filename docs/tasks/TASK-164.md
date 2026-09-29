# TASK-164 — `railway:check` labels staging's missing `worker` as an expected red (`expectedAbsences`), T-45 and its five fixtures, the runbook §6 line

Row: `TASKS.md` → TASK-164. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-164`; keep it current by editing this file, not the row.

## Binding

`specs/040-hosting-railway-cloudflare.md` §14 A4: AC-44 (T-45), amending AC-34, AC-42 and T-44. Widen `onlyAbsentProductionServices` in `src/lib/railway.ts` into the list of expected cases present (`expectedAbsences`), and build the stderr label from it in `scripts/railway-check.ts` `failureVerdict`: production's case first, then staging's, joined by ` and `. Only staging's `worker` qualifies; staging `web` absent is a real fault. The founder's decision of 2026-09-29 (`docs/decisions-log.md`) is not reopened.

## Read

- `specs/040-hosting-railway-cloudflare.md`: `## 0. Index`, then §14 A3 AC-34 and A4
- `docs/tasks/TASK-155.md` `## Result`: how the label is decided today
- `docs/codebase-map.md`

**Fence:** `src/lib/railway.ts`, `scripts/railway-check.ts`, `tests/contract/railway-check.test.ts`, `tests/fixtures/railway/` (the five new fixtures T-45 names), `docs/runbooks/railway-cloudflare-setup.md` (the §6 expected-red line and the "Release branch → What the checks print today" section), `docs/tasks/TASK-157.md` (one note: T-44's run may carry the staging line), this brief, the row and the map.

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review 121` round 2 (2026-09-29), binding on `docs/runbooks/railway-cloudflare-setup.md`:**
  (1) the F5 bullet "No `EXPECTED RED` line on stderr … Make a new token" (~L284) must not mislead
  while staging has no `worker`: it says what a missing label means now; (2) F5's "exactly" (~L275)
  and (3) "What the checks print today"'s "no other line" (~L391) allow the
  `staging · worker · triggers on none, declared main` line; (4) "a follow-up task" (~L413) becomes
  TASK-164, now shipped. Also: §6's expected-red line and the "What the checks print today" section
  quote AC-44's stderr.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

**Order:** starts once PR 121 (TASK-157's texts and runbook) has merged, not once TASK-157 is `done`: TASK-157 closes only on the founder's T-44 paste, and that paste waits for this task to merge so its stderr carries AC-44's label.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-09-30: row `in_progress`, carry-forwards from `/review 121` round 2 recorded. Next: T-45 tests and fixtures (red).
- 2026-09-30: T-45 cases and five fixtures committed red (24 failing); `expectedAbsences` and AC-44's three stderr lines green (68/68); ten mutations each turn a case red.
- 2026-09-30: runbook §6, F5 and "What the checks print today" rewritten to AC-44; map regenerated; `pnpm gates:cheap` PASS. Next: CI on the head, `/break` + `/review`.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR [#124](https://github.com/itsahmeds/flowers-overseas/pull/124). `TriggerReport.onlyAbsentProductionServices`
(a boolean) became `expectedAbsences: readonly ExpectedAbsence[]` in `src/lib/railway.ts`: the AC-44
cases present, `production-services` then `staging-worker`, empty unless every failing row is one of
them. `failureVerdict` in `scripts/railway-check.ts` picks AC-44's exact stderr line for (a), (b) or
(a)+(b) from a three-entry table, and prints `railway:check failed` otherwise. Contract tests in
`tests/contract/railway-check.test.ts`: 68 (was 52): T-45's five labelled CLI cases (stderr asserted
equal to AC-44's literal line, one extra with `environment-staging.json`), its five unlabelled ones
(including the mixed production `worker` / staging `worker` case and `environment-drifted.json`), six
report-level `expectedAbsences` cases; T-34's two staging-`worker`-absent expectations replaced
(now `["staging-worker"]` and `["production-services", "staging-worker"]`). Five new fixtures under
`tests/fixtures/railway/`. Mutations run on purpose, each red: dropping the `absent` guard (5 red),
the production-`web`-absent condition (4), the `worker` service filter (2) or the staging filter (3),
the every-failure rule (3), the production-present check (1), swapping the case order (4), ignoring
other checks (2), and changing line (b)'s text, line (a)+(b)'s text or its key (2 each). The staging
environment's presence has no separate check: without it staging `web` is absent, a real fault, so
the run is never labelled (pinned by `triggers-staging-no-web.json`). Runbook: §6's expected-red
paragraph quotes all three lines; F5's "exactly", its no-label bullet and "What the checks print
today" allow the `staging · worker` line, and "a follow-up task" is now TASK-164. No expensive gate
run locally. Handed on: TASK-103's PR deletes case (b) and the two (b) lines (AC-44); the
orchestrator's note in `docs/tasks/TASK-157.md` (T-44's run may carry the staging line) was left to
its bookkeeping PR, per the work order.
