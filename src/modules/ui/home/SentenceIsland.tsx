"use client";
/**
 * `SentenceIsland` — keeps the occasion labels' possessive in step with "who it's for" (spec 004
 * §14 A21 clause 4; TASK-177; founder, 2026-10-04: "Send flowers to [my mum] in [Poland] for [her
 * birthday].").
 *
 * The home's only island, and a progressive enhancement: the form is complete without it. The
 * server renders every occasion `<option>` with its label for the default "who" (my mum → "her
 * birthday") **and** carries the three forms as `data-label-her|his|their`; each "who" option
 * carries its `data-pronoun`. When the reader picks someone else, this swaps each option's text
 * for the matching form. It renders nothing, imports no catalogue, reads no storage and makes no
 * network request; it only reads the DOM the server wrote. It also runs once on mount, so a
 * back/forward restore that kept a different "who" relabels the occasions too.
 */
import { useEffect } from "react";

export interface SentenceIslandProps {
  /** The form's id (`SENTENCE_IDS.form`). */
  readonly formId: string;
}

export function SentenceIsland({ formId }: SentenceIslandProps): null {
  useEffect(() => {
    const form = document.getElementById(formId);
    const who = form?.querySelector<HTMLSelectElement>(
      "[data-fo-sentence-who]",
    );
    if (
      form === null ||
      form === undefined ||
      who === null ||
      who === undefined
    )
      return undefined;
    const sync = (): void => {
      const pronoun = who.selectedOptions[0]?.dataset["pronoun"] ?? "their";
      for (const option of form.querySelectorAll<HTMLOptionElement>(
        "option[data-label-their]",
      )) {
        const label = option.getAttribute(`data-label-${pronoun}`);
        if (label !== null) option.textContent = label;
      }
    };
    sync();
    who.addEventListener("change", sync);
    return () => {
      who.removeEventListener("change", sync);
    };
  }, [formId]);
  return null;
}
