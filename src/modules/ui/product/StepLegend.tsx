/**
 * `StepLegend` and `StepNumber` — the product page's numbered steps ("1 Which size?", "2 When
 * should it arrive?", …) as `docs/design/wireframes/product-desktop.dc.html` draws them: the
 * legend in Fraunces at `--text-md`, the number in a 30 px cornflower ring (`--color-mark`) beside
 * it (TASK-179).
 *
 * The number is **decorative** (`aria-hidden`): the legend's words name the group, and a screen
 * reader hearing "1" before "Which size?" learns nothing it needs. No `step`, no ring — the
 * primitives render the same legend on `/dev/components`, where they are not steps of a page.
 */
import type { ReactElement, ReactNode } from "react";

export function StepNumber({ step }: { readonly step: number }): ReactElement {
  return (
    <span
      aria-hidden="true"
      className="text-mark font-body inline-grid size-[30px] shrink-0 place-items-center rounded-full text-sm font-bold shadow-[inset_0_0_0_1.5px_var(--color-mark)]"
    >
      {step}
    </span>
  );
}

/** The step's heading line, for a step that is not a `<fieldset>` (it renders a `<p>`). */
export const STEP_HEADING =
  "display text-md m-0 mb-[14px] flex items-center gap-[12px] p-0";

/**
 * The v3 buy column's legend (product artboards, round 2): the question in the body face, bold, at
 * the UI size, with no step number. `compact` hides it visually below `md`, where the phone sheet
 * names the group by its legend alone (the sizes' segmented control).
 */
export const BUY_LEGEND = "text-ui text-ink m-0 mb-[10px] p-0 font-bold";

export interface StepLegendProps {
  readonly children: ReactNode;
  /** `buy`: the v3 buy column's plain legend; `buy-phone-hidden`: the same, visually hidden below `md`. */
  readonly look?: "step" | "buy" | "buy-phone-hidden";
  readonly step?: number | undefined;
  /** For a control inside the group that is named by the legend (`aria-labelledby`). */
  readonly id?: string;
}

export function StepLegend({
  children,
  step,
  id,
  look = "step",
}: StepLegendProps): ReactElement {
  const className =
    look === "step"
      ? STEP_HEADING
      : look === "buy"
        ? BUY_LEGEND
        : `${BUY_LEGEND} max-md:sr-only`;
  return (
    <legend className={className} id={id}>
      {step === undefined ? null : <StepNumber step={step} />}
      {children}
    </legend>
  );
}
