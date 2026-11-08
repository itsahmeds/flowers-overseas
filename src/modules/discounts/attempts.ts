/**
 * `recordFailure` and `isLocked`: the per-checkout guessing lock, and the site-wide alert (spec 047
 * §2 "Abuse limits", §5.2 `attempts.ts`; AC-13; TASK-447).
 *
 * **Per checkout.** Five failed attempts on one draft within 15 minutes lock its code field for 15
 * minutes; a locked field looks nothing up. The counts live on the draft row
 * (`discount_failed_attempts`, `discount_window_started_at`, `discount_locked_until`, migration
 * `0037`), never on an IP address: nothing here reads one (ADR-0006). Only the reasons a guess
 * produces count (`unknown`, `not_started`, `ended`, `wrong_*`, `below_minimum`); a successful
 * apply, `used_up` and `already_used_by_you` do not (`COUNTED_FAILURES`). When the lock ends the
 * count starts again from nothing.
 *
 * **Site wide.** More than 100 failed attempts across the site within 10 minutes raise **one**
 * Sentry warning `discounts.guessing` per window. The counter is in process, enough because
 * production runs one replica (ADR-0018).
 *
 * The decision is pure (`afterFailure`, `lockState`), so the clock is injected in tests; the two
 * database functions run in the caller's transaction like every function of this module.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import {
  DISCOUNT_ATTEMPT_WINDOW_MINUTES,
  DISCOUNT_ATTEMPTS_PER_WINDOW,
  DISCOUNT_LOCK_MINUTES,
  DISCOUNT_SITE_ALERT_FAILURES,
  DISCOUNT_SITE_ALERT_WINDOW_MINUTES,
} from "@/config/discounts";
import { captureWarning } from "@/lib/sentry";

import { type DiscountConnection, rowsOf } from "./db";
import type { DiscountRefusalReason } from "./schemas";

const MINUTE_MS = 60_000;

/** The refusals that count as a guess (§5.2 `applyDiscountAction`); caps never do. */
export const COUNTED_FAILURES: ReadonlySet<DiscountRefusalReason> = new Set([
  "unknown",
  "not_started",
  "ended",
  "wrong_destination",
  "wrong_product",
  "wrong_currency",
  "below_minimum",
]);

/** The draft's three guessing columns. */
export interface AttemptState {
  readonly failedAttempts: number;
  readonly windowStartedAt: Date | null;
  readonly lockedUntil: Date | null;
}

/** Whether the field is locked at `now`, and for how many whole minutes more (rounded up). */
export function lockState(
  state: Pick<AttemptState, "lockedUntil">,
  now: Date,
): { readonly locked: boolean; readonly minutes: number } {
  const left =
    state.lockedUntil === null
      ? 0
      : state.lockedUntil.getTime() - now.getTime();
  return left > 0
    ? { locked: true, minutes: Math.ceil(left / MINUTE_MS) }
    : { locked: false, minutes: 0 };
}

/** The state after one counted failure at `now` (the file header). */
export function afterFailure(state: AttemptState, now: Date): AttemptState {
  const windowOpen =
    state.windowStartedAt !== null &&
    now.getTime() - state.windowStartedAt.getTime() <
      DISCOUNT_ATTEMPT_WINDOW_MINUTES * MINUTE_MS;
  const failedAttempts = windowOpen ? state.failedAttempts + 1 : 1;
  if (failedAttempts >= DISCOUNT_ATTEMPTS_PER_WINDOW) {
    return {
      failedAttempts: 0,
      windowStartedAt: null,
      lockedUntil: new Date(now.getTime() + DISCOUNT_LOCK_MINUTES * MINUTE_MS),
    };
  }
  return {
    failedAttempts,
    windowStartedAt: windowOpen ? state.windowStartedAt : now,
    lockedUntil: null,
  };
}

const StateRowSchema = z.object({
  discount_failed_attempts: z.coerce.number().int().nonnegative(),
  discount_window_started_at: z.coerce.date().nullable(),
  discount_locked_until: z.coerce.date().nullable(),
});

async function stateOf(
  draftId: string,
  connection: DiscountConnection,
  forUpdate: boolean,
): Promise<AttemptState | null> {
  const rows = await rowsOf(
    connection,
    sql`SELECT discount_failed_attempts, discount_window_started_at, discount_locked_until
          FROM public.checkout_draft WHERE id = ${z.uuid().parse(draftId)}::uuid
          ${forUpdate ? sql`FOR UPDATE` : sql``}`,
  );
  if (rows[0] === undefined) return null;
  const row = StateRowSchema.parse(rows[0]);
  return {
    failedAttempts: row.discount_failed_attempts,
    windowStartedAt: row.discount_window_started_at,
    lockedUntil: row.discount_locked_until,
  };
}

/** The draft's lock at `now`; a draft that is gone reads as unlocked (it answers `expired`). */
export async function isLocked(
  draftId: string,
  now: Date,
  connection: DiscountConnection,
): Promise<{ readonly locked: boolean; readonly minutes: number }> {
  const state = await stateOf(draftId, connection, false);
  return state === null ? { locked: false, minutes: 0 } : lockState(state, now);
}

/**
 * Counts one failed attempt on the draft, under its row lock, and feeds the site counter. Returns
 * the lock the attempt left behind (locked on the fifth).
 */
export async function recordFailure(
  draftId: string,
  now: Date,
  connection: DiscountConnection,
): Promise<{ readonly locked: boolean; readonly minutes: number }> {
  noteSiteFailure(now);
  const state = await stateOf(draftId, connection, true);
  if (state === null) return { locked: false, minutes: 0 };
  const next = afterFailure(state, now);
  await connection.db.execute(sql`
    UPDATE public.checkout_draft
       SET discount_failed_attempts = ${next.failedAttempts},
           discount_window_started_at = ${next.windowStartedAt?.toISOString() ?? null}::timestamptz,
           discount_locked_until = ${next.lockedUntil?.toISOString() ?? null}::timestamptz
     WHERE id = ${draftId}::uuid`);
  return lockState(next, now);
}

/* -------------------------------------------------------------------------- */
/* The site-wide counter                                                       */
/* -------------------------------------------------------------------------- */

let siteFailures: number[] = [];
let alertedAt: number | null = null;

/**
 * One failed attempt anywhere on the site. Above `DISCOUNT_SITE_ALERT_FAILURES` within the window
 * it raises `discounts.guessing` once, then not again until a full window has passed. The warning
 * carries the count only: no code, no draft, no person.
 */
export function noteSiteFailure(now: Date): void {
  const at = now.getTime();
  const windowMs = DISCOUNT_SITE_ALERT_WINDOW_MINUTES * MINUTE_MS;
  siteFailures = siteFailures.filter((when) => at - when < windowMs);
  siteFailures.push(at);
  if (
    siteFailures.length > DISCOUNT_SITE_ALERT_FAILURES &&
    (alertedAt === null || at - alertedAt >= windowMs)
  ) {
    alertedAt = at;
    captureWarning("discounts.guessing", {
      failures: siteFailures.length,
      window_minutes: DISCOUNT_SITE_ALERT_WINDOW_MINUTES,
    });
  }
}

/** Tests only: forget the site counter. */
export function resetSiteFailures(): void {
  siteFailures = [];
  alertedAt = null;
}
