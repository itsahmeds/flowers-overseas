/**
 * Publishing's rules with the fake target, a fake clock and an in-memory `publish_run` store
 * (spec 012b §2.3; T-06, T-07, T-08, T-40's boot half; TASK-295). The Drizzle store's SQL and
 * the partial unique index are `tests/integration/catalogue-cms-schema.test.ts`'s.
 */
import { describe, expect, it, vi } from "vitest";

import {
  type NewPublishRun,
  PUBLISH_DAILY_LIMIT,
  PUBLISH_FAILED_SIGNAL,
  PUBLISH_RUN_STATUSES,
  PublishError,
  type PublishRun,
  type PublishRunStatus,
  type PublishStore,
  type RemovalContext,
  advancePublishRun,
  canMove,
  fakeTarget,
  isRemovalRefused,
  noTarget,
  railwayState,
  requestPublish,
  selectPublishTarget,
  trackedRef,
  verifyOnBoot,
} from "../../src/lib/publish.ts";

const HASH = "a".repeat(64);
const OTHER_HASH = "b".repeat(64);
const HEAD = "c".repeat(40);
const T0 = new Date("2026-11-02T10:00:00Z");

/** `publish_run` in memory, with `0033`'s one-open-run rule. */
function memoryStore(): PublishStore & { rows: PublishRun[] } {
  const rows: PublishRun[] = [];
  const open = (r: PublishRun) =>
    ["requested", "building", "deployed"].includes(r.status);
  return {
    rows,
    openRun: (environment) =>
      Promise.resolve(
        rows.find((r) => r.environment === environment && open(r)) ?? null,
      ),
    runsOnDay: (environment, now) =>
      Promise.resolve(
        rows.filter(
          (r) =>
            r.environment === environment &&
            r.requestedAt.toISOString().slice(0, 10) ===
              now.toISOString().slice(0, 10),
        ).length,
      ),
    insert: (run: NewPublishRun, now: Date) => {
      if (rows.some((r) => r.environment === run.environment && open(r))) {
        return Promise.reject(new Error("23505 publish_run_open_idx"));
      }
      const row: PublishRun = {
        ...run,
        id: `00000000-0000-4000-8000-${String(rows.length + 1).padStart(12, "0")}`,
        requestedAt: now,
        headSha: null,
        status: "requested",
        providerDeploymentId: null,
        errorCode: null,
        finishedAt: null,
      };
      rows.push(row);
      return Promise.resolve(row);
    },
    get: (id) => Promise.resolve(rows.find((r) => r.id === id) ?? null),
    move: (id, from, to, patch) => {
      const index = rows.findIndex((r) => r.id === id && r.status === from);
      if (index < 0) return Promise.resolve(false);
      rows[index] = { ...(rows[index] as PublishRun), status: to, ...patch };
      return Promise.resolve(true);
    },
    history: (environment, limit) =>
      Promise.resolve(
        rows.filter((r) => r.environment === environment).slice(-limit),
      ),
  };
}

const WINDOW_OPEN: RemovalContext = {
  placeholderWindowOpen: true,
  indexable: () => true,
};

function request(
  store: PublishStore,
  overrides: Partial<Parameters<typeof requestPublish>[0]> = {},
  target = fakeTarget(HEAD),
  now = T0,
) {
  return requestPublish(
    {
      environment: "production",
      reason: "first florist's bouquets",
      requestedBy: null,
      diff: { added: ["/pl/polska/bukiet/a"], removed: [], expectedHash: HASH },
      removal: WINDOW_OPEN,
      ...overrides,
    },
    { store, target, now },
  );
}

async function refusal(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error instanceof PublishError ? error.code : String(error);
  }
}

function advanceDeps(store: PublishStore, target = fakeTarget(HEAD), now = T0) {
  return {
    store,
    target,
    now,
    report: vi.fn(),
    invalidate: vi.fn(() => Promise.resolve()),
    warm: vi.fn(() => Promise.resolve()),
  };
}

