"use client";

/**
 * The phone's Actions bar and sheet (spec 020a §5.3 "Usable at 390 px", §8 "Accessibility";
 * artboard `admin-order-actions-mobile`, `.ad-mbar` and `.ad-sheet`; TASK-361).
 *
 * From 768 px the Actions card renders in place, beside the timeline. Below it, when the card has
 * at least one control, the card folds away and a bar sits at the foot of the screen: its line
 * (the auto-cancel time for `no_partner_available`, otherwise how many actions there are) and an
 * "Actions" button that opens a native modal `<dialog>` as a bottom sheet holding the same card.
 * The browser traps focus in it and closes it on Escape; closing returns focus to the bar's
 * button. The card is rendered in one place at a time, so its forms, ids and dialogs exist once.
 * The page keeps bottom padding the bar's height (`data-actions-bar`, the frame's `:has()` rule),
 * so the bar never hides the last focused element (WCAG 2.4.11).
 *
 * `initiallyOpen`: after a submission the sheet opens on a phone, so the result (or the refusal,
 * with its dialog re-opened) reads where the admin pressed. Every word arrives as a prop.
 */
import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import { adminButtonClass } from "./AdminControls";

/** Below Tailwind's `md` (768 px): the phone layout. */
const PHONE_QUERY = "(max-width: 767.98px)";

function usePhone(): boolean {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const query = window.matchMedia(PHONE_QUERY);
    const update = (): void => setPhone(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return phone;
}

export function AdminActionsSheet({
  title,
  openLabel,
  closeLabel,
  barLine,
  barLineStrong,
  initiallyOpen,
  children,
}: {
  /** The sheet's heading ("Actions"). */
  readonly title: string;
  /** The bar's button ("Actions"). */
  readonly openLabel: string;
  readonly closeLabel: string;
  /** The bar's line: the auto-cancel time, or "2 actions". */
  readonly barLine: string;
  /** The auto-cancel line is bold (`.ad-mbar b`). */
  readonly barLineStrong: boolean;
  readonly initiallyOpen: boolean;
  /** The Actions card. */
  readonly children: ReactNode;
}): ReactElement {
  const phone = usePhone();
  const [open, setOpen] = useState(false);
  const sheet = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const opened = useRef(false);
  const titleId = useId();

  const show = useCallback((): void => {
    if (sheet.current === null || sheet.current.open) return;
    setOpen(true);
    sheet.current.showModal();
  }, []);

  useEffect(() => {
    if (!phone && sheet.current?.open === true) sheet.current.close();
    if (phone && initiallyOpen && !opened.current) {
      opened.current = true;
      show();
    }
  }, [phone, initiallyOpen, show]);

  const inSheet = phone && open;
  return (
    <>
      <div className="max-md:hidden">{inSheet ? null : children}</div>
      <div
        data-actions-bar=""
        className="border-rule bg-paper text-ink-2 fixed start-0 end-0 bottom-0 z-30 flex items-center justify-between gap-[12px] border-t px-[16px] pt-[10px] pb-[14px] text-[13px] leading-[1.35] shadow-[var(--shadow-md)] md:hidden"
      >
        <span>
          {barLineStrong ? <b className="text-ink">{barLine}</b> : barLine}
        </span>
        <button
          ref={opener}
          type="button"
          aria-haspopup="dialog"
          onClick={show}
          className={`${adminButtonClass("primary")} min-h-[44px] flex-none px-[20px]`}
        >
          {openLabel}
        </button>
      </div>
      <dialog
        ref={sheet}
        aria-labelledby={titleId}
        onClose={() => {
          setOpen(false);
          opener.current?.focus();
        }}
        className="bg-card text-ink mx-auto mt-auto mb-0 max-h-[92dvh] w-full max-w-none rounded-ss-[16px] rounded-se-[16px] p-0 shadow-[var(--shadow-md)] backdrop:bg-[var(--color-scrim)] md:hidden"
      >
        <div className="grid gap-[14px] px-[16px] pt-[10px] pb-[20px]">
          <span
            aria-hidden="true"
            className="bg-rule h-[4px] w-[40px] justify-self-center rounded-full"
          />
          <div className="flex items-center justify-between gap-[12px]">
            <h2 id={titleId} className="text-[22px] leading-[1.2] font-bold">
              {title}
            </h2>
            <button
              type="button"
              onClick={() => sheet.current?.close()}
              className="bg-paper-2 text-ink inline-flex min-h-[36px] flex-none cursor-pointer items-center rounded-[8px] px-[12px] text-[14px] font-bold"
            >
              {closeLabel}
            </button>
          </div>
          {/* The card without its own box and heading: the sheet is the box, its title the heading. */}
          <div className="[&>section]:bg-transparent [&>section]:p-0 [&>section]:shadow-none [&>section>h2]:hidden">
            {inSheet ? children : null}
          </div>
        </div>
      </dialog>
    </>
  );
}
