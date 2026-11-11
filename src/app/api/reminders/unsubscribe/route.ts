/**
 * @purpose POST: the occasion reminder's one-click stop (RFC 8058)
 * @spec 018
 *
 * `POST /api/reminders/unsubscribe?t=` (spec 018 §14 A-founder-2026-10-22 C.7.4, C.12; AC-58;
 * TASK-353): the `List-Unsubscribe` target of every T18. Thin glue: `reminderOneClickResponse`
 * decides. `GET` answers 405; the visible link goes to `/{locale}/account/reminders/unsubscribe`.
 */
import {
  reminderOneClickMethodNotAllowed,
  reminderOneClickResponse,
} from "@/modules/customers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function POST(request: Request): Promise<Response> {
  return reminderOneClickResponse(request);
}

export function GET(): Response {
  return reminderOneClickMethodNotAllowed();
}
