# TASK-342 — Spec 018 invoice PDF and delivery (task 3, part b): PDFKit renderer (tagged, `/Lang`, embedded Noto Sans, A4) from the snapshot and profile, the NBP table A adapter, private-bucket storage with sha-256, `invoice.render` with alerts, the signed `account/invoices/{invoiceId}` download, `getIssuedPdf`, `getPdfByInvoiceId`, the `invoice.email` enqueue, `docs/runbooks/invoices.md`

Row: `TASKS.md` → TASK-342. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-342`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (work order `wo-1022-common.md`). Merges after: TASK-341.
- Spec 018 §12 task 3; §5.2 `renderPdf`, `getPdfByInvoiceId`, `invoice.email`; §7 invoice wording. AC-16 (render half), AC-17 to AC-19, AC-22, AC-23 (link half), AC-37, AC-40.
- Profile switch (`principal/PL` ↔ `agent/PL`) is SQL only; no source file differs (AC-18). No "on behalf of" or fulfilment-party line; we are the seller.
- `getPdfByInvoiceId` reads the private bucket, checks `pdf_sha256`, never renders, exposes no route; throws `INVOICE_PDF_NOT_RENDERED` / `INVOICE_PDF_HASH_MISMATCH`. `invoice.email` enqueued once per document, live only.
- Download: 200 for a valid signed `invoice` link; 404 for no session, a tracking token used as `t`, an expired link (owner session half is TASK-344).
- **ACs owned:** AC-16 (render-columns half), AC-17, AC-18, AC-19, AC-22, AC-23 (signed-link half), AC-37, AC-40 (T-16 render half, T-17, T-18, T-19, T-22, T-23 link half, T-37, T-40).
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself (the breaker's list for this row):** "Zażółć gęślą jaźń" and "Größe" round-trip through text extraction; a Monday tax point selects Friday's NBP rate; a Polish public holiday; one byte flipped in the stored object; a second render write raises `INVOICE_IMMUTABLE`; a relay word added to the template turns the PDF scan red. Mutate each AC's subject and watch its case go red before you claim it.
- **Founder rulings bind every line** (spec 016 and 018 §14): every payment is captured at placement; no buyer surface, email, PDF or copy key says or implies partners, a florist accepting, offers, re-routing or a held card (`RELAY_PATTERNS`, `RELAY_EXEMPT`, `relayMatches` in `src/config/honesty.ts`: use them, keep no list of your own); no refund or failure wording after payment except the cancellation and refund messages; no em dash in any copy.
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.

## Read

- specs/018: §5.2, §7, §9 AC-16 to AC-19, AC-22, AC-23, AC-37, AC-40, §10 matching T
- docs/design/wireframes/invoice-pdf.dc.html
- spec 011 §5.2 private bucket; spec 002 `Storage` seam
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
