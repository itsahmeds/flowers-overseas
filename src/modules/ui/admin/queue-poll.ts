/**
 * The order queue's arrival poll, as plain logic (spec 012 §2.6 "Arrival within 5 s", §11 "Cost
 * signals", AC-18; artboard `admin-orders-desktop.dc.html` "polling paused"; TASK-222).
 *
 *  - every `POLL_INTERVAL_MS` (3 s) **while the page is visible** it reads the queue head's tag
 *    (the `ETag` of `GET /admin/api/orders/head`, `orderQueueHeadTag({ latestCreatedAt, count })`)
 *    and, when the tag differs from the last one it knew, calls `onArrival` once — the island then
 *    re-renders the server list;
 *  - a hidden page reads nothing, and the next tick looks again;
 *  - after `IDLE_PAUSE_MS` (15 minutes) without an interaction it stops for good and calls
 *    `onPause` once, so an idle tab does not keep Neon's compute awake (spec 002 §11). Resuming is
 *    a reload of the same view;
 *  - reads never overlap: the next tick is armed only after the previous read settled, and a read
 *    that fails (network, 401 after the session ended) is skipped, not retried at once.
 *
 * The tag is opaque here: it is compared, never parsed, so no schema (and no zod) reaches the
 * browser; the list it triggers is parsed and rendered on the server. No DOM, no React and no
 * `fetch` either: the island (`OrderQueuePoll.tsx`) passes them in, so the unit project drives
 * this with fake timers (`tests/unit/admin-order-poll.test.ts`).
 */

/** Spec 012 §2.6: every 3 s while visible. */
export const POLL_INTERVAL_MS = 3_000;

/** Spec 012 §2.6: pause after 15 minutes without interaction. */
export const IDLE_PAUSE_MS = 15 * 60 * 1_000;

export interface QueuePollerDeps {
  /** One read of the head's tag; `null` when the read failed or carried none. */
  readonly readTag: () => Promise<string | null>;
  readonly isVisible: () => boolean;
  readonly now: () => number;
  readonly setTimer: (run: () => void, ms: number) => unknown;
  readonly clearTimer: (handle: unknown) => void;
  /** The head changed; `tag` is the new one. */
  readonly onArrival: (tag: string) => void;
  /** The poll stopped after 15 idle minutes. */
  readonly onPause: () => void;
}

export interface QueuePoller {
  /** Arms the first tick. Calling it twice arms one. */
  start(): void;
  /** Stops for good (unmount). */
  stop(): void;
  /** A person interacted with the page: the idle clock starts again. */
  activity(): void;
  /** Whether the 15-minute pause has stopped the poll. */
  readonly paused: boolean;
}

export function createQueuePoller(
  initialTag: string,
  deps: QueuePollerDeps,
): QueuePoller {
  let known = initialTag;
  let lastActivity = deps.now();
  let timer: unknown;
  let armed = false;
  let stopped = false;
  let paused = false;

  const arm = (): void => {
    if (stopped || paused) return;
    armed = true;
    timer = deps.setTimer(() => {
      armed = false;
      void tick();
    }, POLL_INTERVAL_MS);
  };

  const tick = async (): Promise<void> => {
    if (stopped || paused) return;
    if (deps.now() - lastActivity >= IDLE_PAUSE_MS) {
      paused = true;
      deps.onPause();
      return;
    }
    if (deps.isVisible()) {
      let tag: string | null = null;
      try {
        tag = await deps.readTag();
      } catch {
        tag = null;
      }
      if (stopped || paused) return;
      if (tag !== null && tag !== "" && tag !== known) {
        known = tag;
        deps.onArrival(tag);
      }
    }
    arm();
  };

  return {
    start() {
      if (!armed && !stopped && !paused) arm();
    },
    stop() {
      stopped = true;
      if (armed) deps.clearTimer(timer);
      armed = false;
    },
    activity() {
      if (!paused) lastActivity = deps.now();
    },
    get paused() {
      return paused;
    },
  };
}
