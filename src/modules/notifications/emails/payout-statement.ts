/**
 * The florist's payout statement: its facts, its words, and the email (spec 030a §5.2
 * `payouts.statement_email`, §5.3 "The florist statement", §7; AC-21, AC-22, AC-23; artboards
 * `email-florist-{desktop,mobile}.dc.html` "Statement" and `florist-payout-statement-pdf.dc.html`;
 * TASK-365).
 *
 * **From the payout's rows only.** `loadPayoutStatementView` reads the payout, its florist's code
 * and legal name, and each `payout_line` with, for an order line, `order_reference()`, the order's
 * delivery date and its product lines (name from `product_translation` in the florist's language,
 * else `en`; the tier as its `catalog.tier.*` key; the quantity). No buyer, recipient, card
 * message, retail price, token or VAT column is selected, and `PayoutStatementViewSchema` is
 * strict, so neither the email nor the PDF (`payout-statement-pdf.ts`) can print one (AC-22).
 *
 * **One set of words.** `payoutStatementWords` formats the view once, in the florist's language,
 * through `emails.floristPayoutStatement.*` and the i18n formatters; the email and the PDF both
 * print those words and nothing else of their own (AC-23). Neither carries a VAT rate or amount:
 * a payout statement is not an invoice (§13 Q1), and it says so (`notInvoice`).
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { type CurrencyCode, isCurrencyCode } from "@/config/currencies";
import { FLORIST_LANGUAGES, type FloristLanguage } from "@/config/florists";
import type { LocaleCode } from "@/config/locales";
import {
  formatDate,
  formatMoney,
  formatNumber,
  formatRange,
} from "@/modules/i18n";
import type { OrderExecutor } from "@/modules/orders";

import type { RenderedNotification } from "../templates";
import {
  notificationTemplate,
  registerNotificationTemplate,
} from "../templates";

import {
  type EmailTranslator,
  emailTranslator,
  floristFooterText,
  floristFrame,
  floristHelpText,
} from "./copy";
import {
  type Block,
  box,
  emailDocument,
  eyebrow,
  facts as factList,
  heading,
  numeric,
  paragraph,
  payoutRow,
  statementLines,
} from "./layout";

/* -------------------------------------------------------------------------- */
/* The view                                                                   */
/* -------------------------------------------------------------------------- */

const IsoDate = z.iso.date();

/** One product line of an order on the statement. */
export const StatementItemSchema = z
  .object({
    productName: z.string().min(1),
    tierLabelKey: z
      .string()
      .regex(/^catalog\.tier\./u)
      .nullable(),
    tierStems: z.number().int().positive().nullable(),
    quantity: z.number().int().positive(),
  })
  .strict();
export type StatementItem = z.infer<typeof StatementItemSchema>;

/** One `payout_line`: an order line with its order's facts, or a manual line with its note. */
export const StatementLineSchema = z
  .object({
    kind: z.enum(["order", "adjustment", "goodwill"]),
    orderReference: z.string().min(1).nullable(),
    deliveryDate: IsoDate.nullable(),
    items: z.array(StatementItemSchema),
    amountMinor: z.number().int(),
    note: z.string().min(1).nullable(),
  })
  .strict();
export type StatementLine = z.infer<typeof StatementLineSchema>;

/** Everything the statement prints. Nothing about a person but the florist's own legal name. */
export const PayoutStatementViewSchema = z
  .object({
    payoutId: z.uuid(),
    statementNumber: z.string().regex(/^P-[0-9]{6}$/u),
    kind: z.enum(["weekly", "prepaid", "per_order"]),
    periodStart: IsoDate,
    periodEnd: IsoDate,
    sentAt: z.date(),
    currency: z
      .string()
      .refine((code): code is CurrencyCode => isCurrencyCode(code), {
        message: "not a currency of the catalogue",
      }),
    totalMinor: z.number().int().positive(),
    language: z.enum(FLORIST_LANGUAGES),
    partnerCode: z.string().min(1),
    partnerName: z.string().min(1),
    lines: z.array(StatementLineSchema).min(1),
  })
  .strict();
