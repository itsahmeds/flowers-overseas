/**
 * The buyer account's reads (spec 018 §5.3 `account`, `account/orders/[reference]`; §14
 * A-founder-2026-10-22 C.7.1; AC-10 account half, AC-25 as amended, AC-26; TASK-344).
 *
 * **Ownership is row-level security's.** Which orders a buyer may see is read under the buyer's
 * `customer` database context (`toDbContext` of `src/lib/auth/buyer.ts`): `order_customer` admits
 * only rows whose customer's `user_id` is the session's user, so another customer's reference reads
 * as nothing and the page answers 404 (AC-25: RLS, not only an application check). The facts of
 * the orders it admitted are then read in one `system` transaction, because the timeline, the
 * florist line and the documents come from tables the `customer` role does not read (the order's
 * events carry internal payloads; spec 002 §14 A6).
 *
 * What a row and the detail hold is §5.3's list and nothing more: reference, placed date, delivery
 * date, city, product, the order's own `buyer_total_minor` in its currency (nothing summed, C.16),
 * the buyer projection, the succeeded refund lines (spec 013's `succeededRefunds` through
 * `buyerRefundLines`, AC-10), a fresh signed tracking link, the invoice and every credit note. The
 * detail adds the recipient recap until the 90-day sweep (`recipient.contact_redacted`), then only
 * the city and the removal date (AC-26).
 *
 * Read only: nothing here writes an order, appends an event or moves money (AC-62). Deliberately
 * **not** in the `orders` barrel: it imports `./buyer-refund-lines.ts`, which imports `payments`.
 * Nothing here logs.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import type { DbContext } from "@/lib/db";

import { buyerRefundLines } from "./buyer-refund-lines";
import { isCancellable } from "./confirmation-block";
import { type BuyerRefundLine, CurrencyCodeSchema } from "./refund-lines";
import {
  type EngineConnection,
  type OrderExecutor,
  drizzleExecutor,
  textArray,
  withExecutor,
} from "./service/executor";
import {
  ORDER_REFERENCE_PATTERN,
  orderReference,
} from "./service/reference";
import { tracking } from "./tracking";
import {
  type BuyerStep,
  type TrackingView,
  buyerStep,
  getTrackingView,
} from "./tracking-view";

/** The order modes an account lists: `live`, and in a non-production environment `test` too. */
export function accountOrderModes(environment: string): readonly string[] {
  return environment === "production" ? ["live"] : ["live", "test"];
}

/** Runs `fn` under the buyer's database context (RLS); tests pass their own. */
export type CustomerRunner = <T>(
  fn: (executor: OrderExecutor) => Promise<T>,
) => Promise<T>;

/** The production runner: `withDbContext(context, …)`. */
export function customerRunner(context: DbContext): CustomerRunner {
  return async (fn) => {
    const { withDbContext } = await import("@/lib/db");
    return withDbContext(context, (db) => fn(drizzleExecutor(db)));
  };
}

const IdRow = z.object({ id: z.uuid() });

/**
 * The ids of the orders this buyer may see, newest first, in `modes`; with `reference`, at most
 * the one order it names. Read under the buyer's context, so RLS decides.
 */
export async function ownedOrderIds(
  asCustomer: CustomerRunner,
  modes: readonly string[],
  reference?: string,
): Promise<string[]> {
  if (reference !== undefined && !ORDER_REFERENCE_PATTERN.test(reference)) {
    return [];
  }
  return asCustomer(async (executor) => {
    const rows = await executor.execute(sql`
      SELECT o.id FROM "order" o
      WHERE o.mode = ANY(${textArray(modes)})
        ${reference === undefined ? sql`` : sql`AND public.order_reference(o.id) = ${reference}`}
      ORDER BY o.created_at DESC, o.id`);
    return rows.map((row) => IdRow.parse(row).id);
  });
}

const MoneySchema = z
  .object({
    amountMinor: z.number().int().positive(),
    currencyCode: CurrencyCodeSchema,
  })
  .strict();

