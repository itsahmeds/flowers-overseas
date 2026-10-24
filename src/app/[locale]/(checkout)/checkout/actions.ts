/**
 * The checkout page's one server action (spec 010 §5.2, §5.3; TASK-204, TASK-205). Thin glue:
 * every form on `/{locale}/checkout` posts here with its routing fields
 * (`CHECKOUT_FORM_FIELDS`); this strips them, maps the side forms' buttons onto the step
 * schemas, and calls the module's action (`saveRecipientStep`, `saveCardAndBuyerStep`,
 * `updateSelection`, `useNextDateAction`, `placeOrderAction`).
 *
 * Every post answers with a 303. A saved one goes where the module sends it. A refused one goes
 * back to the screen it came from with its echo in the `fo_checkout_echo` cookie
 * (`modules/checkout/echo.ts`): the posted values, each field's message, the sample details or
 * the cap notice, which the page draws on that screen. The same path serves JavaScript on and off,
 * and the form holds no client state. Each post first deletes the previous echo.
 */
"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { z } from "zod";

import { type LocaleCode, isLocaleCode } from "@/config/locales";
import {
  CHECKOUT_COOKIE_NAME,
  CHECKOUT_ECHO_COOKIE_NAME,
  type CheckoutEchoInput,
  checkoutEchoCookieAttributes,
  checkoutScreen,
  encodeCheckoutEcho,
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
  SAMPLE_INTENT,
} from "@/modules/ui/checkout";

import { sampleValues } from "../_views/CheckoutView";

const ROUTING = new Set<string>(Object.values(CHECKOUT_FORM_FIELDS));
const IDLE = { status: "idle" } as const;

/**
 * The routing fields, parsed before anything else is read. Every other field is parsed by the
 * step's own `.strict()` schema in the module's runner.
 */
const RoutingSchema = z.object({
  [CHECKOUT_FORM_FIELDS.locale]: z.string().refine(isLocaleCode),
  [CHECKOUT_FORM_FIELDS.intent]: z.enum(CHECKOUT_FORM_INTENTS),
  [CHECKOUT_FORM_FIELDS.step]: z.string().max(16).optional(),
  [CHECKOUT_FORM_FIELDS.line]: z.string().max(4).optional(),
});

/** The posted body is a form; its fields are the step schemas' to parse. */
const PostedFormSchema = z.instanceof(FormData);

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

function screenPath(
  locale: LocaleCode,
  screen: { readonly step: string; readonly line: number },
): string {
  return `/${locale}/checkout?step=${screen.step}&line=${String(screen.line)}`;
}

/** Writes the echo and answers with a 303 to the screen it names. */
async function echoTo(
  locale: LocaleCode,
  echo: CheckoutEchoInput,
): Promise<never> {
  const encoded = encodeCheckoutEcho(echo);
  if (encoded !== null) {
    (await cookies()).set(
      CHECKOUT_ECHO_COOKIE_NAME,
      encoded,
      checkoutEchoCookieAttributes(locale),
    );
  }
  redirect(screenPath(locale, echo));
}

export async function checkoutAction(form: FormData): Promise<void> {
  const routing = RoutingSchema.safeParse(Object.fromEntries(form.entries()));
  if (!routing.success) return;
  const locale = routing.data[CHECKOUT_FORM_FIELDS.locale] as LocaleCode;
  const intent = routing.data[CHECKOUT_FORM_FIELDS.intent];
  setRequestLocale(locale);
  (await cookies()).delete({
    name: CHECKOUT_ECHO_COOKIE_NAME,
    path: checkoutEchoCookieAttributes(locale).path,
  });
  const step = routing.data[CHECKOUT_FORM_FIELDS.step];
  const line = routing.data[CHECKOUT_FORM_FIELDS.line];
  const posted = stripped(PostedFormSchema.parse(form));

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
    await echoTo(locale, {
      step: screen.step,
      line: screen.line,
      values: { ...values, ...sampleValues(screen) },
      errors: {},
      attempt: 0,
    });
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
      await echoTo(locale, {
        step: state.step,
        line: state.line,
        values: state.values,
        errors: state.errors,
        attempt: Date.now(),
      });
      return;
    }
    case "refused": {
      const screen = await screenFor(locale, "review", undefined);
      if (screen.kind !== "step") redirect(`/${locale}/checkout`);
      await echoTo(locale, {
        step: screen.step,
        line: screen.line,
        values: {},
        errors: {},
        attempt: Date.now(),
        refused: state.reason,
      });
      return;
    }
    default:
      // Expired, closed or idle: the page itself draws that state.
      redirect(`/${locale}/checkout`);
  }
}
