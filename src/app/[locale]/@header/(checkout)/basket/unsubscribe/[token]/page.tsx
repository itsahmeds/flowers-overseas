import type { ReactElement } from "react";

import { isLocaleCode } from "@/config/locales";

import { CheckoutHeader } from "../../../../../(checkout)/_views/CheckoutHeader";

/**
 * The header of spec 034's basket reminder page (§14 A-orchestrator-2026-10-25 item 3): the
 * checkout header (logo and help, no navigation), as drawn in `basket-reminder-pages-*.dc.html`.
 */
export default async function BasketReminderHeaderSlot({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<ReactElement> {
  const { locale } = await params;
  return isLocaleCode(locale) ? <CheckoutHeader locale={locale} /> : <></>;
}
