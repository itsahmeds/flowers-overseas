/**
 * When an offer goes out, when it must be answered, and when an untaken order is cancelled (spec
 * 016 §5.2 "Routing functions": `offerWindow`, `graceEnd`, `expectedFirstOfferAt`; §13 16-2;
 * `plan/06` §5.2 rule 3; AC-4, AC-35; TASK-327).
 *
 * Pure: no clock is read (the caller passes `now`), no database, no process zone. Every wall-clock
 * rule is evaluated in the destination's IANA zone through spec 009's zone helpers, and every
 * answer is an absolute instant, so a DST night moves the instant and never the local reading
 * (rule "never added hours"). The numbers are `src/config/routing.ts`'s; the country's own inputs
 * are its `ianaZone` and `sameDayCutoffLocal` (`CountryOperations`), as data.
 */
import { NO_PARTNER_GRACE, ROUTING_WINDOWS } from "@/config/routing";
import {
  addDays,
  type CountryOperations,
  instantAt,
  type IsoDate,
  minuteOfDay,
  zonedDate,
  zonedMinuteOfDay,
} from "@/modules/geo";

/** The destination inputs every window needs: its zone and its same-day cutoff. */
export type RoutingDestination = Pick<
  CountryOperations,
  "ianaZone" | "sameDayCutoffLocal"
>;

const MINUTE_MS = 60_000;

function plusMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * MINUTE_MS);
}

function earliest(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b;
}

/**
 * **The routing deadline**: the delivery date at the destination's same-day cutoff plus 2 hours,
 * as a wall-clock reading in the destination (§13 16-2). No SLA and no grace end passes it.
 */
export function routingDeadline(
  deliveryDate: IsoDate,
  destination: RoutingDestination,
): Date {
  return instantAt(
    deliveryDate,
    minuteOfDay(destination.sameDayCutoffLocal) +
      ROUTING_WINDOWS.deadlineAfterCutoffMinutes,
    destination.ianaZone,
  );
}

/** One offer's timing, or the reason no offer can be made any more. */
export type OfferWindow =
  | {
      readonly kind: "offer";
      /** When the offer is made: `now`, or the next 07:30 for a night order. */
      readonly offerAt: Date;
      /** When it must be answered by (`order_assignment.sla_expires_at`); after `offerAt`. */
      readonly slaEndsAt: Date;
      /** True when `offerAt` is later than `now`: the job reschedules and writes nothing. */
      readonly deferred: boolean;
      /** True when the order is due on the destination-local day of `offerAt`. */
      readonly sameDay: boolean;
      /** The routing deadline the SLA was capped at. */
      readonly deadline: Date;
    }
  | {
      readonly kind: "deadline_passed";
      /** The routing deadline, at or before the would-be offer time. */
      readonly deadline: Date;
    };

/**
 * **`offerWindow(now, deliveryDate, destination)`** — the offer time and SLA end of §5.2, the
 * first matching rule winning:
 *
 *  1. **Night first** — 20:00 to 07:30 local: offer at the next 07:30; SLA to 08:00 for an order
 *     due that day, to 09:00 otherwise. So a same-day order secured at 06:00 is offered at 07:30,
 *     not at once (no florist is woken), and is not exhausted overnight.
 *  2. 07:30 to 08:00: offer now; SLA to 08:00 for an order due today, to 09:00 otherwise.
 *  3. 08:00 to 20:00, due today: offer now, SLA 30 minutes.
 *  4. 08:00 to 20:00, due later: offer now, SLA 60 minutes.
 *
 * Boundaries are half-open on the local minute: 07:30:00 is rule 2, 08:00:00 rule 3 or 4, 20:00:00
 * rule 1. "Due today" is read on the destination-local day **of the offer** (a night order paid at
 * 21:00 for delivery tomorrow is offered at 07:30 on its delivery day, and is due that day).
 *
 * The SLA end is capped at the routing deadline. When the offer time is not before the deadline,
 * there is no window left (`deadline_passed`): the caller exhausts the order (§5.2 `order.route`).
 */
