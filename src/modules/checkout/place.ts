/**
 * Placing a basket (spec 010 §2 "Placing the order", §5.2 `placeOrderAction`, §8, §11; AC-2,
 * AC-15, AC-16, AC-19 placement half, AC-20 placement half, AC-21, AC-27, AC-28, AC-52; §14
 * A-founder-2026-10-22 items 1 D9 and 4, AC-63 placement half, AC-64, AC-65, AC-67; TASK-205).
 *
 * One transaction, all or nothing, in this order:
 *
 *  1. **the basket by its token, under its row lock** (`loadDraftForUpdate`): none or expired →
 *     `expired`; already placed → the same confirmation, writing nothing (AC-21, AC-65: a double
 *     click, a refresh of the POST and a concurrent call all end on one purchase);
 *  2. **every line re-derived at `now`** (`assessBasket`): a screen not yet saved sends the buyer
 *     there; a line unavailable sends them to the basket, where it is marked (AC-59); a line whose
 *     date can no longer be met reopens **that line's step 1**, which names the reason and the next
 *     date (AC-19, AC-60, AC-64); an open price notice reopens the first line that has one (AC-17,
 *     AC-61); the total the review displayed (posted as `seenTotalMinor`/`seenCurrency`) must be
 *     the total now, so nothing is ever written at an amount the buyer did not see last;
 *  3. **the mode's payment step** (`payment-step.ts`): none registered → `closed`;
 *  4. **the daily demo cap, counted in orders** (`orders today + lines > cap` → `cap`, AC-27,
 *     AC-67), under a transaction-level advisory lock so two placements cannot both pass it;
 *  5. inside a savepoint: the guest customer once, each line's product and add-ons resolved by
 *     their natural keys in the `product` and `addon` tables (no row → `unable`, AC-28), a recipient
 *     per line, `placePurchase` (one purchase, one order per line), the payment step's
 *     authorisation per order (`demo`: `order.authorised` by `system:demo_guard`, no provider, no
 *     `payment` row, AC-2), `demoRoute` per order, then the draft marked placed with the buyer's,
 *     recipients' and cards' details cleared (`markDraftPlaced`). Any refusal or engine error rolls
 *     back to the savepoint: no purchase, order, line, event, assignment or outbox row survives
 *     (AC-28, AC-64).
 *
 * Every amount is the line's signed quote (`lineTotals`), the same integers every step showed;
 * nothing here reads `country_price` or `addon_country_price` (AC-28's source scan) or converts
 * a currency. Logs carry ids, counts, codes and durations only (§8, AC-78).
 */
import { type SQL, sql } from "drizzle-orm";
import { z } from "zod";

import { DEMO_DAILY_ORDER_CAP } from "@/config/checkout";
import type { CurrencyCode } from "@/config/currencies";
import { type LocaleCode, isLocaleCode } from "@/config/locales";
import { logger } from "@/lib/logger";
import { captureWarning } from "@/lib/sentry";
import { createRecipient, upsertGuestCustomer } from "@/modules/customers";
import { MoneySchema } from "@/modules/i18n";
import {
  type OrderExecutor,
  type PlaceOrderInput,
  isOrderEngineError,
  orderService,
} from "@/modules/orders";

import { assessBasket } from "./basket";
import {
  type BasketLine,
  type Draft,
  type DraftConnection,
  loadDraftForUpdate,
  markDraftPlaced,
  withDraftConnection,
} from "./draft";
import type { CheckoutFlagReader } from "./mode";
import { paymentStepFor } from "./payment-step";
import { type DraftTotals, lineTotals } from "./pricing";
import {
  type StepOutcome,
  basketPath,
  firstIncompleteScreen,
  formValues,
  stepPath,
} from "./steps";

/** Why a placement was refused where the buyer stands (step 3). */
export const placementRefusals = ["cap", "unable"] as const;
export type PlacementRefusal = (typeof placementRefusals)[number];

