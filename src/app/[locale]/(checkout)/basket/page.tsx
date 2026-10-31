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

/**
 * A step action bound to its locale and the idle state, as a plain `<form action>`. Each one
 * answers a successful post with a 303 (`redirect()`); the `StepState` it returns for a refused
 * post is what `useActionState` would re-render with, and a plain form, which this JavaScript-off
 * page uses, discards it and re-renders the basket. React types a form action as returning
 * `void`, so the returned state is dropped from the type here and nowhere else. The bound
 * function stays the server reference itself, so the form posts to the action directly.
 */
function formAction(
  action: (form: FormData) => Promise<StepState>,
): (form: FormData) => Promise<void> {
  return action as unknown as (form: FormData) => Promise<void>;
}

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
  // The `<h1>`'s accent (`<em>`, the board's "Your *basket*") is markup, not title text.
  const title = t.markup("basket.title", { em: (chunks) => chunks });
  return transactionalMetadata("basket", title);
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
        remove: formAction(removeLineAction.bind(null, locale, IDLE)),
        useNextDate: formAction(nextDateAction.bind(null, locale, IDLE)),
        confirmPrice: formAction(updateSelection.bind(null, locale, IDLE)),
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
