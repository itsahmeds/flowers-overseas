/**
 * Step 3 in `test` and `live`: what the `PaymentPanel` island's server actions and the return
 * route do (spec 013 §5.2 "How a paid order flows" 2 to 5; §14 A-founder-2026-10-22 item 3;
 * AC-1, AC-4, AC-5; TASK-262). The decisions are here, without Next, so they test against a
 * scratch database; `actions.ts` and the route only read the cookie and answer.
 *
 *  - `runPay(context, form)`: "Pay" pressed after `elements.submit()`. Places the basket through
 *    spec 010's `placeBasket` (the quote checks, one purchase, the orders `placed`; the step's
 *    `authorise` writes nothing for `test`/`live`), then, **outside** that transaction, the
 *    registered step's `confirm(purchaseId)`: one intent for the purchase, its client secret for
 *    the island only. A basket already placed and still unpaid (a retry, a double click, a
 *    refresh) skips placement and confirms the same purchase, so the intent is the same.
 *  - `runPaymentDeclined(context)`: the island's call after `confirmPayment` reports a decline.
 *    `sync` reconciles the purchase (one `order.payment_attempt_failed` per order per distinct
 *    decline, by spec 013's `reconcile`) and answers our message key, never the provider's text.
 *  - `paymentReturnLocation(context)`: the return route's work. It reads **nothing** from Stripe's
 *    query parameters: the purchase comes from the `fo_checkout` cookie, `sync` reconciles it, and
 *    the answer is always `/{locale}/checkout/done` with no query (AC-4).
 *
 * Every refusal is a typed answer; nothing here logs a client secret, a token or a person's data.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { isLocaleCode } from "@/config/locales";
import { logger } from "@/lib/logger";

import { loadDraft, withDraftConnection } from "./draft";
import { paymentStepFor } from "./payment-step";
import { PlaceOrderFormSchema, placeBasket } from "./place";
import { formValues, stepPath, type StepContext } from "./steps";

/** What the island is told after "Pay". */
export type PayOutcome =
  | { readonly kind: "confirm"; readonly clientSecret: string }
  | { readonly kind: "error"; readonly messageKey: string }
  | {
      readonly kind: "redirect";
      readonly location: string;
      /**
       * Spec 047 (AC-14, TASK-447): the applied code stopped applying at placement; the action
       * writes it into the one-hop echo so step 4 names the old and new totals. Never sent to
       * the island.
       */
      readonly discountChanged?: {
        readonly code: string;
        readonly old: {
          readonly amountMinor: number;
          readonly currency: string;
        };
        readonly new: {
          readonly amountMinor: number;
          readonly currency: string;
        };
      };
    };

/** What the island is told after a decline. */
export type DeclineOutcome =
  | { readonly kind: "error"; readonly messageKey: string }
  | { readonly kind: "redirect"; readonly location: string };

const UNAVAILABLE = "payments.error.unavailable";
const GENERIC = "payments.error.generic";

function donePath(locale: string): string {
  return `/${locale}/checkout/done`;
}

/** The paying step for a placed or placeable draft: `test` or `live`, registered. */
function stepOf(mode: string) {
  if (mode !== "test" && mode !== "live") return null;
  const step = paymentStepFor(mode);
  return step?.confirm === undefined || step.sync === undefined ? null : step;
}

/** "Pay" (the file header). */
export async function runPay(
  context: StepContext,
  form: FormData,
): Promise<PayOutcome> {
  if (!isLocaleCode(context.locale)) {
    return { kind: "redirect", location: "/" };
  }
  const locale = context.locale;
  const now = (context.now ?? (() => new Date()))();
  const lookup = await loadDraft(context.token, now, context.connection);
  if (lookup.status !== "active") {
    return { kind: "redirect", location: stepPath(locale, "review") };
  }
  const step = stepOf(lookup.draft.mode);
  if (step?.confirm === undefined) {
    return { kind: "error", messageKey: UNAVAILABLE };
  }
  let purchaseId = lookup.draft.purchaseId;
  if (purchaseId === null) {
    const values = formValues(form);
    const parsed = PlaceOrderFormSchema.safeParse({
      seenTotalMinor: values["seenTotalMinor"],
      seenCurrency: values["seenCurrency"],
    });
    const placed = await placeBasket(
      {
        locale,
        token: context.token,
        ...(context.now === undefined ? {} : { now: context.now }),
        ...(context.connection === undefined
          ? {}
          : { connection: context.connection }),
        ...(context.flags === undefined ? {} : { flags: context.flags }),
        ...(context.discountFlag === undefined
          ? {}
          : { discountFlag: context.discountFlag }),
        ...(context.analytics === undefined
          ? {}
          : { analytics: context.analytics }),
      },
      parsed.success
        ? {
            amountMinor: parsed.data.seenTotalMinor,
            currency: parsed.data.seenCurrency,
          }
        : null,
    );
    switch (placed.kind) {
      case "placed":
        purchaseId = placed.purchaseId;
        break;
      case "redirect":
        return { kind: "redirect", location: placed.location };
      case "expired":
      case "closed":
        return { kind: "redirect", location: stepPath(locale, "review") };
      case "refused":
        return { kind: "error", messageKey: "checkout.error.unable" };
      case "discount_changed":
        return {
          kind: "redirect",
          location: stepPath(locale, "review"),
          discountChanged: {
            code: placed.code,
            old: placed.old,
            new: placed.new,
          },
        };
    }
  }
  const confirmed = await step.confirm(purchaseId);
  switch (confirmed.kind) {
    case "confirm":
      return { kind: "confirm", clientSecret: confirmed.clientSecret };
    case "payments_unavailable":
      logger.warn({ purchase_id: purchaseId }, "checkout.pay_unavailable");
      return { kind: "error", messageKey: UNAVAILABLE };
    case "not_payable":
      // Already paid (another tab, a webhook first) or closed: the confirmation says which.
      return { kind: "redirect", location: donePath(locale) };
    case "refused":
      // Spec 021: the pre-check refused before any intent; spec 013's notice, nothing charged.
      return { kind: "error", messageKey: confirmed.messageKey };
  }
}

