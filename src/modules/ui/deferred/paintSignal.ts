/**
 * `whenReady()` — the moment a deferred island may start loading (spec 004 §14
 * A-founder-2026-10-15b clause 1; TASK-244). See `./deferredSet.ts` for the rule and the set.
 *
 * It fires **once**, at the first of:
 *
 *  1. **after the paint, on idle** (no `control` only): the window's `load` event (the hero
 *     photograph and every other in-viewport image have arrived), then one animation frame and an
 *     idle callback asked for inside it: the idle period comes after that frame has painted them,
 *     so the largest-contentful-paint entry's render time is behind us. A
 *     browser with no `requestIdleCallback` (Safari) takes a zero timeout in its place.
 *  2. **the first interaction** (`FIRST_INTERACTION_EVENTS`): anywhere in the document, or,
 *     given a `control` selector, on that control alone (its descendants included). A visitor who reaches for a control gets its island at once, and the native
 *     element underneath (`<details>`, `<a>`, `<select>`) has already honoured the tap (clause 3).
 *
 * An island that only matters once the visitor acts on its control (the Menu's `Esc`, the
 * sentence's possessive) waits for 2 alone, on that control: a page load that nobody touches,
 * which is what Lighthouse measures, never requests it, and neither does typing in another form
 * (`tests/e2e/checkout-ui.spec.ts` counts the requests a checkout field makes).
 *
 * Small on purpose: this file is in the initial chunk of every document, inside the 131,072 B
 * budget (spec 004 §14 A1). The cleanup aborts the interaction listeners and leaves the `load`
 * listener (it runs once anyway), each frame and the idle callback queued: they find the signal
 * aborted and do nothing.
 *
 * The browser is passed in so `tests/unit/deferred-set.test.tsx` can drive every path in Node.
 */

/**
 * The DOM events that count as an interaction: things only a visitor does. Captured (none of
 * them is a scroll or a wheel, so `passive` would change nothing).
 *
 *  - `pointerdown`: a click or a tap (a touch is one; Safari does not focus a tapped summary).
 *  - `focusin`: a keyboard or a screen reader reaching the control. Every key on a control comes
 *    after its focus, so `keydown` would add nothing on a control.
 *  - `input`: what assistive technology and autofill send without a pointer or a focus (a value
 *    set on the sentence's select).
 *
 * Nothing more: every byte here is in every page load, inside the 131,072 B budget.
 */
export const FIRST_INTERACTION_EVENTS = [
  "pointerdown",
  "focusin",
  "input",
] as const;

/** The longest an idle callback may wait once the page has painted (ms). */
export const IDLE_TIMEOUT_MS = 2000;

/** Where the interaction listeners go: the window, or the island's control. */
export interface InteractionTarget {
  addEventListener(
    type: string,
    listener: () => void,
    options: AddEventListenerOptions,
  ): void;
}

/** The part of `window` the signal uses. */
export interface ReadyEnvironment extends InteractionTarget {
  readonly document: {
    readonly readyState: DocumentReadyState;
    querySelector(selectors: string): InteractionTarget | null;
  };
  requestAnimationFrame(callback: () => void): number;
  requestIdleCallback?:
    | ((callback: () => void, options: { timeout: number }) => number)
    | undefined;
  setTimeout(callback: () => void): number;
}

/**
 * With no `control`: after the paint, on idle, or at the first interaction anywhere (the popup).
 * With a `control`: at the first interaction with that control alone (clause 1: "the first
 * interaction with its control"); a control that is not in the document never loads its island.
 * One `AbortController` removes every interaction listener at once, and is the "done" flag that a
 * frame or idle callback still queued reads.
 */
export function whenReady(
  start: () => void,
  env: ReadyEnvironment,
  control?: string,
): () => void {
  const target =
    control === undefined ? env : env.document.querySelector(control);
  const listening = new AbortController();
  const fire = (): void => {
    if (listening.signal.aborted) return;
    listening.abort();
    start();
  };
  const painted = (): void => {
    // An idle callback asked for inside a frame's callback runs after that frame has painted.
    env.requestAnimationFrame(() => {
      if (env.requestIdleCallback === undefined) env.setTimeout(fire);
      else env.requestIdleCallback(fire, { timeout: IDLE_TIMEOUT_MS });
    });
  };

  for (const type of FIRST_INTERACTION_EVENTS) {
    target?.addEventListener(type, fire, {
      capture: true,
      signal: listening.signal,
    });
  }
  if (control === undefined) {
    // Not captured: the window's own `load`, never an image's.
    if (env.document.readyState === "complete") painted();
    else env.addEventListener("load", painted, { once: true });
  }
  return () => {
    listening.abort();
  };
}
