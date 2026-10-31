"use client";

/**
 * `BasketRefresh`: what the basket page does after a Remove with JavaScript on (spec 010 §14
 * A-founder-2026-10-22 item 6, AC-79; `wireframes/basket-*` "After Remove"; TASK-349).
 *
 * A Remove is a server action: with JavaScript on the page re-renders in place, and this island
 * stays mounted with the new line count. When the count changes it (1) moves focus to the page's
 * heading (`tabindex="-1"`), so a keyboard or screen-reader user is not left on a button that no
 * longer exists, and (2) refills the header's count from the new `fo_basket` cookie
 * (`./basket-count.ts`), because the header is not re-rendered by the action. The new total is
 * announced by the summary's own `aria-live` region, once. Nothing runs on the first render: a
 * page load leaves focus where the browser puts it. With JavaScript off the Remove is a 303 and a
 * fresh page, whose header island fills the count after paint as on every page.
 *
 * Mounted on the basket page only (no-store, noindex, outside the Lighthouse set), so it is in
 * `NOT_DEFERRED`, not the deferred set.
 */
import { useEffect, useRef } from "react";

import { fillBasketCount } from "./basket-count.ts";

export interface BasketRefreshProps {
  /** The number of lines this render shows. */
  readonly count: number;
  /** The id of the page's `<h1>`. */
  readonly headingId: string;
}

export function BasketRefresh({ count, headingId }: BasketRefreshProps): null {
  const shown = useRef(count);
  useEffect(() => {
    if (shown.current === count) return;
    shown.current = count;
    fillBasketCount(document);
    document.getElementById(headingId)?.focus();
  }, [count, headingId]);
  return null;
}
