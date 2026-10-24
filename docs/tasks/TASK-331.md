# TASK-331 — Spec 016 notification pipeline (task 2): `notificationsFor` as data, the `notifications` outbox handler, send-time address and locale resolution, `notification_delivery` rows, the idempotency key and its 409 rule, `notifications.email` hold, the one-tap florist link, the W rule, logger redaction, and spec 012's two additive changes (`MailMessageSchema.idempotencyKey`, `createSignInLink` with a stored callback)

Row: `TASKS.md` → TASK-331. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-331`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (work order `wo-1022-common.md`). Merges after: TASK-327, TASK-212, TASK-217, TASK-245.
- Spec 016 §12 task 2 (without the invoice wait and B8 job, which are TASK-334); §5.2 "Notifications". AC-14, AC-18 to AC-20, AC-23, AC-26, AC-33, AC-36, AC-39.
- `test` → florist and ops rows only, never a buyer row; `demo` → nothing; no buyer row for any routing event (AC-39). B2 fires on `order.in_production` only, never on `order.captured` from `accepted` (AC-14).
- Delivery row inserted `queued` before `Mailer.send`; a repeat finding `sent` skips; finding `queued` re-sends with the same key; Resend `409 invalid_idempotent_request` marks `sent` with no retry; `409 concurrent_idempotent_requests` and other errors throw to the dispatcher.
- Spec 012 additive changes (spec 016 §12): `MailMessageSchema` gains optional `idempotencyKey` passed as `Idempotency-Key`; the core gains `createSignInLink(surface, userId, { callbackPath })`, callback stored server-side with the hashed token and restricted to `{FLORIST_BASE_PATH}/orders/{uuid}`; a member already signed in goes straight to the callback. Spec 012 AC-9's cases must stay green.
- Env: `OPS_ALERT_EMAIL` in `src/lib/env.ts`, `.env.example`, `config/railway.json`. Open and click tracking stay off (founder action).
- **ACs owned:** AC-14 (moved from task 1b), AC-18, AC-19, AC-20, AC-23, AC-26, AC-33, AC-36, AC-39 (T-14, T-18, T-19, T-20, T-23, T-26, T-33, T-36, T-39).
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself (the breaker's list for this row):** one outbox row handled twice; a job re-run after success; a crash between the `queued` insert and the send; 409 invalid vs 409 concurrent vs a 500; `notifications.email` off then on (three held events, three sends); marker values for buyer email, recipient name, phone and street absent from every row, log line and Sentry event; a used, an expired and a reused one-tap token; a URL containing `@`; WhatsApp partner vs email-only partner for V1, V2, V4, V5. Mutate each AC's subject and watch its case go red before you claim it.
- **Founder rulings bind every line** (spec 016 and 018 §14): every payment is captured at placement; no buyer surface, email, PDF or copy key says or implies partners, a florist accepting, offers, re-routing or a held card (`RELAY_PATTERNS`, `RELAY_EXEMPT`, `relayMatches` in `src/config/honesty.ts`: use them, keep no list of your own); no refund or failure wording after payment except the cancellation and refund messages; no em dash in any copy.
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.

## Read

- specs/016: §5.2 Notifications and the template table, §9 AC-14, AC-18 to AC-20, AC-23, AC-26, AC-33, AC-36, AC-39, §10 matching T
- specs/012 §5.2 sign-in core and `Mailer`; `docs/tasks/TASK-217.md`; `src/modules/notifications/`
- specs/011 §12 (link design); `docs/tasks/TASK-212.md`
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
