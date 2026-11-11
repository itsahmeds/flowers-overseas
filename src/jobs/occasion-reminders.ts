/**
 * `reminders.daily` (spec 018 §14 A-founder-2026-10-22 C.7.4, C.12, C.17; AC-57; TASK-353): the
 * minute tick enqueues one a day, not before 07:00 UTC; this file wires its dependencies at call
 * time (the flag, the mailer, the site origin, the listing existence rule) and hands the work to
 * `runOccasionReminders`, which claims and sends each due reminder once.
 *
 * T18's links: "Choose flowers" goes to the destination's occasion page when it exists, else that
 * country's shop, else the locale home (`email-account-*` T18 "Button"); the destination is the
 * saved recipient's country, else the latest live order's. The two stop links carry only the
 * signed `t` (purpose `unsubscribe`): the `List-Unsubscribe` header points at the one-click
 * `POST /api/reminders/unsubscribe`, the visible link at the confirm page. Nothing reads a
 * database or the environment at import.
 */
import type { LocaleCode } from "../config/locales";
import { isEnabled } from "../lib/flags";
import { logger } from "../lib/logger";
import { captureAlert } from "../lib/sentry";
import { listingHref } from "../modules/catalog";
import {
  type DueReminder,
  type OccasionKey,
  type OccasionReminderRun,
  reminderUnsubscribeLinkToken,
  runOccasionReminders,
  systemAccountRunner,
} from "../modules/customers";
import { getMailer, type Mailer } from "../modules/notifications";
import { renderOccasionReminderEmail } from "../modules/notifications/emails";

/** The flag that gates the page and the email (C.7.4; `0045`). */
export const REMINDERS_FLAG = "account.reminders";

/** The catalogue occasion of each reminder occasion; `other` has none. */
const CATALOGUE_OCCASION: Readonly<Record<OccasionKey, string | null>> = {
  birthday: "birthday",
  anniversary: "anniversary",
  name_day: "name_day",
  other: null,
};

type ListingHref = (identity: unknown) => Promise<string | undefined>;

/**
 * T18's "Choose flowers" path: the country's occasion page, else its shop, else the locale home.
 * Only a page that exists is linked (`listingHref`).
 */
export async function reminderDestinationPath(
  locale: LocaleCode,
  countryIso2: string | null,
  occasionKey: OccasionKey,
  href: ListingHref = listingHref,
): Promise<string> {
  if (countryIso2 !== null) {
    const occasion = CATALOGUE_OCCASION[occasionKey];
    if (occasion !== null) {
      const page = await href({
        pageType: "countryOccasion",
        locale,
        countryIso: countryIso2,
        entityKey: occasion,
      });
      if (page !== undefined) return page;
    }
    const shop = await href({
      pageType: "countryShopRoot",
      locale,
      countryIso: countryIso2,
    });
    if (shop !== undefined) return shop;
  }
  return `/${locale}`;
}

/** The three URLs of one T18, absolute on `origin`. */
export function reminderLinks(
  origin: string,
  reminder: Pick<DueReminder, "locale" | "unsubscribeToken">,
  path: string,
): { chooseUrl: string; stopUrl: string; oneClickUrl: string } {
  const t = encodeURIComponent(
    reminderUnsubscribeLinkToken(reminder.unsubscribeToken),
  );
  return {
    chooseUrl: `${origin}${path}`,
    stopUrl: `${origin}/${reminder.locale}/account/reminders/unsubscribe?t=${t}`,
    oneClickUrl: `${origin}/api/reminders/unsubscribe?t=${t}`,
  };
}

/** Builds and sends T18 for one due reminder (AC-57): two RFC 8058 headers, one idempotency key. */
export async function sendOccasionReminder(
  reminder: DueReminder,
  deps: {
    readonly mailer: Mailer;
    readonly origin: string;
    readonly destinationPath?: typeof reminderDestinationPath;
  },
): Promise<void> {
  const path = await (deps.destinationPath ?? reminderDestinationPath)(
    reminder.locale,
    reminder.countryIso2,
    reminder.occasionKey,
  );
  const links = reminderLinks(deps.origin, reminder, path);
  const email = renderOccasionReminderEmail({
    locale: reminder.locale,
    occasionKey: reminder.occasionKey,
    occurrence: reminder.occurrence,
    recipientName: reminder.recipientName,
    chooseUrl: links.chooseUrl,
    stopUrl: links.stopUrl,
  });
  await deps.mailer.send({
    tag: "occasion_reminder",
    to: reminder.email,
    subject: email.subject,
    text: email.text,
    html: email.html,
    idempotencyKey: `occasion_reminder:${reminder.id}:${reminder.occurrence}`,
    headers: {
      "List-Unsubscribe": `<${links.oneClickUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
}

/** `account.reminders`; a flag that cannot be read is off (nothing is sent). */
async function remindersFlagOn(): Promise<boolean> {
  try {
    return await isEnabled(REMINDERS_FLAG);
  } catch (error) {
    logger.warn(
      { error_name: error instanceof Error ? error.name : "unknown" },
      "reminders.flag_unreadable",
    );
    return false;
  }
}

/** `reminders.daily`; a failed run raises the C.17 alert and throws, so pg-boss retries it. */
export async function runRemindersDaily(
  now: Date = new Date(),
): Promise<OccasionReminderRun> {
  const mailer = getMailer();
  const origin = (process.env["NEXT_PUBLIC_SITE_URL"] ?? "").replace(
    /\/+$/u,
    "",
  );
  try {
    return await runOccasionReminders(now, {
      system: systemAccountRunner("reminders.daily"),
      flagOn: remindersFlagOn,
      send: (reminder) => sendOccasionReminder(reminder, { mailer, origin }),
    });
  } catch (error) {
    captureAlert("reminders.daily_failed");
    throw error;
  }
}
