# TASK-162 — The order-status lint: aliased tables, quoted-identifier SQL, `onConflictDoUpdate`, unreadable `.set(patch)`, the table `"order"`, and `scripts/` and `seed/` scanned

Row: `TASKS.md` → TASK-162. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-162`; keep it current by editing this file, not the row.

## Binding

`specs/001-repo-dev-os-bootstrap.md` §14 A20: AC-60 (T-64). Lint catches aliased tables, quoted-identifier SQL, `onConflictDoUpdate`, and `.set(patch)` where the patch may carry `status` (it refuses what it cannot read). It covers the table name `"order"` (spec 002) as well as `orders`, and scans `scripts/` and `seed/`. The transaction-local database trigger (Q20) belongs to spec 002 and TASK-020, not here. Founder answers (2026-09-28, `docs/decisions-log.md`) and the four advisor fixes are already in the amendment; do not reopen them. Each task updates its own `plan/12` §2 row (AC-62).

## Read

- `specs/001-repo-dev-os-bootstrap.md`: `## 0. Index`, then A20 and only the ACs above
- `docs/framework/standards-audit-2026-09-28.md`: the evidence (planted cases and results)
- `docs/codebase-map.md`

**Fence: every file the ACs name** (read from the spec, 2026-09-28). Anything else needs an escalation:

- eslint/fo/no-direct-order-status-write.js and its test
- plan/12-dev-workflow.md (its own §2 row)
- eslint.config.mjs (the order-status rule's `files` widened from `src/**` to `scripts/`, `seed/` and `db/`)
- tests/unit/lint-coverage.test.ts (your row)

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.
- **From `/review 108` (2026-09-28):** AC-60 only *cites* `src/lib/db.ts`; don't edit it. You wait for TASK-160 because both edit `eslint.config.mjs` and `lint-coverage.test.ts`.
- **From `/review 119` + `/break 119` (2026-09-29, round 1 on 39f7c35; FAIL / HOLES):** anchor the allowed path at the repository root; catch `?:`/`??`/sequence tables, a chain returned by a same-file function, `sql.raw`/`sql.identifier` and `const c = orders.status` in `sql`, or name them in the limit; one row per breaker hole 1–9 and per false-positive guard. Done in 330cd5e.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-09-29: rule, T-64 RuleTester rows (per-row `it.each`), further shapes, config block `fo/order-status` on `src/ scripts/ seed/ db/` + root files, AC-52 row widened with two red-case families; 27 mutations of the rule each turn a case red. PR #119 draft. Next: `plan/12` row, gates, ready + `ci:full`.
- 2026-09-29: `plan/12` §2 "Order integrity" row rewritten (AC-62). Next: `gates:cheap`, rebase, ready, CI.
- 2026-09-29: `gates:cheap` PASS at 6e42579; rebased (already on `origin/main` 1bd65b6); row `in_review`; PR ready with `ci:full`.
- 2026-09-29: round 1 fixes (330cd5e): anchored path, branch/function/`sql.raw` table shapes, a row per breaker hole and guard; 31 round-1 mutations each seen red. Next: gates, CI.

## Result

PR #119. `fo/no-direct-order-status-write` (AC-60) now counts the table `orders` or `order` under
any name the file gives it (import alias, `const`/`let` rebinding, destructuring, `schema["orders"]`,
a variable holding the chain), checks `.set()` on `update` chains and `onConflictDoUpdate`'s `set` on
`insert` chains, and refuses a patch it cannot read ("cannot prove this does not write `status`"):
only an object literal, or a same-file `const` bound to one and never written or handed on, with no
`status` key and only static keys, passes. SQL: `UPDATE`, `INSERT … ON CONFLICT … DO UPDATE SET` and
`MERGE … UPDATE SET` on `order`/`orders`, quoted, schema-qualified, `ONLY`, aliased, multi-line, in
strings, `sql` templates (table and `<table>.status` interpolations read as names) and `+` chains;
string literals and comments are blanked first and the SET clause ends at a top-level
`WHERE`/`FROM`/`RETURNING`, so `WHERE status = 'closed'` on a notes update passes. The rule moved to
its own block `fo/order-status` in `eslint.config.mjs` on `src/`, `scripts/`, `seed/`, `db/`, `*.ts`
and `*.mjs` at the root; `pnpm lint` on the real tree flags nothing. Tests (unit):
`no-direct-order-status-write.test.ts` 20 → 222 tests — T-64's 10 invalid and 2 valid rows exactly as
listed, each invalid row also valid at `src/modules/orders/service/transition.ts`, 42 further invalid
and 19 further valid shapes, the spec's message, and the rule `error` on 7 real files across the
roots, plus (round 1) the root-anchored path rows, the branch, function and `sql.raw`/`sql.identifier`
shapes, one row per breaker hole 1–9 and one per false-positive guard; `lint-coverage.test.ts` +4 (AC-52 row widened to four roots; a block turning the rule off for
`scripts/**`, and the block's `files` narrowed to drop `scripts/`, `seed/` or `db/`, each red naming
the root). 27 mutations of the rule (one per branch), and 31 more in round 1, each turned at least one case red. No expensive
gate run locally. `plan/12` §2 "Order integrity" row names the check and its limit (AC-62).

**Follow-ups, not done** (`/break 119` §7 "suggested"; clean at 39f7c35, obfuscation or out of
scope): `const [t] = [orders]`; `({ orders: t } = schema)`; the table as a function parameter; a
local `pgTable("order")` under another name; `q += "SET status…"`; `[…].join(" ")`; `E'\''` before
`status` (the blanker ignores E-string escapes); `db.update.bind(db)`; `{ set: patch }` /
`box.set(patch)` treated as read-only; a getter with side effects. Round 1 caught three items of
that list anyway: `${sql.raw("status")}`, `${sql.identifier("orders")}`, and `${T}` with
`const T = "orders"`. Logged from `/review 119`: a subquery in SET that names `status` is flagged
(a false positive on the safe side).

`gates:cheap` at 7230d2b, after round 1 (private `TMPDIR`):

```
gates:cheap · 7230d2bce22bfe46da4a024992906212be67c4ed · tree clean · base origin/main
typecheck             exit 0 · 2.0 s
lint                  exit 0 · 10.0 s
format:check          exit 0 · 8.3 s
i18n:check            exit 0 · 0.4 s
check:no-db           exit 0 · 0.2 s
codebase:map --check  exit 0 · 0.2 s
tests                 exit 0 · 10.5 s · changed 8 + map 0 + always 2 · always run: zod-boundaries, lint-coverage, url-pii
RESULT: PASS
```
