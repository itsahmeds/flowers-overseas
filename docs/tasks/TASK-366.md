# TASK-366 — Spec 030a Wise export and payment: `minorToDecimalString`, `wiseCsv` (RFC 4180, CRLF, no BOM, formula cells neutralised), `createWiseExport`, `wiseExportFile` and its `no-store` CSV route, `cancelExport`, `markPaid`, `markExportPaid`

Row: `TASKS.md` → TASK-366. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-366`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (b) (work order `wo-1022-common.md`). Size M. Merges after: TASK-365.
- Spec 030a §2.6, §5.2 (export commands), §5.4, §8 (logs), §12 task 3. Owns AC-24 to AC-28.
- The CSV is generated on request, byte-identical on every download, never written to disk, R2 or a log; each download is `logAdminRead`. Fixed target amount in the florist's currency, EUR source. Until the founder commits the real header row, the fixture holds the spec's header and the PR says so.
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself:** 14900 and 123450 PLN; exponent 0 and 3 currencies; a legal name `=HYPERLINK("x")`, `+`, `-`, `@`, tab and CR leading cells; 1001 payouts; a payout already in an active export; a florist with no Wise id; cancel with one paid payout; `ops` and no session on the CSV route; an fs and Storage spy seeing no write.
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.

## Read

- `specs/030a-florist-payouts.md` §2.6, §5.2, §5.4, §13 Q7 to Q9, AC-24 to AC-28
- `docs/codebase-map.md` (where everything lives); `.claude/state/wo-1022-common.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

_None yet._

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
