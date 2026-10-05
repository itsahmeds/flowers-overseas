"use client";

/**
 * `CardCounter` — the card counter and preview island (spec 010 §5.3 Step 2, §5.4, AC-38;
 * TASK-201).
 *
 * Renderless: the server has already drawn the `<textarea>`, the counter and the preview
 * (`TextAreaWithCounter`), so with JavaScript off the page is complete and the server counts on
 * submit. When this runs, it listens to the field (and to the "sign as" input it mirrors) and
 * rewrites the counter and the `[data-fo-mirror]` preview lines as the buyer types.
 *
 * What it may not do, and the budget test checks in the built bundle
 * (`tests/unit/checkout-ui-islands.test.ts`): import zod, `next-intl`, `Intl` or any module that
 * reaches them; make a network request (`fetch`, XHR, a socket, a beacon, an `EventSource`, a
 * dynamic `import()`); store anything; add an inline script.
 */
import { useEffect } from "react";

import { COUNT_SLOT } from "./counter-slot.ts";
import { approximateGraphemes } from "./graphemes.ts";

export interface CardCounterProps {
  readonly fieldId: string;
  readonly counterId: string;
  readonly template: string;
  readonly max: number;
  /** Other inputs whose value the preview mirrors ("sign as"). */
  readonly mirrorIds?: readonly string[];
}

/** Writes `input`'s value into every preview line that names it. */
function mirror(input: HTMLInputElement | HTMLTextAreaElement): void {
  for (const node of document.querySelectorAll<HTMLElement>(
    "[data-fo-mirror]",
  )) {
    if (node.dataset.foMirror === input.id) node.textContent = input.value;
  }
}

export function CardCounter({
  fieldId,
  counterId,
  template,
  max,
  mirrorIds = [],
}: CardCounterProps): null {
  const mirrored = mirrorIds.join(" ");
  useEffect(() => {
    const field = document.getElementById(fieldId);
    const counter = document.getElementById(counterId);
    if (!(field instanceof HTMLTextAreaElement) || counter === null) return;
    const onField = (): void => {
      const count = approximateGraphemes(field.value);
      counter.textContent = template.replace(COUNT_SLOT, String(count));
      counter.dataset.over = String(count > max);
      mirror(field);
    };
    const onOther = (event: Event): void => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement
      )
        mirror(target);
    };
    const others = mirrored
      .split(" ")
      .map((id) => document.getElementById(id))
      .filter((node): node is HTMLElement => node !== null);
    field.addEventListener("input", onField);
    for (const other of others) other.addEventListener("input", onOther);
    return () => {
      field.removeEventListener("input", onField);
      for (const other of others) other.removeEventListener("input", onOther);
    };
  }, [fieldId, counterId, template, max, mirrored]);
  return null;
}