describe("T-06: request", () => {
  it("refs: release in production, main in staging, nothing elsewhere", () => {
    expect(trackedRef("production")).toBe("release");
    expect(trackedRef("staging")).toBe("main");
    for (const env of ["preview", "development", "test"])
      expect(trackedRef(env)).toBeNull();
    expect(selectPublishTarget({ PUBLISH_TARGET: "fake" }, "preview")).toBe(
      noTarget,
    );
    expect(selectPublishTarget({}, "production")).toBe(noTarget);
    expect(
      selectPublishTarget({ PUBLISH_TARGET: "fake" }, "staging").kind,
    ).toBe("fake");
  });

  it.each([
    ["production", "release"],
    ["staging", "main"],
  ])(
    "%s: one run, then the job calls the target exactly once with %s",
    async (environment, ref) => {
      const store = memoryStore();
      const target = fakeTarget(HEAD);
      const run = await request(store, { environment }, target);
      expect(store.rows).toHaveLength(1);
      expect(run).toMatchObject({
        status: "requested",
        targetRef: ref,
        expectedHash: HASH,
        addedCount: 1,
      });
      expect(target.triggered).toEqual([]);
      await advancePublishRun(run.id, [], advanceDeps(store, target));
      await advancePublishRun(run.id, [], advanceDeps(store, target));
      expect(target.triggered).toEqual([ref]);
    },
  );

  it("a second request while a run is open is refused and creates nothing", async () => {
    const store = memoryStore();
    await request(store);
    expect(await refusal(request(store))).toBe("PUBLISH_RUN_OPEN");
    expect(store.rows).toHaveLength(1);
  });

  it("the eleventh request of a calendar day is refused and creates nothing; the next day is not", async () => {
    const store = memoryStore();
    for (let i = 0; i < PUBLISH_DAILY_LIMIT; i += 1) {
      const run = await request(store);
      await store.move(run.id, "requested", "failed", {
        errorCode: "PUBLISH_BUILD_FAILED",
        finishedAt: T0,
      });
    }
    expect(await refusal(request(store))).toBe("PUBLISH_DAILY_LIMIT");
    expect(store.rows).toHaveLength(PUBLISH_DAILY_LIMIT);
    await request(
      store,
      {},
      fakeTarget(HEAD),
      new Date("2026-11-03T00:00:01Z"),
    );
    expect(store.rows).toHaveLength(PUBLISH_DAILY_LIMIT + 1);
  });

  it("no target: refused with nothing written", async () => {
    const store = memoryStore();
    expect(await refusal(request(store, {}, noTarget as never))).toBe(
      "PUBLISH_TARGET_NONE",
    );
    expect(await refusal(request(store, { environment: "preview" }))).toBe(
      "PUBLISH_TARGET_NONE",
    );
    expect(store.rows).toHaveLength(0);
  });
});

