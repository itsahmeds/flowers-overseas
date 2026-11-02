/**
 * The five florist emails V1 to V5 and the florist half of the WhatsApp copy W (spec 016 §5.2
 * template table, §5.3, §7; AC-21, AC-22; artboards `email-florist-{desktop,mobile}.dc.html` and
 * the paste block of `email-founder-*.dc.html`; TASK-332).
 *
 *  - V1 `offer`: heading, the answer-by badge, the facts (bouquet and tier, add-ons, delivery
 *    date, town and postcode), what the florist receives, the one-tap button and its note, and the
 *    line that the recipient's details come with acceptance.
 *  - V2 `offer-reminder`: heading, the answer-by badge, the product line, the button.
 *  - V3 `order-confirmed`: heading, where the details are, the product line, the button.
 *  - V4 `offer-withdrawn`: heading, the stop box, the product line, and (after an acceptance
 *    only) the "if you have already started, call us" line. No link. A timeout has its own
 *    subject and a first line saying the time to answer has passed, and no "started" line: that
 *    florist never accepted.
 *  - V5 `photo-reminder`: heading, the thank-you line, the button.
 *
 * **What none of them carries** (spec 016 §8 "Minimisation", AC-22): the recipient's name,
 * street, phone or card message, or anything about the buyer. The input type has no such field,
 * so a template cannot print one; `tests/unit/email-florist.test.ts` also scans every render for
 * marker values. Every subject is built from the delivery date and the answer-by time only.
 *
 * Dates are the delivery date in the destination's zone ("Thu 8 Oct"), times the answer-by
 * instant in the destination's zone ("15:40"), money the florist's payout in its own currency,
 * all through the `i18n` module's formatters (`fo/no-adhoc-intl`).
 */
import { z } from "zod";

import { FLORIST_LANGUAGES, type FloristLanguage } from "@/config/florists";
import { TRADING_NAME } from "@/config/company.data";
import {
  MoneySchema,
  formatDate,
  formatList,
  formatMoney,
} from "@/modules/i18n";

import type { RenderedNotification } from "../templates";

import {
  type EmailTranslator,
  emailTranslator,
  floristFooterText,
  floristFrame,
  supportPhone,
} from "./copy";
import {
  type Block,
  answerBy,
  box,
  button,
  emailDocument,
  facts as factList,
  fragment,
  heading,
  note,
  numeric,
  paragraph,
  payoutRow,
  productName,
  strong,
} from "./layout";

/** The florist templates, by their `notification_delivery.template_key`. */
export const FLORIST_TEMPLATES = [
  "offer",
  "offer-reminder",
  "order-confirmed",
  "offer-withdrawn",
  "photo-reminder",
] as const;
export type FloristTemplate = (typeof FLORIST_TEMPLATES)[number];

/**
 * What a florist message may print about one order: the product, the date and place, the payout
 * and the deadline, and which shop it went to (for the founder's W copy). Nothing about a person.
 */
export const FloristMessageFactsSchema = z
  .object({
    assignmentId: z.uuid(),
    productName: z.string().min(1),
    /** A `catalog.tier.*` message key, and the count it takes. */
    tierLabelKey: z.string().regex(/^catalog\.tier\./u),
    tierStems: z.number().int().positive().nullable(),
    /** `catalog.addon.{key}.name` message keys. */
    addonKeys: z.array(z.string().regex(/^catalog\.addon\./u)),
    deliveryDate: z.iso.date(),
    /** The destination's IANA zone. */
    timeZone: z.string().min(3),
    town: z.string().min(1),
    postcode: z.string().min(1),
    payout: MoneySchema.nullable(),
    /** `order_assignment.sla_expires_at`. */
    answerBy: z.date(),
    /** The shop's code and name, for the founder's W copy only. */
    partnerCode: z.string().min(1),
    partnerName: z.string().min(1),
  })
  .strict();
export type FloristMessageFacts = z.infer<typeof FloristMessageFactsSchema>;

