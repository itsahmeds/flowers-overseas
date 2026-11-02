/**
 * The no-partner auto-cancel time as the admin panel shows it (spec 020a §2.2, §5.3 "Action
 * panel", §7 "Formatting", AC-12; TASK-358).
 *
 * For a `no_partner_available` order the panel reads "Cancelled automatically at {time} ({zone})
 * unless rerouted", once in the destination's zone and once in the viewer's
 * (`admin_profile.time_zone`), each with its zone named. Both lines are the **same instant**:
 * spec 016's `graceEnd(exhaustedAt, deliveryDate, destination)`, the one the expiry job is
 * scheduled at, so the panel, the A1 email and the job cannot disagree. This module adds no rule:
 * it reads that instant's wall clock in two zones. Formatting the words is the page's (`Intl`
 * through `format.ts`, TASK-361); here the date and the minute are plain data.
 *
 * Pure: no clock, no database.
 */
import { zonedDate, zonedMinuteOfDay } from "@/modules/geo";

import { graceEnd, type RoutingDestination } from "./windows";

/** One zone's reading of the grace end. */
export interface ZonedReading {
  /** The IANA zone, named on the panel beside the time. */
  readonly zone: string;
  /** `YYYY-MM-DD` on that zone's calendar. */
  readonly date: string;
  /** `HH:MM` on that zone's wall clock, 24-hour. */
  readonly time: string;
}

export interface GraceEndDisplay {
  /** `graceEnd`, the instant itself. */
  readonly at: Date;
  readonly destination: ZonedReading;
  readonly viewer: ZonedReading;
}

/** What `graceEndDisplay` needs: the exhaustion's instant, the date and the destination. */
export interface GraceEndInput {
  readonly exhaustedAt: Date;
  readonly deliveryDate: string;
  readonly destination: RoutingDestination;
}

function reading(at: Date, zone: string): ZonedReading {
  const minutes = zonedMinuteOfDay(at, zone);
  const hour = String(Math.trunc(minutes / 60)).padStart(2, "0");
  const minute = String(minutes % 60).padStart(2, "0");
  return { zone, date: zonedDate(at, zone), time: `${hour}:${minute}` };
}

/**
 * **`graceEndDisplay(input, viewerZone)`**: spec 016's `graceEnd` for the order, read in the
 * destination's zone and in `viewerZone`.
 */
export function graceEndDisplay(
  input: GraceEndInput,
  viewerZone: string,
): GraceEndDisplay {
  const at = graceEnd(input.exhaustedAt, input.deliveryDate, input.destination);
  return {
    at,
    destination: reading(at, input.destination.ianaZone),
    viewer: reading(at, viewerZone),
  };
}
