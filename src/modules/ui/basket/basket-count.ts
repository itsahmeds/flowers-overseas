/**
 * The header basket count's whole client logic (spec 010 §14 A-founder-2026-10-22 D10, item 8;
 * AC-71 render half; TASK-349; `docs/design/wireframes/chrome-desktop.dc.html` "The count").
 *
 * The header's server HTML carries the Basket link with an **empty badge slot of a fixed 20 x 20
 * px**, identical for every visitor (AC-70): `./BasketCountBadge.tsx` renders it, and the link
 * carries, in `data-fo-basket`, every name and figure the count can take, resolved on the server
 * from the `nav.basketCount` plural and `Intl` (index 0 is the empty state, index n the count n,
 * up to `BASKET_MAX_LINES`). This function reads the `fo_basket` cookie (digits only, the number
 * of unplaced lines; item 7) and writes that entry's figure into the slot and its name into the
 * link's accessible name. It makes **no request** and reads nothing else.
 *
 * Anything the server never writes (no cookie, `0`, more than the basket can hold, a value that
 * is not one or two digits) restores the empty state: the slot is empty and the name is
 * `nav.basket` alone. The cookie's pattern is the boundary check: a zod parse would cost more
 * bytes than the island's whole budget (512 B Brotli, AC-71), and the regular expression below is
 * exactly `BASKET_COOKIE_VALUE_PATTERN`'s `^[0-9]{1,2}$` (`tests/unit/basket-count.test.ts` pins
 * the two together).
 *
 * Called by the header's motion module after the LCP paint (`../motion/MotionIsland.tsx`, the
 * deferred set's `motions` entry, spec 004 §14 A-founder-2026-10-15b) and again by the basket
 * page after a Remove (`./BasketRefresh.tsx`). It joins the motion module's chunk rather than
 * adding a request of its own to every page load. No `"use client"`: it is a plain function.
 */

/** The cookie's value, as `BASKET_COOKIE_VALUE_PATTERN` allows it, anywhere in `document.cookie`. */
export const BASKET_COUNT_COOKIE = /(?:^|;\s*)fo_basket=([0-9]{1,2})(?:;|$)/;

/** Writes the count `document.cookie` holds into the header's Basket link, or clears it. */
export function fillBasketCount(d: Document): void {
  const link = d.querySelector<HTMLElement>("[data-fo-basket]");
  const badge = link?.querySelector("[data-fo-basket-badge]");
  const name = link?.querySelector("[data-fo-basket-name]");
  if (!link || !badge || !name) return;
  const entries = JSON.parse(link.dataset["foBasket"] ?? "[]") as string[][];
  const entry =
    entries[Number(BASKET_COUNT_COOKIE.exec(d.cookie)?.[1] ?? 0)] ?? entries[0];
  if (!entry) return;
  badge.textContent = entry[0] ?? "";
  badge.toggleAttribute("data-on", !!entry[0]);
  name.textContent = entry[1] ?? "";
}
