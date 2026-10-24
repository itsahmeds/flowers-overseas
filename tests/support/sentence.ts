/**
 * The home sentence's three choices, driven the way a reader drives them (spec 004 §14
 * A-founder-2026-10-21d clause 13; TASK-326).
 *
 * On a mouse the selects are hidden under our own listbox once the sentence's island has loaded
 * (`src/modules/ui/home/sentence-listbox.ts`), and `selectOption` on a hidden select would wait
 * forever. `chooseSentence(page, field, value)` therefore drives the listbox where it will exist
 * (scripts run and the primary pointer is fine: `e2e-desktop`, `a11y`, `visual`) and the native
 * `selectOption` where it will not (`e2e-mobile`, a `javaScriptEnabled: false` context). Either
 * way it ends with the select holding `value`, so no caller's assertion changes.
 */
import { type Locator, type Page, expect } from "@playwright/test";

/** Clause 1's query, as `sentence-listbox.ts` reads it. */
export const FINE_POINTER_QUERY = "(hover: hover) and (pointer: fine)";

export type SentenceField = "who" | "country" | "occasion";

export const sentenceSelect = (page: Page, field: SentenceField): Locator =>
  page.locator(`#send-${field}`);

export const sentenceTrigger = (page: Page, field: SentenceField): Locator =>
  page.locator(
    `[data-fo-sentence-trigger][aria-controls="send-${field}-listbox"]`,
  );

export const sentenceListbox = (page: Page, field: SentenceField): Locator =>
  page.locator(`#send-${field}-listbox`);

/**
 * Whether this page will get the listbox: its scripts run (the App Router's inline payload,
 * `self.__next_f`, exists only where they do) and the primary pointer is fine. `page.evaluate`
 * itself runs in a context with JavaScript off; a failure counts as no listbox.
 */
export async function listboxExpected(page: Page): Promise<boolean> {
  try {
    return await page.evaluate(
      (query) => "__next_f" in self && window.matchMedia(query).matches,
      FINE_POINTER_QUERY,
    );
  } catch {
    return false;
  }
}

/**
 * Loads the sentence's island the way a mouse does, a pointer reaching the form (the heading,
 * which is no control), and waits for the three triggers.
 */
export async function enhanceSentence(page: Page): Promise<void> {
  const triggers = page.locator("[data-fo-sentence-trigger]");
  if ((await triggers.count()) === 3) return;
  await page.locator("form#send > h2, form#send > h3").first().hover();
  await expect(triggers).toHaveCount(3);
}

/** Chooses `value` in `field`: through our listbox on a mouse, the native select elsewhere. */
export async function chooseSentence(
  page: Page,
  field: SentenceField,
  value: string,
): Promise<void> {
  const select = sentenceSelect(page, field);
  if (!(await listboxExpected(page))) {
    await select.selectOption(value);
    await expect(select).toHaveValue(value);
    return;
  }
  await enhanceSentence(page);
  const index = await select.evaluate(
    (node, wanted) =>
      [...(node as HTMLSelectElement).options].findIndex(
        (option) => option.value === wanted,
      ),
    value,
  );
  expect(index, `#send-${field} has an option "${value}"`).toBeGreaterThan(-1);
  const trigger = sentenceTrigger(page, field);
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await page.locator(`#send-${field}-listbox-${String(index)}`).click();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(select).toHaveValue(value);
}
