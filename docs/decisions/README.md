# docs/decisions/

One file per decision (TASK-399, founder 2026-10-25 "log fix ok"). CI on `main` collects them into
`docs/decisions-log.md`, so a pull request never edits the log and never conflicts on it.

**Name:** `YYYY-MM-DD-<slug>.md`, the date the decision was made and a short slug in lower-case
words joined by `-` (`2026-10-25-decision-files.md`). Two decisions on one day are two files.

**Content:** exactly one line, the log's table row, ending in one newline:

```
| 2026-10-25 | ADR-0021 | What was decided, with the founder's words verbatim where they decided it. | What triggered it |
```

- The first cell is the date in the file name.
- The second is the ADR id, or `none`.
- The third is the decision. The fourth, the trigger, is optional, as it is in the log.
- A literal `|` inside a cell is written `\|`.

**Append-only.** A merged file is never edited or deleted: a correction is a new file that says
what it corrects. `pnpm decisions:log --lint` (run on every pull request) fails on a malformed
file, on a change to the log's hand-written rows, and on a collected row whose file is gone.

**Commands:**

- `pnpm decisions:log --lint`: what a pull request must pass (its own row is not collected yet).
- `pnpm decisions:log --check`: also fails when the log is behind the files.
- `pnpm decisions:log`: rewrites the collected table at the end of the log. Only
  `.github/workflows/decisions-log.yml` runs it, on `main`, after a merge.
