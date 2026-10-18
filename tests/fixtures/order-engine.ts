/**
 * Shared fixtures for the order engine's suites (spec 010 §10 T-20, T-22 … T-25, T-41 … T-44;
 * TASK-202).
 *
 *  - `placeInput()` — a valid `PlaceOrderInput` for a demo order to Poland. Every personal value is
 *    obviously fake (reserved fiction phone ranges, `example.test` addresses): no real person.
 *  - `registerFixtureEventSchemas()` — spec 010 registers the schemas of the four events it emits;
 *    specs 011 and 015 register the rest. T-22 and T-44 drive every row of `order_transition`, so
 *    they register a `{ mode }` schema for each event nobody has registered yet, in the test
 *    process only.
 *  - `ACTOR_OF` — one actor string per class, for the data-driven actor matrix of T-44.
 */
import { z } from "zod";

import {
  eventSchema,
  ORDER_EVENT_TYPES,
  OrderModeSchema,
  registerEventSchema,
  type PlaceOrderInput,
} from "@/modules/orders";

export const FIXTURE_PARTNER_ACTOR_ID = "6f1c2a40-3b7e-4c1d-9a55-0d2e4f6a8b10";
export const FIXTURE_ADMIN_ACTOR_ID = "0b8e7d6c-5a4f-4e3d-8c2b-1a0f9e8d7c6b";

/** One actor per `allowed_actors` class. */
export const ACTOR_OF = {
  buyer: "buyer",
  partner: `partner:${FIXTURE_PARTNER_ACTOR_ID}`,
  admin: `admin:${FIXTURE_ADMIN_ACTOR_ID}`,
  system: "system:test_engine",
} as const;

/** Registers a strict `{ mode }` v1 schema for every catalogue event that has none yet. */
export function registerFixtureEventSchemas(): void {
  for (const type of ORDER_EVENT_TYPES) {
    if (eventSchema(type) === undefined) {
      registerEventSchema(
        type,
        1,
        z.object({ mode: OrderModeSchema }).strict(),
      );
    }
  }
}

/** The payload each event needs under the registry (the four real schemas, else `{ mode }`). */
export function payloadFor(
  event: string,
  mode: "demo" | "test" | "live",
  partnerId = FIXTURE_PARTNER_ACTOR_ID,
): Record<string, unknown> {
  if (event === "order.routed") return { mode, partnerId };
  return { mode };
}

export interface PlaceParents {
  readonly countryId: string;
  readonly customerId: string;
  readonly recipientId: string;
  readonly productId: string;
  readonly cityId?: string;
}

/** A valid demo order to Poland: one product line and one surcharge, 18 900 + 1 000 PLN minor. */
export function placeInput(
  parents: PlaceParents,
  overrides: Partial<PlaceOrderInput> = {},
): PlaceOrderInput {
  return {
    mode: "demo",
    customerId: parents.customerId,
    recipientId: parents.recipientId,
    destinationCountryId: parents.countryId,
    ...(parents.cityId === undefined
      ? {}
      : { destinationCityId: parents.cityId }),
    destinationPostcode: "00-950",
    deliveryDate: "2027-02-14",
    buyerCurrency: "PLN",
    buyerTotalMinor: 19_900,
    baseCurrency: "PLN",
    baseTotalMinor: 19_900,
    vatBreakdown: [
      { rateBp: 800, netMinor: 18_426, vatMinor: 1_474, grossMinor: 19_900 },
    ],
    buyerSnapshot: {
      name: "Test Buyer",
      email: "buyer@example.test",
      countryIso2: "GB",
    },
    recipientSnapshot: {
      fullName: "Test Recipient",
      phoneE164: "+48500000000",
      addressLines: ["ul. Testowa 1"],
      postcode: "00-950",
      city: "Warszawa",
      placeKind: "home",
      cardMessage: "Fixture card text",
    },
    lines: [
      {
        kind: "product",
        productId: parents.productId,
        tierKey: "classic",
        qty: 1,
        unitRetailMinor: 18_900,
        vatRateBp: 800,
      },
      { kind: "surcharge", qty: 1, unitRetailMinor: 1_000, vatRateBp: 800 },
    ],
    ...overrides,
  };
}

/** The keys a list item may carry, and no other (AC-25: no contact field). */
export const ORDER_LIST_ITEM_KEYS = [
  "cityName",
  "deliveryDate",
  "mode",
  "orderId",
  "placedAt",
  "productName",
  "reference",
  "tierKey",
  "buyerStatus",
].sort();

/** Substrings no list-item key may contain (AC-25). */
export const CONTACT_KEY_FRAGMENTS = [
  "phone",
  "email",
  "street",
  "address",
  "card",
  "postcode",
  "postal",
  "recipient",
  "buyer_",
  "message",
  "fullname",
] as const;
