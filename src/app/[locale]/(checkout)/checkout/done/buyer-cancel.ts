/**
 * The confirmation's buyer cancel, the part that decides (spec 018 §5.2 "Buyer cancellation";
 * §14 A-founder-2026-10-14b B.1; AC-28 confirmation half; TASK-340). `./actions.ts` is the thin
 * `"use server"` glue around `runBuyerCancel`.
 *
 * **The order comes from the draft cookie.** The line's form is bound to the delivery's `FO-`
 * reference (already printed on the page); the server reads the `fo_checkout` cookie's purchase
 * (`confirmationFor`) and cancels only an order of that purchase whose reference matches. A
 * reference from another draft, another customer's order, no cookie or an expired one: nothing is
 * written and the answer is 404. No order id or reference ever enters a URL.
 *
 * **Every answer is a 303 back to the page** (`/{locale}/checkout/done`), so both steps work with
 * JavaScript off and a reload never re-posts:
 *
 *  - `review` → `?cancel=review&line=N`: the page draws the confirm `<dialog open>` for delivery N
 *    (its position in the basket, never an id);
 *  - `confirm` applied, or the order already cancelled (a double submit) → the page itself, which
 *    spec 013's state draws as cancelled;
 *  - refused (`in_production` or later, or the production start won the race) → `?cancel=refused
 *    &line=N`: the page in its current state with `postPurchase.cancelRefused` where the line was.
 */
import { z } from "zod";

import type { LocaleCode } from "@/config/locales";
import type { Confirmation } from "@/modules/checkout";
import type {
  BuyerCancelOutcome,
  CancelOrderAsBuyerInput,
} from "@/modules/orders/buyer-cancel";

/** The two query values the page reads, and their names. */
export const CANCEL_PARAM = "cancel";
export const CANCEL_LINE_PARAM = "line";

/** What the page draws for one delivery's line, read from the query (`null`: the plain line). */
export type CancelUiState = {
  readonly step: "review" | "refused";
  /** The delivery's 1-based position in the purchase. */
  readonly line: number;
} | null;

const CancelQuerySchema = z.object({
  [CANCEL_PARAM]: z.enum(["review", "refused"]),
  [CANCEL_LINE_PARAM]: z.coerce.number().int().min(1).max(99),
});

/** The page's `searchParams` as a cancel state; anything else is `null`. */
export function cancelUiStateFrom(
  params: Readonly<Record<string, string | readonly string[] | undefined>>,
): CancelUiState {
  const parsed = CancelQuerySchema.safeParse(params);
  if (!parsed.success) return null;
  return {
    step: parsed.data[CANCEL_PARAM],
    line: parsed.data[CANCEL_LINE_PARAM],
  };
}

/** The done page's path, with a cancel state's query when there is one. */
export function donePath(locale: LocaleCode, state: CancelUiState): string {
  const path = `/${locale}/checkout/done`;
  if (state === null) return path;
  return `${path}?${CANCEL_PARAM}=${state.step}&${CANCEL_LINE_PARAM}=${String(state.line)}`;
}

/** The posted step: exactly one of the two buttons' values. */
export const PostedStepSchema = z.enum(["review", "confirm"]);

export interface BuyerCancelDeps {
  /** `confirmationFor(token)` in production. */
  readonly confirmation: () => Promise<Confirmation>;
  /** `cancelOrderAsBuyer` (`src/modules/orders/buyer-cancel.ts`) in production. */
  readonly cancel: (
    input: CancelOrderAsBuyerInput,
  ) => Promise<BuyerCancelOutcome>;
}

export type BuyerCancelAnswer =
  | { readonly kind: "redirect"; readonly to: string }
  | { readonly kind: "not_found" };

/** One post of the line or the dialog (the file header). */
export async function runBuyerCancel(
  input: {
    readonly locale: LocaleCode;
    readonly reference: unknown;
    readonly step: unknown;
  },
  deps: BuyerCancelDeps,
): Promise<BuyerCancelAnswer> {
  const step = PostedStepSchema.safeParse(input.step);
  const reference = z.string().max(32).safeParse(input.reference);
  if (!step.success || !reference.success) return { kind: "not_found" };
  const confirmation = await deps.confirmation();
  if (confirmation.kind !== "placed" || confirmation.mode === "demo") {
    return { kind: "not_found" };
  }
  const index = confirmation.deliveries.findIndex(
    (delivery) => delivery.reference === reference.data,
  );
  const delivery = confirmation.deliveries[index];
  if (delivery === undefined) return { kind: "not_found" };
  const line = index + 1;
  const outcome = await deps.cancel({
    orderId: delivery.orderId,
    step: step.data,
  });
  switch (outcome.kind) {
    case "review":
      return {
        kind: "redirect",
        to: donePath(input.locale, { step: "review", line }),
      };
    case "cancelled":
      return { kind: "redirect", to: donePath(input.locale, null) };
    case "refused":
      return {
        kind: "redirect",
        to: donePath(input.locale, { step: "refused", line }),
      };
    case "not_found":
      return { kind: "not_found" };
  }
}
