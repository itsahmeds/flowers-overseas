/**
 * `/{locale}/checkout` (spec 010 §2 "The checkout: three steps on one URL", §5.4, §6; AC-3, AC-7,
 * AC-13, AC-30; §14 A-founder-2026-10-22 item 5; TASK-204). Thin: `checkoutScreen()` decides the
 * screen from the `fo_checkout` cookie and `?step=`/`&line=`, `modules/ui/checkout` draws it, and
 * every form posts to `checkoutAction`.
 *
 * Server-rendered per request and never cached (`force-dynamic`; the header rule adds
 * `Cache-Control: no-store` and `X-Robots-Tag: noindex, nofollow`); the robots meta is the same
 * directive; no canonical, no hreflang alternate, no JSON-LD (AC-30).
 */
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactElement } from "react";

import { isLocaleCode } from "@/config/locales";
import {
  CHECKOUT_COOKIE_NAME,
  checkoutScreen,
  isDraftToken,
} from "@/modules/checkout";
import { TRANSACTIONAL_ROBOTS_META } from "@/modules/seo";
import { PAGE_FRAME } from "@/modules/ui";
import { CheckoutStatePage, CheckoutStepPage } from "@/modules/ui/checkout";

import { checkoutAction } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface CheckoutParams {
  readonly params: Promise<{ locale: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  params,
}: Pick<CheckoutParams, "params">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocaleCode(locale)) return { robots: TRANSACTIONAL_ROBOTS_META };
  const t = await getTranslations({ locale, namespace: "checkout" });
  return { title: t("summary.title"), robots: TRANSACTIONAL_ROBOTS_META };
}

function one(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export default async function CheckoutPage({
  params,
  searchParams,
}: CheckoutParams): Promise<ReactElement> {
  const { locale } = await params;
  if (!isLocaleCode(locale)) notFound();
  setRequestLocale(locale);
  const query = await searchParams;
  const value = (await cookies()).get(CHECKOUT_COOKIE_NAME)?.value ?? null;
  const screen = await checkoutScreen({
    locale,
    token: isDraftToken(value) ? value : null,
    step: one(query["step"]),
    line: one(query["line"]),
  });
  if (screen.kind === "placed") redirect(`/${locale}/checkout/done`);
  return (
    <main className={PAGE_FRAME} id="main">
      {screen.kind === "step" ? (
        <CheckoutStepPage action={checkoutAction} screen={screen} />
      ) : (
        <CheckoutStatePage locale={locale} screen={screen} />
      )}
    </main>
  );
}
