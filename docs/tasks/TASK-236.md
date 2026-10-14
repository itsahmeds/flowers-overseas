# TASK-236 — Codebase-map hard cap to 20 KB

Row: `TASKS.md` → TASK-236. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Keep it current by editing this
file, not the row.

## Binding

Keeps the breaker (a dev-OS test gate, `CLAUDE.md` DoD §4). The smallest task of the 2026-10-14
rulings: it unblocks PRs 180 (TASK-101), 224 (TASK-024) and 225 (TASK-226), each of which needs
50 to 300 bytes of map that the 17 KB cap no longer has.

- **Spec 001 §14 A21** (founder, 2026-10-14, verbatim "map 20"; `docs/decisions-log.md`
  2026-10-14): the hard cap on `docs/codebase-map.md` becomes **20 × 1024 = 20,480 bytes**. Today
  `tests/unit/codebase-map.test.ts` L88 asserts `17 * 1024` (TASK-200's raise of A16's 16 KB).
- **The inline reason.** The assertion carries a comment that cites spec 001 §14 A21 and says why:
  the cap is a guard against an unbounded map, not a budget the growth must fit under, and the
  ≤ 12 KB **target** stands (A16).
- **No other check changes** (A21: "No other check changes"). The generator, `PURPOSE_LIMIT`, the
  tests column and `pnpm codebase:map --check` are untouched. Compressing the output stays
  TASK-095's, which may lower the cap again.
- **Owned:** spec 001 AC-33 as A16 and A21 amend it (the hard-cap half; the target half is
  unchanged and still TASK-095's to approach).
- **Gates:** `pnpm gates:cheap` with the block pasted. CI green on the head with `ci:full`.
  `/review` and `/break`. The breaker mutates the subject: the cap set to 20,479 must turn the
  test red on a fixture map of 20,480 bytes, and a fixture of 20,481 bytes must be red at 20,480.
  If no fixture case exists today, add one (a committed-file size alone cannot show the boundary).

## Read

- `specs/001-repo-dev-os-bootstrap.md`: `## 0. Index`, then §14 A15 (AC-33), A16, A21
- `docs/codebase-map.md`
- `tests/unit/codebase-map.test.ts` (L80 to L95)

## Carry-forwards

- **From the founder's rulings (PR 227, 2026-10-14):** after this merges, the orchestrator tells
  PRs 180, 224 and 225 to rebase and regenerate the map with `pnpm codebase:map` (never a hand
  merge).

## Escalations

_None recorded._

## Progress

_Not started._

## Result

_Pending._
