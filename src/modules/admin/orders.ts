/**
 * The order queue's URL and the words around its rows (spec 012 §2.6, §5.3 `/admin/orders`,
 * `/admin/orders/[id]`, AC-18, AC-19; artboards `admin-orders-{desktop,mobile}.dc.html` and
 * `admin-order-detail-{desktop,mobile}.dc.html`; TASK-222).
 *
 * Read only. The rows themselves come from spec 010's projections in `src/modules/orders`
 * (`listOrdersForAdmin`, `countOrdersForAdmin`, `orderQueueHead`, `orderDetail`); this module
 * holds what admin adds around them and nothing that writes:
 *
 *  - `parseOrderQueueQuery` — the queue's query string (`status`, `country`, `deliveryFrom`,
 *    `deliveryTo`, `placedFrom`, `placedTo`, `page`, and `since`, the head the open tab started
 *    from), parsed straight from the page's `searchParams`. A value that does not parse is
 *    dropped, so a hand-edited URL shows the unfiltered queue rather than an error. Ids, codes
 *    and dates only: no name ever reaches the URL;
 *  - `orderQueueFilter` — that query as spec 010's `OrderQueueFilterSchema`, the placed dates in
 *    the viewer's zone;
 *  - `orderQueueHref` — the same view with some keys changed (pages, the poll's `since`);
 *  - `isNewSince` — whether a row arrived after the head the tab started from (the "New" chip);
 *  - `orderStatusTone` — the chip colour of an internal status: moving, done, or needing a person.
 */
import { z } from "zod";

import type { OrderQueueFilter } from "@/modules/orders";

/** The query-string keys of `/admin/orders`, in the order a URL carries them. */
export const ORDER_QUEUE_QUERY_KEYS = [
  "status",
  "country",
  "deliveryFrom",
  "deliveryTo",
  "placedFrom",
  "placedTo",
  "page",
  "since",
] as const;

/** The keys the filter form sets; a view with any of them is "filtered". */
export const ORDER_QUEUE_FILTER_KEYS = [
  "status",
  "country",
  "deliveryFrom",
  "deliveryTo",
  "placedFrom",
  "placedTo",
] as const;

/** A first value of a query-string parameter, as the page receives it; empty is absent. */
function firstValue(value: unknown): unknown {
  const one = Array.isArray(value) ? (value as unknown[])[0] : value;
  return one === "" ? undefined : one;
}

const IsoDateSchema = z.iso.date();

export const OrderQueueQuerySchema = z.preprocess(
  (input) => {
    const record =
      typeof input === "object" && input !== null
        ? (input as Record<string, unknown>)
        : {};
    return Object.fromEntries(
      ORDER_QUEUE_QUERY_KEYS.map((key) => [key, firstValue(record[key])]),
    );
  },
  z.object({
    status: z
      .string()
      .regex(/^[a-z][a-z_]*[a-z]$/)
      .optional()
      .catch(undefined),
    country: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .optional()
      .catch(undefined),
    deliveryFrom: IsoDateSchema.optional().catch(undefined),
    deliveryTo: IsoDateSchema.optional().catch(undefined),
    placedFrom: IsoDateSchema.optional().catch(undefined),
    placedTo: IsoDateSchema.optional().catch(undefined),
    page: z.coerce
      .number()
      .int()
      .min(2)
      .max(10_000)
      .optional()
      .catch(undefined),
    since: z.iso.datetime().optional().catch(undefined),
  }),
);
export type OrderQueueQuery = z.output<typeof OrderQueueQuerySchema>;

/** Parses `/admin/orders`'s search parameters; never throws. Page 1 is no `page` key. */
export function parseOrderQueueQuery(params: unknown): OrderQueueQuery {
  const parsed = OrderQueueQuerySchema.parse(params);
  return Object.fromEntries(
    Object.entries(parsed).filter(([, value]) => value !== undefined),
  ) as OrderQueueQuery;
}

/** Whether the view narrows the queue (the "filtered empty" state and the 390 count). */
export function activeOrderFilters(query: OrderQueueQuery): number {
  return [
    query.status,
    query.country,
    query.deliveryFrom ?? query.deliveryTo,
    query.placedFrom ?? query.placedTo,
  ].filter((value) => value !== undefined).length;
}

/** The query as spec 010's filter; placed dates are whole days in `timeZone`. */
export function orderQueueFilter(
  query: OrderQueueQuery,
  timeZone: string,
): OrderQueueFilter {
  return {
    ...(query.status === undefined ? {} : { status: query.status }),
    ...(query.country === undefined ? {} : { countryIso2: query.country }),
    ...(query.deliveryFrom === undefined
      ? {}
      : { deliveryFrom: query.deliveryFrom }),
    ...(query.deliveryTo === undefined ? {} : { deliveryTo: query.deliveryTo }),
    ...(query.placedFrom === undefined
      ? {}
      : { createdFrom: query.placedFrom }),
    ...(query.placedTo === undefined ? {} : { createdTo: query.placedTo }),
    timeZone,
    page: query.page ?? 1,
  };
}

/** `/admin/orders` with `query`'s values, `changes` applied (`undefined` removes a key). */
export function orderQueueHref(
  query: OrderQueueQuery,
  changes: Partial<
    Record<keyof OrderQueueQuery, string | number | undefined>
  > = {},
): string {
  const merged: Record<string, string | number | undefined> = {
    ...query,
    ...changes,
  };
  const params = new URLSearchParams();
  for (const key of ORDER_QUEUE_QUERY_KEYS) {
    const value = merged[key];
    if (value === undefined) continue;
    if (key === "page" && Number(value) <= 1) continue;
    params.set(key, String(value));
  }
  const search = params.toString();
  return search === "" ? "/admin/orders" : `/admin/orders?${search}`;
}

/** An order's detail page: the uuid only, never the reference or the public token. */
export function orderDetailHref(orderId: string): string {
  return `/admin/orders/${z.uuid().parse(orderId)}`;
}

/** Whether a row placed at `placedAt` arrived after the head the tab started from. */
export function isNewSince(
  placedAt: string,
  since: string | undefined,
): boolean {
  return since !== undefined && Date.parse(placedAt) > Date.parse(since);
}

/** The status chip's colour (artboard tokens: moving, done, needs a person, ended). */
export type OrderStatusTone = "moving" | "done" | "attention" | "ended";

/** Statuses a person has to act on. */
const ATTENTION_STATUSES: ReadonlySet<string> = new Set([
  "no_partner_available",
  "manual_reroute",
  "delivery_failed",
  "disputed",
  "chargeback_open",
]);

/** Statuses after a delivery, settled in the buyer's favour or ours. */
const DONE_STATUSES: ReadonlySet<string> = new Set([
  "delivered",
  "photo_uploaded",
  "closed",
  "resolved",
  "chargeback_won",
]);

/** Statuses that ended without a delivery or with the money returned. */
const ENDED_STATUSES: ReadonlySet<string> = new Set([
  "payment_failed",
  "abandoned",
  "cancelled",
  "cancelled_refunded",
  "refunded_full",
  "chargeback_lost",
]);

export function orderStatusTone(status: string): OrderStatusTone {
  if (ATTENTION_STATUSES.has(status)) return "attention";
  if (DONE_STATUSES.has(status)) return "done";
  if (ENDED_STATUSES.has(status)) return "ended";
  return "moving";
}

/** The `since` the poll writes when the queue was empty when the tab opened: every row is new. */
export const QUEUE_EPOCH = "1970-01-01T00:00:00.000Z";
