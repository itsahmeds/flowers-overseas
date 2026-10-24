/**
 * `BasketCountBadge`: the header Basket link's accessible name and its count slot (spec 010 §14
 * A-founder-2026-10-22 D10, item 8, AC-70, AC-71; `docs/design/system/components.dc.html`
 * "Basket and accounts"; `wireframes/chrome-desktop.dc.html` `.hx-badge`; TASK-349).
 *
 * The server always renders the **empty** state: the name is `nav.basket` ("Basket"), visually
 * hidden, and the slot is a fixed 20 x 20 px box absolutely placed over the icon's inline-end
 * corner, so it takes no space and filling it moves nothing (CLS 0). Every visitor gets the same
 * bytes, so a cached page stays one document with no `Vary` and no `Set-Cookie`. After the LCP
 * paint `./basket-count.ts` writes the figure and the plural name into these two nodes.
 *
 * `count` exists for the design-system gallery and the unit tests, which draw the filled state the
 * island produces (ink on paper with a 2 px paper ring, 12 px bold tabular digits). The header
 * never passes it.
 */
import type { ReactElement } from "react";

/** The slot: empty and transparent, or the ink disc once `data-on` is set. */
export const BASKET_BADGE_CLASS =
  "absolute top-px -end-px grid size-[20px] place-items-center rounded-full text-[12px] leading-none font-bold text-paper [font-variant-numeric:lining-nums_tabular-nums] data-on:bg-ink data-on:shadow-[0_0_0_2px_var(--color-paper)]";

export interface BasketCountBadgeProps {
  /** The link's name: `nav.basket`, or the `nav.basketCount` plural for the gallery's count. */
  readonly name: string;
  /** Gallery and tests only: the figure the island writes. */
  readonly count?: string;
}

export function BasketCountBadge({
  name,
  count,
}: BasketCountBadgeProps): ReactElement {
  return (
    <>
      <span className="sr-only" data-fo-basket-name="">
        {name}
      </span>
      <span
        aria-hidden="true"
        className={BASKET_BADGE_CLASS}
        data-fo-basket-badge=""
        {...(count === undefined || count === "" ? {} : { "data-on": "" })}
      >
        {count}
      </span>
    </>
  );
}
