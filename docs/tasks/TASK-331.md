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

- **From `/plan-tasks` (b) (2026-10-22):** spec 020a §12 request 2: the pipeline accepts a `notification_delivery` row created outside the outbox (`source_key = admin:{id}`, `resend_of` set) and renders it from its original's context. Spec 010 §13 Q25 (approved): B1 is sent once per purchase when row 2 is written for its orders; B2 to B6 stay per order; a florist message never names another order of the purchase.

- **From the implementer's self-review (2026-11-02, PR 450), for the tasks that follow:**
  - TASK-332 / TASK-333: register each template with `registerNotificationTemplate(key, renderer)` (`src/modules/notifications/templates.ts`). Until a template is registered its deliveries throw `TEMPLATE_NOT_BUILT`, retry and end `dead` with `outbox.dead`; keep `notifications.email` off in an environment that has live or test orders before they land.
  - TASK-328: the remind and photo-remind jobs call `sendJobNotifications(executor, { job, jobId, orderId, assignmentId })` after their own "still unanswered / still no photo" check; V4 on a timeout is sent by this pipeline on the `assignment.timed_out` event (register its schema with `assignmentId` in the payload; without it the pipeline falls back to the latest timed-out assignment). AC-58's 07:30 part is `offerWindow` deferring `order.route` (no event, no V1 before then); T-58 here covers "in the run, no job, two separate sends".
  - TASK-330: V4 on the four withdrawal events is sent by this pipeline (the open or accepted assignment not withdrawn before the event); the routing handler only sets `withdrawn_at` and writes `payout_adjustment`.
  - TASK-334: B1's invoice wait and the B8 job (`invoice.email` calls `sendJobNotifications` with `invoiceId`).
  - TASK-336: T-23's e2e half (two GETs and a POST through the browser).
  - TASK-360: an admin resend row (`source_key = admin:{id}`, `resend_of`) is not handled here yet.
  - Pre-existing on main, not this diff: `tests/integration/invoices.test.ts` fails on `payment.order_id` (column gone since `0026`), and the AC-12 case of `payments-lifecycle.test.ts` sees a second `outbox.dead` for the `invoices` target its registry stubs as not configured.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- 2026-10-22 (`/plan-tasks` (b), to the orchestrator; `open`). Spec 010 item 13 asks spec 016 for B1 once per purchase; spec 016 has no §14 entry carrying it yet. Dispatch `/spec 016` for a pointer amendment (Q25 is approved) before this row starts.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-02 (agent N, paused for load): branch rebased on main after TASK-327 (d8e09fa81). Done and pushed: Mailer idempotencyKey + 409 codes (contract test); migration 0031_sign_in_callback + `createSignInLink` / `signedInLanding` / confirm landing on the stored callback (T-23 handler cases in florist-auth integration, green); `notificationsFor` table in `src/modules/notifications/rules.ts` (T-18, T-14/T-36/T-39 unit halves, green); `notifications` outbox target + routes + dispatcher `heldTargets`; other suites' registries given `notifications`. Next: `pipeline.ts` (delivery rows, address/locale at send time, idempotency key, 409 rule, W rule, template registry seam, job entry for V2/V5), register handler + hold from `notifications.email` in `src/jobs/handlers.ts`, OPS_ALERT_EMAIL env (+fixtures, counts 38 to 39), logger `svix-signature`, integration T-19/T-20/T-26/T-33/T-36/T-39/T-44/T-58, run outbox-dispatcher and payments integration suites (target count changes), self-review, ready. Local PG: embedded PG16 on port 54331 in scratchpad be-331 (stopped).
- 2026-11-02 (agent N, resumed): rebased on d117cb384, migration renumbered 0032; pipeline, hold registration, OPS_ALERT_EMAIL, svix-signature redaction, integration suite (11 cases) and mutations done; PR ready.

## Result

PR 450. `notificationsFor` as data (`src/modules/notifications/rules.ts`), the `notifications` outbox target and routes, the dispatcher's hold (`registerOutboxHold`, `notifications.email`), the pipeline (`pipeline.ts`: delivery rows queued under the unique key, addresses and locales at send time, the idempotency key and the 409 rule, the W rule, one-tap links per member, the job entry), the template registry seam (`templates.ts`), spec 012's two additive changes (`MailMessageSchema.idempotencyKey` with the 409 codes; `createSignInLink` with the callback stored on the token row, migration `0032_sign_in_callback`), `OPS_ALERT_EMAIL` (39 env keys), `svix-signature` redaction. Tests: contract 12 (resend-mailer), unit 7 (notifications-rules) + logger + outbox-dispatcher + db-migrate + env, integration 11 (notifications-pipeline) + 5 (florist-auth T-23). No templates (TASK-332/333); handed on in Carry-forwards.
