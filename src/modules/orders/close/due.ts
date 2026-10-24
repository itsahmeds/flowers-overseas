/**
 * `closeDueAt(facts)`: when may an order close (spec 022a §2 "The close", AC-1; TASK-369)?
 *
 *  - `photo_uploaded`: at the `order.photo_uploaded` event's instant plus `COMPLAINT_WINDOW_HOURS`
 *    (72) **absolute** hours, i.e. plus exactly 72 × 3600 seconds, so a photo taken the day before
 *    the destination's clock change closes 72 hours later, not three calendar days later;
 *  - `resolved` and `refunded_full`: at the instant of the event that entered the status;
 *  - every other status: never (`null`).
 *
 * Pure: no clock, no database. The sweep reads the facts and asks this function; the database
 * query only narrows the candidates.
 */
import { COMPLAINT_WINDOW_HOURS } from "@/config/company";

import { ClosableStatusSchema, type ClosableStatus } from "./events";

const MS_PER_HOUR = 3_600_000;

export interface CloseFacts {
  /** The order's current status. */
  readonly status: string;
  /**
   * The instant of the event that entered `status` (its latest event with `to_status = status`
   * and a different `from_status`). For `photo_uploaded` that is the `order.photo_uploaded`
   * event, the only row of the machine that enters it.
   */
  readonly enteredAt: Date;
}

/** The waiting time, in milliseconds, after entering each closable status. */
export const CLOSE_DELAY_MS: Readonly<Record<ClosableStatus, number>> = {
  photo_uploaded: COMPLAINT_WINDOW_HOURS * MS_PER_HOUR,
  resolved: 0,
  refunded_full: 0,
};

/** The instant `facts`' order may close, or `null` when its status never closes by time. */
export function closeDueAt(facts: CloseFacts): Date | null {
  const status = ClosableStatusSchema.safeParse(facts.status);
  if (!status.success) return null;
  return new Date(facts.enteredAt.getTime() + CLOSE_DELAY_MS[status.data]);
}
