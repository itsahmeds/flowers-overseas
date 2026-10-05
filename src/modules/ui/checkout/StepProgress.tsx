/**
 * `StepProgress` — the three steps as a segmented control (spec 010 §5.3 "Progress": three steps
 * · current · completed (link back); `docs/design/wireframes/checkout-{desktop,mobile}.dc.html`
 * `.stepper` and `.co-step`; TASK-201).
 *
 * An `<ol>`, labelled; the current step carries `aria-current="step"`; completed steps are links
 * back (`?step=…`, a step already reached, AC-7); future steps are text. The current step is
 * marked by the ink ring and the card fill **and** by `aria-current`, never by colour alone.
 *
 * Below `md` the board draws a compact line ("Step 1 of 3 · Recipient" with three dots) instead
 * of the control. The compact line is decorative (`aria-hidden`), so the list is kept for
 * assistive technology there, visually hidden rather than removed: a phone screen-reader user
 * still hears which step this is.
 */
import type { ReactElement } from "react";

import type { LocaleCode } from "@/config/locales";
import { formatNumber } from "@/modules/i18n";

export interface StepProgressStep {
  readonly id: string;
  /** "Recipient", "Card and you", "Check" (`checkout.progress.*`). */
  readonly name: string;
  /** Set on completed steps only: the link back. */
  readonly href?: string;
}

export interface StepProgressProps {
  readonly locale: LocaleCode;
  /** "Checkout steps" (`progress.label` (checkout catalogue)). */
  readonly label: string;
  readonly steps: readonly StepProgressStep[];
  /** The index of the current step in `steps`. */
  readonly current: number;
  /** "Step 1 of 3 · Recipient" (`progress.compact` (checkout catalogue)), for the phone line. */
  readonly compactLabel: string;
}

export function StepProgress({
  locale,
  label,
  steps,
  current,
  compactLabel,
}: StepProgressProps): ReactElement {
  return (
    <div className="mb-[16px] md:mb-[22px]">
      <ol
        aria-label={label}
        className="bg-paper-3 m-0 flex list-none gap-[4px] rounded-full p-[4px] max-md:sr-only"
      >
        {steps.map((step, index) => {
          const isCurrent = index === current;
          const isDone = index < current && step.href !== undefined;
          const text = (
            <>
              {formatNumber(index + 1, locale)}
              {" · "}
              {step.name}
            </>
          );
          return (
            <li
              aria-current={isCurrent ? "step" : undefined}
              className={[
                "font-display flex min-h-(--target-min) flex-1 items-center justify-center rounded-full px-[12px] py-[10px] text-center text-[18px] leading-[1.1] font-(--font-weight-display)",
                isCurrent
                  ? "bg-card text-ink shadow-[var(--shadow-sm),inset_0_0_0_1.5px_var(--color-ink)]"
                  : isDone
                    ? "text-ink"
                    : "text-ink-3",
              ].join(" ")}
              data-fo-step={step.id}
              key={step.id}
            >
              {isDone ? (
                <a
                  className="flex min-h-(--target-min) items-center text-inherit no-underline hover:underline"
                  href={step.href}
                >
                  {text}
                </a>
              ) : (
                text
              )}
            </li>
          );
        })}
      </ol>
      <p
        aria-hidden="true"
        className="text-ink-2 m-0 flex items-center gap-[10px] text-sm md:hidden"
      >
        <span className="inline-flex gap-[6px]">
          {steps.map((step, index) => (
            <span
              className={`block size-[8px] rounded-full ${index === current ? "bg-ink" : "bg-rule"}`}
              key={step.id}
            />
          ))}
        </span>
        {compactLabel}
      </p>
    </div>
  );
}
