# TASK-334 — Spec 016 the invoice rides B1, and the B8 job: B1's bounded wait for the issued invoice PDF (`B1_INVOICE_WAIT` 5 minutes, `INVOICE_PENDING` retry, `attached_invoice_id`), the `invoice.email` handler (credit notes always, an invoice only when B1 went without it, live only)

Row: `TASKS.md` → TASK-334. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-334`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (work order `wo-1022-common.md`). Merges after: TASK-331, TASK-333, TASK-342.
- Spec 016 §5.2 "B8 handler" and "The invoice rides B1" (§14 A-founder-2026-10-14b). AC-37, AC-43.
- B1 retries with `INVOICE_PENDING` at most 5 minutes after `order.captured`; after that, or at once when `invoice.issue` is off for the destination, B1 goes without the invoice and reads "Our terms are attached.". B8 for an invoice waits for B1 to be `sent` or later, then sends nothing if B1 carried it.
- `test` and `demo` orders send nothing; a document with no stored PDF throws so the job retries.
- **ACs owned:** AC-37, AC-43 (T-37, T-43).
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself (the breaker's list for this row):** render delay 2 minutes, 4:59, 5:00 and 6 minutes on an injected clock; `invoice.issue` off for PL; B1 still `queued` when B8 runs; the job run twice; a credit note on an order whose B1 carried the invoice (sent); `B1_INVOICE_WAIT` set to 10 minutes in test config turns the 6-minute case red. Mutate each AC's subject and watch its case go red before you claim it.
- **Founder rulings bind every line** (spec 016 and 018 §14): every payment is captured at placement; no buyer surface, email, PDF or copy key says or implies partners, a florist accepting, offers, re-routing or a held card (`RELAY_PATTERNS`, `RELAY_EXEMPT`, `relayMatches` in `src/config/honesty.ts`: use them, keep no list of your own); no refund or failure wording after payment except the cancellation and refund messages; no em dash in any copy.
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.

## Read

- specs/016: §5.2 B8 handler and B1 invoice rule, §9 AC-37, AC-43, §10 T-37, T-43
- specs/018 §5.2 `invoices` module; `docs/tasks/TASK-342.md`
- `docs/codebase-map.md` (where everything lives); `.claude/state/wo-1022-common.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **2026-11-04, builder N334 (self-review, PR 482), left for later:**
  - **The wait is bounded by the dispatcher's next due time, not stretched to 5:00 in production.**
    B1 throws `INVOICE_PENDING` only while its next retry (`OutboxHandlerContext.retryDueAt`, the
    dispatcher's own backoff, 30 s doubling) is due by the deadline; otherwise it sends now with
    what is stored. With the production backoff a purchase still waiting is sent by its fourth
    attempt (about 3.5 minutes plus one minute tick), so an invoice stored between that attempt and
    5:00 goes by B8, not B1. Under the injected clock (base 0, as the dispatcher suites run) B1 is
    sent at exactly 5:00. A retry *due* by 5:00 still runs at the next minute tick, so the send can
    lag a due time by up to 60 s. Holding B1 to the full 5 minutes would need a per-delivery
    `not_before` on `outbox_delivery` (a migration the spec does not list): founder's call.
  - **`invoice.email` retries 15 times, one per minute tick** (`INVOICE_EMAIL_RETRY_LIMIT`), which
    outlasts B1's wait. While `notifications.email` is off (today) the job throws
    `NOTIFICATIONS_HELD` and dies after about 15 minutes, so a **credit note** issued while the
    switch is off is never emailed (an invoice is fine: the held B1 carries it once the switch is
    on). AC-26's "the job retries" needs a sweep that re-enqueues unsent documents, or a longer
    policy: TASK-331's area, not built here.
  - B1 waits for every order whose destination has `invoice.issue` on, even when spec 018's issue
    refused silently (no profile, issuer incomplete): such a B1 waits the full bound, then goes.
  - Resend's `409 invalid_idempotent_request` on B1 writes no `notification_delivery_invoice` row
    (the accepted first send may have had another body), so B8 sends the invoice: a possible second
    copy, never a missing one.
  - Download-link expiry (TASK-342's hand-on): B1 and B8 **attach** the stored PDF and mint no
    download link, so no TTL is chosen here (the most conservative reading).
  - The integration suite's render is a stand-in (bytes put in an in-memory private bucket with
    their SHA-256 and the three render columns written, exactly what `renderInvoice` stores); the
    real PDF and its `invoice.email` enqueue are `invoices-pdf.test.ts` (TASK-342).
  - AC-46 (the per-purchase case: three invoices, plural text, one late B8) is exercised by the
    two-delivery breaker cases but not claimed: no `TASKS.md` row owns spec 016 AC-44 to AC-49 that
    this builder could find.
  - Touches spec 013's dispatcher additively (`retryDueAt` in the handler context and the pure
    `outboxRetryDueAt`); no behaviour of the dispatcher changed.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-04 N334: B1's bounded wait (`emails/invoice-wait.ts`), the link rows in `pipeline.ts`,
  the `invoice.email` job (`emails/invoice-email.ts`), `retryDueAt` from the dispatcher, the worker
  wiring and `INVOICE_EMAIL_RETRY_LIMIT`; pushed a7d03f73e, draft PR 482.
- 2026-11-04 N334: unit `notifications-invoice-wait` (8) and integration `invoice-email` (15) green
  on a local PG16; 14 mutations, each red; RoPA row 13 and the invoices runbook updated.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR https://github.com/itsahmeds/flowers-overseas/pull/482. B1 waits at most `B1_INVOICE_WAIT`
(5 minutes, `src/config/notifications.ts`) after the purchase's first `order.captured` from
`placed` for the stored invoice PDF of every order whose destination has `invoice.issue` on,
throwing `INVOICE_PENDING` while its next retry is still due within the wait; it then sends with
the stored PDFs (read through spec 018's `getPdfByInvoiceId`, hash checked) and the pipeline writes
one `notification_delivery_invoice` row per invoice carried. The `invoice.email` job
(`runInvoiceEmailJob`) sends B8: nothing for a `test` or `demo` order, a retry while the PDF is not
stored or the purchase's B1 is absent or `queued`, nothing when B1 carried the invoice, one keyed
send otherwise (credit notes always). Tests: unit `notifications-invoice-wait` 8 (new),
`jobs-registry` and `jobs-runtime` pins; integration `invoice-email` 15 (new: T-37, T-43 and the
breaker's cases), and `email-buyer` 4, `notifications-pipeline` 12, `outbox-dispatcher` 8 re-run
green. 14 mutations, each red. No migration, no build, Playwright or Lighthouse (founder rule
tonight). Handed on: see Carry-forwards.
