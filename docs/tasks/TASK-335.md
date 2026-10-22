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
