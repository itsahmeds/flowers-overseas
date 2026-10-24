/**
 * What `/{locale}/checkout/done` shows (spec 010 §2 "Confirmation", AC-29; §14 A2.4 AC-46; §14
 * A-founder-2026-10-22 AC-68; TASK-206).
 *
 * Read from the `fo_checkout` cookie, never from a URL token: the basket it names, and, once that
 * basket is placed, its purchase's orders in basket order, each with its `FO-` reference
 * (derived from the order id), the recipient's name and address, the date, the card and the
 * amount, from the orders' own snapshots (the draft's copies were cleared at placement). Without a
 * cookie, for an expired one, or for a basket with no purchase, the answer is `gone`, which the
 * page draws as "This confirmation is no longer available" with no order data and status 200.
 *
 * The state is picked from the **orders' `mode`**, never from `checkoutMode()` (AC-46): the page
 * draws the renderer registered for that mode and fails closed to `gone` when none is.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { ADDONS } from "@/config/catalogue/addons.data";
import { type CountryIso2 } from "@/config/countries";
import {
  type IntegerMoney,
  IntegerMoneySchema,
  getProduct,
  listTiers,
} from "@/modules/catalog";
import { orderReference } from "@/modules/orders";

import { type DraftConnection, loadDraft, withDraftConnection } from "./draft";

/** One delivery of a placed purchase, as the confirmation recaps it. */
export interface ConfirmedDelivery {
  readonly reference: string;
  /** The bouquet's SKU (its photo); `null` when the line has no product. */
  readonly sku: string | null;
  readonly productName: string;
  readonly tier: {
    readonly labelKey: string;
    readonly stems: number | null;
  } | null;
  readonly countryIso: CountryIso2;
  readonly recipientName: string;
  readonly address: string;
  readonly city: string;
  readonly deliveryDate: string;
  readonly card: {
    readonly message: string;
    readonly signature: string;
  } | null;
  /** The add-ons' name keys, in the catalogue's order. */
  readonly addonNameKeys: readonly string[];
  readonly amount: IntegerMoney;
}

export type Confirmation =
  | { readonly kind: "gone" }
  | {
      readonly kind: "placed";
      readonly mode: "demo" | "test" | "live";
      readonly total: IntegerMoney;
      readonly deliveries: readonly ConfirmedDelivery[];
    };

const AddonRow = z.object({ order_id: z.uuid(), key: z.string() });

const OrderRow = z.object({
  id: z.uuid(),
  mode: z.enum(["demo", "test", "live"]),
  iso2: z.string().regex(/^[A-Z]{2}$/u),
  delivery_date: z.iso.date(),
  buyer_total_minor: z.coerce.number().int().nonnegative(),
  buyer_currency_code: z.string().regex(/^[A-Z]{3}$/u),
  recipient_snapshot: z.looseObject({
    fullName: z.string(),
    addressLines: z.array(z.string()),
    postcode: z.string().optional(),
    city: z.string(),
    cardMessage: z.string().optional(),
    signAs: z.string().optional(),
  }),
  sku: z.string().nullable(),
  tier_key: z.string().nullable(),
});

/**
 * The name keys of the add-ons an order carries, in the catalogue's order. The free printed card
 * (`stationery`) is part of every bouquet, not an add-on the buyer chose, so it is never listed
 * (the confirmation and step 3 boards).
 */
export function chosenAddonNameKeys(keys: ReadonlySet<string>): string[] {
  return ADDONS.filter(
    (addon) => addon.kind !== "stationery" && keys.has(addon.key),
  ).map((addon) => addon.nameKey);
}

/** The confirmation the cookie leads to (the file header). */
export async function confirmationFor(
  token: string | null,
  now: Date = new Date(),
  connection?: DraftConnection,
): Promise<Confirmation> {
  const lookup = await loadDraft(token, now, connection);
  if (lookup.status !== "active" || lookup.draft.purchaseId === null) {
    return { kind: "gone" };
  }
  const purchaseId = lookup.draft.purchaseId;
  const rows = await withDraftConnection(connection, (executor) =>
    executor.execute(sql`
      SELECT o.id, o.mode, c.iso2, o.delivery_date::text AS delivery_date,
             o.buyer_total_minor::text AS buyer_total_minor, o.buyer_currency_code,
             o.recipient_snapshot, p.sku, ol.tier_key
        FROM "order" o
        JOIN country c ON c.id = o.destination_country_id
        JOIN checkout_draft_line l ON l.order_id = o.id
        LEFT JOIN order_line ol ON ol.order_id = o.id AND ol.kind = 'product'
        LEFT JOIN product p ON p.id = ol.product_id
       WHERE o.purchase_id = ${purchaseId}
       ORDER BY l.position`),
  );
  const orders = rows.map((row) => OrderRow.parse(row));
  const addonRows = await withDraftConnection(connection, (executor) =>
    executor.execute(sql`
      SELECT ol.order_id, a.key
        FROM order_line ol
        JOIN addon a ON a.id = ol.addon_id
        JOIN "order" o ON o.id = ol.order_id
       WHERE o.purchase_id = ${purchaseId} AND ol.kind = 'addon'`),
  );
  const addonKeysByOrder = new Map<string, Set<string>>();
  for (const row of addonRows.map((raw) => AddonRow.parse(raw))) {
    const keys = addonKeysByOrder.get(row.order_id) ?? new Set<string>();
    keys.add(row.key);
    addonKeysByOrder.set(row.order_id, keys);
  }
  const first = orders[0];
  if (first === undefined) return { kind: "gone" };
  const deliveries: ConfirmedDelivery[] = [];
  let total = 0;
  for (const order of orders) {
    const product =
      order.sku === null ? null : await getProduct(order.sku).catch(() => null);
    const tiers =
      order.sku === null ? [] : await listTiers(order.sku).catch(() => []);
    const tier = tiers.find(
      (candidate) => candidate.tierKey === order.tier_key,
    );
    const snapshot = order.recipient_snapshot;
    total += order.buyer_total_minor;
    deliveries.push({
      reference: orderReference(order.id),
      sku: order.sku,
      productName: product?.name ?? order.sku ?? "",
      tier:
        tier === undefined
          ? null
          : { labelKey: tier.labelKey, stems: tier.stems },
      countryIso: order.iso2 as CountryIso2,
      recipientName: snapshot.fullName,
      address: [
        ...snapshot.addressLines,
        [snapshot.postcode, snapshot.city].filter(Boolean).join(" "),
      ].join(", "),
      city: snapshot.city,
      deliveryDate: order.delivery_date,
      card:
        snapshot.cardMessage === undefined
          ? null
          : { message: snapshot.cardMessage, signature: snapshot.signAs ?? "" },
      addonNameKeys: chosenAddonNameKeys(
        addonKeysByOrder.get(order.id) ?? new Set<string>(),
      ),
      amount: IntegerMoneySchema.parse({
        amountMinor: order.buyer_total_minor,
        currency: order.buyer_currency_code,
      }),
    });
  }
  return {
    kind: "placed",
    mode: first.mode,
    total: IntegerMoneySchema.parse({
      amountMinor: total,
      currency: first.buyer_currency_code,
    }),
    deliveries,
  };
}