/** After a decline (the file header). */
export async function runPaymentDeclined(
  context: StepContext,
): Promise<DeclineOutcome> {
  if (!isLocaleCode(context.locale)) {
    return { kind: "redirect", location: "/" };
  }
  const now = (context.now ?? (() => new Date()))();
  const lookup = await loadDraft(context.token, now, context.connection);
  if (lookup.status !== "active" || lookup.draft.purchaseId === null) {
    return { kind: "error", messageKey: GENERIC };
  }
  const step = stepOf(lookup.draft.mode);
  if (step?.sync === undefined) {
    return { kind: "error", messageKey: UNAVAILABLE };
  }
  const synced = await step.sync(lookup.draft.purchaseId);
  if (synced.kind === "paid") {
    return { kind: "redirect", location: donePath(context.locale) };
  }
  if (synced.kind === "ended") {
    // Spec 021 (AC-4): step 4 renders the attempts-used-up state, with no retry.
    return { kind: "redirect", location: stepPath(context.locale, "review") };
  }
  return { kind: "error", messageKey: synced.messageKey ?? GENERIC };
}

/** The three headers of AC-4, on every answer of the return route. */
export const PAYMENT_RETURN_HEADERS = Object.freeze({
  "cache-control": "no-store",
  "x-robots-tag": "noindex, nofollow",
  "referrer-policy": "no-referrer",
});

/** The return route's 303 target, after reconciling the cookie's purchase (AC-4). */
export async function paymentReturnLocation(
  context: StepContext,
): Promise<string> {
  const locale = z.string().refine(isLocaleCode).safeParse(context.locale);
  if (!locale.success) return "/";
  const now = (context.now ?? (() => new Date()))();
  const lookup = await loadDraft(context.token, now, context.connection);
  if (lookup.status === "active" && lookup.draft.purchaseId !== null) {
    const step = stepOf(lookup.draft.mode);
    if (step?.sync !== undefined) {
      const synced = await step.sync(lookup.draft.purchaseId);
      if (synced.kind === "ended") return stepPath(locale.data, "review");
    }
  }
  return donePath(locale.data);
}

const UnpaidRow = z.object({
  total_minor: z.coerce.number().int().positive(),
  currency: z.string().regex(/^[A-Z]{3}$/u),
  buyer_country: z
    .string()
    .regex(/^[A-Z]{2}$/u)
    .nullable(),
});

/** What step 3 needs to resume an unpaid purchase: its total and the declared buyer country. */
export interface UnpaidPurchase {
  readonly purchaseId: string;
  readonly total: { readonly amountMinor: number; readonly currency: string };
  readonly buyerCountry: string;
}

/**
 * The cookie's purchase while it is placed and unpaid (a refresh after a decline, AC-5): read
 * from the purchase and its first order's buyer snapshot, since placement cleared the draft's
 * personal fields. `null` for anything else.
 */
export async function unpaidPurchase(
  context: StepContext,
): Promise<UnpaidPurchase | null> {
  const now = (context.now ?? (() => new Date()))();
  const lookup = await loadDraft(context.token, now, context.connection);
  if (lookup.status !== "active" || lookup.draft.purchaseId === null) {
    return null;
  }
  const purchaseId = lookup.draft.purchaseId;
  const [raw] = await withDraftConnection(context.connection, (executor) =>
    executor.execute(sql`
      SELECT p.total_minor::text AS total_minor, p.buyer_currency_code AS currency,
             (SELECT o.buyer_snapshot ->> 'countryIso2' FROM "order" o
               WHERE o.purchase_id = p.id ORDER BY o.created_at, o.id LIMIT 1) AS buyer_country
        FROM purchase p
       WHERE p.id = ${purchaseId}
         AND NOT EXISTS (SELECT 1 FROM "order" o
                          WHERE o.purchase_id = p.id AND o.status <> 'placed')`),
  );
  if (raw === undefined) return null;
  const row = UnpaidRow.parse(raw);
  if (row.buyer_country === null) return null;
  return {
    purchaseId,
    total: { amountMinor: row.total_minor, currency: row.currency },
    buyerCountry: row.buyer_country,
  };
}
