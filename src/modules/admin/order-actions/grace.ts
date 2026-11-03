/**
 * The no-partner grace end, as the action panel and the reroute dialog print it (spec 020a §2.2,
 * §5.3 "Action panel", §7 "Formatting", AC-12; TASK-358).
 *
 * Spec 016's `graceEnd` is one absolute instant. The panel shows it twice, each with its zone
 * named: in the viewer's zone (`admin_profile.time_zone`), which is how every admin instant reads,
 * and in the destination's zone, the delivery's own time. Pure: the caller passes the instant and
 * both zones; formatting goes through `formatDate` only (`Intl`, no hand-built time).
 */
import { formatDate } from "@/modules/i18n";

import { zoneCity } from "../audit.ts";

export interface ZonedTime {
  /** "10:00", 24-hour, in `zone`. */
  readonly time: string;
  /** The IANA zone, e.g. "Europe/Warsaw". */
  readonly zone: string;
  /** The zone's city, as the admin shell names zones ("Warsaw"). */
  readonly city: string;
}

export interface GraceEndDisplay {
  readonly viewer: ZonedTime;
  readonly destination: ZonedTime;
}

function zoned(instant: Date, zone: string): ZonedTime {
  return {
    time: formatDate(instant, "en", "time", zone),
    zone,
    city: zoneCity(zone),
  };
}

/** `graceEnd` in the viewer's zone and in the destination's zone (AC-12). */
export function graceEndDisplay(
  graceEnd: Date,
  destinationZone: string,
  viewerZone: string,
): GraceEndDisplay {
  return {
    viewer: zoned(graceEnd, viewerZone),
    destination: zoned(graceEnd, destinationZone),
  };
}
