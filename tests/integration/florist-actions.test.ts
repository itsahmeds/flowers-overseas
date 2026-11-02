/**
 * The florist's commands against migrated tables (spec 011 AC-27, AC-28, AC-29, AC-30, AC-31;
 * T-27, T-28, T-29, T-30 integration half, T-31 integration half; TASK-215).
 *
 * Every order here is a real demo order placed through `placeDemoOrder` (spec 010's `place` and
 * `demoRoute`), committed, and every command runs as it does in production: a partner-context
 * transaction for the visibility read, then a system transaction for the write, each on its own
 * connection of the scratch database. That is what lets two accepts race for real (T-31).
 *
 *  - T-27: accept writes one `assignment.accepted` (partner actor, `by_user_id`), then the demo
 *    effect's `order.captured` and `order.in_production` (`system:demo`); the
 *    `unconfiguredOrderEffect` spy is not called; a repeat writes nothing; an offer past its
 *    answer-by instant writes nothing, before and at the boundary; production takes the
 *    unconfigured effect.
 *  - T-28: decline without a reason is refused; with each of the five reasons, one
 *    `assignment.declined` with the reason, the assignment updated, the order gone from the list,
 *    `order.no_partner_available` for the demo order.
 *  - T-29: the actions offered at each stage are exactly the legal ones; out for delivery and
 *    delivered each write one event; forged posts in other states write nothing.
 *  - T-30: a GPS-tagged JPEG is stored without metadata at `originals/delivery_proof/{assetId}`
 *    in the private bucket, `media_asset` private and stripped, `delivery_proof` without consent,
 *    events `order.delivered` then `order.photo_uploaded` (or the photo alone once delivered);
 *    the florist's signed URL works and has expired after 300 s; a GIF and a 16 MiB file store
 *    nothing; another florist's assignment is not found.
 *  - T-31: two concurrent accepts give one event; every status change in this file has its
 *    event, every event type written is a registered catalogue name.
 */
import { randomUUID } from "node:crypto";

import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { InMemoryStorage } from "../../src/lib/storage.ts";
import { placeDemoOrder } from "../../src/modules/orders/demo/index.ts";
import {
  acceptedOrderEffectFor,
  unconfiguredOrderEffect,
} from "../../src/modules/orders/demo/effect.ts";
import {
  addDeliveryPhoto,
  DECLINE_REASONS,
  FloristActionError,
  type FloristCommandContext,
  type FloristCommandRuntime,
  markDelivered,
  markOutForDelivery,
  respondToOffer,
  selectDeliveryPhotoLocation,
  selectFloristActions,
} from "../../src/modules/orders/florist-actions/index.ts";
import {
  eventSchema,
  type OrderExecutor,
  selectFloristAssignments,
  transition,
} from "../../src/modules/orders/index.ts";
import {
  DeliveryPhotoRefused,
  deliveryPhotoSignedUrl,
  type PrivatePhotoStore,
} from "../../src/modules/orders/photo/index.ts";
import * as make from "./support/rows.ts";
import {
  asApp,
  probeLocalServer,
  scratchDatabase,
  type ScratchDatabase,
  type Tx,
} from "./support/scratch-db.ts";
import { runnerOf } from "./support/sql-runner.ts";

const server = await probeLocalServer();

const SKU = "FO-BQ-001";
const TIER = "stems_15";
const NOW = new Date("2026-10-24T09:00:00Z");
/** Inside the 60-minute answer window `demoRoute` opens at `NOW`. */
const OPEN = new Date("2026-10-24T09:05:00Z");
const BUCKET = "fo-private-test";
const MIB = 1024 * 1024;

interface World {
  readonly countryId: string;
  readonly productId: string;
  readonly partnerA: string;
  readonly partnerB: string;
}

