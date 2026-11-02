import { getLocale } from "next-intl/server";
import type { ReactElement } from "react";

import { isLocaleCode } from "@/config/locales";
import { documentFallbackLocale } from "@/modules/i18n";

import { NotWorkingView } from "./TrackingPageView";

/**
 * @purpose Tracking not-working 404
 * @spec 018
 *
 * The not-working page (spec 018 §5.3, AC-7; TASK-338): what `/{locale}/track/{token}` answers,
 * with status 404, for every token failure. The page called `setRequestLocale` before
 * `notFound()`, so the locale is the URL's; the body depends on nothing else.
 */
export default async function TrackNotFound(): Promise<ReactElement> {
  const requested = await getLocale();
  const fallback = documentFallbackLocale().code;
  const locale = isLocaleCode(requested)
    ? requested
    : isLocaleCode(fallback)
      ? fallback
      : "en";
  return <NotWorkingView locale={locale} />;
}
