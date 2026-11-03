# TASK-335 — Spec 016 Resend webhooks and routing alerts (task 4): `POST /api/webhooks/resend` (Svix signature, 5-minute tolerance, store before processing, duplicate `svix-id`), `webhook.resend.process` with status precedence, `alert=notifications.florist_bounce`, `webhook.dead` with `provider=resend`, `docs/runbooks/alerts.md` sections, RoPA uses

Row: `TASKS.md` → TASK-335. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-335`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (work order `wo-1022-common.md`). Merges after: TASK-331, TASK-260.
- Spec 016 §12 task 4; §5.2 "Resend webhooks"; §8; §11. AC-28 to AC-30.
- Bad signature or timestamp more than 5 minutes off → 401, nothing stored, counter plus Sentry fingerprint `webhook-signature:resend`. Valid → `webhook_inbox` (`provider = 'resend'`, `event_id = svix-id`) before anything else, 200, then process. `email.opened` and `email.clicked` ignored.
- Precedence `queued < sent < delivery_delayed < delivered`; `bounced`, `complained`, `failed` final. Logger redaction gains `svix-signature`; Sentry `beforeSend` scrubs the body.
- `docs/runbooks/alerts.md`: one section each for `routing.no_partner`, `routing.sla_overdue`, `notifications.florist_bounce`, `webhook.dead` (resend). RoPA (`docs/compliance/ropa.md`): the Resend uses of spec 016 §8, with the photo-copy retention line.
- **ACs owned:** AC-28, AC-29, AC-30 (T-28, T-29, T-30).
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself (the breaker's list for this row):** unsigned request, a bad signature, timestamps 4:59 and 5:01 off; a replayed `svix-id`; `delivered` before `sent`; `bounced` after `delivered`; an always-throwing processor reaching `dead` (one alert, not two); a body over the size cap. Mutate each AC's subject and watch its case go red before you claim it.
- **Founder rulings bind every line** (spec 016 and 018 §14): every payment is captured at placement; no buyer surface, email, PDF or copy key says or implies partners, a florist accepting, offers, re-routing or a held card (`RELAY_PATTERNS`, `RELAY_EXEMPT`, `relayMatches` in `src/config/honesty.ts`: use them, keep no list of your own); no refund or failure wording after payment except the cancellation and refund messages; no em dash in any copy.
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.

## Read

- specs/016: §5.2 Resend webhooks, §8, §11, §9 AC-28 to AC-30, §10 T-28 to T-30
- specs/013 §5.2 webhook inbox; `docs/tasks/TASK-260.md`
- `docs/runbooks/payment-webhook-down.md` (the pattern)
- `docs/codebase-map.md` (where everything lives); `.claude/state/wo-1022-common.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

- 2026-11-04 (self-review, W335): `webhook_inbox.raw` keeps Resend's whole body, which names the recipient address and the subject, for 12 months (the `fraud_signals` sweep), because spec 016 §5.2 says "store the raw body". A minimised copy (type, `email_id`, reason) would hold no address; that is a spec amendment, not this task's call. Recorded in RoPA row 17.
- 2026-11-04 (self-review, W335): the three final statuses are ranked `failed < bounced < complained` among themselves so AC-29's "any order" holds for two finals too; §5.2 only says they are final. Two finals for one message do not happen in practice.
- 2026-11-04 (self-review, W335): Resend's message retention figure for the account's plan is not in RoPA rows 13 and 16 yet; the founder reads it from the Resend dashboard.
- 2026-11-04 (self-review, W335): `tests/unit/zod-boundaries.test.ts` "the real tree" is red on main with 21 findings outside this diff (TASK-434's area); this diff adds none (`ingestResendBody` is a listed parser).
- 2026-11-04 (self-review, W335): the Resend fixtures are Resend's documented examples, not payloads recorded from our webhook (none exists yet); replace them from staging once the founder creates the webhook.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-04 W335: worktree `../fo-wt-335`, row `in_progress`, draft PR opened. No migration needed (0030 already widened `webhook_inbox.provider` and created `notification_delivery`). Next: verifier, inbox, processor, job, route, tests.
- 2026-11-04 W335: `src/modules/notifications/resend-webhook.ts` (Svix verify, ingest, precedence, processing, job), route, `webhook.resend.process` (7 retries), env key, contract 22 + integration 15 green on local PG16; 11 mutations each red. Docs: `docs/runbooks/alerts.md`, RoPA rows 13 to 17. PR 474 marked ready.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR 474. `POST /api/webhooks/resend` (thin) over `ingestResendWebhook`: 503 without `RESEND_WEBHOOK_SECRET`, 413 over 1 MB, 401 for a missing or bad Svix signature or a timestamp more than 300 s off either way (one `webhook.rejected` counter line, one Sentry warning fingerprinted `webhook-signature:resend`), 400 for a signed non-event, else the event is stored in `webhook_inbox` (`provider = 'resend'`, `event_id = svix-id`, `ON CONFLICT DO NOTHING`) and `webhook.resend.process` is enqueued after the commit. Processing raises the `notification_delivery` status only upwards (`queued < sent < delivery_delayed < delivered < failed < bounced < complained`), raises `notifications.florist_bounce` once per florist bounce and `webhook.dead` (`provider=resend`) once on the eighth failed attempt, both after the commit. Tests: contract 22 (`tests/contract/resend-webhook.test.ts`, incl. Svix's published test vector), integration 15 (`tests/integration/resend-webhooks.test.ts`), unit 2 (Sentry scrub of the webhook request; the fingerprint); registry, runtime, env, railway and zod-boundary lists updated. No migration (0030 already widened the inbox). No build, browser or CI run (founder's 11-04 rules). Founder step: create the Resend webhook and set `RESEND_WEBHOOK_SECRET` in Railway staging and production (empty until then).