async function world(tx: Tx): Promise<World> {
  const countryId = await make.country(tx, "PL");
  const [product] = await tx<{ id: string }[]>`
    INSERT INTO product (sku, product_type, primary_flower, colour_primary, style, price_tier,
                         substitution_class, freshness_days)
    VALUES (${SKU}, 'bouquet', 'roses', 'red', 'classic', 'classic', 'main_flower', 5)
    ON CONFLICT (sku) DO UPDATE SET sku = EXCLUDED.sku
    RETURNING id`;
  const productId = product?.id ?? "";
  await tx`INSERT INTO product_translation (product_id, locale_code, name, slug)
           VALUES (${productId}, 'en', 'Amber Hour', ${make.unique("amber-hour-")})
           ON CONFLICT DO NOTHING`;
  await tx`INSERT INTO product_tier (product_id, tier_key, label_key, stems, sort, is_default)
           VALUES (${productId}, ${TIER}, 'catalog.tier.stems', 15, 0, true)
           ON CONFLICT DO NOTHING`;
  const partnerA = await make.partner(tx, countryId, "demo");
  const partnerB = await make.partner(tx, countryId, "demo");
  await tx`INSERT INTO partner_catalog_mapping (partner_id, product_id, tier_key, partner_payout_minor,
                                                currency_code)
           VALUES (${partnerA}, ${productId}, ${TIER}, 14900, 'PLN'),
                  (${partnerB}, ${productId}, ${TIER}, 12000, 'PLN')`;
  return { countryId, productId, partnerA, partnerB };
}

interface EventRow {
  type: string;
  actor: string;
  from_status: string | null;
  to_status: string | null;
  payload: Record<string, unknown>;
}

