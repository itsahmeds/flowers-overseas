/**
 * @purpose The buyer account: sign-in form without a session, the order list with one
 * @spec 018
 *
 * `/{locale}/account` (spec 018 §14 A-founder-2026-10-22 C.5, C.7.1, C.13; AC-10 account list,
 * AC-25 as amended, AC-34, AC-51; TASK-344). One page that is the sign-in and the account, and it
 * never redirects: a visitor without a buyer session gets the sign-in form (200), a signed-in buyer
 * the order list. Every order listed is one row-level security admits under the buyer's `customer`
 * context (`ownedOrderIds`); `live` only in production. With `account.open` off for the locale the
 * page is a 404 (AC-34).
 *
 * SSR per request (`force-dynamic`, it reads the buyer cookie, C.10 / AC-36's allowed read
 * paths); `next.config.ts` adds `X-Robots-Tag: noindex, nofollow`, `private, no-store` and
 * `no-referrer` (`accountHeaderRules()`); the metadata is the title and the robots meta, no
 * canonical and no alternate (C.14). `robots.txt` allows this one URL so a crawler reads its
 * `noindex`, and disallows everything below it.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactElement } from "react";
import { z } from "zod";

import { getBuyerContext, isBuyerReturnPath } from "@/lib/auth/buyer";
import {
  accountOrderRows,
  ownedOrderIds,
} from "@/modules/orders/account-orders";
import { transactionalMetadata } from "@/modules/seo";

import {
  accountLocale,
  accountOpen,
  asCustomer,
  listedModes,
} from "./_parts/account-request";
import { AccountShell } from "./_parts/AccountShell";
import { OrdersView } from "./_parts/OrdersView";
import { SignInView } from "./_parts/SignInView";

export const dynamic = "force-dynamic";

interface AccountParams {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const QuerySchema = z.object({
  state: z
    .enum(["sent", "expired", "signed-out", "invalid"])
    .optional()
    .catch(undefined),
  return: z
    .string()
    .max(512)
    .refine((path) => isBuyerReturnPath(path))
    .optional()
    .catch(undefined),
});

export async function generateMetadata({
  params,
}: AccountParams): Promise<Metadata> {
  const locale = accountLocale((await params).locale);
  if (locale === null) return {};
  const t = await getTranslations({ locale, namespace: "auth" });
  // The account is a transactional page like the tracking page: title and robots meta only.
  return transactionalMetadata("trackOrder", t("account.title"));
}

export default async function AccountRoute({
  params,
  searchParams,
}: AccountParams): Promise<ReactElement> {
  const locale = accountLocale((await params).locale);
  if (locale === null) notFound();
  setRequestLocale(locale);
  if (!(await accountOpen(locale))) notFound();
  const context = await getBuyerContext();
  if (context === null) {
    const query = QuerySchema.parse(await searchParams);
    return (
      <SignInView locale={locale} returnTo={query.return} state={query.state} />
    );
  }
  const ids = await ownedOrderIds(asCustomer(context), listedModes());
  const rows = await accountOrderRows(ids, { locale });
  return (
    <AccountShell current="orders" locale={locale}>
      <OrdersView locale={locale} rows={rows} />
    </AccountShell>
  );
}
