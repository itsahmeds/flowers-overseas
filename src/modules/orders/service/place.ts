/**
 * `orderService.place` — the only writer of `"order"` rows (ADR-0009; spec 010 §2, §5.2;
 * §14 A1.3, A2.3, A3.1; AC-20, AC-42, AC-45, AC-47; TASK-202, TASK-245).
 *
 * In the caller's transaction (or one it opens):
 *
 *   1. parse `PlaceOrderInputSchema` and the `order.placed` payload, before anything is read;
 *   2. read the destination country's `supply_model` (the order keeps a snapshot, spec 002 §5.1);
 *   3. `SAVEPOINT`, and nothing written before it (A2.3);
 *   4. `set_config('app.allow_status_write', 'on', true)` — the insert trigger of `0008` needs the
 *      switch and **no event** (A1.3: `order.placed` has no row, an insert has no `from_status`),
 *      so `app.transition_event` is never touched here. It is set after each savepoint, because a
 *      rollback to the savepoint undoes it;
 *   5. without the input's `purchaseId`, one `INSERT INTO purchase` of this order alone (spec 010
 *      §14 A-founder-2026-10-22, `0019`), inside the savepoint so a clash or a refusal undoes it;
 *      then one `INSERT INTO "order"` at status `placed`, with an id `place` draws itself
 *      (`crypto.randomUUID()`, A2.1) and the input's `localeCode` (A3.1: the draft's, never the
 *      column default);
 *   6. reset the switch to `''` straight away — the insert trigger does not clear it, and a switch
 *      left on would let a raw `INSERT INTO "order"` later in the same transaction through
 *      (A1.3; AC-42);
 *   7. if the insert raised a unique violation on **`order_reference_idx`** (`0013`: another order
 *      already has this id's reference), `ROLLBACK TO SAVEPOINT`, log `orders.reference_clash
 *      {attempt}` (no id, no reference: §8) and go back to 3 with a new id, at most
 *      `ORDER_REFERENCE_ATTEMPTS` times in all, then refuse with `ORDER_REFERENCE_UNAVAILABLE`,
 *      nothing written and the transaction usable. Any other error, a unique violation on any
 *      other constraint included, is raised as it came, once;
 *   8. `RELEASE SAVEPOINT`, then the `order_line` rows, then `order.placed` at seq 1 by the given
 *      actor, and an outbox row only when `outboxTargets('order.placed', mode)` is non-empty.
 *
 * `terms_version` is written only for a `live` order (the schema refuses one without it, and
 * refuses one on a demo or test order: no contract is formed there, §5.1 A).
 */
import { randomBytes, randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { z } from "zod";

import { logger } from "@/lib/logger";

import { ActorSchema, BUYER_ACTOR } from "./actor";
import { OrderEngineError } from "./errors";
import { writeEvent } from "./event-writer";
import { OrderModeSchema, OrderPlacedV1 } from "./events";
import { jsonb, withExecutor, type OrderExecutor } from "./executor";
import type { OutboxTargetResolver } from "./outbox";
import { withSwitch } from "./switch";
import type { EngineOptions } from "./transition";

/** A2.3: the attempts `place` makes before it refuses with `ORDER_REFERENCE_UNAVAILABLE`. */
export const ORDER_REFERENCE_ATTEMPTS = 5;

/** `0013`'s unique index on `order_reference(id)`: the one violation `place` retries. */
const ORDER_REFERENCE_INDEX = "order_reference_idx";

/**
 * The fields of the driver's error (postgres.js `PostgresError`) that name a reference clash:
 * SQLSTATE `23505` (unique violation) on `order_reference_idx`, and nothing else.
 */
const ReferenceClashSchema = z.object({
  code: z.literal("23505"),
  constraint_name: z.literal(ORDER_REFERENCE_INDEX),
});

/**
 * True when `error`, or an error it wraps as `cause` (Drizzle's `DrizzleQueryError` carries the
 * driver's error there), is a unique violation of `order_reference_idx`.
 */
function isReferenceClash(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof current !== "object" || current === null) return false;
    if (ReferenceClashSchema.safeParse(current).success) return true;
    current = (current as { readonly cause?: unknown }).cause;
  }
  return false;
}

/** The savepoint each attempt runs in; one name, released or rolled back every time. */
const SAVEPOINT = "order_place_attempt";

const CurrencyCode = z.string().regex(/^[A-Z]{3}$/);

