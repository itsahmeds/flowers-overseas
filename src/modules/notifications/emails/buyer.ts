/**
 * The buyer emails B1 to B6 and B8 (spec 016 §5.2 template table, §7, §8, §14 A-founder-2026-10-14,
 * A-founder-2026-10-14b and A-founder-2026-10-22; AC-21, AC-24, AC-25, AC-38, AC-40 to AC-42,
 * AC-45, AC-48; artboard `email-buyer-{desktop,mobile}.dc.html`, B1 and B4 as redrawn 2026-11-04;
 * TASK-333).
 *
 *  - B1 `order-received`, once per purchase: the hero "Thank you, {firstName}." / "Your flowers
 *    arrive in {city} on {date}." first, then the recap, the amount, "Track your order", the next
 *    line, and at the foot "Your order terms" (the pay step's cancellation sentence, how to cancel,
 *    the complaint path once the lawyer approves it, the account line, the attached sentence and
 *    one row per attached file). Two to five orders: "Your flowers arrive on the dates below.",
 *    one panel per order by date then reference, "Total paid {amount}", the terms once.
 *  - B2 `being-made`, B3 `out-for-delivery`: the delivery line, the step, the tracking button.
 *  - B4 `delivered-photo`: "Delivered.", the photo across the card, the two lines, the tracking
 *    link, the footer. Nothing to sell or rate.
 *  - B5 `cancelled`: "We could not deliver this order." or "You cancelled this order.", "We have
 *    refunded {amount}." (the order's charged total), the timing, "Cancelled", how to order again.
 *  - B6 `refund`: one "Refunded {amount} on {date}" per succeeded refund, oldest first, the timing,
 *    and the buyer status beside it (a full refund reads "Closed", never "Cancelled").
 *  - B8 `credit-note`: a credit note, or an invoice B1 went without: number, reference, amount.
 *
 * **The rules every one keeps** (founder 2026-10-14, AC-38, AC-40): `relayMatches` over
 * `RELAY_PATTERNS` finds nothing in them; "we" send it, "our florist" makes it; no
 * refund or failure wording outside B5 and B6; no name, address or phone in a subject or
 * preheader; names and cities as typed, inside `<bdi>`; money, dates and times through the `i18n`
 * module's formatters, in the buyer's locale and the destination's zone; amounts read from the
 * order, the purchase, the refund or the document, never recomputed.
 *
 * The renderers are pure: they take facts already read (`buyer-facts.ts`) and return the subject,
 * both parts and the attachments. Plain-text parts follow the artboard's.
 */
import { z } from "zod";

import { type LocaleCode, localeConfig } from "@/config/locales";
import {
  MoneySchema,
  formatDate,
  formatList,
  formatMoney,
} from "@/modules/i18n";
import {
  type BuyerRefundLine,
  BuyerRefundLineSchema,
  buyerStep,
  refundLineValues,
} from "@/modules/orders";

import type { MailAttachment } from "../mailer";
import type { RenderedNotification } from "../templates";

import {
  type EmailTranslator,
  buyerFooterText,
  buyerFrame,
  emailTranslator,
} from "./copy";
import { firstNameOf } from "./first-name";
import { type SafeHtml, el, escapeHtml, fragment, trusted } from "./html";
import {
  type Block,
  type Fact,
  amountBox,
  bdi,
  box,
  button,
  deliveryPanel,
  displayAmount,
  emailDocument,
  eyebrow,
  facts as factList,
  heading,
  hero,
  ledeWithCaption,
  note,
  numeric,
  paragraph,
  photo as photoBlock,
  productName,
  termsBlock,
  textLink,
} from "./layout";
import { EMAIL_COLOURS } from "./theme";

/** The buyer templates, by their `notification_delivery.template_key` (B7 retired). */
export const BUYER_TEMPLATES = [
  "order-received",
  "being-made",
  "out-for-delivery",
  "delivered-photo",
  "cancelled",
  "refund",
  "credit-note",
] as const;
export type BuyerTemplate = (typeof BUYER_TEMPLATES)[number];

