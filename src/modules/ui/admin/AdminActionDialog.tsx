"use client";

/**
 * An order action's dialog (spec 020a §5.3, §8 "Accessibility", AC-30; `.ad-dialog` in the
 * artboards `admin-order-reroute-*` and `admin-order-cancel-*`; TASK-358). One of the action
 * panel's islands (spec 020a §5.3: client code only for the dialogs and the money field).
 *
 * The opener is a button in the Actions card; it opens a native modal `<dialog>`, so the browser
 * makes the rest of the page inert (the focus trap), moves focus in, and closes on Escape without
 * acting; closing returns focus to the opener. The content is the server's (forms posting to the
 * page's server actions). `initiallyOpen` re-opens it after a refused submission, so the refusal
 * reads where the admin pressed. `closeLabel` adds a Close button at the foot; a dialog whose
 * form has its own "keep" button (cancel) passes none.
 *
 * Every word arrives as a prop from the admin catalogue.
 */
import { type ReactElement, type ReactNode, useEffect, useRef } from "react";

import { type AdminButtonTone, adminButtonClass } from "./AdminControls";

export function AdminActionDialog({
  id,
  openLabel,
  openTone = "ink",
  title,
  wide = false,
  inline = false,
  initiallyOpen = false,
  closeLabel,
  children,
}: {
  readonly id: string;
  readonly openLabel: string;
  readonly openTone?: AdminButtonTone;
  readonly title: ReactNode;
  /** 760 px (the reroute list) instead of 540 px. */
  readonly wide?: boolean;
  /** The opener at its own width (a row's Settle, Waive; spec 030a), not the card's full width. */
  readonly inline?: boolean;
  readonly initiallyOpen?: boolean;
  readonly closeLabel?: string;
  readonly children: ReactNode;
}): ReactElement {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const titleId = `${id}-title`;

  useEffect(() => {
    if (initiallyOpen && dialog.current?.open === false) {
      dialog.current.showModal();
    }
  }, [initiallyOpen]);

  return (
    <>
      <button
        ref={opener}
        id={id}
        type="button"
        aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}
        className={adminButtonClass(openTone, { block: !inline })}
      >
        {openLabel}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        onClose={() => opener.current?.focus()}
        className={`bg-card text-ink m-auto w-[calc(100%-32px)] rounded-[14px] p-0 shadow-[var(--shadow-md)] backdrop:bg-[var(--color-scrim)] ${
          wide ? "max-w-[760px]" : "max-w-[540px]"
        }`}
      >
        <div className="grid gap-[14px] px-[24px] py-[22px]">
          <h2 id={titleId} className="text-[22px] leading-[1.2] font-bold">
            {title}
          </h2>
          {children}
          {closeLabel === undefined ? null : (
            <div className="flex flex-wrap justify-end gap-[8px]">
              <button
                type="button"
                onClick={() => dialog.current?.close()}
                className={adminButtonClass("ghost")}
              >
                {closeLabel}
              </button>
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}

/**
 * A "Cancel" button inside a dialog's own form row (spec 030a's dialogs: Cancel beside the
 * submit): closes the dialog it sits in without submitting; focus returns to the opener.
 */
export function AdminDialogClose({
  label,
}: {
  readonly label: string;
}): ReactElement {
  return (
    <button
      type="button"
      onClick={(event) => event.currentTarget.closest("dialog")?.close()}
      className={adminButtonClass("ghost")}
    >
      {label}
    </button>
  );
}