export function offerWindow(
  now: Date,
  deliveryDate: IsoDate,
  destination: RoutingDestination,
): OfferWindow {
  const zone = destination.ianaZone;
  const deadline = routingDeadline(deliveryDate, destination);
  const localDate = zonedDate(now, zone);
  const minute = zonedMinuteOfDay(now, zone);
  const nightStarts = minuteOfDay(ROUTING_WINDOWS.nightStartsLocal);
  const offersFrom = minuteOfDay(ROUTING_WINDOWS.offersFromLocal);
  const dayStarts = minuteOfDay(ROUTING_WINDOWS.dayStartsLocal);

  const capped = (offerAt: Date, slaEnd: Date, sameDay: boolean): OfferWindow => {
    const slaEndsAt = earliest(slaEnd, deadline);
    if (slaEndsAt.getTime() <= offerAt.getTime()) {
      return { kind: "deadline_passed", deadline };
    }
    return {
      kind: "offer",
      offerAt,
      slaEndsAt,
      deferred: offerAt.getTime() > now.getTime(),
      sameDay,
      deadline,
    };
  };

  const early = (offerDate: IsoDate, offerAt: Date): OfferWindow => {
    const sameDay = deliveryDate === offerDate;
    const slaLocal = sameDay
      ? ROUTING_WINDOWS.earlySlaEndSameDayLocal
      : ROUTING_WINDOWS.earlySlaEndLocal;
    return capped(
      offerAt,
      instantAt(offerDate, minuteOfDay(slaLocal), zone),
      sameDay,
    );
  };

  // 1. Night first.
  if (minute >= nightStarts || minute < offersFrom) {
    const offerDate = minute >= nightStarts ? addDays(localDate, 1) : localDate;
    return early(offerDate, instantAt(offerDate, offersFrom, zone));
  }
  // 2. 07:30 to 08:00.
  if (minute < dayStarts) return early(localDate, now);
  // 3 and 4. Daytime.
  const sameDay = deliveryDate === localDate;
  return capped(
    now,
    plusMinutes(
      now,
      sameDay ? ROUTING_WINDOWS.sameDaySlaMinutes : ROUTING_WINDOWS.slaMinutes,
    ),
    sameDay,
  );
}

/**
 * **`graceEnd(exhaustedAt, deliveryDate, destination)`** — the instant an untaken
 * `no_partner_available` order is cancelled (founder 16-2, advisor's pick):
 *
 *  - **due today** (the delivery date is the destination-local day of `exhaustedAt`):
 *    `exhaustedAt` plus 2 hours;
 *  - **not due today**: the first 10:00 local at least 2 hours after `exhaustedAt` (21:00 gives
 *    10:00 the next morning, 06:00 gives 10:00 the same morning, 08:00:00 exactly gives 10:00 the
 *    same morning);
 *
 * both capped at the routing deadline, so the result is never after it.
 */
export function graceEnd(
  exhaustedAt: Date,
  deliveryDate: IsoDate,
  destination: RoutingDestination,
): Date {
  const zone = destination.ianaZone;
  const deadline = routingDeadline(deliveryDate, destination);
  const localDate = zonedDate(exhaustedAt, zone);
  if (deliveryDate === localDate) {
    return earliest(
      plusMinutes(exhaustedAt, NO_PARTNER_GRACE.dueTodayMinutes),
      deadline,
    );
  }
  const notBefore = plusMinutes(exhaustedAt, NO_PARTNER_GRACE.minimumMinutes);
  const morning = minuteOfDay(NO_PARTNER_GRACE.morningLocal);
  let candidate = instantAt(localDate, morning, zone);
  for (
    let day = 1;
    candidate.getTime() < notBefore.getTime();
    day += 1
  ) {
    candidate = instantAt(addDays(localDate, day), morning, zone);
  }
  return earliest(candidate, deadline);
}

/** What `expectedFirstOfferAt` reads off an order. */
export interface FirstOfferInput {
  /** When the payment was secured (`order.captured` from `placed`). */
  readonly securedAt: Date;
  readonly deliveryDate: IsoDate;
  readonly destination: RoutingDestination;
}

/**
 * **`expectedFirstOfferAt(order)`** — when the first offer is due, for spec 013's "secured but not
 * routed" check (§12): `offerWindow`'s offer time from the moment the payment was secured, so a
 * night-deferred order does not alert at 23:00. An order already past its routing deadline is
 * due to be handled at once (it goes to `no_partner_available`), so the answer is `securedAt`.
 */
export function expectedFirstOfferAt(order: FirstOfferInput): Date {
  const window = offerWindow(
    order.securedAt,
    order.deliveryDate,
    order.destination,
  );
  return window.kind === "offer" ? window.offerAt : order.securedAt;
}