/* -------------------------------------------------------------------------- */
/* Facts                                                                       */
/* -------------------------------------------------------------------------- */

const AttachmentFactSchema = z
  .object({
    filename: z.string().min(1),
    content: z.string().min(1).optional(),
    path: z.url().optional(),
    contentType: z.enum(["application/pdf", "image/jpeg"]).optional(),
  })
  .strict();

/** One product line as the buyer bought it: "Amber Hour · 18 stems". */
const ProductFactSchema = z
  .object({
    name: z.string().min(1),
    /** A `catalog.tier.*` message key, and its count. */
    tierLabelKey: z.string().regex(/^catalog\.tier\./u),
    tierStems: z.number().int().positive().nullable(),
  })
  .strict();

/** One order, as every buyer email may print it. Recipient: the name and the city, nothing else. */
export const BuyerOrderFactsSchema = z
  .object({
    orderId: z.uuid(),
    reference: z.string().regex(/^FO-[0-9A-Z]{4}-[0-9A-Z]{4}$/u),
    deliveryDate: z.iso.date(),
    /** The destination's IANA zone. */
    timeZone: z.string().min(3),
    /** The recipient's city, as typed. */
    city: z.string().min(1),
    /** The recipient's name, as typed. */
    recipientName: z.string().min(1),
    products: z.array(ProductFactSchema).min(1),
    /** `order.buyer_total_minor` in `order.buyer_currency_code`: the amount charged. */
    amount: MoneySchema,
    /** `tracking.linkFor(orderId, locale)`. */
    trackingUrl: z.url(),
  })
  .strict();
export type BuyerOrderFacts = z.infer<typeof BuyerOrderFactsSchema>;

/** B1: the purchase and its one to five orders. */
export const PurchaseFactsSchema = z
  .object({
    /** The buyer's name as typed (`order.buyer_snapshot.name`). */
    buyerName: z.string().min(1),
    /** `purchase.total_minor`: the one charge. */
    total: MoneySchema,
    orders: z.array(BuyerOrderFactsSchema).min(1).max(5),
    /** `/{locale}/account/orders/{reference}` (one order) or `/{locale}/account`. */
    accountUrl: z.url(),
    /** The terms PDF once per distinct `terms_version`. */
    terms: z.array(AttachmentFactSchema).min(1),
    /** Each order's invoice PDF stored within `B1_INVOICE_WAIT` (`./invoice-wait.ts`, TASK-334). */
    invoices: z.array(AttachmentFactSchema),
    /** B1's complaint-path sentence key, while the lawyer's text is a slot: null. */
    complaintKey: z.string().nullable(),
  })
  .strict();
export type PurchaseFacts = z.infer<typeof PurchaseFactsSchema>;

/** B4: the order, the delivery's time and the photo. */
export const DeliveredFactsSchema = z
  .object({
    order: BuyerOrderFactsSchema,
    /** The `order.delivered` event's instant. */
    deliveredAt: z.date(),
    photo: z
      .object({
        /** Base64 JPEG, 1,200 px on the long side (spec 011). */
        content: z.base64().min(1),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
      })
      .strict(),
  })
  .strict();
export type DeliveredFacts = z.infer<typeof DeliveredFactsSchema>;

/** B5: who the buyer is told cancelled it (`cancelledByOf`), and the order's charged total. */
export const CancelledFactsSchema = z
  .object({
    order: BuyerOrderFactsSchema,
    cancelledBy: z.enum(["buyer", "us"]),
    /** The buyer's locale home, for "Choose other flowers". */
    homeUrl: z.url(),
  })
  .strict();
export type CancelledFacts = z.infer<typeof CancelledFactsSchema>;

/** B6: the succeeded refunds, oldest first, and the order's buyer projection now. */
export const RefundFactsSchema = z
  .object({
    order: BuyerOrderFactsSchema,
    refunds: z.array(BuyerRefundLineSchema).min(1),
    /** `order_status.buyer_projection` of the order's status. */
    projection: z.string().min(1),
  })
  .strict();
