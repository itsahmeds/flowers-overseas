/**
 * `SubmitButton` and `SampleDetailsButton` — the checkout's server-rendered submits (spec 010
 * §5.3; `docs/design/wireframes/checkout-desktop.dc.html` `.btn`, `.s10-priv .btn`,
 * `.s10-alert .btn`; TASK-201).
 *
 * A plain `<button type="submit">`, so every action works without JavaScript. `name` and `value`
 * say which intent the step's server action is handling ("use sample details", "continue at the
 * new price"); `form` lets the sticky bar's action submit the step's form from outside it;
 * `formAction` lets one form carry two actions.
 */
import type { ReactElement, ReactNode } from "react";

import { type ButtonSize, type ButtonSkin, buttonClass } from "./styles.ts";

/** A server action or a URL, as `<button formAction>` accepts in React 19. */
export type FormActionValue =
  string | ((formData: FormData) => void | Promise<void>);

export interface SubmitButtonProps {
  readonly children: ReactNode;
  readonly skin?: ButtonSkin;
  readonly size?: ButtonSize;
  readonly name?: string;
  readonly value?: string;
  /** The id of the `<form>` this submits, when the button sits outside it. */
  readonly form?: string;
  readonly formAction?: FormActionValue;
  readonly className?: string;
  readonly id?: string;
}

export function SubmitButton({
  children,
  skin = "primary",
  size = "md",
  name,
  value,
  form,
  formAction,
  className,
  id,
}: SubmitButtonProps): ReactElement {
  return (
    <button
      className={buttonClass(skin, size, className)}
      form={form}
      formAction={formAction}
      id={id}
      name={name}
      type="submit"
      value={value}
    >
      {children}
    </button>
  );
}

/** The field name and value the step action reads to fill the sample (`checkout-samples.ts`). */
export const SAMPLE_INTENT = { name: "intent", value: "sample" } as const;

export interface SampleDetailsButtonProps {
  /** `checkout.demo.useSample`. */
  readonly label: string;
  readonly formAction?: FormActionValue;
  readonly form?: string;
}

/**
 * "Use sample details": a submit (it works without JavaScript) that asks the step's action to fill
 * the destination's plainly fictional sample (spec 010 §13 Q12, AC-33). An ink outline, not poppy:
 * it is not the step's primary action.
 */
export function SampleDetailsButton({
  label,
  formAction,
  form,
}: SampleDetailsButtonProps): ReactElement {
  return (
    <SubmitButton
      className="max-md:w-full"
      name={SAMPLE_INTENT.name}
      size="sm"
      skin="ghost"
      value={SAMPLE_INTENT.value}
      {...(form === undefined ? {} : { form })}
      {...(formAction === undefined ? {} : { formAction })}
    >
      {label}
    </SubmitButton>
  );
}
