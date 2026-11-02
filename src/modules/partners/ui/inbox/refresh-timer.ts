/**
 * The inbox's freshness rule, as plain timers (spec 011 §2 "Freshness without a reload", AC-26;
 * TASK-214).
 *
 * `refresh()` runs every `intervalMs` while the page is visible; nothing runs while it is hidden;
 * after `idleStopMs` without an interaction the loop stops for good (`onStop()`, the "Refresh"
 * link remains), so an inbox left open on a phone does not keep Neon's compute awake all day
 * (ADR-0015). Uses the global `setTimeout`, so a fake-timer test drives it exactly.
 */
export interface InboxRefreshOptions {
  readonly intervalMs: number;
  readonly idleStopMs: number;
  readonly refresh: () => void;
  readonly isVisible: () => boolean;
  readonly onStop: () => void;
  readonly now?: () => number;
}

export interface InboxRefreshHandle {
  /** An interaction (pointer, key, scroll, focus): the idle clock starts again. */
  touch(): void;
  /** The page's visibility changed: pause while hidden, resume when shown (unless stopped). */
  visibilityChanged(): void;
  /** Stop and release the timer (the component unmounts). */
  dispose(): void;
  readonly stopped: () => boolean;
}

export function startInboxRefresh(
  options: InboxRefreshOptions,
): InboxRefreshHandle {
  const now = options.now ?? (() => Date.now());
  let lastInteraction = now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const clear = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const schedule = () => {
    clear();
    if (stopped || !options.isVisible()) return;
    timer = setTimeout(tick, options.intervalMs);
  };
  function tick(): void {
    timer = undefined;
    if (stopped || !options.isVisible()) return;
    if (now() - lastInteraction >= options.idleStopMs) {
      stopped = true;
      options.onStop();
      return;
    }
    options.refresh();
    schedule();
  }

  schedule();
  return {
    touch() {
      if (stopped) return;
      lastInteraction = now();
    },
    visibilityChanged() {
      if (stopped) return;
      if (options.isVisible()) schedule();
      else clear();
    },
    dispose() {
      stopped = true;
      clear();
    },
    stopped: () => stopped,
  };
}
