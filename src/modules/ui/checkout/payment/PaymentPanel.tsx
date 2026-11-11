"use client";

/**
 * The pay step's island (spec 013 §5.3 "Components", §5.4 "Client JavaScript"; AC-1, AC-2,
 * AC-5; TASK-262; `.s13-pay` on the checkout boards): "Payment", the decline region, the Stripe
 * Payment Element, then the server-rendered pre-contract block (`children`), the pay button and
 * the processor line. The logic is `createPaymentController` (`./controller.ts`); this file only
 * holds the state. Stripe.js loads here and nowhere else, so only step 3 in `test` and `live`
 * carries it. Until the Element is mounted no pay button renders: with JavaScript off the page
 * shows the `<noscript>` notice instead of a dead button.
 */
import {
  type FormEvent,
  type ReactElement,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  createPaymentController,
  type DeclineAnswer,
  loadStripeJs,
  type PanelMessageKeys,
  type PanelPreparation,
  type PayAnswer,
  type StripeLoader,
} from "./controller.ts";
import { PayButton } from "./PayButton.tsx";
import { PaymentErrorNotice } from "./PaymentErrorNotice.tsx";

export interface PaymentPanelProps {
  readonly locale: string;
  readonly preparation: PanelPreparation;
  readonly title: string;
  readonly payLabel: string;
  readonly pendingLabel: string;
  readonly processedBy: string;
  /** Our payment error messages in the page locale, by catalogue key (the pay step resolves them). */
  readonly messages: Readonly<Record<string, string>>;
  /**
   * The keys of `messages` the panel falls back on: `generic` for a key it has no message for,
   * `unavailable` when Stripe.js cannot load. Handed in by the pay step, so this shared file names
   * no checkout-only key (spec 003 A17, TASK-521).
   */
  readonly messageKeys: PanelMessageKeys;
  /** The total step 3 showed (spec 010's `seenTotalMinor`), for the placement's check. */
  readonly seenTotal: {
    readonly amountMinor: number;
    readonly currency: string;
  };
  readonly pay: (locale: string, form: FormData) => Promise<PayAnswer>;
  readonly declined: (locale: string) => Promise<DeclineAnswer>;
  /** Tests: a double of the Stripe.js loader (AC-53). */
  readonly load?: StripeLoader;
  /** The pre-contract block, server-rendered, directly above the button. */
  readonly children?: ReactNode;
}

const ELEMENT_ID = "co-payment-element";

export function PaymentPanel({
  locale,
  preparation,
  title,
  payLabel,
  pendingLabel,
  processedBy,
  messages,
  messageKeys,
  seenTotal,
  pay,
  declined,
  load = loadStripeJs,
  children,
}: PaymentPanelProps): ReactElement {
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [messageKey, setMessageKey] = useState<string | null>(null);
  const element = useRef<HTMLDivElement>(null);
  const unavailableKey = messageKeys.unavailable;
  const controller = useMemo(
    () =>
      createPaymentController({
        preparation,
        locale,
        origin: typeof window === "undefined" ? "" : window.location.origin,
        unavailableKey,
        load,
        pay: (form) => pay(locale, form),
        declined: () => declined(locale),
      }),
    [preparation, locale, unavailableKey, load, pay, declined],
  );
  useEffect(() => {
    const target = element.current;
    if (target === null) return;
    void controller.mount(target).then((mounted) => {
      if (mounted) setReady(true);
      else setMessageKey(unavailableKey);
    });
  }, [controller, unavailableKey]);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setMessageKey(null);
    const result = await controller.pay(new FormData(event.currentTarget));
    if (result.kind === "navigate") {
      window.location.assign(result.location);
      return;
    }
    if (result.kind === "message") setMessageKey(result.messageKey);
    if (result.kind !== "left") setPending(false);
  }

  return (
    <form
      aria-labelledby="co-pay-title"
      className="border-rule grid gap-[14px] border-t border-solid pt-[22px]"
      data-fo-payment-panel=""
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <h2
        className="display m-0 text-(length:--text-lg) leading-[1.15]"
        id="co-pay-title"
      >
        {title}
      </h2>
      <PaymentErrorNotice
        message={
          messageKey === null
            ? null
            : (messages[messageKey] ?? messages[messageKeys.generic] ?? null)
        }
      />
      <div
        className="bg-card rounded-field min-h-[120px] px-[16px] pt-[18px] pb-[16px] shadow-[inset_0_0_0_1.5px_var(--color-rule)]"
        data-fo-payment-element=""
        id={ELEMENT_ID}
        ref={element}
      />
      <input
        name="seenTotalMinor"
        type="hidden"
        value={String(seenTotal.amountMinor)}
      />
      <input name="seenCurrency" type="hidden" value={seenTotal.currency} />
      {children}
      {ready ? (
        <PayButton
          label={payLabel}
          pending={pending}
          pendingLabel={pendingLabel}
        />
      ) : null}
      <p className="text-ink-3 m-0 text-xs leading-[1.45]">{processedBy}</p>
    </form>
  );
}
