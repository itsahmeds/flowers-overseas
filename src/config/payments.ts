/**
 * @purpose Payment lifecycle timings: the unpaid-purchase timeout and the sweep's other windows
 * @spec 013
 *
 * The timings of spec 013's payment lifecycle (§5.2 "Jobs", `payments.sweep`; §13 Q9; TASK-257).
 * One place, so a test and the job read the same numbers and a change is one reviewed line.
 *
 *  - `UNPAID_PURCHASE_TIMEOUT_MINUTES` (§13 Q9, 2 hours): a purchase whose orders are still
 *    `placed` this long after `purchase.created_at` is reconciled, then closed at the provider
 *    (sweep (b)).
 *  - `PENDING_PAYMENT_TIMEOUT_MINUTES` (sweep (c)): a `pending` payment with no `provider_ref` this
 *    old never reached the provider; it is set `failed`.
 *  - `REQUESTED_REFUND_RETRY_MINUTES` (sweep (d)): a `requested` refund this old is retried with
 *    the same idempotency key.
 *
 * No database here (`pnpm check:no-db` scans `src/config`).
 */
export const UNPAID_PURCHASE_TIMEOUT_MINUTES = 120;
export const PENDING_PAYMENT_TIMEOUT_MINUTES = 15;
export const REQUESTED_REFUND_RETRY_MINUTES = 5;

/**
 * The two monitors of `payments.monitor` (spec 013 §11, §13 Q8, Q10; AC-39, AC-40; TASK-264):
 *
 *  - `PAID_NOT_ROUTED_AFTER_MINUTES` (AC-39): a `test` or `live` order still `authorised` or
 *    `paid_unrouted` **more than** this long after `expectedFirstOfferAt(order)` raises
 *    `payment.paid_not_routed` (exactly this long raises nothing).
 *  - `WEBHOOK_SILENCE_HOURS` (AC-40): no Stripe inbox row of the environment's `livemode` for
 *    this long raises `webhook.silent_24h` ...
 *  - `WEBHOOK_QUIET_SITE_DAYS` (§13 Q10's recommendation, built): ... but only when a payment
 *    with a provider reference was created within this many days. A site with no recent payment is
 *    legitimately quiet. Changing the rule is this constant and one test.
 */
export const PAID_NOT_ROUTED_AFTER_MINUTES = 5;
export const WEBHOOK_SILENCE_HOURS = 24;
export const WEBHOOK_QUIET_SITE_DAYS = 7;
