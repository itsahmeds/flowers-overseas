/**
 * The reminders page's three server actions (spec 018 §14 A-founder-2026-10-22 C.7.4, C.12, C.16
 * accessibility; AC-56, AC-58, AC-62; TASK-353). Each re-checks the buyer session and the
 * `account.open` and `account.reminders` flags; Next checks the origin. Each answers a 303 back to
 * the page with a state or an error code in the query, never a date, a name or an id of a person,
 * so every form works with JavaScript off.
 *
 *  - `addReminderAction`: `createReminder` with the posted occasion, day, month, lead time,
 *    optional saved recipient and, while consent is off, the box (`consent=on` becomes
 *    `consent: true`; absent, nothing is written).
 *  - `removeReminderAction`: `removeReminder` under the buyer's `customer` context (RLS).
 *  - `turnOffRemindersAction`: step `review` draws the confirm `<dialog>`; step `confirm` runs
 *    `setReminderConsent({ on: false })`: consent off, the withdrawal in `consent_log`, every
 *    reminder deleted (AC-58).
 */
"use server";

import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { getBuyerContext, signInHref } from "@/lib/auth/buyer";
import {
  createReminder,
  removeReminder,
  setReminderConsent,
} from "@/modules/customers";

import {
  accountLocale,
  accountOpen,
  asCustomerAccount,
  asSystemAccount,
  remindersOpen,
  remindersPath,
} from "../_parts/account-request";

const BoundSchema = z.string().max(32).catch("");
const PostedFormSchema = z.instanceof(FormData).nullable().catch(null);

/** The add form as posted: native selects, a radio group and a box, all strings. */
const AddFormSchema = z
  .object({
    occasion: z.string().max(32),
    day: z.coerce.number().int(),
    month: z.coerce.number().int(),
    lead: z.coerce.number().int(),
    recipient: z
      .string()
      .max(64)
      .transform((value) => (value === "" ? null : value)),
    consent: z.literal("on").optional(),
  })
  .strict();

const RemoveFormSchema = z.object({ id: z.uuid() }).strict();
const OffFormSchema = z
  .object({ step: z.enum(["review", "confirm"]) })
  .strict();

function field(form: FormData | null, name: string): string | undefined {
  const value = form?.get(name);
  return typeof value === "string" ? value : undefined;
}

/** The session's context for a reminders action, or the answer that ends it. */
async function guard(boundLocale: string) {
  const locale = accountLocale(BoundSchema.parse(boundLocale));
  if (locale === null || !(await accountOpen(locale))) notFound();
  if (!(await remindersOpen())) notFound();
  const path = remindersPath(locale);
  const context = await getBuyerContext();
  if (context === null) redirect(signInHref(locale, path));
  return { path, context };
}

function withQuery(path: string, query: Record<string, string>): string {
  return `${path}?${new URLSearchParams(query).toString()}`;
}

export async function addReminderAction(
  boundLocale: string,
  form: FormData,
): Promise<never> {
  const { path, context } = await guard(boundLocale);
  const posted = PostedFormSchema.parse(form);
  const parsed = AddFormSchema.safeParse({
    occasion: field(posted, "occasion") ?? "",
    day: field(posted, "day") ?? "",
    month: field(posted, "month") ?? "",
    lead: field(posted, "lead") ?? "",
    recipient: field(posted, "recipient") ?? "",
    consent: field(posted, "consent"),
  });
  if (!parsed.success) redirect(withQuery(path, { error: "date" }));
  const outcome = await createReminder(
    { run: asCustomerAccount(context), system: asSystemAccount },
    context.customerId,
    {
      occasionKey: parsed.data.occasion,
      day: parsed.data.day,
      month: parsed.data.month,
      leadDays: parsed.data.lead,
      savedRecipientId: parsed.data.recipient,
      ...(parsed.data.consent === "on" ? { consent: true } : {}),
    },
    new Date(),
  );
  if (outcome === "created") redirect(withQuery(path, { state: "saved" }));
  if (outcome === "consent_required") {
    redirect(withQuery(path, { error: "consent" }));
  }
  if (outcome === "limit") redirect(withQuery(path, { error: "limit" }));
  redirect(withQuery(path, { error: "date" }));
}

export async function removeReminderAction(
  boundLocale: string,
  form: FormData,
): Promise<never> {
  const { path, context } = await guard(boundLocale);
  const posted = PostedFormSchema.parse(form);
  const parsed = RemoveFormSchema.safeParse({ id: field(posted, "id") });
  if (!parsed.success) redirect(path);
  const removed = await removeReminder(
    asCustomerAccount(context),
    context.customerId,
    parsed.data.id,
  );
  redirect(removed ? withQuery(path, { state: "removed" }) : path);
}

export async function turnOffRemindersAction(
  boundLocale: string,
  form: FormData,
): Promise<never> {
  const { path, context } = await guard(boundLocale);
  const posted = PostedFormSchema.parse(form);
  const parsed = OffFormSchema.safeParse({ step: field(posted, "step") });
  if (!parsed.success) redirect(path);
  if (parsed.data.step === "review") {
    redirect(withQuery(path, { confirm: "off" }));
  }
  await setReminderConsent(
    asSystemAccount,
    context.customerId,
    { on: false },
    new Date(),
  );
  redirect(withQuery(path, { state: "off" }));
}
