/**
 * @purpose The buyer's one order: timeline, recipient, documents, Cancel for free
 * @spec 018
 *
 * `/{locale}/account/orders/{reference}` (spec 018 §5.3, §14 C.7.1, C.13; AC-10, AC-23 owner
 * half, AC-25 as amended, AC-26, AC-28 account half, AC-34; TASK-344). Without a buyer session:
 * 303 to `/{locale}/account` with this path as the return path (AC-25, AC-50). The reference is
 * read under the buyer's `customer` context, so another customer's order, a `demo` order or an
 * unknown reference is a 404 (RLS, not only an application check). `?cancel=` draws the cancel
 * dialog or the refusal (`./actions.ts`). With `account.open` off: 404. While
 * `account.recipients` is on, the recipient card offers the save box (TASK-352, AC-54): absent for
 * a hospital, funeral home or cemetery and after the sweep; "Saved" once a copy exists;
 * `?save=limit` draws the limit line.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactElement } from "react";
import { z } from "zod";

import { requireBuyerContext } from "@/lib/auth/buyer";
import { recipientSaveOffer } from "@/modules/customers";
import {
  accountOrderDetail,
  ownedOrderIds,
} from "@/modules/orders/account-orders";
import { transactionalMetadata } from "@/modules/seo";

import {
  accountLocale,
  accountOpen,
  asCustomer,
  asCustomerAccount,
  listedModes,
  orderDetailPath,
  recipientsOpen,
} from "../../_parts/account-request";
import { OrderDetailView } from "./OrderDetailView";

export const dynamic = "force-dynamic";

interface DetailParams {
  params: Promise<{ locale: string; reference: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const QuerySchema = z.object({
  cancel: z.enum(["review", "refused"]).nullable().catch(null).default(null),
  save: z.enum(["limit"]).nullable().catch(null).default(null),
});

export async function generateMetadata({
  params,
}: DetailParams): Promise<Metadata> {
  const locale = accountLocale((await params).locale);
  if (locale === null) return {};
  const t = await getTranslations({ locale, namespace: "auth" });
  return transactionalMetadata("trackOrder", t("account.title"));
}

export default async function AccountOrderRoute({
  params,
  searchParams,
}: DetailParams): Promise<ReactElement> {
  const { locale: requested, reference } = await params;
  const locale = accountLocale(requested);
  if (locale === null) notFound();
  setRequestLocale(locale);
  if (!(await accountOpen(locale))) notFound();
  const context = await requireBuyerContext(
    locale,
    orderDetailPath(locale, reference),
  );
  const [orderId] = await ownedOrderIds(
    asCustomer(context),
    listedModes(),
    reference,
  );
  if (orderId === undefined) notFound();
  const detail = await accountOrderDetail(orderId, { locale });
  const { cancel, save } = QuerySchema.parse(await searchParams);
  const offer = (await recipientsOpen())
    ? await recipientSaveOffer(
        asCustomerAccount(context),
        context.customerId,
        orderId,
      )
    : "not_offered";
  return (
    <OrderDetailView
      cancelState={cancel}
      detail={detail}
      locale={locale}
      saveState={save === "limit" && offer === "offered" ? "limit" : offer}
    />
  );
}
