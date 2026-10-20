/**
 * The order queue's arrival poll, as plain logic (spec 012 §2.6 "Arrival within 5 s", §11 "Cost
 * signals", AC-18; artboard `admin-orders-desktop.dc.html` "polling paused"; TASK-222).
 *
 *  - every `POLL_INTERVAL_MS` (3 s) **while the page is visible** it reads the queue's head
 *    (`GET /admin/api/orders/head` → `{ latestCreatedAt, count }`) and, when the head differs from
 *    the last one it knew, calls `onArrival` once — the island then re-renders the server list;
 *  - a hidden page reads nothing, and the next tick looks again;
 *  - after `IDLE_PAUSE_MS` (15 minutes) without an interaction it stops for good and calls
 *    `onPause` once, so an idle tab does not keep Neon's compute awake (spec 002 §11). Resuming is
 *    a reload of the same view;
 *  - reads never overlap: the next tick is armed only after the previous read settled, and a read
 *    that fails (network, 401 after the session ended) is skipped, not retried at once.
 *
 * No DOM, no React and no `fetch` here: the island (`OrderQueuePoll.tsx`) passes them in, so the
 * unit project drives this with fake timers (`tests/unit/admin-order-poll.test.ts`).
 */

/** Spec 012 §2.6: every 3 s while visible. */
export const POLL_INTERVAL_MS = 3_000;

/** Spec 012 §2.6: pause after 15 minutes without interaction. */
export const IDLE_PAUSE_MS = 15 * 60 * 1_000;

/** The head the endpoint answers (`OrderQueueHeadSchema`'s shape). */
export interface QueueHead {
  readonly latestCreatedAt: string | null;
  readonly count: number;
}

/** Whether `value` is a head as the endpoint sends it. */
export function isQueueHead(value: unknown): value is QueueHead {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  const latest = record["latestCreatedAt"];
  const count = record["count"];
  return (
    (latest === null || typeof latest === "string") &&
    typeof count === "number" &&
    Number.isInteger(count) &&
    count >= 0
  );
}

/** Whether two heads name the same queue. */
export function sameHead(a: QueueHead, b: QueueHead): boolean {
  return a.latestCreatedAt === b.latestCreatedAt && a.count === b.count;
}

export interface QueuePollerDeps {
  /** One read of the head; `null` when the read failed. */
  readonly readHead: () => Promise<QueueHead | null>;
  readonly isVisible: () => boolean;
  readonly now: () => number;
  readonly setTimer: (run: () => void, ms: number) => unknown;
  readonly clearTimer: (handle: unknown) => void;
  /** The head changed: `head` is the new one, `added` how many more orders it counts. */
  readonly onArrival: (head: QueueHead, added: number) => void;
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
  initial: QueueHead,
  deps: QueuePollerDeps,
): QueuePoller {
  let known = initial;
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
      let head: QueueHead | null = null;
      try {
        head = await deps.readHead();
      } catch {
        head = null;
      }
      if (stopped || paused) return;
      if (head !== null && !sameHead(head, known)) {
        const added = Math.max(0, head.count - known.count);
        known = head;
        deps.onArrival(head, added);
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
