/**
 * The one GA4 item builder (spec 023 §5.2 "Items", AC-16; TASK-491), used by the page payloads
 * (TASK-492, `ga4ItemFromProjection`) and by the Measurement Protocol `purchase`
 * (`ga4ItemsFromOrderLines`), so one product at one tier looks the same in both.
 *
 * | param                      | product line          | add-on line   | surcharge line          |
 * |----------------------------|-----------------------|---------------|-------------------------|
 * | `item_id`                  | `product.sku`         | `addon.key`   | `surcharge`             |
 * | `item_name`                | the `en` catalogue name | the add-on's `en` name | `delivery surcharge` |
 * | `item_category`            | primary `category.key` | `addon`      | `delivery`              |
 * | `item_variant`             | the tier key          | none          | the surcharge kind key  |
 * | `price`, `quantity`        | unit gross price (VAT and delivery included), quantity            |
 * | `item_destination_country` | ISO 3166-1 alpha-2, upper case                                    |
 *
 * No item carries a florist, a partner, a city, a postcode, a date or a message: the schema is
 * strict and has no field for any of them.
 */
import { z } from "zod";

import type { Money } from "@/modules/i18n";

import { toGa4Value } from "./money";

/** The surcharge line's constant name and id (not copy: GA4 reports are English, §5.2). */
export const SURCHARGE_ITEM_ID = "surcharge";
export const SURCHARGE_ITEM_NAME = "delivery surcharge";
export const SURCHARGE_ITEM_CATEGORY = "delivery";
export const ADDON_ITEM_CATEGORY = "addon";

/** At most this many items in one list event (§5.2 `view_item_list`). */
export const GA4_MAX_LIST_ITEMS = 48;

const KeySchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/u);

export const Ga4ItemSchema = z.strictObject({
  item_id: KeySchema,
  item_name: z.string().min(1).max(100),
  item_category: KeySchema,
  item_variant: KeySchema.optional(),
  price: z.number().nonnegative().finite(),
  quantity: z.number().int().positive(),
  item_destination_country: z.string().regex(/^[A-Z]{2}$/u),
  index: z.number().int().nonnegative().optional(),
  item_list_id: z.string().min(1).max(100).optional(),
  item_list_name: z.string().min(1).max(100).optional(),
});

export type Ga4Item = z.infer<typeof Ga4ItemSchema>;

/** What a product at a tier contributes, as the page's price projection shows it. */
export interface Ga4ProductProjection {
  readonly sku: string;
  /** The product's `en` catalogue name. */
  readonly enName: string;
  /** The product's primary `category.key`. */
  readonly categoryKey: string;
  readonly tierKey: string | null;
  /** The unit gross price on screen (VAT and delivery included). */
  readonly price: Money;
  readonly quantity?: number;
  readonly destinationCountry: string;
}

interface ItemParts {
  readonly itemId: string;
  readonly itemName: string;
  readonly itemCategory: string;
  readonly itemVariant: string | null;
  readonly price: Money;
  readonly quantity: number;
  readonly destinationCountry: string;
}

function buildItem(parts: ItemParts): Ga4Item {
  return Ga4ItemSchema.parse({
    item_id: parts.itemId,
    item_name: parts.itemName,
    item_category: parts.itemCategory,
    ...(parts.itemVariant === null ? {} : { item_variant: parts.itemVariant }),
    price: toGa4Value(parts.price),
    quantity: parts.quantity,
    item_destination_country: parts.destinationCountry.toUpperCase(),
  });
}

/** The client payload's item for a product at a tier (TASK-492 calls it from the view models). */
export function ga4ItemFromProjection(
  projection: Ga4ProductProjection,
): Ga4Item {
  return buildItem({
    itemId: projection.sku,
    itemName: projection.enName,
    itemCategory: projection.categoryKey,
    itemVariant: projection.tierKey,
    price: projection.price,
    quantity: projection.quantity ?? 1,
    destinationCountry: projection.destinationCountry,
  });
}

/** One order line as the server reads it for the `purchase` body. */
export type Ga4OrderLine =
  | {
      readonly kind: "product";
      readonly sku: string;
      readonly enName: string;
      readonly categoryKey: string;
      readonly tierKey: string | null;
      readonly unitPrice: Money;
      readonly quantity: number;
    }
  | {
      readonly kind: "addon";
      readonly addonKey: string;
      readonly enName: string;
      readonly unitPrice: Money;
      readonly quantity: number;
    }
  | {
      readonly kind: "surcharge";
      readonly surchargeKind: string | null;
      readonly unitPrice: Money;
      readonly quantity: number;
    };

/** The `purchase` items for an order's lines, in line order. */
export function ga4ItemsFromOrderLines(
  lines: readonly Ga4OrderLine[],
  destinationCountry: string,
): Ga4Item[] {
  return lines.map((line) => {
    switch (line.kind) {
      case "product":
        return ga4ItemFromProjection({
          sku: line.sku,
          enName: line.enName,
          categoryKey: line.categoryKey,
          tierKey: line.tierKey,
          price: line.unitPrice,
          quantity: line.quantity,
          destinationCountry,
        });
      case "addon":
        return buildItem({
          itemId: line.addonKey,
          itemName: line.enName,
          itemCategory: ADDON_ITEM_CATEGORY,
          itemVariant: null,
          price: line.unitPrice,
          quantity: line.quantity,
          destinationCountry,
        });
      case "surcharge":
        return buildItem({
          itemId: SURCHARGE_ITEM_ID,
          itemName: SURCHARGE_ITEM_NAME,
          itemCategory: SURCHARGE_ITEM_CATEGORY,
          itemVariant: line.surchargeKind,
          price: line.unitPrice,
          quantity: line.quantity,
          destinationCountry,
        });
    }
  });
}
