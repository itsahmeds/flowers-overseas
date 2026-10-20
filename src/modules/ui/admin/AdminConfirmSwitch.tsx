"use client";

/**
 * The high-risk confirmation (spec 012 §2.4 "High-risk flags … need the key typed to confirm";
 * `.ad-dialog` in the Admin group of `docs/design/system/components.dc.html` and the artboards
 * `admin-flags-{desktop,mobile}.dc.html`; TASK-220). The one client island of the flags page
 * (spec 012 §5.3: islands only for the order poll and confirmation dialogs).
 *
 * The switch opens a native modal `<dialog>`: the browser makes the rest of the page inert (the
 * focus trap), Escape and Cancel close it, and closing returns focus to the switch. Inside, one
 * form posts to the page's server action with the typed key. The confirm button is **always
 * enabled** and nothing is checked here: the server compares the typed key and refuses a mismatch
 * with a message (the 2026-10-05 design audit's decision 5; spec 004 §14 A20).
 *
 * Every word arrives as a prop from the admin catalogue.
 */
import { type ReactElement, type ReactNode, useRef } from "react";

import { ADMIN_SWITCH_CLASS, AdminSwitchTrack } from "./AdminControls";

export function AdminConfirmSwitch({
  id,
  checked,
  labelledBy,
  onLabel,
  offLabel,
  title,
  body,
  fieldName,
  fieldLabel,
  cancelLabel,
  confirmLabel,
  action,
  hidden,
}: {
  readonly id: string;
  readonly checked: boolean;
  readonly labelledBy: string;
  readonly onLabel: string;
  readonly offLabel: string;
  readonly title: ReactNode;
  readonly body: string;
  /** The form field the typed key is posted as. */
  readonly fieldName: string;
  readonly fieldLabel: string;
  readonly cancelLabel: string;
  readonly confirmLabel: string;
  readonly action: (formData: FormData) => Promise<void>;
  /** The toggle's own fields: key, scope, the value asked for, the version. */
  readonly hidden: Readonly<Record<string, string>>;
}): ReactElement {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const titleId = `${id}-title`;
  const fieldId = `${id}-key`;

  return (
    <>
      <button
        ref={trigger}
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${labelledBy} ${id}`}
        className={ADMIN_SWITCH_CLASS}
        onClick={() => dialog.current?.showModal()}
      >
        <AdminSwitchTrack checked={checked} />
        {checked ? onLabel : offLabel}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        onClose={() => trigger.current?.focus()}
        className="bg-card text-ink m-auto w-[calc(100%-48px)] max-w-[480px] rounded-[14px] p-0 shadow-[var(--shadow-md)] backdrop:bg-[var(--color-scrim)]"
      >
        <form action={action} className="grid gap-[14px] px-[24px] py-[22px]">
          <h2 id={titleId} className="text-[22px] leading-[1.2] font-bold">
            {title}
          </h2>
          <p className="text-ink-2 text-[14px]">{body}</p>
          {Object.entries(hidden).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <div className="grid min-w-0 gap-[4px]">
            <label
              htmlFor={fieldId}
              className="text-ink-3 text-[12px] font-bold tracking-[0.08em] uppercase"
            >
              {fieldLabel}
            </label>
            <input
              id={fieldId}
              name={fieldName}
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="border-field-edge bg-card text-ink min-h-[36px] w-full rounded-[8px] border-[1.5px] px-[10px] text-[14px]"
            />
          </div>
          <div className="flex flex-wrap justify-end gap-[8px]">
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="bg-card text-ink inline-flex min-h-[36px] items-center justify-center rounded-[8px] px-[14px] text-[14px] font-bold whitespace-nowrap shadow-[inset_0_0_0_1px_var(--color-field-edge)]"
            >
              {cancelLabel}
            </button>
            <button
              type="submit"
              className="bg-danger text-on-danger inline-flex min-h-[36px] items-center justify-center rounded-[8px] px-[14px] text-[14px] font-bold whitespace-nowrap"
            >
              {confirmLabel}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
