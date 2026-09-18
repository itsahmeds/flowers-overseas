/**
 * The one-way gate that makes the locale dialog come **before** the consent sheet (spec 003 §14
 * A14 "shown before the consent sheet, which waits for the dialog to close"; spec 004 AC-13, whose
 * painted order this replaces for the first-visit case; TASK-119).
 *
 * Two overlays can want the screen on a first visit, and §14 A14 fixes the order: the language
 * question is asked first, because a consent decision recorded in one language and then followed
 * by a language switch reads as the site ignoring the answer, and because two sheets stacked at
 * the bottom of a phone is the interstitial Google penalises. So the suggestion **claims** the
 * gate before either island has mounted, and the consent sheet waits until it is released.
 *
 * The mechanism is three DOM operations and one event, chosen so that neither module has to import
 * the other (a Client Component in `src/modules/i18n` may only reach `src/modules/ui` through its
 * public barrel, which would pull the design system's islands into this chunk — spec 004 §14 A1):
 *
 *  - `claim()` — the suggestion **loader** runs it in an effect during hydration, which is before
 *    any `next/dynamic({ ssr: false })` chunk can resolve, so the flag is always in place before
 *    the consent island reads it. No cookie, no storage, no state: one attribute on `<html>`.
 *  - `hold()` — the island took ownership: either the dialog is open, or a country is being
 *    fetched and the answer may still open it.
 *  - `release()` — a final answer exists (the dialog closed, or there is nothing to suggest). It
 *    removes the attribute and fires `fo:locale-gate-released`, which is what the consent island
 *    listens for. Idempotent, because "no dialog" and "dialog closed" both end here.
 *
 * **It fails open, twice.** If the island's chunk never loads, the loader's timeout releases the
 * gate; if the event never arrives at all, the consent island has its own fallback timer. A
 * language courtesy must never be able to suppress a consent sheet — that would be the one bug in
 * this file with a legal consequence rather than a cosmetic one.
 *
 * The two constants are restated in `src/modules/ui/consent/ConsentBannerIsland.tsx` rather than
 * imported, for the module-boundary reason above; `tests/unit/locale-gate.test.ts` pins the two
 * copies equal, in both directions.
 */

/** The attribute on `<html>` while a language question is pending or on screen. */
export const LOCALE_GATE_ATTRIBUTE = "data-fo-locale-gate";

/** Fired on `window` the moment no language question is pending any more. */
export const LOCALE_GATE_RELEASED_EVENT = "fo:locale-gate-released";

/**
 * How long the loader waits for its own island before giving the screen back (ms). It is only
 * ever reached when the island chunk fails to load or to run; the island's own `/api/geo` fetch
 * aborts well inside it, so a slow network resolves the gate through the normal path.
 */
export const LOCALE_GATE_TIMEOUT_MS = 4000;

type GateState = "pending" | "open";

function setState(state: GateState): void {
  try {
    document.documentElement.setAttribute(LOCALE_GATE_ATTRIBUTE, state);
  } catch {
    // A DOM that refuses an attribute is not a reason to lose a page.
  }
}

/** Claimed by the loader during hydration: "a language question may be coming". */
export function claimLocaleGate(): void {
  setState("pending");
}

/** Held by the island: the dialog is open, or its last hint is still in flight. */
export function holdLocaleGate(): void {
  setState("open");
}

/** Released: nothing is pending. Idempotent, and safe to call before any claim. */
export function releaseLocaleGate(): void {
  try {
    document.documentElement.removeAttribute(LOCALE_GATE_ATTRIBUTE);
    window.dispatchEvent(new Event(LOCALE_GATE_RELEASED_EVENT));
  } catch {
    // Same reasoning as above: the consent island's fallback timer covers this.
  }
}

/** True while a language question is pending or on screen (the consent island's initial read). */
export function localeGateHeld(): boolean {
  try {
    return document.documentElement.hasAttribute(LOCALE_GATE_ATTRIBUTE);
  } catch {
    return false;
  }
}

/** Release only a gate the island never took over — the loader's fail-open timeout. */
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
