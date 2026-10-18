/**
 * `withDbContext` on a real Postgres transaction (spec 002 AC-16, AC-17, §5 the `src/lib/db.ts`
 * row; TASK-246).
 *
 * `tests/unit/db.test.ts` drives the seam with a fake driver, which is how `drizzle(tx)` passed
 * review while throwing "Cannot read properties of undefined (reading 'parsers')" on every real
 * database: a postgres.js transaction handle has no `options`. This suite runs the real module,
 * through the real `postgres` driver, on a migrated scratch database of a disposable local
 * Postgres 16, under each of the five `app.role` values.
 *
 * Rows are written as the server's superuser (never through a query a policy filters); every read
 * under test goes through `withDbContext`, `withAdminContext` or `withSystemContext`.
 */
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { country, fulfillmentPartner, partnerBlackout } from "../../db/schema";
import { APP_ROLES } from "../../src/lib/db";
import { country as insertCountry, partner } from "./support/rows.ts";
import {
  probeLocalServer,
  scratchDatabase,
  type ScratchDatabase,
} from "./support/scratch-db.ts";

const target = vi.hoisted(() => ({ url: "" }));
// `db.ts` reads the pool's URL through `@/lib/env`; point it at the scratch database.
vi.mock("@/lib/env", () => ({
  get env() {
    return { DATABASE_URL: target.url };
  },
}));

const server = await probeLocalServer();

const REQUEST_ID = "55555555-5555-4555-8555-555555555555";
const USER_ID = "66666666-6666-4666-8666-666666666666";