export type PayoutStatementView = z.infer<typeof PayoutStatementViewSchema>;

/** A statement the payout's rows cannot fill: thrown, so the job retries and then fails. */
export class PayoutStatementMissing extends Error {
  readonly code = "PAYOUT_STATEMENT_MISSING";

  constructor(what: string) {
    super(`PAYOUT_STATEMENT_MISSING: ${what}`);
    this.name = "PayoutStatementMissing";
  }
}

const Minor = z
  .union([z.number(), z.string(), z.bigint()])
  .transform((value, ctx) => {
    const number = Number(value);
    if (!Number.isSafeInteger(number)) {
      ctx.addIssue({ code: "custom", message: "not a safe integer" });
      return z.NEVER;
    }
    return number;
  });

const HeadRow = z.object({
  id: z.uuid(),
  statement_number: z.string().nullable(),
  kind: z.enum(["weekly", "prepaid", "per_order"]),
  period_start: IsoDate,
  period_end: IsoDate,
  sent_at: z.union([z.date(), z.string()]).nullable(),
  currency_code: z.string(),
  total_minor: Minor,
  partner_code: z.string(),
  partner_name: z.string(),
});

const ItemRow = z.object({
  productName: z.string().nullable(),
  tierLabelKey: z.string().nullable(),
  tierStems: z.number().int().nullable(),
  quantity: z.number().int(),
});

const LineRow = z.object({
  kind: z.enum(["order", "adjustment", "goodwill"]),
  order_reference: z.string().nullable(),
  delivery_date: IsoDate.nullable(),
  items: z.array(ItemRow).nullable(),
  amount_minor: Minor,
  note: z.string().nullable(),
});

/**
 * The statement of a sent payout, in `language`, through the caller's transaction. Order lines
 * first, by delivery date; then the manual lines, oldest first.
 */
export async function loadPayoutStatementView(
  executor: OrderExecutor,
  payoutId: string,
  language: FloristLanguage,
): Promise<PayoutStatementView> {
  const id = z.uuid().parse(payoutId);
  const lang = z.enum(FLORIST_LANGUAGES).parse(language);
  const [head] = await executor.execute(sql`
    SELECT p.id, p.statement_number, p.kind, p.period_start::text AS period_start,
           p.period_end::text AS period_end, p.sent_at, p.currency_code,
           p.total_minor::text AS total_minor, fp.code AS partner_code,
           fp.legal_name AS partner_name
    FROM payout p JOIN fulfillment_partner fp ON fp.id = p.partner_id
    WHERE p.id = ${id}`);
  if (head === undefined) {
    throw new PayoutStatementMissing("the payout does not exist");
  }
  const payout = HeadRow.parse(head);
  if (payout.statement_number === null || payout.sent_at === null) {
    throw new PayoutStatementMissing("the payout has no statement yet");
  }
  const rows = await executor.execute(sql`
    SELECT l.kind,
           CASE WHEN l.order_id IS NULL THEN NULL ELSE order_reference(l.order_id) END
             AS order_reference,
           o.delivery_date::text AS delivery_date,
           (SELECT json_agg(json_build_object(
                     'productName', (SELECT pt.name FROM product_translation pt
                                     WHERE pt.product_id = ol.product_id
                                       AND pt.locale_code IN (${lang}, 'en')
                                     ORDER BY (pt.locale_code = ${lang}) DESC LIMIT 1),
                     'tierLabelKey', t.label_key,
                     'tierStems', t.stems,
                     'quantity', ol.qty) ORDER BY ol.id)
            FROM order_line ol
            LEFT JOIN product_tier t ON t.product_id = ol.product_id AND t.tier_key = ol.tier_key
            WHERE ol.order_id = l.order_id AND l.kind = 'order' AND ol.kind = 'product')
             AS items,
           l.amount_minor::text AS amount_minor, l.note
    FROM payout_line l
    LEFT JOIN "order" o ON o.id = l.order_id
    WHERE l.payout_id = ${id}
    ORDER BY (l.kind <> 'order'), o.delivery_date NULLS LAST, l.created_at, l.id`);
  const lines = rows.map((raw) => {
    const line = LineRow.parse(raw);
    const items = (line.items ?? []).map((item) => {
      if (item.productName === null) {
        throw new PayoutStatementMissing("a product has no name to show");
      }
      return {
        productName: item.productName,
        tierLabelKey: item.tierLabelKey,
        tierStems: item.tierStems,
        quantity: item.quantity,
      };
    });
    return {
      kind: line.kind,
      orderReference: line.order_reference,
      deliveryDate: line.kind === "order" ? line.delivery_date : null,
      items,
      amountMinor: line.amount_minor,
      note: line.kind === "order" ? null : line.note,
    };
  });
  return PayoutStatementViewSchema.parse({
    payoutId: payout.id,
    statementNumber: payout.statement_number,
    kind: payout.kind,
    periodStart: payout.period_start,
    periodEnd: payout.period_end,
    sentAt:
      payout.sent_at instanceof Date
        ? payout.sent_at
        : new Date(payout.sent_at),
    currency: payout.currency_code,
    totalMinor: payout.total_minor,
    language: lang,
    partnerCode: payout.partner_code,
    partnerName: payout.partner_name,
    lines,
  });
}

