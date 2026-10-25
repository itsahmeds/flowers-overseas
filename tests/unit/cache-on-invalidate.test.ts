/**
 * `onInvalidate` (spec 045 §5.2 "`src/lib/cache.ts`", §5.4; TASK-401): an in-process listener told
 * about every `invalidate()` call, with its tags, after the edge purge; a throwing listener never
 * turns a saved change into a failure; unsubscribing stops the calls.
 */
import { afterEach, describe, expect, it } from "vitest";

import {
  type CacheAdapter,
  type InvalidateDeps,
  invalidate,
  onInvalidate,
} from "../../src/lib/cache.ts";
import { createLogger } from "../../src/lib/logger.ts";

const unsubscribes: (() => void)[] = [];

afterEach(() => {
  for (const unsubscribe of unsubscribes.splice(0)) unsubscribe();
});

function deps(events: string[]): Partial<InvalidateDeps> {
  const edge: CacheAdapter = {
    invalidate: (tags) => {
      events.push(`edge:${tags.join(",")}`);
      return Promise.resolve({ ok: true });
    },
  };
  return {
    revalidate: () => undefined,
    edge,
    log: createLogger({ level: "fatal", write: () => undefined }),
    report: () => undefined,
  };
}

describe("onInvalidate", () => {
  it("tells each listener the de-duplicated tags, after the edge purge", async () => {
    const events: string[] = [];
    unsubscribes.push(
      onInvalidate((tags) => events.push(`listener:${tags.join(",")}`)),
    );
    await invalidate(["home:en", "home:en", "hub:en"], deps(events));
    expect(events).toEqual(["edge:home:en,hub:en", "listener:home:en,hub:en"]);
  });

  it("skips a listener that throws and still calls the others, and the purge still succeeds", async () => {
    const events: string[] = [];
    unsubscribes.push(
      onInvalidate(() => {
        throw new Error("listener failed");
      }),
    );
    unsubscribes.push(onInvalidate(() => events.push("second")));
    const outcome = await invalidate(["home:en"], deps(events));
    expect(outcome.origin).toBe("ok");
    expect(outcome.edge).toBe("ok");
    expect(events).toEqual(["edge:home:en", "second"]);
  });

  it("stops calling a listener once it unsubscribes", async () => {
    const events: string[] = [];
    const unsubscribe = onInvalidate(() => events.push("called"));
    await invalidate(["home:en"], deps([]));
    unsubscribe();
    await invalidate(["home:en"], deps([]));
    expect(events).toEqual(["called"]);
  });
});
