/**
 * The consent sheet's end of the language popup's gate (spec 003 §14 A14 Shape as amended by A16:
 * the popup "shows before the consent sheet and never stacks on it"; AC-28 (f); TASK-119).
 *
 * Every locale document is served with the gate pending on `<html>`; the popup holds it while open
 * and releases it when it closes or never opens (`src/modules/i18n/ui/localeGate.ts`, the writer).
 * The sheet is not painted while the attribute is there. The names are restated rather than
 * imported, because the only legal path from here to the i18n module is its barrel, which would
 * pull the locale registry and its validator into the consent chunk (spec 004 §14 A1).
 * `tests/unit/locale-gate.test.ts` drives this reader and that writer against one document, so a
 * rename on either side fails it.
 */

/** The attribute on `<html>` while the language popup is pending or open. */
export const CONSENT_LOCALE_GATE_ATTRIBUTE = "data-fo-locale-gate";

/** Fired on `window` whenever the attribute changes. */
export const CONSENT_LOCALE_GATE_EVENT = "fo:locale-gate";

/** `useSyncExternalStore`'s subscribe: the sheet re-reads the gate on every change. */
export function subscribeLocaleGate(onChange: () => void): () => void {
  window.addEventListener(CONSENT_LOCALE_GATE_EVENT, onChange);
  return () => {
    window.removeEventListener(CONSENT_LOCALE_GATE_EVENT, onChange);
  };
}

/** True while the language popup is pending or open. A hostile DOM fails open. */
export function localeGateHeld(): boolean {
  try {
    return document.documentElement.hasAttribute(CONSENT_LOCALE_GATE_ATTRIBUTE);
  } catch {
    return false;
  }
}
