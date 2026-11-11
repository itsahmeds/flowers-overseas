/**
 * The details page's two server actions (spec 018 §14 A-founder-2026-10-22 C.7.2, C.10, C.12;
 * AC-53, AC-62; TASK-352). Each re-checks the buyer session on the server; Next checks the origin.
 *
 *  - `saveDetailsAction` (the form's `useActionState` action, so it works with JavaScript off):
 *    the posted fields through `parseDetailsForm` (Zod, spec 003's phone parser); a refusal saves
 *    nothing and answers each field's message; a save writes the customer's row under the buyer's
 *    `customer` context (RLS) and, when a currency is chosen, sets `fo_currency` on this response
 *    only. A preference never redirects and never changes a URL.
 *  - `signOutEverywhereAction`: every `sessions` row of the user goes (the core's
 *    `signOutEverywhere`), this browser's cookie is expired, and the page lands on
 *    `/{locale}/account?state=signed-out`.
 *
 * No name, phone, email or token reaches a log line or a URL.
 */
"use server";

import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { buyerAuth, getBuyerContext, signInHref } from "@/lib/auth/buyer";
import { saveDetails } from "@/modules/customers";

import {
  accountLocale,
  accountOpen,
  asCustomerAccount,
  detailsPath,
} from "../_parts/account-request";
import {
  DETAILS_FIELDS,
  detailsFieldId,
  type DetailsField,
  type DetailsFormError,
  type DetailsFormState,
} from "./details-fields";
import { DETAILS_ERROR_KEY, NAME_MAX, parseDetailsForm } from "./details-form";

/** The label of each field in the summary ("Your phone: …"). */
const FIELD_LABEL_KEY = {
  buyerName: "checkout.buyer.fullName",
  buyerPhone: "checkout.buyer.phone",
  residenceCountry: "checkout.buyer.country",
  preferredLocale: "account.details.language",
  preferredCurrency: "account.details.currency",
} as const satisfies Record<DetailsField, string>;

/** The currency cookie (`src/config/cookies.ts`, spec 008): the ISO code, one year. */
const CURRENCY_COOKIE = "fo_currency";
const CURRENCY_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

const BoundSchema = z.string().max(32).catch("");
const PostedFormSchema = z.instanceof(FormData).nullable().catch(null);

export async function saveDetailsAction(
  boundLocale: string,
  previous: DetailsFormState,
  form: FormData,
): Promise<DetailsFormState> {
  const locale = accountLocale(BoundSchema.parse(boundLocale));
  if (locale === null || !(await accountOpen(locale))) notFound();
  const context = await getBuyerContext();
  if (context === null) redirect(signInHref(locale, detailsPath(locale)));
  const attempt = previous.attempt + 1;
  const parsed = parseDetailsForm(PostedFormSchema.parse(form));
  if (!parsed.ok) {
    const t = await getTranslations({ locale, namespace: "checkout" });
    const all = await getTranslations({ locale });
    const errors: DetailsFormError[] = [];
    for (const field of DETAILS_FIELDS) {
      const code = parsed.errors[field];
      if (code === undefined) continue;
      const message = t(DETAILS_ERROR_KEY[code], { max: NAME_MAX });
      errors.push({
        field,
        fieldId: detailsFieldId(field),
        message,
        summary: t("error.summaryItem", {
          field: all(FIELD_LABEL_KEY[field]),
          message,
        }),
      });
    }
    return { status: "invalid", attempt, values: parsed.values, errors };
  }
  const saved = await saveDetails(
    asCustomerAccount(context),
    context.customerId,
    parsed.input,
  );
  if (!saved) notFound();
  if (parsed.input.preferredCurrency !== null) {
    (await cookies()).set(CURRENCY_COOKIE, parsed.input.preferredCurrency, {
      path: "/",
      sameSite: "lax",
      secure: process.env["NODE_ENV"] === "production",
      maxAge: CURRENCY_COOKIE_MAX_AGE,
    });
  }
  return { status: "saved", attempt, values: parsed.values, errors: [] };
}

export async function signOutEverywhereAction(
  boundLocale: string,
): Promise<never> {
  const locale = accountLocale(BoundSchema.parse(boundLocale));
  if (locale === null || !(await accountOpen(locale))) notFound();
  const context = await getBuyerContext();
  if (context === null) redirect(signInHref(locale));
  await buyerAuth.signOutEverywhere(context.userId);
  (await cookies()).set(buyerAuth.cookies.sessionToken, "", {
    path: "/",
    maxAge: 0,
    secure: true,
    httpOnly: true,
    sameSite: "lax",
  });
  redirect(`/${locale}/account?state=signed-out`);
}
