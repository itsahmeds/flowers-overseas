/**
 * The admin reason picker (`.ad-reasons` in `admin-order-refund-*` and `system/components.dc.html`
 * "Admin order actions"; spec 020a §5.3, AC-20; TASK-361).
 *
 * A fieldset with its legend and one native radio per reason the caller passes: for a refund,
 * exactly the seven reasons of `AdminRefundReasonSchema`, never a system reason. One column on a
 * phone, two from 768 px (`.ad-reasons.two`), the last odd one spanning both. The chosen row is
 * bold on the sage wash; the radio keeps the browser's own keyboard model (arrows move and choose).
 * `error` is tied to the group with `aria-describedby`.
 *
 * Controlled: the island that owns the form holds the choice. Every word arrives as a prop.
 */
import type { ReactElement } from "react";

export interface ReasonOption {
  readonly value: string;
  readonly label: string;
}

export function ReasonPicker({
  id,
  name,
  legend,
  options,
  value,
  onChange,
  error,
}: {
  readonly id: string;
  readonly name: string;
  readonly legend: string;
  readonly options: readonly ReasonOption[];
  /** The chosen value, or `""` for none yet. */
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly error?: string | undefined;
}): ReactElement {
  const errorId = `${id}-error`;
  return (
    <fieldset
      id={id}
      className="grid min-w-0 gap-[4px]"
      {...(error === undefined ? {} : { "aria-describedby": errorId })}
    >
      <legend className="text-ink-3 mb-[4px] text-[12px] font-bold tracking-[0.08em] uppercase">
        {legend}
      </legend>
      <div className="bg-card grid overflow-hidden rounded-[10px] shadow-[inset_0_0_0_1px_var(--color-field-edge)] md:grid-cols-2">
        {options.map((option) => {
          const on = option.value === value;
          return (
            <label
              key={option.value}
              className={`border-rule flex min-h-[36px] cursor-pointer items-center gap-[10px] border-b px-[12px] text-[14px] last:border-b-0 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-[-3px] md:odd:border-e md:[&:last-child:nth-child(odd)]:col-span-2 md:[&:last-child:nth-child(odd)]:border-e-0 md:[&:nth-last-child(2):nth-child(odd)]:border-b-0 ${
                on ? "bg-sage-wash font-bold" : ""
              }`}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={on}
                onChange={() => onChange(option.value)}
                className="accent-selected size-[16px] flex-none"
              />
              {option.label}
            </label>
          );
        })}
      </div>
      {error === undefined ? null : (
        <p id={errorId} className="text-danger text-[13px] font-bold">
          {error}
        </p>
      )}
    </fieldset>
  );
}
