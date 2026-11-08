/**
 * Discount codes at checkout (spec 047 §2 "Codes, entered at checkout", §5.2 `applyDiscountAction`,
 * `removeDiscountAction`, the placement re-check; §14 A-orchestrator-2026-10-25 items 1 and 2;
 * AC-7, AC-9, AC-10, AC-12, AC-13, AC-14; TASK-447).
 *
 * **One code per purchase, on step 4.** The code applies to the whole basket: every line of every
 * delivery whose bouquet and destination the code covers, the bouquet with its add-ons
 * (`evaluateCode` decides eligibility). The draft holds at most one code
 * (`checkout_draft.discount_code_id`); applying another replaces it.
 *
 * **The flag.** The control and both actions exist only while `checkout.discount_codes` is on for
 * **every** destination in the basket (country scope, off by default): a code never reduces a
 * delivery to a country the founder has not switched on. Off, `applyDiscountAction` answers
 * `closed` and changes nothing (AC-7).
 *
 * **What is read, what is never read.** The typed code comes from the form body only (no route
 * reads a code from a query string, AC-21). No IP, no buyer country, no locale decides anything
 * (ADR-0006, AC-29). The code string is never logged: log lines carry `draft_id`,
 * `discount_code_id` and the reason (§8, AC-23).
 *
 * Amounts: every line's price is its signed quote (`lineTotals`), the discount and its shares come
 * from `evaluateCode` (integer minor units, largest remainder), and the VAT is spec 005's
 * `vatBreakdown()` over the paid amounts, rate by rate (AC-8).
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { type LocaleCode, isLocaleCode } from "@/config/locales";
import { logger } from "@/lib/logger";
import {
  type IntegerMoney,
  IntegerMoneySchema,
  type VatSplit,
  VatLineSchema,
  vatBreakdown,
} from "@/modules/catalog";
import {
  type AllocatedLine,
  ApplyDiscountSchema,
  COUNTED_FAILURES,
  type DiscountConnection,
  type DiscountKind,
  type DiscountRefusalReason,
  type LoadedCode,
  type PurchaseLine,
  countUses,
  emailKey,
  evaluateCode,
  isLocked,
  loadCode,
  lockAndCount,
  lookupTypedCode,
  recordFailure,
} from "@/modules/discounts";
import type { OrderExecutor } from "@/modules/orders";

import { type AssessedLine, assessBasket } from "./basket";
import {
  type Draft,
  type DraftConnection,
  loadDraftForUpdate,
  saveDraftDiscount,
  withDraftConnection,
} from "./draft";
import type { CheckoutFlagReader } from "./mode";
import { type DraftTotals, lineTotals } from "./pricing";
import { type StepContext, formValues } from "./steps";

/** The flag that shows the control for a destination (spec 047 §5.1 `feature_flag` row). */
export const DISCOUNT_FLAG_KEY = "checkout.discount_codes";

/** Reads `checkout.discount_codes` for one destination; tests inject a fake. */
export type DiscountFlagReader = (scope: {
  readonly kind: "country";
  readonly ref: string;
}) => Promise<boolean>;

/** The production reader. A flag row missing from the database reads as off, its safe value. */
const databaseDiscountFlag: DiscountFlagReader = async (scope) => {
  try {
    const { isEnabled } = await import("@/lib/flags");
    return await isEnabled(DISCOUNT_FLAG_KEY, scope);
  } catch (error) {
    if (error instanceof Error && error.name === "FlagNotSeededError") {
      logger.error(
        { code: "flag_not_seeded", flag: DISCOUNT_FLAG_KEY },
        "checkout.flag",
      );
      return false;
    }
    throw error;
  }
};

/**
 * The reader a caller's context implies: its own `discountFlag`, else the checkout flag reader it
 * injected (a test's fake answers every flag key, this one included), else the database.
 */
export function discountFlagOf(context: {
  readonly discountFlag?: DiscountFlagReader | undefined;
  readonly flags?: CheckoutFlagReader | undefined;
}): DiscountFlagReader {
  if (context.discountFlag !== undefined) return context.discountFlag;
  const injected = context.flags;
  if (injected === undefined) return databaseDiscountFlag;
  const read = injected as unknown as (
    key: string,
    scope: { readonly kind: "country"; readonly ref: string },
  ) => Promise<boolean>;
  return (scope) => read(DISCOUNT_FLAG_KEY, scope);
}