/* -------------------------------------------------------------------------- */
/* The words                                                                  */
/* -------------------------------------------------------------------------- */

/** The namespace every statement word comes from (§7). */
export const STATEMENT_NAMESPACE = "emails.floristPayoutStatement";

/** One formatted line, as both documents print it. */
export interface StatementWordsLine {
  /** The order reference, or "Adjustment" / "Goodwill" for a manual line. */
  readonly reference: string;
  /** Under the reference in the email: the short delivery date, or a manual line's order. */
  readonly referenceSmall: string | null;
  /** The delivery date in full (the PDF's date column); empty for a manual line. */
  readonly date: string;
  /** "Amber Hour · 18 stems × 2", or a manual line's order reference (PDF) / note (email). */
  readonly item: string;
  /** A second product of the order; a manual line's note in the PDF. */
  readonly itemSmall: readonly string[];
  /** The manual line's note (the email's middle column); null on an order line. */
  readonly note: string | null;
  readonly amount: string;
}

/** Every word the statement prints, formatted once in the florist's language. */
export interface StatementWords {
  readonly language: FloristLanguage;
  readonly t: EmailTranslator;
  readonly number: string;
  readonly subject: string;
  readonly preheader: string;
  readonly documentTitle: string;
  readonly heading: string;
  readonly eyebrow: string;
  readonly numberLabel: string;
  readonly periodLabel: string;
  readonly period: string;
  readonly sentLabel: string;
  readonly sent: string;
  readonly currencyLabel: string;
  readonly currency: string;
  readonly fromLabel: string;
  readonly forLabel: string;
  readonly partnerName: string;
  readonly partnerCode: string;
  readonly ordersLabel: string;
  readonly orders: string;
  readonly linesCaption: string;
  readonly head: {
    readonly order: string;
    readonly date: string;
    readonly bouquet: string;
    readonly amount: string;
  };
  readonly lines: readonly StatementWordsLine[];
  readonly totalLabel: string;
  readonly total: string;
  readonly paymentLabel: string;
  readonly paymentMethod: string;
  readonly notInvoice: string;
  readonly deleteReminder: string;
  readonly help: string;
  readonly filename: string;
  readonly attached: string;
}

/** A calendar date (`YYYY-MM-DD`) at noon UTC, so no zone moves it to another day. */
function noon(isoDate: string): Date {
  return new Date(`${isoDate}T12:00:00Z`);
}

/** `payout-statement-P-000127.pdf`: the attachment's name. */
export function statementFilename(statementNumber: string): string {
  return `payout-statement-${z
    .string()
    .regex(/^P-[0-9]{6}$/u)
    .parse(statementNumber)}.pdf`;
}

