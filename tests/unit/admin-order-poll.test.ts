/**
 * The order queue's arrival poll (spec 012 §2.6 "Arrival within 5 s", §11 "Cost signals", AC-18
 * poll half, T-21 without a browser, T-24's "the new-order live region announces"; TASK-222).
 *
 *  - every 3 s while the page is visible it reads the head, and a changed head calls `onArrival`
 *    once with the count of orders added: an order placed at any moment is on screen within one
 *    interval plus one read, under AC-18's 5 s;
 *  - a hidden page reads nothing; an unchanged head, a failed read and a malformed body change
 *    nothing; reads never overlap;
 *  - after 15 minutes without an interaction it stops for good and says so once; an interaction
 *    restarts the 15 minutes; `stop()` (unmount) clears the timer;
 *  - the island renders its polite live region with the checking line and the server's
 *    announcement, and nothing else is announced.
 *
 * The unit project has no DOM, so the poll is driven through `queue-poll.ts` with fake timers and
 * a fake clock; the island is rendered to markup for its live region. The browser half (a real
 * order on an open page) is T-21's e2e, owed to the CI-database task (`docs/tasks/TASK-222.md`).
 */
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";

import {
  createQueuePoller,
  IDLE_PAUSE_MS,
  isQueueHead,
  POLL_INTERVAL_MS,
  type QueueHead,
  type QueuePollerDeps,
  sameHead,
} from "../../src/modules/ui/admin/queue-poll.ts";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined, replace: () => undefined }),
}));

const { OrderQueuePoll } =
  await import("../../src/modules/ui/admin/OrderQueuePoll.tsx");

const FIRST: QueueHead = {
  latestCreatedAt: "2026-10-05T11:32:00.000Z",
  count: 4,
};
const SECOND: QueueHead = {
  latestCreatedAt: "2026-10-05T11:32:04.000Z",
  count: 5,
};

interface Harness {
  readonly deps: QueuePollerDeps;
  readonly heads: (QueueHead | null | Error)[];
  readonly reads: { at: number }[];
  readonly arrivals: { head: QueueHead; added: number }[];
  readonly pauses: number[];
  visible: boolean;
}

