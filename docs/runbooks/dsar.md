# Runbook — Data subject request (access / erasure / objection)

| Field | Value |
|---|---|
| Severity | P3 |
| Detect | Email to privacy@, the contact form, the recipient landing page form. Self-service export and erasure arrive with spec 018 task 5; until then every request is handled here, by hand |
| Owner | founder (on-call) |
| Deadline | **one calendar month** from receipt (GDPR Art. 12(3)), not 30 days: received 31 January, due 28 February (29 in a leap year) |
| Last tested | not yet (fill at the Phase 1 gate) |

GDPR sets the deadline, not the channel (Art. 12), so a by-hand answer is lawful. This page is the
launch-slice path of spec 018 (§1 "What ships when", §5.2 "Erasure semantics", §11 "Runbooks");
spec 018 task 5 rewrites it around the self-service flow. Every SQL block below runs in the Neon SQL
editor of the **production** branch, inside `BEGIN; … COMMIT;`, and is read twice before `COMMIT`.
`:'customer_id'` is psql's variable syntax: in the Neon editor, replace it with the id in quotes.

## Symptoms
A person asks for a copy of their data, asks us to delete it, or objects to a use of it.

## Immediate actions (first 15 minutes)
1. **Log it** in `docs/compliance/dsar-log.md`: the next request number (`DSAR-YYYY-NNN`), the
   date received, the due date (received plus one calendar month, as in the table above), the type
   (export, erase, objection) and the channel. **No name, address or order reference** goes into
   the log: it is committed to the repository. The email thread stays in the privacy@ mailbox;
   that is where the identity lives.
2. **Verify the requester** before anything leaves the building:
   - a buyer: reply from privacy@ **to the address on the order**, and ask them to confirm the
     request from it and to give one order reference (`FO-XXXX-XXXX`). A request that came from
     another address is answered only through the order's address;
   - a recipient: the order reference plus the phone number the order was sent to.
   Mark the log row `verified` with the date. An unverified request is not answered with data; it
   is answered with the verification step.

## Diagnosis: where the data lives
`customer` (name, email, phone, country, consent), `address`, `recipient` and `recipient_address`,
`"order".buyer_snapshot` and `recipient_snapshot`, the card message on `order_line`,
`consent_log`, `users` / `accounts` / `sessions` (only if they ever signed in), the account's
`saved_recipient` and `occasion_reminder` rows and the `customer` preferences (spec 018 C.11),
**other buyers' `saved_recipient` rows holding a recipient's phone**, delivery photos
(`delivery_proof` and its R2 objects), `payment` and `refund` (amounts and provider references, no
card number), `invoice` (its snapshot, kept by law), Resend's send logs, and any CRM or review
invitation.

Find the customer (`lower()`, because the unique index is on it):

```sql
SELECT id, redacted, user_id, created_at
FROM customer
WHERE lower(email_normalised) = lower('person@example.com');
```

## Fix / recovery

### Access (export)
Run each query with the customer id, save the results as JSON, and send them as one attachment
from privacy@ to the verified address. Orders carry the **buyer projection** only, never an
internal status, and no fraud or risk signal (`payment.risk_score` is never exported; spec 018 §8).

```sql
SELECT id, email_normalised, name, phone_e164, country_iso2, marketing_consent, created_at
FROM customer WHERE id = :'customer_id';

SELECT kind, lines, postal_code, city FROM address WHERE customer_id = :'customer_id';

SELECT o.id, order_reference(o.id) AS reference, o.created_at, o.delivery_date,
       s.buyer_projection AS status, o.buyer_currency_code, o.buyer_total_minor,
       o.buyer_snapshot, o.recipient_snapshot
FROM "order" o JOIN order_status s ON s.key = o.status
WHERE o.customer_id = :'customer_id' AND o.mode = 'live';

SELECT r.amount_minor, r.currency_code, r.status, r.succeeded_at
FROM refund r JOIN payment p ON p.id = r.payment_id JOIN "order" o ON o.id = p.order_id
WHERE o.customer_id = :'customer_id';

SELECT i.kind, i.number, i.issued_at, i.currency_code, i.total_minor
FROM invoice i JOIN "order" o ON o.id = i.order_id
WHERE o.customer_id = :'customer_id';

SELECT choices, policy_version, occurred_at
FROM consent_log WHERE subject_kind = 'customer' AND subject_ref = :'customer_id';

-- Spec 023 §8 (TASK-491): the analytics consent snapshot and the GA client id we hold, if any.
SELECT a.analytics_consent, a.marketing_consent, a.ga_client_id, a.created_at, a.ids_cleared_at
FROM order_analytics a JOIN "order" o ON o.id = a.order_id
WHERE o.customer_id = :'customer_id';
```

### Erasure
Spec 002 §8 and spec 018 §5.2: pseudonymise, keep the accounting record, flag it.

1. **Open orders first.** An order that is not settled is still being delivered or disputed:

   ```sql
   SELECT id, status FROM "order"
   WHERE customer_id = :'customer_id'
     AND status NOT IN ('closed', 'chargeback_won', 'chargeback_lost', 'payment_failed',
                        'abandoned', 'cancelled', 'cancelled_refunded');
   ```

   If this returns rows, tell the person the erasure completes once those orders finish, set the
   log row to `waiting_open_orders`, and come back when they settle. The due date does not move;
   if the wait would pass it, write to the person before the due date (Art. 12(3) allows two
   further months, with reasons, given inside the first month).