/** The view's words in its language. `translator` is injectable so the suite can record keys. */
export function payoutStatementWords(
  input: PayoutStatementView,
  translator: (locale: LocaleCode) => EmailTranslator = emailTranslator,
): StatementWords {
  const view = PayoutStatementViewSchema.parse(input);
  const lang = view.language;
  const t = translator(lang);
  const money = (amountMinor: number): string =>
    formatMoney({ amountMinor, currency: view.currency }, lang);
  const day = (isoDate: string): string =>
    formatDate(noon(isoDate), lang, "dayMonthYear", "UTC");
  const single = view.kind !== "weekly" || view.periodStart === view.periodEnd;
  const period = single
    ? day(view.periodStart)
    : formatRange(
        noon(view.periodStart),
        noon(view.periodEnd),
        lang,
        "dayMonthYear",
        "UTC",
      );
  const itemText = (item: StatementItem): string => {
    const tier =
      item.tierLabelKey === null
        ? null
        : t(
            item.tierLabelKey,
            item.tierStems === null ? {} : { count: item.tierStems },
          );
    const name =
      tier === null
        ? item.productName
        : t("emails.floristPayoutStatement.item", {
            product: item.productName,
            tier,
          });
    return item.quantity === 1
      ? name
      : t("emails.floristPayoutStatement.quantity", {
          item: name,
          quantity: formatNumber(item.quantity, lang),
        });
  };
  const lines = view.lines.map((line): StatementWordsLine => {
    if (line.kind === "order") {
      const [first, ...rest] = line.items.map(itemText);
      return {
        reference: line.orderReference ?? "",
        referenceSmall:
          line.deliveryDate === null
            ? null
            : formatDate(noon(line.deliveryDate), lang, "dayMonth", "UTC"),
        date: line.deliveryDate === null ? "" : day(line.deliveryDate),
        item: first ?? "",
        itemSmall: rest,
        note: null,
        amount: money(line.amountMinor),
      };
    }
    const label =
      line.kind === "adjustment"
        ? t("emails.floristPayoutStatement.manualLine.adjustment")
        : t("emails.floristPayoutStatement.manualLine.goodwill");
    return {
      reference: label,
      referenceSmall: line.orderReference,
      date: "",
      item: line.orderReference ?? "",
      itemSmall: line.note === null ? [] : [line.note],
      note: line.note,
      amount: money(line.amountMinor),
    };
  });
  const orderCount = view.lines.filter((line) => line.kind === "order").length;
  const total = money(view.totalMinor);
  const filename = statementFilename(view.statementNumber);
  return {
    language: lang,
    t,
    number: view.statementNumber,
    subject: t("emails.floristPayoutStatement.subject", {
      number: view.statementNumber,
      total,
    }),
    preheader: t("emails.floristPayoutStatement.preheader", {
      period,
      currency: view.currency,
    }),
    documentTitle: t("emails.floristPayoutStatement.documentTitle"),
    heading: t("emails.floristPayoutStatement.title"),
    eyebrow: t("emails.floristPayoutStatement.numberLabel", {
      number: view.statementNumber,
    }),
    numberLabel: t("emails.floristPayoutStatement.statementNumber"),
    periodLabel: single
      ? t("emails.floristPayoutStatement.singleDateLabel")
      : t("emails.floristPayoutStatement.periodLabel"),
    period,
    sentLabel: t("emails.floristPayoutStatement.sentLabel"),
    sent: formatDate(view.sentAt, lang, "dayMonthYear", "UTC"),
    currencyLabel: t("emails.floristPayoutStatement.currencyLabel"),
    currency: view.currency,
    fromLabel: t("emails.floristPayoutStatement.fromLabel"),
    forLabel: t("emails.floristPayoutStatement.forLabel"),
    partnerName: view.partnerName,
    partnerCode: view.partnerCode,
    ordersLabel: t("emails.floristPayoutStatement.ordersLabel"),
    orders: formatNumber(orderCount, lang),
    linesCaption: t("emails.floristPayoutStatement.linesCaption"),
    head: {
      order: t("emails.floristPayoutStatement.table.order"),
      date: t("emails.floristPayoutStatement.table.date"),
      bouquet: t("emails.floristPayoutStatement.table.bouquet"),
      amount: t("emails.floristPayoutStatement.table.amount"),
    },
    lines,
    totalLabel: t("emails.floristPayoutStatement.totalLabel"),
    total,
    paymentLabel: t("emails.floristPayoutStatement.paymentLabel"),
    paymentMethod: t("emails.floristPayoutStatement.paymentMethod", {
      currency: view.currency,
    }),
    notInvoice: t("emails.floristPayoutStatement.notInvoice"),
    deleteReminder: t("emails.floristPayoutStatement.deleteReminder"),
    help: floristHelpText(t),
    filename,
    attached: t("emails.floristPayoutStatement.attached", { filename }),
  };
}

