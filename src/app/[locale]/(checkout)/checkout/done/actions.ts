/**
 * The confirmation's one server action: the buyer's free cancel (spec 018 §5.2
 * `cancelOrderAsBuyer`; AC-28 confirmation half; TASK-340). Thin glue around `runBuyerCancel`
 * (`./buyer-cancel.ts`): the line's form binds the page's locale and the delivery's reference; the
 * order is resolved from the `fo_checkout` cookie, never from a posted id, and the step is the
 * pressed button's value. Answers a 303 back to `/{locale}/checkout/done`, or 404 (`notFound()`).
 * Works with JavaScript off (a native POST of the form); Next's server actions keep their own
 * `Origin` check. Only the action is exported: every export of a `"use server"` file is an
 * endpoint.
 */
"use server";

import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { isLocaleCode } from "@/config/locales";
import {
  CHECKOUT_COOKIE_NAME,
  confirmationFor,
  isDraftToken,
} from "@/modules/checkout";
import { routableLocale } from "@/modules/i18n";
import { cancelOrderAsBuyer } from "@/modules/orders/buyer-cancel";

import { runBuyerCancel } from "./buyer-cancel";

/** The bound locale: a short string; anything else lands on the site root. */
const BoundLocaleSchema = z.string().max(16).catch("");
/** The post itself: form data, or nothing to read. */
const PostedFormSchema = z.instanceof(FormData).nullable().catch(null);

export async function cancelOrderAsBuyerAction(
  locale: string,
  reference: string,
  form: FormData,
): Promise<never> {
  const code = routableLocale(BoundLocaleSchema.parse(locale))?.code;
  if (code === undefined || !isLocaleCode(code)) redirect("/");
  const data = PostedFormSchema.parse(form);
  const value = (await cookies()).get(CHECKOUT_COOKIE_NAME)?.value ?? null;
  const answer = await runBuyerCancel(
    { locale: code, reference, step: data?.get("step") ?? null },
    {
      confirmation: () => confirmationFor(isDraftToken(value) ? value : null),
      cancel: (input) => cancelOrderAsBuyer(input),
    },
  );
  if (answer.kind === "not_found") notFound();
  redirect(answer.to);
}
