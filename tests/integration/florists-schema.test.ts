/**
 * T-14 and the schema half of spec 011 (`0022_florists_v0`, §5.1, AC-14; TASK-211).
 *
 *  - AC-14: under `app.role = 'public'` an application can be inserted and nothing read, changed
 *    or deleted; the four forbidden inserts (a status other than `new`, a converted partner, a
 *    decision time, a non-empty `media_asset_ids`) are refused; `admin` reads every row.
 *  - `partner_member.locale_code`: defaults to `en`, accepts `pl` and `de`, refuses anything else.
 *  - The partner read policy on `media_asset`: a partner sees the delivery photo of an order it
 *    holds an open or accepted offer for, and no other asset (not another partner's photo, not a
 *    private non-proof asset, not its own photo after it declined).
 *  - The rollback on a seeded database: rows survive `--down` to the previous version, the new
 *    columns and policies go, and re-applying with those rows present fails as one transaction,
 *    leaving the rolled-back shape intact (the runbook's "export first").
 *
 * Local, disposable server only (`support/scratch-db.ts`).
 */
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { insertPlacedOrder } from "../fixtures/order-state.ts";
import * as make from "./support/rows.ts";
import {
  asApp,
  pgFailure,
  probeLocalServer,
  rolledBack,
  runner,
  scratchDatabase,
  type ScratchDatabase,
  type Tx,
} from "./support/scratch-db.ts";

const server = await probeLocalServer();

const MIGRATION = "0022_florists_v0";

/** The version just before `0022`, read from the tree so a renumbering cannot strand the test. */
const PREVIOUS_VERSION = (() => {
  const versions = readdirSync(
    resolve(import.meta.dirname, "../../db/migrations"),
  )
    .filter((file) => /^\d{4}_[a-z0-9_]+\.sql$/u.test(file))
    .filter((file) => !file.endsWith(".down.sql"))
    .map((file) => file.slice(0, 4))
    .sort();
  const index = versions.indexOf(MIGRATION.slice(0, 4));
  return versions[index - 1] ?? "0000";
})();

