/**
 * @purpose Tracking calendar file
 * @spec 018
 *
 * `GET /{locale}/track/{token}/calendar.ics` (spec 018 §5.3, AC-11, AC-12; TASK-338): one all-day
 * event on the delivery date, its summary "Flowers delivered in {city}" in the URL's locale and
 * nothing about the recipient. 404 for any token failure and for an unknown locale. The work is
 * `calendarResponse()`.
 */
import { isLocaleCode } from "@/config/locales";
import { routableLocale } from "@/modules/i18n";

import { calendarResponse, trackNotFound } from "../tracking-routes";

export const dynamic = "force-dynamic";

/** The host the event's `UID` is scoped to: the site origin's. */
function siteHost(): string {
  const origin = process.env["NEXT_PUBLIC_SITE_URL"] ?? "http://localhost:3000";
  return URL.canParse(origin) ? new URL(origin).hostname : "localhost";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string; token: string }> },
): Promise<Response> {
  const { locale: requested, token } = await params;
  const locale = routableLocale(requested)?.code;
  if (locale === undefined || !isLocaleCode(locale)) return trackNotFound();
  return calendarResponse(token, locale, { host: siteHost() });
}
