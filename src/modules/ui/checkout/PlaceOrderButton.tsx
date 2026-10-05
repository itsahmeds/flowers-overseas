"use client";

/**
 * `PlaceOrderButton` — the step's place control, with a pending label (spec 010 §5.3 "Loading": "a
 * submit button shows a pending label via `useFormStatus` when JS is on"; "No spinner blocks
 * input"; `docs/design/wireframes/checkout-desktop.dc.html` `.s10-place`, "Submitting"; TASK-201).
 *
 * A real `<button type="submit">` inside the step's form: with JavaScript off it submits and the
 * browser shows progress. With JavaScript on, `useFormStatus` reports the form's pending submit
 * and the button swaps to `pendingLabel`, takes the strong fill and `aria-disabled`, and swallows
 * a second click while the first is in flight (the server is idempotent per draft anyway, §2).
 * It stays focusable, so focus does not drop to the document. The pending label sits in a polite
 * live region, so a screen reader hears that the order is being placed.
 *
 * Both labels arrive as props (`checkout.demo.place`, `checkout.demo.placing`): no message
 * catalogue reaches the browser.
 */
import type { ReactElement } from "react";
import { useFormStatus } from "react-dom";

import { buttonClass } from "./styles.ts";

export interface PlaceOrderButtonProps {
  readonly label: string;
  readonly pendingLabel: string;
  /** Gallery only: draw the pending state without a submit in flight. */
  readonly forcePending?: boolean;
}

export function PlaceOrderButton({
  label,
  pendingLabel,
  forcePending = false,
}: PlaceOrderButtonProps): ReactElement {
  const { pending: submitting } = useFormStatus();
  const pending = submitting || forcePending;
  return (
    <button
      aria-disabled={pending ? true : undefined}
      className={buttonClass(pending ? "busy" : "primary", "send")}
      data-fo-place-order=""
      onClick={(event) => {
        if (pending) event.preventDefault();
      }}
      type="submit"
    >
      <span aria-live="polite">{pending ? pendingLabel : label}</span>
    </button>
  );
}
