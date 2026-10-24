/**
 * `StepForm`: one checkout form posting to the page's one server action (spec 010 §5.3
 * "Everything works with JavaScript disabled", AC-7, AC-14; TASK-204).
 *
 * A server component: a plain `<form>` whose `action` is the server action, so React posts it
 * without a reload when JavaScript runs and the browser posts it as ordinary HTML when it does
 * not. The action answers every post with a 303 (a saved step to the next screen, a refused one
 * back to the same screen with its echo), so the form holds no state and adds no client code.
 */
import type { ReactElement, ReactNode } from "react";

import type { CheckoutAction } from "./form-fields.ts";

export interface StepFormProps {
  readonly id: string;
  readonly action: CheckoutAction;
  readonly children: ReactNode;
  readonly className?: string;
}

export function StepForm({
  id,
  action,
  children,
  className,
}: StepFormProps): ReactElement {
  return (
    <form
      action={action}
      className={className}
      data-fo-step-form={id}
      id={id}
      noValidate
    >
      {children}
    </form>
  );
}