describe("T-08: the indexable-removal refusal", () => {
  const indexable = new Set(["/en/poland/shop/roses", "/pl/polska/sklep/roze"]);
  const closed: RemovalContext = {
    placeholderWindowOpen: false,
    indexable: (url) => indexable.has(url),
  };

  it("window off: a removal list with indexable URLs is refused and names every one", async () => {
    const store = memoryStore();
    let error: unknown;
    try {
      await request(store, {
        diff: {
          added: [],
          removed: [
            "/en/poland/shop/roses",
            "/en/poland/product/x",
            "/pl/polska/sklep/roze",
          ],
          expectedHash: HASH,
        },
        removal: closed,
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(PublishError);
    expect((error as PublishError).code).toBe("PUBLISH_REMOVES_INDEXABLE");
    expect((error as PublishError).urls).toEqual([
      "/en/poland/shop/roses",
      "/pl/polska/sklep/roze",
    ]);
    expect(store.rows).toHaveLength(0);
  });

  it("window on: the same removal is allowed", async () => {
    const store = memoryStore();
    await request(store, {
      diff: { added: [], removed: [...indexable], expectedHash: HASH },
      removal: { ...closed, placeholderWindowOpen: true },
    });
    expect(store.rows).toHaveLength(1);
  });

  it("isRemovalRefused: a registered exemption lifts one URL; with none, every indexable removal is refused (spec 044 AC-16)", () => {
    for (const url of indexable)
      expect(isRemovalRefused(url, closed)).toBe(true);
    expect(isRemovalRefused("/en/poland/product/x", closed)).toBe(false);
    const exempt = {
      ...closed,
      exemptions: [(url: string) => url === "/en/poland/shop/roses"],
    };
    expect(isRemovalRefused("/en/poland/shop/roses", exempt)).toBe(false);
    expect(isRemovalRefused("/pl/polska/sklep/roze", exempt)).toBe(true);
  });
});

describe("T-07: the run", () => {
  it("every illegal edge is refused; the legal ones are exactly the spec's", () => {
    const legal = new Set([
      "requested>building",
      "building>deployed",
      "deployed>verified",
      "requested>failed",
      "building>failed",
      "deployed>failed",
      "requested>timed_out",
      "building>timed_out",
      "deployed>timed_out",
    ]);
    for (const from of PUBLISH_RUN_STATUSES) {
      for (const to of PUBLISH_RUN_STATUSES) {
        expect(canMove(from, to), `${from}>${to}`).toBe(
          legal.has(`${from}>${to}`),
        );
      }
    }
  });

  it("a build failure from the fake target marks the run failed with a code and one Sentry event", async () => {
    const store = memoryStore();
    const target = fakeTarget(HEAD);
    const run = await request(store, {}, target);
    const deps = advanceDeps(store, target);
    await advancePublishRun(run.id, [], deps);
    target.outcome = "failed";
    const outcome = await advancePublishRun(run.id, [], deps);
    expect(outcome).toEqual({ done: true, status: "failed" });
    expect(store.rows[0]).toMatchObject({
      status: "failed",
      errorCode: "PUBLISH_BUILD_FAILED",
    });
    expect(store.rows[0]?.finishedAt).toEqual(T0);
    expect(deps.report).toHaveBeenCalledTimes(1);
    expect(deps.report).toHaveBeenCalledWith(
      PUBLISH_FAILED_SIGNAL,
      expect.anything(),
    );
  });

  it("30 minutes with no deployment marks timed_out; 29 do not", async () => {
    const store = memoryStore();
    const target = fakeTarget(HEAD);
    const run = await request(store, {}, target);
    await advancePublishRun(run.id, [], advanceDeps(store, target));
    const at29 = await advancePublishRun(
      run.id,
      [],
      advanceDeps(store, target, new Date(T0.getTime() + 29 * 60_000)),
    );
    expect(at29.status).toBe("building");
    const at30 = advanceDeps(
      store,
      target,
      new Date(T0.getTime() + 30 * 60_000),
    );
    expect(await advancePublishRun(run.id, [], at30)).toEqual({
      done: true,
      status: "timed_out",
    });
    expect(store.rows[0]?.errorCode).toBe("PUBLISH_TIMED_OUT");
    expect(at30.report).toHaveBeenCalledTimes(1);
  });

  it("verified only on a matching hash and head; then sitemap once and each added URL warmed once", async () => {
    for (const [hash, commit, expected] of [
      [HASH, HEAD, "verified"],
      [OTHER_HASH, HEAD, "failed"],
      [HASH, "d".repeat(40), "deployed"],
    ] as const) {
      const store = memoryStore();
      const target = fakeTarget(HEAD);
      const run = await request(store, {}, target);
      await advancePublishRun(run.id, [], advanceDeps(store, target));
      target.outcome = "deployed";
      await advancePublishRun(run.id, [], advanceDeps(store, target));
      const boot = await verifyOnBoot({
        store,
        environment: "production",
        commit,
        manifest: { existenceHash: hash, dataAsOf: null },
        now: T0,
        changedSince: () => Promise.resolve([]),
        invalidate: vi.fn(),
        report: vi.fn(),
      });
      expect(
        store.rows[0]?.status,
        `${hash.slice(0, 1)} ${commit.slice(0, 1)}`,
      ).toBe(expected as PublishRunStatus);
      expect(boot.verifiedRunId).toBe(expected === "verified" ? run.id : null);
      if (expected === "verified") {
        const deps = advanceDeps(store, target);
        const added = ["/pl/polska/bukiet/a", "/en/poland/product/a"];
        expect(await advancePublishRun(run.id, added, deps)).toEqual({
          done: true,
          status: "verified",
        });
        expect(deps.invalidate).toHaveBeenCalledTimes(1);
        expect(deps.invalidate).toHaveBeenCalledWith(["sitemap"]);
        expect(deps.warm).toHaveBeenCalledTimes(1);
        expect(deps.warm).toHaveBeenCalledWith(added);
      }
    }
  });

  it("a deployment that boots before the poll saw it deployed still verifies", async () => {
    const store = memoryStore();
    const target = fakeTarget(HEAD);
    const run = await request(store, {}, target);
    await advancePublishRun(run.id, [], advanceDeps(store, target));
    expect(store.rows[0]?.status).toBe("building");
    await verifyOnBoot({
      store,
      environment: "production",
      commit: HEAD,
      manifest: { existenceHash: HASH, dataAsOf: null },
      now: T0,
      changedSince: () => Promise.resolve([]),
      invalidate: vi.fn(),
      report: vi.fn(),
    });
    expect(store.rows[0]?.status).toBe("verified");
  });

  it("Railway's statuses fold to three", () => {
    expect(railwayState("SUCCESS")).toBe("deployed");
    for (const s of ["FAILED", "CRASHED", "REMOVED", "SKIPPED"])
      expect(railwayState(s)).toBe("failed");
    for (const s of ["QUEUED", "BUILDING", "DEPLOYING", "INITIALIZING"])
      expect(railwayState(s)).toBe("building");
  });
});

describe("T-40: the dataAsOf boot invalidation", () => {
  const base = {
    store: memoryStore(),
    environment: "production",
    commit: HEAD,
    now: T0,
    report: vi.fn(),
  };

  it("invalidates once with exactly the changed rows' tags", async () => {
    const invalidate = vi.fn(() => Promise.resolve());
    const changedSince = vi.fn(() =>
      Promise.resolve(["product:FO-BQ-001", "catalog:PL", "product:FO-BQ-001"]),
    );
    const outcome = await verifyOnBoot({
      ...base,
      manifest: {
        existenceHash: HASH,
        dataAsOf: "2026-11-02T09:59:00.000000Z",
      },
      changedSince,
      invalidate,
    });
    expect(changedSince).toHaveBeenCalledWith(
      new Date("2026-11-02T09:59:00.000Z"),
    );
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith([
      "catalog:PL",
      "product:FO-BQ-001",
    ]);
    expect(outcome.invalidatedTags).toEqual([
      "catalog:PL",
      "product:FO-BQ-001",
    ]);
  });

  it("does not invalidate when no row changed, nor without a dataAsOf", async () => {
    for (const dataAsOf of ["2026-11-02T09:59:00Z", null]) {
      const invalidate = vi.fn(() => Promise.resolve());
      await verifyOnBoot({
        ...base,
        manifest: { existenceHash: HASH, dataAsOf },
        changedSince: () => Promise.resolve([]),
        invalidate,
      });
      expect(invalidate).not.toHaveBeenCalled();
    }
  });
});
