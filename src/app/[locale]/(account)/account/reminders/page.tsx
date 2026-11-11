/**
 * @purpose The buyer's occasion reminders: consent, list, add, turn off
 * @spec 018
 *
 * `/{locale}/account/reminders` (`account-reminders-*`; spec 018 §14 A-founder-2026-10-22 C.7.4,
 * C.13; AC-56, AC-58, AC-25 as amended, AC-34; TASK-353). Without a buyer session: 303 to
 * `/{locale}/account` with this path as the return path. The consent and the rows are read under
 * the buyer's `customer` context, so only theirs are listed (RLS); the saved recipients offered
 * under "For" likewise, and only while `account.recipients` is on. `?state=` draws the saved,
 * removed or turned-off line, `?error=` the add form's message, `?confirm=off` the turn-off dialog.
 * With `account.open` or `account.reminders` off: 404 (stored rows are kept).
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactElement } from "react";
import { z } from "zod";

import { requireBuyerContext } from "@/lib/auth/buyer";
import { listSavedRecipients, readReminders } from "@/modules/customers";
import { transactionalMetadata } from "@/modules/seo";

import {
  accountLocale,
  accountOpen,
  asCustomerAccount,
  recipientsOpen,
  remindersOpen,
  remindersPath,
} from "../_parts/account-request";
import { RemindersView } from "./RemindersView";

export const dynamic = "force-dynamic";

interface RemindersParams {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const QuerySchema = z.object({
  state: z
    .enum(["saved", "removed", "off"])
    .nullable()
    .catch(null)
    .default(null),
  error: z
    .enum(["consent", "date", "limit"])
    .nullable()
    .catch(null)
    .default(null),
  confirm: z.enum(["off"]).nullable().catch(null).default(null),
});

export async function generateMetadata({
  params,
}: RemindersParams): Promise<Metadata> {
  const locale = accountLocale((await params).locale);
  if (locale === null) return {};
  const t = await getTranslations({ locale, namespace: "account" });
  return transactionalMetadata("trackOrder", t("nav.reminders"));
}

export default async function AccountRemindersRoute({
  params,
  searchParams,
}: RemindersParams): Promise<ReactElement> {
  const locale = accountLocale((await params).locale);
  if (locale === null) notFound();
  setRequestLocale(locale);
  if (!(await accountOpen(locale)) || !(await remindersOpen())) notFound();
  const context = await requireBuyerContext(locale, remindersPath(locale));
  const run = asCustomerAccount(context);
  const state = await readReminders(run, context.customerId);
  if (state === null) notFound();
  const recipients = (await recipientsOpen())
    ? await listSavedRecipients(run, context.customerId)
    : [];
  const query = QuerySchema.parse(await searchParams);
  return (
    <RemindersView
      confirmingOff={query.confirm === "off" && state.consent}
      consent={state.consent}
      error={query.error}
      locale={locale}
      recipients={recipients.map((row) => ({
        id: row.id,
        name: row.fullName,
      }))}
      reminders={state.reminders}
      status={query.state}
    />
  );
}
