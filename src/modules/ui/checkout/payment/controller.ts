/**
 * The `PaymentPanel` island's logic, without React or a DOM (spec 013 §5.2 "How a paid order
 * flows" 1 to 4; AC-1, AC-5; TASK-262), so it is tested against a double of the Stripe.js loader
 * (AC-53) and the island stays a thin shell.
 *
 *  1. `mount(target)`: loads Stripe.js, creates Elements in **deferred-intent** mode from the
 *     server's preparation (amount and currency of the draft's total, the method types,
 *     `captureMethod: 'automatic'`) and mounts the Payment Element. No intent exists yet.
 *  2. `pay(form)`: `elements.submit()` (the Element's own validation), then the server's `pay`
 *     action, which places the purchase and returns the one intent's client secret, then
 *     `stripe.confirmPayment` with `return_url` = `/{locale}/checkout/return` on this origin.
 *     A decline comes back here: the server's `declined` action reconciles the purchase and
 *     answers our message key, which the panel announces. A 3DS or bank redirect leaves the page.
 *
 * The client secret lives only in this closure for one call: never stored, logged or put in a URL.
 */

/** The subset of Stripe.js the panel uses (`@stripe/stripe-js` is not a dependency). */
export interface StripeElementLike {
  mount(target: string | HTMLElement): void;
}
export interface StripeElementsLike {
  create(type: "payment", options?: Record<string, unknown>): StripeElementLike;
  submit(): Promise<{ error?: { message?: string } }>;
}
export interface StripeLike {
  elements(options: Record<string, unknown>): StripeElementsLike;
  confirmPayment(options: {
    elements: StripeElementsLike;
    clientSecret: string;
    confirmParams: { return_url: string };
  }): Promise<{ error?: { type?: string; code?: string } }>;
}
export type StripeLoader = (
  publishableKey: string,
  locale: string,
) => Promise<StripeLike | null>;

/** The server's step 3 preparation, as the island receives it (serialisable). */
export interface PanelPreparation {
  readonly elementOptions: {
    readonly mode: "payment";
    readonly amountMinor: number;
    readonly currency: string;
    readonly methodTypes: readonly string[];
    readonly captureMethod: "automatic";
  };
  readonly publishableKey: string;
  readonly stripeLocale: string;
}

export type PayAnswer =
  | { readonly kind: "confirm"; readonly clientSecret: string }
  | { readonly kind: "error"; readonly messageKey: string }
  | { readonly kind: "redirect"; readonly location: string };
export type DeclineAnswer =
  | { readonly kind: "error"; readonly messageKey: string }
  | { readonly kind: "redirect"; readonly location: string };

/** What the panel does next: show a message, go somewhere, or nothing (Stripe redirected). */
export type PanelResult =
  | { readonly kind: "message"; readonly messageKey: string }
  | { readonly kind: "navigate"; readonly location: string }
  | { readonly kind: "invalid" }
  | { readonly kind: "left" };

export interface PaymentControllerDeps {
  readonly preparation: PanelPreparation;
  readonly locale: string;
  /** `window.location.origin`. */
  readonly origin: string;
  readonly load: StripeLoader;
  readonly pay: (form: FormData) => Promise<PayAnswer>;
  readonly declined: () => Promise<DeclineAnswer>;
}

const UNAVAILABLE = "payments.error.unavailable";

/** The Elements options of a deferred intent (Stripe's names, our values). */
export function elementsOptions(
  preparation: PanelPreparation,
): Record<string, unknown> {
  const options = preparation.elementOptions;
  return {
    mode: options.mode,
    amount: options.amountMinor,
    currency: options.currency,
    paymentMethodTypes: [...options.methodTypes],
    captureMethod: options.captureMethod,
  };
}

export function createPaymentController(deps: PaymentControllerDeps) {
  let stripe: StripeLike | null = null;
  let elements: StripeElementsLike | null = null;
  return {
    /** Loads Stripe.js and mounts the Element; `false` when Stripe.js cannot load. */
    async mount(target: string | HTMLElement): Promise<boolean> {
      stripe = await deps.load(
        deps.preparation.publishableKey,
        deps.preparation.stripeLocale,
      );
      if (stripe === null) return false;
      elements = stripe.elements(elementsOptions(deps.preparation));
      elements.create("payment").mount(target);
      return true;
    },
    /** "Pay" (the file header). */
    async pay(form: FormData): Promise<PanelResult> {
      if (stripe === null || elements === null) {
        return { kind: "message", messageKey: UNAVAILABLE };
      }
      const submitted = await elements.submit();
      if (submitted.error !== undefined) return { kind: "invalid" };
      const answer = await deps.pay(form);
      if (answer.kind === "redirect") {
        return { kind: "navigate", location: answer.location };
      }
      if (answer.kind === "error") {
        return { kind: "message", messageKey: answer.messageKey };
      }
      const confirmed = await stripe.confirmPayment({
        elements,
        clientSecret: answer.clientSecret,
        confirmParams: {
          return_url: new URL(
            `/${deps.locale}/checkout/return`,
            deps.origin,
          ).toString(),
        },
      });
      if (confirmed.error === undefined) return { kind: "left" };
      // The provider's own message is never shown: the server answers our key (AC-5).
      const declined = await deps.declined();
      return declined.kind === "redirect"
        ? { kind: "navigate", location: declined.location }
        : { kind: "message", messageKey: declined.messageKey };
    },
  };
}

/** The production loader: Stripe.js from js.stripe.com, once per page (step 3 only, §5.4). */
export const loadStripeJs: StripeLoader = (publishableKey, locale) =>
  new Promise((resolve) => {
    const global = window as unknown as {
      Stripe?: (key: string, options: { locale: string }) => StripeLike;
    };
    const ready = (): void => {
      resolve(
        global.Stripe === undefined
          ? null
          : global.Stripe(publishableKey, { locale }),
      );
    };
    if (global.Stripe !== undefined) {
      ready();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://js.stripe.com/v3/";
    script.async = true;
    script.onload = ready;
    script.onerror = () => {
      resolve(null);
    };
    document.head.appendChild(script);
  });
