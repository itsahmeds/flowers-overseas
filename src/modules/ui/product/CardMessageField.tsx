"use client";

/**
 * `CardMessageField` — the product page's **one** client island (spec 004 §14 A21 clause 5; spec
 * 009 AC-14's slot; `docs/design/wireframes/product-{desktop,mobile}.dc.html` "3 What should the
 * card say?" and "Printed card · as the buyer types"; TASK-179).
 *
 * It renders the card-message `<textarea>` and its character counter, and mirrors what is typed
 * into every printed-card preview on the page (`[data-fo-card-text]`, drawn by the server in
 * `PrintedCardPreview`; the page has one under the gallery at `lg` and one under the field below
 * it, of which CSS shows exactly one). Without JavaScript the field still types and each preview
 * keeps its labelled sample sentence — the state the artboard draws first.
 *
 * **The message goes nowhere.** The `<textarea>` has **no `name`**, so no form can submit it; the
 * island stores nothing (no cookie, no storage, no URL) and makes no network access of any kind —
 * no `fetch`, no XHR, no socket, no dynamic import (spec 009 AC-14; `tests/unit/product-card-
 * preview.test.tsx` reads this file and its import graph for each). It adds no inline script.
 *
 * **Strings arrive as props** (spec 004 §13 Q13 option (b)): no `next-intl`, no `Intl`, no zod in
 * the browser. The counter's limit half (`/ 400`) is formatted on the server; only the typed
 * length is printed here, and it is a count of UTF-16 code units, the same unit `maxLength`
 * limits, so the two never disagree.
 */
import { useEffect, useState } from "react";
import type { ReactElement } from "react";

export interface CardMessageFieldProps {
  readonly id: string;
  readonly placeholder: string;
  readonly maxLength: number;
  /** The server-formatted limit half of the counter, e.g. "/ 400". */
  readonly limit: string;
  readonly className?: string;
}

/** The selector of every preview paragraph the server drew. */
export const CARD_TEXT_SELECTOR = "[data-fo-card-text]";

export function CardMessageField({
  id,
  placeholder,
  maxLength,
  limit,
  className,
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

  return (
    <>
      <textarea
        aria-describedby={`${id}-count`}
        className={className}
        id={id}
        maxLength={maxLength}
        onChange={(event) => {
          setText(event.target.value);
        }}
        placeholder={placeholder}
        rows={5}
        value={text}
      />
      <p
        className="text-ink-subtle num mt-[6px] text-end text-xs"
        id={`${id}-count`}
      >
        {text.length} {limit}
      </p>
    </>
  );
}
