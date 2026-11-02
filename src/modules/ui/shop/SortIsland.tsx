"use client";
/**
 * `SortIsland` — the listing's sort `<select>` applies the order on `change` (spec 043 §14
 * A-founder-2026-10-22 item 3, revised 2026-10-24; spec 008 AC-9; TASK-289).
 *
 * A progressive enhancement of the server's `<form method="get">`, and renderless: the label, the
 * `<select name="sort">` and the `<noscript>` Sort button are the server's HTML, the same for every
 * visitor, and they work with JavaScript off. This island only reads that DOM. On `change` it
 * navigates with Next's client router (`push`, `scroll: false`) to exactly the URL the GET form
 * would have produced, so no URL, parameter or canonical changes: "Our order" is the bare path,
 * any other order `{path}?sort={key}`, and the page number is dropped as the form drops it.
 *
 * - **No client path hook.** The target is the server's `view.path`, a prop (spec 043 AC-42).
 * - **A value chosen before the island mounted is applied when it mounts** (AC-38 case 6): the
 *   select's value is compared with the order the server rendered.
 * - **Focus stays on the select.** A sorted URL is served by the listing's parameter route, so the
 *   page under the layout can remount on the navigation and take the focused element with it. The
 *   select that started the navigation is remembered here, at module scope (the chunk outlives the
 *   remount), and the new page's island puts the focus back without scrolling (WCAG 2.1 SC 3.2.2:
 *   a change of content, never of context).
 * - **Back restores the order.** When the server's order changes under a mounted island (a Back or
 *   Forward between two orders of one route), the select is set to it, because React does not
 *   update an uncontrolled `<select>` from a changed `defaultValue`.
 *
 * Loaded after paint by `SortLoader` inside `<AfterPaint island="listing-sort" on="paint">`
 * (`../deferred/deferredSet.ts`), so it is never on the first screen's paint path.
 */
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

export interface SortIslandProps {
  /** The `<select>`'s id. */
  readonly selectId: string;
  /** The listing's bare path, `view.path`. */
  readonly path: string;
  /** The order the server rendered. */
  readonly current: string;
  /** The order that is the bare path. */
  readonly defaultSort: string;
}

/** The select whose change started the last navigation, to be focused again on arrival. */
let refocus: string | undefined;

/** The URL the GET form produces for `value`: the bare path for the default order. */
export function sortHref(path: string, value: string, defaultSort: string) {
  return value === defaultSort
    ? path
    : `${path}?sort=${encodeURIComponent(value)}`;
}

export function SortIsland({
  selectId,
  path,
  current,
  defaultSort,
}: SortIslandProps): null {
  const router = useRouter();
  const mounted = useRef(false);

  useEffect(() => {
    try {
      // This island's entry in the deferred set: the e2e finds this chunk by the literal.
      performance.mark("fo:deferred:listing-sort");
    } catch {
      // No User Timing is no reason to lose the sort.
    }
    const select = document.getElementById(selectId);
    if (!(select instanceof HTMLSelectElement)) return undefined;

    if (refocus === selectId) {
      refocus = undefined;
      select.focus({ preventScroll: true });
    }
    if (mounted.current) {
      // A navigation between two orders of a mounted page (Back, Forward): follow the server.
      select.value = current;
    }

    const apply = (): void => {
      if (select.value === current) return;
      refocus = selectId;
      router.push(sortHref(path, select.value, defaultSort), {
        scroll: false,
      });
    };
    if (!mounted.current) {
      mounted.current = true;
      // A value chosen before this island mounted.
      apply();
    }
    select.addEventListener("change", apply);
    return () => {
      select.removeEventListener("change", apply);
    };
  }, [selectId, path, current, defaultSort, router]);

  return null;
}
