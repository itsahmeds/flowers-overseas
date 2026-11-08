/**
 * @purpose The buyer sign-in's limits and session length
 * @spec 018
 *
 * Spec 018 §14 A-founder-2026-10-22 C.3, C.4 (TASK-344). Data only: the buyer surface
 * (`src/lib/auth/buyer.ts`) reads these.
 *
 *  - `BUYER_LINK_HOURLY_CAP`: open sign-up is guarded by a global ceiling. When the core's send log
 *    (`auth_email_send`) holds this many rows in the trailing hour, further buyer links are refused
 *    silently: the answer is the same `sent` page (AC-48).
 *  - `BUYER_LINK_ALERT_AT`: from this many rows in the trailing hour, every buyer request raises
 *    the cap alert (one Sentry issue, fingerprinted), well before the cap bites.
 *  - `BUYER_SESSION_DAYS`: database sessions of 30 days, rolling (C.3, §13 Q26).
 */
export const BUYER_LINK_HOURLY_CAP = 300;
export const BUYER_LINK_ALERT_AT = 100;
export const BUYER_SESSION_DAYS = 30;
