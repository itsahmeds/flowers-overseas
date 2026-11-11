import type { ReactElement } from "react";

import { isLocaleCode } from "@/config/locales";

import { CheckoutHeader } from "../../../../(checkout)/_views/CheckoutHeader";

/**
 * The header of spec 022a's review form (artboard `review-form-*`): the
 * checkout header (logo and help, no navigation), as drawn on the artboard.
 */
export default async function ReviewHeaderSlot({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<ReactElement> {
  const { locale } = await params;
  return isLocaleCode(locale) ? <CheckoutHeader locale={locale} /> : <></>;
}