export type RefundFacts = z.infer<typeof RefundFactsSchema>;

/** B8: the document, from its own row; nothing personal (the PDF carries the name and address). */
export const DocumentFactsSchema = z
  .object({
    kind: z.enum(["invoice", "credit_note"]),
    number: z.string().min(1),
    reference: z.string().regex(/^FO-[0-9A-Z]{4}-[0-9A-Z]{4}$/u),
    amount: MoneySchema,
    pdf: AttachmentFactSchema,
  })
  .strict();
export type DocumentFacts = z.infer<typeof DocumentFactsSchema>;

/* -------------------------------------------------------------------------- */
/* Words                                                                       */
/* -------------------------------------------------------------------------- */

/** Between a product's name and its tier: "Amber Hour · 18 stems" (the florist emails' mark). */
const SEPARATOR = " · ";

/** The inline photo's content id: the HTML part shows `cid:delivery-photo`. */
export const PHOTO_CONTENT_ID = "delivery-photo";

/** Private-use marks around a node's name inside a translated sentence. */
const OPEN = "";
const CLOSE = "";

/**
 * A translated sentence whose `nodes` values are markup (a `<bdi>` name, a number), escaped
 * everywhere else. The translator places each value; the marks show where.
 */
function sentence(
  t: EmailTranslator,
  key: string,
  values: Readonly<Record<string, string | number>>,
  nodes: Readonly<Record<string, SafeHtml>>,
): SafeHtml {
  const marked: Record<string, string | number> = { ...values };
  for (const name of Object.keys(nodes))
    marked[name] = `${OPEN}${name}${CLOSE}`;
  const translated = t(key, marked);
  const pattern = new RegExp(`${OPEN}([A-Za-z]+)${CLOSE}`, "gu");
  let html = "";
  let last = 0;
  for (const found of translated.matchAll(pattern)) {
    const node = nodes[found[1] ?? ""];
    if (node === undefined) throw new Error(`unknown node in ${key}`);
    html += escapeHtml(translated.slice(last, found.index));
    html += node.html;
    last = found.index + found[0].length;
  }
  html += escapeHtml(translated.slice(last));
  return trusted(html);
}

/** The words of one order, formatted once in the buyer's locale and the destination's zone. */
interface OrderWords {
  readonly reference: string;
  readonly city: string;
  readonly date: string;
  readonly amount: string;
  readonly products: SafeHtml;
  readonly productsText: string;
  readonly recipient: SafeHtml;
  readonly recipientText: string;
}

function orderWords(
  t: EmailTranslator,
  order: BuyerOrderFacts,
  locale: LocaleCode,
): OrderWords {
  // Noon UTC, so no zone moves the calendar date to another day.
  const date = formatDate(
    new Date(`${order.deliveryDate}T12:00:00Z`),
    locale,
    "weekdayDayMonth",
    order.timeZone,
  );
  const tiers = order.products.map((product) =>
    t(
      product.tierLabelKey,
      product.tierStems === null ? {} : { count: product.tierStems },
    ),
  );
  const productsText = formatList(
    order.products.map(
      (product, index) => `${product.name}${SEPARATOR}${tiers[index] ?? ""}`,
    ),
    locale,
    "unit",
  );
  const products = fragment(
    ...order.products.flatMap((product, index) => [
      index === 0 ? null : ", ",
      productName(product.name),
      SEPARATOR,
      tiers[index] ?? "",
    ]),
  );
  return {
    reference: order.reference,
    city: order.city,
    date,
    amount: formatMoney(order.amount, locale),
    products,
    productsText,
    recipient: sentence(
      t,
      "emails.buyer.recipientPlace",
      {},
      { name: bdi(order.recipientName), city: bdi(order.city) },
    ),
    recipientText: t("emails.buyer.recipientPlace", {
      name: order.recipientName,
      city: order.city,
    }),
  };
}

