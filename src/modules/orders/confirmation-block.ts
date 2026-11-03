/**
 * The post-purchase block's view model (spec 018 §5.2 "`getConfirmationBlock`", §5.3
 * `checkout/done`; AC-9, AC-28 confirmation half, AC-43, AC-46; TASK-340).
 *
 * `getConfirmationBlock(orderId)` is what spec 013's `test` and `live` confirmation states mount
 * (spec 010 §14 A2.4): the masked buyer email, the four steps with the current one marked, the
 * tracking link, the calendar file, the invoice state, and the **separate `cancelLine` part**,
 * present exactly while the buyer reads "We have your order" (set P).
 *
 * **Set P is read, never listed.** The buyer projection comes from `order_status.buyer_projection`
 * (spec 002 A6.4) and is folded by `buyerStep` (`with_florist` reads `confirmed`). Set P is exactly
 * the statuses whose folded projection is `confirmed` (§5.2: E plus `accepted` and `paid`), so
 * `cancelLine` is present exactly when the folded projection is `confirmed`, and it disappears the
 * moment spec 013 writes `order.in_production` at 06:00 destination-local on the delivery date.
 *
 * **What the block never carries.** No recipient field, no florist, no assignment, no event type,
 * no refund: the only amount is the order's own `buyer_total_minor`, which the confirm dialog
 * prints after the buyer pressed the line (§14 A-founder-2026-10-14b B.1). `demo` orders have no
 * block (spec 010 AC-29): asking for one throws.
 *
 * Nothing here logs an order id, a token or an email (spec 018 §8).
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { CurrencyCodeSchema } from "./refund-lines";
import { type EngineConnection, withExecutor } from "./service/executor";
import { ORDER_REFERENCE_PATTERN, orderReference } from "./service/reference";
import { tracking, type TrackingOptions } from "./tracking";
import { type BuyerStep, buyerStep } from "./tracking-view";

/** The four steps of "What happens next" (spec 018 §7 `postPurchase.steps`), in order. */
export const POST_PURCHASE_STEPS = [
  "order",
  "beingMade",
  "onItsWay",
  "delivered",
] as const;
export const PostPurchaseStepKeySchema = z.enum(POST_PURCHASE_STEPS);
export type PostPurchaseStepKey = z.infer<typeof PostPurchaseStepKeySchema>;

/**
 * Where each folded projection sits on the four steps: the index of the current step, `4` when
 * every step is done (`closed`), `null` when none is reached (`placed`: the payment is not yet
 * confirmed; `cancelled`: spec 013's state shows no block).
 */
const POSITION: Readonly<Record<BuyerStep, number | null>> = {
  placed: null,
  confirmed: 0,
  being_made: 1,
  on_its_way: 2,
  delivered: 3,
  closed: 4,
  cancelled: null,
};

export const PostPurchaseStepSchema = z
  .object({
    key: PostPurchaseStepKeySchema,
    state: z.enum(["done", "current", "future"]),
  })
  .strict();
export type PostPurchaseStep = z.infer<typeof PostPurchaseStepSchema>;

/** The four steps for a folded projection (pure). */
export function postPurchaseSteps(projection: BuyerStep): PostPurchaseStep[] {
  const position = POSITION[projection];
  return POST_PURCHASE_STEPS.map((key, index) => ({
    key,
    state:
      position === null || index > position
        ? "future"
        : index === position
          ? "current"
          : "done",
  }));
}

/** The free-cancellation window: the folded projection is `confirmed` (set P, §5.2). */
export function isCancellable(projection: BuyerStep): boolean {
  return projection === "confirmed";
}

const BULLETS = "•••";

/**
 * "a•••@example.com" (AC-9): the first character of the local part, three bullets, `@` and the
 * domain. `null` for a value with no local part or no domain, which the block then omits.
 */
export function maskEmail(email: string | null): string | null {
  const value = email?.trim() ?? "";
  const at = value.lastIndexOf("@");
  if (at <= 0 || at === value.length - 1) return null;
  const [first] = Array.from(value.slice(0, at));
  return `${first ?? ""}${BULLETS}@${value.slice(at + 1)}`;
}