/** Parts per million: `fx_rate_ppm`'s unit (spec 002 §5.1; `modules/catalog` `pricing/fx.ts`). */
const PPM = 1_000_000;

/**
 * Spec 005's buyer price is the base price converted at `fxRatePpm`, plus the FX buffer, then
 * rounded to the currency's charm ending, so it is never the bare conversion. The check is
 * therefore a band, in integer arithmetic only: the buyer total lies within 10 % of
 * `baseTotalMinor × fxRatePpm / 1 000 000`. Wide enough for the buffer and the rounding, narrow
 * enough that a wrong rate or a wrong base total (`1` at `1` ppm) is refused.
 */
function withinFxTolerance(
  baseTotalMinor: number,
  fxRatePpm: number,
  buyerTotalMinor: number,
): boolean {
  const converted = BigInt(baseTotalMinor) * BigInt(fxRatePpm);
  const buyerScaled = BigInt(buyerTotalMinor) * BigInt(PPM);
  const difference =
    converted > buyerScaled ? converted - buyerScaled : buyerScaled - converted;
  return difference * 10n <= buyerScaled;
}
const Minor = z.number().int().nonnegative();
const Positive = z.number().int().positive();

/** One rate's integer split (spec 005's `vatBreakdown()` output; `netMinor + vatMinor = gross`). */
export const VatSplitSchema = z
  .object({
    rateBp: z.number().int().min(0).max(10_000),
    netMinor: Minor,
    vatMinor: Minor,
    grossMinor: Minor,
  })
  .strict()
  .refine((split) => split.netMinor + split.vatMinor === split.grossMinor, {
    error: "netMinor + vatMinor must equal grossMinor",
    path: ["grossMinor"],
  });

export const OrderLineInputSchema = z
  .object({
    kind: z.enum(["product", "addon", "surcharge"]),
    productId: z.uuid().optional(),
    addonId: z.uuid().optional(),
    tierKey: z.string().min(1).optional(),
    qty: Positive,
    unitRetailMinor: Minor,
    vatRateBp: z.number().int().min(0).max(10_000),
    partnerPayoutMinor: Minor.optional(),
    payoutCurrency: CurrencyCode.optional(),
  })
  .strict()
  .refine(
    (line) =>
      line.kind === "product"
        ? line.productId !== undefined && line.addonId === undefined
        : line.kind === "addon"
          ? line.addonId !== undefined && line.productId === undefined
          : line.productId === undefined && line.addonId === undefined,
    { error: "a line names exactly the subject its kind requires" },
  )
  .refine(
    (line) =>
      (line.partnerPayoutMinor === undefined) ===
      (line.payoutCurrency === undefined),
    { error: "a payout amount and its currency come together" },
  );

/** What the buyer typed, kept on the order (§5.1 A `buyer_snapshot`). Never logged. */
export const BuyerSnapshotSchema = z
  .object({
    name: z.string().min(1).max(200),
    email: z.email(),
    phoneE164: z
      .string()
      .regex(/^\+[1-9][0-9]{1,14}$/)
      .optional(),
    countryIso2: z.string().regex(/^[A-Z]{2}$/),
  })
  .strict();

/** The recipient at order time (`plan/11` §3 `recipient_snapshot`). Never logged. */
export const RecipientSnapshotSchema = z
  .object({
    fullName: z.string().min(1).max(200),
    phoneE164: z.string().regex(/^\+[1-9][0-9]{1,14}$/),
    addressLines: z.array(z.string().min(1).max(200)).min(1).max(4),
    postcode: z.string().max(16).optional(),
    city: z.string().min(1).max(120),
    placeKind: z.enum([
      "home",
      "work",
      "hospital",
      "funeral_home",
      "hotel",
      "cemetery",
      "church",
    ]),
    deliveryNote: z.string().max(400).optional(),
    cardMessage: z.string().max(800).optional(),
    signAs: z.string().max(160).optional(),
  })
  .strict();

