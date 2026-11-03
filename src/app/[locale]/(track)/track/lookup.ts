/**
 * @purpose Tracking lookup's seams and answer path
 * @spec 018
 *
 * What the lookup's server action (`./actions.ts`) wires and where it lands (spec 018 §5.2
 * `lookupTracking`, "Rate limits", "Emails"; §5.3 `track`; AC-8; TASK-339). Kept out of the
 * `"use server"` file, which may export only the action itself: anything exported there would be
 * a public endpoint.
 *
 *  - `runLookup` runs `lookupTracking` (`src/modules/orders/tracking-lookup.ts`) with the `track`
 *    send counter (3 per hour per hashed address), T16 through the one `Mailer`, and live orders
 *    only in production. It never throws: a failure logs its error name and a constant Sentry
 *    signal, never the reference, the address or the link.
 *  - `lookupSentPath(locale)` is `/{locale}/track?sent=1`, the one page every lookup lands on.
 */
import type { LocaleCode } from "@/config/locales";
import { claimSend } from "@/lib/auth/send-limit";
import { environment } from "@/lib/env";
import { logger } from "@/lib/logger";
import { captureWarning } from "@/lib/sentry";
import { localePath } from "@/modules/i18n";
import { getMailer } from "@/modules/notifications";
import { renderTrackingLinkEmail } from "@/modules/notifications/emails";
import {
  lookupTracking,
  TRACKING_LOOKUP_LIMIT,
  TRACKING_LOOKUP_SCOPE,
  type TrackingLinkMail,
  type TrackingLookupDeps,
} from "@/modules/orders";

/** The query the lookup page reads to show its one "sent" message. */
export const SENT_PARAM = "sent";

/** Where every lookup lands: the lookup page of `locale` with its sent message. */
export function lookupSentPath(locale: LocaleCode): string {
  return `${localePath(locale, "home", "track")}?${SENT_PARAM}=1`;
}

/** T16 through the one `Mailer` (spec 012), tagged `tracking_link`. */
export async function sendTrackingLink(mail: TrackingLinkMail): Promise<void> {
  const rendered = renderTrackingLinkEmail({
    locale: mail.locale,
    reference: mail.reference,
    link: mail.link,
  });
  await getMailer().send({
    tag: "tracking_link",
    to: mail.to,
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
  });
}

/** The production seams of `lookupTracking`. */
export function lookupDeps(): TrackingLookupDeps {
  return {
    claim: (email) =>
      claimSend(email, {
        limit: TRACKING_LOOKUP_LIMIT,
        scope: TRACKING_LOOKUP_SCOPE,
      }),
    send: sendTrackingLink,
    sendsNonLive: environment !== "production",
  };
}

/** The lookup itself, after the response: never throws, logs the outcome only. */
export async function runLookup(
  input: { readonly reference: unknown; readonly email: unknown },
  locale: LocaleCode,
  deps: TrackingLookupDeps = lookupDeps(),
): Promise<void> {
  try {
    await lookupTracking(input, locale, deps);
  } catch (error) {
    const name = error instanceof Error ? error.name : "unknown";
    logger.error({ error: name }, "tracking.lookup_failed");
    captureWarning("tracking.lookup_failed");
  }
}
