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

- 2026-11-04 (self-review, PR 469): `tests/fixtures/wise-batch-header.csv` holds spec 030a §5.4's header, not Wise's real template; the founder commits the downloaded template header before the first live export (§13 Q7). The contract test then fails until `PAYOUTS_CONFIG.wise.header` matches it, which is the intent.
- 2026-11-04: T-26 names an e2e; tonight's rules forbid Playwright on this machine, so AC-26 is carried by `tests/unit/payouts-wise-export-route.test.ts` (guard, headers, one `logAdminRead`, logger spy, a structural no-fs/no-storage check on the route and `export.ts`). The browser e2e belongs to TASK-367, which builds the page with the download link.
- 2026-11-04: the admin audit filter's entity list does not yet offer the `payout*` tables; TASK-367 adds them when it builds the audit view for payouts.
- 2026-11-04: `tests/unit/admin-unauthenticated.test.ts` times out (5 s) on its first cold page import (`applications/[id]`) under load 13 to 15; the same on the TASK-365 base, so not this diff. The new route's own 401 case in that file passes.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- 2026-11-04: a cancelled export's file: the spec says cancel "frees its payouts" and is silent on downloading it again. Conservative reading, delegated by the orchestrator: `wiseExportFile` refuses `PAYOUT_EXPORT_CANCELLED` (409), so a file whose payouts may go into another export is never uploaded twice. Decided, not open.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-04: `export.ts` (CSV, export, cancel, mark paid, download), the route, error codes and audit entity, fixtures with `-text` in `.gitattributes`, contract/unit/route/integration tests; draft PR 469 stacked on PR 468.
- 2026-11-04: mutations W1 to W15, R1 to R6 all red (W12 first survived; a defence case added); gates run; PR ready.
- 2026-11-04: rebased onto 468's new head 3cc4d9efb (main 2801e7482); only the map conflicted (regenerated).
  typecheck 0, db:check 0, contract+unit 42/42, `payouts-wise-export` 11/11 on PG16.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

[PR 469](https://github.com/itsahmeds/flowers-overseas/pull/469), stacked on PR 468 (TASK-365) and PR 467 (TASK-364); no migration. `src/modules/partners/payouts/export.ts`: `minorToDecimalString`, `csvCell`, `wiseCsv`, `createWiseExport`, `wiseExportFile`, `cancelExport`, `markPaid`, `markExportPaid`, `readWiseExportFile`, `wiseCsvResponse`; route `GET /admin/api/payouts/exports/[exportId]` behind `payouts.manage`. Tests: contract 4 (`wise-batch-csv`), unit 28 (`payouts-wise-csv`) + 10 (`payouts-wise-export-route`), integration 11 (`payouts-wise-export`, local PG16). Gates: typecheck 0, lint 0, db:check 0, check:no-db 0, codebase:map --check 0; format:check, i18n:check and tests 1 on main's known reds only. No `next build`, Playwright or Lighthouse (tonight's rules), so the AC-26 e2e is carried to TASK-367.