const MoneySchema = z
  .object({
    amountMinor: z.number().int().positive(),
    currencyCode: CurrencyCodeSchema,
  })
  .strict();

export const ConfirmationBlockSchema = z
  .object({
    reference: z.string().regex(ORDER_REFERENCE_PATTERN),
    mode: z.enum(["test", "live"]),
    maskedEmail: z.string().min(1).nullable(),
    projection: z.enum([
      "placed",
      "confirmed",
      "being_made",
      "on_its_way",
      "delivered",
      "closed",
      "cancelled",
    ]),
    steps: z.array(PostPurchaseStepSchema).length(POST_PURCHASE_STEPS.length),
    /** `/{locale}/track/{token}` on the site origin: the share tile's link. */
    trackingUrl: z.url(),
    /** The same link's path, for the tile (the page's own origin). */
    trackingPath: z.string().startsWith("/"),
    calendarPath: z.string().startsWith("/"),
    deliveryDate: z.iso.date(),
    /** `issued` once the order's invoice has rendered (AC-43); `pending` until then. */
    invoice: z.enum(["pending", "issued"]),
    /**
     * The quiet cancel line's part, present exactly while the order is in set P (AC-9, AC-28).
     * `amount` is the order's `buyer_total_minor`, printed only by the confirm dialog.
     */
    cancelLine: z.object({ amount: MoneySchema }).strict().nullable(),
  })
  .strict();
export type ConfirmationBlock = z.infer<typeof ConfirmationBlockSchema>;

const BlockRow = z.object({
  mode: z.enum(["demo", "test", "live"]),
  delivery_date: z.iso.date(),
  projection: z.string(),
  email: z.string().nullable(),
  total_minor: z.coerce.number().int().positive(),
  currency_code: CurrencyCodeSchema,
  invoice_rendered: z.boolean(),
});

/** What `getConfirmationBlock` reads with. */
export interface ConfirmationBlockOptions extends EngineConnection {
  /** The page's locale: the tracking link is built for it. */
  readonly locale: string;
  /** The tracking link's signing seams (tests). */
  readonly tracking?: TrackingOptions & { readonly origin?: string };
}

/**
 * The block for one `test` or `live` order. Throws when the order does not exist or is a `demo`
 * order (spec 010's demo state renders no block).
 */
export async function getConfirmationBlock(
  orderId: string,
  options: ConfirmationBlockOptions,
): Promise<ConfirmationBlock> {
  const id = z.uuid().parse(orderId);
  return withExecutor(
    options,
    "orders.confirmation_block",
    async (executor) => {
      const [raw] = await executor.execute(sql`
      SELECT o.mode, o.delivery_date::text AS delivery_date,
             s.buyer_projection AS projection,
             o.buyer_snapshot ->> 'email' AS email,
             o.buyer_total_minor AS total_minor,
             o.buyer_currency_code AS currency_code,
             EXISTS (SELECT 1 FROM invoice i
                     WHERE i.order_id = o.id AND i.kind = 'invoice'
                       AND i.rendered_at IS NOT NULL) AS invoice_rendered
      FROM "order" o
      JOIN order_status s ON s.key = o.status
      WHERE o.id = ${id}`);
      if (raw === undefined)
        throw new Error("confirmation block: no such order");
      const row = BlockRow.parse(raw);
      if (row.mode === "demo") {
        throw new Error("confirmation block: a demo order has no block");
      }
      const projection = buyerStep(row.projection);
      const trackingUrl = await tracking.linkFor(id, options.locale, {
        ...options.tracking,
        executor,
      });
      const trackingPath = new URL(trackingUrl).pathname;
      return ConfirmationBlockSchema.parse({
        reference: orderReference(id),
        mode: row.mode,
        maskedEmail: maskEmail(row.email),
        projection,
        steps: postPurchaseSteps(projection),
        trackingUrl,
        trackingPath,
        calendarPath: `${trackingPath}/calendar.ics`,
        deliveryDate: row.delivery_date,
        invoice: row.invoice_rendered ? "issued" : "pending",
        cancelLine: isCancellable(projection)
          ? {
              amount: {
                amountMinor: row.total_minor,
                currencyCode: row.currency_code,
              },
            }
          : null,
      } satisfies ConfirmationBlock);
    },
  );
}
