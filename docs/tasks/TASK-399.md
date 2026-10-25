# TASK-399 — One decision file per PR, collected into the decisions log

Row: `TASKS.md` → TASK-399. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Keep it current by editing this
file, not the row.

## Binding

Review-only (process tooling: a script, a workflow, agent and kernel text; no money, order, date,
auth, migration or legal surface). Owning spec: `specs/001` §14 A15, the orientation gates
(`codebase:map`, `specs:index`, `tasks:check`) this joins; there is no AC id.

Founder, 2026-10-25, verbatim: **"log fix ok"**, approving the orchestrator's proposal: "each PR
writes its decision note to its own small file, and a script builds the full log from them, so PRs
stop blocking each other and nothing is lost". Why: every docs PR appended a row to
`docs/decisions-log.md`, so each merge made every other open PR conflict, at the cost of a rebase
and a full CI round (30 to 60 min) per PR; PR 399 hit it three times on 2026-10-24.

1. A new entry is one file, `docs/decisions/YYYY-MM-DD-<slug>.md`, holding exactly the table row
   the log uses today (`| date | ADR | decision |`, optionally `| trigger |`), so the row format
   does not change.
2. `docs/decisions-log.md` stays the full log: the existing rows stay as they are, and
   `scripts/decisions-log.ts` (`pnpm decisions:log`) appends the files' rows in date-then-name
   order. `pnpm decisions:log --check` fails when the log is out of date or a file is malformed.
3. **Who regenerates (decided here): CI on main.** `.github/workflows/decisions-log.yml` runs on
   every push to `main` that touches `docs/decisions/**`, runs `node scripts/decisions-log.ts`,
   checks it, and pushes the one-file commit `docs(decisions): collect the decisions log` as
   `github-actions[bot]`. No PR edits the log, and never the PR author. A push by the workflow's
   own token fires no other workflow (GitHub's rule), so it cannot loop; the nightly `ci.yml` run
   on `main` covers the commit. Production is unaffected: it deploys from `release` only.
4. Pull requests run `pnpm decisions:log --lint` in the `lint` job (a PR's own file is not yet in
   the log, so `--check` would be red by design): every file is well formed, the hand-written part
   of the log is byte-for-byte frozen (SHA-256 pinned in the script), and the collected block holds
   no row without a file. An old-style PR that still appends a row to the log therefore fails with
   the message "add docs/decisions/<date>-<slug>.md instead" rather than being silently dropped by
   the next collection. `pnpm decisions:log` itself refuses to write over such a row.

## Read

- `scripts/decisions-log.ts`, `tests/unit/decisions-log.test.ts`
- `.github/workflows/decisions-log.yml`, `.github/workflows/ci.yml` (the `lint` job)
- `docs/decisions/README.md`

## Carry-forwards

- **From this task (2026-10-25):** `specs/README.md` also conflicted, but it is not a table of
  rows alone: the split table is followed by a prose paragraph listing the specs outside the
  roadmap's ranges, which every new spec PR edits mid-sentence. One file per spec would need that
  paragraph rewritten as a table (a content decision), so it is left for a later task.
- **From this task (2026-10-25):** PRs opened before this merges that append to
  `docs/decisions-log.md` turn red on `decisions:log --lint` after their rebase; the fix is to move
  the row into `docs/decisions/<date>-<slug>.md` and restore the log from `origin/main`.

## Escalations

- **2026-10-25, to the orchestrator: the edit guard refused `tests/unit/decisions-log.test.ts`.**
  The guard reads the task's row from the main checkout's `TASKS.md`, and TASK-399's row is added
  by this PR, so `tests/` is closed on this branch. The test is written and green outside the
  tree (20 cases; six mutations of `scripts/decisions-log.ts` each turn it red), staged in the
  main checkout at `.claude/state/task-399-decisions-log.test.ts` (not committed).
  Answer: open. Once TASK-399's row is on the main checkout's `TASKS.md`, copy that file to
  `tests/unit/decisions-log.test.ts` on this branch, commit and re-fire CI.

## Progress

- 2026-10-25: row and brief; script, test, workflow, lint step, agent and kernel text next.
- 2026-10-25: script, workflow, `lint` step, README, agent, skill and kernel text pushed; the unit
  test is blocked by the edit guard (see Escalations).

## Result

PR 413. `scripts/decisions-log.ts` (`pnpm decisions:log`, `--check`, `--lint`);
`.github/workflows/decisions-log.yml` collects on `main`; the `lint` job runs `--lint`;
`docs/decisions/README.md` gives the file format; `docs/decisions-log.md` keeps its 208 rows as
they were, gains a "do not edit" note and the collected block, which holds this decision's own
file. The hand-written part's SHA-256 is pinned in the script. Unit: 20 cases, held outside the
tree until the guard opens (Escalations). `specs/README.md` left as a carry-forward.
