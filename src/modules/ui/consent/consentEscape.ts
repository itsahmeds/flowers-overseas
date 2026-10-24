/**
 * One `Esc`, one layer (spec 004 §14 A-founder-2026-10-19c clause 4, restated by
 * A-founder-2026-10-19d clause 5, AC-17 (d); TASK-279).
 *
 * Overlays form a stack and one `Esc` press acts on the top layer only. The language popup is
 * asked first (spec 003 §14 A16), so while its gate is held the consent sheet is not the top layer
 * and ignores the key; and the press that closed the popup is not a second press, so the sheet
 * ignores it too, even if the popup released its gate while that press was still being dispatched.
 * Only a later press reaches the sheet, and it records nothing (AC-17, §8).
 *
 * Pure and dependency-free, so the island imports it at no cost and
 * `tests/unit/locale-gate.test.ts` drives it against the real gate writer and reader.
 */

/** The island's phases: nothing shown, the sheet, the sheet with the panel, the confirmation. */
export type ConsentPhase = "hidden" | "shown" | "settings" | "saved";

/** What an `Esc` press does: nothing, back from the panel to the sheet, or close the sheet. */
export type ConsentEscapeStep = "ignore" | "back" | "close";

export interface ConsentEscapeContext {
  /** True when the site has a consent source and the sheet asks on first view (`prompt`). */
  readonly prompt: boolean;
  /** True while the language popup holds its gate (`localeGateHeld()`). */
  readonly gated: boolean;
  /** The key event's `timeStamp`. */
  readonly pressedAt: number;
  /** When the gate was last released (`performance.now()`), or `-Infinity` if never held. */
  readonly releasedAt: number;
}

export function consentEscapeStep(
  phase: ConsentPhase,
  { prompt, gated, pressedAt, releasedAt }: ConsentEscapeContext,
): ConsentEscapeStep {
  if (phase === "hidden" || gated || pressedAt <= releasedAt) return "ignore";
  // The panel steps back to the sheet only where there is a sheet to step back to: with nothing
  // to ask (no consent source), the panel was opened on its own from "Cookie settings" and `Esc`
  // closes it, returning focus to that control (AC-9 as amended).
  if (phase === "settings" && prompt) return "back";
  return "close";
}
