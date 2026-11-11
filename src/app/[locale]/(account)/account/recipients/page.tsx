/**
 * @purpose The buyer's saved recipients: the list and Remove
 * @spec 018
 *
 * `/{locale}/account/recipients` (`account-recipients-*`; spec 018 §14 A-founder-2026-10-22
 * C.7.3, C.13; AC-55, AC-25 as amended, AC-34; TASK-352). Without a buyer session: 303 to
 * `/{locale}/account` with this path as the return path. The rows are read under the buyer's
 * `customer` context, so only theirs are listed (RLS). `?remove={id}` draws the confirm dialog for
 * one of them; `?state=removed` the removed line. With `account.open` or `account.recipients` off:
 * 404 (stored rows are kept).
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactElement } from "react";
import { z } from "zod";

import { requireBuyerContext } from "@/lib/auth/buyer";
import { listSavedRecipients } from "@/modules/customers";
import { transactionalMetadata } from "@/modules/seo";

import {
  accountLocale,
  accountOpen,
  asCustomerAccount,
  recipientsOpen,
  recipientsPath,
} from "../_parts/account-request";
import { RecipientsView } from "./RecipientsView";

export const dynamic = "force-dynamic";

interface RecipientsParams {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const QuerySchema = z.object({
  remove: z.uuid().nullable().catch(null).default(null),
  state: z.enum(["removed"]).nullable().catch(null).default(null),
});

export async function generateMetadata({
  params,
}: RecipientsParams): Promise<Metadata> {
  const locale = accountLocale((await params).locale);
  if (locale === null) return {};
  const t = await getTranslations({ locale, namespace: "account" });
  return transactionalMetadata("trackOrder", t("nav.recipients"));
}

export default async function AccountRecipientsRoute({
  params,
  searchParams,
}: RecipientsParams): Promise<ReactElement> {
  const locale = accountLocale((await params).locale);
  if (locale === null) notFound();
  setRequestLocale(locale);
  if (!(await accountOpen(locale)) || !(await recipientsOpen())) notFound();
  const context = await requireBuyerContext(locale, recipientsPath(locale));
  const rows = await listSavedRecipients(
    asCustomerAccount(context),
    context.customerId,
  );
  const query = QuerySchema.parse(await searchParams);
  return (
    <RecipientsView
      confirming={rows.find((row) => row.id === query.remove) ?? null}
      locale={locale}
      removed={query.state === "removed"}
      rows={rows}
    />
  );
}
