/**
 * `Field` (spec 004 §2, §5.3, TASK-045).
 *
 * The canvas's `.field`: a `.label`-voice `<label>`, a 46 px control with the ink underline the
 * design uses instead of a box, optional help text and an error message. It is the shape the
 * finder card (TASK-050), the header search (TASK-048) and the reminder signup (TASK-049) all
 * need, so it ships once with the wiring accessibility depends on already done:
 *
 *  - the `<label>` is a real `<label htmlFor>` — never a placeholder standing in for a label;
 *  - help and error text are linked with `aria-describedby`, both when present;
 *  - an invalid field carries `aria-invalid`, and its message is rendered as text **and** given the
 *    danger colour, so the error is never colour-only (§5.3);
 *  - the error message region is `aria-live="polite"`, which is what §5.3 asks for on price and
 *    date changes and what a client-side validator in spec 013 will write into.
 *
 * Six states, all in `/dev/components`: `default`, `filled`, `focus` (rendered statically by
 * `forceState`), `error`, `disabled` and `with-help`.
 */
import type { ReactElement, ReactNode } from "react";

import { Label, Text } from "./typography";

export const FIELD_STATES = [
  "default",
  "filled",
  "focus",
  "error",
  "disabled",
  "with-help",
] as const;
export type FieldState = (typeof FIELD_STATES)[number];

export interface FieldProps {
  /** Control id; the `<label>` points at it and the descriptions are derived from it. */
  readonly id: string;
  /** Label text, from the message catalogue. */
  readonly label: ReactNode;
  /** Help text below the control. */
  readonly help?: ReactNode;
  /** Error message. Its presence is what makes the field invalid. */
  readonly error?: ReactNode;
  readonly disabled?: boolean;
  /**
   * The control. Receives the id and the aria wiring through `render`, so a caller cannot forget
   * them: `render={(props) => <input {...props} />}`.
   */
  readonly render: (props: FieldControlProps) => ReactNode;
  /** Gallery only: render the focus state statically. */
  readonly forceState?: "focus";
  readonly className?: string;
}

export interface FieldControlProps {
  readonly id: string;
  readonly disabled: boolean;
  readonly "aria-invalid": boolean | undefined;
  readonly "aria-describedby": string | undefined;
  readonly className: string;
}

export function Field({
  id,
  label,
  help,
  error,
  disabled = false,
  render,
  forceState,
  className,
}: FieldProps): ReactElement {
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const describedBy = [
    help === undefined ? "" : helpId,
    error === undefined ? "" : errorId,
  ]
    .filter(Boolean)
    .join(" ");

  const controlClassName = [
    "min-h-[46px] w-full bg-transparent px-[12px] text-md text-ink",
    "border-0 border-b border-solid",
    error === undefined ? "border-border-emphasis" : "border-danger",
    disabled ? "opacity-50" : "",
    forceState === "focus" ? "outline-2 outline-offset-2 outline-focus" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={["gap-xs flex flex-col", className].filter(Boolean).join(" ")}
    >
      <Label as="label" htmlFor={id}>
        {label}
      </Label>
      {render({
        id,
        disabled,
        "aria-invalid": error === undefined ? undefined : true,
        "aria-describedby": describedBy === "" ? undefined : describedBy,
        className: controlClassName,
      })}
      {help === undefined ? null : (
        <Text id={helpId} size="sm" tone="subtle">
          {help}
        </Text>
      )}
      {/* Always rendered, so the live region exists before the first error and the announcement
          is not swallowed by the region's own insertion. */}
      <div aria-live="polite">
        {error === undefined ? null : (
          <Text id={errorId} size="sm" tone="danger">
            {error}
          </Text>
        )}
      </div>
    </div>
  );
}