function harness(): Harness {
  const state: Harness = {
    heads: [],
    reads: [],
    arrivals: [],
    pauses: [],
    visible: true,
    deps: undefined as unknown as QueuePollerDeps,
  };
  (state as { deps: QueuePollerDeps }).deps = {
    readHead: () => {
      state.reads.push({ at: Date.now() });
      const next = state.heads.length > 0 ? state.heads.shift() : FIRST;
      if (next instanceof Error) return Promise.reject(next);
      return Promise.resolve(next ?? null);
    },
    isVisible: () => state.visible,
    now: () => Date.now(),
    setTimer: (run, ms) => setTimeout(run, ms),
    clearTimer: (handle) => {
      clearTimeout(handle as ReturnType<typeof setTimeout>);
    },
    onArrival: (head, added) => {
      state.arrivals.push({ head, added });
    },
    onPause: () => {
      state.pauses.push(Date.now());
    },
  };
  return state;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-05T11:32:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("the queue's head poll (AC-18)", () => {
  it("reads the head every 3 s while visible, and nothing before the first interval", async () => {
    const h = harness();
    const poller = createQueuePoller(FIRST, h.deps);
    poller.start();
    expect(POLL_INTERVAL_MS).toBe(3_000);
    await vi.advanceTimersByTimeAsync(2_999);
    expect(h.reads).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.reads).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(3_000 * 4);
    expect(h.reads).toHaveLength(5);
    expect(h.reads.map((read) => read.at - h.reads[0]!.at)).toEqual([
      0, 3_000, 6_000, 9_000, 12_000,
    ]);
    expect(h.arrivals).toEqual([]);
    poller.stop();
  });

  it("calls onArrival once when the head changes, with the orders added, within 5 s of the placement", async () => {
    const h = harness();
    const poller = createQueuePoller(FIRST, h.deps);
    poller.start();
    // The order lands 1 ms after a read: the worst case for the next one.
    await vi.advanceTimersByTimeAsync(3_000);
    const placedAt = Date.now() + 1;
    h.heads.push(SECOND, SECOND, SECOND);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(h.arrivals).toEqual([{ head: SECOND, added: 1 }]);
    expect(Date.now() - placedAt).toBeLessThan(5_000);
    await vi.advanceTimersByTimeAsync(6_000);
    expect(h.arrivals).toHaveLength(1);
    poller.stop();
  });

  it("counts several orders added between two reads, and a later head again", async () => {
    const h = harness();
    const poller = createQueuePoller(FIRST, h.deps);
    poller.start();
    const third = { latestCreatedAt: "2026-10-05T11:33:00.000Z", count: 8 };
    h.heads.push(third, third, { ...third, count: 9 });
    await vi.advanceTimersByTimeAsync(9_000);
    expect(h.arrivals).toEqual([
      { head: third, added: 4 },
      { head: { ...third, count: 9 }, added: 1 },
    ]);
    poller.stop();
  });

  it("reads nothing while the page is hidden, and reads again when it is visible", async () => {
    const h = harness();
    h.visible = false;
    const poller = createQueuePoller(FIRST, h.deps);
    poller.start();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(h.reads).toHaveLength(0);
    h.visible = true;
    h.heads.push(SECOND);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(h.reads).toHaveLength(1);
    expect(h.arrivals).toEqual([{ head: SECOND, added: 1 }]);
    poller.stop();
  });

  it("treats a failed read and a missing head as no change, and keeps polling", async () => {
    const h = harness();
    const poller = createQueuePoller(FIRST, h.deps);
    poller.start();
    h.heads.push(new Error("network"), null, SECOND);
    await vi.advanceTimersByTimeAsync(9_000);
    expect(h.reads).toHaveLength(3);
    expect(h.arrivals).toEqual([{ head: SECOND, added: 1 }]);
    poller.stop();
  });

  it("never overlaps two reads: the next interval starts when a slow read settles", async () => {
    const h = harness();
    let release: (head: QueueHead) => void = () => undefined;
    let calls = 0;
    const slow: QueuePollerDeps = {
      ...h.deps,
      readHead: () => {
        calls += 1;
        return new Promise((resolve) => {
          release = resolve;
        });
      },
    };
    const poller = createQueuePoller(FIRST, slow);
    poller.start();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(calls).toBe(1);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(calls).toBe(1);
    release(FIRST);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(calls).toBe(2);
    poller.stop();
  });

  it("pauses once after 15 minutes without an interaction, and reads nothing after", async () => {
    const h = harness();
    const poller = createQueuePoller(FIRST, h.deps);
    poller.start();
    expect(IDLE_PAUSE_MS).toBe(15 * 60 * 1_000);
    await vi.advanceTimersByTimeAsync(IDLE_PAUSE_MS - 3_000);
    expect(h.pauses).toEqual([]);
    expect(poller.paused).toBe(false);
    const readsBefore = h.reads.length;
    await vi.advanceTimersByTimeAsync(3_000);
    expect(h.pauses).toHaveLength(1);
    expect(poller.paused).toBe(true);
    // The tick that paused read nothing, and none follows.
    expect(h.reads).toHaveLength(readsBefore);
    await vi.advanceTimersByTimeAsync(60 * 60 * 1_000);
    expect(h.reads).toHaveLength(readsBefore);
    expect(h.pauses).toHaveLength(1);
    // An interaction after the pause does not restart it: resuming is a reload.
    poller.activity();
    poller.start();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(h.reads).toHaveLength(readsBefore);
  });

  it("counts the idle 15 minutes from the last interaction", async () => {
    const h = harness();
    const poller = createQueuePoller(FIRST, h.deps);
    poller.start();
    await vi.advanceTimersByTimeAsync(10 * 60 * 1_000);
    poller.activity();
    await vi.advanceTimersByTimeAsync(14 * 60 * 1_000);
    expect(h.pauses).toEqual([]);
    await vi.advanceTimersByTimeAsync(60 * 1_000);
    expect(h.pauses).toHaveLength(1);
  });

  it("pauses a hidden tab too: hidden time is not an interaction", async () => {
    const h = harness();
    h.visible = false;
    const poller = createQueuePoller(FIRST, h.deps);
    poller.start();
    await vi.advanceTimersByTimeAsync(IDLE_PAUSE_MS);
    expect(h.pauses).toHaveLength(1);
    expect(h.reads).toHaveLength(0);
  });

  it("stop() clears the armed timer, and start() twice arms one", async () => {
    const h = harness();
    const poller = createQueuePoller(FIRST, h.deps);
    poller.start();
    poller.start();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(h.reads).toHaveLength(1);
    poller.stop();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(h.reads).toHaveLength(1);
  });

  it("accepts only a head-shaped body", () => {
    expect(isQueueHead(FIRST)).toBe(true);
    expect(isQueueHead({ latestCreatedAt: null, count: 0 })).toBe(true);
    for (const bad of [
      null,
      "x",
      { latestCreatedAt: null },
      { latestCreatedAt: 1, count: 0 },
      { latestCreatedAt: null, count: -1 },
      { latestCreatedAt: null, count: 1.5 },
    ]) {
      expect(isQueueHead(bad), JSON.stringify(bad)).toBe(false);
    }
    expect(sameHead(FIRST, { ...FIRST })).toBe(true);
    expect(sameHead(FIRST, { ...FIRST, count: 5 })).toBe(false);
    expect(sameHead(FIRST, { ...FIRST, latestCreatedAt: null })).toBe(false);
  });
});

describe("the island's live region (T-24's announcement, spec 012 §8)", () => {
  const props = {
    headUrl: "/admin/api/orders/head",
    initialHead: FIRST,
    arrivalHref: "/admin/orders?since=2026-10-05T11%3A32%3A00.000Z",
    resumeHref: "/admin/orders",
    checkingLabel: "Checking for new orders every 3 seconds",
    pausedLabel: "Paused after 15 minutes without activity.",
    resumeLabel: "Resume",
  };

  it("is one polite region holding the checking line and the server's announcement", () => {
    const html = renderToStaticMarkup(
      createElement(OrderQueuePoll, { ...props, announcement: "1 new order" }),
    );
    expect(html.match(/aria-live=/gu)).toHaveLength(1);
    expect(html).toMatch(
      /^<span aria-live="polite"[^>]*><span>Checking for new orders every 3 seconds<\/span><span class="sr-only">1 new order<\/span><\/span>$/u,
    );
    expect(html).not.toContain("Paused");
  });

  it("announces nothing before an arrival", () => {
    const html = renderToStaticMarkup(createElement(OrderQueuePoll, props));
    expect(html).toContain('<span class="sr-only"></span>');
  });
});
