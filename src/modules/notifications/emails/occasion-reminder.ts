/**
 * T18 `occasion_reminder`, the occasion reminder (spec 018 §14 A-founder-2026-10-22 C.7.4, C.15
 * `emails.account.reminder.*`; AC-57; `docs/design/wireframes/email-account-*` T18; TASK-353).
 *
 * In the customer's `preferred_locale` (else the latest live order's, else `en`; the caller
 * resolves it). The date as the heading, one sentence naming the occasion (and the saved
 * recipient's first name when there is one), the "still time" line, one "Choose flowers" button to
 * the destination's occasion or country page, and the account frame whose foot says why it came
 * and links "Stop reminders". The subject names the occasion and the date only: never a name.
 *
 * **What it cannot say, by construction** (AC-57): `OccasionReminderEmailPropsSchema` is
 * `.strict()` and has no field for a price, an amount, a currency, a product, a year or an age,
 * so the template has nothing of the kind to print. The occasion's word is the catalogue's,
 * capitalised for the subject (`occasionTitle`) and lower-case inside the sentence (`occasion`),
 * the designer's escalation on `email-account-*`.
 */
import { z } from "zod";

import { type LocaleCode, isLocaleCode } from "@/config/locales";
import { formatDate } from "@/modules/i18n";

import {
  emailTranslator,
  occasionReminderFooterText,
  occasionReminderFrame,
} from "./copy";
import { firstNameOf } from "./first-name";
import { el, type SafeHtml } from "./html";
import { button, emailDocument, heading, paragraph } from "./layout";
import { colour } from "./theme";

const HttpsUrl = z.url({ protocol: /^https$/u });

/** T18's whole input: no price, amount, currency, product, year or age (AC-57). */
export const OccasionReminderEmailPropsSchema = z
  .object({
    locale: z.string().refine(isLocaleCode),
    occasionKey: z.enum(["birthday", "anniversary", "name_day", "other"]),
    /** The occurrence on the UTC calendar; only its day and month are printed. */
    occurrence: z.iso.date(),
    /** The saved recipient's full name, or `null`; only the first name is printed. */
    recipientName: z.string().trim().min(1).max(200).nullable(),
    chooseUrl: HttpsUrl,
    /** The visible "Stop reminders" link: the unsubscribe page. */
    stopUrl: HttpsUrl,
  })
  .strict();
export type OccasionReminderEmailProps = z.input<
  typeof OccasionReminderEmailPropsSchema
>;

export interface RenderedOccasionReminderEmail {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

/** Day and month, no year (C.15: `{ day: 'numeric', month: 'long' }`), on the UTC calendar. */
export function reminderDayMonth(isoDate: string, locale: LocaleCode): string {
  return formatDate(
    new Date(`${isoDate}T12:00:00Z`),
    locale,
    "dayMonth",
    "UTC",
  );
}

function link(label: string, href: string): SafeHtml {
  return el(
    "a",
    {
      href,
      style: {
        color: colour("link"),
        "text-decoration": "underline",
        "text-underline-offset": "3px",
      },
    },
    label,
  );
}

/** T18: subject, HTML part in the account frame, plain text. */
export function renderOccasionReminderEmail(
  input: OccasionReminderEmailProps,
): RenderedOccasionReminderEmail {
  const props = OccasionReminderEmailPropsSchema.parse(input);
  const locale = props.locale as LocaleCode;
  const t = emailTranslator(locale);
  const date = reminderDayMonth(props.occurrence, locale);
  const subject = t("emails.account.reminder.subject", {
    occasion: t("emails.account.reminder.occasionTitle", {
      key: props.occasionKey,
    }),
    date,
  });
  const body = t("emails.account.reminder.body", {
    name:
      props.recipientName === null ? "none" : firstNameOf(props.recipientName),
    occasion: t("emails.account.reminder.occasion", { key: props.occasionKey }),
    date,
  });
  const time = t("emails.account.reminder.time");
  const action = t("emails.account.reminder.button");
  const html = emailDocument({
    locale,
    subject,
    preheader: time,
    frame: occasionReminderFrame(t, props.stopUrl, link),
    blocks: [
      heading(date),
      paragraph("body", body),
      paragraph("body", time),
      button(action, props.chooseUrl),
    ],
  });
  const textPart = [
    `${body} ${time}`,
    `${action}:\n${props.chooseUrl}`,
    occasionReminderFooterText(t, props.stopUrl),
  ].join("\n\n");
  return { subject, html, text: `${textPart}\n` };
}
