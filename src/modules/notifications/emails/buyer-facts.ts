/**
 * What a buyer email reads, at send time, through the delivery's own transaction (spec 016 §5.2
 * B rows, §7, §8 "Minimisation", "Price display"; TASK-333).
 *
 * From the order: its reference, delivery date, the destination's zone, the recipient's **name and
 * city only** (as typed, from `recipient_snapshot`; never the street, the phone, the note or the
 * card message), the product lines in the buyer's language (else English), and the amount charged
 * (`buyer_total_minor` in `buyer_currency_code`). From the purchase (B1): the buyer's name as typed,
 * `total_minor`, and its orders. Everything else comes from its own row: the refunds through spec
 * 013's `succeededRefunds` (handed in, `buyerRefundLines`), who cancelled through `cancelledByOf`,
 * the `order.delivered` instant, the photo's file through the caller's reader, the document from
 * `invoice`. Nothing is recomputed. The query runs in the pipeline's `system` context.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { type CurrencyCode, isCurrencyCode } from "@/config/currencies";
import { B1_COMPLAINT_PATH_KEY, termsPdfFor } from "@/config/notifications";
import { type LocaleCode, isLocaleCode } from "@/config/locales";
import {
  type BuyerRefundLine,
  type OrderExecutor,
  cancelledByOf,
  orderReference,
  tracking,
} from "@/modules/orders";

import {
  type BuyerOrderFacts,
  BuyerOrderFactsSchema,
  type CancelledFacts,
  type DeliveredFacts,
  type DocumentFacts,
  type PurchaseFacts,
  type RefundFacts,
} from "./buyer";
import { FloristFactsMissing as EmailFactsMissing } from "./facts";
import { type B1Timing, type InvoiceSource, b1Invoices } from "./invoice-wait";

export { EmailFactsMissing };

/** Where a buyer email's other sources come from. Production passes them from the worker. */
export interface BuyerFactSources {
  /** `buyerRefundLines` (spec 018, outside the `orders` barrel): the succeeded refunds, oldest first. */
  readonly refundLines: (
    orderId: string,
    options: { readonly executor: OrderExecutor },
  ) => Promise<BuyerRefundLine[]>;
  /** The delivery photo's JPEG, base64, from the private bucket. */
  readonly photoContent: (location: {
    readonly bucket: string;
    readonly objectKey: string;
  }) => Promise<string>;
  /** `tracking.linkFor`. */
  readonly trackingLink?: (
    orderId: string,
    locale: LocaleCode,
    executor: OrderExecutor,
  ) => Promise<string>;
  /** The terms PDF of a version for a locale (`src/config/notifications.ts`). */
  readonly termsPdf?: (
    termsVersion: string,
    locale: LocaleCode,
  ) => { readonly filename: string; readonly url: string } | null;
  /**
   * Spec 018's stored documents and the `invoice.issue` flag (TASK-334): B1's bounded wait for the
   * purchase's invoices (`./invoice-wait.ts`) and B8's PDF. Absent: B1 carries no invoice and waits
   * for none, and B8 is refused (`EMAIL_FACTS_MISSING`).
   */
  readonly invoices?: InvoiceSource;
  /** The site origin of the account and home links (`NEXT_PUBLIC_SITE_URL`). */
  readonly siteOrigin?: () => string;
}

/** A B1 that would say "Our terms are attached." without them: retried, then `dead`. */
export class TermsPdfMissing extends Error {
  readonly code = "TERMS_PDF_MISSING";

  constructor() {
    super(
      "TERMS_PDF_MISSING: no terms PDF is configured for the order's terms version",
    );
    this.name = "TermsPdfMissing";
  }
}

/** The buyer locale of a delivery, or a refusal. */
export function buyerLocaleOf(value: string): LocaleCode {
  if (!isLocaleCode(value)) {
    throw new EmailFactsMissing("the buyer's locale is not one of ours");
  }
  return value;
}

function originOf(sources: BuyerFactSources): string {
  const origin =
    sources.siteOrigin?.() ??
    process.env["NEXT_PUBLIC_SITE_URL"] ??
    "http://localhost:3000";
  return z.url().parse(origin).replace(/\/+$/u, "");
}

/** One of our currency codes (`src/config/currencies.ts`). */
const CurrencyCodeSchema = z
  .string()
  .refine((code): code is CurrencyCode => isCurrencyCode(code), {
    message: "not a currency of ours",
  });

const Minor = z.union([z.number(), z.string()]).transform((value, ctx) => {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    ctx.addIssue({ code: "custom", message: "not a positive integer" });
    return z.NEVER;
  }
  return number;
});