/** What a placement decided. */
export type PlaceOutcome =
  | {
      readonly kind: "placed";
      readonly purchaseId: string;
      readonly orderIds: readonly string[];
      /** True when this call found the basket already placed (AC-21, AC-65). */
      readonly replay: boolean;
    }
  | { readonly kind: "redirect"; readonly location: string }
  | { readonly kind: "expired" }
  | { readonly kind: "closed" }
  | { readonly kind: "refused"; readonly reason: PlacementRefusal };

/** What a placement is handed; production passes the locale, the token and nothing else. */
export interface PlaceContext {
  readonly locale: string;
  readonly token: string | null;
  readonly now?: () => Date;
  readonly connection?: DraftConnection;
  readonly flags?: CheckoutFlagReader;
  /** Replaces `DEMO_DAILY_ORDER_CAP` (tests: T-27, T-67). */
  readonly dailyCap?: number;
}

/** The step 3 form: the total the review displayed. */
export const PlaceOrderFormSchema = z
  .object({
    seenTotalMinor: z
      .string()
      .regex(/^\d{1,15}$/u)
      .transform(Number),
    seenCurrency: MoneySchema.shape.currency,
  })
  .strict();

/** Place-to-routed above this logs a warning (§11). */
export const PLACE_WARN_MS = 2000;

/** One Sentry warning per UTC day when the cap is reached (§11). */
let capReportedOn: string | null = null;

/** A refusal raised inside the savepoint, so everything written is rolled back. */
class PlacementRefused extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "PlacementRefused";
    this.code = code;
  }
}

const IdRow = z.object({ id: z.uuid() });
const CountRow = z.object({ count: z.coerce.number().int().nonnegative() });

async function idOf(
  executor: OrderExecutor,
  query: SQL,
  code: string,
): Promise<string> {
  const [row] = await executor.execute(query);
  if (row === undefined) throw new PlacementRefused(code);
  return IdRow.parse(row).id;
}

