/**
 * The search routes' locale (spec 045 §2.2; TASK-402, moved here by TASK-403 so the results page
 * and its "rate limited" route share it): a launch locale, or spec 008's 404, because the index is
 * built for the launch locales only.
 *
 * @purpose The search routes' locale or 404
 * @spec 045
 */
import { notFound } from "next/navigation";

import { type LocaleCode, isLocaleCode } from "@/config/locales";
import { launchLocaleCodes, routableLocale } from "@/modules/i18n";

export function searchLocale(requested: string): LocaleCode {
  const locale = routableLocale(requested);
  if (
    locale === undefined ||
    !isLocaleCode(locale.code) ||
    !launchLocaleCodes().includes(locale.code)
  ) {
    notFound();
  }
  return locale.code;
}
