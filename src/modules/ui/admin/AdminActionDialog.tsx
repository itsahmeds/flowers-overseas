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
 * `sheetCloseLabel` (TASK-361, artboards `admin-order-*-mobile`): below 768 px the dialog is the
 * phone's bottom sheet (`.ad-sheet`: full width at the foot, a handle, the title beside a Close
 * button); from 768 px it is the centred modal. `size="medium"` is the refund dialog's 560 px.
 * A dialog asked to open on load whose opener is not rendered (the phone's Actions card is
 * folded into its sheet) stays shut, so the page is never made inert by a modal nobody sees.
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
  size,
  inline = false,
  initiallyOpen = false,
  closeLabel,
  sheetCloseLabel,
  children,
}: {
  readonly id: string;
  readonly openLabel: string;
  readonly openTone?: AdminButtonTone;
  readonly title: ReactNode;
  /** 760 px (the reroute list) instead of 540 px. */
  readonly wide?: boolean;
  /** `medium` is 560 px (the refund dialog); overrides `wide`. */
  readonly size?: "default" | "medium" | "wide";
  /** The opener at its own width (a row's Settle, Waive; spec 030a), not the card's full width. */
  readonly inline?: boolean;
  readonly initiallyOpen?: boolean;
  readonly closeLabel?: string;
  /** Below 768 px: a bottom sheet with this Close button beside the title. */
  readonly sheetCloseLabel?: string;
  readonly children: ReactNode;
}): ReactElement {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const titleId = `${id}-title`;

  useEffect(() => {
    if (
      initiallyOpen &&
      dialog.current?.open === false &&
      openerRendered(opener.current)
    ) {
      dialog.current.showModal();
    }
  }, [initiallyOpen]);

  const width = DIALOG_WIDTH[size ?? (wide ? "wide" : "default")];
  const sheet = sheetCloseLabel !== undefined;

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
        className={`bg-card text-ink m-auto w-[calc(100%-32px)] rounded-[14px] p-0 shadow-[var(--shadow-md)] backdrop:bg-[var(--color-scrim)] ${width} ${
          sheet ? SHEET_CLASS : ""
        }`}
      >
        <div
          className={`grid gap-[14px] px-[24px] py-[22px] ${sheet ? SHEET_BODY_CLASS : ""}`}
        >
          {sheet ? (
            <span
              aria-hidden="true"
              className="bg-rule h-[4px] w-[40px] justify-self-center rounded-full md:hidden"
            />
          ) : null}
          <div className="flex items-center justify-between gap-[12px]">
            <h2 id={titleId} className="text-[22px] leading-[1.2] font-bold">
              {title}
            </h2>
            {sheet ? (
              <button
                type="button"
                onClick={() => dialog.current?.close()}
                className="bg-paper-2 text-ink inline-flex min-h-[36px] flex-none cursor-pointer items-center rounded-[8px] px-[12px] text-[14px] font-bold md:hidden"
              >
                {sheetCloseLabel}
              </button>
            ) : null}
          </div>
          {children}
          {closeLabel === undefined ? null : (
            <div
              className={`flex flex-wrap justify-end gap-[8px] ${sheet ? "max-md:hidden" : ""}`}
            >
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

const DIALOG_WIDTH = {
  default: "max-w-[540px]",
  medium: "max-w-[560px]",
  wide: "max-w-[760px]",
} as const;

/** Below 768 px: the bottom sheet (`.ad-sheet`), full width at the foot, the top corners round. */
const SHEET_CLASS =
  "max-md:mb-0 max-md:w-full max-md:max-w-none max-md:max-h-[92dvh] max-md:rounded-ee-none max-md:rounded-es-none max-md:rounded-ss-[16px] max-md:rounded-se-[16px]";
const SHEET_BODY_CLASS = "max-md:px-[16px] max-md:pt-[10px] max-md:pb-[20px]";

/** Whether the opener has a box (a `display: none` ancestor gives it none). */
function openerRendered(opener: HTMLButtonElement | null): boolean {
  return opener !== null && opener.getClientRects().length > 0;
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