/** True when the flag is on for every destination of the basket (the file header). */
export async function discountCodesOn(
  countries: readonly string[],
  reader: DiscountFlagReader = databaseDiscountFlag,
): Promise<boolean> {
  const distinct = [...new Set(countries)];
  if (distinct.length === 0) return false;
  for (const ref of distinct) {
    if (!(await reader({ kind: "country", ref }))) return false;
  }
  return true;
}

/* -------------------------------------------------------------------------- */
/* The purchase as evaluateCode reads it                                       */
/* -------------------------------------------------------------------------- */

/** One summary line of one delivery, as a line of the purchase. */
export interface DraftPurchaseLine extends PurchaseLine {
  /** The delivery (basket line) it belongs to. */
  readonly position: number;
  /** Its index in that delivery's `DraftTotals.lines`. */
  readonly index: number;
  readonly vatRateBp: number;
}

/** A delivery with its priced lines, in basket order. */
export interface PricedDelivery {
  readonly position: number;
  readonly totals: DraftTotals;
}

const KeyRow = z.object({
  position: z.coerce.number().int().positive(),
  country_id: z.uuid(),
  product_id: z.uuid(),
});

/** The database ids a code's scope is stored against, per basket line. */
async function lineKeys(
  executor: OrderExecutor,
  draftId: string,
): Promise<
  ReadonlyMap<
    number,
    { readonly countryId: string; readonly productId: string }
  >
> {
  const rows = await executor.execute(sql`
    SELECT position, destination_country_id AS country_id, product_id FROM checkout_draft_line
     WHERE draft_id = ${z.uuid().parse(draftId)}`);
  const keys = new Map<number, { countryId: string; productId: string }>();
  for (const raw of rows) {
    const row = KeyRow.parse(raw);
    keys.set(row.position, {
      countryId: row.country_id,
      productId: row.product_id,
    });
  }
  return keys;
}

/** Every summary line of every delivery, in basket order, as `evaluateCode` takes them. */
function purchaseLines(
  deliveries: readonly PricedDelivery[],
  keys: ReadonlyMap<
    number,
    { readonly countryId: string; readonly productId: string }
  >,
): DraftPurchaseLine[] {
  const lines: DraftPurchaseLine[] = [];
  for (const delivery of deliveries) {
    const key = keys.get(delivery.position);
    if (key === undefined) continue;
    delivery.totals.lines.forEach((entry, index) => {
      lines.push({
        position: delivery.position,
        index,
        grossMinor: entry.amount.amountMinor,
        currency: entry.amount.currency,
        vatRateBp: entry.vatRateBp,
        destinationCountryId: key.countryId,
        productId: key.productId,
      });
    });
  }
  return lines;
}

/** A code applied to the basket, with every figure the pages and the placement need. */
export interface AppliedDiscount {
  readonly codeId: string;
  /** The normalised code (A to Z, 0 to 9), shown inside `<bdi dir="ltr">`. */
  readonly code: string;
  /** Internal; never rendered to a buyer (AC-31). Logs and analytics only. */
  readonly campaignLabel: string;
  readonly kind: DiscountKind;
  readonly percentBp: number | null;
  readonly amount: IntegerMoney;
  /** The basket total before the code: the sum of every delivery's quote. */
  readonly subtotal: IntegerMoney;
  /** What the buyer pays: `subtotal - amount`. */
  readonly total: IntegerMoney;
  /** VAT by rate over the paid amounts of the whole basket (spec 005 `vatBreakdown()`). */
  readonly vat: readonly VatSplit[];
  readonly allocation: readonly AllocatedLine<DraftPurchaseLine>[];
}

/** Why a code is refused, with what its message names. */
export interface DiscountRefusal {
  readonly reason: DiscountRefusalReason;
  /** `notStarted`: the start instant. */
  readonly startsAt?: string | undefined;
  /** `wrongDestination`: the destination's ISO code. */
  readonly countryIso?: string | undefined;
  /** `wrongCurrency`, `belowMinimum`: the purchase currency. */
  readonly currency?: string | undefined;
  /** `belowMinimum`: the minimum in that currency. */
  readonly minimumMinor?: number | undefined;
  /** `locked`: whole minutes left. */
  readonly minutes?: number | undefined;
}

