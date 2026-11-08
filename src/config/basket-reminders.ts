/**
 * @purpose The basket reminder's timings, limits and auto-pause thresholds
 * @spec 034
 *
 * The basket reminder's numbers (spec 034 §5.2 `src/config/basket-reminders.ts`; TASK-449), as
 * data, so a timing is changed here and nowhere else:
 *
 *  - a basket is **abandoned** 2 hours after its last activity and never reminded later than 20
 *    hours after it (inside spec 010's 24-hour life of the buyer's details, §2, §13 Q3);
 *  - a line's date must still be deliverable **60 minutes** after the send (the email is read some
 *    time after it arrives); the margin is internal and never shown to the buyer as a deadline;
 *  - the restore link lives **7 days**; a purchase within **7 days** of the send is recovered; one
 *    address gets at most one basket email in **7 days** (§13 Q13);
 *  - **one** reminder per basket (`BASKET_REMINDER_MAX`, §13 Q2; the table allows `sequence` 2 so a
 *    second is an amendment, not a migration). A test pins it at 1 (AC-5);
 *  - the **auto-pause** (§13 Q9): over the last 7 days with at least 50 sent, complaints above
 *    0.3 % or bounces above 4 % turn the flag off;
 *  - `CONSENT_WORDING_VERSION`, stored on the draft beside the consent: raise it whenever
 *    `checkout.basketReminder.label` or `.hint` changes in meaning.
 *
 * No database or flag is read here (`pnpm check:no-db`).
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** A basket counts as abandoned this long after its last activity (§2, AC-1). */
export const ABANDON_AFTER_MS = 2 * HOUR_MS;
/** ...and is never reminded later than this after it (§2, AC-1, check 5 `too_late`). */
export const SEND_LATEST_MS = 20 * HOUR_MS;
/** A line's date is judged deliverable at `now + CUTOFF_MARGIN` (§5.2, AC-6). */
export const CUTOFF_MARGIN_MS = 60 * MINUTE_MS;
/** The restore link's life after the send (§2, AC-15). */
export const RESTORE_TTL_MS = 7 * DAY_MS;
/** A purchase within this long after the send counts as recovered (§2, AC-22). */
export const ATTRIBUTION_WINDOW_MS = 7 * DAY_MS;
/** At most one basket email per address in this long (§13 Q13, check 8, AC-3). */
export const PER_ADDRESS_GAP_MS = 7 * DAY_MS;
/** One reminder per basket (§13 Q2, AC-5). */
export const BASKET_REMINDER_MAX = 1;
/** The scan's cron: every 10 minutes (§5.2). */
export const SCAN_CRON = "*/10 * * * *";
/** The scan's period, which the minute tick uses to enqueue it. */
export const SCAN_EVERY_MINUTES = 10;
/** At most this many lines in one reminder (the table's `line_count BETWEEN 1 AND 5`). */
export const REMINDER_MAX_LINES = 5;

/** The automatic pause (§13 Q9, AC-25). Rates are fractions of the sends in the window. */
export const AUTO_PAUSE = {
  minSends: 50,
  windowDays: 7,
  complaintRate: 0.003,
  bounceRate: 0.04,
} as const;

/** The version of the box's wording, stored with each consent (§5.2). */
export const CONSENT_WORDING_VERSION = 1;

/** The message key whose wording a consent row cites (§5.2 `recordBasketReminderConsent`). */
export const CONSENT_WORDING_KEY = "checkout.basketReminder.label";

/** The flag that gates the box, the scan and the send (§5.1 E, §12). */
export const BASKET_REMINDER_FLAG = "marketing.basket_reminder";

/** The actor the auto-pause writes into the flag's history (AC-25). */
export const AUTO_PAUSE_ACTOR = "system:basket_reminders.auto_pause";
