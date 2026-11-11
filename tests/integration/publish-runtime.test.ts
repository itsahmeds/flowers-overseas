/**
 * Publishing against a migrated, seeded PG16 (spec 012b §2.3; AC-6, AC-7, AC-38; T-06, T-07,
 * T-40 integration halves; TASK-295).
 *
 * `tests/unit/publish.test.ts` proves the rules over an in-memory store. This suite drives the
 * same rules through the real `publish_run` store (`src/lib/publish-store.ts`) and the boot's
 * `dataAsOf` read (`changedSinceCommands`), so the SQL is exercised, not assumed:
 *
 *  - T-06: one Publish creates one run; a second while it is open and an eleventh in one day are
 *    refused and leave the row count unchanged; the fake target is called once, with `main` in
 *    staging and `release` in production;
 *  - T-07: `requested → building → deployed → verified` on a matching hash and head, a failed
 *    build marks `failed` with its code and reports once, and an illegal move changes nothing;
 *  - T-40: rows changed after `dataAsOf` give exactly their §5.4 tags, and none when nothing
 *    changed.
 *
 * Runs on a throwaway local server only (`./support/scratch-db.ts`), never `.env.local`.
 */
import { resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { commandTags, unionTags } from "../../src/lib/command-tags.ts";
import {
  type PublishRun,
  type PublishStore,
  advancePublishRun,
  fakeTarget,
  requestPublish,
  verifyOnBoot,
} from "../../src/lib/publish.ts";
import { changedSinceCommands } from "../../src/lib/publish-runtime.ts";
import { dbPublishStore } from "../../src/lib/publish-store.ts";
import { readSeedTree } from "../../seed/check.ts";
import { runSeed } from "../../seed/index.ts";
import { buildSeedPlan } from "../../seed/plan.ts";
import { drizzleOver } from "./support/drizzle-tx.ts";
import {
  probeLocalServer,
  scratchDatabase,
  type ScratchDatabase,
} from "./support/scratch-db.ts";

const server = await probeLocalServer();
const REPO_ROOT = resolve(import.meta.dirname, "../..");
const HASH = "b".repeat(64);
const HEAD = "c".repeat(40);
const NOW = new Date("2026-11-11T12:00:00Z");

const noRemoval = { placeholderWindowOpen: true, isIndexable: () => false };
const diff = { added: ["/en/x"], removed: [], expectedHash: HASH };

describe.skipIf(server.url === undefined)(
  `publishing over publish_run${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;

    /** Run `body` with the store over one transaction, as the admin action and the job do. */
    function withStore<T>(body: (store: PublishStore) => Promise<T>) {
      return scratch.sql.begin((tx) =>
        body(dbPublishStore(drizzleOver(tx, scratch.sql))),
      ) as Promise<T>;
    }

    async function runCount(environment: string): Promise<number> {
      const [row] = await scratch.sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM public.publish_run
        WHERE environment = ${environment}`;
      return row?.count ?? -1;
    }

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "publish");
      await runSeed(scratch.sql, buildSeedPlan(await readSeedTree(REPO_ROOT)));
    }, 600_000);

    afterAll(async () => {
      await scratch?.drop();
    });

    it("T-06: one run per Publish; a second while open is refused and writes nothing", async () => {
      const target = fakeTarget(HEAD);
      const run = await withStore((store) =>
        requestPublish(
          {
            environment: "staging",
            reason: "new bouquet",
            requestedBy: null,
            diff,
            removal: noRemoval,
          },
          { store, target, now: NOW },
        ),
      );
      expect(run.status).toBe("requested");
      expect(run.targetRef).toBe("main");
      expect(await runCount("staging")).toBe(1);

      await expect(
        withStore((store) =>
          requestPublish(
            {
              environment: "staging",
              reason: "again",
              requestedBy: null,
              diff,
              removal: noRemoval,
            },
            { store, target, now: NOW },
          ),
        ),
      ).rejects.toMatchObject({ code: "PUBLISH_RUN_OPEN" });
      expect(await runCount("staging")).toBe(1);
      // requestPublish never calls the target; the job does, once.
      expect(target.triggered).toEqual([]);
    });

    it("T-07: the job triggers once, polls, and the matching deployment verifies at boot", async () => {
      const target = fakeTarget(HEAD);
      const open = await withStore((store) => store.openRun("staging"));
      if (open === null) throw new Error("T-06 leaves one open run");
      const deps = (store: PublishStore) => ({
        store,
        target,
        now: new Date(NOW.getTime() + 60_000),
        report: () => undefined,
        invalidate: () => Promise.resolve(),
        warm: () => Promise.resolve(),
      });

      const first = await withStore((store) =>
        advancePublishRun(open.id, diff.added, deps(store)),
      );
      expect(first.status).toBe("building");
      const again = await withStore((store) =>
        advancePublishRun(open.id, diff.added, deps(store)),
      );
      expect(again.status).toBe("building");
      expect(target.triggered).toEqual(["main"]);

      // An illegal edge: building straight to verified by a stale `from` changes nothing.
      expect(
        await withStore((store) =>
          store.move(open.id, "requested", "verified", {}),
        ),
      ).toBe(false);

      target.outcome = "deployed";
      const deployed = await withStore((store) =>
        advancePublishRun(open.id, diff.added, deps(store)),
      );
      expect(deployed.status).toBe("deployed");

      const boot = await withStore((store) =>
        verifyOnBoot({
          store,
          environment: "staging",
          commit: HEAD,
          manifest: { existenceHash: HASH, dataAsOf: null },
          now: new Date(NOW.getTime() + 120_000),
          changedSince: () => Promise.resolve([]),
          invalidate: () => Promise.resolve(),
          report: () => undefined,
        }),
      );
      expect(boot.verifiedRunId).toBe(open.id);
      const verified = await withStore((store) => store.get(open.id));
      expect(verified?.status).toBe("verified");
      expect(verified?.finishedAt).not.toBeNull();
    });

    it("T-07: a failed build marks the run failed with its code and reports once", async () => {
      const target = fakeTarget(HEAD);
      const reports: string[] = [];
      const run: PublishRun = await withStore((store) =>
        requestPublish(
          {
            environment: "production",
            reason: "go",
            requestedBy: null,
            diff,
            removal: noRemoval,
          },
          { store, target, now: NOW },
        ),
      );
      expect(run.targetRef).toBe("release");
      const step = (store: PublishStore) =>
        advancePublishRun(run.id, diff.added, {
          store,
          target,
          now: new Date(NOW.getTime() + 60_000),
          report: (signal) => reports.push(signal),
          invalidate: () => Promise.resolve(),
          warm: () => Promise.resolve(),
        });
      await withStore(step);
      expect(target.triggered).toEqual(["release"]);
      target.outcome = "failed";
      const failed = await withStore(step);
      expect(failed).toEqual({ done: true, status: "failed" });
      const row = await withStore((store) => store.get(run.id));
      expect(row?.errorCode).toBe("PUBLISH_BUILD_FAILED");
      expect(reports).toEqual(["catalogue.publish.failed"]);
    });

    it("T-06: the eleventh publish of a day is refused and writes nothing", async () => {
      // `staging` holds one verified run from above; nine more finished runs make ten today.
      for (let index = 0; index < 9; index += 1) {
        await scratch.sql`
          INSERT INTO public.publish_run (environment, reason, target_ref, expected_hash,
            added_count, removed_count, status, requested_at, finished_at)
          VALUES ('staging', 'earlier', 'main', ${HASH}, 0, 0, 'verified',
            ${NOW.toISOString()}::timestamptz, ${NOW.toISOString()}::timestamptz)`;
      }
      expect(await runCount("staging")).toBe(10);
      await expect(
        withStore((store) =>
          requestPublish(
            {
              environment: "staging",
              reason: "eleventh",
              requestedBy: null,
              diff,
              removal: noRemoval,
            },
            { store, target: fakeTarget(HEAD), now: NOW },
          ),
        ),
      ).rejects.toMatchObject({ code: "PUBLISH_DAILY_LIMIT" });
      expect(await runCount("staging")).toBe(10);
      // The next calendar day starts a new count.
      const tomorrow = new Date(NOW.getTime() + 86_400_000);
      await expect(
        withStore((store) =>
          requestPublish(
            {
              environment: "staging",
              reason: "next day",
              requestedBy: null,
              diff,
              removal: noRemoval,
            },
            { store, target: fakeTarget(HEAD), now: tomorrow },
          ),
        ),
      ).resolves.toMatchObject({ status: "requested" });
    });

    it("T-40: rows changed after dataAsOf give exactly their §5.4 tags; none when nothing changed", async () => {
      const read = (since: Date) =>
        scratch.sql.begin((tx) =>
          changedSinceCommands(drizzleOver(tx, scratch.sql), since),
        );
      const [clock] = await scratch.sql<
        { now: string }[]
      >`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS now`;
      if (clock === undefined) throw new Error("no clock");
      // The build's `dataAsOf` (`scripts/existence-manifest.ts` reads it the same way); every
      // statement below runs in a later transaction, so its `now()` is later.
      const dataAsOf = new Date(clock.now);
      expect(await read(dataAsOf)).toEqual([]);

      const [price] = await scratch.sql<{ sku: string; iso2: string }[]>`
        UPDATE public.country_price cp SET vat_rate_bp = cp.vat_rate_bp
        FROM public.product p, public.country c
        WHERE cp.id = (SELECT id FROM public.country_price
                       WHERE active_to IS NULL ORDER BY id LIMIT 1)
          AND p.id = cp.product_id AND c.id = cp.country_id
        RETURNING p.sku, c.iso2`;
      const [copy] = await scratch.sql<{ sku: string }[]>`
        UPDATE public.product_translation t SET name = t.name || ' '
        FROM public.product p
        WHERE t.product_id = (SELECT id FROM public.product ORDER BY sku DESC LIMIT 1)
          AND t.locale_code = 'en' AND p.id = t.product_id
        RETURNING p.sku`;
      if (price === undefined || copy === undefined) {
        throw new Error("the seed has no price or no product copy");
      }
      const commands = await read(dataAsOf);
      const pricedIn = (
        await scratch.sql<{ iso2: string }[]>`
          SELECT DISTINCT c.iso2 FROM public.country_price cp
          JOIN public.product p ON p.id = cp.product_id
          JOIN public.country c ON c.id = cp.country_id
          WHERE p.sku = ${copy.sku}
            AND (cp.active_to IS NULL OR cp.active_to > current_date)
          ORDER BY c.iso2`
      ).map((row) => row.iso2);
      expect(unionTags(commands)).toEqual(
        unionTags([
          { kind: "price", sku: price.sku, iso2: price.iso2 },
          { kind: "copy", sku: copy.sku, pricedIn },
        ]),
      );
      expect(unionTags(commands)).toEqual(
        expect.arrayContaining([
          ...commandTags({ kind: "price", sku: price.sku, iso2: price.iso2 }),
        ]),
      );
    });
  },
);