describe.skipIf(server.url === undefined)(
  `florist actions on PG16${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    /** Every order this file touches, for T-31's chain check. */
    const touched = new Set<string>();

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "actions");
    }, 300_000);
    afterAll(async () => {
      await scratch.drop();
    });

    /** Production's two transactions, over the scratch database: one connection each. */
    const runtime: FloristCommandRuntime = {
      asPartner<T>(
        ctx: FloristCommandContext,
        fn: (executor: OrderExecutor) => Promise<T>,
      ): Promise<T> {
        return scratch.sql.begin(async (tx) => {
          await asApp(tx, {
            role: "partner",
            userId: ctx.userId,
            partnerIds: ctx.partnerIds,
          });
          return fn(runnerOf(tx));
        }) as Promise<T>;
      },
      asSystem<T>(
        _job: string,
        fn: (executor: OrderExecutor) => Promise<T>,
      ): Promise<T> {
        return scratch.sql.begin(async (tx) => {
          await asApp(tx, { role: "system" });
          return fn(runnerOf(tx));
        }) as Promise<T>;
      },
    };

    async function setUp(): Promise<World> {
      return scratch.sql.begin((tx) => world(tx)) as Promise<World>;
    }

    async function demoOrder(partnerId: string) {
      const placed = await (scratch.sql.begin((tx) =>
        placeDemoOrder(
          { partnerId, deliveryDate: "2026-10-25" },
          { executor: runnerOf(tx), environment: "test", now: NOW },
        ),
      ) as ReturnType<typeof placeDemoOrder>);
      touched.add(placed.orderId);
      return placed;
    }

    function member(partnerId: string): FloristCommandContext {
      return { userId: randomUUID(), partnerIds: [partnerId] };
    }

    function deps(now: Date = OPEN, environment = "test") {
      return { runtime, now: () => now, environment };
    }

    async function eventsAfterPlacement(orderId: string): Promise<EventRow[]> {
      return scratch.sql<EventRow[]>`
        SELECT type, actor, from_status, to_status, payload FROM order_event
        WHERE order_id = ${orderId} AND type NOT IN
          ('order.placed', 'order.authorised', 'order.routed', 'assignment.offered')
        ORDER BY seq`;
    }

    async function assignmentRow(id: string) {
      const [row] = await scratch.sql<
        {
          response: string | null;
          responded_at: Date | null;
          reason: string | null;
        }[]
      >`SELECT response, responded_at, reason FROM order_assignment WHERE id = ${id}`;
      return row;
    }

    async function status(orderId: string): Promise<string | undefined> {
      const [row] = await scratch.sql<{ status: string }[]>`
        SELECT status FROM "order" WHERE id = ${orderId}`;
      return row?.status;
    }

    async function codeOf(promise: Promise<unknown>): Promise<string> {
      try {
        await promise;
        return "done";
      } catch (error) {
        if (error instanceof FloristActionError) return error.code;
        if (error instanceof DeliveryPhotoRefused) return error.reason;
        throw error;
      }
    }

    function actionsFor(partnerId: string, assignmentId: string, now = OPEN) {
      return runtime.asPartner(member(partnerId), (executor) =>
        selectFloristActions(executor, assignmentId, now),
      );
    }

    async function gpsJpeg(): Promise<Uint8Array> {
      return new Uint8Array(
        await sharp({
          create: {
            width: 2400,
            height: 1800,
            channels: 3,
            background: { r: 210, g: 90, b: 100 },
          },
        })
          .jpeg()
          .withExif({
            IFD0: { Model: "TestCam 1" },
            IFD3: {
              GPSLatitudeRef: "N",
              GPSLatitude: "52/1 13/1 0/1",
              GPSLongitudeRef: "E",
              GPSLongitude: "21/1 0/1 0/1",
            },
          })
          .toBuffer(),
      );
    }

    /** Accept, then out for delivery: the order is on its way. */
    async function onItsWay(partnerId: string) {
      const placed = await demoOrder(partnerId);
      const florist = member(partnerId);
      await respondToOffer(
        florist,
        placed.assignmentId,
        { response: "accept" },
        deps(),
      );
      await markOutForDelivery(florist, placed.assignmentId, deps());
      return { ...placed, florist };
    }

    it("T-27: accept writes assignment.accepted by the partner, then the demo effect's two events; a repeat and an expired offer write nothing", async () => {
      const w = await setUp();
      const placed = await demoOrder(w.partnerA);
      const florist = member(w.partnerA);
      const unconfigured = {
        afterAccept: vi.fn(unconfiguredOrderEffect.afterAccept),
        afterDecline: vi.fn(unconfiguredOrderEffect.afterDecline),
      };
      const effectFor = vi.fn((mode: "demo" | "test" | "live", env: string) =>
        acceptedOrderEffectFor(mode, env, { unconfigured }),
      );
      const answered = await respondToOffer(
        florist,
        placed.assignmentId,
        { response: "accept" },
        { ...deps(), effectFor },
      );
      expect(answered).toEqual({
        orderId: placed.orderId,
        assignmentId: placed.assignmentId,
        response: "accept",
      });
      const events = await eventsAfterPlacement(placed.orderId);
      expect(
        events.map((e) => [e.type, e.actor, e.from_status, e.to_status]),
      ).toEqual([
        ["assignment.accepted", `partner:${w.partnerA}`, "routed", "accepted"],
        ["order.captured", "system:demo", "accepted", "paid"],
        ["order.in_production", "system:demo", "paid", "in_production"],
      ]);
      expect(events[0]?.payload).toEqual({
        mode: "demo",
        assignment_id: placed.assignmentId,
        by_user_id: florist.userId,
      });
      expect(events[1]?.payload).toEqual({ mode: "demo", demo: true });
      expect(effectFor).toHaveBeenCalledWith("demo", "test");
      expect(unconfigured.afterAccept).not.toHaveBeenCalled();
      const row = await assignmentRow(placed.assignmentId);
      expect(row?.response).toBe("accept");
      expect(row?.responded_at?.toISOString()).toBe(OPEN.toISOString());
      expect(row?.reason).toBeNull();

      // A second submission (another tap, another device): nothing written.
      expect(
        await codeOf(
          respondToOffer(
            florist,
            placed.assignmentId,
            { response: "accept" },
            deps(),
          ),
        ),
      ).toBe("ASSIGNMENT_ALREADY_ANSWERED");
      expect(await eventsAfterPlacement(placed.orderId)).toHaveLength(3);

      // An offer past its answer-by instant, and at the instant itself: expired, nothing written.
      const late = await demoOrder(w.partnerA);
      const [sla] = await scratch.sql<{ sla_expires_at: Date }[]>`
        SELECT sla_expires_at FROM order_assignment WHERE id = ${late.assignmentId}`;
      for (const at of [
        sla?.sla_expires_at as Date,
        new Date((sla?.sla_expires_at as Date).getTime() + 60_000),
      ]) {
        expect(
          await codeOf(
            respondToOffer(
              florist,
              late.assignmentId,
              { response: "accept" },
              deps(at),
            ),
          ),
        ).toBe("ASSIGNMENT_EXPIRED");
      }
      expect(await eventsAfterPlacement(late.orderId)).toEqual([]);
      expect((await assignmentRow(late.assignmentId))?.response).toBeNull();
      expect(await status(late.orderId)).toBe("routed");
      // One second before it, the same accept goes through.
      expect(
        await codeOf(
          respondToOffer(
            florist,
            late.assignmentId,
            { response: "accept" },
            deps(new Date((sla?.sla_expires_at as Date).getTime() - 1_000)),
          ),
        ),
      ).toBe("done");

      // In production a demo order takes the unconfigured effect: no demo write.
      const prod = await demoOrder(w.partnerA);
      await respondToOffer(
        florist,
        prod.assignmentId,
        { response: "accept" },
        { ...deps(OPEN, "production"), effectFor },
      );
      expect(unconfigured.afterAccept).toHaveBeenCalledTimes(1);
      expect(
        (await eventsAfterPlacement(prod.orderId)).map((e) => e.type),
      ).toEqual(["assignment.accepted"]);
    });

    it("T-28: decline needs a reason; each reason writes one assignment.declined, updates the assignment, empties the list and records no_partner_available", async () => {
      const w = await setUp();
      const florist = member(w.partnerA);
      const unreasoned = await demoOrder(w.partnerA);
      await expect(
        respondToOffer(
          florist,
          unreasoned.assignmentId,
          { response: "decline" },
          deps(),
        ),
      ).rejects.toThrow();
      expect(await eventsAfterPlacement(unreasoned.orderId)).toEqual([]);

      for (const reason of DECLINE_REASONS) {
        const placed = await demoOrder(w.partnerB);
        const b = member(w.partnerB);
        await respondToOffer(
          b,
          placed.assignmentId,
          { response: "decline", reason },
          deps(),
        );
        const events = await eventsAfterPlacement(placed.orderId);
        expect(
          events.map((e) => [e.type, e.actor, e.from_status, e.to_status]),
          reason,
        ).toEqual([
          ["assignment.declined", `partner:${w.partnerB}`, "routed", "routed"],
          [
            "order.no_partner_available",
            "system:demo",
            "routed",
            "no_partner_available",
          ],
        ]);
        expect(events[0]?.payload).toEqual({
          mode: "demo",
          assignment_id: placed.assignmentId,
          reason,
          by_user_id: b.userId,
        });
        const row = await assignmentRow(placed.assignmentId);
        expect({ response: row?.response, reason: row?.reason }).toEqual({
          response: "decline",
          reason,
        });
        const list = await runtime.asPartner(b, (executor) =>
          selectFloristAssignments(executor, { now: OPEN }),
        );
        expect(list.map((item) => item.assignmentId)).not.toContain(
          placed.assignmentId,
        );
      }
    });

    it("T-29: each stage offers exactly its legal actions; out for delivery and delivered write one event each; forged posts write nothing", async () => {
      const w = await setUp();
      const placed = await demoOrder(w.partnerA);
      const florist = member(w.partnerA);
      const id = placed.assignmentId;
      const store: PrivatePhotoStore = {
        storage: new InMemoryStorage(),
        bucket: BUCKET,
      };
      const photoDeps = { ...deps(), store };

      expect(await actionsFor(w.partnerA, id)).toEqual(["decline", "accept"]);
      // Forged: out for delivery and delivered on an open offer.
      expect(await codeOf(markOutForDelivery(florist, id, deps()))).toBe(
        "ORDER_STATE_CHANGED",
      );
      expect(
        await codeOf(markDelivered(florist, id, await gpsJpeg(), photoDeps)),
      ).toBe("ORDER_STATE_CHANGED");
      expect(await eventsAfterPlacement(placed.orderId)).toEqual([]);

      await respondToOffer(florist, id, { response: "accept" }, deps());
      expect(await status(placed.orderId)).toBe("in_production");
      expect(await actionsFor(w.partnerA, id)).toEqual(["outForDelivery"]);
      expect(
        await codeOf(markDelivered(florist, id, await gpsJpeg(), photoDeps)),
      ).toBe("ORDER_STATE_CHANGED");
      expect(
        await codeOf(addDeliveryPhoto(florist, id, await gpsJpeg(), photoDeps)),
      ).toBe("ORDER_STATE_CHANGED");
      expect(
        await codeOf(
          respondToOffer(
            florist,
            id,
            { response: "decline", reason: "other" },
            deps(),
          ),
        ),
      ).toBe("ASSIGNMENT_ALREADY_ANSWERED");

      const before = (await eventsAfterPlacement(placed.orderId)).length;
      await markOutForDelivery(florist, id, deps());
      const after = await eventsAfterPlacement(placed.orderId);
      expect(
        after.slice(before).map((e) => [e.type, e.actor, e.payload]),
      ).toEqual([
        [
          "order.out_for_delivery",
          `partner:${w.partnerA}`,
          { mode: "demo", assignment_id: id, by_user_id: florist.userId },
        ],
      ]);
      expect(await actionsFor(w.partnerA, id)).toEqual(["delivered"]);
      // A repeat: the state has moved on.
      expect(await codeOf(markOutForDelivery(florist, id, deps()))).toBe(
        "ORDER_STATE_CHANGED",
      );
      expect(await eventsAfterPlacement(placed.orderId)).toHaveLength(
        after.length,
      );
      // Another florist cannot act on it at all.
      expect(
        await codeOf(markOutForDelivery(member(w.partnerB), id, deps())),
      ).toBe("ASSIGNMENT_NOT_FOUND");

      await markDelivered(florist, id, await gpsJpeg(), photoDeps);
      expect(await status(placed.orderId)).toBe("photo_uploaded");
      expect(await actionsFor(w.partnerA, id)).toEqual([]);
      expect(
        await codeOf(addDeliveryPhoto(florist, id, await gpsJpeg(), photoDeps)),
      ).toBe("ORDER_STATE_CHANGED");
    });

    it("T-30: the photo is stored stripped in the private bucket with its rows and two events; the signed URL expires; a GIF and 16 MiB store nothing", async () => {
      const w = await setUp();
      let clock = OPEN;
      const storage = new InMemoryStorage({ now: () => clock });
      const store: PrivatePhotoStore = { storage, bucket: BUCKET };
      const { orderId, assignmentId, florist } = await onItsWay(w.partnerA);
      const photoDeps = { ...deps(), store };

      // Refused files: nothing stored, nothing written.
      const gif = new Uint8Array(
        await sharp({
          create: { width: 8, height: 8, channels: 3, background: "#fff" },
        })
          .gif()
          .toBuffer(),
      );
      const big = new Uint8Array(16 * MIB);
      big.set(await gpsJpeg());
      const putSpy = vi.spyOn(storage, "put");
      expect(
        await codeOf(markDelivered(florist, assignmentId, gif, photoDeps)),
      ).toBe("wrong_type");
      expect(
        await codeOf(markDelivered(florist, assignmentId, big, photoDeps)),
      ).toBe("too_large");
      expect(putSpy).not.toHaveBeenCalled();
      expect(await status(orderId)).toBe("out_for_delivery");

      const before = (await eventsAfterPlacement(orderId)).length;
      const result = await markDelivered(
        florist,
        assignmentId,
        await gpsJpeg(),
        photoDeps,
      );
      const key = `originals/delivery_proof/${result.mediaAssetId}`;
      expect(putSpy).toHaveBeenCalledTimes(1);
      expect(putSpy.mock.calls[0]?.[0]).toMatchObject({
        bucket: BUCKET,
        objectKey: key,
        mime: "image/jpeg",
      });
      const stored = await storage.head({ bucket: BUCKET, objectKey: key });
      expect(stored).not.toBeNull();

      const [asset] = await scratch.sql<Record<string, unknown>[]>`
        SELECT kind, bucket, object_key, mime, width, height, bytes, checksum_sha256, visibility,
               source, exif_stripped, depicts
        FROM media_asset WHERE id = ${result.mediaAssetId}`;
      expect(asset).toEqual({
        kind: "delivery_proof",
        bucket: BUCKET,
        object_key: key,
        mime: "image/jpeg",
        width: 2000,
        height: 1500,
        bytes: String(stored?.bytes),
        checksum_sha256: stored?.checksumSha256,
        visibility: "private",
        source: "partner",
        exif_stripped: true,
        depicts: "delivery",
      });
      const [proof] = await scratch.sql<Record<string, unknown>[]>`
        SELECT order_id, uploaded_by, public_use_consent FROM delivery_proof
        WHERE media_asset_id = ${result.mediaAssetId}`;
      expect(proof).toEqual({
        order_id: orderId,
        uploaded_by: `partner:${w.partnerA}`,
        public_use_consent: false,
      });
      const events = (await eventsAfterPlacement(orderId)).slice(before);
      expect(events.map((e) => [e.type, e.from_status, e.to_status])).toEqual([
        ["order.delivered", "out_for_delivery", "delivered"],
        ["order.photo_uploaded", "delivered", "photo_uploaded"],
      ]);
      expect(events[1]?.payload).toEqual({
        mode: "demo",
        media_asset_id: result.mediaAssetId,
        assignment_id: assignmentId,
        by_user_id: florist.userId,
      });

      // The stored bytes: a JPEG with no metadata at all.
      const url = await runtime.asPartner(florist, async (executor) => {
        const location = await selectDeliveryPhotoLocation(
          executor,
          assignmentId,
        );
        expect(location).toEqual({ bucket: BUCKET, objectKey: key });
        return deliveryPhotoSignedUrl(store, location as never);
      });
      const served = await storage.fetch(url);
      expect(served.status).toBe(200);
      const meta = await sharp(
        Buffer.from(await served.arrayBuffer()),
      ).metadata();
      expect(meta.format).toBe("jpeg");
      expect(meta.exif).toBeUndefined();
      expect(meta.xmp).toBeUndefined();
      expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(2000);
      // 300 s later the same URL is refused.
      clock = new Date(OPEN.getTime() + 301_000);
      expect((await storage.fetch(url)).status).toBe(403);
      // Another florist finds no photo for the assignment.
      expect(
        await runtime.asPartner(member(w.partnerB), (executor) =>
          selectDeliveryPhotoLocation(executor, assignmentId),
        ),
      ).toBeNull();

      // A delivered order without a photo: `order.photo_uploaded` alone.
      const second = await onItsWay(w.partnerA);
      await scratch.sql.begin(async (tx) => {
        await transition(
          second.orderId,
          "order.delivered",
          `partner:${w.partnerA}`,
          { mode: "demo", assignment_id: second.assignmentId },
          { executor: runnerOf(tx) },
        );
      });
      const mid = (await eventsAfterPlacement(second.orderId)).length;
      expect(await actionsFor(w.partnerA, second.assignmentId)).toEqual([
        "addPhoto",
      ]);
      await addDeliveryPhoto(
        second.florist,
        second.assignmentId,
        await gpsJpeg(),
        photoDeps,
      );
      expect(
        (await eventsAfterPlacement(second.orderId))
          .slice(mid)
          .map((e) => e.type),
      ).toEqual(["order.photo_uploaded"]);
      // Another florist's post is not found and stores nothing.
      const third = await onItsWay(w.partnerA);
      putSpy.mockClear();
      expect(
        await codeOf(
          markDelivered(
            member(w.partnerB),
            third.assignmentId,
            await gpsJpeg(),
            photoDeps,
          ),
        ),
      ).toBe("ASSIGNMENT_NOT_FOUND");
      expect(putSpy).not.toHaveBeenCalled();
    });

    it("T-30: a write that fails after the upload removes the stored object", async () => {
      const w = await setUp();
      const storage = new InMemoryStorage();
      const deleteSpy = vi.spyOn(storage, "delete");
      const { orderId, assignmentId, florist } = await onItsWay(w.partnerA);
      const failing = vi.fn(() => Promise.reject(new Error("injected")));
      await expect(
        markDelivered(florist, assignmentId, await gpsJpeg(), {
          ...deps(),
          store: { storage, bucket: BUCKET },
          transition: failing as unknown as typeof transition,
        }),
      ).rejects.toThrow("injected");
      expect(deleteSpy).toHaveBeenCalledTimes(1);
      const location = deleteSpy.mock.calls[0]?.[0];
      expect(location?.bucket).toBe(BUCKET);
      expect(await storage.head(location as never)).toBeNull();
      expect(await status(orderId)).toBe("out_for_delivery");
      const [count] = await scratch.sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM delivery_proof WHERE order_id = ${orderId}`;
      expect(count?.n).toBe(0);
    });

    it("T-31: two concurrent accepts write one assignment.accepted; every status change here has its event; every type is registered", async () => {
      const w = await setUp();
      for (let round = 0; round < 5; round += 1) {
        const placed = await demoOrder(w.partnerA);
        const results = await Promise.allSettled([
          respondToOffer(
            member(w.partnerA),
            placed.assignmentId,
            { response: "accept" },
            deps(),
          ),
          respondToOffer(
            member(w.partnerA),
            placed.assignmentId,
            { response: "accept" },
            deps(),
          ),
        ]);
        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        const rejected = results.find((r) => r.status === "rejected");
        expect((rejected?.reason as FloristActionError | undefined)?.code).toBe(
          "ASSIGNMENT_ALREADY_ANSWERED",
        );
        const accepted = (await eventsAfterPlacement(placed.orderId)).filter(
          (e) => e.type === "assignment.accepted",
        );
        expect(accepted).toHaveLength(1);
      }

      // A decline racing an accept: exactly one answer wins.
      const raced = await demoOrder(w.partnerA);
      const race = await Promise.allSettled([
        respondToOffer(
          member(w.partnerA),
          raced.assignmentId,
          { response: "accept" },
          deps(),
        ),
        respondToOffer(
          member(w.partnerA),
          raced.assignmentId,
          { response: "decline", reason: "capacity" },
          deps(),
        ),
      ]);
      expect(race.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const answers = (await eventsAfterPlacement(raced.orderId)).filter((e) =>
        e.type.startsWith("assignment."),
      );
      expect(answers).toHaveLength(1);

      // Every order this file touched: each status change is an event, chained, ending at the
      // order's status; every type written is a registered catalogue name, never an arrow label.
      for (const orderId of touched) {
        const events = await scratch.sql<EventRow[]>`
          SELECT type, actor, from_status, to_status, payload FROM order_event
          WHERE order_id = ${orderId} ORDER BY seq`;
        let current: string | null = null;
        for (const event of events) {
          expect(eventSchema(event.type), event.type).toBeDefined();
          expect(event.type).toMatch(/^(order|assignment)\.[a-z_]+$/);
          if (event.to_status !== null) {
            if (current !== null) expect(event.from_status).toBe(current);
            current = event.to_status;
          }
        }
        expect(await status(orderId)).toBe(current);
      }
    });
  },
);