/** "Label: value" lines of a plain-text part. */
function textFacts(rows: readonly (readonly [string, string])[]): string {
  return rows.map(([label, value]) => `${label}: ${value}`).join("\n");
}

/** The delivery line every per-order email opens with (A-founder-2026-10-22 item 6). */
function deliveryLine(
  t: EmailTranslator,
  words: OrderWords,
): { readonly html: Block; readonly text: string } {
  const values = { reference: words.reference, date: words.date };
  return {
    html: eyebrow(
      sentence(t, "emails.buyer.deliveryLine", values, {
        city: bdi(words.city),
      }),
    ),
    text: t("emails.buyer.deliveryLine", { ...values, city: words.city }),
  };
}

/** The buyer translator of a locale: a buyer locale only. */
function translatorOf(locale: LocaleCode): EmailTranslator {
  return emailTranslator(locale);
}

interface Parts {
  readonly subject: string;
  readonly preheader: string;
  readonly reference: string;
  readonly blocks: readonly Block[];
  readonly text: readonly string[];
  readonly attachments?: readonly MailAttachment[];
}

function assemble(
  t: EmailTranslator,
  locale: LocaleCode,
  parts: Parts,
): RenderedNotification {
  const html = emailDocument({
    locale,
    subject: parts.subject,
    preheader: parts.preheader,
    frame: buyerFrame(t, parts.reference),
    blocks: parts.blocks,
  });
  const text = [...parts.text, buyerFooterText(t, parts.reference)].join(
    "\n\n",
  );
  return {
    subject: parts.subject,
    html,
    text: `${text}\n`,
    ...(parts.attachments === undefined || parts.attachments.length === 0
      ? {}
      : { attachments: parts.attachments }),
  };
}

/** The status label of a buyer projection (spec 016 §5.2 label map; spec 018's page's words). */
export function buyerStatusLabelKey(projection: string): string {
  switch (buyerStep(projection)) {
    // A paid order reads "We have your order" from payment on: no buyer email is sent while
    // `placed`, and no other label may reach one (§5.2).
    case "placed":
    case "confirmed":
      return "tracking.headline.confirmed";
    case "being_made":
      return "tracking.headline.beingMade";
    case "on_its_way":
      return "tracking.headline.onItsWay";
    case "delivered":
      return "tracking.headline.delivered";
    case "closed":
      return "tracking.headline.closed";
    case "cancelled":
      return "tracking.headline.cancelled";
  }
}

function link(label: string, href: string): SafeHtml {
  return el(
    "a",
    {
      href,
      style: {
        color: EMAIL_COLOURS.link,
        "font-weight": 700,
        "text-decoration": "underline",
        "text-underline-offset": "4px",
      },
    },
    label,
  );
}

/* -------------------------------------------------------------------------- */
/* B1                                                                          */
/* -------------------------------------------------------------------------- */

