/**
 * `TextField` — one labelled input of the checkout (spec 010 §5.3: default, focus, error,
 * disabled, with hint, with warning; `docs/design/wireframes/checkout-desktop.dc.html` `.fld`;
 * `docs/design/system/components.dc.html` "Checkout · fields"; TASK-201).
 *
 * A server component. Every string arrives as a prop, already translated: this module names no
 * message key (spec 003 §14 A17 clause 2, check 11: `checkout.*` keys may be read only from the
 * checkout's own files, never from `src/modules/ui/`).
 *
 * Form quality (§5.3): a visible `<label>` bound by `htmlFor`; `autocomplete` and `inputmode` as
 * the caller's field model says (`addressFormModel()` gives both for the recipient address); the
 * value is `defaultValue`, so an error re-render keeps what was typed (AC-14) and the input stays
 * uncontrolled; 16 px type and a 50 px box, so phones do not zoom and the target is over 44 px.
 *
 * `clientMessages` feed the on-blur island (`BlurValidation.tsx`) through `data-*` attributes: the
 * island reads the browser's own `validity` and shows the matching message, so the browser bundle
 * carries no schema and no copy of its own.
 */
import type { ReactElement, ReactNode } from "react";

import {
  type FieldMessageContent,
  FieldMessages,
  describedBy,
} from "./FieldMessages.tsx";
import {
  FIELD,
  FIELD_LABEL,
  FIELD_OPTIONAL,
  INPUT,
  INPUT_FORCED_FOCUS,
} from "./styles.ts";

/** The messages the on-blur island may show, already translated. */
export interface ClientFieldMessages {
  /** Shown when a required field is left empty (`checkout.error.required`). */
  readonly required?: string;
  /** Shown when the value does not match `pattern` or the input's `type`. */
  readonly format?: string;
}

/** The `data-*` attributes the on-blur island reads. Shared with `SelectField`. */
export function clientMessageAttributes(
  messages: ClientFieldMessages | undefined,
): Readonly<Record<string, string>> {
  if (messages === undefined) return {};
  return {
    "data-fo-validate": "",
    ...(messages.required === undefined
      ? {}
      : { "data-fo-msg-required": messages.required }),
    ...(messages.format === undefined
      ? {}
      : { "data-fo-msg-format": messages.format }),
  };
}

export interface TextFieldProps extends FieldMessageContent {
  readonly id: string;
  readonly name: string;
  readonly label: ReactNode;
  /** Shown after the label when the field is not required ("optional"). */
  readonly optionalLabel?: string;
  readonly required?: boolean;
  readonly defaultValue?: string;
  readonly type?: "text" | "email" | "tel";
  /** The HTML `autocomplete` token (§5.3); `"off"` only where no token fits. */
  readonly autoComplete?: string;
  readonly inputMode?: "text" | "numeric" | "tel" | "email";
  /** A regular expression the browser checks on blur (the postcode); the server re-checks. */
  readonly pattern?: string;
  readonly maxLength?: number;
  readonly placeholder?: string;
  readonly disabled?: boolean;
  /** `true` for names and street lines, so a right-to-left name keeps its order. */
  readonly bidiIsolate?: boolean;
  readonly clientMessages?: ClientFieldMessages;
  /** Gallery only (`/dev/components`): draw the focus ring statically. */
  readonly forceFocus?: boolean;
}

export function TextField({
  id,
  name,
  label,
  optionalLabel,
  required = false,
  defaultValue,
  type = "text",
  autoComplete,
  inputMode,
  pattern,
  maxLength,
  placeholder,
  disabled = false,
  bidiIsolate = false,
  clientMessages,
  forceFocus = false,
  hint,
  warning,
  error,
}: TextFieldProps): ReactElement {
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
      <input
        aria-describedby={describedBy(id, messages)}
        aria-invalid={error === undefined ? undefined : true}
        autoComplete={autoComplete}
        className={forceFocus ? `${INPUT} ${INPUT_FORCED_FOCUS}` : INPUT}
        defaultValue={defaultValue}
        dir={bidiIsolate ? "auto" : undefined}
        disabled={disabled}
        id={id}
        inputMode={inputMode}
        maxLength={maxLength}
        name={name}
        pattern={pattern}
        placeholder={placeholder}
        required={required}
        type={type}
        {...clientMessageAttributes(clientMessages)}
      />
      <FieldMessages id={id} {...messages} />
    </div>
  );
}
