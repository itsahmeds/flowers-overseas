/**
 * Migration `0008` refusing what ADR-0009 forbids, by raw SQL that bypasses the lint rule
 * entirely (spec 002 AC-12, AC-13 as amended by §14 A6.8, AC-15, AC-19, AC-35, AC-36; T-12, T-13,
 * T-15, T-19, T-36, T-37; spec 010 §5.1 A, AC-23's database half; TASK-020).
 *
 * Every case runs in a transaction that is rolled back, on a scratch database of a disposable
 * local Postgres 16 (`support/scratch-db.ts`). Orders reach a state only through
 * `tests/fixtures/order-state.ts` (A6.7 (b)); no trigger is ever switched off.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { INITIAL_STATUS, STATES } from "../fixtures/order-machine.ts";
import {
  applyTransition,
  insertPlacedOrder,
  walkOrderTo,
} from "../fixtures/order-state.ts";
import { mediaAsset, orderParents, partner } from "./support/rows.ts";
import {
  pgFailure,
  probeLocalServer,
  rolledBack,
  scratchDatabase,
  type ScratchDatabase,
  type Tx,
} from "./support/scratch-db.ts";

const server = await probeLocalServer();

async function settings(tx: Tx): Promise<[string, string]> {
  const [row] = await tx<{ allow: string; event: string }[]>`
    SELECT coalesce(current_setting('app.allow_status_write', true), '') AS allow,
           coalesce(current_setting('app.transition_event', true), '') AS event`;
  return [row?.allow ?? "?", row?.event ?? "?"];
}

async function freshOrder(
  tx: Tx,
  mode: "demo" | "test" | "live" = "demo",
): Promise<string> {
  return insertPlacedOrder(tx, { ...(await orderParents(tx)), mode });
}

describe.skipIf(server.url === undefined)(
  `migration 0008 applied — order integrity${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "integrity");
    }, 300_000);
    afterAll(async () => {
      await scratch.drop();
    });

    it("T-12: order_event is append-only, seq is unique per order, the next seq appends", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const id = await freshOrder(tx);
        const update = await pgFailure(
          tx,
          (sp) =>
            sp`UPDATE order_event SET actor = 'system:x' WHERE order_id = ${id}`,
        );
        const del = await pgFailure(
          tx,
          (sp) => sp`DELETE FROM order_event WHERE order_id = ${id}`,
        );
        const truncate = await pgFailure(tx, (sp) =>
          sp.unsafe("TRUNCATE order_event"),
        );
        const duplicate = await pgFailure(
          tx,
          (
            sp,
          ) => sp`INSERT INTO order_event (order_id, seq, type, actor, payload_version)
                     VALUES (${id}, 1, 'assignment.offered', 'system:x', 1)`,
        );
        await tx`INSERT INTO order_event (order_id, seq, type, actor, payload_version)
                 VALUES (${id}, 2, 'assignment.offered', 'system:x', 1)`;
        const [count] = await tx<{ n: number }[]>`
          SELECT count(*)::int AS n FROM order_event WHERE order_id = ${id}`;
        return { update, del, truncate, duplicate, count: count?.n };
      });
      for (const failure of [result.update, result.del, result.truncate]) {
        expect(failure.raised).toBe("ORDER_EVENT_APPEND_ONLY");
        expect(failure.message).toContain("order_event");
      }
      expect(result.duplicate.constraint).toBe("order_event_order_id_seq_key");
      expect(result.count).toBe(2);
    });

    it("T-13 / T-15: a raw status update is refused without the switch, refused for an illegal or missing event, and applied for a legal one", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const id = await freshOrder(tx);
        const direct = await pgFailure(
          tx,
          (sp) => sp`UPDATE "order" SET status = 'authorised' WHERE id = ${id}`,
        );
        const illegal = await pgFailure(tx, async (sp) => {
          await sp`SELECT set_config('app.allow_status_write', 'on', true)`;
          await sp`SELECT set_config('app.transition_event', 'order.routed', true)`;
          await sp`UPDATE "order" SET status = 'routed' WHERE id = ${id}`;
        });
        // The two pairs exist under other triples: (placed → authorised) under order.authorised,
        // and (placed, order.authorised) towards authorised. Each must still be refused.
        const wrongEvent = await pgFailure(tx, async (sp) => {
          await sp`SELECT set_config('app.allow_status_write', 'on', true)`;
          await sp`SELECT set_config('app.transition_event', 'order.captured', true)`;
          await sp`UPDATE "order" SET status = 'authorised' WHERE id = ${id}`;
        });
        const wrongTarget = await pgFailure(tx, async (sp) => {
          await sp`SELECT set_config('app.allow_status_write', 'on', true)`;
          await sp`SELECT set_config('app.transition_event', 'order.authorised', true)`;
          await sp`UPDATE "order" SET status = 'paid_unrouted' WHERE id = ${id}`;
        });
        const noEvent = await pgFailure(tx, async (sp) => {
          await sp`SELECT set_config('app.allow_status_write', 'on', true)`;
          await sp`SELECT set_config('app.transition_event', '', true)`;
          await sp`UPDATE "order" SET status = 'authorised' WHERE id = ${id}`;
        });
        const sameStatus = await pgFailure(
          tx,
          (sp) => sp`UPDATE "order" SET status = status WHERE id = ${id}`,
        );
        const [before] = await tx<{ events: number }[]>`
          SELECT count(*)::int AS events FROM order_event WHERE order_id = ${id}`;
        await tx`SELECT set_config('app.allow_status_write', 'on', true)`;
        await tx`SELECT set_config('app.transition_event', 'order.authorised', true)`;
        await tx`UPDATE "order" SET status = 'authorised' WHERE id = ${id}`;
        const [after] = await tx<{ status: string; events: number }[]>`
          SELECT status, (SELECT count(*)::int FROM order_event WHERE order_id = ${id}) AS events
          FROM "order" WHERE id = ${id}`;
        return {
          direct,
          illegal,
          wrongEvent,
          wrongTarget,
          noEvent,
          sameStatus,
          before: before?.events,
          after,
        };
      });
      expect(result.direct.raised).toBe("ORDER_STATUS_DIRECT_WRITE");
      expect(result.sameStatus.raised).toBe("ORDER_STATUS_DIRECT_WRITE");
      expect(result.illegal.raised).toBe("ORDER_TRANSITION_ILLEGAL");
      expect(result.wrongEvent.raised).toBe("ORDER_TRANSITION_ILLEGAL");
      expect(result.wrongTarget.raised).toBe("ORDER_TRANSITION_ILLEGAL");
      expect(result.noEvent.raised).toBe("ORDER_TRANSITION_ILLEGAL");
      expect(result.after).toEqual({
        status: "authorised",
        events: result.before,
      });
    });

    it("T-36 / AC-35: the switch and the event do not outlive their transaction on a pinned connection", async () => {
      // One connection, pinned: max 1, so both transactions run on the same backend.
      const pinned = postgres(scratch.url, {
        max: 1,
        onnotice: () => undefined,
      });
      try {
        const first = await pinned.begin(async (tx) => {
          await tx`SELECT set_config('app.allow_status_write', 'on', true)`;
          await tx`SELECT set_config('app.transition_event', 'order.authorised', true)`;
          const [row] = await tx<
            { pid: number }[]
          >`SELECT pg_backend_pid() AS pid`;
          return { pid: row?.pid, inside: await settings(tx) };
        });
        const second = await pinned.begin(async (tx) => {
          const [row] = await tx<
            { pid: number }[]
          >`SELECT pg_backend_pid() AS pid`;
          return { pid: row?.pid, inside: await settings(tx) };
        });
        expect(first.inside).toEqual(["on", "order.authorised"]);
        expect(second.pid).toBe(first.pid);
        expect(second.inside).toEqual(["", ""]);
      } finally {
        await pinned.end({ timeout: 5 });
      }
    });

    it("T-36 / AC-35: after one transition both settings read '' and a second raw write is refused", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const id = await freshOrder(tx);
        await applyTransition(tx, id, "order.authorised", "authorised");
        const afterEngine = await settings(tx);
        const raw = await pgFailure(
          tx,
          (sp) => sp`UPDATE "order" SET status = 'routed' WHERE id = ${id}`,
        );
        // The trigger resets them too, even when the caller forgets (A6.7's F1).
        await tx`SELECT set_config('app.allow_status_write', 'on', true)`;
        await tx`SELECT set_config('app.transition_event', 'order.routed', true)`;
        await tx`UPDATE "order" SET status = 'routed' WHERE id = ${id}`;
        const afterTrigger = await settings(tx);
        const second = await pgFailure(
          tx,
          (sp) =>
            sp`UPDATE "order" SET status = 'no_partner_available' WHERE id = ${id}`,
        );
        return { afterEngine, raw, afterTrigger, second };
      });
      expect(result.afterEngine).toEqual(["", ""]);
      expect(result.raw.raised).toBe("ORDER_STATUS_DIRECT_WRITE");
      expect(result.afterTrigger).toEqual(["", ""]);
      expect(result.second.raised).toBe("ORDER_STATUS_DIRECT_WRITE");
    });

    it("T-37 / AC-36: walkOrderTo reaches every non-initial state with every trigger on, legally row by row", async () => {
      const reached = await rolledBack(scratch.sql, async (tx) => {
        const triggers = await tx<{ name: string; enabled: string }[]>`
          SELECT tgname AS name, tgenabled AS enabled FROM pg_trigger
          WHERE NOT tgisinternal AND tgrelid IN ('public."order"'::regclass, 'public.order_event'::regclass)`;
        const out: Record<string, { status: string; illegal: number }> = {};
        for (const state of STATES.filter((s) => s.key !== INITIAL_STATUS)) {
          const id = await freshOrder(tx);
          await walkOrderTo(tx, id, state.key);
          const [row] = await tx<{ status: string; illegal: number }[]>`
            SELECT o.status,
                   (SELECT count(*)::int FROM order_event e
                    WHERE e.order_id = o.id AND e.seq > 1 AND NOT EXISTS (
                      SELECT 1 FROM order_transition t
                      WHERE t.from_status = e.from_status AND t.event = e.type
                        AND t.to_status = e.to_status)) AS illegal
            FROM "order" o WHERE o.id = ${id}`;
          out[state.key] = row ?? { status: "?", illegal: -1 };
        }
        return { out, triggers };
      });
      expect(reached.triggers.every((t) => t.enabled === "O")).toBe(true);
      expect(reached.triggers.map((t) => t.name).sort()).toEqual(
        [
          "order_event_append_only",
          "order_event_append_only_statement",
          "order_insert_guard",
          "order_mode_immutable",
          "order_set_updated_at",
          "order_status_guard",
          // 0019 (TASK-347): the deferred check that a purchase totals its orders.
          "purchase_total_check",
        ].sort(),
      );
      for (const state of STATES.filter((s) => s.key !== INITIAL_STATUS)) {
        expect(reached.out[state.key], state.key).toEqual({
          status: state.key,
          illegal: 0,
        });
      }
    });

    it("spec 010 §5.1 A: inserts only through the switch and only at placed; the mode never changes", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const parents = await orderParents(tx);
        const insert = (status: string) =>
          tx`INSERT INTO "order" (public_token, mode, status, customer_id, recipient_id,
               destination_country_id, delivery_date, buyer_currency_code, buyer_total_minor,
               base_currency_code, base_total_minor, buyer_snapshot, recipient_snapshot)
             VALUES (${`tok${status}${"x".repeat(24)}`}, 'demo', ${status}, ${parents.customerId},
               ${parents.recipientId}, ${parents.countryId}, DATE '2027-02-14', 'PLN', 100, 'PLN',
               100, '{}', '{}')`;
        const outside = await pgFailure(tx, () => insert("placed"));
        const wrongStart = await pgFailure(tx, async (sp) => {
          await sp`SELECT set_config('app.allow_status_write', 'on', true)`;
          await sp`INSERT INTO "order" (public_token, mode, status, customer_id, recipient_id,
               destination_country_id, delivery_date, buyer_currency_code, buyer_total_minor,
               base_currency_code, base_total_minor, buyer_snapshot, recipient_snapshot)
             VALUES (${"tokpaid" + "x".repeat(24)}, 'demo', 'paid', ${parents.customerId},
               ${parents.recipientId}, ${parents.countryId}, DATE '2027-02-14', 'PLN', 100, 'PLN',
               100, '{}', '{}')`;
        });
        const id = await insertPlacedOrder(tx, parents);
        const modeFlip = await pgFailure(
          tx,
          (sp) =>
            sp`UPDATE "order" SET mode = 'live', terms_version = 'v1' WHERE id = ${id}`,
        );
        return { outside, wrongStart, modeFlip };
      });
      expect(result.outside.raised).toBe("ORDER_INSERT_OUTSIDE_SERVICE");
      expect(result.wrongStart.raised).toBe("ORDER_INITIAL_STATUS");
      expect(result.modeFlip.raised).toBe("ORDER_MODE_IMMUTABLE");
    });

    it("spec 010 §5.1 A: a live order goes only to an active partner, a demo or test order only to a demo one", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const parents = await orderParents(tx);
        const demoPartner = await partner(tx, parents.countryId, "demo");
        const activePartner = await partner(tx, parents.countryId, "active");
        const offer = (orderId: string, partnerId: string, attempt: number) =>
          tx`INSERT INTO order_assignment (order_id, partner_id, sla_expires_at, attempt)
             VALUES (${orderId}, ${partnerId}, now() + interval '1 hour', ${attempt})`;
        const demo = await insertPlacedOrder(tx, { ...parents, mode: "demo" });
        const test = await insertPlacedOrder(tx, { ...parents, mode: "test" });
        const live = await insertPlacedOrder(tx, { ...parents, mode: "live" });
        const refusals = {
          demoToActive: await pgFailure(tx, () =>
            offer(demo, activePartner, 1),
          ),
          testToActive: await pgFailure(tx, () =>
            offer(test, activePartner, 1),
          ),
          liveToDemo: await pgFailure(tx, () => offer(live, demoPartner, 1)),
        };
        await offer(demo, demoPartner, 1);
        await offer(test, demoPartner, 1);
        await offer(live, activePartner, 1);
        const moved = await pgFailure(
          tx,
          (sp) =>
            sp`UPDATE order_assignment SET partner_id = ${activePartner} WHERE order_id = ${demo}`,
        );
        return { ...refusals, moved };
      });
      for (const failure of Object.values(result)) {
        expect(failure.raised).toBe("ASSIGNMENT_MODE_MISMATCH");
      }
    });

    it("T-19 / AC-19: a delivery photo must be private and EXIF-stripped, and stays so", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const id = await freshOrder(tx);
        const proof = (assetId: string) =>
          tx`INSERT INTO delivery_proof (order_id, media_asset_id, uploaded_by)
             VALUES (${id}, ${assetId}, 'partner:test') RETURNING public_use_consent`;
        const publicAsset = await pgFailure(tx, async () =>
          proof(await mediaAsset(tx, { visibility: "public" })),
        );
        const notStripped = await pgFailure(tx, async () =>
          proof(await mediaAsset(tx, { exifStripped: false })),
        );
        const productAsset = await pgFailure(tx, async () =>
          proof(
            await mediaAsset(tx, { kind: "product", visibility: "private" }),
          ),
        );
        const good = await mediaAsset(tx);
        const [accepted] = await proof(good);
        const madePublic = await pgFailure(
          tx,
          (sp) =>
            sp`UPDATE media_asset SET visibility = 'public' WHERE id = ${good}`,
        );
        // H3: re-pointing an accepted proof at a public asset is refused too.
        const publicProofAsset = await mediaAsset(tx, { visibility: "public" });
        const repointed = await pgFailure(
          tx,
          (sp) =>
            sp`UPDATE delivery_proof SET media_asset_id = ${publicProofAsset} WHERE media_asset_id = ${good}`,
        );
        const unstripped = await pgFailure(
          tx,
          (sp) =>
            sp`UPDATE media_asset SET exif_stripped = false WHERE id = ${good}`,
        );
        return {
          publicAsset,
          notStripped,
          productAsset,
          consent: accepted?.public_use_consent,
          madePublic,
          repointed,
          unstripped,
        };
      });
      for (const key of [
        "publicAsset",
        "notStripped",
        "productAsset",
        "madePublic",
        "repointed",
        "unstripped",
      ] as const) {
        expect(result[key].raised, key).toBe("DELIVERY_PROOF_ASSET");
      }
      expect(result.consent).toBe(false);
    });
  },
);