/** Is `value` one of the florist languages (`partner_member.locale_code`)? */
export function floristLanguageOf(value: string): FloristLanguage {
  return z.enum(FLORIST_LANGUAGES).parse(value);
}

/** The words a florist message is built from, formatted once. */
interface Formatted {
  readonly t: EmailTranslator;
  readonly date: string;
  readonly time: string;
  readonly tier: string;
  readonly addOns: string | null;
  readonly place: string;
  readonly payout: string | null;
}

function formatted(
  facts: FloristMessageFacts,
  language: FloristLanguage,
): Formatted {
  const t = emailTranslator(language);
  const addOnNames = facts.addonKeys.map((key) => t(key));
  return {
    t,
    // Noon UTC, so no zone moves the calendar date to another day.
    date: formatDate(
      new Date(`${facts.deliveryDate}T12:00:00Z`),
      language,
      "deliveryDate",
      facts.timeZone,
    ),
    time: formatDate(facts.answerBy, language, "time", facts.timeZone),
    tier: t(
      facts.tierLabelKey,
      facts.tierStems === null ? {} : { count: facts.tierStems },
    ),
    addOns:
      addOnNames.length === 0 ? null : formatList(addOnNames, language, "unit"),
    place: `${facts.postcode} ${facts.town}`,
    payout: facts.payout === null ? null : formatMoney(facts.payout, language),
  };
}

const SEPARATOR = " · ";

/** "Amber Hour · 18 stems". */
function itemText(facts: FloristMessageFacts, f: Formatted): string {
  return `${facts.productName}${SEPARATOR}${f.tier}`;
}

/** "Amber Hour · 18 stems · For Thu 8 Oct". */
function itemForDateText(facts: FloristMessageFacts, f: Formatted): string {
  return `${itemText(facts, f)}${SEPARATOR}${f.t("floristInbox.forDate", { date: f.date })}`;
}

/** The one-tap link a template needs, or a throw: V1, V2, V3 and V5 never go without one. */
function linkOf(link: string | null, template: FloristTemplate): string {
  if (link === null) {
    throw new Error(`EMAIL_LINK_MISSING: ${template} needs the one-tap link`);
  }
  return link;
}

/** The button, its note, and the same as plain text. */
function action(
  f: Formatted,
  labelKey: string,
  link: string,
): { blocks: Block[]; text: string } {
  const label = f.t(labelKey);
  return {
    blocks: [button(label, link), note(f.t("emails.florist.oneTap"))],
    text: `${label}:\n${link}\n${f.t("emails.florist.oneTapText")}`,
  };
}

interface Body {
  readonly subject: string;
  readonly preheader: string;
  readonly blocks: readonly Block[];
  /** The plain-text paragraphs, in the order of the blocks. */
  readonly text: readonly string[];
}

function offer(facts: FloristMessageFacts, f: Formatted, link: string): Body {
  const { t } = f;
  const answer = t("floristInbox.answerBy", { time: f.time });
  const rows = [
    {
      label: t("emails.florist.label.bouquet"),
      value: fragment(productName(facts.productName), SEPARATOR, f.tier),
      text: itemText(facts, f),
    },
    ...(f.addOns === null
      ? []
      : [
          {
            label: t("emails.florist.label.addOns"),
            value: fragment(f.addOns),
            text: f.addOns,
          },
        ]),
    {
      label: t("floristInbox.deliveryDate"),
      value: fragment(f.date),
      text: f.date,
    },
    {
      label: t("emails.florist.label.town"),
      value: numeric(f.place),
      text: f.place,
    },
  ];
  const receive = t("emails.florist.label.youReceive");
  const go = action(f, "emails.florist.openOrder", link);
  return {
    subject: t("emails.florist.offer.subject", { date: f.date, time: f.time }),
    preheader: [
      itemText(facts, f),
      facts.town,
      ...(f.payout === null
        ? []
        : [t.plain("floristInbox.youReceive", { payout: f.payout })]),
    ].join(SEPARATOR),
    blocks: [
      heading(t("emails.florist.offer.heading")),
      answerBy(answer),
      factList(rows),
      ...(f.payout === null ? [] : [payoutRow(receive, f.payout)]),
      ...go.blocks,
      paragraph("sub", t("emails.florist.offer.recipientLater")),
    ],
    text: [
      t("emails.florist.offer.heading"),
      answer,
      [
        ...rows.map((row) => `${row.label}: ${row.text}`),
        ...(f.payout === null ? [] : [`${receive}: ${f.payout}`]),
      ].join("\n"),
      go.text,
      t("emails.florist.offer.recipientLater"),
    ],
  };
}

