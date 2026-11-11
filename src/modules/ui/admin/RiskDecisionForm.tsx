"use client";

/**
 * One risk decision dialog's form (spec 021 §5.3 "Buttons", §8 "Accessibility"; the three dialogs
 * of `admin-risk-{desktop,mobile}.dc.html`; TASK-494): the reason picker (one radio per reason the
 * board draws for the decision, the first chosen), what happens in admin words with the buyer's
 * sentence quoted for a cancel, and Keep reviewing / the decision. Posts `ReviewDecisionSchema`'s
 * fields; `expectedStatus` is always `open`. Focus moves to the chosen reason when the dialog
 * opens (`autoFocus` on the checked radio). Every word arrives as a prop.
 */
import { type ReactElement, useState } from "react";

import { adminButtonClass, type AdminButtonTone } from "./AdminControls";
import { AdminPendingSubmit } from "./AdminPendingSubmit";

/** One consequence line; `quote` is the buyer's sentence quoted after it. */
export interface RiskConsequence {
  readonly text: string;
  readonly quote?: string;
}

export interface RiskReasonOption {
  readonly value: string;
  readonly label: string;
}

export function RiskDecisionForm({
  action,
  reviewId,
  decision,
  legend,
  reasons,
  whatHappens,
  consequences,
  keepLabel,
  confirmLabel,
  pendingLabel,
  tone,
}: {
  readonly action: (formData: FormData) => Promise<void>;
  readonly reviewId: string;
  readonly decision: "approve" | "cancel" | "cancel_block";
  readonly legend: string;
  readonly reasons: readonly RiskReasonOption[];
  readonly whatHappens: string;
  readonly consequences: readonly RiskConsequence[];
  readonly keepLabel: string;
  readonly confirmLabel: string;
  readonly pendingLabel: string;
  readonly tone: AdminButtonTone;
}): ReactElement {
  const [reason, setReason] = useState(reasons[0]?.value ?? "");
  return (
    <form action={action} className="grid gap-[14px]">
      <input type="hidden" name="reviewId" value={reviewId} />
      <input type="hidden" name="decision" value={decision} />
      <input type="hidden" name="expectedStatus" value="open" />
      <fieldset className="grid min-w-0 gap-[4px]">
        <legend className="text-ink-3 mb-[4px] text-[12px] font-bold tracking-[0.08em] uppercase">
          {legend}
        </legend>
        <div className="bg-card grid overflow-hidden rounded-[10px] shadow-[inset_0_0_0_1px_var(--color-field-edge)]">
          {reasons.map((option) => {
            const on = option.value === reason;
            return (
              <label
                key={option.value}
                className={`border-rule flex min-h-[36px] cursor-pointer items-center gap-[10px] border-b px-[12px] text-[14px] last:border-b-0 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-[-3px] ${
                  on ? "bg-sage-wash font-bold" : ""
                }`}
              >
                <input
                  type="radio"
                  name="reason"
                  value={option.value}
                  checked={on}
                  autoFocus={on}
                  onChange={() => setReason(option.value)}
                  className="accent-selected size-[16px] flex-none"
                />
                {option.label}
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="bg-paper-2 grid gap-[6px] rounded-[10px] px-[14px] py-[12px] text-[14px] leading-[1.45] shadow-[inset_0_0_0_1px_var(--color-rule)]">
        <span className="text-ink-3 text-[12px] font-bold tracking-[0.08em] uppercase">
          {whatHappens}
        </span>
        <ul className="grid gap-[4px]">
          {consequences.map((line) => (
            <li
              key={line.text}
              className="before:text-ink-3 flex gap-[8px] before:flex-none before:font-bold before:content-['·']"
            >
              <span>
                {line.text}
                {line.quote === undefined ? null : (
                  <>
                    {" "}
                    <q className="italic">{line.quote}</q>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-wrap justify-end gap-[8px]">
        <button
          type="button"
          onClick={(event) => event.currentTarget.closest("dialog")?.close()}
          className={adminButtonClass("ghost")}
        >
          {keepLabel}
        </button>
        <AdminPendingSubmit
          tone={tone}
          label={confirmLabel}
          pendingLabel={pendingLabel}
        />
      </div>
    </form>
  );
}
