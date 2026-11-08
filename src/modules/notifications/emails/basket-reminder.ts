/**
 * R1 `basket-reminder` (spec 034 §2 "The email", §5.2 "Rendering contract of R1", §5.3, §14 item
 * 2; AC-6 render half, AC-11 to AC-14, AC-32, AC-33; TASK-450). Drawn in
 * `docs/design/wireframes/email-basket-reminder-*.dc.html`.
 *
 * One email, in the draft's locale, HTML and plain text, in spec 016's layout: the heading, one
 * sentence, the basket's available bouquets (name, size, destination, date state), the one money
 * sentence that is true for every basket, one "Open my basket" button, the help line, and a footer
 * saying why it was sent, that it is the only one, and how to stop it. No greeting and no sign-off
 * (§14 item 2).
 *
 * **What it cannot say, by construction** (AC-12): `BasketReminderEmailPropsSchema` is `.strict()`
 * and has no field for a price, an amount, a currency, a time remaining, a cutoff, a stock count, a
 * discount or a person's name, so the template has nothing of the kind to print. No tracking pixel
 * and no per-recipient query string (AC-13): the only per-recipient values are the two token URLs.
 * Dates are calendar dates, formatted with weekday and month name at noon UTC so no zone moves them.
 */
import { z } from "zod";

import { type LocaleCode, isLocaleCode } from "@/config/locales";
import { formatDate } from "@/modules/i18n";

import {
  basketReminderFooterText,
  basketReminderFrame,
  emailTranslator,
} from "./copy";
import { el, type SafeHtml } from "./html";
import {
  type Block,
  button,
  emailDocument,
  heading,
  note,
  paragraph,
} from "./layout";
import { EMAIL_FONTS, EMAIL_MEASURES as M, colour } from "./theme";

const HttpsUrl = z.url({ protocol: /^https$/u });

/** A line's date in the email: still deliverable, moved to the next date, or not chosen (§5.2). */
export const ReminderLineDateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("kept"), isoDate: z.iso.date() }).strict(),
  z.object({ kind: z.literal("moved"), nextIsoDate: z.iso.date() }).strict(),
  z.object({ kind: z.literal("open") }).strict(),
]);

export const ReminderEmailLineSchema = z
  .object({
    productName: z.string().min(1).max(200),
    tierLabel: z.string().min(1).max(120).nullable(),
    countryName: z.string().min(1).max(120),
    imageUrl: HttpsUrl.nullable(),
    imageAlt: z.string().max(400),
    date: ReminderLineDateSchema,
  })
  .strict();
export type ReminderEmailLine = z.infer<typeof ReminderEmailLineSchema>;

/** R1's whole input (AC-12): no price, amount, currency, deadline, stock, discount or name. */
export const BasketReminderEmailPropsSchema = z
  .object({
    locale: z.string().refine(isLocaleCode),
    lines: z.array(ReminderEmailLineSchema).min(1).max(5),
    restoreUrl: HttpsUrl,
    unsubscribeUrl: HttpsUrl,
    helpUrl: HttpsUrl,
    privacyUrl: HttpsUrl,
  })
  .strict();
export type BasketReminderEmailProps = z.input<
  typeof BasketReminderEmailPropsSchema
>;

export interface RenderedBasketReminderEmail {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

/** A calendar date with weekday and month name ("Thu 8 Oct", "Do., 8. Okt.", "czw., 8 paź"). */
export function reminderDate(isoDate: string, locale: LocaleCode): string {
  return formatDate(
    new Date(`${isoDate}T12:00:00Z`),
    locale,
    "deliveryDate",
    "UTC",
  );
}

const LINE_TEXT = {
  "font-family": EMAIL_FONTS.body,
  "font-size": M.body,
  "line-height": "1.45",
  color: colour("ink"),
} as const;

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

/** One bouquet: a 96 px thumbnail with its alt text, then name and size, country, date. */
function lineBlock(
  rows: readonly (readonly [string, string | null, string, SafeHtml | null])[],
): Block {
  return {
    html: el(
      "table",
      {
        role: "presentation",
        cellpadding: 0,
        cellspacing: 0,
        width: "100%",
        style: { "border-collapse": "collapse" },
      },
      ...rows.map(([title, sub, date, image]) =>
        el(
          "tr",
          {},
          el(
            "td",
            {
              width: 96,
              valign: "top",
              style: {
                "padding-block": "8px",
                "padding-inline-end": "16px",
                width: "96px",
              },
            },
            image,
          ),
          el(
            "td",
            { valign: "top", style: { "padding-block": "8px", ...LINE_TEXT } },
            el("strong", {}, el("bdi", {}, title)),
            sub === null ? null : el("br", {}),
            sub,
            el("br", {}),
            date,
          ),
        ),
      ),
    ),
  };
}

/** R1: subject, HTML part, plain text (AC-11). */
export function renderBasketReminderEmail(
  input: BasketReminderEmailProps,
): RenderedBasketReminderEmail {
  const props = BasketReminderEmailPropsSchema.parse(input);
  const locale = props.locale as LocaleCode;
  const t = emailTranslator(locale);
  const subject = t("emails.basketReminder.subject");
  const title = t("emails.basketReminder.heading");
  const intro = t("emails.basketReminder.intro");
  const total = t("emails.basketReminder.total");
  const action = t("emails.basketReminder.button");
  const helpLabel = t("emails.basketReminder.helpLink");

  const lines = props.lines.map((line) => {
    const name =
      line.tierLabel === null
        ? line.productName
        : `${line.productName} · ${line.tierLabel}`;
    const to = t("emails.basketReminder.to", { country: line.countryName });
    const date =
      line.date.kind === "kept"
        ? t("emails.basketReminder.dateKept", {
            date: reminderDate(line.date.isoDate, locale),
          })
        : line.date.kind === "moved"
          ? t("emails.basketReminder.dateMoved", {
              date: reminderDate(line.date.nextIsoDate, locale),
            })
          : t("emails.basketReminder.dateOpen");
    const image =
      line.imageUrl === null
        ? null
        : el("img", {
            src: line.imageUrl,
            alt: line.imageAlt,
            width: 96,
            height: 96,
            style: {
              display: "block",
              width: "96px",
              height: "96px",
              "object-fit": "cover",
              "border-radius": "8px",
              border: "0",
            },
          });
    return { name, to, date, image };
  });

  const helpSentence = (helpLink: string): string =>
    t("emails.basketReminder.help", { helpLink });
  const [helpBefore, helpAfter] = helpSentence("\u0000").split("\u0000");

  const html = emailDocument({
    locale,
    subject,
    preheader: t("emails.basketReminder.preheader"),
    frame: basketReminderFrame(
      t,
      { unsubscribeUrl: props.unsubscribeUrl, privacyUrl: props.privacyUrl },
      link,
    ),
    blocks: [
      heading(title),
      paragraph("body", intro),
      lineBlock(
        lines.map(
          (line) => [line.name, line.to, line.date, line.image] as const,
        ),
      ),
      paragraph("body", total),
      button(action, props.restoreUrl),
      note(helpBefore ?? "", link(helpLabel, props.helpUrl), helpAfter ?? ""),
    ],
  });

  const textPart = [
    title,
    intro,
    ...lines.map((line) => [line.name, line.to, line.date].join("\n")),
    total,
    `${action}:\n${props.restoreUrl}`,
    helpSentence(props.helpUrl),
    basketReminderFooterText(t, {
      unsubscribeUrl: props.unsubscribeUrl,
      privacyUrl: props.privacyUrl,
    }),
  ].join("\n\n");
  return { subject, html, text: `${textPart}\n` };
}