function reminder(
  facts: FloristMessageFacts,
  f: Formatted,
  link: string,
): Body {
  const { t } = f;
  const answer = t("floristInbox.answerBy", { time: f.time });
  const line = itemForDateText(facts, f);
  const go = action(f, "emails.florist.openOrder", link);
  return {
    subject: t("emails.florist.reminder.subject", { time: f.time }),
    preheader: t("emails.florist.reminder.preheader", { date: f.date }),
    blocks: [
      heading(t("emails.florist.reminder.heading")),
      answerBy(answer),
      paragraph("sub", line),
      ...go.blocks,
    ],
    text: [t("emails.florist.reminder.heading"), answer, line, go.text],
  };
}

function confirmed(
  facts: FloristMessageFacts,
  f: Formatted,
  link: string,
): Body {
  const { t } = f;
  const line = itemForDateText(facts, f);
  const go = action(f, "emails.florist.openOrder", link);
  return {
    subject: t("emails.florist.confirmed.subject", { date: f.date }),
    preheader: t("emails.florist.confirmed.preheader"),
    blocks: [
      heading(t("emails.florist.confirmed.heading")),
      paragraph("body", t("emails.florist.confirmed.body")),
      paragraph("sub", line),
      ...go.blocks,
    ],
    text: [
      t("emails.florist.confirmed.heading"),
      t("emails.florist.confirmed.body"),
      line,
      go.text,
    ],
  };
}

function withdrawn(
  facts: FloristMessageFacts,
  f: Formatted,
  timedOut: boolean,
): Body {
  const { t } = f;
  const line = itemForDateText(facts, f);
  const phone = supportPhone();
  const passed = t("floristInbox.page.expired");
  const started = t("emails.florist.withdrawn.started", { phone });
  const [beforePhone = "", afterPhone = ""] = t(
    "emails.florist.withdrawn.started",
    { phone: PHONE_SLOT },
  ).split(PHONE_SLOT);
  return {
    subject: timedOut
      ? t("emails.florist.timedOut.subject", { date: f.date })
      : t("emails.florist.withdrawn.subject", { date: f.date }),
    preheader: timedOut ? passed : t("emails.florist.withdrawn.heading"),
    blocks: [
      ...(timedOut ? [paragraph("sub", passed)] : []),
      heading(t("emails.florist.withdrawn.heading")),
      box("blush", strong(t("emails.florist.withdrawn.body"))),
      paragraph("sub", line),
      ...(timedOut
        ? []
        : [paragraph("body", beforePhone, numeric(phone), afterPhone)]),
    ],
    text: [
      ...(timedOut ? [passed] : []),
      `${t("emails.florist.withdrawn.heading")}\n${t("emails.florist.withdrawn.body")}`,
      line,
      ...(timedOut ? [] : [started]),
    ],
  };
}

/** A placeholder no translation contains, swapped for the phone's markup in the HTML part. */
const PHONE_SLOT = "\u0000phone\u0000";

function photoReminder(
  facts: FloristMessageFacts,
  f: Formatted,
  link: string,
): Body {
  const { t } = f;
  const title = t("floristInbox.page.addPhoto");
  const body = t("emails.florist.photoReminder.body", {
    product: facts.productName,
  });
  const go = action(f, "floristInbox.page.addPhoto", link);
  return {
    subject: t("emails.florist.photoReminder.subject", { date: f.date }),
    preheader: t("emails.florist.photoReminder.preheader"),
    blocks: [heading(title), paragraph("body", body), ...go.blocks],
    text: [title, body, go.text],
  };
}

