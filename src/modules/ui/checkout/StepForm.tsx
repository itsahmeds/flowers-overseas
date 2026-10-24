"use client";

/**
 * `StepForm`: one checkout form posting to one server action (spec 010 §5.3 "Everything works
 * with JavaScript disabled", AC-7, AC-14; TASK-204).
 *
 * The form's body is server-rendered and passed in as `children`. When the action refuses a post
 * (field errors, the daily cap, "Use sample details"), it answers with the **same body rendered
 * again on the server** with the posted values and the messages, and this wrapper draws that in
 * place of `children`. With JavaScript off, React's progressive enhancement does the same in one
 * round trip: the POST runs the action and the page renders with its answer. A successful save
 * answers with a 303 and never reaches the wrapper.
 *
 * It is the only client code a step adds besides the existing islands: no field logic, no fetch,
 * no state other than the action's answer.
 */
import { type ReactElement, type ReactNode, useActionState } from "react";

export interface StepFormProps {
  readonly id: string;
  readonly action: (previous: ReactNode, form: FormData) => Promise<ReactNode>;
  readonly children: ReactNode;
  readonly className?: string;
  /** The page URL a JavaScript-off POST renders at (React's permalink). */
  readonly permalink?: string;
}

export function StepForm({
  id,
  action,
  children,
  className,
  permalink,
}: StepFormProps): ReactElement {
  const [answer, dispatch] = useActionState<ReactNode, FormData>(
    action,
    null,
    permalink,
  );
  return (
    <form
      action={dispatch}
      className={className}
      data-fo-step-form={id}
      id={id}
      noValidate
    >
      {answer ?? children}
    </form>
  );
}
