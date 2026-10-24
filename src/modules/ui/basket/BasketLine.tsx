/**
 * `BasketLine`: one bouquet in the basket (spec 010 §14 A-founder-2026-10-22 item 6, D5, D8,
 * AC-57, AC-59, AC-60, AC-73; `docs/design/system/components.dc.html` "BasketLine" in its four
 * states; `wireframes/basket-*` `.bk-line`; TASK-349).
 *
 * The 96 px thumbnail (4:5, the `thumb` slot), the product name, then the line's facts: its size,
 * **"To {country}"** in bold ink, its date (or, in a demo line before step 1, the "date at
 * checkout" sentence), and its add-ons. At the inline end, the line's one all-in amount and its
 * Remove. On a phone the amount and Remove share a row under the facts.
 *
 * States, from the line's re-derivation (`assessBasket`, D8): `ok`; `unavailable` (grey, the
 * photograph in greyscale, its notice below, out of the total); `dateGone` (the same grey, its
 * notice with "Use {next}"). Nothing is dropped: an unavailable line stays visible until the
 * buyer removes it. The state is words in the notice as well as grey, never colour alone.
 *
 * Every string and every formatted value arrives as a prop; names, which come from the catalogue
 * and travel untranslated, sit in `<bdi>` so a Latin name inside `/ar-XB` keeps its own direction.
 */
import type { ReactElement, ReactNode } from "react";

import { MONEY_FIGURE } from "../checkout/styles.ts";

export type BasketLineState = "ok" | "unavailable" | "dateGone";

export interface BasketLineProps {
  readonly position: number;
  readonly state: BasketLineState;
  /** The product's name in this locale. */
  readonly name: string;
  /** The photograph (`MediaAsset` in the `thumb` slot), or nothing for the token placeholder. */
  readonly image?: ReactNode;
  /** "18 stems". */
  readonly tier: string;
  /** "To Poland". */
  readonly destination: string;
  /** "Thursday 8 October", or the demo's "You choose the date at checkout." */
  readonly date: string;
  /** "Add-ons · Box of chocolates", when the line has any. */
  readonly addOns?: string;
  /** The line's all-in amount, already through `formatMoney`; absent when it has none to show. */
  readonly amount?: string;
  /** The Remove control (`RemoveLineButton`). */
  readonly remove: ReactNode;
  /** The line's notice (unavailable, or date gone), with its own controls. */
  readonly flag?: ReactNode;
}

export function BasketLine({
  position,
  state,
  name,
  image,
  tier,
  destination,
  date,
  addOns,
  amount,
  remove,
  flag,
}: BasketLineProps): ReactElement {
  const off = state !== "ok";
  return (
    <li
      className="border-rule grid grid-cols-[96px_minmax(0,1fr)] items-start gap-x-[14px] gap-y-[8px] border-b border-solid py-[18px] last:border-b-0 lg:grid-cols-[96px_minmax(0,1fr)_auto] lg:gap-x-[22px] lg:gap-y-[10px] lg:py-[22px]"
      data-fo-basket-line={String(position)}
      data-fo-basket-line-state={state}
    >
      <div
        className={`bg-paper-3 row-span-2 aspect-[4/5] w-[96px] overflow-hidden rounded-[12px] lg:row-span-1 [&_img]:size-full [&_img]:object-cover ${off ? "grayscale" : ""}`}
      >
        {image}
      </div>
      <div className="min-w-0">
        <h2
          className={`display text-md m-0 leading-[1.15] ${off ? "text-ink-3" : "text-ink"}`}
        >
          <bdi>{name}</bdi>
        </h2>
        <p
          className={`mt-[6px] mb-0 grid gap-[3px] text-sm leading-[1.4] ${off ? "text-ink-3" : "text-ink-2"}`}
        >
          <span>{tier}</span>
          <span className={`font-bold ${off ? "" : "text-ink"}`}>
            {destination}
          </span>
          <span>{date}</span>
          {addOns === undefined ? null : <span>{addOns}</span>}
        </p>
      </div>
      <div className="col-start-2 flex items-center justify-between gap-[4px] lg:col-start-3 lg:grid lg:justify-items-end lg:text-end">
        {amount === undefined ? (
          <span />
        ) : (
          <strong
            className={`${MONEY_FIGURE} text-md ${off ? "text-ink-3" : "text-ink"}`}
            data-fo-line-amount=""
          >
            {amount}
          </strong>
        )}
        {remove}
      </div>
      {flag === undefined ? null : (
        <div
          className="rounded-field bg-blush text-ui col-span-2 grid gap-[10px] px-[14px] py-[12px] leading-[1.45] lg:col-span-2 lg:col-start-2"
          data-fo-basket-flag=""
          role="status"
        >
          {flag}
        </div>
      )}
    </li>
  );
}
