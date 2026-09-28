# TASK-153 — `pr-policy` `NO_TASK_ALLOWED` allow-list, the work-order text fixes (spec writer commits via orchestrator), and the stale `ci.yml`/`gaps.md` text

Row: `TASKS.md` → TASK-153. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-153`; keep it current by editing this file, not the row.

## Binding

`specs/001-repo-dev-os-bootstrap.md` §14 A19 L612: AC-47, AC-48, AC-49 (T-49–T-51). `NO_TASK_ALLOWED` is an allow-list (Q12), without `.prettierignore` (Q13 took its alternative). The spec writer keeps no shell; the orchestrator commits for it (Q14), so fix the work-order text. The stale `ci.yml` comments (L72–77, L901) and the gaps.md nits go too. Founder answers of 2026-09-28 (`docs/decisions-log.md`, last rows) and the advisor fixes are already written into the amendment; do not reopen them.

## Read

- `specs/001-repo-dev-os-bootstrap.md`: read `## 0. Index` first, then only A19/A3's changes and the ACs named above
- `docs/codebase-map.md`: where everything lives
- scripts/pr-policy.ts and tests/unit/pr-policy.test.ts
- .claude/templates/work-order.md
- .github/workflows/ci.yml (comments only)

## Carry-forwards

- **From `/break 104` and `/review 104` (2026-09-28):** `pr-policy` reads `previous_filename` as well as `filename`, so a rename out of a guarded path is caught; add a rename case to T-49. Don't mark gaps.md row 4 closed (TASK-151 closes it). Keep `ci.yml` edits to comments, so that TASK-155 (after you) owns the `on:` block.

- **From the standards audit (2026-09-28):** `ci.yml` L197 claims the strict flags "are asserted by `pnpm typecheck:fixtures`", but that test ignores `unchecked-index.ts`. Correct the comment, or make the test assert it (`docs/framework/standards-audit-2026-09-28.md`, false claim 2).

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.
- **From `/break 104` round 3 (2026-09-28):** you add T-50's test to TASK-152's `PATH_TESTS` map in `scripts/gates-cheap.ts` (spec 001 L776–777: the PR that adds a test adds it to the map).

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **2026-09-28 · `.github/workflows/pr-policy.yml` is outside the fence** (to the orchestrator; `open`). AC-47 and T-49 need its listing to emit `previous_filename`. Proposed: `--jq '.[] | .filename, (.previous_filename // empty)'`, and the header comment's stale list "(src/ tests/ supabase/ seed/ emails/)" rewritten to name `NO_TASK_ALLOWED`. The T-49 case that reads the file is written and red until then.
- **2026-09-28 · `docs/framework/why.md` W-18 is outside the fence** (to the orchestrator; `open`). AC-49 says W-18 "stops claiming a `TASKS.md` line for all eleven fields: it says lines are cited where the Log has one" (L142–144: "each with at least one `TASKS.md` line"). The matching gaps.md nit is left open until it lands.
- **2026-09-28 · gaps.md row 5** (to the orchestrator; `open`). AC-49 says this PR marks row 5 ✅, but row 5 (shell writes past the guard, the Stop hook's `db/`) is closed by TASK-150's code, and `.claude/state/in-flight.md` gives rows 4–5 to TASK-150+151. Row 5 is left as it is; mark it when TASK-150's PR merges.

- **2026-09-28 · Orchestrator ruling on all seven escalations of PR 106:** the fence is widened to every one of them ("the fence was my mistake: every file is one the spec itself requires"). Applied: the `/spec` skill pointer, `HOLDS` in DoD §4 (that wording only), the `pr-policy.yml` `--jq` and header, the README `gates:cheap` row, W-18's sentence, `agent-orientation.test.ts` five → six headings (TASK-150+151 may add a T-53 case to the same file; whichever PR merges second rebases and keeps both). gaps.md row 5 is marked by whichever of PR 106 and the TASK-150+151 PR merges second; PR 107 was still open on `origin/main` `d85b69e`, so row 5 stays open here.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-09-28 · `scripts/pr-policy.ts` `NO_TASK_ALLOWED` + T-49 in `pr-policy.test.ts`; work-order text (AC-47 designer line, AC-48 spec writer; L120/L130 untouched for TASK-151) + T-50 `tests/unit/work-order-roles.test.ts` (in `PATH_TESTS`); `ci.yml` comments (header, L197 `typecheck:fixtures` claim corrected, commitlint) + T-51 in `ci-workflow.test.ts`; gaps.md step C items and nits. Blocked on the out-of-fence edits in `## Escalations`.
- 2026-09-28 · Ruling applied (see `## Escalations`), rebased on `origin/main` `d85b69e`; all 11 red cases green on the real tree; row set `in_review`.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR 106 (draft, shared with TASK-152). `NO_TASK_ALLOWED` replaces `GUARDED_PATHS`; T-49 in `tests/unit/pr-policy.test.ts` (11 allowed, 16 refused, both rename cases, dedupe, CLI, the `--jq` case red when `previous_filename` is dropped from the workflow); T-50 `tests/unit/work-order-roles.test.ts` 7; T-51 in `tests/unit/ci-workflow.test.ts` 4, red against the old `ci.yml`. `ci.yml` diff checked to touch comment lines only; the `on:` block is TASK-155's. The L197 claim is corrected, not made true. Checked every past `no-task` PR (102–105): none touches a path outside the allow-list.
