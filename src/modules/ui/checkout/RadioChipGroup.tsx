/**
 * `RadioChipGroup` — a `<fieldset>` of real radio buttons drawn as chips (spec 010 §5.3: "Place
 * kind as a radio group"; `docs/design/wireframes/checkout-desktop.dc.html` `.place`; TASK-201).
 *
 * Each chip is a `<label>` around a native radio, so it submits without JavaScript, the arrow
 * keys move the choice, and the whole chip (at least 44 px tall) is the target. The chosen chip
 * swaps the outline for the selected fill. In forced-colours mode the fills are replaced by system
 * colours, so the chosen chip also takes a 3 px ring there: the choice is never the fill alone.
 */
import type { ReactElement, ReactNode } from "react";

import {
  type FieldMessageContent,
  FieldMessages,
  describedBy,
} from "./FieldMessages.tsx";
import { FIELD_LABEL } from "./styles.ts";

export interface RadioChipOption {
  readonly value: string;
  readonly label: string;
}

export interface RadioChipGroupProps extends FieldMessageContent {
  readonly id: string;
  readonly name: string;
  readonly legend: ReactNode;
  readonly options: readonly RadioChipOption[];
  readonly defaultValue?: string;
  readonly required?: boolean;
}

const CHIP =
  "relative inline-flex min-h-(--target-min) cursor-pointer items-center rounded-full bg-card px-[16px] text-ui text-ink shadow-[inset_0_0_0_1.5px_var(--color-rule)] select-none has-[:checked]:bg-selected has-[:checked]:text-on-selected has-[:checked]:shadow-none has-[:checked]:forced-colors:outline-[3px] has-[:checked]:forced-colors:outline-solid has-[:focus-visible]:outline-[2.5px] has-[:focus-visible]:outline-offset-[3px] has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-focus";

export function RadioChipGroup({
  id,
  name,
  legend,
  options,
  defaultValue,
  required = false,
  hint,
  warning,
  error,
}: RadioChipGroupProps): ReactElement {
  const messages = { hint, warning, error };
  return (
    <fieldset
      aria-describedby={describedBy(id, messages)}
      className="m-0 grid min-w-0 gap-[6px] border-0 p-0"
      data-fo-field={id}
      id={id}
    >
      <legend className={`${FIELD_LABEL} mb-[6px] p-0`}>{legend}</legend>
      <div className="flex flex-wrap gap-[8px]">
        {options.map((option) => (
          <label className={CHIP} key={option.value}>
            <input
              className="peer absolute size-px opacity-0"
              defaultChecked={option.value === defaultValue}
              name={name}
              required={required}
              type="radio"
              value={option.value}
            />
            {option.label}
          </label>
        ))}
      </div>
      <FieldMessages id={id} {...messages} />
    </fieldset>
  );
}
