/**
 * The gate that puts the language popup **before** the consent sheet (spec 003 §14 A14 Shape as
 * amended by A16, "it shows before the consent sheet and never stacks on it"; AC-28 (f); spec
 * 004 §14 A23 AC-39 "never on screen together with the consent sheet"; TASK-119).
 *
 * One attribute on `<html>` and one event on `window`, so neither island imports the other (a
 * Client Component in `src/modules/i18n` may reach `src/modules/ui` only through its barrel, which
 * would pull the design system's islands into this chunk, spec 004 §14 A1):
 *
 *  - **pending from the first byte** — `src/app/[locale]/layout.tsx` renders
 *    `localeGateDocumentAttributes()` on `<html>`, the same for every visitor, so the gate is held
 *    before either island's chunk exists (`/break 205` hole 3: a claim made from a client effect
 *    could be dropped with nothing but a race to show it).
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
 * The two names are restated in `src/modules/ui/consent/localeGateReader.ts` for the boundary
 * reason above; `tests/unit/locale-gate.test.ts` drives both ends against one document.
 */

/** The attribute on `<html>` while the language popup is pending (`pending`) or open (`open`). */
export const LOCALE_GATE_ATTRIBUTE = "data-fo-locale-gate";

/** Fired on `window` whenever the attribute changes. */
export const LOCALE_GATE_EVENT = "fo:locale-gate";

/** How long the loader waits for its island before giving the screen back (ms). */
export const LOCALE_GATE_TIMEOUT_MS = 4000;

type GateState = "pending" | "open";

/** The gate as every locale document is served: pending. Rendered by the layout on `<html>`. */
export function localeGateDocumentAttributes(): Record<string, string> {
  const pending: GateState = "pending";
  return { [LOCALE_GATE_ATTRIBUTE]: pending };
}

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

/**
 * The loader's effect (`LanguagePopupLoader.tsx`): give the screen back to the consent sheet if
 * the popup's island never takes the gate. The document is served with the gate pending, so a
 * chunk that fails or never arrives would otherwise hide the sheet for good (`/break 205` hole 4).
 *
 *  - the import **rejects**: released at once, because no popup can open;
 *  - the import **never settles**, or the island never runs: released after
 *    `LOCALE_GATE_TIMEOUT_MS`.
 *
 * Both release only a gate still pending, never one an open popup holds. Returns the cleanup.
 */
export function guardLocaleGate(island: Promise<unknown>): () => void {
  const timer = setTimeout(releaseAbandonedLocaleGate, LOCALE_GATE_TIMEOUT_MS);
  island.catch(() => {
    releaseAbandonedLocaleGate();
  });
  return () => {
    clearTimeout(timer);
  };
}

/** The part of `<dialog>` the island's effect drives. */
export interface GateDialog {
  readonly open: boolean;
  showModal(): void;
}

/**
 * The island's effect (`LanguagePopupIsland.tsx`): while the popup is to be open the gate is
 * **held**, then the dialog opens, so the consent sheet steps back before the popup paints; when
 * it is not, the gate is released. Holding first is what keeps the loader's timer from releasing
 * the gate under an open popup.
 */
export function syncLocaleGate(dialog: GateDialog | null, open: boolean): void {
  if (!open || dialog === null) {
    releaseLocaleGate();
    return;
  }
  holdLocaleGate();
  if (!dialog.open) dialog.showModal();
}
