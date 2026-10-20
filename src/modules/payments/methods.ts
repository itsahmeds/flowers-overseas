/**
 * The method capability table (spec 013 §5.2 "Methods at launch", §13 Q5, AC-7, T-07; TASK-255).
 *
 * One row per method the Stripe adapter can offer: the currencies and declared buyer countries it
 * serves and the `src/config/payment-methods.ts` rows whose `available` it reads. **There is no
 * capture column**: every method is charged at once (the founder's ruling of 2026-10-14, §14), so
 * nothing here can ask for a hold.
 *
 * `paymentMethodTypesFor()` is the one place the intent's `payment_method_types` comes from:
 * the rows serving (declared buyer country, currency) ∩ `available` (with `processor: 'stripe'`)
 * ∩ the `payments.method.{id}` flags. The registry and the flag set are **injected**, so the list
 * is ours and testable, never Stripe's `automatic_payment_methods`. No request header is an
 * input: two requests that differ only in `cf-ipcountry` cannot differ here (ADR-0006).
 *
 * Apple Pay and Google Pay travel as Stripe's `card` type, so their rows map to `card`. BLIK is a
 * row whose config is `available: false` and whose flag is never set, so no code path offers it
 * (§12 task 9). Google Pay has no `payment-methods.ts` row yet; TASK-266 adds it with the flip, and
 * until then it reads as not available.
 */
import { PAYMENT_METHODS, type PaymentMethod } from "@/config/payment-methods";

import type { ProviderMethodType } from "./provider.ts";

export const paymentMethodIds = [
  "card",
  "apple-pay",
  "google-pay",
  "blik",
] as const;
export type PaymentMethodCapabilityId = (typeof paymentMethodIds)[number];

export interface MethodCapability {
  readonly id: PaymentMethodCapabilityId;
  /** The `payment_method_types` entry Stripe takes for it. */
  readonly providerType: ProviderMethodType;
  readonly currencies: readonly string[];
  /** ISO-3166-1 alpha-2 declared buyer countries; `"any"` serves every country. */
  readonly buyerCountries: "any" | readonly string[];
  /** The `payment-methods.ts` ids whose `available` (any of them) makes this row available. */
  readonly configIds: readonly string[];
}

export const METHOD_CAPABILITIES: readonly MethodCapability[] = Object.freeze([
  {
    id: "card",
    providerType: "card",
    currencies: ["GBP", "EUR", "PLN"],
    buyerCountries: "any",
    configIds: ["visa", "mastercard"],
  },
  {
    id: "apple-pay",
    providerType: "card",
    currencies: ["GBP", "EUR", "PLN"],
    buyerCountries: "any",
    configIds: ["apple-pay"],
  },
  {
    id: "google-pay",
    providerType: "card",
    currencies: ["GBP", "EUR", "PLN"],
    buyerCountries: "any",
    configIds: ["google-pay"],
  },
  {
    id: "blik",
    providerType: "blik",
    currencies: ["PLN"],
    buyerCountries: ["PL"],
    configIds: ["blik"],
  },
]);

/** The flag that switches one method on (`payment_method` scope, spec 013 §12). */
export function methodFlagKey(id: PaymentMethodCapabilityId): string {
  return `payments.method.${id}`;
}

export interface MethodSelection {
  readonly buyerCountryDeclared: string;
  readonly currency: string;
}

export interface MethodSources {
  /** The `payments.method.{id}` flags that are on. */
  readonly enabledFlags: ReadonlySet<string>;
  readonly registry?: readonly PaymentMethod[];
  readonly capabilities?: readonly MethodCapability[];
}

export interface MethodTypes {
  /** Our method ids, in table order: what the Payment Element's wallet options read. */
  readonly methods: readonly PaymentMethodCapabilityId[];
  /** Stripe's `payment_method_types`, deduplicated, in table order. Empty means no method. */
  readonly providerTypes: readonly ProviderMethodType[];
}

function serves(
  capability: MethodCapability,
  selection: MethodSelection,
): boolean {
  if (!capability.currencies.includes(selection.currency)) return false;
  return (
    capability.buyerCountries === "any" ||
    capability.buyerCountries.includes(selection.buyerCountryDeclared)
  );
}

function isAvailable(
  capability: MethodCapability,
  registry: readonly PaymentMethod[],
): boolean {
  return registry.some(
    (method) =>
      capability.configIds.includes(method.id) &&
      method.available &&
      method.processor === "stripe",
  );
}

export function paymentMethodTypesFor(
  selection: MethodSelection,
  sources: MethodSources,
): MethodTypes {
  const registry = sources.registry ?? PAYMENT_METHODS;
  const capabilities = sources.capabilities ?? METHOD_CAPABILITIES;
  const methods = capabilities.filter(
    (capability) =>
      serves(capability, selection) &&
      isAvailable(capability, registry) &&
      sources.enabledFlags.has(methodFlagKey(capability.id)),
  );
  const providerTypes: ProviderMethodType[] = [];
  for (const method of methods) {
    if (!providerTypes.includes(method.providerType)) {
      providerTypes.push(method.providerType);
    }
  }
  return { methods: methods.map((method) => method.id), providerTypes };
}
