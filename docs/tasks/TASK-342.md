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

- 2026-11-04 builder I342 (self-review, left for later):
  - Invoice link expiry: the spec is silent on the TTL, so the caller that mints the link (spec 016's emails, TASK-334) chooses it; `invoiceDownloadPath` refuses no expiry.
  - Founder step: `R2_PRIVATE_BUCKET` must be set in Railway (with the R2 keys already there); until it is, a render job fails with `INVOICE_STORAGE_UNCONFIGURED`, retries, and alerts `invoice.render_dead` / `invoice.render_overdue`.
  - The `invoice` copy (en, de, pl) needs exact-text approval under the delegation and the native review (meta: en `human`, de/pl `machine`, all unreviewed; in the review scope as an email surface).
  - Wireframe deviation: lines print gross only (the gross method, VAT Act art. 106e(7)-(8)); net and VAT print per rate. The snapshot has no per-line VAT and no payment method, so no per-line net column and no "card" word.
  - RoPA entry for the stored invoices: TASK-343. Owner-session download half: TASK-344. `invoice.email` handler: TASK-334 (its jobs wait until then).
  - A paragraph mixing RTL and LTR runs is laid out with a base direction of LTR (PDFKit has no bidi); single-script RTL names read correctly.
  - No `pnpm invoices:render` script: the minute sweep re-asks every unrendered document; the runbook says so.
  - Under load above ~15, the existing `jobs-internal` / `jobs-runtime` handler-import tests can time out at 5 s on main as well (2.1 s each at load 13); not changed here.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- 2026-11-04 builder I342: TASK-341's `issueInvoice` (`src/modules/invoices/issue.ts` ~L119) and `issueCreditNote` (`credit.ts` ~L91) read `payment.order_id`, which migration `0026_payment_purchase` dropped. On main every live capture's `invoices` outbox delivery fails (dead deliveries, alerts) and `tests/integration/invoices*.test.ts` from TASK-341 fails 13/13. Not fixed here (another task's scope); this PR's integration suite writes invoice rows by SQL instead. Needs a new task row. To: orchestrator. `open`.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-04 builder I342: worktree `fo-wt-342`, branch `task/TASK-342-invoice-pdf` off main c216700cc. Next: PDFKit and Noto Sans, the renderer, NBP adapter, render job, getters, download route, runbook.
- 2026-11-04 builder I342: renderer (`src/modules/invoices/pdf/`), NBP adapter (`nbp.ts`, plugged in `src/jobs/handlers.ts`), render job + minute sweep + `invoice.email` enqueue + readers (`delivery.ts`), signed download (`download.ts` + route), jobs registry (`invoice.render` exclusive x5, `invoice.render_sweep`, `invoice.email`). Next: unit and integration tests, runbook.
- 2026-11-04 builder I342: unit suites (`invoices-pdf` 17, `invoices-nbp` 8, jobs registry/runtime/internal updated) and integration `invoices-pdf` (10) green on a local PG16. Found: TASK-341's `issueInvoice`/`issueCreditNote` read `payment.order_id`, dropped by `0026`; its suite fails 13/13 on main (escalated below). Next: runbook, mutations, gates, PR.
- 2026-11-04 builder I342: runbook `docs/runbooks/invoices.md`; review-scope entry for the `invoice` namespace; rebased on origin/main 7bad92299 (kept TASK-363's `payouts.prepaid_ready` beside the invoice jobs, registry size 24; meta manifests union-merged with TASK-339's keys); `invoice` added to the typed-namespace list and its 32 English keys to the founder's pinned review queue; 14 mutations each red; PR 465 ready.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR https://github.com/itsahmeds/flowers-overseas/pull/465. The invoice PDF (PDFKit 0.20.2, tagged, `/Lang`, PDF/UA identifier, embedded Noto Sans subset plus Hebrew and Arabic faces, A4, bilingual labels, gross-method table, PLN block at the stored NBP table A rate), the NBP adapter (14-day window ending the day before the tax point, newest table, exact digits), `invoice.render` (exclusive, 5 attempts, `invoice.render_dead`), the minute `invoice.render_sweep` (`invoice.render_overdue` at 15 minutes), private-bucket storage at `invoices/{yyyy}/{id}.pdf` with sha-256, `getPdfByInvoiceId` / `getIssuedPdf`, the live-only `invoice.email` enqueue, the signed `/{locale}/account/invoices/{invoiceId}?t=` download, and `docs/runbooks/invoices.md`. Tests: unit `invoices-pdf` 17 and `invoices-nbp` 8 new; jobs registry, runtime, internal and i18n-messages updated (104 green across the 7 touched unit files); integration `invoices-pdf` 11 on local PG16. No build, e2e, visual or Lighthouse run (founder rule: no CI tonight). New dependencies: `pdfkit` 0.20.2, `@types/pdfkit` 0.17.7 (dev). Handed on: see Carry-forwards and Escalations.
