import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactElement } from "react";

import { infoPageLocation } from "@/config/info-pages";
import { isLocaleCode } from "@/config/locales";
import { corridorShopEntry } from "@/modules/catalog";
import {
  CHECKOUT_COOKIE_NAME,
  type StepState,
  isDraftToken,
  loadBasketPage,
  removeLineAction,
  updateSelection,
  useNextDateAction as nextDateAction,
} from "@/modules/checkout";
import { missingInfoPageLinkIds } from "@/modules/content";
import { localePath, routableLocale } from "@/modules/i18n";
import { transactionalMetadata } from "@/modules/seo";

import { BasketView } from "./BasketView";

/**
 * `/{locale}/basket` (spec 010 §14 A-founder-2026-10-22 item 6, D5, D8, items 8 and 12; AC-57,
 * AC-72, AC-73, AC-76; `plan/05` row 18; TASK-349). Thin: it reads the `fo_checkout` cookie, the
 * URL's locale and the clock, hands them to `loadBasketPage()`, and renders `BasketView`.
 *
 * SSR per request (`force-dynamic`): the page reads the visitor's basket, so it is never cached
 * (`no-store`, `src/lib/transactional-headers.ts` adds `X-Robots-Tag: noindex, nofollow` on every
 * response class). Its metadata is `transactionalMetadata()`: a title and `noindex,nofollow`, no
 * canonical, no hreflang, no JSON-LD. Nothing reads a residence, `Accept-Language`, an IP or a geo
 * header (AC-76). No query parameter is ever read: notices come from `pending_notice`.
 */
export const dynamic = "force-dynamic";

interface BasketParams {
  params: Promise<{ locale: string }>;
}

/** The idle state a `useActionState` action starts from; a plain `<form>` never reads it back. */
const IDLE: StepState = { status: "idle" };

export async function generateMetadata({
  params,
}: BasketParams): Promise<Metadata> {
  const { locale: requested } = await params;
  const locale = routableLocale(requested);
  if (locale === undefined) return {};
  const t = await getTranslations({
    locale: locale.code,
    namespace: "checkout",
  });
  return transactionalMetadata("basket", t("basket.title"));
}

export default async function BasketRoute({
  params,
}: BasketParams): Promise<ReactElement> {
  const { locale: requested } = await params;
  const locale = routableLocale(requested)?.code;
  if (locale === undefined || !isLocaleCode(locale)) notFound();
  setRequestLocale(locale);
  const value = (await cookies()).get(CHECKOUT_COOKIE_NAME)?.value ?? null;
  const page = await loadBasketPage({
    token: isDraftToken(value) ? value : null,
    locale,
    now: new Date(),
  });
  const home = localePath(locale, "home");
  const shop =
    page.kind === "lines"
      ? (await corridorShopEntry(locale, page.continueCountry)).shopEntryHref
      : undefined;
  const guarantee = missingInfoPageLinkIds(locale).includes("guarantee")
    ? undefined
    : localePath(locale, infoPageLocation("guarantee", locale).segmentKey);
  return (
    <BasketView
      actions={{
        remove: async (form: FormData): Promise<void> => {
          "use server";
          await removeLineAction(locale, IDLE, form);
        },
        useNextDate: async (form: FormData): Promise<void> => {
          "use server";
          await nextDateAction(locale, IDLE, form);
        },
        confirmPrice: async (form: FormData): Promise<void> => {
          "use server";
          await updateSelection(locale, IDLE, form);
        },
      }}
      hrefs={{
        home,
        checkout: localePath(locale, "home", "checkout"),
        continueShopping: shop ?? home,
        ...(guarantee === undefined ? {} : { guarantee }),
      }}
      locale={locale}
      page={page}
    />
  );
}
