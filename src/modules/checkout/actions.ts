/**
 * The checkout's server actions (spec 010 §5.2 "Server actions and the route"; TASK-203):
 * `saveRecipientStep`, `saveCardAndBuyerStep`, `updateSelection`. `placeOrderAction` is
 * TASK-205's.
 *
 * Thin: each reads the `fo_checkout` cookie, hands the form to its runner in `steps.ts` (which
 * loads the draft, re-runs the mode, parses, verifies the quote and saves), then answers with a
 * 303 (`redirect()` from a server action is a 303) or the state the step re-renders with. Next's
 * server actions keep their own `Origin` check (§8 "Security").
 *
 * The page binds the request's locale as the first argument
 * (`saveRecipientStep.bind(null, locale)`) and uses the action with `useActionState`, so it works
 * with JavaScript off. A successful save refreshes the cookie's `Max-Age` with the same token, so
 * the cookie lives as long as the draft: 24 hours after the last activity.
 */
"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { isLocaleCode } from "@/config/locales";

import {
  CHECKOUT_COOKIE_ATTRIBUTES,
  CHECKOUT_COOKIE_NAME,
  isDraftToken,
} from "./cookie";
import {
  type StepContext,
  type StepOutcome,
  type StepState,
  runCardAndBuyerStep,
  runRecipientStep,
  runUpdateSelection,
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
  if (token !== null) {
    (await cookies()).set(
      CHECKOUT_COOKIE_NAME,
      token,
      CHECKOUT_COOKIE_ATTRIBUTES,
    );
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
