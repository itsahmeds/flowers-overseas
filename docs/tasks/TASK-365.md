# TASK-365 — Spec 030a lines, adjustments and statements: `addManualLine`, `removeManualLine`, `resolveReview`, `settleAdjustment`, `waiveAdjustment`, `sendStatement` with its refusals and `P-NNNNNN` numbering, the `payouts.statement_email` job, the statement PDF on spec 018's PDFKit setup and the email in en, pl and de

Row: `TASKS.md` → TASK-365. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-365`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (b) (work order `wo-1022-common.md`). Size L. Merges after: TASK-364, TASK-331, PR 338 (design).
- Spec 030a §2.4 (adjustments, manual lines, frozen lines), §2.5, §5.2 (commands, `sendStatement`, the statement job), §5.3 (the florist statement), §7, §12 task 2. Owns AC-16 to AC-23.
- The statement is a payout statement, not an invoice: no VAT figure (§13 Q1, Q2 defaults). No recipient, buyer, card message, retail price or token on it. Keys `email.floristPayoutStatement.*` in en, pl, de, `reviewed: false`; the `pl` text is reviewed by a native speaker before the first live statement (founder).
- **Built from the merged artboards** of PR 338 (`florist-payout-statement-pdf`, `email-florist-*`); match them pixel for pixel. If the board you need is missing, stop and escalate; never build a page from the description alone.
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself:** each `sendStatement` refusal in order; two sends (consecutive numbers); direct SQL on a sent payout's lines for all three verbs; adjustments created at 23:59 and 00:01 local around `period_end`; a prepaid payout with an open adjustment; the statement job re-run (one email); distinctive recipient and buyer strings absent from email and PDF text; the VAT pattern scan (`%`, `VAT`, `PTU`, `MwSt`).
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Copy: never `reviewed: true` (the founder's act). Keys under `checkout`, `orderConfirmation`, `orderTracking`, `florist`, `admin`, `demo`, `dev`, `email` may be added `reviewed: false`; any other new key text is reported in the PR for the founder's batch (spec 003 §14 A17).
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.

## Read

- `specs/030a-florist-payouts.md` §2.4, §2.5, §5.2, §5.3, §7, AC-16 to AC-23
- `docs/tasks/TASK-342.md` (PDFKit), `TASK-331.md` (pipeline)
- `docs/codebase-map.md` (where everything lives); `.claude/state/wo-1022-common.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

- 2026-11-04 (self-review, PR 468): **partial.** AC-21, AC-22 and AC-23 (the
  `payouts.statement_email` job, the statement PDF and the florist email in en, pl and de) are
  not built: see Escalations. `sendStatement` enqueues `payouts.statement_email { payoutId }`
  (registered, `short`, keyed by payout) and the job has no handler yet, so a sent statement's
  email waits in the queue; nothing calls `sendStatement` in production until TASK-367's pages.
- 2026-11-04: `fo/no-direct-review-write` reported `UPDATE payout_line SET reviewed_at` (spec
  030a's founder review pair shares the column names of spec 012b's copy review). The rule now
  exempts an `UPDATE` whose target is exactly `payout_line` (`EXEMPT_UPDATE_TABLES`), with tests;
  an `INSERT` naming a review column and every other table stay reported. Flagged for the
  orchestrator: a lint-rule scope change, not a disable.