describe.skipIf(!server.url)(
  `withDbContext on a real transaction${server.url ? "" : ` (skipped: ${server.reason})`}`,
  () => {
    let scratch: ScratchDatabase;
    let partnerA = "";
    let partnerB = "";
    let db: typeof import("../../src/lib/db");

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url ?? "", "dbctx");
      target.url = scratch.url;
      await scratch.sql.begin(async (tx) => {
        const countryId = await insertCountry(tx);
        partnerA = await partner(tx, countryId);
        partnerB = await partner(tx, countryId);
        await tx`INSERT INTO partner_blackout (partner_id, date) VALUES (${partnerA}, DATE '2027-01-01')`;
      });
      db = await import("../../src/lib/db");
      // The same budget as every scratch-database suite: creating one waits on the migrate lock
      // while the other suites migrate theirs (`support/scratch-db.ts`), well past 10 s in CI.
    }, 600_000);

    afterAll(async () => {
      await scratch?.drop();
    });

    it.each(APP_ROLES)(
      "runs a query as app_web under app.role = %s, with the context set for this transaction",
      async (role) => {
        const { rows } = await readContext(role);
        expect(rows).toEqual({
          user: "app_web",
          role,
          userId: role === "customer" ? USER_ID : "",
          partners: role === "partner" ? partnerA : "",
          requestId: REQUEST_ID,
        });
      },
    );

    it("leaves nothing of one transaction's context in the next one (SET LOCAL, never session-wide)", async () => {
      await readContext("partner");
      const { rows } = await readContext("public");
      expect(rows).toMatchObject({ role: "public", userId: "", partners: "" });
    });

    it("AC-16: a partner reads exactly its own partner row through a typed Drizzle select", async () => {
      const ids = (partnerId: string) =>
        db.withDbContext(
          { role: "partner", partnerIds: [partnerId], requestId: REQUEST_ID },
          async (tx) =>
            (
              await tx
                .select({ id: fulfillmentPartner.id })
                .from(fulfillmentPartner)
            ).map((row) => row.id),
        );

      expect(await ids(partnerA)).toEqual([partnerA]);
      expect(await ids(partnerB)).toEqual([partnerB]);
    });

    it("AC-16: an admin and the system role read every partner; public and customer read none", async () => {
      const count = (role: "admin" | "system" | "public" | "customer") =>
        db.withDbContext(
          { role, requestId: REQUEST_ID },
          async (tx) => (await tx.select().from(fulfillmentPartner)).length,
        );

      expect(await count("admin")).toBe(2);
      expect(await count("public")).toBe(0);
      expect(await count("customer")).toBe(0);
      // `system` is the job context: it reads what it processes (spec 002 §2).
      expect(await count("system")).toBe(2);
      expect(
        await db.withAdminContext(
          async (tx) => (await tx.select().from(fulfillmentPartner)).length,
        ),
      ).toBe(2);
      expect(
        await db.withSystemContext(
          "order.expire",
          async (tx) => (await tx.select().from(fulfillmentPartner)).length,
        ),
      ).toBe(2);
    });

    it("AC-17: public reads the reference set through the same path", async () => {
      const rows = await db.withDbContext(
        { role: "public", requestId: REQUEST_ID },
        (tx) =>
          tx
            .select({ iso2: country.iso2 })
            .from(country)
            .where(eq(country.iso2, "PL")),
      );
      expect(rows).toEqual([{ iso2: "PL" }]);
    });

    it("maps a date column to its ISO string, as Drizzle's pass-through parsers promise", async () => {
      const rows = await db.withDbContext(
        { role: "partner", partnerIds: [partnerA], requestId: REQUEST_ID },
        (tx) => tx.select({ date: partnerBlackout.date }).from(partnerBlackout),
      );
      expect(rows).toEqual([{ date: "2027-01-01" }]);
    });

    it("commits on return and rolls back on a throw", async () => {
      const insert = (date: string) =>
        db.withDbContext(
          { role: "partner", partnerIds: [partnerB], requestId: REQUEST_ID },
          (tx) =>
            tx.insert(partnerBlackout).values({ partnerId: partnerB, date }),
        );
      const stored = async () =>
        (
          await scratch.sql<{ date: string }[]>`
            SELECT date::text FROM partner_blackout WHERE partner_id = ${partnerB} ORDER BY 1`
        ).map((row) => row.date);

      await insert("2027-02-01");
      await expect(
        db.withDbContext(
          { role: "partner", partnerIds: [partnerB], requestId: REQUEST_ID },
          async (tx) => {
            await tx
              .insert(partnerBlackout)
              .values({ partnerId: partnerB, date: "2027-03-01" });
            throw new Error("abort");
          },
        ),
      ).rejects.toThrow("abort");

      expect(await stored()).toEqual(["2027-02-01"]);
    });

    it("nests `db.transaction` as a savepoint on the same connection: an inner failure leaves the outer work", async () => {
      await db.withDbContext(
        { role: "partner", partnerIds: [partnerB], requestId: REQUEST_ID },
        async (tx) => {
          await tx
            .insert(partnerBlackout)
            .values({ partnerId: partnerB, date: "2027-04-01" });
          await expect(
            tx.transaction(async (inner) => {
              await inner
                .insert(partnerBlackout)
                .values({ partnerId: partnerB, date: "2027-05-01" });
              throw new Error("inner");
            }),
          ).rejects.toThrow("inner");
        },
      );

      const dates = (
        await scratch.sql<{ date: string }[]>`
          SELECT date::text FROM partner_blackout WHERE partner_id = ${partnerB} ORDER BY 1`
      ).map((row) => row.date);
      expect(dates).toContain("2027-04-01");
      expect(dates).not.toContain("2027-05-01");
    });

    /** What the session looks like from inside a `withDbContext` transaction. */
    function readContext(role: (typeof APP_ROLES)[number]) {
      return db.withDbContext(
        {
          role,
          ...(role === "customer" ? { userId: USER_ID } : {}),
          partnerIds: role === "partner" ? [partnerA] : [],
          requestId: REQUEST_ID,
        },
        async (tx) => {
          const result = await tx.execute<{
            user: string;
            role: string;
            userId: string;
            partners: string;
            requestId: string;
          }>(sql`SELECT current_user AS user,
                        current_setting('app.role', true) AS role,
                        current_setting('app.user_id', true) AS "userId",
                        current_setting('app.partner_ids', true) AS partners,
                        current_setting('app.request_id', true) AS "requestId"`);
          return { rows: result[0] };
        },
      );
    }
  },
);