/** The UTC calendar day of `now`, as `[start, end)`. */
function utcDay(now: Date): { readonly start: Date; readonly end: Date } {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

/** Demo orders created on `now`'s UTC day (AC-27: the cap counts orders, AC-67). */
async function demoOrdersOn(
  executor: OrderExecutor,
  now: Date,
): Promise<number> {
  const { start, end } = utcDay(now);
  // One placement at a time past this point, so two cannot both see room for their lines.
  await executor.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext('checkout.demo_daily_cap'))`,
  );
  const [row] = await executor.execute(sql`
    SELECT count(*)::int AS count FROM "order"
     WHERE mode = 'demo'
       AND created_at >= ${start.toISOString()}::timestamptz
       AND created_at <  ${end.toISOString()}::timestamptz`);
  return CountRow.parse(row).count;
}

/** The recipient's address lines, in the format's order, blank ones dropped (at most four). */
function addressLines(address: Readonly<Record<string, string>>): string[] {
  const street = [address["street"], address["houseNumber"]]
    .filter((part): part is string => part !== undefined && part !== "")
    .join(" ");
  return [
    street,
    address["addressLine1"],
    address["addressLine2"],
    address["careOf"],
    address["apartment"],
    address["region"],
  ]
    .filter((line): line is string => line !== undefined && line !== "")
    .slice(0, 4);
}

/** Optional text: absent when blank (a blank card message means no card, §2). */
function optional(value: string): string | undefined {
  return value === "" ? undefined : value;
}

/** One line's order, resolved and written inside the savepoint. */
async function orderInput(
  executor: OrderExecutor,
  draft: Draft,
  line: BasketLine,
  totals: DraftTotals,
  customerId: string,
): Promise<Omit<PlaceOrderInput, "purchaseId">> {
  const recipient = line.recipient;
  const card = line.card;
  const buyer = draft.buyer;
  if (
    recipient === null ||
    card === null ||
    buyer === null ||
    line.deliveryDate === null
  ) {
    throw new PlacementRefused("incomplete_line");
  }
  // AC-28: the SKU and every add-on resolve to rows of the seeded tables, or nothing is placed.
  const productId = await idOf(
    executor,
    sql`SELECT id FROM product WHERE sku = ${line.sku}`,
    "product_not_in_database",
  );
  const countryId = await idOf(
    executor,
    sql`SELECT id FROM country WHERE iso2 = ${line.countryIso}`,
    "country_not_in_database",
  );
  const city = recipient.address["city"];
  const lines = addressLines(recipient.address);
  if (city === undefined || city === "" || lines.length === 0) {
    throw new PlacementRefused("incomplete_address");
  }
  const postcode = optional(recipient.address["postcode"] ?? "");
  const deliveryNote = optional(recipient.deliveryNote);
  const created = await createRecipient(executor, {
    customerId,
    fullName: recipient.fullName,
    phoneE164: recipient.phone.e164,
    address: {
      lines,
      ...(postcode === undefined ? {} : { postalCode: postcode }),
      city,
      countryId,
      ...(deliveryNote === undefined ? {} : { deliveryNote }),
      placeKind: recipient.placeKind,
    },
  });
  const orderLines: PlaceOrderInput["lines"] = [];
  for (const entry of totals.lines) {
    if (entry.kind === "product") {
      orderLines.push({
        kind: "product",
        productId,
        tierKey: entry.tierKey,
        qty: 1,
        unitRetailMinor: entry.amount.amountMinor,
        vatRateBp: entry.vatRateBp,
      });
    } else {
      const addonId = await idOf(
        executor,
        sql`SELECT id FROM addon WHERE key = ${entry.addonKey}`,
        "addon_not_in_database",
      );
      orderLines.push({
        kind: "addon",
        addonId,
        qty: 1,
        unitRetailMinor: entry.amount.amountMinor,
        vatRateBp: entry.vatRateBp,
      });
    }
  }
  const cardMessage = optional(card.cardMessage);
  const signAs = optional(card.signAs);
  const converted = totals.base.currency !== totals.total.currency;
  return {
    mode: draft.mode,
    localeCode: draft.locale,
    customerId,
    recipientId: created.recipientId,
    destinationCountryId: countryId,
    ...(postcode === undefined ? {} : { destinationPostcode: postcode }),
    deliveryDate: line.deliveryDate,
    buyerCurrency: totals.total.currency,
    buyerTotalMinor: totals.total.amountMinor,
    ...(converted && totals.ratePpm !== null
      ? { fxRatePpm: totals.ratePpm }
      : {}),
    baseCurrency: totals.base.currency,
    baseTotalMinor: totals.base.amountMinor,
    vatBreakdown: totals.vat.map((split) => ({
      rateBp: split.rateBp,
      netMinor: split.netMinor,
      vatMinor: split.vatMinor,
      grossMinor: split.grossMinor,
    })),
    buyerSnapshot: {
      name: buyer.buyerName,
      email: buyer.email,
      ...(buyer.buyerPhone === null ? {} : { phoneE164: buyer.buyerPhone }),
      countryIso2: buyer.residenceCountry,
    },
    recipientSnapshot: {
      fullName: recipient.fullName,
      phoneE164: recipient.phone.e164,
      addressLines: lines,
      ...(postcode === undefined ? {} : { postcode }),
      city,
      placeKind: recipient.placeKind,
      ...(deliveryNote === undefined ? {} : { deliveryNote }),
      ...(cardMessage === undefined ? {} : { cardMessage }),
      ...(signAs === undefined ? {} : { signAs }),
    },
    lines: orderLines,
  };
}

const SAVEPOINT = "checkout_place";

/** The decision and the writes, inside the caller's transaction (the file header). */
async function placeWith(
  executor: OrderExecutor,
  context: PlaceContext,
  locale: LocaleCode,
  seen: { readonly amountMinor: number; readonly currency: string } | null,
  now: Date,
): Promise<PlaceOutcome> {
  const lookup = await loadDraftForUpdate(executor, context.token, now);
  if (lookup.status !== "active") return { kind: "expired" };
  const draft = lookup.draft;
  if (draft.purchaseId !== null) {
    return {
      kind: "placed",
      purchaseId: draft.purchaseId,
      orderIds: draft.lines.flatMap((line) =>
        line.orderId === null ? [] : [line.orderId],
      ),
      replay: true,
    };
  }
  if (draft.lines.length === 0) {
    return { kind: "redirect", location: basketPath(locale) };
  }

  const assessed = await assessBasket(draft, {
    locale,
    now,
    ...(context.flags === undefined ? {} : { flags: context.flags }),
  });
  if (!assessed.complete) {
    const first = firstIncompleteScreen(draft);
    return {
      kind: "redirect",
      location: stepPath(locale, first.step, first.line),
    };
  }
  const unavailable = assessed.lines.find(
    (entry) => entry.availability.status === "unavailable",
  );
  if (unavailable !== undefined) {
    if (
      assessed.lines.every(
        (entry) =>
          entry.availability.status === "unavailable" &&
          entry.availability.reason === "closed",
      )
    ) {
      return { kind: "closed" };
    }
    return { kind: "redirect", location: basketPath(locale) };
  }
  const gone = assessed.lines.find(
    (entry) => entry.availability.status === "date_gone",
  );
  if (gone !== undefined) {
    logger.info(
      { draft_id: draft.id, position: gone.line.position, code: "date_gone" },
      "checkout.place_refused",
    );
    return {
      kind: "redirect",
      location: stepPath(locale, "recipient", gone.line.position),
    };
  }
  const noticed = assessed.lines.find((entry) => entry.notice !== null);
  if (noticed !== undefined) {
    return {
      kind: "redirect",
      location: stepPath(locale, "recipient", noticed.line.position),
    };
  }
  const total = assessed.total;
  if (total === null || !assessed.placeable) {
    return { kind: "refused", reason: "unable" };
  }
  if (
    seen === null ||
    seen.amountMinor !== total.amountMinor ||
    seen.currency !== total.currency
  ) {
    // The review showed another total (a line changed in another tab): show it again.
    return { kind: "redirect", location: stepPath(locale, "review") };
  }

  const step = paymentStepFor(draft.mode);
  if (step === null) {
    logger.info(
      { draft_id: draft.id, mode: draft.mode, code: "no_payment_step" },
      "checkout.closed",
    );
    return { kind: "closed" };
  }

  if (draft.mode === "demo") {
    const cap = context.dailyCap ?? DEMO_DAILY_ORDER_CAP;
    const today = await demoOrdersOn(executor, now);
    if (today + draft.lines.length > cap) {
      const day = utcDay(now).start.toISOString().slice(0, 10);
      logger.warn(
        { draft_id: draft.id, order_count: draft.lines.length, code: "cap" },
        "checkout.demo_cap_reached",
      );
      if (capReportedOn !== day) {
        capReportedOn = day;
        captureWarning("checkout.demo_cap_reached", { cap });
      }
      return { kind: "refused", reason: "cap" };
    }
  }

  const buyer = draft.buyer;
  if (buyer === null) {
    const first = firstIncompleteScreen({ ...draft, buyerSaved: false });
    return {
      kind: "redirect",
      location: stepPath(locale, first.step, first.line),
    };
  }

  await executor.execute(sql.raw(`SAVEPOINT ${SAVEPOINT}`));
  try {
    const { customerId } = await upsertGuestCustomer(executor, {
      email: buyer.email,
      name: buyer.buyerName,
      ...(buyer.buyerPhone === null ? {} : { phoneE164: buyer.buyerPhone }),
      countryIso2: buyer.residenceCountry,
    });
    const orders: Omit<PlaceOrderInput, "purchaseId">[] = [];
    for (const line of draft.lines) {
      const totals = await lineTotals(line, locale, now);
      if (totals === null) throw new PlacementRefused("no_price");
      orders.push(await orderInput(executor, draft, line, totals, customerId));
    }
    const { purchaseId, orderIds } = await orderService.placePurchase(
      {
        mode: draft.mode,
        buyerCurrency: total.currency as CurrencyCode,
        totalMinor: total.amountMinor,
        localeCode: draft.locale,
        customerId,
        orders,
      },
      { executor },
    );
    await step.authorise({ executor, purchaseId, orderIds });
    if (draft.mode === "demo") {
      for (const orderId of orderIds) {
        await orderService.demoRoute(orderId, { executor });
      }
      logger.info(
        { purchase_id: purchaseId, order_count: orderIds.length },
        "orders.demo_routed",
      );
    }
    const marked = await markDraftPlaced(
      executor,
      draft.id,
      purchaseId,
      draft.lines.map((line, index) => ({
        position: line.position,
        orderId: orderIds[index] ?? "",
      })),
      now,
    );
    if (!marked) throw new PlacementRefused("draft_already_placed");
    await executor.execute(sql.raw(`RELEASE SAVEPOINT ${SAVEPOINT}`));
    return { kind: "placed", purchaseId, orderIds, replay: false };
  } catch (error) {
    await executor.execute(sql.raw(`ROLLBACK TO SAVEPOINT ${SAVEPOINT}`));
    await executor.execute(sql.raw(`RELEASE SAVEPOINT ${SAVEPOINT}`));
    const code =
      error instanceof PlacementRefused
        ? error.code
        : isOrderEngineError(error)
          ? error.code
          : "place_failed";
    logger.error(
      { draft_id: draft.id, mode: draft.mode, code },
      "checkout.place_refused",
    );
    return { kind: "refused", reason: "unable" };
  }
}

/** Places the basket the cookie names (the file header). Never throws for a buyer's input. */
export async function placeBasket(
  context: PlaceContext,
  seen: { readonly amountMinor: number; readonly currency: string } | null,
): Promise<PlaceOutcome> {
  if (!isLocaleCode(context.locale)) return { kind: "expired" };
  const locale = context.locale;
  const now = (context.now ?? (() => new Date()))();
  const started = Date.now();
  const outcome = await withDraftConnection(context.connection, (executor) =>
    placeWith(executor, context, locale, seen, now),
  );
  if (outcome.kind === "placed" && !outcome.replay) {
    const durationMs = Date.now() - started;
    logger.info(
      {
        purchase_id: outcome.purchaseId,
        order_count: outcome.orderIds.length,
        duration_ms: durationMs,
      },
      "checkout.placed",
    );
    if (durationMs > PLACE_WARN_MS) {
      logger.warn(
        { purchase_id: outcome.purchaseId, duration_ms: durationMs },
        "checkout.place_slow",
      );
    }
  }
  return outcome;
}

/** `placeOrderAction`'s contract without Next (`actions.ts` wraps it). */
export async function runPlaceOrder(
  context: PlaceContext,
  form: FormData,
): Promise<StepOutcome> {
  if (!isLocaleCode(context.locale)) {
    return { kind: "render", state: { status: "expired" } };
  }
  const locale = context.locale;
  const values = formValues(form);
  const parsed = PlaceOrderFormSchema.safeParse({
    seenTotalMinor: values["seenTotalMinor"],
    seenCurrency: values["seenCurrency"],
  });
  const outcome = await placeBasket(
    context,
    parsed.success
      ? {
          amountMinor: parsed.data.seenTotalMinor,
          currency: parsed.data.seenCurrency,
        }
      : null,
  );
  switch (outcome.kind) {
    case "placed":
      return {
        kind: "redirect",
        location: `/${locale}/checkout/done`,
        basketCount: 0,
      };
    case "redirect":
      return { kind: "redirect", location: outcome.location };
    case "expired":
      return { kind: "render", state: { status: "expired" } };
    case "closed":
      return { kind: "render", state: { status: "closed" } };
    case "refused":
      return {
        kind: "render",
        state: { status: "refused", reason: outcome.reason },
      };
  }
}
