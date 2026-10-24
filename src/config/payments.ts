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
