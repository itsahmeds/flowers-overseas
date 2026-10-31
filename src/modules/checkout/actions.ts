/**
 * The checkout's server actions (spec 010 §5.2 "Server actions and the route"; TASK-203):
 * `saveRecipientStep`, `saveCardAndBuyerStep`, `updateSelection`; TASK-205's `placeOrderAction`
 * (`place.ts`).
 *
 * Thin: each reads the `fo_checkout` cookie, hands the form to its runner in `steps.ts` (which
 * loads the draft, re-runs the mode, parses, verifies the quote and saves), then answers with a
 * 303 (`redirect()` from a server action is a 303) or the state the step re-renders with. Next's
 * server actions keep their own `Origin` check (§8 "Security").
 *
 * The page binds the request's locale as the first argument
 * (`saveRecipientStep.bind(null, locale)`) and uses the action with `useActionState`, so it works
 * with JavaScript off. A successful save refreshes the cookie's `Max-Age` with the same token, so
 * the cookie lives as long as the basket: 30 days after the last change (spec 010 §14
 * A-founder-2026-10-22 D7). Every redirect from an open basket also writes `fo_basket` with its
 * number of lines, deleting it at zero (item 7, AC-62); a server action's response is never
 * cached, so no cached response carries either cookie.
 *
 * The basket's line actions (item 4, TASK-348): `removeLine`, `updateLine`, `useNextDate`. Every
 * form posts the line's position as `line`.
 */
"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { isLocaleCode } from "@/config/locales";

import {
  BASKET_COOKIE_ATTRIBUTES,
  BASKET_COOKIE_NAME,
  CHECKOUT_COOKIE_ATTRIBUTES,
  CHECKOUT_COOKIE_NAME,
  isDraftToken,
} from "./cookie";
import { runPlaceOrder } from "./place";
import {
  type StepContext,
  type StepOutcome,
  type StepState,
  runCardAndBuyerStep,
  runRecipientStep,
  runRemoveLine,
  runUpdateLine,
  runUpdateSelection,
  runUseNextDate,
} from "./steps";

/** The bound locale, parsed like every other input (an unknown one renders the expired state). */
const BoundLocaleSchema = z.string().refine(isLocaleCode);

async function context(locale: string): Promise<StepContext> {
  const value = (await cookies()).get(CHECKOUT_COOKIE_NAME)?.value ?? null;
  return { locale, token: isDraftToken(value) ? value : null };
}

async function answer(
  outcome: StepOutcome,
  token: string | null,
): Promise<StepState> {
  if (outcome.kind === "render") return outcome.state;
  const jar = await cookies();
  if (token !== null && outcome.basketCount !== 0) {
    jar.set(CHECKOUT_COOKIE_NAME, token, CHECKOUT_COOKIE_ATTRIBUTES);
  }
  if (outcome.basketCount !== undefined) {
    if (outcome.basketCount === 0) jar.delete(BASKET_COOKIE_NAME);
    else {
      jar.set(
        BASKET_COOKIE_NAME,
        String(outcome.basketCount),
        BASKET_COOKIE_ATTRIBUTES,
      );
    }
  }
  redirect(outcome.location);
}

/** Step 1, "Who are the flowers for?" */
export async function saveRecipientStep(
  locale: unknown,
  _previous: StepState,
  form: FormData,
): Promise<StepState> {
  const bound = BoundLocaleSchema.safeParse(locale);
  if (!bound.success) return { status: "expired" };
  const ctx = await context(bound.data);
  return answer(await runRecipientStep(ctx, form), ctx.token);
}

/** Step 2, "Your card and your details". */
export async function saveCardAndBuyerStep(
  locale: unknown,
  _previous: StepState,
  form: FormData,
): Promise<StepState> {
  const bound = BoundLocaleSchema.safeParse(locale);
  if (!bound.success) return { status: "expired" };
  const ctx = await context(bound.data);
  return answer(await runCardAndBuyerStep(ctx, form), ctx.token);
}

/** The summary panel's tier, add-on and date edits, and the price notice's confirmation. */
export async function updateSelection(
  locale: unknown,
  _previous: StepState,
  form: FormData,
): Promise<StepState> {
  const bound = BoundLocaleSchema.safeParse(locale);
  if (!bound.success) return { status: "expired" };
  const ctx = await context(bound.data);
  return answer(await runUpdateSelection(ctx, form), ctx.token);
}

/** Remove one line from the basket (item 4). */
export async function removeLineAction(
  locale: unknown,
  _previous: StepState,
  form: FormData,
): Promise<StepState> {
  const bound = BoundLocaleSchema.safeParse(locale);
  if (!bound.success) return { status: "expired" };
  const ctx = await context(bound.data);
  return answer(await runRemoveLine(ctx, form), ctx.token);
}

/** Change one line's size and add-ons from the basket (item 4). */
export async function updateLineAction(
  locale: unknown,
  _previous: StepState,
  form: FormData,
): Promise<StepState> {
  const bound = BoundLocaleSchema.safeParse(locale);
  if (!bound.success) return { status: "expired" };
  const ctx = await context(bound.data);
  return answer(await runUpdateLine(ctx, form), ctx.token);
}

/** "Use {next}" for one line whose date has gone (D8, AC-60). */
export async function useNextDateAction(
  locale: unknown,
  _previous: StepState,
  form: FormData,
): Promise<StepState> {
  const bound = BoundLocaleSchema.safeParse(locale);
  if (!bound.success) return { status: "expired" };
  const ctx = await context(bound.data);
  return answer(await runUseNextDate(ctx, form), ctx.token);
}

/** Step 3's place control (TASK-205): one purchase for the basket, then the confirmation. */
export async function placeOrderAction(
  locale: unknown,
  _previous: StepState,
  form: FormData,
): Promise<StepState> {
  const bound = BoundLocaleSchema.safeParse(locale);
  if (!bound.success) return { status: "expired" };
  const ctx = await context(bound.data);
  return answer(await runPlaceOrder(ctx, form), ctx.token);
}