export interface FloristRenderContext {
  readonly language: FloristLanguage;
  /** The member's one-tap link (V1, V2, V3, V5); null for V4. */
  readonly link: string | null;
  /** V4 only: the offer timed out (rather than being withdrawn after it was made or accepted). */
  readonly timedOut: boolean;
}

/** One florist email: subject, the HTML part in the layout's florist frame, the plain text. */
export function renderFloristEmail(
  template: FloristTemplate,
  input: FloristMessageFacts,
  context: FloristRenderContext,
): RenderedNotification {
  const parsed = FloristMessageFactsSchema.parse(input);
  const f = formatted(parsed, context.language);
  const body: Body =
    template === "offer"
      ? offer(parsed, f, linkOf(context.link, template))
      : template === "offer-reminder"
        ? reminder(parsed, f, linkOf(context.link, template))
        : template === "order-confirmed"
          ? confirmed(parsed, f, linkOf(context.link, template))
          : template === "offer-withdrawn"
            ? withdrawn(parsed, f, context.timedOut)
            : photoReminder(parsed, f, linkOf(context.link, template));
  const html = emailDocument({
    locale: context.language,
    subject: body.subject,
    preheader: body.preheader,
    frame: floristFrame(f.t),
    blocks: body.blocks,
  });
  return {
    subject: body.subject,
    html,
    text: `${[...body.text, floristFooterText(f.t)].join("\n\n")}\n`,
  };
}

/**
 * The florist's WhatsApp message (W), in the florist's language, ready to paste: plain text, line
 * breaks only. The offer carries the inbox address **with no token** (`inboxUrl`, spec 016 §5.2
 * "W"); the stop message carries no link and no reason. A timed-out stop message, like V4 on a
 * timeout, has no "if you have already started" line.
 */
export function whatsappFloristText(
  kind: "offer" | "offer-withdrawn",
  input: FloristMessageFacts,
  context: {
    readonly language: FloristLanguage;
    readonly inboxUrl: string | null;
    readonly timedOut: boolean;
  },
): string {
  const parsed = FloristMessageFactsSchema.parse(input);
  const f = formatted(parsed, context.language);
  const { t } = f;
  if (kind === "offer-withdrawn") {
    return [
      TRADING_NAME,
      t("whatsapp.florist.stop.body"),
      itemForDateText(parsed, f),
      ...(context.timedOut
        ? []
        : [t("emails.florist.withdrawn.started", { phone: supportPhone() })]),
    ].join("\n\n");
  }
  if (context.inboxUrl === null) {
    throw new Error("EMAIL_LINK_MISSING: the W offer needs the inbox address");
  }
  return [
    t("whatsapp.florist.offer.title"),
    [
      itemText(parsed, f),
      ...(f.addOns === null
        ? []
        : [`${t("emails.florist.label.addOns")}: ${f.addOns}`]),
      `${t("floristInbox.deliveryDate")}: ${f.date}`,
      f.place,
      ...(f.payout === null
        ? []
        : [t.plain("floristInbox.youReceive", { payout: f.payout })]),
    ].join("\n"),
    t("floristInbox.answerBy", { time: f.time }),
    [
      t("whatsapp.florist.offer.open", { url: context.inboxUrl }),
      t("whatsapp.florist.offer.alsoEmail"),
    ].join("\n"),
  ].join("\n\n");
}

/** The answer-by time and the delivery date as the founder's W email prints them (English). */
export function floristDeadline(input: FloristMessageFacts): {
  readonly time: string;
  readonly timeZone: string;
} {
  const parsed = FloristMessageFactsSchema.parse(input);
  return {
    time: formatDate(parsed.answerBy, "en", "time", parsed.timeZone),
    timeZone: parsed.timeZone,
  };
}
