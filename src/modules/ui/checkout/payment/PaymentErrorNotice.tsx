"use client";

/**
 * The decline and retry message (spec 013 §5.3 "Accessibility"; AC-5; TASK-262; `.s13-err` on
 * the declined board). The `aria-live="polite"` region is always in the page, empty until a
 * message arrives, so screen readers hear it; the notice inside takes focus when it appears.
 * The text is always one of our `payments.error.*` messages, never the provider's.
 */
import { type ReactElement, useEffect, useRef } from "react";

export interface PaymentErrorNoticeProps {
  /** Our message in the page locale, or `null` while there is nothing to say. */
  readonly message: string | null;
}

export function PaymentErrorNotice({
  message,
}: PaymentErrorNoticeProps): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (message !== null) ref.current?.focus();
  }, [message]);
  return (
    <div aria-live="polite" data-fo-payment-error-region="">
      {message === null ? null : (
        <div
          className="bg-blush rounded-field text-ui text-ink focus-visible:outline-focus grid gap-[8px] px-[16px] py-[14px] leading-[1.45] shadow-[inset_0_0_0_1px_var(--color-accent)] focus-visible:outline-[2.5px] focus-visible:outline-offset-[3px] focus-visible:outline-solid"
          data-fo-payment-error=""
          ref={ref}
          role="alert"
          tabIndex={-1}
        >
          <p className="m-0">{message}</p>
        </div>
      )}
    </div>
  );
}