async function count(tx: Tx, table: string): Promise<number> {
  const [row] = await tx.unsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM public.${table}`,
  );
  return row?.n ?? -1;
}

/** A public-role insert of a valid application, with `extra` columns overriding the defaults. */
function publicInsert(
  sp: Tx,
  countryId: string,
  extra: Record<string, unknown> = {},
) {
  const row = {
    business_name: "Kwiaciarnia Testowa",
    city: "Warszawa",
    country_id: countryId,
    language_code: "pl",
    ...make.APPLICATION_REQUIRED,
    ...extra,
  };
  return sp`INSERT INTO partner_application ${sp(row)}`;
}

describe.skipIf(server.url === undefined)(
  `T-14 — ${MIGRATION}${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "florists");
    }, 600_000);

    afterAll(async () => {
      await scratch.drop();
    });

    it("AC-14: public inserts, reads nothing back, changes and deletes nothing", async () => {
      const report = await rolledBack(scratch.sql, async (tx) => {
        const countryId = await make.country(tx);
        const existing = await make.application(tx, { countryId });
        const before = await count(tx, "partner_application");
        const seen = await (async () => {
          await asApp(tx, { role: "public" });
          await publicInsert(tx, countryId);
          const selected = await count(tx, "partner_application");
          const updated = await tx`
            UPDATE partner_application SET city = 'Kraków' WHERE id = ${existing}`;
          const deleted = await tx`
            DELETE FROM partner_application WHERE id = ${existing}`;
          // An INSERT … RETURNING needs a SELECT policy, which public does not have.
          const returning = await pgFailure(
            tx,
            (sp) =>
              sp`INSERT INTO partner_application ${sp({
                business_name: "Returning",
                city: "Warszawa",
                country_id: countryId,
                language_code: "pl",
                ...make.APPLICATION_REQUIRED,
              })} RETURNING id`,
          );
          await tx.unsafe("RESET ROLE");
          return {
            selected,
            updated: updated.count,
            deleted: deleted.count,
            returning: returning.code,
          };
        })();
        const after = await count(tx, "partner_application");
        const [still] = await tx<{ city: string }[]>`
          SELECT city FROM partner_application WHERE id = ${existing}`;
        return { before, after, seen, city: still?.city };
      });
      expect(report.seen).toEqual({
        selected: 0,
        updated: 0,
        deleted: 0,
        returning: "42501",
      });
      expect(report.after).toBe(report.before + 1);
      expect(report.city).toBe("Warszawa");
    });

    it("AC-14: the four forbidden public inserts are refused", async () => {
      const failures = await rolledBack(scratch.sql, async (tx) => {
        const countryId = await make.country(tx);
        const partnerId = await make.partner(tx, countryId);
        const asset = await make.mediaAsset(tx, { kind: "partner" });
        await asApp(tx, { role: "public" });
        const attempt = (extra: Record<string, unknown>) =>
          pgFailure(tx, (sp) => publicInsert(sp, countryId, extra));
        return {
          status: await attempt({ status: "contacted" }),
          converted: await attempt({
            status: "converted",
            converted_partner_id: partnerId,
          }),
          decided: await attempt({ decided_at: new Date() }),
          media: await attempt({ media_asset_ids: [asset] }),
        };
      });
      // RLS's WITH CHECK refuses the first three (42501); the empty-array CHECK the fourth.
      expect(failures.status.code).toBe("42501");
      expect(failures.converted.code).toBe("42501");
      expect(failures.decided.code).toBe("42501");
      expect(failures.media.code).toBe("23514");
      expect(failures.media.constraint).toBe(
        "partner_application_media_asset_ids_empty_check",
      );
    });

    it("AC-14: a partner reads, changes and deletes no application; admin reads every row", async () => {
      const report = await rolledBack(scratch.sql, async (tx) => {
        const countryId = await make.country(tx);
        const partnerId = await make.partner(tx, countryId);
        for (let index = 0; index < 3; index += 1) {
          await make.application(tx, { countryId });
        }
        const owner = await count(tx, "partner_application");
        await asApp(tx, { role: "partner", partnerIds: [partnerId] });
        const partner = await count(tx, "partner_application");
        const partnerUpdate = (
          await tx`UPDATE partner_application SET city = 'X'`
        ).count;
        const partnerInsert = await pgFailure(tx, (sp) =>
          publicInsert(sp, countryId),
        );
        await tx.unsafe("RESET ROLE");
        await asApp(tx, { role: "admin" });
        const admin = await count(tx, "partner_application");
        await tx.unsafe("RESET ROLE");
        return {
          owner,
          partner,
          partnerUpdate,
          partnerInsert: partnerInsert.code,
          admin,
        };
      });
      expect(report.owner).toBeGreaterThanOrEqual(3);
      expect(report.partner).toBe(0);
      expect(report.partnerUpdate).toBe(0);
      expect(report.partnerInsert).toBe("42501");
      expect(report.admin).toBe(report.owner);
    });

    it("§5.1: the column constraints refuse what the form's schema refuses", async () => {
      const failures = await rolledBack(scratch.sql, async (tx) => {
        const countryId = await make.country(tx);
        const attempt = (extra: Record<string, unknown>) =>
          pgFailure(tx, (sp) => publicInsert(sp, countryId, extra));
        return {
          capacityZero: await attempt({ capacity_per_day: 0 }),
          capacityHigh: await attempt({ capacity_per_day: 501 }),
          channel: await attempt({ preferred_channel: "fax" }),
          weekend: await attempt({ weekend_delivery: "often" }),
          longName: await attempt({ business_name: "x".repeat(201) }),
          longNote: await attempt({ coverage_note: "x".repeat(1001) }),
          longUrl: await attempt({ website_url: `https://${"x".repeat(300)}` }),
          noCountry: await attempt({ country_id: null }),
          noEmail: await attempt({ contact_email: null }),
          noPhone: await attempt({ contact_phone: null }),
          noContact: await attempt({ contact_name: null }),
          noNotice: await attempt({ privacy_notice_version: null }),
        };
      });
      for (const key of [
        "capacityZero",
        "capacityHigh",
        "channel",
        "weekend",
        "longName",
        "longNote",
        "longUrl",
      ] as const) {
        expect(failures[key].code, key).toBe("23514");
      }
      for (const key of [
        "noCountry",
        "noEmail",
        "noPhone",
        "noContact",
        "noNotice",
      ] as const) {
        expect(failures[key].code, key).toBe("23502");
      }
      expect(failures.capacityHigh.constraint).toBe(
        "partner_application_capacity_per_day_range_check",
      );
      expect(failures.longUrl.constraint).toBe(
        "partner_application_lengths_check",
      );
    });

    it("§5.1: partner_member.locale_code defaults to en, takes pl and de, refuses en-gb", async () => {
      const report = await rolledBack(scratch.sql, async (tx) => {
        const countryId = await make.country(tx);
        const partnerId = await make.partner(tx, countryId);
        await tx`INSERT INTO locale (code, bcp47, name) VALUES ('de', 'de-DE', 'Deutsch'),
                   ('en-gb', 'en-GB', 'English (UK)') ON CONFLICT DO NOTHING`;
        const user = async (): Promise<string> => {
          const [row] = await tx<{ id: string }[]>`
            INSERT INTO users (email) VALUES (${`${make.unique("m")}@example.test`})
            RETURNING id`;
          return row?.id ?? "";
        };
        const plain = await user();
        await tx`INSERT INTO partner_member (user_id, partner_id, role)
                 VALUES (${plain}, ${partnerId}, 'owner')`;
        const [defaulted] = await tx<{ locale_code: string }[]>`
          SELECT locale_code FROM partner_member WHERE user_id = ${plain}`;
        const taken: string[] = [];
        for (const code of ["pl", "de"]) {
          const id = await user();
          await tx`INSERT INTO partner_member (user_id, partner_id, role, locale_code)
                   VALUES (${id}, ${partnerId}, 'staff', ${code})`;
          taken.push(code);
        }
        const refused = await pgFailure(
          tx,
          async (sp) =>
            sp`INSERT INTO partner_member (user_id, partner_id, role, locale_code)
               VALUES (${await user()}, ${partnerId}, 'staff', 'en-gb')`,
        );
        return { defaulted: defaulted?.locale_code, taken, refused };
      });
      expect(report.defaulted).toBe("en");
      expect(report.taken).toEqual(["pl", "de"]);
      expect(report.refused.constraint).toBe(
        "partner_member_locale_code_check",
      );
    });

    it("§5.1: a partner sees the delivery photo of its own open or accepted offer, and no other asset", async () => {
      const report = await rolledBack(scratch.sql, async (tx) => {
        const countryId = await make.country(tx);
        const parents = await make.orderParents(tx);
        const partnerA = await make.partner(tx, countryId);
        const partnerB = await make.partner(tx, countryId);
        const order = async (): Promise<string> =>
          insertPlacedOrder(tx, {
            customerId: parents.customerId,
            recipientId: parents.recipientId,
            countryId,
          });
        const offer = async (orderId: string, partnerId: string) => {
          const [row] = await tx<{ id: string }[]>`
            INSERT INTO order_assignment (order_id, partner_id, sla_expires_at, attempt)
            VALUES (${orderId}, ${partnerId}, now() + interval '1 hour', 1) RETURNING id`;
          return row?.id ?? "";
        };
        const proof = async (orderId: string): Promise<string> => {
          const asset = await make.mediaAsset(tx);
          await tx`INSERT INTO delivery_proof (order_id, media_asset_id, uploaded_by)
                   VALUES (${orderId}, ${asset}, 'partner:test')`;
          return asset;
        };
        const orderA = await order();
        await offer(orderA, partnerA);
        const photoA = await proof(orderA);
        const orderB = await order();
        await offer(orderB, partnerB);
        const photoB = await proof(orderB);
        const declinedOrder = await order();
        const declined = await offer(declinedOrder, partnerA);
        const photoDeclined = await proof(declinedOrder);
        await tx`UPDATE order_assignment SET response = 'decline', responded_at = now(),
                 reason = 'capacity' WHERE id = ${declined}`;
        const privateOther = await make.mediaAsset(tx, { kind: "partner" });
        await asApp(tx, { role: "partner", partnerIds: [partnerA] });
        const visible = (
          await tx<{ id: string }[]>`SELECT id FROM media_asset ORDER BY id`
        ).map((row) => row.id);
        await tx.unsafe("RESET ROLE");
        return { visible, photoA, photoB, photoDeclined, privateOther };
      });
      expect(report.visible).toEqual([report.photoA]);
    });

    it("rollback on a seeded database: rows survive, the delta goes, and re-applying with rows present fails whole", async () => {
      const seeded = await scratchDatabase(server.url as string, "florists_rb");
      try {
        const countryId = await seeded.sql.begin(async (tx) => {
          const id = await make.country(tx);
          await make.application(tx, { countryId: id });
          const partnerId = await make.partner(tx, id);
          const [user] = await tx<{ id: string }[]>`
            INSERT INTO users (email) VALUES ('member@example.test') RETURNING id`;
          await tx`INSERT INTO partner_member (user_id, partner_id, role, locale_code)
                   VALUES (${user?.id ?? ""}, ${partnerId}, 'owner', 'pl')`;
          return id;
        });
        expect(countryId).not.toBe("");

        await runner(seeded.url, ["--down", "--to", PREVIOUS_VERSION]);

        const columns = async (table: string): Promise<string[]> =>
          (
            await seeded.sql<{ column_name: string }[]>`
              SELECT column_name FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = ${table}`
          ).map((row) => row.column_name);
        const policies = async (): Promise<string[]> =>
          (
            await seeded.sql<{ policyname: string }[]>`
              SELECT policyname FROM pg_policies
              WHERE policyname IN ('partner_application_public_insert', 'media_asset_partner')`
          ).map((row) => row.policyname);
        const retention = async (): Promise<string[]> =>
          (
            await seeded.sql<{ key: string }[]>`
              SELECT key FROM retention_policy
              WHERE key IN ('partner_application', 'auth_session', 'auth_verification_token')
              ORDER BY key`
          ).map((row) => row.key);
        const rows = async (): Promise<number> =>
          (
            await seeded.sql<{ n: number }[]>`
              SELECT (SELECT count(*) FROM partner_application)::int
                   + (SELECT count(*) FROM partner_member)::int AS n`
          )[0]?.n ?? -1;

        expect(await columns("partner_application")).not.toContain(
          "contact_name",
        );
        expect(await columns("partner_application")).not.toContain(
          "decided_at",
        );
        expect(await columns("partner_member")).not.toContain("locale_code");
        expect(await policies()).toEqual([]);
        expect(await retention()).toEqual([]);
        expect(await rows()).toBe(2);

        // Forward again with an application that lost its contact name: `contact_name NOT NULL`
        // fails, the runner's transaction rolls the whole file back, and nothing half-applies.
        await expect(runner(seeded.url)).rejects.toThrow();
        expect(await columns("partner_application")).not.toContain(
          "contact_name",
        );
        expect(await policies()).toEqual([]);
        expect(await rows()).toBe(2);

        // With the applications exported and removed (the runbook's step), it applies again.
        await seeded.sql`DELETE FROM partner_application`;
        await runner(seeded.url);
        expect(await columns("partner_application")).toContain("contact_name");
        expect(await columns("partner_member")).toContain("locale_code");
        expect(await policies()).toHaveLength(2);
        expect(await retention()).toEqual([
          "auth_session",
          "auth_verification_token",
          "partner_application",
        ]);
        const [member] = await seeded.sql<{ locale_code: string }[]>`
          SELECT locale_code FROM partner_member`;
        // The member survived both directions; its language came back as the default.
        expect(member?.locale_code).toBe("en");
      } finally {
        await seeded.drop();
      }
    }, 600_000);
  },
);