export type DraftDiscount =
  | { readonly kind: "applied"; readonly discount: AppliedDiscount }
  | {
      readonly kind: "refused";
      readonly refusal: DiscountRefusal;
      /** The code that was applied, when there was one (the placement notice names it). */
      readonly code: string | null;
      readonly codeId: string | null;
    };

/** The connection shape of `modules/discounts` over a checkout executor. */
function discountConnection(executor: OrderExecutor): DiscountConnection {
  return { db: executor };
}

/** The message arguments of a refusal (§7: each key's placeholders). */
function refusalOf(
  reason: DiscountRefusalReason,
  loaded: LoadedCode | null,
  currency: string,
  firstCountryIso: string | undefined,
): DiscountRefusal {
  switch (reason) {
    case "not_started":
      return loaded === null
        ? { reason }
        : { reason, startsAt: loaded.code.startsAt.toISOString() };
    case "wrong_destination":
      return firstCountryIso === undefined
        ? { reason }
        : { reason, countryIso: firstCountryIso };
    case "wrong_currency":
      return { reason, currency };
    case "below_minimum": {
      const row = loaded?.currencies.find(
        (entry) => entry.currency === currency,
      );
      return { reason, currency, minimumMinor: row?.minOrderMinor ?? 0 };
    }
    default:
      return { reason };
  }
}

export interface EvaluateDraftInput {
  readonly executor: OrderExecutor;
  readonly draft: Draft;
  readonly deliveries: readonly PricedDelivery[];
  /** The destination of each delivery, for the `wrongDestination` message. */
  readonly countryIsos: readonly string[];
  readonly loaded: LoadedCode | null;
  readonly now: Date;
  /** `true` at placement: `lockAndCount` under the code's row lock; `false`: the advisory count. */
  readonly lock: boolean;
}

/** One code on the basket: the applied figures, or the refusal (the file header). */
export async function evaluateDraft(
  input: EvaluateDraftInput,
): Promise<DraftDiscount> {
  const { draft, loaded } = input;
  const currency =
    draft.currency ?? input.deliveries[0]?.totals.total.currency ?? null;
  const refused = (reason: DiscountRefusalReason): DraftDiscount => ({
    kind: "refused",
    refusal: refusalOf(reason, loaded, currency ?? "", input.countryIsos[0]),
    code: loaded?.code.codeNormalised ?? null,
    codeId: loaded?.code.id ?? null,
  });
  if (loaded === null || currency === null) return refused("unknown");
  const keys = await lineKeys(input.executor, draft.id);
  const lines = purchaseLines(input.deliveries, keys);
  const key = draft.buyer === null ? null : emailKey(draft.buyer.email);
  const connection = discountConnection(input.executor);
  const counts = input.lock
    ? await lockAndCount(loaded.code.id, draft.mode, key, connection)
    : await countUses(loaded.code.id, draft.mode, key, connection);
  if (counts === null) return refused("unknown");
  const evaluation = evaluateCode({
    code: loaded.code,
    currencies: loaded.currencies,
    countryIds: loaded.countryIds,
    productIds: loaded.productIds,
    now: input.now,
    purchase: { currency, lines },
    emailKey: key,
    counts,
    locked: false,
  });
  if (!evaluation.ok) return refused(evaluation.reason);
  const subtotalMinor = lines.reduce((sum, line) => sum + line.grossMinor, 0);
  const subtotal = IntegerMoneySchema.parse({
    amountMinor: subtotalMinor,
    currency,
  });
  const vat = vatBreakdown(
    evaluation.allocation.map((line) =>
      VatLineSchema.parse({
        rateBp: line.vatRateBp,
        grossMinor: line.paidMinor,
        currency,
      }),
    ),
  );
  return {
    kind: "applied",
    discount: {
      codeId: loaded.code.id,
      code: loaded.code.codeNormalised,
      campaignLabel: loaded.campaignLabel,
      kind: loaded.code.kind,
      percentBp: loaded.code.percentBp,
      amount: IntegerMoneySchema.parse({
        amountMinor: evaluation.amount.amountMinor,
        currency,
      }),
      subtotal,
      total: IntegerMoneySchema.parse({
        amountMinor: subtotalMinor - evaluation.amount.amountMinor,
        currency,
      }),
      vat,
      allocation: evaluation.allocation,
    },
  };
}

