/**
 * The product page's language links: this product in each locale (TASK-233; `PageLocaleSwitcher`).
 * The product page is served from `_product` since spec 009 AC-37 (TASK-228;
 * `src/lib/product-rewrites.ts`), so its slot mirrors that path; without this file the slot would
 * fall back to `default.tsx` and every language link would go to a locale home. The segments are
 * the visitor's address without `_product`, exactly what the depth-4 slot passes.
 *
 * @purpose Product page language links
 * @spec 003
 */
import { setRequestLocale } from "next-intl/server";
import type { ReactElement } from "react";

import { PageLocaleSwitcher } from "@/modules/catalog";
import { documentFallbackLocale, routableLocale } from "@/modules/i18n";

export default async function ProductSwitcher({
  params,
}: {
  params: Promise<{
    locale: string;
    segment: string;
    child: string;
    grandchild: string;
  }>;
}): Promise<ReactElement> {
  const { locale: requested, segment, child, grandchild } = await params;
  const locale = (routableLocale(requested) ?? documentFallbackLocale()).code;
  setRequestLocale(locale);
  return (
    <PageLocaleSwitcher
      locale={locale}
      segments={[segment, child, grandchild]}
    />
  );
}
