/**
 * The pay button (spec 013 §5.3 "Components", §8 "Button and price display"; AC-3; TASK-262;
 * `.s13-paybtn` on the checkout boards). A real `<button>` that names the obligation to pay and
 * the amount ("Pay £45.90 and place order", spec 010's `checkout.legal.payButton`, the amount
 * through `formatMoney`), with a visible pending state. Presentational: the panel owns the state.
 */
import type { ReactElement } from "react";

import { buttonClass } from "../styles.ts";

export interface PayButtonProps {
  readonly label: string;
  readonly pendingLabel: string;
  readonly pending: boolean;
}

export function PayButton({
  label,
  pendingLabel,
  pending,
}: PayButtonProps): ReactElement {
  return (
    <button
      aria-disabled={pending ? true : undefined}
      className={`${buttonClass(pending ? "busy" : "primary", "send")} w-full text-[19px]`}
      data-fo-pay-button=""
      onClick={(event) => {
        if (pending) event.preventDefault();
      }}
      type="submit"
    >
      <span aria-live="polite">{pending ? pendingLabel : label}</span>
    </button>
  );
}
