import type { ReactElement } from "react";

import { isLocaleCode } from "@/config/locales";

import { CheckoutHeader } from "../../../../(checkout)/_views/CheckoutHeader";

/**
 * The checkout's header (spec 010 §5.3; TASK-204): the logo and the help line only, as the
 * `checkout-*` and `confirmation-*` artboards draw it.
 */
export default async function CheckoutHeaderSlot({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<ReactElement> {
  const { locale } = await params;
  return isLocaleCode(locale) ? <CheckoutHeader locale={locale} /> : <></>;
}
