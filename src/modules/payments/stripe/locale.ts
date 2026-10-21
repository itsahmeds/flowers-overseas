/**
 * The Stripe locale table (spec 013 §7 "Formatting", AC-35, T-35; TASK-255).
 *
 * The Payment Element and the 3DS screens are Stripe's; their language follows the `locale`
 * passed at mount. One table, tested: `en-gb` → `en-GB`, `en` → `en`, `de` → `de`, `pl` → `pl`.
 * Any other locale (the pseudo-locales) falls back to `auto`, Stripe's browser-language choice,
 * which is never shown to a buyer because pseudo-locales are refused outside development.
 */
const STRIPE_LOCALES = {
  "en-gb": "en-GB",
  en: "en",
  de: "de",
  pl: "pl",
} as const;

export type StripeLocale =
  (typeof STRIPE_LOCALES)[keyof typeof STRIPE_LOCALES] | "auto";

export const STRIPE_LOCALE_TABLE: Readonly<Record<string, StripeLocale>> =
  Object.freeze({ ...STRIPE_LOCALES });

export function stripeLocaleFor(locale: string): StripeLocale {
  return STRIPE_LOCALE_TABLE[locale] ?? "auto";
}