const OrderRow = z.object({
  id: z.uuid(),
  delivery_date: z.iso.date(),
  time_zone: z.string().min(3),
  city: z.string().nullable(),
  recipient_name: z.string().nullable(),
  amount_minor: Minor,
  currency_code: CurrencyCodeSchema,
  terms_version: z.string().nullable(),
  buyer_name: z.string().nullable(),
  projection: z.string().min(1),
});
type OrderRow = z.infer<typeof OrderRow>;

const ProductRow = z.object({
  order_id: z.uuid(),
  name: z.string().nullable(),
  tier_label_key: z.string().nullable(),
  tier_stems: z.coerce.number().int().positive().nullable(),
});

/** The language half of a locale code: product names are kept per language and locale. */
function languageOf(locale: LocaleCode): string {
  return locale.split("-")[0] ?? locale;
}

async function orderRows(
  executor: OrderExecutor,
  where: { readonly orderId: string } | { readonly purchaseId: string },
): Promise<OrderRow[]> {
  const filter =
    "orderId" in where
      ? sql`o.id = ${where.orderId}`
      : sql`o.purchase_id = ${where.purchaseId}`;
  const rows = await executor.execute(sql`
    SELECT o.id, o.delivery_date::text AS delivery_date,
           coalesce(ci.iana_zone, c.iana_zone) AS time_zone,
           nullif(btrim(o.recipient_snapshot ->> 'city'), '') AS city,
           nullif(btrim(o.recipient_snapshot ->> 'fullName'), '') AS recipient_name,
           o.buyer_total_minor AS amount_minor, o.buyer_currency_code AS currency_code,
           o.terms_version,
           nullif(btrim(o.buyer_snapshot ->> 'name'), '') AS buyer_name,
           s.buyer_projection AS projection
    FROM "order" o
    JOIN order_status s ON s.key = o.status
    JOIN country c ON c.id = o.destination_country_id
    LEFT JOIN city ci ON ci.id = o.destination_city_id
    WHERE ${filter}`);
  return rows.map((row) => OrderRow.parse(row));
}

async function productsOf(
  executor: OrderExecutor,
  orderIds: readonly string[],
  locale: LocaleCode,
): Promise<Map<string, BuyerOrderFacts["products"]>> {
  const language = languageOf(locale);
  const rows = await executor.execute(sql`
    SELECT l.order_id,
           (SELECT pt.name FROM product_translation pt
             WHERE pt.product_id = l.product_id
               AND pt.locale_code IN (${locale}, ${language}, 'en')
             ORDER BY (pt.locale_code = ${locale}) DESC, (pt.locale_code = ${language}) DESC
             LIMIT 1) AS name,
           t.label_key AS tier_label_key, t.stems AS tier_stems
    FROM order_line l
    LEFT JOIN product_tier t ON t.product_id = l.product_id AND t.tier_key = l.tier_key
    WHERE l.order_id IN (${sql.join(
      orderIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    )}) AND l.kind = 'product'
    ORDER BY l.order_id, l.id`);
  const products = new Map<string, BuyerOrderFacts["products"]>();
  for (const raw of rows) {
    const row = ProductRow.parse(raw);
    if (row.name === null || row.tier_label_key === null) {
      throw new EmailFactsMissing("an order line has no product name or tier");
    }
    products.set(row.order_id, [
      ...(products.get(row.order_id) ?? []),
      {
        name: row.name,
        tierLabelKey: row.tier_label_key,
        tierStems: row.tier_stems,
      },
    ]);
  }
  return products;
}

async function buyerOrders(
  executor: OrderExecutor,
  rows: readonly OrderRow[],
  locale: LocaleCode,
  sources: BuyerFactSources,
): Promise<BuyerOrderFacts[]> {
  const products = await productsOf(
    executor,
    rows.map((row) => row.id),
    locale,
  );
  const link =
    sources.trackingLink ??
    ((orderId: string, code: LocaleCode, own: OrderExecutor) =>
      tracking.linkFor(orderId, code, { executor: own }));
  const facts: BuyerOrderFacts[] = [];
  for (const row of rows) {
    if (row.city === null || row.recipient_name === null) {
      throw new EmailFactsMissing("the order has no recipient name or city");
    }
    facts.push(
      BuyerOrderFactsSchema.parse({
        orderId: row.id,
        reference: orderReference(row.id),
        deliveryDate: row.delivery_date,
        timeZone: row.time_zone,
        city: row.city,
        recipientName: row.recipient_name,
        products: products.get(row.id) ?? [],
        amount: { amountMinor: row.amount_minor, currency: row.currency_code },
        trackingUrl: await link(row.id, locale, executor),
      }),
    );
  }
  // By delivery date, then reference (A-founder-2026-10-22 item 4).
  return facts.sort(
    (a, b) =>
      a.deliveryDate.localeCompare(b.deliveryDate) ||
      a.reference.localeCompare(b.reference),
  );
}

