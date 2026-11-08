/**
 * The alert log's admin paths (spec 025 §5.3; TASK-488). Admin owns every `/admin` path
 * (spec 012 AC-6), so the ops module's push and email links are built from these, handed in by
 * the job worker; the pages themselves are TASK-490's.
 */
import { z } from "zod";

/** `/admin/alerts`: the alert log. */
export function alertsListHref(): string {
  return "/admin/alerts";
}

/** `/admin/alerts/{id}`: one alert, by its UUID (never an order id or reference). */
export function alertDetailHref(alertId: string): string {
  return `/admin/alerts/${z.uuid().parse(alertId)}`;
}
