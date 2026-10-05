"use client";

/**
 * `BlurValidation` — the on-blur validation island (spec 010 §5.3 "Form quality", §5.4, AC-38;
 * TASK-201).
 *
 * Renderless and mounted once per step form: it listens on the form for `input` (to mark a field
 * edited) and `focusout` (to check it), and hands the field to `applyFieldState()`
 * (`validation.ts`), which shows or hides the field's message. Without JavaScript nothing changes:
 * the server validates every submit, which is the rule with or without this island.
 *
 * The step form must carry `noValidate`, so the browser never blocks a submit with its own
 * bubbles and the server's error summary is what the buyer sees (TASK-204 renders the forms).
 *
 * No zod, no `next-intl`, no `Intl`, no network request, no storage, no inline script
 * (`tests/unit/checkout-ui-islands.test.ts` reads the built bundle for each).
 */
import { useEffect } from "react";

import { applyFieldState } from "./validation.ts";

export interface BlurValidationProps {
  /** The id of the step's `<form>`. */
  readonly formId: string;
}

function isControl(
  target: EventTarget | null,
): target is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement
  );
}

export function BlurValidation({ formId }: BlurValidationProps): null {
  useEffect(() => {
    const form = document.getElementById(formId);
    if (form === null) return;
    const onInput = (event: Event): void => {
      if (isControl(event.target)) event.target.dataset.foDirty = "";
    };
    const onBlur = (event: Event): void => {
      if (isControl(event.target)) applyFieldState(event.target, document);
    };
    form.addEventListener("input", onInput);
    form.addEventListener("change", onInput);
    form.addEventListener("focusout", onBlur);
    return () => {
      form.removeEventListener("input", onInput);
      form.removeEventListener("change", onInput);
      form.removeEventListener("focusout", onBlur);
    };
  }, [formId]);
  return null;
}
