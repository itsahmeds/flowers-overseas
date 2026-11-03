# Runbook: routing and notification alerts

| Field | Value |
|---|---|
| Severity | P1 for `routing.no_partner`, P2 for the rest |
| Detect | A Sentry event with the tag `alert=<name>` (spec 013 §11's convention); Sentry's alert rule forwards it to the founder |
| Owner | founder (on-call) |
| Spec | 016 §11 (TASK-335); payment alerts are spec 013's (`payment-webhook-down.md`) |
| Last tested | none yet (fill at the Phase 1 gate) |

Every alert carries `order_id` where one exists. No alert carries an address, a name, a phone or
a token: find the person through the order in admin (`/admin/orders/{order_id}`).

## `routing.no_partner`

**What it means.** No florist took a paid order: every candidate declined or timed out, none
covers the address, or the routing deadline passed. The order is `no_partner_available`. The
`reason` field says why: `no_candidate`, `max_offers`, `deadline`, or `routing_auto_off` (the
`routing.auto` flag is off for the country). The founder also gets the A1 email at
`OPS_ALERT_EMAIL`, with the time the order cancels itself.

**What to do (inside the grace window).**
1. Open the order in admin. Read the offer table: who was asked and what they answered.
2. Phone a florist who can make it. When one agrees, use **Reroute** on the order page (spec 020a):
   the order goes back into the cascade with that florist first.
3. If nobody can, do nothing or press **Cancel**: at the end of the grace window
   (`order.no_partner_expire`: 2 hours for an order due today, else 10:00 destination time the next
   morning, never past the routing deadline) the order is cancelled and refunded in full.
4. The buyer has seen nothing yet and needs no message from you: the cancellation email (B5) goes
   out with the cancel.

## `routing.sla_overdue`

**What it means.** An offer is 5 minutes or more past its answer-by time and is still open
(`routing.sla_watch`, every minute). The `assignment.timeout` job should have closed it; it did not
run. Fields: `order_id`, `assignment_id`, `minutes_over`.

**What to do.**
1. Check that the minute tick runs: `/api/internal/db-health` shows `pending_jobs`; a growing
   backlog means the worker or the cron is down (`host-failover.md`).
2. Once the tick runs again, the timeout job closes the offer and the cascade moves on by itself.
   Nothing to do on the order.
3. If the tick is fine and the alert repeats for the same assignment, the timeout job is failing:
   read its `job.failed` log line (error class only) and open a task.

## `notifications.florist_bounce`

**What it means.** An order email to a florist member bounced (Resend `email.bounced` on a
`notification_delivery` row with `audience = florist`). That florist cannot be reached by email
for this order or any later one until the address is fixed. Fields: `order_id`, `delivery_id`,
`template_key` (`offer`, `offer-reminder`, `order-confirmed`, `offer-withdrawn`,
`photo-reminder`).

**What to do.**
1. Open the order in admin and find the florist the email was for.
2. Phone the florist. For an `offer` or `offer-reminder`, tell them the order is waiting in their
   inbox; if they use WhatsApp, the W copy already went to you, paste it.
3. Get the right address and correct the member's sign-in email (the florist's own account, or
   the partner record in admin). A bounced address may be on Resend's suppression list: remove it
   there (Resend dashboard, Suppressions) once it is fixed.
4. If the florist cannot be reached and the offer is time-critical, let it time out: the cascade
   offers the next florist.

## `webhook.dead` with `provider=resend`

**What it means.** A stored Resend webhook (`webhook_inbox`, `provider = 'resend'`) failed its
eighth processing attempt and is `dead`. Its delivery row keeps the status it had. Fields:
`inbox_id`, `provider`. The row's `last_error` holds the error class only (`schema_invalid` means
Resend sent a body the code does not read).

**What to do.**
1. Look up the row: `SELECT event_type, last_error, attempts FROM webhook_inbox WHERE id = '<inbox_id>'`
   (read-only, in the Neon SQL editor). Never copy `raw` anywhere: it holds an address.
2. `schema_invalid`: Resend changed a payload. Record a fresh fixture under
   `tests/contract/fixtures/resend/` (addresses scrubbed), fix `ResendStatusEventSchema`, deploy.
3. A database error class: check Neon's status and `db-health`; the next delivery of the same
   event (Resend retries for about a day) is processed normally.
4. To re-run the row after a fix, set it back to `received` and enqueue `webhook.resend.process`
   for it; processing is idempotent and never moves a delivery status backwards.

## `webhook-signature:resend` (Sentry rule, not an alert tag)

A Resend webhook was refused with 401: a missing or bad Svix signature, or a timestamp more than 5
minutes off. Sentry groups them under the fingerprint `webhook-signature:resend`; its rule fires at
3 events in 15 minutes. Usual cause: `RESEND_WEBHOOK_SECRET` in Railway does not match the
webhook's signing secret in Resend (rotated, or the staging one pasted into production). Copy the
secret from Resend (Webhooks, the endpoint, Signing secret) into Railway and redeploy. A burst from
an unknown sender needs nothing: refused requests store nothing.

## Post-incident

Write a 5-line note in `docs/releases/incidents.md` (what, impact, cause, fix, prevention). Open a
spec if code must change.
