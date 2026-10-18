# TASK-260 — Spec 013 webhook inbox: `POST /api/webhooks/stripe` (signature, 300 s tolerance, 1 MB cap, store before process, 200 after commit), idempotency by event id, `webhook.process` with out-of-order handling, `livemode` mismatch ignored, `pnpm jobs:replay-webhooks`, the recorded fixtures

Row: `TASKS.md` → TASK-260. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-260`; keep it current by editing this file, not the row.

## Binding

- Spec 013 §12 task 4. Owns **AC-10 (event half: a verified event whose `livemode` differs is stored `ignored` with `livemode_mismatch` and moves nothing), AC-21 to AC-27**; tests T-10 (event half), T-21 to T-27.
- Route is thin (`src/app/api/webhooks/stripe/route.ts` → `payments.ingestStripeWebhook()`); the raw body, signature and secret never reach a log (AC-32 is TASK-265's suite, but nothing here may emit them).
- Out-of-order cases are AC-24's four recorded sequences; each stale event is `ignored` with `stale`. Unknown type: 200 and `ignored`; schema failure: `failed`, retried, `dead` after 8 with `webhook.dead`.
- Fixtures under `tests/contract/fixtures/stripe/<api-version>/`, directory name equal to the adapter's pinned version, no email or phone other than Stripe's documented test values (AC-27).
- The Cloudflare WAF skip for the route is a founder action (§12 action 6), not code.
- **The founder's rulings in spec 013 §14 bind every line:** charge at once (`capture_method: 'automatic'`, no override, no hold for any method; A6 rows 1 and 15 are never written; no lapse job); no buyer surface says or implies partners, florists accepting, offers, re-routing or a held card (`RELAY_PATTERNS`/`RELAY_EXEMPT`/`relayMatches` already exist in `src/config/honesty.ts`: use them, keep no list of your own); no refund, failure or "if we cannot deliver" wording on a paid confirmation state; no edits after placement.
- **No Stripe account exists yet** (the founder opens it after flowersoverseas.com is live; spec 013 §12 founder actions 1 to 8). Build and test against `FakePaymentProvider` and MSW-served recordings (`onUnhandledRequest: "error"`); no key, no network call to Stripe, in any test this task owns.
- **Every order write goes through spec 010's engine** (`orderService.transition`/`appendEvent`, TASK-202); never `UPDATE orders SET status` (ADR-0009). Money is integer minor units plus a currency; no exported function takes a charge amount (AC-9).
- **Class:** not review-only (`CLAUDE.md` DoD §4; spec 013 §12 "Review class"): money, order status, payments or webhooks. `/review` and `/break` both run.
- Never use `.env.local`'s `DATABASE_URL*` (Neon production); integration tests run on a throwaway local PG16 (`wo-1018-common.md`).

## Read

- `specs/013-payments-order-state-machine.md`: `## 0. Index` first, then only the sections and ACs named here
- `docs/codebase-map.md` (where everything lives); `docs/tasks/TASK-202.md` (the order engine this spec calls)
- `specs/013-*` §5.1 item 5, §5.2 (webhook inbox, types list, replay), §8 (security), §11
- `docs/tasks/TASK-255.md`, `docs/tasks/TASK-257.md`

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
