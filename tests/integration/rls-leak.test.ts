/**
 * The PR 210 carry-forward (TASK-027 brief; spec 002 AC-16, §8 "Security"): `partner_order`'s
 * `security_barrier` is pinned by an **attack**, not by text. A partner session defines a cheap
 * leaky function in `pg_temp` and puts it in a `WHERE` over the view; with the barrier, the view's
 * own filter runs first and the function only ever sees the partner's own orders. The positive
 * control removes the barrier inside the same rolled-back transaction and watches the other
 * partner's order leak, so the case cannot pass with its subject removed.
 *
 * Local, disposable server only (`support/scratch-db.ts`).
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { insertPlacedOrder } from "../fixtures/order-state.ts";
import * as make from "./support/rows.ts";
import {
  asApp,
  probeLocalServer,
  scratchDatabase,
  type ScratchDatabase,
  type Tx,
} from "./support/scratch-db.ts";

const server = await probeLocalServer();

class Rollback extends Error {}

describe.skipIf(server.url === undefined)(
  `partner_order resists a pg_temp leaky function${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "leak");
    }, 600_000);

    afterAll(async () => {
      await scratch.drop();
    });

    /** Runs the attack as partner A; returns what leaked and the two order ids. */
    async function attack(withBarrier: boolean) {
      const notices: string[] = [];
      const sql = postgres(scratch.url, {
        max: 1,
        onnotice: (notice: { message?: string }) => {
          notices.push(notice.message ?? "");
        },
      });
      let ids = { mine: "", theirs: "" };
      try {
        await sql.begin(async (tx: Tx) => {
          const countryId = await make.country(tx);
          const order = async (partnerId: string) => {
            const parents = await make.orderParents(tx);
            const id = await insertPlacedOrder(tx, { ...parents, countryId });
            await tx`INSERT INTO order_assignment (order_id, partner_id, sla_expires_at, attempt)
                     VALUES (${id}, ${partnerId}, now() + interval '1 hour', 1)`;
            return id;
          };
          const partnerA = await make.partner(tx, countryId);
          const partnerB = await make.partner(tx, countryId);
          ids = { mine: await order(partnerA), theirs: await order(partnerB) };
          if (!withBarrier) {
            await tx`ALTER VIEW public.partner_order RESET (security_barrier)`;
          }
          await asApp(tx, { role: "partner", partnerIds: [partnerA] });
          await tx.unsafe(`
            CREATE FUNCTION pg_temp.leak(value text) RETURNS boolean
              LANGUAGE plpgsql COST 0.0000001 AS $$
              BEGIN RAISE NOTICE 'leak %', value; RETURN true; END $$`);
          const visible = await tx<{ id: string }[]>`
            SELECT id FROM public.partner_order WHERE pg_temp.leak(id::text)`;
          expect(visible.map((row) => row.id)).toEqual([ids.mine]);
          throw new Rollback();
        });
      } catch (error) {
        if (!(error instanceof Rollback)) throw error;
      } finally {
        await sql.end({ timeout: 5 });
      }
      const leaked = notices
        .map((message) => /^leak (.+)$/.exec(message)?.[1])
        .filter((value): value is string => value !== undefined);
      return { leaked, ...ids };
    }

    it("with security_barrier, the leaky function sees only the partner's own order", async () => {
      const { leaked, mine, theirs } = await attack(true);
      expect(leaked).toContain(mine);
      expect(leaked).not.toContain(theirs);
    });

    it("control: without the barrier, the same attack leaks the other partner's order", async () => {
      const { leaked, theirs } = await attack(false);
      expect(leaked).toContain(theirs);
    });
  },
);
