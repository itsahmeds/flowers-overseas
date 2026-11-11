/**
 * The words of the florist and buyer emails, and the two public frames of the layout (spec 016 §7
 * "Message keys"; artboard `email-layout-*.dc.html`, "Copy"; TASK-332).
 *
 * One translator per message, over the namespaces an email reads: `emails` (the layout and the
 * florist emails), `whatsapp` (the W paste text), `floristInbox` (spec 011 Appendix A's verbatim
 * labels: "Answer by {time}", "For {date}", "Add the photo"), `catalog` (the tier and add-on
 * names the order carries as keys) and `company` (the footer's description and help label). Keys
 * held as data (a tier's `labelKey`, an add-on's `catalog.addon.*.name`) are resolved through the
 * same translator, the cast `src/modules/partners/ui/inbox/format.ts` documents.
 *
 * The founder's emails (A1, W) are English only and read the admin catalogue through
 * `src/modules/admin`; nothing here reads that catalogue.
 */
import { createTranslator } from "next-intl";

import { COMPANY, isCompanyRegistered } from "@/config/company";
import { TRADING_NAME } from "@/config/company.data";
import type { LocaleCode } from "@/config/locales";
import { loadMessages } from "@/modules/i18n";

import { fragment, type SafeHtml, text } from "./html";
import type { EmailFrame } from "./layout";
import { numeric, strong } from "./layout";

type Values = Readonly<Record<string, string | number>>;

/** A translator over the email namespaces that takes a key held as data. */
export interface EmailTranslator {
  (key: string, values?: Values): string;
  /** A message with tags, each tag's chunks returned as they are (plain text). */
  plain(key: string, values?: Values): string;
}

const NAMESPACES = [
  "emails",
  "whatsapp",
  "floristInbox",
  "catalog",
  "company",
  // The buyer emails (TASK-333): the tracking page's status labels, refund line, photo alt text
  // and eyebrow (spec 016 §5.2: the same words as spec 018's page), the confirmation's preheader
  // and the pay step's cancellation sentence (`checkout.legal.cancellation`).
  "tracking",
  "payments",
  "checkout",
] as const;

type LooseTranslate = (key: string, values?: Values) => string;
type LooseMarkup = (
  key: string,
  values?: Readonly<
    Record<string, string | number | ((chunks: string) => string)>
  >,
) => string;

/** The email translator of `locale` (a florist's language or a buyer's locale). */
export function emailTranslator(locale: LocaleCode): EmailTranslator {
  const t = createTranslator({
    locale,
    messages: loadMessages(locale, NAMESPACES),
    // A missing key or a bad argument throws (AC-21: no missing message key): the delivery is
    // retried and, if it never renders, marked `dead`, rather than mailing a key path.
    onError: (error) => {
      throw error;
    },
  });
  const translate = t as unknown as LooseTranslate;
  const markup = (t as unknown as { markup: LooseMarkup }).markup;
  const untag = (chunks: string): string => chunks;
  return Object.assign(
    (key: string, values?: Values) => translate(key, values),
    {
      plain: (key: string, values?: Values) =>
        markup(key, { ...values, strong: untag, b: untag }),
    },
  );
}

/** The support phone as every email prints it. */
export function supportPhone(): string {
  return COMPANY.contact.phoneDisplay;
}

/** "Help & WhatsApp +1 (213) 592-5150. {sentence}": the help line, label in bold. */
function helpLine(t: EmailTranslator, sentenceKey: string): SafeHtml {
  return fragment(
    strong(t(COMPANY.contact.labelKey)),
    " ",
    numeric(supportPhone()),
    ". ",
    t(sentenceKey),
  );
}

function helpLineText(t: EmailTranslator, sentenceKey: string): string {
  return `${t(COMPANY.contact.labelKey)}: ${supportPhone()}. ${t(sentenceKey)}`;
}

/** The florist help line as plain text (spec 030a's statement PDF prints it in its fine print). */
export function floristHelpText(t: EmailTranslator): string {
  return helpLineText(t, "emails.layout.floristHelp");
}

/** The florist frame: "For our florists"; help, then why. */
export function floristFrame(t: EmailTranslator): EmailFrame {
  return {
    audience: "florist",
    audienceLabel: t("emails.layout.audience.florist"),
    brand: TRADING_NAME,
    footer: [
      { html: helpLine(t, "emails.layout.floristHelp"), ink: true },
      { html: text(t("emails.layout.floristWhy")) },
    ],
  };
}

/** The florist frame's footer as plain text, after the `--` line. */
export function floristFooterText(t: EmailTranslator): string {
  return [
    "--",
    helpLineText(t, "emails.layout.floristHelp"),
    t("emails.layout.floristWhy"),
  ].join("\n");
}

/**
 * The trader identity line, or null while the company is not registered (the colophon's rule,
 * `src/modules/ui/layout/footerView.ts`: the address printed inline, joined with ", ").
 */
function operatedBy(t: EmailTranslator): string | null {
  if (!isCompanyRegistered()) return null;
  const { legalName, address, registrationNumber } = COMPANY;
  if (
    legalName === undefined ||
    address === undefined ||
    registrationNumber === undefined
  ) {
    return null;
  }
  return t(COMPANY.operatedByKey, {
    legalName,
    address: [...address.lines, address.postalCode, address.city].join(", "),
    registrationNumber,
  });
}