/** B1, once per purchase (§14 A-founder-2026-10-22). */
export function renderOrderReceived(
  input: PurchaseFacts,
  locale: LocaleCode,
): RenderedNotification {
  const facts = PurchaseFactsSchema.parse(input);
  const t = translatorOf(locale);
  const orders = facts.orders.map((order) => ({
    order,
    words: orderWords(t, order, locale),
  }));
  const [first] = orders;
  if (first === undefined) throw new Error("B1 has no order");
  const firstName = firstNameOf(facts.buyerName);
  const one = orders.length === 1;
  const inclusive = t("catalog.price.inclusive");
  const label = {
    order: t("emails.buyer.label.order"),
    yourOrder: t("emails.buyer.label.yourOrder"),
    recipient: t("emails.buyer.label.recipient"),
    date: t("emails.buyer.label.date"),
  };
  const heroTitle = sentence(
    t,
    "emails.buyer.orderReceived.hero",
    {},
    { firstName: bdi(firstName) },
  );
  const heroText = t("emails.buyer.orderReceived.hero", { firstName });
  const arrival = (words: OrderWords) => ({
    html: sentence(
      t,
      "emails.buyer.orderReceived.arrival",
      { date: words.date },
      { city: bdi(words.city) },
    ),
    text: t("emails.buyer.orderReceived.arrival", {
      city: words.city,
      date: words.date,
    }),
  });
  const next = t("emails.buyer.orderReceived.next");
  const blocks: Block[] = [];
  const text: string[] = [];
  if (one) {
    const lede = arrival(first.words);
    blocks.push(hero(heroTitle, lede.html));
    blocks.push(
      factList([
        { label: label.order, value: numeric(first.words.reference) },
        { label: label.yourOrder, value: first.words.products },
        { label: label.recipient, value: first.words.recipient },
        { label: label.date, value: first.words.date },
      ]),
    );
    const paid = t("emails.buyer.paid");
    blocks.push(
      amountBox({ label: paid, amount: first.words.amount, note: inclusive }),
    );
    const track = t("emails.account.trackingLink.button");
    blocks.push(button(track, first.order.trackingUrl));
    blocks.push(note(next));
    text.push(
      `${heroText}\n${lede.text}`,
      textFacts([
        [label.order, first.words.reference],
        [label.yourOrder, first.words.productsText],
        [label.recipient, first.words.recipientText],
        [label.date, first.words.date],
      ]),
      `${paid}: ${first.words.amount} (${inclusive})`,
      `${track}:\n${first.order.trackingUrl}\n${next}`,
    );
  } else {
    const many = t("emails.buyer.orderReceived.arrivalMany");
    blocks.push(hero(heroTitle, many));
    text.push(`${heroText}\n${many}`);
    const trackDelivery = t("emails.buyer.orderReceived.trackDelivery");
    orders.forEach(({ order, words }, index) => {
      const line = arrival(words);
      blocks.push(
        deliveryPanel(
          {
            heading: line.html,
            facts: [
              { label: label.order, value: numeric(words.reference) },
              { label: label.yourOrder, value: words.products },
              { label: label.recipient, value: words.recipient },
            ],
            amount: words.amount,
            amountNote: inclusive,
            link: { label: trackDelivery, href: order.trackingUrl },
          },
          index === 0,
        ),
      );
      text.push(
        [
          line.text,
          textFacts([
            [label.order, words.reference],
            [label.yourOrder, words.productsText],
            [label.recipient, words.recipientText],
          ]),
          `${words.amount} (${inclusive})`,
          `${trackDelivery}:\n${order.trackingUrl}`,
        ].join("\n"),
      );
    });
    const total = formatMoney(facts.total, locale);
    blocks.push(
      amountBox({
        label: sentence(
          t,
          "emails.buyer.orderReceived.totalPaid",
          {},
          { amount: displayAmount(total) },
        ),
        amount: null,
        note: inclusive,
      }),
    );
    blocks.push(note(next));
    text.push(
      `${t("emails.buyer.orderReceived.totalPaid", { amount: total })} (${inclusive})\n${next}`,
    );
  }
  // "Your order terms": every plan/07 §2.1 item after this heading, and none before it.
  const termsHeading = t("emails.buyer.orderReceived.termsHeading");
  const cancellation = t("checkout.legal.cancellation");
  const cancelHow = t("emails.buyer.orderReceived.cancelHow");
  const complaint = facts.complaintKey === null ? null : t(facts.complaintKey);
  const account = t("emails.buyer.orderReceived.account");
  const attachedFiles = [...facts.terms, ...facts.invoices];
  const attached = t("emails.buyer.orderReceived.termsAttached", {
    invoices: facts.invoices.length,
  });
  const pdf = t("emails.buyer.label.pdf");
  blocks.push(
    termsBlock({
      heading: termsHeading,
      lines: [
        cancellation,
        cancelHow,
        complaint,
        link(account, facts.accountUrl),
        attached,
      ].filter((line) => line !== null),
      attachments: attachedFiles.map((file) => ({
        filename: file.filename,
        kind: pdf,
      })),
    }),
  );
  text.push(
    [
      termsHeading.toLocaleUpperCase(localeConfig(locale).bcp47),
      cancellation,
      cancelHow,
      ...(complaint === null ? [] : [complaint]),
      `${account}\n${facts.accountUrl}`,
      attached,
    ].join("\n"),
  );
  return assemble(t, locale, {
    subject: t("emails.buyer.orderReceived.subject", {
      reference: first.words.reference,
    }),
    preheader: t("payments.confirmation.paid"),
    reference: first.words.reference,
    blocks,
    text,
    attachments: attachedFiles.map((file) => ({
      filename: file.filename,
      ...(file.content === undefined ? {} : { content: file.content }),
      ...(file.path === undefined ? {} : { path: file.path }),
      contentType: file.contentType ?? "application/pdf",
    })),
  });
}

