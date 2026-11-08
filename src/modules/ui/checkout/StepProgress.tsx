/**
 * `StepProgress`: the checkout's steps as a segmented control (spec 010 §5.3 "Progress": current
 * · completed (link back); four steps since §14 A-founder-2026-10-25a item 1;
 * `docs/design/wireframes/checkout-{desktop,mobile}.dc.html` `.stepper` and `.co-step.co4`;
 * TASK-201, TASK-418).
 *
 * An `<ol>`, labelled; the current step carries `aria-current="step"`; completed steps are links
 * back (`?step=…`, a step already reached, AC-7); future steps are text. The current step is
 * marked by the ink ring and the card fill **and** by `aria-current`, never by colour alone.
 *
 * Below `md` the board draws a compact line ("Step 2 of 4 · Your card" after a bar of four
 * segments, the done and current ones in ink) instead of the control. The compact line is decorative (`aria-hidden`), so the list is kept for
 * assistive technology there, visually hidden rather than removed: a phone screen-reader user
 * still hears which step this is.
 */
import type { ReactElement } from "react";

import type { LocaleCode } from "@/config/locales";
import { formatNumber } from "@/modules/i18n";

export interface StepProgressStep {
  readonly id: string;
  /** "Recipient", "Your card", "Your details", "Check" (`checkout.progress.*`). */
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
  /** "Step 2 of 4 · Your card" (`progress.compact` (checkout catalogue)), for the phone line. */
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
                "font-display flex min-h-(--target-min) flex-1 items-center justify-center rounded-full px-[12px] py-0 text-center text-[18px] leading-[1.1] font-(--font-weight-display)",
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
        <span className="inline-flex gap-[4px]" data-fo-step-bar="">
          {steps.map((step, index) => (
            <span
              className={`block h-[4px] w-[22px] rounded-[2px] ${index <= current ? "bg-ink" : "bg-rule"}`}
              data-fo-step-segment={index <= current ? "on" : "off"}
              key={step.id}
            />
          ))}
        </span>
        {compactLabel}
      </p>
    </div>
  );
}
