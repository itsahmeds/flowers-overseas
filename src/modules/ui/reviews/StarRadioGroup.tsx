/**
 * `StarRadioGroup` (spec 022a §5.3, §8 "Accessibility", AC-31; artboard `review-form-*`, "Build";
 * TASK-371): a fieldset with a visible legend and five **native** radios, so arrow keys move and
 * choose with no script and the group is operable by keyboard alone. Each label is a 60 × 64 px
 * target with the star and its digit; choosing fills the stars up to it (ink) and rings the chosen
 * one (cornflower), by CSS `:has()` alone. The empty star is an ink-3 outline. Server-rendered:
 * no client island (§5.4).
 */
import type { ReactElement } from "react";

const STAR =
  "M12 2.6l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.5l-5.9 3.2 1.3-6.6-4.9-4.6 6.6-.8z";

export interface StarRadioGroupProps {
  readonly name: string;
  readonly legend: string;
  /** Each radio's accessible name, "{n} out of 5", indexed by n − 1. */
  readonly optionLabels: readonly string[];
  /** The star the email link chose (`?r=n`), checked on load. */
  readonly defaultValue?: number | undefined;
  /** The error's id, tied to the group with `aria-describedby` (AC-31). */
  readonly errorId?: string | undefined;
  readonly error?: string | undefined;
}

export function StarRadioGroup({
  name,
  legend,
  optionLabels,
  defaultValue,
  errorId,
  error,
}: StarRadioGroupProps): ReactElement {
  return (
    <fieldset
      aria-describedby={error === undefined ? undefined : errorId}
      aria-invalid={error === undefined ? undefined : true}
      className="group/stars m-0 grid min-w-0 gap-[10px] border-0 p-0"
      data-fo-star-group=""
    >
      <legend className="text-ink mb-[10px] p-0 text-[15px] font-bold">
        {legend}
      </legend>
      {error === undefined ? null : (
        <p className="text-danger m-0 text-[14px] font-bold" id={errorId}>
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-[6px]" dir="ltr">
        {optionLabels.map((label, index) => {
          const value = index + 1;
          return (
            <label
              className="border-rule text-ink has-[:checked]:outline-sky has-[:focus-visible]:outline-ink [&:has(~label_input:checked)_svg]:fill-ink [&:has(~label_input:checked)_svg]:stroke-ink has-[:checked]:[&_svg]:fill-ink has-[:checked]:[&_svg]:stroke-ink bg-card relative grid h-[64px] w-[60px] cursor-pointer place-items-center content-center gap-[2px] rounded-[10px] border has-[:checked]:outline-2 has-[:checked]:outline-offset-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2"
              data-fo-star-option={value}
              key={value}
            >
              <input
                aria-label={label}
                className="absolute inset-0 m-0 cursor-pointer opacity-0"
                defaultChecked={defaultValue === value}
                name={name}
                required
                type="radio"
                value={value}
              />
              <svg
                aria-hidden="true"
                className="stroke-ink-3 fill-none"
                focusable="false"
                height={26}
                strokeWidth={1.5}
                viewBox="0 0 24 24"
                width={26}
              >
                <path d={STAR} strokeLinejoin="round" />
              </svg>
              <span aria-hidden="true" className="text-[13px] font-bold">
                {value}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