/* -------------------------------------------------------------------------- */
/* B2, B3                                                                      */
/* -------------------------------------------------------------------------- */

/** B2: the order is being made (the delivery morning, `order.in_production`). */
export function renderBeingMade(
  input: BuyerOrderFacts,
  locale: LocaleCode,
): RenderedNotification {
  const order = BuyerOrderFactsSchema.parse(input);
  const t = translatorOf(locale);
  const words = orderWords(t, order, locale);
  const line = deliveryLine(t, words);
  const title = t("emails.buyer.beingMade.heading");
  const body = t("emails.buyer.beingMade.body", { date: words.date });
  const track = t("emails.buyer.trackOrder");
  const label = {
    yourOrder: t("emails.buyer.label.yourOrder"),
    recipient: t("emails.buyer.label.recipient"),
    date: t("emails.buyer.label.date"),
  };
  return assemble(t, locale, {
    subject: t("emails.buyer.beingMade.subject"),
    preheader: body,
    reference: words.reference,
    blocks: [
      line.html,
      heading(title),
      paragraph("body", body),
      factList([
        { label: label.yourOrder, value: words.products },
        { label: label.recipient, value: words.recipient },
        { label: label.date, value: words.date },
      ]),
      button(track, order.trackingUrl),
    ],
    text: [
      line.text,
      title,
      body,
      textFacts([
        [label.yourOrder, words.productsText],
        [label.recipient, words.recipientText],
        [label.date, words.date],
      ]),
      `${track}:\n${order.trackingUrl}`,
    ],
  });
}

/** B3: on its way (`order.out_for_delivery`). The window is a slot: no order field stores one. */
export function renderOutForDelivery(
  input: BuyerOrderFacts,
  locale: LocaleCode,
): RenderedNotification {
  const order = BuyerOrderFactsSchema.parse(input);
  const t = translatorOf(locale);
  const words = orderWords(t, order, locale);
  const line = deliveryLine(t, words);
  const title = t("emails.buyer.outForDelivery.heading");
  const body = t("emails.buyer.outForDelivery.body", { date: words.date });
  const track = t("emails.buyer.trackOrder");
  return assemble(t, locale, {
    subject: t("emails.buyer.outForDelivery.subject"),
    preheader: body,
    reference: words.reference,
    blocks: [
      line.html,
      heading(title),
      paragraph("body", body),
      button(track, order.trackingUrl),
    ],
    text: [line.text, title, body, `${track}:\n${order.trackingUrl}`],
  });
}

/* -------------------------------------------------------------------------- */
/* B4                                                                          */
/* -------------------------------------------------------------------------- */

/** The delivery photo's file name: `delivery-{reference}.jpg`. */
export function deliveryPhotoFilename(reference: string): string {
  return `delivery-${reference}.jpg`;
}