export const AccountOrderRowSchema = z
  .object({
    orderId: z.uuid(),
    reference: z.string().regex(ORDER_REFERENCE_PATTERN),
    purchaseId: z.uuid(),
    placedAt: z.date(),
    deliveryDate: z.iso.date(),
    city: z.string().min(1).nullable(),
    productName: z.string().min(1).nullable(),
    stems: z.number().int().positive().nullable(),
    amount: MoneySchema,
    projection: z.string().min(1),
    timeZone: z.string().min(1),
    /** `/{locale}/track/{token}`, minted now. */
    trackingPath: z.string().startsWith("/"),
    /** The rendered invoice's id, for the owner download; `null` until it renders. */
    invoiceId: z.uuid().nullable(),
  })
  .strict();
export type AccountOrderRow = Omit<
  z.infer<typeof AccountOrderRowSchema>,
  "projection"
> & {
  readonly projection: BuyerStep;
  readonly refundLines: readonly BuyerRefundLine[];
};

const ListRow = z.object({
  id: z.uuid(),
  purchase_id: z.uuid(),
  created_at: z.coerce.date(),
  delivery_date: z.iso.date(),
  city: z.string().nullable(),
  product_name: z.string().nullable(),
  stems: z.coerce.number().int().positive().nullable(),
  amount_minor: z.coerce.number().int().positive(),
  currency_code: z.string(),
  projection: z.string(),
  zone: z.string(),
  invoice_id: z.uuid().nullable(),
});

/** The language half of a locale code: product names are kept per language and locale. */
function languageOf(locale: string): string {
  return locale.split("-", 1)[0] ?? locale;
}

function uuidArray(ids: readonly string[]): ReturnType<typeof sql> {
  return sql`ARRAY[${sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  )}]::uuid[]`;
}

export interface AccountReadOptions extends EngineConnection {
  readonly locale: string;
  /** The tracking link's origin (tests). */
  readonly origin?: string;
}

/** The facts of `orderIds` (already admitted by RLS), newest first. */
export async function accountOrderRows(
  orderIds: readonly string[],
  options: AccountReadOptions,
): Promise<AccountOrderRow[]> {
  if (orderIds.length === 0) return [];
  const ids = orderIds.map((id) => z.uuid().parse(id));
  const language = languageOf(options.locale);
  return withExecutor(options, "orders.account_list", async (executor) => {
    const raw = await executor.execute(sql`
      SELECT o.id, o.purchase_id, o.created_at, o.delivery_date::text AS delivery_date,
             nullif(btrim(o.recipient_snapshot ->> 'city'), '') AS city,
             o.buyer_total_minor AS amount_minor, o.buyer_currency_code AS currency_code,
             s.buyer_projection AS projection,
             coalesce(ci.iana_zone, c.iana_zone) AS zone,
             (SELECT i.id FROM invoice i
               WHERE i.order_id = o.id AND i.kind = 'invoice' AND i.rendered_at IS NOT NULL
               ORDER BY i.issued_at LIMIT 1) AS invoice_id,
             p.name AS product_name, p.stems
      FROM "order" o
      JOIN order_status s ON s.key = o.status
      JOIN country c ON c.id = o.destination_country_id
      LEFT JOIN city ci ON ci.id = o.destination_city_id
      LEFT JOIN LATERAL (
        SELECT (SELECT pt.name FROM product_translation pt
                 WHERE pt.product_id = l.product_id
                   AND pt.locale_code IN (${options.locale}, ${language}, 'en')
                 ORDER BY (pt.locale_code = ${options.locale}) DESC,
                          (pt.locale_code = ${language}) DESC
                 LIMIT 1) AS name,
               t.stems
        FROM order_line l
        LEFT JOIN product_tier t ON t.product_id = l.product_id AND t.tier_key = l.tier_key
        WHERE l.order_id = o.id AND l.kind = 'product'
        ORDER BY l.created_at, l.id LIMIT 1
      ) p ON true
      WHERE o.id = ANY(${uuidArray(ids)})
      ORDER BY o.created_at DESC, o.id`);
    const rows: AccountOrderRow[] = [];
    for (const value of raw) {
      const row = ListRow.parse(value);
      const link = await tracking.linkFor(row.id, options.locale, {
        executor,
        ...(options.origin === undefined ? {} : { origin: options.origin }),
      });
      const parsed = AccountOrderRowSchema.parse({
        orderId: row.id,
        reference: orderReference(row.id),
        purchaseId: row.purchase_id,
        placedAt: row.created_at,
        deliveryDate: row.delivery_date,
        city: row.city,
        productName: row.product_name,
        stems: row.stems,
        amount: {
          amountMinor: row.amount_minor,
          currencyCode: row.currency_code,
        },
        projection: row.projection,
        timeZone: row.zone,
        trackingPath: new URL(link).pathname,
        invoiceId: row.invoice_id,
      });
      rows.push({
        ...parsed,
        projection: buyerStep(row.projection),
        refundLines: await buyerRefundLines(row.id, { executor }),
      });
    }
    return rows;
  });
}

