/**
 * The florist application against a migrated scratch database (spec 011 §2 "The write", §5.2;
 * TASK-213): T-11's integration half (one `partner_application` row with every submitted column,
 * `status = 'new'`, the notice version and the language, written under the **public** role with no
 * `RETURNING`), and the admin queries for spec 012 (`listFloristApplications`,
 * `setFloristApplicationStatus`: `decided_at` for `rejected` and `converted`, the audit row written
 * by `0016`'s trigger and not by the query).
 *
 * Runs on a disposable local Postgres only (`support/scratch-db.ts`); skips with the reason when
 * none answers.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  type ApplicationAdminRunner,
  listFloristApplications,
  setFloristApplicationStatus,
} from "../../src/modules/partners/application/admin.ts";
import { FloristApplicationInputSchema } from "../../src/modules/partners/application/schema.ts";
import {
  type PublicRunner,
  dbApplicationSink,
} from "../../src/modules/partners/application/sink.ts";
import type { FloristApplication } from "../../src/modules/partners/application/submit.ts";
import * as make from "./support/rows.ts";
import { drizzleOver } from "./support/drizzle-tx.ts";
import {
  asApp,
  probeLocalServer,
  scratchDatabase,
  type ScratchDatabase,
} from "./support/scratch-db.ts";

const server = await probeLocalServer();

const NOTICE = "apply-notice-0123456789abcdef";

function application(
  overrides: Record<string, string> = {},
): FloristApplication {
  return {
    ...FloristApplicationInputSchema.parse({
      businessName: "Kwiaciarnia Przykładowa",
      contactName: "Ola Testowa",
      email: "ola@example.test",
      phone: "+48 512 000 000",
      country: "PL",
      town: "Kraków",
      capacityPerDay: "12",
      deliveryArea: "Stare Miasto, Kazimierz",
      weekendDelivery: "sometimes",
      registrationNumber: "NIP 000-000-00-00",
      website: "https://www.instagram.com/kwiaciarnia.example",
      contactPreference: "whatsapp",
      language: "pl",
      ...overrides,
    }),
    privacyNoticeVersion: NOTICE,
  };
}

describe.skipIf(server.url === undefined)(
  `florist applications${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    let publicRun: PublicRunner;
    let adminRun: ApplicationAdminRunner;
    let partnerId: string;
    const adminId = randomUUID();

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "floristapps");
      await scratch.sql.begin(async (tx) => {
        const countryId = await make.country(tx, "PL");
        partnerId = await make.partner(tx, countryId, "onboarding");
        await tx`INSERT INTO users (id, email) VALUES (${adminId}, 'founder@example.test')`;
      });
      publicRun = (fn) =>
        scratch.sql.begin(async (tx) => {
          await asApp(tx, { role: "public" });
          return fn(drizzleOver(tx, scratch.sql));
        }) as never;
      adminRun = (context, fn) =>
        scratch.sql.begin(async (tx) => {
          await tx`SELECT set_config('app.audit_action', ${context.action}, true)`;
          await asApp(tx, {
            role: "admin",
            ...(context.userId === undefined ? {} : { userId: context.userId }),
          });
          return fn(drizzleOver(tx, scratch.sql));
        }) as never;
    }, 300_000);

    afterAll(async () => {
      await scratch.drop();
    });

    it("T-11: the public role stores exactly one row with every submitted column, and reads nothing back", async () => {
      await dbApplicationSink(publicRun).accept(application());
      const rows = await scratch.sql<Record<string, unknown>[]>`
        SELECT a.business_name, a.contact_name, a.contact_email, a.contact_phone, c.iso2,
               a.city, a.coverage_note, a.capacity_per_day, a.weekend_delivery,
               a.registration_number, a.instagram_url, a.website_url, a.preferred_channel,
               a.language_code, a.privacy_notice_version, a.status, a.converted_partner_id,
               a.decided_at, cardinality(a.media_asset_ids) AS media
        FROM partner_application a JOIN country c ON c.id = a.country_id`;
      expect(rows).toEqual([
        {
          business_name: "Kwiaciarnia Przykładowa",
          contact_name: "Ola Testowa",
          contact_email: "ola@example.test",
          contact_phone: "+48 512 000 000",
          iso2: "PL",
          city: "Kraków",
          coverage_note: "Stare Miasto, Kazimierz",
          capacity_per_day: 12,
          weekend_delivery: "sometimes",
          registration_number: "NIP 000-000-00-00",
          instagram_url: "https://www.instagram.com/kwiaciarnia.example",
          website_url: null,
          preferred_channel: "whatsapp",
          language_code: "pl",
          privacy_notice_version: NOTICE,
          status: "new",
          converted_partner_id: null,
          decided_at: null,
          media: 0,
        },
      ]);
      // The public role sees none of it, its own row included (0022, no SELECT policy).
      const seen = await publicRun(async (db) =>
        db.execute("SELECT count(*)::int AS n FROM partner_application"),
      );
      expect(seen).toEqual([{ n: 0 }]);
    });

    it("refuses a country with no row: the sink throws and nothing is stored", async () => {
      const before = await scratch.sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM partner_application`;
      await expect(
        dbApplicationSink(publicRun).accept(application({ country: "RO" })),
      ).rejects.toThrow();
      const after = await scratch.sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM partner_application`;
      expect(after).toEqual(before);
    });

    it("lists applications under the admin role, newest first, filtered by status", async () => {
      await dbApplicationSink(publicRun).accept(
        application({ businessName: "Second Shop", website: "" }),
      );
      const all = await listFloristApplications(
        { userId: adminId },
        {},
        adminRun,
      );
      expect(all.map((row) => row.businessName)).toEqual([
        "Second Shop",
        "Kwiaciarnia Przykładowa",
      ]);
      expect(all[0]).toMatchObject({
        status: "new",
        countryIso2: "PL",
        websiteUrl: null,
        instagramUrl: null,
        privacyNoticeVersion: NOTICE,
        decidedAt: null,
      });
      expect(
        await listFloristApplications(
          { userId: adminId },
          { status: "rejected" },
          adminRun,
        ),
      ).toEqual([]);
    });

    it("sets decided_at for rejected and converted, clears it otherwise, and the trigger writes the audit row", async () => {
      const [first] = await listFloristApplications(
        { userId: adminId },
        { status: "new" },
        adminRun,
      );
      const id = first?.id ?? "";

      expect(
        await setFloristApplicationStatus(
          { userId: adminId },
          id,
          "contacted",
          {},
          adminRun,
        ),
      ).toEqual({ ok: true });
      let [row] = await listFloristApplications(
        { userId: adminId },
        { status: "contacted" },
        adminRun,
      );
      expect(row?.decidedAt).toBeNull();

      expect(
        await setFloristApplicationStatus(
          { userId: adminId },
          id,
          "rejected",
          {},
          adminRun,
        ),
      ).toEqual({ ok: true });
      [row] = await listFloristApplications(
        { userId: adminId },
        { status: "rejected" },
        adminRun,
      );
      expect(row?.decidedAt).toBeInstanceOf(Date);

      const audit = await scratch.sql<
        { action: string; actor_user_id: string }[]
      >`
        SELECT action, actor_user_id FROM audit_log
        WHERE entity_table = 'partner_application' AND entity_id = ${id}
        ORDER BY at, id`;
      expect(audit.map((entry) => entry.action)).toEqual([
        "applications.status.contacted",
        "applications.status.rejected",
      ]);
      expect(audit.every((entry) => entry.actor_user_id === adminId)).toBe(
        true,
      );

      // `converted` needs the partner the applicant became, and nothing else may carry one.
      expect(
        await setFloristApplicationStatus(
          { userId: adminId },
          id,
          "converted",
          {},
          adminRun,
        ),
      ).toEqual({ ok: false, reason: "invalid" });
      expect(
        await setFloristApplicationStatus(
          { userId: adminId },
          id,
          "contacted",
          { convertedPartnerId: partnerId },
          adminRun,
        ),
      ).toEqual({ ok: false, reason: "invalid" });
      expect(
        await setFloristApplicationStatus(
          { userId: adminId },
          id,
          "converted",
          { convertedPartnerId: partnerId },
          adminRun,
        ),
      ).toEqual({ ok: true });
      [row] = await listFloristApplications(
        { userId: adminId },
        { status: "converted" },
        adminRun,
      );
      expect(row).toMatchObject({ convertedPartnerId: partnerId });
      expect(row?.decidedAt).toBeInstanceOf(Date);

      // Back to `new`: the decision and the partner are cleared together.
      expect(
        await setFloristApplicationStatus(
          { userId: adminId },
          id,
          "new",
          {},
          adminRun,
        ),
      ).toEqual({ ok: true });
      [row] = (
        await listFloristApplications({ userId: adminId }, {}, adminRun)
      ).filter((entry) => entry.id === id);
      expect(row).toMatchObject({
        status: "new",
        convertedPartnerId: null,
        decidedAt: null,
      });
    });

    it("answers not_found for an id with no row, and invalid for a malformed one", async () => {
      expect(
        await setFloristApplicationStatus(
          { userId: adminId },
          randomUUID(),
          "rejected",
          {},
          adminRun,
        ),
      ).toEqual({ ok: false, reason: "not_found" });
      expect(
        await setFloristApplicationStatus(
          { userId: adminId },
          "not-a-uuid",
          "rejected",
          {},
          adminRun,
        ),
      ).toEqual({ ok: false, reason: "invalid" });
    });
  },
);
