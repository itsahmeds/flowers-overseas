/**
 * The saved-recipients page's one server action: Remove, in two steps (spec 018 §14 C.7.3, C.12,
 * C.16 accessibility; AC-55, AC-62; TASK-352). It re-checks the buyer session and the
 * `account.recipients` flag; Next checks the origin. Step `review` answers a 303 to
 * `?remove={id}`, which draws the confirm `<dialog>`; step `confirm` deletes the row under the
 * buyer's `customer` context (another customer's id deletes nothing, RLS) and answers a 303 to
 * `?state=removed`. Both work with JavaScript off. The URL carries the row's id, never a name.
 */
"use server";

import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { getBuyerContext, signInHref } from "@/lib/auth/buyer";
import { removeSavedRecipient } from "@/modules/customers";

import {
  accountLocale,
  accountOpen,
  asCustomerAccount,
  recipientsOpen,
  recipientsPath,
} from "../_parts/account-request";

const BoundSchema = z.string().max(32).catch("");
const PostedFormSchema = z.instanceof(FormData).nullable().catch(null);
const RemoveFormSchema = z
  .object({ step: z.enum(["review", "confirm"]), id: z.uuid() })
  .strict();

export async function removeRecipientAction(
  boundLocale: string,
  form: FormData,
): Promise<never> {
  const locale = accountLocale(BoundSchema.parse(boundLocale));
  if (locale === null || !(await accountOpen(locale))) notFound();
  if (!(await recipientsOpen())) notFound();
  const path = recipientsPath(locale);
  const context = await getBuyerContext();
  if (context === null) redirect(signInHref(locale, path));
  const posted = PostedFormSchema.parse(form);
  const parsed = RemoveFormSchema.safeParse({
    step: posted?.get("step"),
    id: posted?.get("id"),
  });
  if (!parsed.success) redirect(path);
  if (parsed.data.step === "review") {
    redirect(
      `${path}?${new URLSearchParams({ remove: parsed.data.id }).toString()}`,
    );
  }
  const removed = await removeSavedRecipient(
    asCustomerAccount(context),
    context.customerId,
    parsed.data.id,
  );
  redirect(removed ? `${path}?state=removed` : path);
}