/** B4: photo first; "Delivered." above it and nothing else; nothing to sell or rate. */
export function renderDeliveredPhoto(
  input: DeliveredFacts,
  locale: LocaleCode,
): RenderedNotification {
  const facts = DeliveredFactsSchema.parse(input);
  const { order } = facts;
  const t = translatorOf(locale);
  const words = orderWords(t, order, locale);
  const time = formatDate(facts.deliveredAt, locale, "time", order.timeZone);
  const recipientFirstName = firstNameOf(order.recipientName);
  const headline = t("emails.buyer.delivered.headline");
  const body = t("emails.buyer.delivered.body", {
    city: words.city,
    time,
    date: words.date,
  });
  const caption = t("emails.buyer.delivered.caption", { recipientFirstName });
  const track = t("emails.account.trackingLink.button");
  const filename = deliveryPhotoFilename(words.reference);
  const photo = {
    content: facts.photo.content,
    contentType: "image/jpeg" as const,
  };
  return assemble(t, locale, {
    subject: t("emails.buyer.delivered.subject", { city: words.city }),
    preheader: body,
    reference: words.reference,
    blocks: [
      heading(headline),
      photoBlock({
        src: `cid:${PHOTO_CONTENT_ID}`,
        alt: t("tracking.photoAlt", { date: words.date }),
        width: facts.photo.width,
        height: facts.photo.height,
      }),
      ledeWithCaption(
        sentence(
          t,
          "emails.buyer.delivered.body",
          { date: words.date },
          { city: bdi(words.city), time: numeric(time) },
        ),
        sentence(
          t,
          "emails.buyer.delivered.caption",
          {},
          { recipientFirstName: bdi(recipientFirstName) },
        ),
      ),
      textLink(track, order.trackingUrl, 28),
    ],
    text: [
      headline,
      t("emails.buyer.delivered.photoAttached", { filename }),
      `${body}\n${caption}`,
      `${track}:\n${order.trackingUrl}`,
    ],
    // Inline in the HTML part, and attached as a file as well (§13 16-8).
    attachments: [
      { filename, ...photo, contentId: PHOTO_CONTENT_ID },
      { filename, ...photo },
    ],
  });
}

/* -------------------------------------------------------------------------- */
/* B5, B6                                                                      */
/* -------------------------------------------------------------------------- */

/** B5: one plain cancellation with a full refund, and no reason. */
export function renderCancelled(
  input: CancelledFacts,
  locale: LocaleCode,
): RenderedNotification {
  const facts = CancelledFactsSchema.parse(input);
  const { order } = facts;
  const t = translatorOf(locale);
  const words = orderWords(t, order, locale);
  const line = deliveryLine(t, words);
  const ours = facts.cancelledBy === "us";
  const title = t(
    ours ? "emails.buyer.cancelled.byUs" : "emails.buyer.cancelled.byBuyer",
  );
  const refunded = t("emails.buyer.cancelled.refunded", {
    amount: words.amount,
  });
  const timing = t(
    ours ? "emails.buyer.cancelled.sorry" : "emails.buyer.cancelled.timing",
  );
  const status = t("emails.buyer.label.status");
  const cancelledLabel = t(buyerStatusLabelKey("cancelled"));
  const other = t("emails.buyer.cancelled.otherFlowers");
  const help = ours ? t("emails.buyer.cancelled.help") : null;
  return assemble(t, locale, {
    subject: t("emails.buyer.cancelled.subject", {
      reference: words.reference,
    }),
    preheader: `${title} ${refunded}`,
    reference: words.reference,
    blocks: [
      line.html,
      heading(title),
      box(
        "leaf",
        sentence(
          t,
          "emails.buyer.cancelled.refunded",
          {},
          { amount: numeric(words.amount) },
        ),
      ),
      paragraph("body", timing),
      factList([{ label: status, value: cancelledLabel }]),
      button(other, facts.homeUrl),
      ...(help === null ? [] : [note(help)]),
    ],
    text: [
      line.text,
      `${title}\n${refunded}`,
      timing,
      textFacts([[status, cancelledLabel]]),
      [`${other}:`, facts.homeUrl, ...(help === null ? [] : [help])].join("\n"),
    ],
  });
}

