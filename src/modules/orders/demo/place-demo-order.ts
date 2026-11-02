/**
 * `placeDemoOrder` — a test order for a demo florist (spec 011 §2 "The demo", §5.2; AC-33;
 * TASK-214).
 *
 * A **thin wrapper over spec 010's engine**, refusing in `production`:
 *
 *   1. read the florist (it must be a `demo` partner) and the product it is mapped for (the
 *      input's product and tier, or its first `can_fulfil` mapping by SKU);
 *   2. price the bouquet through spec 005's price provider (`priceProjection`), in the
 *      destination's own currency, so the buyer total equals the provider's price in integer
 *      minor units and no conversion is involved; the VAT split is `vatBreakdown`'s;
 *   3. the people are the shared samples (`src/config/checkout-samples.ts`, the destination's
 *      plainly fictional row; the card message and note are `floristsConfig.example`'s), written
 *      through spec 010's customer and recipient writers: no real person;
 *   4. `orderService.place` with `mode = 'demo'` and the product line carrying the seed payout
 *      (`partner_catalog_mapping`), then `order.authorised` by `system:demo_guard` (as the demo
 *      checkout's payment step does) and `orderService.demoRoute(orderId, { partnerId })`, which
 *      routes it and opens the 60-minute offer to this florist.
 *
 * It writes no order, event or assignment row itself (AC-33's source scan): every such row comes
 * from the engine, in one transaction. Nothing personal is logged: the line names ids only.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { checkoutSample } from "@/config/checkout-samples";
import type { CountryIso2 } from "@/config/countries";
import { floristsConfig } from "@/config/florists";
import { appEnvironment } from "@/lib/env.schema";
import { logger } from "@/lib/logger";
import { defaultTier, priceProjection, vatBreakdown } from "@/modules/catalog";
import { createRecipient, upsertGuestCustomer } from "@/modules/customers";
import { addDays, zonedDate } from "@/modules/geo";

import { ActorSchema, DEMO_GUARD_ACTOR } from "../service/actor";
import { demoRoute } from "../service/demo-router";
import { withExecutor, type OrderExecutor } from "../service/executor";
import { place } from "../service/place";
import { transition } from "../service/transition";

export const DemoOrderInputSchema = z
  .object({
    partnerId: z.uuid(),
    productId: z.string().min(1).max(40).optional(),
    tier: z
      .string()
      .regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/u)
      .optional(),
    deliveryDate: z.iso.date().optional(),
  })
  .strict();
export type DemoOrderInput = z.input<typeof DemoOrderInputSchema>;

/** `order.placed`'s actor for a test order: the demo itself, never a buyer. */
export const DEMO_ACTOR = ActorSchema.parse("system:demo");

export const DEMO_ORDER_REFUSALS = [
  "production",
  "partner_not_demo",
  "no_mapping",
  "no_sample",
] as const;
export type DemoOrderRefusal = (typeof DEMO_ORDER_REFUSALS)[number];

/** Why no test order was placed; nothing was written. */
export class DemoOrderRefused extends Error {
  readonly code: DemoOrderRefusal;
  constructor(code: DemoOrderRefusal) {
    super(`placeDemoOrder refused: ${code}`);
    this.name = "DemoOrderRefused";
    this.code = code;
  }
}

/** The engine calls `placeDemoOrder` makes; tests pass spies that call through. */
export interface DemoEngine {
  readonly place: typeof place;
  readonly transition: typeof transition;
  readonly demoRoute: typeof demoRoute;
}

export interface PlaceDemoOrderOptions {
  /** The caller's transaction (system context); without it one is opened. */
  readonly executor?: OrderExecutor;
  /** `APP_ENV`; read from the process when absent. */
  readonly environment?: string;
  readonly now?: Date;
  readonly engine?: DemoEngine;
}

export interface DemoOrderResult {
  readonly orderId: string;
  readonly assignmentId: string;
}

const PartnerRow = z.object({
  status: z.string(),
  country_id: z.uuid(),
  iso2: z.string().regex(/^[A-Z]{2}$/u),
  iana_zone: z.string().min(1),
});

const MappingRow = z.object({
  product_id: z.uuid(),
  sku: z.string().min(1),
  tier_key: z.string().nullable(),
  partner_payout_minor: z.coerce.number().int().nonnegative(),
  currency_code: z.string().regex(/^[A-Z]{3}$/u),
});

/** `+48 22 000 00 00` → `+48220000000`: the samples are typed with spaces. */
function e164(phone: string): string {
  return phone.replaceAll(/[^\d+]/gu, "");
}

function nonEmpty(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === "" ? undefined : value;
}

/** Whether `environment` refuses every demo entry point (§2: "Refuses in `production`"). */
export function demoRefusedIn(environment: string): boolean {
  return environment === "production";
}

