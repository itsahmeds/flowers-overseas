/**
 * @purpose The buyer's details: name, phone, country, email language, currency
 * @spec 018
 *
 * `/{locale}/account/details` (`account-details-*`; spec 018 §14 A-founder-2026-10-22 C.7.2,
 * C.13; AC-53, AC-25 as amended, AC-34; TASK-352). Without a buyer session: 303 to
 * `/{locale}/account` with this path as the return path. The customer's row is read under the
 * buyer's `customer` context (RLS). The form saves through `./actions.ts`; "Sign out on all
 * devices" is its own card with a ghost button. With `account.open` off: 404.
 *
 * SSR per request (`force-dynamic`); `next.config.ts` adds `noindex, nofollow`, `private,
 * no-store` and `no-referrer` below `/{locale}/account` (`accountHeaderRules()`); the metadata is
 * the title and the robots meta, no canonical and no alternate (C.14).
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactElement } from "react";

import { localeConfig } from "@/config/locales";
import { requireBuyerContext } from "@/lib/auth/buyer";
import { internationalPhone } from "@/modules/checkout";
import { readAccountDetails } from "@/modules/customers";
import { transactionalMetadata } from "@/modules/seo";

import {
  accountLocale,
  accountOpen,
  asCustomerAccount,
  detailsPath,
} from "../_parts/account-request";
import { DetailsView } from "./DetailsView";

export const dynamic = "force-dynamic";

interface DetailsParams {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: DetailsParams): Promise<Metadata> {
  const locale = accountLocale((await params).locale);
  if (locale === null) return {};
  const t = await getTranslations({ locale, namespace: "account" });
  return transactionalMetadata("trackOrder", t("details.title"));
}

export default async function AccountDetailsRoute({
  params,
}: DetailsParams): Promise<ReactElement> {
  const locale = accountLocale((await params).locale);
  if (locale === null) notFound();
  setRequestLocale(locale);
  if (!(await accountOpen(locale))) notFound();
  const context = await requireBuyerContext(locale, detailsPath(locale));
  const details = await readAccountDetails(
    asCustomerAccount(context),
    context.customerId,
  );
  if (details === null) notFound();
  return (
    <DetailsView
      defaults={{
        buyerName: details.name ?? "",
        buyerPhone:
          details.phoneE164 === null
            ? ""
            : internationalPhone(details.phoneE164),
        residenceCountry: details.countryIso2 ?? "",
        preferredLocale: details.preferredLocale ?? locale,
        preferredCurrency:
          details.preferredCurrency ?? localeConfig(locale).currencyDefault,
      }}
      email={details.email}
      locale={locale}
    />
  );
}
