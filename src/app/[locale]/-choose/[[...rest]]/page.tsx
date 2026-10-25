/**
 * `/{locale}/{chooseSegment}/{next}`: the country chooser page (spec 004 §14 A-founder-2026-10-24a
 * item 3, AC-77, AC-78; TASK-385). Served here through `src/proxy.ts`'s rewrite
 * (`src/lib/chooser-routes.ts`); a choice never reaches this file (the proxy sends it to the
 * choice route's `303`).
 *
 * Rendered per request, never cached: it reads the form's `to` (to show a no match) and the
 * remembered `fo_dest` (to lead with "Continue to {country}"), and it never forwards on its own.
 * `noindex, nofollow` in its metadata and in its `X-Robots-Tag`, disallowed in `robots.txt`, in no
 * sitemap, no canonical and no hreflang. It sets no cookie and reads no IP, geo or language header.
 *
 * @purpose The country chooser page (noindex, uncached)
 * @spec 004
 */
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactElement } from "react";

import { PICKER_CHIPS } from "@/config/commerce";
import { DEST_COOKIE_NAME } from "@/config/cookies";
import { isLocaleCode } from "@/config/locales";
import {
  ChooserPage,
  type ChooserPageState,
  ChooserSearchParamsSchema,
  chooserPageView,
  decideChooser,
} from "@/modules/catalog";
import { routableLocale } from "@/modules/i18n";

/** Per request: the page reads `to` and `fo_dest`, so no response of it is ever stored. */
export const dynamic = "force-dynamic";

interface ChooserParams {
  params: Promise<{ locale: string; rest?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** The locale, or a 404 for a code outside the routable set (the `boom` route's check). */
function chooserLocale(requested: string) {
  const locale = routableLocale(requested);
  if (locale === undefined || !isLocaleCode(locale.code)) notFound();
  return locale.code;
}

export async function generateMetadata({
  params,
}: ChooserParams): Promise<Metadata> {
  const locale = chooserLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "home" });
  return {
    title: t("picker.label"),
    description: null,
    robots: { index: false, follow: false },
  };
}

export default async function ChooserRoute({
  params,
  searchParams,
}: ChooserParams): Promise<ReactElement> {
  const { locale: requested, rest = [] } = await params;
  const locale = chooserLocale(requested);
  setRequestLocale(locale);
  const to = ChooserSearchParamsSchema.parse(await searchParams);
  const decision = await decideChooser(locale, rest, to);
  // A choice is the proxy's to answer; one that reaches the page (a request typed at the internal
  // route) is shown the question again, never a redirect or a cookie from here.
  const state: ChooserPageState =
    decision.kind === "page" ? decision.state : { kind: "ask" };
  const view = await chooserPageView(locale, decision.next, state, {
    remembered: (await cookies()).get(DEST_COOKIE_NAME)?.value,
    chips: PICKER_CHIPS,
  });
  return <ChooserPage view={view} />;
}