2. **Pseudonymise**, in one transaction:

   ```sql
   BEGIN;
   UPDATE customer
   SET name = NULL, phone_e164 = NULL, marketing_consent = false,
       email_normalised = 'redacted+' || id || '@invalid',
       redacted = true, redacted_at = now()
   WHERE id = :'customer_id';

   UPDATE address SET lines = ARRAY[]::text[], postal_code = NULL
   WHERE customer_id = :'customer_id';

   -- Every settled order: the snapshots keep the city and the marker, nothing else.
   UPDATE "order"
   SET buyer_snapshot = jsonb_build_object('redacted', true, 'redacted_at', now()),
       recipient_snapshot = jsonb_build_object(
         'city', recipient_snapshot->'city', 'redacted', true, 'redacted_at', now())
   WHERE customer_id = :'customer_id'
     AND status IN ('closed', 'chargeback_won', 'chargeback_lost', 'payment_failed',
                    'abandoned', 'cancelled', 'cancelled_refunded');

   UPDATE recipient
   SET full_name = left(full_name, 1) || '.', phone_e164 = NULL,
       contact_redacted = true, contact_redacted_at = now()
   WHERE customer_id = :'customer_id';

   -- The account's saved recipients and reminders go outright (spec 018 C.9).
   DELETE FROM occasion_reminder WHERE customer_id = :'customer_id';
   DELETE FROM saved_recipient WHERE customer_id = :'customer_id';
   UPDATE customer
   SET preferred_locale = NULL, preferred_currency = NULL, reminder_consent = false,
       reminder_unsubscribe_token = NULL
   WHERE id = :'customer_id';

   -- Only if they ever signed in: the account rows go.
   DELETE FROM sessions WHERE user_id = (SELECT user_id FROM customer WHERE id = :'customer_id');
   DELETE FROM accounts WHERE user_id = (SELECT user_id FROM customer WHERE id = :'customer_id');
   COMMIT;
   ```

   The `users` row goes last, once `customer.user_id` is cleared, through admin (spec 012).
3. **Delivery photos** of settled orders are deleted (the R2 objects first, then the rows), except
   for an order in `chargeback_open` or `disputed` (Art. 17(3)(e), spec 018 §13 Q8).
4. **Keep**: orders, payments, refunds, invoices and their PDFs (accounting law, `plan/07` §1.2),
   now pointing at a `redacted` customer; `consent_log` for 5 years.
5. **Outside the database**: unsubscribe and delete the address in Resend (and any CRM), and
   withdraw any pending review invitation.
6. **Google Analytics** (spec 023 §8 "Rights"; TASK-491). Note each order's GA client id, then
   null the ids we hold:

   ```sql
   SELECT a.ga_client_id FROM order_analytics a JOIN "order" o ON o.id = a.order_id
   WHERE o.customer_id = :'customer_id' AND a.ga_client_id IS NOT NULL;

   UPDATE order_analytics a
   SET ga_client_id = NULL, ga_session_id = NULL, ids_cleared_at = now()
   FROM "order" o
   WHERE o.id = a.order_id AND o.customer_id = :'customer_id';
   ```

   Then delete each noted client id in GA4 (Explore, User explorer, the client id, Delete user;
   or the User Deletion API). Ids older than 60 days are already cleared by the retention sweep
   and cannot be traced to the person any more. A later refund of these orders is not sent to
   GA4 (skipped `ids_cleared`).

### A recipient's erasure or objection: saved recipients (spec 018 C.7.3)
A buyer may keep a recipient's delivery details in their account (`saved_recipient`). When a
recipient asks for erasure, or objects, every saved copy holding their phone goes, across every
customer, and nothing else. The buyer is not told who asked. Normalise the phone to E.164 first
(`+48500000000`), then, in one transaction:

<!-- dsar:saved-recipient-by-phone (tests/integration/buyer-account.test.ts runs this block) -->
```sql
DELETE FROM saved_recipient WHERE phone_e164 = :'phone_e164';
```

Log the count it deleted in the request's row. The order's own `recipient` follows the steps above
and the 90-day sweep; it is never exempted.

### Objection
Stop the processing objected to (marketing: `marketing_consent = false`) and log it. Marketing is
answered the same day; anything else goes to the founder's decision within the deadline.

## Communication
Plain-language reply from privacy@ to the verified address: what was found, what was sent or
erased, what is kept and why (accounting law), and how to complain to the supervisory authority.
Templates in `docs/compliance/dsar-templates.md`.

## Close
Set the log row's `done` date and check it is on or before the due date; keep the email thread.
The founder reads `docs/compliance/dsar-log.md` weekly (spec 018 §13 Q16) until task 5's SLA alert
replaces the habit.

## Post-incident
A missed deadline is an incident: a 5-line note in `docs/releases/incidents.md` (what, impact,
cause, fix, prevention). Open a spec if code must change.
