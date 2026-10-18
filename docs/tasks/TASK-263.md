# TASK-263 — Spec 013 confirmation states for `test` and `live`: §5.3's projection for all 26 statuses, "Thank you. We have your order." with the arrival line, the cancelled and refund notices keyed on the actor class, no edit or checkout link after placement, spec 018's block through `getConfirmationBlock`

Row: `TASKS.md` → TASK-263. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-263`; keep it current by editing this file, not the row.

## Binding

- Owns **AC-6, AC-46, AC-47**; tests T-06, T-46, T-47. Ships in TASK-262's feature PR (same agent).
- **This spec owns the confirmation page's `test` and `live` states** (spec 010 §14 A2); spec 018 supplies its post-purchase block and the quiet cancel foot line through `getConfirmationBlock` (spec 018 is approved, not planned: render the seam empty until it lands; AC-46's order content then has no cancellation wording at all).
- **No negative framing (AC-46):** in `paid_unrouted`, `routed`, `accepted`, `paid` and `in_production` the order content contains no "refund", "cannot deliver", "could not deliver" or "If we" when no refund row exists; `no_partner_available` and `manual_reroute` render identical to `routed` apart from ids and amounts; no state renders a cancellation reason; `payments.confirmation.held` and `.paidNow` exist nowhere.
- **No edits (AC-47):** no "Change"/"Edit", no link to a checkout step URL, no `<form>` but spec 018's cancel action.
- **Copy:** new `payments.*` keys ship `reviewed: false`; register the `payments` namespace in `src/modules/i18n/review-scope.ts`'s `NON_INDEXABLE_SCOPE` (checkout surface) in the PR that adds the keys, so en-gb's unreviewed share (zero headroom) does not move; no agent sets `reviewed: true` (spec 003 A17 clause 5).
- **Design source of truth:** `docs/design/wireframes/checkout-{desktop,mobile}.dc.html` and `confirmation-{desktop,mobile}.dc.html` (PR 218), `system/components.dc.html`, `flows/buyer-journey.dc.html`; match them pixel for pixel; no held state anywhere.
- **The founder's rulings in spec 013 §14 bind every line:** charge at once (`capture_method: 'automatic'`, no override, no hold for any method; A6 rows 1 and 15 are never written; no lapse job); no buyer surface says or implies partners, florists accepting, offers, re-routing or a held card (`RELAY_PATTERNS`/`RELAY_EXEMPT`/`relayMatches` already exist in `src/config/honesty.ts`: use them, keep no list of your own); no refund, failure or "if we cannot deliver" wording on a paid confirmation state; no edits after placement.
- **No Stripe account exists yet** (the founder opens it after flowersoverseas.com is live; spec 013 §12 founder actions 1 to 8). Build and test against `FakePaymentProvider` and MSW-served recordings (`onUnhandledRequest: "error"`); no key, no network call to Stripe, in any test this task owns.
- **Every order write goes through spec 010's engine** (`orderService.transition`/`appendEvent`, TASK-202); never `UPDATE orders SET status` (ADR-0009). Money is integer minor units plus a currency; no exported function takes a charge amount (AC-9).
- **Class:** not review-only (`CLAUDE.md` DoD §4; spec 013 §12 "Review class"): money, order status, payments or webhooks. `/review` and `/break` both run.
- Never use `.env.local`'s `DATABASE_URL*` (Neon production); integration tests run on a throwaway local PG16 (`wo-1018-common.md`).

## Read

- `specs/013-payments-order-state-machine.md`: `## 0. Index` first, then only the sections and ACs named here
- `docs/codebase-map.md` (where everything lives); `docs/tasks/TASK-202.md` (the order engine this spec calls)
- `specs/013-*` §5.3 (confirmation, projection table, what it says, no edits), §7, Appendix A; `specs/002-schema-v1.md` §14 A6.4, A9.1
- `specs/018-tracking-account.md` (the block's seam); `docs/tasks/TASK-206.md`

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
