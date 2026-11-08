/**
 * Spec 025's monitor decisions, pure (T-17 to T-27's decision halves; AC-17 to AC-27; TASK-489),
 * on an injected clock. The database halves run in `tests/integration/ops-alerts.test.ts`.
 */
import { describe, expect, it, vi } from "vitest";

import { createLogger } from "../../src/lib/logger.ts";
import {
  bounceRateFires,
  complaintSeverity,
  dispatchRiskSeverity,
  errorRateFires,
  fxState,
  neonSeverity,
  notAcceptedSeverity,
  notDeliveredDue,
  photoMissingSeverity,
  probeUrl,
  resetHeartbeatNotes,
  siteDecision,
  tickHeartbeat,
  weekdayHoursBetween,
} from "../../src/modules/ops/index.ts";

const at = (iso: string) => new Date(iso);
const minutes = (n: number) => n * 60_000;

describe("AC-17 · webhook.error_rate", () => {
  it("2 of 50 fires; 1 of 3 does not; 2 of 200 (1 %) does not", () => {
    expect(errorRateFires(2, 50)).toBe(true);
    expect(errorRateFires(1, 3)).toBe(false);
    expect(errorRateFires(2, 200)).toBe(false);
    expect(errorRateFires(3, 100)).toBe(true);
  });
});

describe("AC-18 · order.not_accepted", () => {
  const offered = at("2026-11-09T10:00:00Z");
  const deadline = at("2026-11-10T16:00:00Z");
  it("P2 at first offer + 120, not a minute earlier; + 60 same-day; P1 from deadline − 3 h", () => {
    expect(
      notAcceptedSeverity(offered, false, deadline, at("2026-11-09T11:59:00Z")),
    ).toBeNull();
    expect(
      notAcceptedSeverity(offered, false, deadline, at("2026-11-09T12:00:00Z")),
    ).toBe("P2");
    expect(
      notAcceptedSeverity(offered, true, deadline, at("2026-11-09T10:59:00Z")),
    ).toBeNull();
    expect(
      notAcceptedSeverity(offered, true, deadline, at("2026-11-09T11:00:00Z")),
    ).toBe("P2");
    expect(
      notAcceptedSeverity(offered, false, deadline, at("2026-11-10T12:59:00Z")),
    ).toBe("P2");
    expect(
      notAcceptedSeverity(offered, false, deadline, at("2026-11-10T13:00:00Z")),
    ).toBe("P1");
  });
  it("measures a night-deferred order from its real offered_at", () => {
    const deferred = at("2026-11-09T07:30:00Z");
    expect(
      notAcceptedSeverity(deferred, false, null, at("2026-11-09T09:29:00Z")),
    ).toBeNull();
    expect(
      notAcceptedSeverity(deferred, false, null, at("2026-11-09T09:30:00Z")),
    ).toBe("P2");
  });
});

describe("AC-19, AC-20 · delivery day", () => {
  it("dispatch_at_risk: nothing before 13:00, P2 from 13:00, P1 from 16:00 local", () => {
    expect(dispatchRiskSeverity(12)).toBeNull();
    expect(dispatchRiskSeverity(13)).toBe("P2");
    expect(dispatchRiskSeverity(15)).toBe("P2");
    expect(dispatchRiskSeverity(16)).toBe("P1");
  });
  it("not_delivered: at 20:00 local, not at 19:59 (hour 19)", () => {
    expect(notDeliveredDue(19)).toBe(false);
    expect(notDeliveredDue(20)).toBe(true);
  });
});

describe("AC-21 · order.photo_missing", () => {
  const delivered = at("2026-11-09T10:00:00Z");
  it("nothing at 1 h 59, P3 at 2 h 1, P2 at 24 h 1", () => {
    expect(
      photoMissingSeverity(
        delivered,
        new Date(delivered.getTime() + minutes(119)),
      ),
    ).toBeNull();
    expect(
      photoMissingSeverity(
        delivered,
        new Date(delivered.getTime() + minutes(121)),
      ),
    ).toBe("P3");
    expect(
      photoMissingSeverity(
        delivered,
        new Date(delivered.getTime() + minutes(1441)),
      ),
    ).toBe("P2");
  });
});

