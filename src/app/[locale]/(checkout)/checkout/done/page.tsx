/**
 * `/{locale}/checkout/done` (spec 010 §2 "Confirmation", §6; AC-29, AC-30, AC-46, AC-68;
 * TASK-206). Thin: `confirmationFor()` reads the purchase the `fo_checkout` cookie leads to (no
 * token in the URL) and `ConfirmationPage` draws the state registered for its orders' mode, or
 * "no longer available" with status 200 and no order data. `no-store`, `noindex, nofollow`, no
 * canonical, hreflang or JSON-LD.
 */
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactElement } from "react";

import { isLocaleCode } from "@/config/locales";
import {
  CHECKOUT_COOKIE_NAME,
  confirmationFor,
  isDraftToken,
} from "@/modules/checkout";
import { TRANSACTIONAL_ROBOTS_META } from "@/modules/seo";
import { PAGE_FRAME } from "@/modules/ui";
import { ConfirmationPage } from "@/modules/ui/checkout";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface DoneParams {
  readonly params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: DoneParams): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocaleCode(locale)) return { robots: TRANSACTIONAL_ROBOTS_META };
  const t = await getTranslations({ locale, namespace: "checkout" });
  return { title: t("summary.title"), robots: TRANSACTIONAL_ROBOTS_META };
}

export default async function CheckoutDonePage({
  params,
}: DoneParams): Promise<ReactElement> {
  const { locale } = await params;
  if (!isLocaleCode(locale)) notFound();
  setRequestLocale(locale);
  const value = (await cookies()).get(CHECKOUT_COOKIE_NAME)?.value ?? null;
  const confirmation = await confirmationFor(
    isDraftToken(value) ? value : null,
  );
  return (
    <main className={PAGE_FRAME} id="main">
      <ConfirmationPage confirmation={confirmation} locale={locale} />
    </main>
  );
}