async function oneOrder(
  executor: OrderExecutor,
  orderId: string,
  locale: LocaleCode,
  sources: BuyerFactSources,
): Promise<{ readonly row: OrderRow; readonly facts: BuyerOrderFacts }> {
  const [row] = await orderRows(executor, { orderId });
  if (row === undefined)
    throw new EmailFactsMissing("the order does not exist");
  const [facts] = await buyerOrders(executor, [row], locale, sources);
  if (facts === undefined)
    throw new EmailFactsMissing("the order does not exist");
  return { row, facts };
}

/** B2, B3: the order. */
export async function loadBuyerOrderFacts(
  executor: OrderExecutor,
  orderId: string,
  locale: LocaleCode,
  sources: BuyerFactSources,
): Promise<BuyerOrderFacts> {
  return (await oneOrder(executor, orderId, locale, sources)).facts;
}

const PurchaseRow = z.object({
  total_minor: z.union([z.number(), z.string()]).transform(Number),
  currency_code: CurrencyCodeSchema,
});

/** B1: the purchase, its orders and the files it carries. */
export async function loadPurchaseFacts(
  executor: OrderExecutor,
  purchaseId: string,
  locale: LocaleCode,
  sources: BuyerFactSources,
  timing: B1Timing = { now: new Date(), retryDueAt: undefined },
): Promise<PurchaseFacts> {
  return (
    await loadOrderReceived(executor, purchaseId, locale, sources, timing)
  ).facts;
}

/**
 * B1's facts and the ids of the invoices it attaches (written as `notification_delivery_invoice`
 * rows once the send is accepted). Throws `InvoicePending` while it waits (`./invoice-wait.ts`).
 */
export async function loadOrderReceived(
  executor: OrderExecutor,
  purchaseId: string,
  locale: LocaleCode,
  sources: BuyerFactSources,
  timing: B1Timing,
): Promise<{
  readonly facts: PurchaseFacts;
  readonly invoiceIds: readonly string[];
}> {
  const [purchaseRaw] = await executor.execute(sql`
    SELECT total_minor, buyer_currency_code AS currency_code
    FROM purchase WHERE id = ${purchaseId}`);
  if (purchaseRaw === undefined) {
    throw new EmailFactsMissing("the purchase does not exist");
  }
  const purchase = PurchaseRow.parse(purchaseRaw);
  const rows = await orderRows(executor, { purchaseId });
  const orders = await buyerOrders(executor, rows, locale, sources);
  const [first] = orders;
  const buyerName = rows.find((row) => row.buyer_name !== null)?.buyer_name;
  if (first === undefined || buyerName === undefined || buyerName === null) {
    throw new EmailFactsMissing("the purchase has no order or no buyer name");
  }
  const versions = [
    ...new Set(
      rows.map((row) => {
        if (row.terms_version === null) {
          throw new EmailFactsMissing("a live order has no terms version");
        }
        return row.terms_version;
      }),
    ),
  ].sort();
  const pdfOf =
    sources.termsPdf ?? ((version, code) => termsPdfFor(version, code));
  const terms = versions.map((version) => {
    const pdf = pdfOf(version, locale);
    if (pdf === null) throw new TermsPdfMissing();
    return {
      filename: pdf.filename,
      path: pdf.url,
      contentType: "application/pdf" as const,
    };
  });
  const invoices =
    sources.invoices === undefined
      ? { attachments: [], invoiceIds: [] }
      : await b1Invoices(
          executor,
          purchaseId,
          orders.map((order) => order.orderId),
          timing,
          sources.invoices,
        );
  const origin = originOf(sources);
  const facts: PurchaseFacts = {
    buyerName,
    total: {
      amountMinor: purchase.total_minor,
      currency: purchase.currency_code,
    },
    orders,
    accountUrl:
      orders.length === 1
        ? `${origin}/${locale}/account/orders/${first.reference}`
        : `${origin}/${locale}/account`,
    terms,
    invoices: invoices.attachments.map((file) => ({
      filename: file.filename,
      ...(file.content === undefined ? {} : { content: file.content }),
      ...(file.path === undefined ? {} : { path: file.path }),
      contentType: file.contentType,
    })),
    complaintKey: B1_COMPLAINT_PATH_KEY,
  };
  return { facts, invoiceIds: invoices.invoiceIds };
}

const PhotoRow = z.object({
  bucket: z.string().min(1),
  object_key: z.string().min(1),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  delivered_at: z.coerce.date().nullable(),
});

/** The photo's ratio when the asset row does not carry one: the artboard's 4∶5. */
const DEFAULT_RATIO = { width: 4, height: 5 } as const;

