/**
 * The basket reminder's one box (spec 034 §5.3 "Checkout step 2, the box", §14 A-orchestrator-
 * 2026-10-25 item 1: step 3, under the email field; AC-7, AC-32; TASK-449). Drawn as `.co-box` in
 * `docs/design/wireframes/checkout-desktop.dc.html`.
 *
 * A native `<input type="checkbox" name="basketReminder" value="on">` with a visible `<label>` and
 * the hint linked by `aria-describedby`: no JavaScript, never required, never ticked by the server
 * unless the buyer ticked it (`checked` is the caller's decision, from the buyer's own submission
 * or the draft's consent). The label and hint arrive translated; this component holds no string.
 * The whole row is the click target (at least 44 px tall with the label's line).
 */
import type { ReactElement } from "react";

export interface ReminderConsentCheckboxProps {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly checked: boolean;
}

export function ReminderConsentCheckbox({
  id,
  label,
  hint,
  checked,
}: ReminderConsentCheckboxProps): ReactElement {
  const hintId = `${id}-hint`;
  return (
    <div
      className="text-ui grid grid-cols-[24px_minmax(0,1fr)] items-start gap-x-[12px] gap-y-[4px] leading-[1.4]"
      data-fo-reminder-consent=""
    >
      <input
        aria-describedby={hintId}
        className="peer bg-card checked:bg-selected focus-visible:outline-focus m-0 size-[24px] cursor-pointer appearance-none rounded-[6px] shadow-[inset_0_0_0_1.5px_var(--color-field-edge)] checked:bg-[url('data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2024%2024%22%20fill=%22none%22%20stroke=%22white%22%20stroke-width=%223%22%20stroke-linecap=%22round%22%20stroke-linejoin=%22round%22%3E%3Cpath%20d=%22M5%2012l5%205L19%207%22/%3E%3C/svg%3E')] checked:bg-[length:16px_16px] checked:bg-center checked:bg-no-repeat checked:shadow-none focus-visible:outline-[2.5px] focus-visible:outline-offset-[3px] focus-visible:outline-solid"
        defaultChecked={checked}
        id={id}
        name="basketReminder"
        type="checkbox"
        value="on"
      />
      <label className="text-ink min-h-[24px] cursor-pointer" htmlFor={id}>
        {label}
      </label>
      <small className="text-ink-2 col-start-2 text-sm" id={hintId}>
        {hint}
      </small>
    </div>
  );
}