/** One purchase of the list: its orders were paid together (spec 010 item 13). */
export interface AccountPurchaseGroup {
  readonly purchaseId: string;
  readonly placedAt: Date;
  readonly orders: readonly AccountOrderRow[];
}

/** The rows grouped by purchase, in the rows' order (newest purchase first). */
export function groupByPurchase(
  rows: readonly AccountOrderRow[],
): AccountPurchaseGroup[] {
  const groups = new Map<string, AccountOrderRow[]>();
  for (const row of rows) {
    const group = groups.get(row.purchaseId);
    if (group === undefined) groups.set(row.purchaseId, [row]);
    else group.push(row);
  }
  return [...groups.entries()].map(([purchaseId, orders]) => ({
    purchaseId,
    placedAt: orders.reduce(
      (earliest, order) =>
        order.placedAt < earliest ? order.placedAt : earliest,
      orders[0]?.placedAt ?? new Date(0),
    ),
    orders,
  }));
}

/* -------------------------------------------------------------------------- */
/* One order                                                                  */
/* -------------------------------------------------------------------------- */

const RecipientShownSchema = z
  .object({
    kind: z.literal("shown"),
    fullName: z.string().min(1),
    addressLines: z.array(z.string().min(1)).min(1),
    postcode: z.string().min(1).nullable(),
    city: z.string().min(1),
    phoneE164: z.string().min(1),
    cardMessage: z.string().min(1).nullable(),
    signAs: z.string().min(1).nullable(),
  })
  .strict();

const RecipientRemovedSchema = z
  .object({
    kind: z.literal("removed"),
    city: z.string().min(1).nullable(),
    removedOn: z.date(),
  })
  .strict();

export const AccountRecipientSchema = z.discriminatedUnion("kind", [
  RecipientShownSchema,
  RecipientRemovedSchema,
]);
export type AccountRecipient = z.infer<typeof AccountRecipientSchema>;

export const AccountDocumentSchema = z
  .object({
    invoiceId: z.uuid(),
    kind: z.enum(["invoice", "credit_note"]),
    number: z.string().min(1),
  })
  .strict();
export type AccountDocument = z.infer<typeof AccountDocumentSchema>;

export interface AccountOrderDetail {
  readonly row: AccountOrderRow;
  readonly view: TrackingView;
  readonly recipient: AccountRecipient;
  /** The invoice and every credit note, oldest first. */
  readonly documents: readonly AccountDocument[];
  /** Set P: "Cancel for free" is offered (AC-28). */
  readonly cancellable: boolean;
}

const DetailRow = z.object({
  snapshot: z.record(z.string(), z.unknown()),
  contact_redacted: z.boolean(),
  contact_redacted_at: z.coerce.date().nullable(),
});

const SnapshotSchema = z.object({
  fullName: z.string().optional(),
  addressLines: z.array(z.string()).optional(),
  postcode: z.string().optional(),
  city: z.string().optional(),
  phoneE164: z.string().optional(),
  cardMessage: z.string().optional(),
  signAs: z.string().optional(),
});