/** B4: the order, the delivery's instant and the newest photo. */
export async function loadDeliveredFacts(
  executor: OrderExecutor,
  orderId: string,
  locale: LocaleCode,
  sources: BuyerFactSources,
): Promise<DeliveredFacts> {
  const { facts } = await oneOrder(executor, orderId, locale, sources);
  const [raw] = await executor.execute(sql`
    SELECT a.bucket, a.object_key, a.width, a.height,
           (SELECT max(e.occurred_at) FROM order_event e
             WHERE e.order_id = ${orderId} AND e.to_status = 'delivered'
               AND e.from_status IS DISTINCT FROM e.to_status) AS delivered_at
    FROM delivery_proof p
    JOIN media_asset a ON a.id = p.media_asset_id
    WHERE p.order_id = ${orderId}
    ORDER BY p.uploaded_at DESC, p.id DESC
    LIMIT 1`);
  if (raw === undefined) throw new EmailFactsMissing("the order has no photo");
  const row = PhotoRow.parse(raw);
  if (row.delivered_at === null) {
    throw new EmailFactsMissing("the order has no delivery time");
  }
  return {
    order: facts,
    deliveredAt: row.delivered_at,
    photo: {
      content: await sources.photoContent({
        bucket: row.bucket,
        objectKey: row.object_key,
      }),
      width: row.width ?? DEFAULT_RATIO.width,
      height: row.height ?? DEFAULT_RATIO.height,
    },
  };
}

const CancellationRow = z.object({
  actor: z.string().min(1),
  reason: z.string().nullable(),
});

/** B5: the order, who cancelled it (by class), and the buyer's home. */
export async function loadCancelledFacts(
  executor: OrderExecutor,
  orderId: string,
  locale: LocaleCode,
  sources: BuyerFactSources,
): Promise<CancelledFacts> {
  const { facts } = await oneOrder(executor, orderId, locale, sources);
  const [raw] = await executor.execute(sql`
    SELECT e.actor, e.payload ->> 'reason' AS reason
    FROM order_event e
    WHERE e.order_id = ${orderId}
      AND e.to_status IN ('cancelled', 'cancelled_refunded')
      AND e.from_status IS DISTINCT FROM e.to_status
    ORDER BY e.seq DESC LIMIT 1`);
  if (raw === undefined) {
    throw new EmailFactsMissing("the order has no cancellation");
  }
  const row = CancellationRow.parse(raw);
  return {
    order: facts,
    cancelledBy: cancelledByOf(row.actor, row.reason),
    homeUrl: `${originOf(sources)}/${locale}`,
  };
}

/** B6: the order, its succeeded refunds and its projection now. */
export async function loadRefundFacts(
  executor: OrderExecutor,
  orderId: string,
  locale: LocaleCode,
  sources: BuyerFactSources,
): Promise<RefundFacts> {
  const { row, facts } = await oneOrder(executor, orderId, locale, sources);
  const refunds = await sources.refundLines(orderId, { executor });
  if (refunds.length === 0) {
    throw new EmailFactsMissing("the order has no succeeded refund yet");
  }
  return { order: facts, refunds, projection: row.projection };
}

const DocumentRow = z.object({
  kind: z.enum(["invoice", "credit_note"]),
  number: z.string().min(1),
  order_id: z.uuid(),
  /** A credit note's gross may be stored negative (spec 018's correction); the email prints its size. */
  total_minor: z.union([z.number(), z.string()]).transform((value, ctx) => {
    const number = Math.abs(typeof value === "number" ? value : Number(value));
    if (!Number.isSafeInteger(number) || number === 0) {
      ctx.addIssue({ code: "custom", message: "not a non-zero integer" });
      return z.NEVER;
    }
    return number;
  }),
  currency_code: CurrencyCodeSchema,
});

/** B8: the document's own row, and its stored PDF. */
export async function loadDocumentFacts(
  executor: OrderExecutor,
  invoiceId: string,
  sources: BuyerFactSources,
): Promise<DocumentFacts> {
  const [raw] = await executor.execute(sql`
    SELECT kind, number, order_id, total_minor, currency_code
    FROM invoice WHERE id = ${invoiceId}`);
  if (raw === undefined)
    throw new EmailFactsMissing("the document does not exist");
  const row = DocumentRow.parse(raw);
  if (sources.invoices === undefined) {
    throw new EmailFactsMissing("no reader of the stored documents");
  }
  // Spec 018's reader: throws `INVOICE_PDF_NOT_RENDERED` or `INVOICE_PDF_HASH_MISMATCH` while the
  // PDF cannot be attached as stored, and the job retries.
  const pdf = await sources.invoices.read(invoiceId, executor);
  return {
    kind: row.kind,
    number: row.number,
    reference: orderReference(row.order_id),
    amount: { amountMinor: row.total_minor, currency: row.currency_code },
    pdf: {
      filename: pdf.filename,
      content: Buffer.from(pdf.bytes).toString("base64"),
      contentType: "application/pdf",
    },
  };
}
