/**
 * The admin money field (`.ad-money` in `admin-order-refund-*` and `system/components.dc.html`
 * "Admin order actions"; spec 020a §5.3, §7 "Formatting", §8 "Accessibility"; TASK-361).
 *
 * A text field with `inputmode="decimal"` and the order's ISO currency code beside it. It formats
 * nothing into the field: what the admin types is what is posted, "." or "," as the decimal
 * separator whatever the browser's locale, and the server parses it again with
 * `parseMinorUnits` (digit strings, never a float). The accessible name carries the currency
 * ("Amount, EUR"); the hint and, when there is one, the error are tied to the field with
 * `aria-describedby`, and an error sets `aria-invalid`.
 *
 * Controlled: the island that owns the form (the refund dialog) holds the text. Every word
 * arrives as a prop from the admin catalogue.
 */
import type { ReactElement } from "react";

export function MoneyInput({
  id,
  name,
  label,
  accessibleName,
  currency,
  value,
  onChange,
  placeholder,
  maxLength,
  hint,
  error,
}: {
  readonly id: string;
  readonly name: string;
  /** The visible label ("Amount"). */
  readonly label: string;
  /** The label with the currency ("Amount, EUR"). */
  readonly accessibleName: string;
  /** The ISO code shown beside the field. */
  readonly currency: string;
  readonly value: string;
  readonly onChange: (text: string) => void;
  readonly placeholder: string;
  readonly maxLength: number;
  readonly hint: string;
  /** The error under the field, when the text cannot be refunded. */
  readonly error?: string | undefined;
}): ReactElement {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const bad = error !== undefined;
  return (
    <div className="grid min-w-0 gap-[4px]">
      <label
        htmlFor={id}
        className="text-ink-3 text-[12px] font-bold tracking-[0.08em] uppercase"
      >
        {label}
      </label>
      <div
        className={`bg-card flex min-h-[36px] items-stretch overflow-hidden rounded-[8px] border-[1.5px] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 ${
          bad
            ? "border-danger shadow-[inset_0_0_0_1px_var(--color-danger)]"
            : "border-field-edge"
        }`}
      >
        <input
          id={id}
          name={name}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          value={value}
          maxLength={maxLength}
          placeholder={placeholder}
          aria-label={accessibleName}
          aria-describedby={bad ? `${hintId} ${errorId}` : hintId}
          aria-invalid={bad}
          onChange={(event) => onChange(event.target.value)}
          className="text-ink placeholder:text-ink-3 min-w-0 flex-1 bg-transparent px-[10px] text-[15px] tabular-nums outline-none"
        />
        <span
          aria-hidden="true"
          className="bg-paper-2 border-rule text-ink-2 flex items-center border-s px-[10px] text-[13px] font-bold tracking-[0.06em]"
        >
          {currency}
        </span>
      </div>
      <p id={hintId} className="text-ink-3 text-[13px] leading-[1.4]">
        {hint}
      </p>
      {bad ? (
        <p id={errorId} className="text-danger text-[13px] font-bold">
          {error}
        </p>
      ) : null}
    </div>
  );
}
