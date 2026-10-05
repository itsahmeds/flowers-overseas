/**
 * `StickyActionBar` — the phone's docked primary action (spec 004 §14 A24 clause 4 (a), AC-48;
 * TASK-195 for the primitive; TASK-196, TASK-197, TASK-182 and TASK-183 mount it).
 *
 * It reproduces the `.dock` of `docs/design/wireframes/home-mobile.dc.html` and
 * `product-mobile.dc.html`: a card-white bar on the viewport's foot with a rule and the sticky
 * shadow above it, an optional price on the inline start (caption over the amount, in the display
 * face) and the action filling the rest. Below `md` only; from `md` up it is `display: none`.
 *
 * The rules it must keep live in one place, `src/app/globals.css` (`@utility action-bar` and the
 * `body:has([data-fo-action-bar])` block after it):
 *
 *  - **opaque**: `--color-card`, alpha 1 (the artboard's 96 % mix would let text show through);
 *  - **the safe area**: the bar's block size and its `padding-block-end` both add
 *    `env(safe-area-inset-bottom)`, and the document's foot is padded by the same amount, so at
 *    the bottom of the page no content box sits under the bar;
 *  - **the consent sheet never covers the action**: while a bar is on the page the sheet stands on
 *    top of it rather than over it;
 *  - **CLS 0**: it is `position: fixed` and hides by a transform (`hidden`), so showing or hiding
 *    it moves nothing.
 *
 * **It repeats, it never replaces.** Every action in it has a twin in the page's flow, or is an
 * in-page link to one (`#send`, `#buy`), so with JavaScript off nothing is lost. A price in it is
 * the caller's formatted string from **the same projection** the visible selected price prints
 * (price shown = price charged); this component formats nothing.
 */
import type { ReactElement, ReactNode } from "react";

export interface StickyActionBarProps {
  /** The action: a `Button` with an `href` to the page's own twin, or the twin's anchor. */
  readonly children: ReactNode;
  /**
   * The selected price, already formatted by `formatMoney` from the same view the page prints it
   * from, and its caption (e.g. the size). Omitted on a bar with no price (the home).
   */
  readonly price?:
    { readonly amount: string; readonly caption?: ReactNode } | undefined;
  /** Hidden until the page decides to show it (e.g. once the hero has scrolled out). */
  readonly hidden?: boolean;
  readonly className?: string;
}

export function StickyActionBar({
  children,
  price,
  hidden = false,
  className,
}: StickyActionBarProps): ReactElement {
  return (
    <div
      className={["action-bar md:hidden", className].filter(Boolean).join(" ")}
      data-fo-action-bar={hidden ? "hidden" : "shown"}
    >
      {price === undefined ? null : (
        <p className="m-0 grid leading-[1.15]" data-fo-action-bar-price>
          {price.caption === undefined ? null : (
            <small className="text-ink-subtle text-xs">{price.caption}</small>
          )}
          <strong className="display num text-md">{price.amount}</strong>
        </p>
      )}
      <div className="flex min-w-0 flex-1 [&>*]:min-h-[52px] [&>*]:flex-1">
        {children}
      </div>
    </div>
  );
}
