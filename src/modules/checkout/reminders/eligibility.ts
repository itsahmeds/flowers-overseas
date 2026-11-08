/**
 * When a basket counts as abandoned, and what each of its lines can still promise (spec 034 §2
 * "When a basket counts as abandoned", §5.2 "Pure functions"; AC-1, AC-6 pure half, AC-10;
 * TASK-449).
 *
 * Both functions are pure: the clock and the delivery calendar are injected. **Consent is the only
 * basis** (§8.2, §13 Q1): nothing here, or anywhere under `reminders/`, reads a marketing consent,
 * a residence country, a buyer-country rule, an IP, a geo header or `Accept-Language` (AC-10,
 * AC-30). A UK and a Polish buyer who tick the box are treated the same.
 */
import {
  ABANDON_AFTER_MS,
  CUTOFF_MARGIN_MS,
  SEND_LATEST_MS,
} from "@/config/basket-reminders";
import type { CountryIso2 } from "@/config/countries";

/** The draft facts `isAbandoned` decides on (§5.2 `DraftEligibilityView`). */
export interface DraftEligibilityView {
  readonly mode: "demo" | "test" | "live";
  readonly purchaseId: string | null;
  readonly lineCount: number;
  /** Step 3 "Your details" saved (`buyer_saved`). */
  readonly buyerSaved: boolean;
  /** The saved buyer email, or `null`. */
  readonly email: string | null;
  readonly reminderConsentAt: Date | null;
  readonly lastActivityAt: Date;
}

/**
 * True exactly when the draft is `live`, unplaced, has a line, a saved email and the box's consent,
 * and its last activity was between `ABANDON_AFTER` and `SEND_LATEST` ago, both bounds included
 * (AC-1).
 */
export function isAbandoned(draft: DraftEligibilityView, now: Date): boolean {
  if (draft.mode !== "live") return false;
  if (draft.purchaseId !== null) return false;
  if (draft.lineCount < 1) return false;
  if (!draft.buyerSaved || draft.email === null || draft.email.trim() === "") {
    return false;
  }
  if (draft.reminderConsentAt === null) return false;
  const idle = now.getTime() - draft.lastActivityAt.getTime();
  return idle >= ABANDON_AFTER_MS && idle <= SEND_LATEST_MS;
}

/** One day of a destination's checkout calendar, as the reminder reads it. */
export interface ReminderCalendarDay {
  readonly date: string;
  readonly selectable: boolean;
}

/** Spec 009's checkout calendar of a destination from an instant (`checkoutDeliveryWindow`). */
export type DeliveryWindowFn = (input: {
  readonly countryIso: CountryIso2;
  readonly from: Date;
}) => { readonly dates: readonly ReminderCalendarDay[] };

/** The line facts `reminderLineStates` reads. */
export interface ReminderDraftLine {
  readonly countryIso: CountryIso2;
  readonly deliveryDate: string | null;
}

/**
 * A line's state in the email (§5.2): `kept` (its date is still deliverable), `moved` (it is not;
 * `nextDate` is the first date that is), `open` (no date chosen), `unavailable` (left out).
 */
export type ReminderLine<Line extends ReminderDraftLine = ReminderDraftLine> =
  | { readonly state: "kept"; readonly line: Line; readonly date: string }
  | { readonly state: "moved"; readonly line: Line; readonly nextDate: string }
  | { readonly state: "open"; readonly line: Line }
  | { readonly state: "unavailable"; readonly line: Line };

/**
 * Each line's state at `now + CUTOFF_MARGIN` in its destination's zone (AC-6). `isAvailable` says
 * whether the product is still sold, its tier priced and its destination `live` (the send reads
 * those from the catalogue); a line that fails it, or whose destination has no deliverable date in
 * the window, is `unavailable`. The margin exists because an email is read some time after it is
 * sent; it is never shown to the buyer as a deadline.
 */
export function reminderLineStates<Line extends ReminderDraftLine>(
  lines: readonly Line[],
  now: Date,
  window: DeliveryWindowFn,
  isAvailable: (line: Line) => boolean = () => true,
): ReminderLine<Line>[] {
  const at = new Date(now.getTime() + CUTOFF_MARGIN_MS);
  return lines.map((line): ReminderLine<Line> => {
    if (!isAvailable(line)) return { state: "unavailable", line };
    const days = window({ countryIso: line.countryIso, from: at }).dates;
    const first = days.find((day) => day.selectable)?.date;
    if (first === undefined) return { state: "unavailable", line };
    if (line.deliveryDate === null) return { state: "open", line };
    const chip = days.find((day) => day.date === line.deliveryDate);
    if (chip?.selectable === true) {
      return { state: "kept", line, date: line.deliveryDate };
    }
    return { state: "moved", line, nextDate: first };
  });
}

/** True when at least one line can still be shown (check 9 `no_available_line`). */
export function hasAvailableLine(states: readonly ReminderLine[]): boolean {
  return states.some((state) => state.state !== "unavailable");
}