export const PlaceOrderInputSchema = z
  .object({
    mode: OrderModeSchema,
    /**
     * The checkout draft's `locale_code` (A3.1): the language buyer emails are written in. A
     * `locale.code`; one that is not raises the foreign-key error at the insert.
     */
    localeCode: z.string().regex(/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/),
    customerId: z.uuid(),
    recipientId: z.uuid(),
    destinationCountryId: z.uuid(),
    destinationCityId: z.uuid().optional(),
    destinationPostcode: z.string().min(1).max(16).optional(),
    deliveryDate: z.iso.date(),
    deliveryWindow: z.string().min(1).max(40).optional(),
    buyerCurrency: CurrencyCode,
    buyerTotalMinor: Positive,
    fxRatePpm: Positive.optional(),
    baseCurrency: CurrencyCode,
    baseTotalMinor: Positive,
    vatBreakdown: z.array(VatSplitSchema).min(1),
    termsVersion: z.string().min(1).max(40).optional(),
    buyerSnapshot: BuyerSnapshotSchema,
    recipientSnapshot: RecipientSnapshotSchema,
    lines: z.array(OrderLineInputSchema).min(1),
    /** `order.placed`'s actor: `buyer` from the checkout; spec 011's demo control may differ. */
    actor: ActorSchema.default(BUYER_ACTOR),
    /**
     * Spec 010 §14 A-founder-2026-10-22 item 3: the purchase this order belongs to, written by
     * `placePurchase` (`0019`'s composite key holds its currency and mode equal to the order's;
     * its deferred `purchase_total_check` holds the sum at commit). Absent, `place` writes a
     * purchase of this one order itself, inside the attempt's savepoint, so a lone order (spec
     * 011's demo control) is still a purchase of one and a refusal still writes nothing.
     */
    purchaseId: z.uuid().optional(),
  })
  .strict()
  .refine(
    (input) => (input.mode === "live") === (input.termsVersion !== undefined),
    {
      error:
        "terms_version is written for a live order only, and always for one",
      path: ["termsVersion"],
    },
  )
  .refine(
    (input) =>
      input.buyerCurrency === input.baseCurrency
        ? input.baseTotalMinor === input.buyerTotalMinor &&
          (input.fxRatePpm === undefined || input.fxRatePpm === PPM)
        : input.fxRatePpm !== undefined &&
          withinFxTolerance(
            input.baseTotalMinor,
            input.fxRatePpm,
            input.buyerTotalMinor,
          ),
    {
      error:
        "one currency: base total = buyer total and no rate; two: the rate reproduces the buyer total from the base total",
      path: ["fxRatePpm"],
    },
  )
  .refine(
    (input) =>
      input.vatBreakdown.reduce((sum, split) => sum + split.grossMinor, 0) ===
      input.buyerTotalMinor,
    {
      error: "the VAT breakdown's gross amounts add up to the buyer total",
      path: ["vatBreakdown"],
    },
  )
  .refine(
    (input) =>
      input.lines.reduce(
        (sum, line) => sum + line.unitRetailMinor * line.qty,
        0,
      ) === input.buyerTotalMinor,
    {
      error:
        "the lines add up to the buyer total (price shown = price charged)",
      path: ["buyerTotalMinor"],
    },
  );

export type PlaceOrderInput = z.input<typeof PlaceOrderInputSchema>;

export interface PlaceResult {
  readonly orderId: string;
}

export interface PlaceOptions extends EngineOptions {
  /** Replaces `crypto.randomUUID()` as the id generator (tests: a forced reference clash). */
  readonly newId?: () => string;
}

const CountryRow = z.object({
  supply_model: z.enum(["principal", "agent"]).nullable(),
});
const IdRow = z.object({ id: z.uuid() });

/** 128 random bits as base64url: 22 characters, `0007`'s `public_token` pattern. */
function publicToken(): string {
  return randomBytes(16).toString("base64url");
}

/** The purchase of a lone order: its mode, currency, total, locale and customer (`0019`). */
async function insertOwnPurchase(
  executor: OrderExecutor,
  input: z.output<typeof PlaceOrderInputSchema>,
): Promise<string> {
  const [row] = await executor.execute(sql`
    INSERT INTO purchase (mode, buyer_currency_code, total_minor, locale_code, customer_id)
    VALUES (${input.mode}, ${input.buyerCurrency}, ${input.buyerTotalMinor}, ${input.localeCode},
            ${input.customerId})
    RETURNING id`);
  return IdRow.parse(row).id;
}