async function placeWith(
  executor: OrderExecutor,
  input: z.output<typeof DemoOrderInputSchema>,
  now: Date,
  engine: DemoEngine,
): Promise<DemoOrderResult> {
  const [partnerRow] = await executor.execute(sql`
    SELECT p.status, p.country_id, c.iso2, c.iana_zone
    FROM fulfillment_partner p JOIN country c ON c.id = p.country_id
    WHERE p.id = ${input.partnerId}`);
  if (partnerRow === undefined) throw new DemoOrderRefused("partner_not_demo");
  const partner = PartnerRow.parse(partnerRow);
  if (partner.status !== "demo") throw new DemoOrderRefused("partner_not_demo");

  const [mappingRow] = await executor.execute(sql`
    SELECT m.product_id, pr.sku, m.tier_key, m.partner_payout_minor, m.currency_code
    FROM partner_catalog_mapping m JOIN product pr ON pr.id = m.product_id
    WHERE m.partner_id = ${input.partnerId} AND m.can_fulfil
      AND (${input.productId ?? null}::text IS NULL OR pr.sku = ${input.productId ?? null})
      AND (${input.tier ?? null}::text IS NULL OR m.tier_key = ${input.tier ?? null}
           OR m.tier_key IS NULL)
    ORDER BY pr.sku, (m.tier_key IS NULL), m.tier_key
    LIMIT 1`);
  if (mappingRow === undefined) throw new DemoOrderRefused("no_mapping");
  const mapping = MappingRow.parse(mappingRow);

  const sample = checkoutSample(partner.iso2);
  if (sample === undefined) throw new DemoOrderRefused("no_sample");

  const tierKey =
    input.tier ?? mapping.tier_key ?? (await defaultTier(mapping.sku)).tierKey;
  const deliveryDate =
    input.deliveryDate ?? addDays(zonedDate(now, partner.iana_zone), 1);
  const countryIso = partner.iso2 as CountryIso2;

  // Spec 005's price, in the destination's own currency: price shown = price charged.
  const projection = await priceProjection("en", {
    productId: mapping.sku,
    tierKey,
    countryIso,
    deliveryDate,
    now,
  });
  const price = projection.destinationCurrencyPrice;
  const vat = vatBreakdown([
    {
      rateBp: projection.vatRateBp,
      grossMinor: price.amountMinor,
      currency: price.currency,
    },
  ]);

  const fields = sample.recipient.fields;
  const street = [fields.street, fields.houseNumber]
    .filter((part): part is string => nonEmpty(part) !== undefined)
    .join(" ");
  const lines = [street, fields.addressLine1, fields.addressLine2]
    .filter((line): line is string => nonEmpty(line) !== undefined)
    .slice(0, 4);
  const city = fields.city ?? "";
  const postcode = nonEmpty(fields.postcode);
  const fullName = fields.fullName ?? "";
  const phoneE164 = e164(fields.phone ?? "");
  const buyerPhone = nonEmpty(sample.buyer.buyerPhone);
  const deliveryNote =
    nonEmpty(sample.recipient.deliveryNote) ??
    floristsConfig.example.deliveryNote;

  const { customerId } = await upsertGuestCustomer(executor, {
    email: sample.buyer.email,
    name: sample.buyer.buyerName,
    ...(buyerPhone === undefined ? {} : { phoneE164: e164(buyerPhone) }),
    countryIso2: sample.buyer.residenceCountry,
  });
  const { recipientId } = await createRecipient(executor, {
    customerId,
    fullName,
    phoneE164,
    address: {
      lines,
      ...(postcode === undefined ? {} : { postalCode: postcode }),
      city,
      countryId: partner.country_id,
      deliveryNote,
      placeKind: sample.recipient.placeKind,
    },
  });

  const { orderId } = await engine.place(
    {
      mode: "demo",
      localeCode: "en",
      customerId,
      recipientId,
      destinationCountryId: partner.country_id,
      ...(postcode === undefined ? {} : { destinationPostcode: postcode }),
      deliveryDate,
      buyerCurrency: price.currency,
      buyerTotalMinor: price.amountMinor,
      baseCurrency: price.currency,
      baseTotalMinor: price.amountMinor,
      vatBreakdown: vat.map((split) => ({
        rateBp: split.rateBp,
        netMinor: split.netMinor,
        vatMinor: split.vatMinor,
        grossMinor: split.grossMinor,
      })),
      buyerSnapshot: {
        name: sample.buyer.buyerName,
        email: sample.buyer.email,
        ...(buyerPhone === undefined ? {} : { phoneE164: e164(buyerPhone) }),
        countryIso2: sample.buyer.residenceCountry,
      },
      recipientSnapshot: {
        fullName,
        phoneE164,
        addressLines: lines,
        ...(postcode === undefined ? {} : { postcode }),
        city,
        placeKind: sample.recipient.placeKind,
        deliveryNote,
        cardMessage: floristsConfig.example.cardMessage,
      },
      lines: [
        {
          kind: "product",
          productId: mapping.product_id,
          tierKey,
          qty: 1,
          unitRetailMinor: price.amountMinor,
          vatRateBp: projection.vatRateBp,
          partnerPayoutMinor: mapping.partner_payout_minor,
          payoutCurrency: mapping.currency_code,
        },
      ],
      actor: DEMO_ACTOR,
    },
    { executor },
  );
  await engine.transition(
    orderId,
    "order.authorised",
    DEMO_GUARD_ACTOR,
    { mode: "demo" },
    { executor },
  );
  const routed = await engine.demoRoute(orderId, {
    executor,
    partnerId: input.partnerId,
  });
  logger.info(
    { order_id: orderId, assignment_id: routed.assignmentId },
    "florists.demo_order_placed",
  );
  return { orderId, assignmentId: routed.assignmentId };
}

/** `placeDemoOrder(DemoOrderInputSchema)` (§5.2): one test order to a demo florist. */
export async function placeDemoOrder(
  raw: DemoOrderInput,
  options: PlaceDemoOrderOptions = {},
): Promise<DemoOrderResult> {
  const environment = options.environment ?? appEnvironment(process.env);
  if (demoRefusedIn(environment)) throw new DemoOrderRefused("production");
  const input = DemoOrderInputSchema.parse(raw);
  const engine = options.engine ?? { place, transition, demoRoute };
  const now = options.now ?? new Date();
  return withExecutor(
    options.executor === undefined ? undefined : { executor: options.executor },
    "orders.place_demo_order",
    (executor) => placeWith(executor, input, now, engine),
  );
}
