/**
 * `SelectField` — a labelled native `<select>` (spec 010 §5.3; step 2's "Country you live in";
 * `docs/design/wireframes/checkout-desktop.dc.html` `.input.sel`; TASK-201).
 *
 * Native on purpose: it works without JavaScript, every platform gives it an accessible picker,
 * and a long country list stays searchable by typing. The chevron is drawn in CSS at the inline
 * end, so it moves to the left in a right-to-left locale. Every option label arrives translated
 * and sorted by the caller (the country list is `collator`-sorted in the buyer's locale).
 */
import type { ReactElement, ReactNode } from "react";

import {
  type FieldMessageContent,
  FieldMessages,
  describedBy,
} from "./FieldMessages.tsx";
import {
  type ClientFieldMessages,
  clientMessageAttributes,
} from "./TextField.tsx";
import {
  FIELD,
  FIELD_LABEL,
  FIELD_OPTIONAL,
  INPUT,
  INPUT_FORCED_FOCUS,
} from "./styles.ts";

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

export interface SelectFieldProps extends FieldMessageContent {
  readonly id: string;
  readonly name: string;
  readonly label: ReactNode;
  readonly options: readonly SelectOption[];
  readonly defaultValue?: string;
  readonly optionalLabel?: string;
  readonly required?: boolean;
  readonly autoComplete?: string;
  readonly disabled?: boolean;
  readonly clientMessages?: ClientFieldMessages;
  /** Gallery only: draw the focus ring statically. */
  readonly forceFocus?: boolean;
}

export function SelectField({
  id,
  name,
  label,
  options,
  defaultValue,
  optionalLabel,
  required = false,
  autoComplete,
  disabled = false,
  clientMessages,
  forceFocus = false,
  hint,
  warning,
  error,
}: SelectFieldProps): ReactElement {
  const messages = { hint, warning, error };
  return (
    <div className={FIELD} data-fo-field={id}>
      <label className={FIELD_LABEL} htmlFor={id}>
        {label}
        {required || optionalLabel === undefined ? null : (
          <>
            {" "}
            <span className={FIELD_OPTIONAL}>{optionalLabel}</span>
          </>
        )}
      </label>
      <div className="relative">
        <select
          aria-describedby={describedBy(id, messages)}
          aria-invalid={error === undefined ? undefined : true}
          autoComplete={autoComplete}
          className={[
            INPUT,
            "cursor-pointer appearance-none pe-[44px]",
            forceFocus ? INPUT_FORCED_FOCUS : "",
          ].join(" ")}
          defaultValue={defaultValue}
          disabled={disabled}
          id={id}
          name={name}
          required={required}
          {...clientMessageAttributes(clientMessages)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span
          aria-hidden="true"
          className="border-ink-2 pointer-events-none absolute end-[18px] top-1/2 size-[8px] -translate-y-[70%] rotate-45 border-e-2 border-b-2 border-solid"
        />
      </div>
      <FieldMessages id={id} {...messages} />
    </div>
  );
}
