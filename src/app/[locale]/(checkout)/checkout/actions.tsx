/**
 * The checkout page's one server action (spec 010 §5.2, §5.3; TASK-204, TASK-205). Thin glue:
 * every form on `/{locale}/checkout` posts here with its routing fields
 * (`CHECKOUT_FORM_FIELDS`); this strips them, maps the side forms' buttons onto the step
 * schemas, and calls the module's action (`saveRecipientStep`, `saveCardAndBuyerStep`,
 * `updateSelection`, `useNextDateAction`, `placeOrderAction`). A saved post answers with a 303
 * from inside that call. A refused one comes back here as a state, and the answer is the form's
 * body rendered again on the server with the posted values, each field's message, the sample
 * details or the cap notice (`CheckoutStepBody`, `PlaceArea`), which `StepForm` draws in place:
 * with JavaScript off, in the same POST round trip.
 */
"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";

import { type LocaleCode, isLocaleCode } from "@/config/locales";
import {
  CHECKOUT_COOKIE_NAME,
  checkoutScreen,
  isDraftToken,
  placeOrderAction,
  saveCardAndBuyerStep,
  saveRecipientStep,
  updateSelection,
  useNextDateAction as nextDateAction,
} from "@/modules/checkout";
import {
  CHECKOUT_FORM_FIELDS,
  CHECKOUT_FORM_INTENTS,
  CheckoutStepBody,
  PlaceArea,
  SAMPLE_INTENT,
  sampleValues,
} from "@/modules/ui/checkout";

const ROUTING = new Set<string>(Object.values(CHECKOUT_FORM_FIELDS));
const IDLE = { status: "idle" } as const;

function text(form: FormData, key: string): string | undefined {
  const value = form.get(key);
  return typeof value === "string" ? value : undefined;
}

/** The posted form without the routing fields and Next's own keys. */
function stripped(form: FormData): FormData {
  const clean = new FormData();
  for (const [key, value] of form.entries()) {
    if (ROUTING.has(key) || key.startsWith("$ACTION")) continue;
    clean.append(key, value);
  }
  return clean;
}

/**
 * The side forms' buttons as `SelectionUpdateSchema` reads them: the price notice's
 * `confirmedTotalMinor` is the total the buyer saw (`seenTotalMinor`); an add-on's "Add" or
 * "Remove" button names the add-on (`addAddon` / `removeAddon`).
 */
function selection(form: FormData): FormData {
  const out = new FormData();
  for (const [key, value] of form.entries()) {
    if (key === "confirmedTotalMinor") out.append("seenTotalMinor", value);
    else if (key === "addAddon" || key === "removeAddon") {
      out.append("intent", key);
      out.append("addonKey", value);
    } else out.append(key, value);
  }
  return out;
}

async function token(): Promise<string | null> {
  const value = (await cookies()).get(CHECKOUT_COOKIE_NAME)?.value ?? null;
  return isDraftToken(value) ? value : null;
}

async function screenFor(
  locale: LocaleCode,
  step: string | undefined,
  line: string | undefined,
): Promise<Awaited<ReturnType<typeof checkoutScreen>>> {
  return checkoutScreen({ locale, token: await token(), step, line });
}

export async function checkoutAction(
  _previous: ReactNode,
  form: FormData,
): Promise<ReactNode> {
  const locale = text(form, CHECKOUT_FORM_FIELDS.locale);
  const intent = text(form, CHECKOUT_FORM_FIELDS.intent);
  if (
    locale === undefined ||
    !isLocaleCode(locale) ||
    intent === undefined ||
    !(CHECKOUT_FORM_INTENTS as readonly string[]).includes(intent)
  ) {
    return null;
  }
  setRequestLocale(locale);
  const step = text(form, CHECKOUT_FORM_FIELDS.step);
  const line = text(form, CHECKOUT_FORM_FIELDS.line);
  const posted = stripped(form);

  // "Use sample details" (AC-33): the form drawn again with the destination's sample, nothing
  // saved.
  if (
    (intent === "recipient" || intent === "card") &&
    posted.get(SAMPLE_INTENT.name) === SAMPLE_INTENT.value
  ) {
    const screen = await screenFor(locale, step, line);
    if (screen.kind !== "step") redirect(`/${locale}/checkout`);
    const values: Record<string, string | readonly string[]> = {};
    for (const [key, value] of posted.entries()) {
      if (key !== SAMPLE_INTENT.name && typeof value === "string") {
        values[key] = value;
      }
    }
    return (
      <CheckoutStepBody
        echo={{
          values: { ...values, ...sampleValues(screen) },
          errors: {},
          attempt: 0,
        }}
        screen={screen}
      />
    );
  }

  const state =
    intent === "recipient"
      ? await saveRecipientStep(locale, IDLE, posted)
      : intent === "card"
        ? await saveCardAndBuyerStep(locale, IDLE, posted)
        : intent === "selection"
          ? await updateSelection(locale, IDLE, selection(posted))
          : intent === "useNextDate"
            ? await nextDateAction(locale, IDLE, posted)
            : await placeOrderAction(locale, IDLE, posted);

  switch (state.status) {
    case "invalid": {
      // A side form's refusal (an add-on no longer offered): the page draws the basket as it is.
      if (intent === "selection" || intent === "useNextDate") {
        redirect(`/${locale}/checkout`);
      }
      const screen = await screenFor(locale, state.step, String(state.line));
      if (screen.kind !== "step") redirect(`/${locale}/checkout`);
      return (
        <CheckoutStepBody
          echo={{
            values: state.values,
            errors: state.errors,
            attempt: Date.now(),
          }}
          screen={screen}
        />
      );
    }
    case "refused": {
      const screen = await screenFor(locale, "review", "1");
      if (screen.kind !== "step") redirect(`/${locale}/checkout`);
      return <PlaceArea refused={state.reason} screen={screen} />;
    }
    default:
      // Expired, closed or idle: the page itself draws that state.
      redirect(`/${locale}/checkout`);
  }
}
