/**
 * `placePurchase`: the orders of one basket, bought together (spec 010 §14 A-founder-2026-10-22
 * items 1 D1, D9, 2 A and 3; AC-63 service half, AC-66 purchase half; TASK-347).
 *
 * In the caller's transaction (or one it opens), and in this order:
 *
 *   1. parse `PlacePurchaseInputSchema` before anything is read or written: one to
 *      `BASKET_MAX_LINES` orders, each of the purchase's mode, currency, locale and customer, and
 *      their `buyerTotalMinor` summing to the purchase's `totalMinor` (price shown = price
 *      charged: the amount charged once is the sum of the orders). A failure is
 *      `ORDER_INPUT_INVALID` with nothing written;
 *   2. one `INSERT INTO purchase` with an id drawn here;
 *   3. `place()` once per order, in basket order, each with that `purchaseId` and A2.3's own
 *      savepoint and reference retry. A refusal or an error from any of them is raised as it came;
 *      the caller's transaction unwinds and nothing of the purchase is kept.
 *
 * The database holds the same facts a second time: `0019`'s composite key refuses an order of
 * another currency or mode, and the deferred `purchase_total_check` refuses, at commit, a
 * purchase whose orders do not sum to its total or that has none (`PURCHASE_TOTAL_MISMATCH`).
 *
 * It authorises and routes nothing: the checkout's placement (TASK-205) calls `transition` and
 * `demoRoute` per order afterwards, in the same transaction.
 */
import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { z } from "zod";

import { BASKET_MAX_LINES } from "@/config/basket";
import { logger } from "@/lib/logger";

import { OrderEngineError } from "./errors";
import { OrderModeSchema } from "./events";
import { withExecutor, type OrderExecutor } from "./executor";
import type { OutboxTargetResolver } from "./outbox";
import { placeWith, PlaceOrderInputSchema, type PlaceOptions } from "./place";

const CurrencyCode = z.string().regex(/^[A-Z]{3}$/);
const LocaleCode = z.string().regex(/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/);

/**
 * One order of the purchase: `PlaceOrderInput` without `purchaseId`, which `placePurchase`
 * writes itself. Parsed again, whole, by `place`.
 */
const PurchaseOrderInputSchema = z
  .looseObject({
    mode: OrderModeSchema,
    localeCode: LocaleCode,
    customerId: z.uuid(),
    buyerCurrency: CurrencyCode,
    buyerTotalMinor: z.number().int().positive(),
  })
  .refine((order) => !("purchaseId" in order), {
    error: "placePurchase writes each order's purchaseId",
    path: ["purchaseId"],
  });

export const PlacePurchaseInputSchema = z
  .object({
    mode: OrderModeSchema,
    buyerCurrency: CurrencyCode,
    /** The total the buyer confirmed at step 3: the one amount charged (spec 013). */
    totalMinor: z.number().int().positive(),
    localeCode: LocaleCode,
    customerId: z.uuid(),
    /** In basket order; each becomes its own order with its own reference. */
    orders: z.array(PurchaseOrderInputSchema).min(1).max(BASKET_MAX_LINES),
  })
  .strict()
  .refine(
    (input) =>
      input.orders.every(
        (order) =>
          order.mode === input.mode &&
          order.buyerCurrency === input.buyerCurrency &&
          order.localeCode === input.localeCode &&
          order.customerId === input.customerId,
      ),
    {
      error:
        "every order has the purchase's mode, currency, locale and customer",
      path: ["orders"],
    },
  )
  .refine(
    (input) =>
      input.orders.reduce((sum, order) => sum + order.buyerTotalMinor, 0) ===
      input.totalMinor,
    {
      error:
        "the orders' totals add up to the purchase total (price shown = price charged)",
      path: ["totalMinor"],
    },
  );

export type PlacePurchaseInput = z.input<typeof PlacePurchaseInputSchema>;

export interface PlacePurchaseResult {
  readonly purchaseId: string;
  /** In the input's order. */
  readonly orderIds: readonly string[];
}

export interface PlacePurchaseOptions extends PlaceOptions {
  /** Replaces `crypto.randomUUID()` for the purchase id (tests). */
  readonly newPurchaseId?: () => string;
}

export async function placePurchaseWith(
  executor: OrderExecutor,
  raw: unknown,
  resolver?: OutboxTargetResolver,
  newOrderId?: () => string,
  newPurchaseId: () => string = randomUUID,
): Promise<PlacePurchaseResult> {
  const parsed = PlacePurchaseInputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new OrderEngineError("ORDER_INPUT_INVALID", {
      event: "order.placed",
    });
  }
  const input = parsed.data;
  // Each order whole, before the purchase row is written (step 1: nothing written on a refusal).
  for (const order of input.orders) {
    if (!PlaceOrderInputSchema.safeParse(order).success) {
      throw new OrderEngineError("ORDER_INPUT_INVALID", {
        event: "order.placed",
      });
    }
  }

  const purchaseId = z.uuid().parse(newPurchaseId());
  await executor.execute(sql`
    INSERT INTO purchase (id, mode, buyer_currency_code, total_minor, locale_code, customer_id)
    VALUES (${purchaseId}, ${input.mode}, ${input.buyerCurrency}, ${input.totalMinor},
            ${input.localeCode}, ${input.customerId})`);

  const orderIds: string[] = [];
  for (const order of input.orders) {
    const { orderId } = await placeWith(
      executor,
      { ...order, purchaseId },
      resolver,
      newOrderId,
    );
    orderIds.push(orderId);
  }
  // §8: ids and counts only.
  logger.info(
    {
      purchase_id: purchaseId,
      order_count: orderIds.length,
      mode: input.mode,
    },
    "orders.purchase_placed",
  );
  return { purchaseId, orderIds };
}

/** `orderService.placePurchase(input)` (§14 A-founder-2026-10-22 item 3). */
export async function placePurchase(
  input: PlacePurchaseInput,
  options: PlacePurchaseOptions = {},
): Promise<PlacePurchaseResult> {
  return withExecutor(options, "orders.place_purchase", (executor) =>
    placePurchaseWith(
      executor,
      input,
      options.outboxTargets,
      options.newId,
      options.newPurchaseId,
    ),
  );
}