/** Each available delivery of an assessed basket with its summary lines, in basket order. */
export async function pricedDeliveries(
  assessed: readonly AssessedLine[],
  locale: LocaleCode,
  now: Date,
): Promise<PricedDelivery[]> {
  const deliveries: PricedDelivery[] = [];
  for (const entry of assessed) {
    if (entry.availability.status === "unavailable") continue;
    const totals = await lineTotals(
      entry.check === null
        ? entry.line
        : { ...entry.line, quote: entry.check.quote },
      locale,
      now,
    );
    if (totals !== null) {
      deliveries.push({ position: entry.line.position, totals });
    }
  }
  return deliveries;
}

/**
 * The draft's applied code on the basket as it stands: what step 4 draws and what the review
 * compares (advisory count; the binding one is at placement). `null` when no code is applied.
 */
export async function draftDiscountOf(
  executor: OrderExecutor,
  draft: Draft,
  deliveries: readonly PricedDelivery[],
  now: Date,
  lock = false,
): Promise<DraftDiscount | null> {
  if (draft.discountCodeId === null) return null;
  const loaded = await loadCode(
    { id: draft.discountCodeId },
    discountConnection(executor),
  );
  return evaluateDraft({
    executor,
    draft,
    deliveries,
    countryIsos: draft.lines.map((line) => line.countryIso),
    loaded,
    now,
    lock,
  });
}

/** The per-checkout lock, in whole minutes left, or `null` when the field is open. */
export async function discountLockMinutes(
  executor: OrderExecutor,
  draftId: string,
  now: Date,
): Promise<number | null> {
  const lock = await isLocked(draftId, now, discountConnection(executor));
  return lock.locked ? lock.minutes : null;
}

/* -------------------------------------------------------------------------- */
/* The two actions                                                             */
/* -------------------------------------------------------------------------- */

/** What step 4 draws after an apply or a remove (it travels in the one-hop echo). */
export type DiscountNotice =
  | {
      readonly kind: "applied";
      readonly code: string;
      readonly amount: IntegerMoney;
    }
  | {
      readonly kind: "replaced";
      readonly previous: string;
      readonly code: string;
    }
  | {
      readonly kind: "refused";
      readonly refusal: DiscountRefusal;
      /** What the buyer typed, kept in the field. */
      readonly value: string;
    }
  | { readonly kind: "removed" }
  | {
      /** Placement found the code no longer usable (AC-14). */
      readonly kind: "changed";
      readonly code: string;
      readonly old: IntegerMoney;
      readonly new: IntegerMoney;
    };

export type DiscountOutcome =
  | { readonly kind: "notice"; readonly notice: DiscountNotice }
  /** The draft is gone, expired or placed: the page draws that state. */
  | { readonly kind: "expired" }
  /** The flag is off for the basket: nothing changed (AC-7). */
  | { readonly kind: "closed" }
  /** Step 4 is not reachable: the page draws the first screen the buyer still owes. */
  | { readonly kind: "elsewhere" };

/** What the two runners are handed: a step context, plus the discount seams tests replace. */
export interface DiscountContext extends StepContext {
  readonly discountFlag?: DiscountFlagReader;
  /** Replaces `lookupTypedCode` (AC-13's spy: a locked field makes no lookup). */
  readonly lookup?: typeof lookupTypedCode;
}

interface Loaded {
  readonly draft: Draft;
  readonly deliveries: readonly PricedDelivery[];
}

/** The draft under its lock, at step 4, with the flag on; or the outcome that stops here. */
async function step4(
  executor: OrderExecutor,
  context: DiscountContext,
  locale: LocaleCode,
  now: Date,
): Promise<Loaded | DiscountOutcome> {
  const lookup = await loadDraftForUpdate(executor, context.token, now);
  if (lookup.status !== "active" || lookup.draft.purchaseId !== null) {
    return { kind: "expired" };
  }
  const draft = lookup.draft;
  const on = await discountCodesOn(
    draft.lines.map((line) => line.countryIso),
    discountFlagOf(context),
  );
  if (!on) return { kind: "closed" };
  const assessed = await assessBasket(draft, {
    locale,
    now,
    ...(context.flags === undefined ? {} : { flags: context.flags }),
  });
  if (!assessed.reviewReachable) return { kind: "elsewhere" };
  return {
    draft,
    deliveries: await pricedDeliveries(assessed.lines, locale, now),
  };
}

