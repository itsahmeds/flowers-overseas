/**
 * The gate that puts the language popup **before** the consent sheet (spec 003 §14 A14 Shape as
 * amended by A16, "it shows before the consent sheet and never stacks on it"; AC-28 (f); spec
 * 004 §14 A23 AC-39 "never on screen together with the consent sheet"; TASK-119).
 *
 * One attribute on `<html>` and one event on `window`, so neither island imports the other (a
 * Client Component in `src/modules/i18n` may reach `src/modules/ui` only through its barrel, which
 * would pull the design system's islands into this chunk, spec 004 §14 A1):
 *
 *  - `claimLocaleGate()` — the popup **loader** runs it in an effect during hydration, before any
 *    `next/dynamic({ ssr: false })` chunk can resolve, so the attribute is in place before the
 *    consent island first reads it.
 *  - `holdLocaleGate()` — the popup is open.
 *  - `releaseLocaleGate()` — no popup is open or pending: the visitor closed or chose, or a valid
 *    `fo_locale` means it never opens.
 *
 * Every change fires `LOCALE_GATE_EVENT`, and the consent island reads the attribute on each one,
 * so the two can never be on screen together, whichever chunk arrives first.
 *
 * **It fails open.** If the popup's chunk never runs, the loader's timer releases a gate still
 * `pending`; a privacy courtesy must not be able to hide the consent question for good. If the
 * popup then opens late after all, it holds the gate again and the consent sheet steps back until
 * it closes, so "never stacked" holds in that case too.
 *
 * The two names are restated in `src/modules/ui/consent/ConsentBannerIsland.tsx` for the
 * boundary reason above; `tests/unit/locale-gate.test.ts` pins the two copies equal.
 */

/** The attribute on `<html>` while the language popup is pending (`pending`) or open (`open`). */
export const LOCALE_GATE_ATTRIBUTE = "data-fo-locale-gate";

/** Fired on `window` whenever the attribute changes. */
export const LOCALE_GATE_EVENT = "fo:locale-gate";

/** How long the loader waits for its island before giving the screen back (ms). */
export const LOCALE_GATE_TIMEOUT_MS = 4000;

type GateState = "pending" | "open";

function announce(): void {
  window.dispatchEvent(new Event(LOCALE_GATE_EVENT));
}

function setGate(state: GateState): void {
  try {
    document.documentElement.setAttribute(LOCALE_GATE_ATTRIBUTE, state);
    announce();
  } catch {
    // A DOM that refuses an attribute is not a reason to lose a page.
  }
}

/** Claimed by the loader during hydration: the popup may be about to open. */
export function claimLocaleGate(): void {
  setGate("pending");
}

/** Held by the island while the dialog is open. */
export function holdLocaleGate(): void {
  setGate("open");
}

/** Nothing is pending or open. Idempotent, and safe to call before any claim. */
export function releaseLocaleGate(): void {
  try {
    document.documentElement.removeAttribute(LOCALE_GATE_ATTRIBUTE);
    announce();
  } catch {
    // Same reasoning as `setGate`.
  }
}

/** The loader's fail-open timer: releases a gate only while no island has taken it over. */
export function releaseAbandonedLocaleGate(): void {
  try {
    if (
      document.documentElement.getAttribute(LOCALE_GATE_ATTRIBUTE) !== "pending"
    ) {
      return;
    }
  } catch {
    return;
  }
  releaseLocaleGate();
}
