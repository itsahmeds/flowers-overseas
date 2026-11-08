/**
 * Quiet hours and the order-at-risk override, pure (spec 025 §5.5 rules (a), (b), (c); AC-7,
 * AC-8, AC-15; TASK-488).
 *
 * The window comes from `ops_alert_setting`, may span midnight, and is evaluated in its IANA zone
 * through the i18n module's zone clock, so a DST change night is the zone database's job, not
 * arithmetic here. Boundaries: the window includes its start minute and excludes its end minute
 * (23:00 is quiet, 07:00 is not).
 *
 *  - (a) a P1 pages, except an **order** P1 whose `act_by` is later than quiet end plus 60 minutes:
 *    it is held until quiet end (nothing is lost by waiting);
 *  - (b) a P2 is held, except an **order** P2 whose `act_by` falls before quiet end plus 60
 *    minutes: it pages as a P1 (the override);
 *  - (c) a P3 never pushes (`email_only`, which for a P3 means the summary and the log).
 */
import { QUIET_OVERRIDE_MINUTES } from "@/config/alerts";
import { wallClockToInstant, zonedClock } from "@/modules/i18n";

import type { Severity } from "./registry.ts";
import type { AlertSetting } from "./schemas.ts";

export type QuietDecision = "page" | "hold" | "email_only";

/** What the rule reads off an alert. */
export interface QuietSubject {
  readonly severity: Severity;
  readonly scope: "order" | "component";
  readonly actBy: Date | null;
}

const MINUTE_MS = 60_000;

function minutesOf(clock: string): number {
  const [hours = "0", minutes = "0"] = clock.split(":");
  return Number(hours) * 60 + Number(minutes);
}

function localMinute(now: Date, timeZone: string): number {
  const clock = zonedClock(now, timeZone);
  return clock.hour * 60 + clock.minute;
}

/** True when `now` falls inside the quiet window, in the setting's zone. */
export function inQuietHours(setting: AlertSetting, now: Date): boolean {
  const minute = localMinute(now, setting.timeZone);
  const start = minutesOf(setting.quietStart);
  const end = minutesOf(setting.quietEnd);
  return start < end
    ? minute >= start && minute < end
    : minute >= start || minute < end;
}

/** `YYYY-MM-DD` of the local date `days` after `now`'s, in `timeZone` (calendar arithmetic only). */
export function localDate(now: Date, timeZone: string, days = 0): string {
  const clock = zonedClock(now, timeZone);
  const shifted = new Date(
    Date.UTC(clock.year, clock.month - 1, clock.day + days),
  );
  return shifted.toISOString().slice(0, 10);
}

/** The instant of `HH:MM` on local date `date` in `timeZone`. */
export function localInstant(
  date: string,
  clock: string,
  timeZone: string,
): Date {
  const instant = wallClockToInstant(`${date}T${clock}`, timeZone);
  if (instant === null) throw new Error("unreadable local time");
  return instant;
}

/**
 * The next end of the quiet window at or after `now` (today's end when `now` is before it, else
 * tomorrow's), in the setting's zone.
 */
export function quietEndAfter(setting: AlertSetting, now: Date): Date {
  const today = localInstant(
    localDate(now, setting.timeZone),
    setting.quietEnd,
    setting.timeZone,
  );
  if (today.getTime() > now.getTime()) return today;
  return localInstant(
    localDate(now, setting.timeZone, 1),
    setting.quietEnd,
    setting.timeZone,
  );
}

/** The whole rule of §5.5 for one alert at `now`. */
export function quietHoursDecision(
  alert: QuietSubject,
  setting: AlertSetting,
  now: Date,
): QuietDecision {
  if (alert.severity === "P3") return "email_only";
  if (!inQuietHours(setting, now)) return "page";
  const horizon =
    quietEndAfter(setting, now).getTime() + QUIET_OVERRIDE_MINUTES * MINUTE_MS;
  const orderActBy =
    alert.scope === "order" && alert.actBy !== null
      ? alert.actBy.getTime()
      : null;
  if (alert.severity === "P1") {
    return orderActBy !== null && orderActBy > horizon ? "hold" : "page";
  }
  return orderActBy !== null && orderActBy < horizon ? "page" : "hold";
}

/**
 * The Pushover priority a page goes out at: 2 for a P1, and for a P2 the override promotes inside
 * quiet hours; 1 for any other P2. Null when the decision is not `page`.
 */
export function pagePriority(
  alert: QuietSubject,
  setting: AlertSetting,
  now: Date,
): 2 | 1 | null {
  if (quietHoursDecision(alert, setting, now) !== "page") return null;
  if (alert.severity === "P1") return 2;
  return inQuietHours(setting, now) ? 2 : 1;
}