export async function placeWith(
  executor: OrderExecutor,
  raw: unknown,
  resolver?: OutboxTargetResolver,
  newId: () => string = randomUUID,
): Promise<PlaceResult> {
  const parsedInput = PlaceOrderInputSchema.safeParse(raw);
  if (!parsedInput.success) {
    throw new OrderEngineError("ORDER_INPUT_INVALID", {
      event: "order.placed",
    });
  }
  const input = parsedInput.data;
  const payload = OrderPlacedV1.parse({
    mode: input.mode,
    buyerCurrency: input.buyerCurrency,
    buyerTotalMinor: input.buyerTotalMinor,
    deliveryDate: input.deliveryDate,
    lineCount: input.lines.length,
  });

  const [country] = await executor.execute(sql`
    SELECT supply_model FROM country WHERE id = ${input.destinationCountryId}`);
  if (country === undefined) {
    throw new OrderEngineError("ORDER_INPUT_INVALID", {
      event: "order.placed",
    });
  }
  const supplyModel = CountryRow.parse(country).supply_model;

  let orderId: string | undefined;
  for (let attempt = 1; attempt <= ORDER_REFERENCE_ATTEMPTS; attempt += 1) {
    const candidate = newId();
    await executor.execute(sql.raw(`SAVEPOINT ${SAVEPOINT}`));
    try {
      const purchaseId =
        input.purchaseId ?? (await insertOwnPurchase(executor, input));
      const [inserted] = await withSwitch(executor, () =>
        executor.execute(sql`
        INSERT INTO "order" (id, public_token, mode, customer_id, recipient_id,
                             destination_country_id, destination_city_id, destination_postcode,
                             delivery_date, delivery_window, status, buyer_currency_code,
                             buyer_total_minor, fx_rate_ppm, base_currency_code, base_total_minor,
                             vat_breakdown, supply_model, terms_version, buyer_snapshot,
                             recipient_snapshot, locale_code, purchase_id)
        VALUES (${candidate}, ${publicToken()}, ${input.mode}, ${input.customerId},
                ${input.recipientId}, ${input.destinationCountryId},
                ${input.destinationCityId ?? null}, ${input.destinationPostcode ?? null},
                ${input.deliveryDate}::date, ${input.deliveryWindow ?? null}, 'placed',
                ${input.buyerCurrency}, ${input.buyerTotalMinor}, ${input.fxRatePpm ?? null},
                ${input.baseCurrency}, ${input.baseTotalMinor}, ${jsonb(input.vatBreakdown)},
                ${supplyModel}, ${input.termsVersion ?? null}, ${jsonb(input.buyerSnapshot)},
                ${jsonb(input.recipientSnapshot)}, ${input.localeCode}, ${purchaseId})
        RETURNING id`),
      );
      IdRow.parse(inserted);
    } catch (error) {
      if (!isReferenceClash(error)) throw error;
      await executor.execute(sql.raw(`ROLLBACK TO SAVEPOINT ${SAVEPOINT}`));
      await executor.execute(sql.raw(`RELEASE SAVEPOINT ${SAVEPOINT}`));
      logger.warn({ attempt }, "orders.reference_clash");
      continue;
    }
    await executor.execute(sql.raw(`RELEASE SAVEPOINT ${SAVEPOINT}`));
    orderId = candidate;
    break;
  }
  if (orderId === undefined) {
    throw new OrderEngineError("ORDER_REFERENCE_UNAVAILABLE", {
      event: "order.placed",
    });
  }

  for (const line of input.lines) {
    await executor.execute(sql`
      INSERT INTO order_line (order_id, kind, product_id, addon_id, tier_key, qty,
                              unit_retail_minor, currency_code, partner_payout_minor,
                              payout_currency_code, vat_rate_bp)
      VALUES (${orderId}, ${line.kind}, ${line.productId ?? null}, ${line.addonId ?? null},
              ${line.tierKey ?? null}, ${line.qty}, ${line.unitRetailMinor},
              ${input.buyerCurrency}, ${line.partnerPayoutMinor ?? null},
              ${line.payoutCurrency ?? null}, ${line.vatRateBp})`);
  }

  await writeEvent(
    executor,
    {
      orderId,
      type: "order.placed",
      status: null,
      actor: input.actor,
      mode: input.mode,
      payload,
      payloadVersion: 1,
    },
    resolver,
  );
  return { orderId };
}

/** `orderService.place(input)` (§5.2). */
export async function place(
  input: PlaceOrderInput,
  options: PlaceOptions = {},
): Promise<PlaceResult> {
  return withExecutor(options, "orders.place", (executor) =>
    placeWith(executor, input, options.outboxTargets, options.newId),
  );
}