function isOutcome(value: Loaded | DiscountOutcome): value is DiscountOutcome {
  return "kind" in value;
}

/** `applyDiscountAction` without Next (§5.2; the file header). */
export async function runApplyDiscount(
  context: DiscountContext,
  form: FormData,
): Promise<DiscountOutcome> {
  if (!isLocaleCode(context.locale)) return { kind: "expired" };
  const locale = context.locale;
  const now = (context.now ?? (() => new Date()))();
  const raw = formValues(form)["code"];
  const typed = typeof raw === "string" ? raw : "";
  return withDraftConnection(
    context.connection,
    async (executor): Promise<DiscountOutcome> => {
      const loaded = await step4(executor, context, locale, now);
      if (isOutcome(loaded)) return loaded;
      const { draft, deliveries } = loaded;
      const connection = discountConnection(executor);
      const refuse = (refusal: DiscountRefusal): DiscountOutcome => ({
        kind: "notice",
        notice: { kind: "refused", refusal, value: typed.slice(0, 64) },
      });

      // A locked field looks nothing up (§2 "Abuse limits", AC-13).
      const lock = await isLocked(draft.id, now, connection);
      if (lock.locked) {
        logger.info(
          { draft_id: draft.id, reason: "locked" },
          "checkout.discount_refused",
        );
        return refuse({ reason: "locked", minutes: lock.minutes });
      }
      const parsed = ApplyDiscountSchema.safeParse({ code: typed });
      // An empty or oversized field is not a guess: refused as `unknown`, not counted.
      if (!parsed.success) return refuse({ reason: "unknown" });

      const code = await (context.lookup ?? lookupTypedCode)(
        parsed.data.code,
        connection,
      );
      const result = await evaluateDraft({
        executor,
        draft,
        deliveries,
        countryIsos: draft.lines.map((line) => line.countryIso),
        loaded: code,
        now,
        lock: false,
      });
      if (result.kind === "refused") {
        const reason = result.refusal.reason;
        logger.info(
          {
            draft_id: draft.id,
            discount_code_id: result.codeId,
            reason,
            mode: draft.mode,
          },
          "checkout.discount_refused",
        );
        if (COUNTED_FAILURES.has(reason)) {
          await recordFailure(draft.id, now, connection);
        }
        return refuse(result.refusal);
      }

      const discount = result.discount;
      const previous =
        draft.discountCodeId !== null &&
        draft.discountCodeId !== discount.codeId
          ? await loadCode({ id: draft.discountCodeId }, connection)
          : null;
      await saveDraftDiscount(draft.id, discount.codeId, now, { executor });
      logger.info(
        {
          draft_id: draft.id,
          discount_code_id: discount.codeId,
          mode: draft.mode,
          replaced: previous !== null,
        },
        "checkout.discount_applied",
      );
      return {
        kind: "notice",
        notice:
          previous === null
            ? { kind: "applied", code: discount.code, amount: discount.amount }
            : {
                kind: "replaced",
                previous: previous.code.codeNormalised,
                code: discount.code,
              },
      };
    },
  );
}

/** `removeDiscountAction` without Next: clears the draft's code (§5.2). */
export async function runRemoveDiscount(
  context: DiscountContext,
): Promise<DiscountOutcome> {
  if (!isLocaleCode(context.locale)) return { kind: "expired" };
  const now = (context.now ?? (() => new Date()))();
  return withDraftConnection(
    context.connection,
    async (executor): Promise<DiscountOutcome> => {
      const lookup = await loadDraftForUpdate(executor, context.token, now);
      if (lookup.status !== "active" || lookup.draft.purchaseId !== null) {
        return { kind: "expired" };
      }
      const draft = lookup.draft;
      if (draft.discountCodeId !== null) {
        await saveDraftDiscount(draft.id, null, now, { executor });
        logger.info(
          { draft_id: draft.id, discount_code_id: draft.discountCodeId },
          "checkout.discount_removed",
        );
      }
      return { kind: "notice", notice: { kind: "removed" } };
    },
  );
}

/** Re-exported for the placement, which reads the flag through the same seam. */
export type { CheckoutFlagReader, DraftConnection };
