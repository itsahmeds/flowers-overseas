"use client";

/**
 * `CardMessageField` — the product page's **one** client island (spec 004 §14 A21 clause 5; spec
 * 009 AC-14's slot; `docs/design/wireframes/product-{desktop,mobile}.dc.html` "What should the
 * card say?"; TASK-179, TASK-228, TASK-229).
 *
 * It does two small things, both on text the server already printed:
 *
 *  1. **The card message.** It renders the card-message `<textarea>` and its counter, and mirrors
 *     what is typed into the printed-card preview (`[data-fo-card-text]`, drawn by the server in
 *     `PrintedCardPreview`). The limit is **graphemes**, the one constant checkout uses
 *     (`CARD_MESSAGE_MAX`, spec 004 AC-51): the counter shows the grapheme count against it, and a
 *     grapheme past it is refused (a paste is cut to the limit). It sets no `maxLength`: that
 *     attribute counts UTF-16 units, so it would refuse a 200-grapheme message with an emoji in
 *     it. Without JavaScript the field still types, goes nowhere, and the preview keeps its
 *     labelled sample sentence.
 *  2. **The size follows the buyer** (spec 009 §14 A12, AC-31; spec 004 AC-48; TASK-228). When a
 *     size radio (`name="tier"`) is chosen, every `[data-fo-tier-slot]` on the page (the buy
 *     price, "The price" tier row and its equivalents line, the total and the docked bar) takes
 *     the text the server printed for that size on the radio itself (`data-fo-say-<slot>`). No
 *     money is computed here: each string is the server's `formatMoney` of the view model's
 *     projection, so the island's total equals the server's byte for byte (spec 009 AC-13). The
 *     total is an `aria-live="polite"` region, so the change is announced (§8). On load it also
 *     reads the checked radio, because a browser may restore another size than the default.
 *
 * **The message goes nowhere.** The `<textarea>` has **no `name`**, so no form can submit it; the
 * island stores nothing (no cookie, no storage, no URL) and makes no network access of any kind —
 * no `fetch`, no XHR, no socket, no dynamic import (spec 009 AC-14; `tests/unit/product-card-
 * preview.test.tsx` reads this file and its import graph for each). It adds no inline script.
 *
 * **Strings arrive as props or as the server's own text** (spec 004 §13 Q13 option (b)): no
 * `next-intl`, no `Intl`, no zod in the browser. Graphemes are counted by checkout's own
 * in-browser count, `approximateGraphemes()` (`../checkout/graphemes.ts`, dependency-free and
 * pinned equal to the server's `countGraphemes()` on checkout's fixture set), so the card counts
 * the same way on the product page and at checkout.
 */
import { useEffect, useState } from "react";
import type { ReactElement } from "react";

import { approximateGraphemes } from "../checkout/graphemes.ts";

export interface CardMessageFieldProps {
  readonly id: string;
  /** The id of the visible text that names the field (the step's legend). */
  readonly labelledBy: string;
  /** The limit in graphemes (`CARD_MESSAGE_MAX`). */
  readonly max: number;
  /** The limit, formatted on the server (`formatNumber`), e.g. "200". */
  readonly limit: string;
  readonly className?: string;
  readonly counterClassName?: string;
}

/** The selector of every preview paragraph the server drew. */
export const CARD_TEXT_SELECTOR = "[data-fo-card-text]";

/** Every node that shows a figure of the selected size, and the radios that carry each size's. */
export const TIER_SLOT_SELECTOR = "[data-fo-tier-slot]";
export const TIER_RADIO_SELECTOR = 'input[name="tier"]';

/**
 * The longest start of `text` that is at most `max` graphemes: whole code points are added while
 * the count stays within the limit, so a cluster's extending marks stay with it and the next
 * cluster is where it stops.
 */
function cut(text: string, max: number): string {
  let kept = "";
  for (const char of text) {
    if (approximateGraphemes(kept + char) > max) break;
    kept += char;
  }
  return kept;
}

/** Put the checked size's server-printed text into every slot that shows a figure of the size. */
function showCheckedTier(): void {
  const radio = document.querySelector<HTMLInputElement>(
    `${TIER_RADIO_SELECTOR}:checked`,
  );
  if (radio === null) return;
  for (const node of document.querySelectorAll<HTMLElement>(
    TIER_SLOT_SELECTOR,
  )) {
    const text = radio.getAttribute(
      `data-fo-say-${node.dataset.foTierSlot ?? ""}`,
    );
    // Only on a change, so the live region speaks only when the figure moved.
    if (text !== null && node.textContent !== text) node.textContent = text;
  }
}

export function CardMessageField({
  id,
  labelledBy,
  max,
  limit,
  className,
  counterClassName,
}: CardMessageFieldProps): ReactElement {
  const [text, setText] = useState("");

  useEffect(() => {
    for (const node of document.querySelectorAll<HTMLElement>(
      CARD_TEXT_SELECTOR,
    )) {
      // The sample sentence is the server's text, kept on the node so clearing the field puts
      // it back without a second copy of the string in this bundle.
      node.dataset.foCardSample ??= node.textContent;
      node.textContent = text === "" ? node.dataset.foCardSample : text;
      node.dataset.foCardText = text === "" ? "sample" : "typed";
    }
  }, [text]);

  useEffect(() => {
    const onChange = (event: Event): void => {
      if (
        event.target instanceof HTMLInputElement &&
        event.target.matches(TIER_RADIO_SELECTOR)
      ) {
        showCheckedTier();
      }
    };
    showCheckedTier();
    document.addEventListener("change", onChange);
    return () => {
      document.removeEventListener("change", onChange);
    };
  }, []);

  return (
    <>
      <textarea
        aria-describedby={`${id}-count`}
        aria-labelledby={labelledBy}
        className={className}
        id={id}
        onChange={(event) => {
          const value = event.target.value;
          if (approximateGraphemes(value) <= max) {
            setText(value);
          } else if (approximateGraphemes(text) < max) {
            // A paste past the limit keeps what fits; a grapheme typed at the limit is refused.
            setText(cut(value, max));
          }
        }}
        rows={5}
        value={text}
      />
      <p className={counterClassName} id={`${id}-count`}>
        {approximateGraphemes(text)}
        {" / "}
        {limit}
      </p>
    </>
  );
}
