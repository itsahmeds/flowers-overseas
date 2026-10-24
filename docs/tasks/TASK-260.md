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

- **From `/plan-tasks` (b) (2026-10-22):** spec 010 §14 A-founder-2026-10-22 item 13 (d): a dispute on the purchase's one charge applies row 34 to every order of the purchase in set C, and the outside-machine alert for the rest.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- 2026-10-24 (implementer, to the orchestrator; `open`). AC-24's last two recorded sequences (`refund.updated` before `charge.refunded`; `charge.dispute.closed` before `charge.dispute.created`) need TASK-261's refund and dispute paths, which do not exist yet. Here those types are stored, routed and left `ignored` with `awaiting_handler` (re-processable with `--inbox-id`), and the two payment-intent sequences are proved. Recommended: TASK-261 owns the refund and dispute halves of AC-24 and replaces `awaiting_handler` with its routes. No live event can arrive before TASK-266/267 (no Stripe account).

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-24: done on PR 410 (stacked on PR 405, which is stacked on PR 403). `webhooks.ts` (ingest, process, replay, the Stripe endpoint and replay bodies), `POST /api/webhooks/stripe`, `POST /api/internal/payments/replay-webhooks`, `pnpm jobs:replay-webhooks`, job `webhook.process` (registered; its handler waits for the Stripe key, TASK-266), env keys `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` (optional, 503 without them), the AC-27 fixture scan. Integration 14 cases green on PG16; mutations W1, W2, W4, W5, W6, W8, W9 red.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR 410. Tests: integration `payments-webhooks.test.ts` 14 cases (AC-21 200/400/400/400/413 with row counts, the exact 1 MB cap; AC-22 enqueue after commit, store failure 500, enqueue failure 500 with the row kept and asked again on retry, the endpoint's 503 and declared-length 413; AC-10 livemode mismatch; AC-23 twice in sequence and concurrently: one row, one run, one `order.captured` per order, one intent retrieval; AC-24 the two payment-intent sequences equal in-order runs with the stale one `ignored`/`stale`; AC-25 unknown type, unknown object, schema failure to `dead` on attempt 8 with one `webhook.dead`, provider outage retried; AC-26 replay, second run zero, `--inbox-id`, `--dry-run`, the replay route's 400/503/200/404); unit `stripe-fixtures-pii.test.ts` (AC-27), `jobs-replay-webhooks.test.ts`; env, Railway and job-registry counts updated. Handed on: refund and dispute event routing (AC-24's other two sequences) to TASK-261; the `webhook.process` handler with the production provider to TASK-266; the founder declares `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` (empty until keys exist) in Railway so `pnpm railway:check` stays clean.