/* -------------------------------------------------------------------------- */
/* The email                                                                  */
/* -------------------------------------------------------------------------- */

const SEPARATOR = " · ";

/** The statement email: subject, the HTML part in the florist frame, the plain text. */
export function renderPayoutStatementEmail(
  input: PayoutStatementView,
  translator?: (locale: LocaleCode) => EmailTranslator,
): RenderedNotification {
  const w = payoutStatementWords(input, translator);
  const blocks: Block[] = [
    eyebrow(w.eyebrow),
    heading(w.heading),
    factList([
      { label: w.periodLabel, value: w.period },
      { label: w.ordersLabel, value: numeric(w.orders) },
    ]),
    statementLines(
      w.linesCaption,
      [w.head.order, w.head.bouquet, w.head.amount],
      w.lines.map((line) => ({
        reference: line.reference,
        referenceSmall: line.referenceSmall,
        item: line.note ?? line.item,
        itemSmall: line.note === null ? line.itemSmall : [],
        amount: line.amount,
      })),
    ),
    payoutRow(w.totalLabel, w.total),
    box("leaf", w.paymentMethod),
    paragraph("sub", w.attached),
    paragraph("sub", w.notInvoice),
    paragraph("sub", w.deleteReminder),
  ];
  const html = emailDocument({
    locale: w.language,
    subject: w.subject,
    preheader: w.preheader,
    frame: floristFrame(w.t),
    blocks,
  });
  const lineText = w.lines.map((line) =>
    [
      line.reference,
      ...(line.referenceSmall === null ? [] : [line.referenceSmall]),
      [line.note ?? line.item, ...(line.note === null ? line.itemSmall : [])]
        .filter((part) => part !== "")
        .join(", "),
      line.amount,
    ].join(SEPARATOR),
  );
  const text = [
    `${w.heading}\n${w.eyebrow}`,
    `${w.periodLabel}: ${w.period}\n${w.ordersLabel}: ${w.orders}`,
    lineText.join("\n"),
    `${w.totalLabel}: ${w.total}`,
    w.paymentMethod,
    w.attached,
    `${w.notInvoice}\n${w.deleteReminder}`,
    floristFooterText(w.t),
  ];
  return { subject: w.subject, html, text: `${text.join("\n\n")}\n` };
}

/** Is `value` a florist language? Else `en`, the florist surface's default (spec 011 §7). */
function languageOf(value: string): FloristLanguage {
  const parsed = z.enum(FLORIST_LANGUAGES).safeParse(value);
  return parsed.success ? parsed.data : "en";
}

/**
 * Registers `florist-payout-statement` with the pipeline, once: the delivery's locale is the one
 * the job resolved (the earliest owner member's language, else the country's), and the payout is
 * read through the delivery's own transaction.
 */
export function registerPayoutStatementTemplate(): void {
  if (notificationTemplate("florist-payout-statement") !== undefined) return;
  registerNotificationTemplate("florist-payout-statement", async (input) => {
    if (input.payoutId === undefined || input.payoutId === null) {
      throw new PayoutStatementMissing("the delivery names no payout");
    }
    const view = await loadPayoutStatementView(
      input.executor,
      input.payoutId,
      languageOf(input.locale),
    );
    return renderPayoutStatementEmail(view);
  });
}
