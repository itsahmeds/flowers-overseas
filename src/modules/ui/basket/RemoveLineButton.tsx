/**
 * `RemoveLineButton`: Remove one basket line (spec 010 §14 A-founder-2026-10-22 items 4 and 6,
 * AC-57; `docs/design/system/components.dc.html` "RemoveLineButton"; `wireframes/basket-*`
 * `.bk-rm`; TASK-349).
 *
 * A submit in **its own form**, posting the line's position as `line` to the basket's remove
 * action, so it works with JavaScript off (a 303 back to the basket) and with it on (the page
 * re-renders in place). The position is the only thing posted: the action deletes the line the
 * basket showed at that position, never a line chosen by anything else in the request.
 *
 * Its accessible name names the bouquet ("Remove Amber Hour from your basket"), because a page of
 * three "Remove" buttons is otherwise three identical names. The visible word stays "Remove".
 * The target is at least 44 x 44 px (AC-79). Two looks, as the basket board draws them: the
 * underlined link-weight word beside the amount (`link`), and the outlined pill inside a line's
 * notice (`ghost`).
 *
 * Copy arrives as props: no file under `src/modules/ui` names a checkout message key (spec 003
 * §14 A17 check 11).
 */
import type { ReactElement } from "react";

import { buttonClass } from "../checkout/styles.ts";

/** `.bk-rm`: bold underlined link ink, 44 px both ways. */
export const REMOVE_LINK_CLASS =
  "inline-flex min-h-(--target-min) min-w-(--target-min) cursor-pointer items-center justify-center border-0 bg-transparent px-[2px] text-sm font-bold text-link underline decoration-[1.5px] underline-offset-4 hover:text-link-strong focus-visible:outline-[2.5px] focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-focus";

/** A server action the form posts to, bound to its locale by the page. */
export type BasketFormAction = (form: FormData) => void | Promise<void>;

export interface RemoveLineButtonProps {
  readonly action: BasketFormAction;
  /** The line's position, 1 to `BASKET_MAX_LINES`. */
  readonly position: number;
  /** The visible word. */
  readonly text: string;
  /** The accessible name, naming the bouquet. */
  readonly label: string;
  readonly variant?: "link" | "ghost";
}

export function RemoveLineButton({
  action,
  position,
  text,
  label,
  variant = "link",
}: RemoveLineButtonProps): ReactElement {
  return (
    <form action={action} className="contents" data-fo-remove-line="">
      <input name="line" type="hidden" value={String(position)} />
      <button
        aria-label={label}
        className={
          variant === "link"
            ? REMOVE_LINK_CLASS
            : buttonClass("ghost", "sm", "px-[20px]")
        }
        type="submit"
      >
        {text}
      </button>
    </form>
  );
}