/** B6: each succeeded refund, dated, and the order's status beside it. */
export function renderRefund(
  input: RefundFacts,
  locale: LocaleCode,
): RenderedNotification {
  const facts = RefundFactsSchema.parse(input);
  const { order } = facts;
  const t = translatorOf(locale);
  const words = orderWords(t, order, locale);
  const line = deliveryLine(t, words);
  const title = t("emails.buyer.refund.heading");
  const refundLines = facts.refunds.map((refund: BuyerRefundLine) => {
    const values = refundLineValues(refund, locale, order.timeZone);
    return {
      text: t("tracking.refundLine", values),
      html: sentence(
        t,
        "tracking.refundLine",
        { date: values.date },
        { amount: numeric(values.amount) },
      ),
    };
  });
  const method = t("emails.buyer.refund.method");
  const status = t("emails.buyer.label.status");
  const statusLabel = t(buyerStatusLabelKey(facts.projection));
  const yourOrder = t("emails.buyer.label.yourOrder");
  const track = t("emails.buyer.trackOrder");
  const newest = refundLines[refundLines.length - 1];
  if (newest === undefined) throw new Error("B6 has no refund line");
  return assemble(t, locale, {
    subject: t("emails.buyer.refund.subject", { reference: words.reference }),
    preheader: newest.text,
    reference: words.reference,
    blocks: [
      line.html,
      heading(title),
      box(
        "leaf",
        ...refundLines.flatMap((refund, index) => [
          index === 0 ? null : el("br", {}),
          refund.html,
        ]),
      ),
      paragraph("body", method),
      factList([
        { label: yourOrder, value: words.products },
        { label: status, value: statusLabel },
      ]),
      button(track, order.trackingUrl),
    ],
    text: [
      line.text,
      title,
      refundLines.map((refund) => refund.text).join("\n"),
      method,
      textFacts([
        [yourOrder, words.productsText],
        [status, statusLabel],
      ]),
      `${track}:\n${order.trackingUrl}`,
    ],
  });
}

/* -------------------------------------------------------------------------- */
/* B8                                                                          */
/* -------------------------------------------------------------------------- */

/** B8: the credit note, or an invoice B1 went without. Number, reference, amount, the PDF. */
export function renderCreditNote(
  input: DocumentFacts,
  locale: LocaleCode,
): RenderedNotification {
  const facts = DocumentFactsSchema.parse(input);
  const t = translatorOf(locale);
  const invoice = facts.kind === "invoice";
  const title = t(
    invoice
      ? "emails.buyer.creditNote.headingInvoice"
      : "emails.buyer.creditNote.headingCreditNote",
  );
  const body = t(
    invoice
      ? "emails.buyer.creditNote.bodyInvoice"
      : "emails.buyer.creditNote.bodyCreditNote",
  );
  const label = {
    document: t(
      invoice ? "emails.buyer.label.invoice" : "emails.buyer.label.creditNote",
    ),
    order: t("emails.buyer.label.order"),
    amount: t("emails.buyer.label.amount"),
  };
  const amount = formatMoney(facts.amount, locale);
  const eyebrowText = t("tracking.eyebrow", { reference: facts.reference });
  return assemble(t, locale, {
    subject: t(
      invoice
        ? "emails.buyer.creditNote.subjectInvoice"
        : "emails.buyer.creditNote.subjectCreditNote",
      { number: facts.number },
    ),
    preheader: t("emails.buyer.creditNote.preheader", {
      reference: facts.reference,
    }),
    reference: facts.reference,
    blocks: [
      eyebrow(eyebrowText),
      heading(title),
      paragraph("body", body),
      factList([
        { label: label.document, value: numeric(facts.number) },
        { label: label.order, value: numeric(facts.reference) },
        { label: label.amount, value: numeric(amount) },
      ] satisfies Fact[]),
    ],
    text: [
      eyebrowText,
      title,
      body,
      textFacts([
        [label.document, facts.number],
        [label.order, facts.reference],
        [label.amount, amount],
      ]),
    ],
    attachments: [
      {
        filename: facts.pdf.filename,
        ...(facts.pdf.content === undefined
          ? {}
          : { content: facts.pdf.content }),
        ...(facts.pdf.path === undefined ? {} : { path: facts.pdf.path }),
        contentType: facts.pdf.contentType ?? "application/pdf",
      },
    ],
  });
}