const DocumentRow = z.object({
  id: z.uuid(),
  kind: z.enum(["invoice", "credit_note"]),
  number: z.string(),
});

function nonEmpty(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

/** The recipient recap until the sweep, then the city and the removal date (AC-26). */
export function accountRecipient(
  snapshot: unknown,
  redacted: { readonly at: Date | null; readonly flag: boolean },
): AccountRecipient {
  const parsed = SnapshotSchema.safeParse(snapshot);
  const value = parsed.success ? parsed.data : {};
  const city = nonEmpty(value.city);
  const fullName = nonEmpty(value.fullName);
  const lines = (value.addressLines ?? []).filter((line) => line.trim() !== "");
  const phone = nonEmpty(value.phoneE164);
  if (
    redacted.flag ||
    fullName === null ||
    city === null ||
    phone === null ||
    lines.length === 0
  ) {
    return AccountRecipientSchema.parse({
      kind: "removed",
      city,
      removedOn: redacted.at ?? new Date(0),
    });
  }
  return AccountRecipientSchema.parse({
    kind: "shown",
    fullName,
    addressLines: lines,
    postcode: nonEmpty(value.postcode),
    city,
    phoneE164: phone,
    cardMessage: nonEmpty(value.cardMessage),
    signAs: nonEmpty(value.signAs),
  });
}

/** One order this buyer owns (`orderId` already admitted by RLS). */
export async function accountOrderDetail(
  orderId: string,
  options: AccountReadOptions,
): Promise<AccountOrderDetail> {
  const id = z.uuid().parse(orderId);
  return withExecutor(options, "orders.account_detail", async (executor) => {
    const [row] = await accountOrderRows([id], { ...options, executor });
    if (row === undefined) throw new Error("account: no such order");
    const view = await getTrackingView(id, {
      executor,
      refundLines: buyerRefundLines,
    });
    const [detailRaw] = await executor.execute(sql`
      SELECT o.recipient_snapshot AS snapshot, r.contact_redacted, r.contact_redacted_at
      FROM "order" o
      JOIN recipient r ON r.id = o.recipient_id
      WHERE o.id = ${id}`);
    if (detailRaw === undefined) throw new Error("account: no such order");
    const detail = DetailRow.parse(detailRaw);
    const documents = (
      await executor.execute(sql`
        SELECT i.id, i.kind, i.number FROM invoice i
        WHERE i.order_id = ${id} AND i.rendered_at IS NOT NULL
        ORDER BY i.issued_at, i.number`)
    ).map((value) => {
      const doc = DocumentRow.parse(value);
      return AccountDocumentSchema.parse({
        invoiceId: doc.id,
        kind: doc.kind,
        number: doc.number,
      });
    });
    return {
      row,
      view,
      recipient: accountRecipient(detail.snapshot, {
        flag: detail.contact_redacted,
        at: detail.contact_redacted_at,
      }),
      documents,
      cancellable: row.amount.amountMinor > 0 && isCancellable(row.projection),
    };
  });
}

/**
 * Whether `invoiceId` is a rendered document of an order this buyer may see (AC-23 owner half):
 * the order is read under the buyer's context, so RLS decides.
 */
export async function ownsInvoice(
  asCustomer: CustomerRunner,
  modes: readonly string[],
  invoiceId: string,
  connection: EngineConnection = {},
): Promise<boolean> {
  const id = z.uuid().safeParse(invoiceId);
  if (!id.success) return false;
  const orderId = await withExecutor(
    connection,
    "orders.account_invoice",
    async (executor) => {
      const [found] = await executor.execute(sql`
        SELECT i.order_id AS id FROM invoice i
        WHERE i.id = ${id.data} AND i.rendered_at IS NOT NULL`);
      return found === undefined ? null : IdRow.parse(found).id;
    },
  );
  if (orderId === null) return false;
  return asCustomer(async (executor) => {
    const [owned] = await executor.execute(sql`
      SELECT o.id FROM "order" o
      WHERE o.id = ${orderId} AND o.mode = ANY(${textArray(modes)})`);
    return owned !== undefined;
  });
}