describe("AC-23 · site probes", () => {
  it("health twice raises site.down; one URL twice raises page_failing; one failed run nothing", () => {
    expect(siteDecision({ health: 2, home: 0 })).toEqual({
      down: true,
      failing: [],
    });
    expect(siteDecision({ health: 1, home: 0 })).toEqual({
      down: false,
      failing: [],
    });
    expect(siteDecision({ health: 0, sitemap: 2 })).toEqual({
      down: false,
      failing: ["sitemap"],
    });
    expect(siteDecision({ health: 0, sitemap: 2, home: 2 })).toEqual({
      down: true,
      failing: [],
    });
  });
  it("GETs with the probe User-Agent, no query string and a 10 s timeout", async () => {
    const fetchImpl = vi.fn<
      (url: string | URL | Request, init?: RequestInit) => Promise<Response>
    >(() =>
      Promise.resolve(
        new Response(JSON.stringify({ fxAsOf: "2026-11-06" }), { status: 200 }),
      ),
    );
    const result = await probeUrl(
      "https://flowersoverseas.com/api/health",
      fetchImpl as unknown as typeof fetch,
    );
    expect(result).toEqual({ ok: true, status: 200, fxAsOf: "2026-11-06" });
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(String(url)).not.toContain("?");
    expect(new Headers(init?.headers).get("user-agent")).toBe("fo-probe/1");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("AC-24 · FX", () => {
  // A Friday rate goes stale at the start of Tuesday UTC (two weekdays: Monday, Tuesday).
  const staleAfter = () => Date.parse("2026-11-10T00:00:00Z");
  it("aging only within 24 counted weekday hours; stale after; the weekend does not count", () => {
    expect(fxState("2026-11-06", at("2026-11-06T10:00:00Z"), staleAfter)).toBe(
      "fresh",
    );
    // Saturday 10:00: the weekend adds nothing, so Monday's 24 hours remain: aging.
    expect(fxState("2026-11-06", at("2026-11-07T10:00:00Z"), staleAfter)).toBe(
      "aging",
    );
    expect(fxState("2026-11-06", at("2026-11-09T10:00:00Z"), staleAfter)).toBe(
      "aging",
    );
    expect(fxState("2026-11-06", at("2026-11-10T18:00:00Z"), staleAfter)).toBe(
      "stale",
    );
    expect(
      weekdayHoursBetween(
        at("2026-11-07T00:00:00Z"),
        at("2026-11-09T00:00:00Z"),
      ),
    ).toBe(0);
    expect(
      weekdayHoursBetween(
        at("2026-11-06T23:00:00Z"),
        at("2026-11-09T01:00:00Z"),
      ),
    ).toBe(2);
  });
});

describe("AC-25, AC-26 · email and Neon", () => {
  it("bounce rate: 2 of 25 (8 %) fires, 2 of 24 does not", () => {
    expect(bounceRateFires(2, 25)).toBe(true);
    expect(bounceRateFires(2, 24)).toBe(false);
    expect(bounceRateFires(1, 25)).toBe(false);
  });
  it("complaints: one P3, a second P2", () => {
    expect(complaintSeverity(0)).toBeNull();
    expect(complaintSeverity(1)).toBe("P3");
    expect(complaintSeverity(2)).toBe("P2");
  });
  it("Neon: 69 nothing, 70 P3, 90 P2", () => {
    expect(neonSeverity(69)).toBeNull();
    expect(neonSeverity(70)).toBe("P3");
    expect(neonSeverity(90)).toBe("P2");
  });
});

describe("AC-27 · the heartbeat", () => {
  const queue = (completed: Date | null) => ({
    executeSql: vi.fn(() => Promise.resolve({ rows: [{ at: completed }] })),
  });
  const URL_ = "https://hc-ping.com/00000000-0000-4000-8000-000000000000";
  const now = at("2026-11-09T10:00:00Z");

  it("one GET after a good tick with the monitor fresh", async () => {
    const fetchImpl = vi.fn(async () => Promise.resolve(new Response("OK")));
    const outcome = await tickHeartbeat(queue(at("2026-11-09T09:57:00Z")), {
      url: URL_,
      fetch: fetchImpl as unknown as typeof fetch,
      now: () => now,
      log: createLogger({ write: () => undefined }),
    });
    expect(outcome).toBe("sent");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("none with the monitor last completed 6 minutes ago", async () => {
    const fetchImpl = vi.fn();
    const lines: string[] = [];
    expect(
      await tickHeartbeat(queue(at("2026-11-09T09:54:00Z")), {
        url: URL_,
        fetch: fetchImpl as unknown as typeof fetch,
        now: () => now,
        log: createLogger({ write: (line) => lines.push(line) }),
      }),
    ).toBe("stale");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(lines.join("\n")).not.toContain("hc-ping");
  });

  it("none and one info line per process with the variable unset", async () => {
    resetHeartbeatNotes();
    const lines: string[] = [];
    const log = createLogger({ write: (line) => lines.push(line) });
    expect(await tickHeartbeat(queue(now), { url: undefined, log })).toBe(
      "unset",
    );
    expect(await tickHeartbeat(queue(now), { url: undefined, log })).toBe(
      "unset",
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("ALERT_HEARTBEAT_URL");
  });
});