- 2026-11-04: refusal codes the spec does not name, chosen here: `PAYOUT_NOT_FOUND`,
  `PAYOUT_LINE_NOT_REMOVABLE` (an order line, or a settled adjustment's line),
  `PAYOUT_REVIEW_NONE` (resolve on an unflagged line), `PAYOUT_STATEMENT_NUMBER_EXHAUSTED`
  (beyond P-999999). TASK-367's admin copy needs a message for each.
- 2026-11-04: every command writes one `audit_log` row (`payout.line_added`, `.line_removed`,
  `.review_resolved`, `.adjustment_settled`, `.adjustment_waived` with the reason in
  `audit_log.reason`, `.statement_sent`); the `payout` tables are not under
  `audit_row_change()`. TASK-367's actions must check `payouts.manage` and run them under
  `withAdminContext`.
- 2026-11-04: red on main and here alike, untouched: unit `url-pii`, `zod-boundaries`,
  `home-honesty`, `deferred-set`, `catalog-product-view*`; `format:check` (email snapshots);
  `i18n:check` (`nav.send`, `nav.category.ourSelection`).

- 2026-11-04 (self-review, PR 475): carry-forwards. (a) The PDF and email were built from the
  artboards' structure and copy, but no pixel comparison of the PDF against
  `florist-payout-statement-pdf.dc.html` was run (no visual gate tonight). (b) The `pl` and `de`
  statement copy is a machine draft (`source: machine`, `reviewed: false`); the `pl` text needs a
  native reader before the first live statement (§12). (c) `deleteReminder` stays the lawyer's to
  confirm (§13 Q12). (d) `tests/unit/jobs-runtime.test.ts`'s production-map case times out at 5 s
  under load average 11 to 15 on this branch and on PR 468 alike (it imports the whole worker); it
  passes with `--testTimeout=60000`. (e) The admin "open the PDF" signed link is TASK-367's.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- 2026-11-04 (builder P364 to the orchestrator): AC-21 to AC-23 need (1) spec 018's PDFKit
  renderer, which TASK-342 creates in PR 465 (draft, `src/modules/invoices/pdf/render.ts`, fonts
  under `src/modules/invoices/pdf/fonts/`); the row says "whichever lands first creates it and the
  other imports it", and PR 465 is first, so building a second renderer here would fork it; and
  (2) an attachment on spec 016's `Mailer` (`MailMessageSchema` has no attachment field, and PR
  465 does not add one). Conservative reading taken (delegated by the orchestrator's work order):
  build everything that does not need either, leave the job without a handler, and finish AC-21
  to AC-23 in a follow-up once PR 465 merges, adding the Mailer attachment there. **Answered
  2026-11-04** (orchestrator's work order to builder P2): PR 465 merged; build AC-21 to AC-23 as a
  new PR. Spec 030a AC-21 requires the PDF *attached*, so no signed link was considered; the
  `Mailer` gains an optional attachment (decided under the orchestrator's delegation, see below).
- 2026-11-04 (builder P2, decided under the orchestrator's delegation, conservative readings):
  (1) `MailMessageSchema.attachments` (1 to 3 files, base64, `application/pdf` only, a plain file
  name), sent as Resend's `attachments[]`; the capturing mailer keeps them. (2) The statement
  `media_asset` row is `kind = 'partner'` (migration 0004's comment names the payout statement
  PDF as a `partner` asset), `source = 'partner'` and `depicts = 'context'`: the closed value lists
  have no "document" value and the spec lists no schema change, so none was made. (3) The copy
  namespace is `emails.floristPayoutStatement.*`: the catalogue's email namespace is `emails`
  (the spec's `email.` prefix names it). (4) "The country default" language is data,
  `STATEMENT_LANGUAGE_BY_COUNTRY` in `src/config/payouts.ts` (PL `pl`, DE and AT `de`, else `en`):
  no table carries a country's language. (5) The statement email and PDF live in
  `src/modules/notifications/emails/` (the template registry, the florist frame and the copy are
  there, and no barrel may carry email copy); the worker hands the PDF renderer to
  `runStatementEmailJob` (`renderPdf`), so the `partners` module imports no email internals. All
  five are `open` for the founder only if he wants another reading.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-04: stacked on PR 467 (TASK-364, not merged). `manual.ts` (`addManualLine`,
  `removeManualLine`, `resolveReview`), `adjustments.ts` (`settleAdjustment`, `waiveAdjustment`),
  `statement.ts` (`sendStatement`, `statementNumber`), `audit.ts`; job `payouts.statement_email`
  registered without a handler; the review-write lint rule scoped. Integration
  `payouts-statements` 19 green, unit `payouts-statement-number` 12, 17 mutations red. Next: AC-21
  to AC-23 after PR 465 (see Escalations).
- 2026-11-04: rebased onto 467's new head f1460f07b (main 2801e7482 with TASK-342's invoice jobs); jobs index
  and registry test keep both (27 job names). typecheck 0, db:check 0, units 72/72, `payouts-statements` 19/19 on PG16.
- 2026-11-04: AC-21 to AC-23 built on branch `task/TASK-365-statement-pdf` (PR 475, stacked on
  PR 468 until it merges): Mailer attachments, the `FS` rule and `sendPayoutStatementNotification`,
  the statement view, words, email and PDF (`notifications/emails/payout-statement*.ts`), the job
  (`partners/payouts/statement-email.ts`) and its handler, copy in en, pl, de (`reviewed: false`).
  Tests: integration `payouts-statement-email` 3, unit `payouts-statement-document` 10, contract
  `resend-mailer` +4; 10 mutations each red.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR 468 (partial; stacked on PR 467). AC-10 (statement half), AC-16 to AC-20 built and proven:
manual lines with the total kept by the database, removals, the review flag, settle into the open
weekly payout (created for a per-order florist too) and waive with an audited reason, and
`sendStatement` with its five refusals in order, `P-NNNNNN` numbers from the sequence and the
email job enqueued. Tests: integration `payouts-statements` 19 (T-10, T-16 to T-20); unit
`payouts-statement-number` 12, `no-direct-review-write` +1, registry files. Not built: AC-21 to
AC-23 (statement email, PDF, en/pl/de copy), escalated above.

PR 475 (TASK-365 remainder, AC-21 to AC-23): the `payouts.statement_email` handler renders the
statement PDF on spec 018's setup (tagged, `/Lang`, PDF/UA, A4, the invoice's embedded Noto Sans
via `invoiceFonts()`), stores it private at `payouts/{yyyy}/{payoutId}.pdf` as a `media_asset`,
sets `statement_media_asset_id` and sends the florist email with the PDF attached through spec
016's pipeline (`job:payouts.statement_email:{payoutId}`, `florist-payout-statement`, the florist's
id), in the earliest owner's language else the country's; a re-run sends nothing. Tests:
integration `payouts-statement-email` 3 (T-21, T-22 on a real order), unit
`payouts-statement-document` 10 (T-22, T-23), contract `resend-mailer` 16 (+4), `notifications-rules`
and `jobs-runtime` updated. No build, e2e, visual or Lighthouse run (founder rule tonight).