/**
 * The buyer frame: what we do, help and WhatsApp with the hours, the trader identity (only once
 * the company is registered), and why this email came, naming the order's reference.
 */
export function buyerFrame(t: EmailTranslator, reference: string): EmailFrame {
  const identity = operatedBy(t);
  return {
    audience: "buyer",
    audienceLabel: null,
    brand: TRADING_NAME,
    footer: [
      { html: text(t(COMPANY.descriptionKey)) },
      { html: helpLine(t, "emails.layout.buyerHours"), ink: true },
      ...(identity === null ? [] : [{ html: text(identity) }]),
      { html: text(t("emails.layout.buyerWhy", { reference })) },
    ],
  };
}

/**
 * The buyer frame of an email about the account rather than an order (spec 018 §14 C.3, T14): the
 * same footer as `buyerFrame`, with its last line saying why the address received it, no reference.
 */
export function accountFrame(t: EmailTranslator, whyKey: string): EmailFrame {
  const identity = operatedBy(t);
  return {
    audience: "buyer",
    audienceLabel: null,
    brand: TRADING_NAME,
    footer: [
      { html: text(t(COMPANY.descriptionKey)) },
      { html: helpLine(t, "emails.layout.buyerHours"), ink: true },
      ...(identity === null ? [] : [{ html: text(identity) }]),
      { html: text(t(whyKey)) },
    ],
  };
}

/** `accountFrame`'s footer as plain text, after the `--` line. */
export function accountFooterText(t: EmailTranslator, whyKey: string): string {
  const identity = operatedBy(t);
  return [
    "--",
    t(COMPANY.descriptionKey),
    helpLineText(t, "emails.layout.buyerHours"),
    ...(identity === null ? [] : [identity]),
    t(whyKey),
  ].join("\n");
}

/**
 * T18's frame (spec 018 §14 C.7.4; `email-account-*` T18; TASK-353): the account frame, whose last
 * line says why the address received it, then the visible "Stop reminders" link to the unsubscribe
 * page (C.16: one-click withdrawal in every email, besides the `List-Unsubscribe` header).
 */
export function occasionReminderFrame(
  t: EmailTranslator,
  stopUrl: string,
  link: (label: string, href: string) => SafeHtml,
): EmailFrame {
  const frame = accountFrame(t, "emails.account.reminder.why");
  return {
    ...frame,
    footer: [
      ...frame.footer,
      { html: link(t("emails.account.reminder.stop"), stopUrl) },
    ],
  };
}

/** T18's footer as plain text, after the `--` line. */
export function occasionReminderFooterText(
  t: EmailTranslator,
  stopUrl: string,
): string {
  return [
    accountFooterText(t, "emails.account.reminder.why"),
    `${t("emails.account.reminder.stop")}: ${stopUrl}`,
  ].join("\n");
}

/** The buyer frame's footer as plain text, after the `--` line. */
export function buyerFooterText(t: EmailTranslator, reference: string): string {
  const identity = operatedBy(t);
  return [
    "--",
    t(COMPANY.descriptionKey),
    helpLineText(t, "emails.layout.buyerHours"),
    ...(identity === null ? [] : [identity]),
    t("emails.layout.buyerWhy", { reference }),
  ].join("\n");
}

/** The links R1's footer carries (spec 034 §5.2 "Rendering contract of R1"). */
export interface BasketReminderFooterLinks {
  readonly unsubscribeUrl: string;
  readonly privacyUrl: string;
}

/**
 * R1's frame (spec 034 §5.3, drawn in `email-basket-reminder-*.dc.html`): why it was sent and
 * that it is the only one, the visible "Stop basket emails" link beside the privacy link, the help
 * line and the trader identity. No reference: the reminder is about a basket, not an order.
 */
export function basketReminderFrame(
  t: EmailTranslator,
  links: BasketReminderFooterLinks,
  link: (label: string, href: string) => SafeHtml,
): EmailFrame {
  const identity = operatedBy(t);
  return {
    audience: "buyer",
    audienceLabel: null,
    brand: TRADING_NAME,
    footer: [
      { html: text(t("emails.basketReminder.why")) },
      {
        html: fragment(
          link(t("emails.basketReminder.stop"), links.unsubscribeUrl),
          " · ",
          link(t("emails.basketReminder.privacy"), links.privacyUrl),
        ),
      },
      { html: helpLine(t, "emails.layout.buyerHours"), ink: true },
      ...(identity === null ? [] : [{ html: text(identity) }]),
    ],
  };
}

/** R1's footer as plain text, after the `--` line. */
export function basketReminderFooterText(
  t: EmailTranslator,
  links: BasketReminderFooterLinks,
): string {
  const identity = operatedBy(t);
  return [
    "--",
    t("emails.basketReminder.why"),
    `${t("emails.basketReminder.stop")}: ${links.unsubscribeUrl}`,
    `${t("emails.basketReminder.privacy")}: ${links.privacyUrl}`,
    helpLineText(t, "emails.layout.buyerHours"),
    ...(identity === null ? [] : [identity]),
  ].join("\n");
}
