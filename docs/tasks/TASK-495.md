# TASK-495 — Risk after routing and records: early fraud warnings by order state, the `risk` outbox target, fraud-dispute blocklisting, `buildEvidencePack` (PDF), `docs/runbooks/fraud-review.md` with Radar rules R1 to R10 and the rule test, the LIA, RoPA rows, the privacy-page requirement, the no-PII log suite

Row: `TASKS.md` → TASK-495. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-495`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Spec 021 approved by the founder on 2026-10-24 ("specs ok", on every open-question default); build from the spec text, its amendments and the boards on `main`.
- **No review steps (founder 2026-10-22).** No reviewer or breaker agent runs, and no mutation proofs or breaker cases are asked for. The PR description carries the owned AC list: each AC id with the file and the test that proves it. Paste the `pnpm gates:cheap` block.
- Countries are data, never code per country; nothing reads IP, `cf-ipcountry` or `Accept-Language` to decide what to show (ADR-0006). Order status only through `orderService.transition` (ADR-0009). Money in integer minor units with an ISO currency. New keys ship `reviewed: false`; no em dash in any key, text or comment.
- **ACs owned:** AC-26, AC-27, AC-28, AC-32, AC-34, AC-37.
- **After routing:** early fraud warnings handled by order state per §5.2's table (`routed` cancels with `fraud_confirmed`; `accepted` retries once `paid`; `paid` opens a `post_routing` review); the `risk` outbox target; a `fraudulent` dispute blocklists the email and card hashes (`source = 'dispute'`) and supersedes open reviews; `product_not_received` writes nothing.
- **Evidence pack** `buildEvidencePack`: A4 PDF on spec 018's renderer (TASK-342), at most 4.5 MB and 19 pages, from immutable records, for the founder to upload in Stripe by hand (§13 Q8).
- **Records (§12 task 5):** `docs/runbooks/fraud-review.md` with Radar rules R1 to R10 verbatim between the markers AC-37's test reads (only spec 013's six metadata keys; no `Block` rule on card country, IP country or a country list), `docs/compliance/lia-fraud-prevention.md`, the RoPA rows of §8, the spec 041 privacy-page requirement, `.env.example` (`RISK_HASH_KEY`), the no-PII log suite over every path, codebase map.
- The founder enters the Radar rules once the Stripe account exists (§12 founder actions).

## Read

- `specs/021-fraud-prechecks.md`: `## 0. Index` first, then §2 E, F, G; §5.2; §8; §9 AC-26 to AC-28, AC-32, AC-34, AC-37; §11; §12
- `docs/codebase-map.md`: where everything lives
- `src/modules/payments/disputes.ts`, `src/modules/payments/webhooks.ts`, `src/modules/invoices/` (PDF renderer)
- `docs/compliance/ropa.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.
- **From TASK-494 (2026-11-11), taken here:** EFW storage for D2 (read from the provider, below),
  the post-routing review on a `paid` order ("Keep the order", "Refund in full", the deadline
  refund `auto_refunded`), the evidence pack button on the Risk card, the site velocity alert and
  the daily counter line, fraud-dispute blocklisting and the `risk` target. All built.
- **Left by TASK-495 (2026-11-11):**
  - `webhook.process` has no job handler yet (TASK-266 wires it with the production provider);
    it must pass `earlyFraudWarning: earlyFraudWarningHandler` (exported by `src/jobs/handlers.ts`)
    to `processWebhook`. Until then an EFW row waits in the inbox like every other webhook.
  - Spec 041's privacy page (TASK-183 is `done`): the paragraph below needs a new task row.
  - Pre-pay refusals are logged (`risk.prepay_refused`) but not stored, so the daily counter line
    counts assessments, reviews and pauses only.
  - Not run locally: the evidence route's rendered download in a browser, T-38 visual and axe of
    the "Keep the order" and "Refund in full" dialogs and the Risk card button.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **Deviations (2026-11-11, implementer, no question needed):** (1) `efwReceived` (D2) is read from
  the provider (`listEarlyFraudWarnings` on the intent) rather than a stored copy, so no migration;
  (2) the evidence read is audited as `order_evidence.viewed` (the database's view function accepts
  only `*.viewed` actions; spec text says `order.evidence`); (3) AC-37 checks rule metadata against
  spec 013's current intent keys (`INTENT_METADATA_KEYS`, seven since the basket amendment; R8's
  `is_first_order` is in both); (4) R10 is two rules, R10a and R10b, entered only once spec 013
  sends the buyer's email on a Customer object.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-11: `admin-scans` green again (3 reds on main): `partnerContractsHref` in `src/modules/admin/partners.ts` replaces the literal in `src/jobs/handlers.ts`; `src/jobs/basket-reminders.ts` allowed as an admin importer (worker only); 168 `admin.orderActions.*` meta rows added `reviewed: false` (TASK-361 shipped none), 2 obsolete rows dropped; the format scan gains the 32 missing values. Next: EFW handling.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR #539. No migration. **After routing:** `handleEarlyFraudWarning` acts by order state through
`webhook.process` (cancel with `fraud_confirmed` and blocklist `efw` before acceptance;
`ORDER_IN_HANDOVER` retry while `accepted`; a `post_routing` review with deadline
`productionStartAt − 60 min` on `paid`, refunded in full with `fraud_confirmed` at the deadline or
at once under 30 minutes; a review with no deadline and `risk.efw_after_routing` from
`in_production`; nothing on chargeback, cancelled or refunded orders). The gate's D2 reads the
provider's warnings. The `risk` outbox target blocklists a `fraudulent` dispute's email and card
(`source = 'dispute'`) and supersedes open reviews; other reasons write nothing. A post-routing
review on a `paid` order shows "Keep the order" and "Refund in full" (balance refund, `risk_cancel`).
`buildEvidencePack` (A4, Noto Sans, tagged, 12 pt, from immutable records) behind
`GET /admin/risk/evidence/[orderId]` (`risk.evidence`, `no-store, private`, attachment, one
`order_evidence.viewed` audit row, nothing stored), linked from the Risk card. `risk.monitor` adds
`risk.velocity_site` (once per burst) and the `risk.daily` lines. **Records:** runbook with R1 to
R10 between the markers, LIA, RoPA rows 23 and 24, `.env.example` already holds `RISK_HASH_KEY`.
**Tests:** integration `risk-after-routing` 24 (T-26, T-27, T-28 data half, T-32, velocity, daily);
contract: the provider suite's EFW case (fake and Stripe emulator) and the adapter's EFW lookup and
fixture parse; unit `risk-radar-rules` 6 (T-34, T-37 with mutations), `risk-evidence-route` (403,
headers, one read row); count updates in `outbox-dispatcher`, `admin-scans`, `payment-provider`.
**First commit:** `admin-scans` was red on main (3 cases): fixed as in Progress. Admin copy: 57 new
keys `reviewed: false`, recorded with `.claude/state/record-approval-495.py`.

### Requirement on spec 041 (privacy page)

Spec 021 §8 and §12 (AC-34): the privacy page gains (1) a fraud-prevention paragraph: card payments
are checked for fraud using keyed hashes of the email, the card and the delivery address, kept 12
months (the address 90 days); some orders are checked by a person before a florist is asked; an
order may be cancelled and refunded in full automatically when the bank reports the card as stolen
or the email or card disputed a payment with us before; anyone can ask a person to look at the
decision by phone or WhatsApp (Art. 13(2)(f)); and (2) in the recipient section, the sentence that
in a card dispute the recipient's name, delivery address and delivery photo go to Stripe and,
through it, to the card network and the issuing bank. TASK-183 is `done`, so this needs a new task
row; the text goes through spec 041's legal-draft and lawyer path (§13 Q12).
