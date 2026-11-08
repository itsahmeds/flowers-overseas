/**
 * Spec 012 T-18 and T-20 against a migrated scratch database (AC-15, AC-16, AC-17; TASK-221):
 * the partner commands and the status graph with its preconditions, applications moved through
 * spec 011's queries (convert, reject with a reason in `status_reason`), the audit rows `0016`'s
 * trigger writes for each, and migration `0033`'s terms pair check.
 *
 * Runs on a disposable local Postgres only (`support/scratch-db.ts`); skips with the reason when
 * none answers.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  type PartnerAdminRunner,
  createPartner,
  partnerStatusPreflight,
  recordTerms,
  saveBlackout,
  saveCoverage,
  saveMapping,
  setPartnerStatus,
  updatePartner,
} from "../../src/modules/partners/admin/commands.ts";
import {
  listPartners,
  partnerDetail,
} from "../../src/modules/partners/admin/queries.ts";
import {
  convertApplication,
  markApplicationContacted,
  rejectApplication,
} from "../../src/modules/partners/admin/applications.ts";
import { setFloristApplicationStatus } from "../../src/modules/partners/application/admin.ts";
import * as make from "./support/rows.ts";
import { drizzleOver } from "./support/drizzle-tx.ts";
import {
  asApp,
  pgFailure,
  probeLocalServer,
  rolledBack,
  scratchDatabase,
  type ScratchDatabase,
} from "./support/scratch-db.ts";

const server = await probeLocalServer();

const NOW = new Date();
const TODAY = NOW.toISOString().slice(0, 10);

describe.skipIf(server.url === undefined)(
  `partners and applications in admin${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    let run: PartnerAdminRunner;
    let countryId: string;
    let cityId: string;
    let zoneId: string;
    let productId: string;
    const adminId = randomUUID();
    const actor = { userId: adminId, requestId: "it-partners-admin" };

    /** The partner row as the database holds it. */
    async function partnerRow(code: string) {
      const [row] = await scratch.sql<
        {
          id: string;
          status: string;
          updated_at: string;
          version: string;
          terms_signed_at: string | null;
          terms_version: string | null;
          contact_phone: string | null;
          contact_email: string;
          legal_name: string;
          city_label: string;
          notification_channel: string;
          payout_currency_code: string;
          capacity_per_day: number;
          source: string;
        }[]
      >`SELECT id, status, updated_at::text, to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS version, terms_signed_at::text, terms_version, contact_phone,
               contact_email, legal_name, city_label, notification_channel,
               payout_currency_code, capacity_per_day, source
        FROM fulfillment_partner WHERE code = ${code}`;
      if (row === undefined) throw new Error(`no partner ${code}`);
      return row;
    }

    const version = async (code: string) => {
      const row = await partnerRow(code);
      return { partnerId: row.id, updatedAt: row.version };
    };

    const PROFILE = {
      legalName: "Kwiaciarnia Testowa",
      cityLabel: "Kraków",
      countryIso2: "PL",
      notificationChannel: "email",
      contactEmail: "florist@example.test",
      contactPhone: "512 345 678",
      payoutCurrency: "PLN",
      capacityPerDay: "8",
    };

    async function onboarding(): Promise<string> {
      const code = make.unique("pl-test-");
      const created = await createPartner(actor, { ...PROFILE, code }, run);
      expect(created).toEqual({ ok: true, code });
      return code;
    }

    /** An onboarding partner with every condition of `→ active` met. */
    async function ready(): Promise<string> {
      const code = await onboarding();
      expect(
        await recordTerms(
          actor,
          { ...(await version(code)), signedOn: TODAY, version: "v1" },
          NOW,
          run,
        ),
      ).toEqual({ ok: true, code });
      expect(
        await saveCoverage(
          actor,
          {
            ...(await version(code)),
            target: `zone:${zoneId}`,
            capacityPerDay: "",
          },
          run,
        ),
      ).toEqual({ ok: true, code });
      expect(
        await saveMapping(
          actor,
          {
            ...(await version(code)),
            product: productId,
            canFulfil: "yes",
            payoutMinor: "14900",
            currency: "PLN",
          },
          run,
        ),
      ).toEqual({ ok: true, code });
      // Spec 030b AC-40 (TASK-442): no florist goes active without a signed agreement on file.
      const { id } = await partnerRow(code);
      await scratch.sql.begin((tx) => make.agreement(tx, id));
      return code;
    }

    const status = async (code: string, to: string) =>
      setPartnerStatus(actor, { ...(await version(code)), to }, run);

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "partnersadmin");
      await scratch.sql.begin(async (tx) => {
        countryId = await make.country(tx, "PL");
        await make.country(tx, "DE");
        const [c] = await tx<{ id: string }[]>`
          INSERT INTO city (country_id) VALUES (${countryId}) RETURNING id`;
        cityId = c?.id ?? "";
        await tx`INSERT INTO city_translation (city_id, country_id, locale_code, name, slug)
                 VALUES (${cityId}, ${countryId}, 'en', 'Krakow', 'krakow')`;
        const [z] = await tx<{ id: string }[]>`
          INSERT INTO postcode_zone (country_id, prefix, city_id)
          VALUES (${countryId}, '30-', ${cityId}) RETURNING id`;
        zoneId = z?.id ?? "";
        const [p] = await tx<{ id: string }[]>`
          INSERT INTO product (sku, product_type, primary_flower, colour_primary, style,
                               price_tier, substitution_class, freshness_days)
          VALUES ('FO-TEST-1', 'bouquet', 'roses', 'red', 'classic', 'classic', 'main_flower', 5)
          RETURNING id`;
        productId = p?.id ?? "";
        await tx`INSERT INTO users (id, email) VALUES (${adminId}, 'founder@example.test')`;
      });
      run = (context, fn) =>
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

    describe("AC-15 · a refused save changes nothing", () => {
      it("refuses a malformed email, a non-E.164 phone, an unknown currency; the row is untouched", async () => {
        const code = await onboarding();
        const before = await partnerRow(code);
        for (const [change, errors] of [
          [{ contactEmail: "florist@" }, { contactEmail: "email" }],
          [{ contactPhone: "+49 30 901820" }, { contactPhone: "phone" }],
          [{ payoutCurrency: "XXX" }, { payoutCurrency: "currency" }],
        ] as const) {
          expect(
            await updatePartner(
              actor,
              { ...PROFILE, ...change, ...(await version(code)) },
              run,
            ),
          ).toEqual({ ok: false, reason: "invalid", errors });
        }
        expect(await partnerRow(code)).toEqual(before);
      });

      it.each(["0", "-1", "12.5"])(
        "refuses the payout %j and writes no mapping",
        async (payout) => {
          const code = await onboarding();
          expect(
            await saveMapping(
              actor,
              {
                ...(await version(code)),
                product: productId,
                canFulfil: "yes",
                payoutMinor: payout,
                currency: "PLN",
              },
              run,
            ),
          ).toEqual({
            ok: false,
            reason: "invalid",
            errors: { payoutMinor: "payout" },
          });
          const rows = await scratch.sql`
            SELECT 1 FROM partner_catalog_mapping m JOIN fulfillment_partner p ON p.id = m.partner_id
            WHERE p.code = ${code}`;
          expect(rows.length).toBe(0);
        },
      );

      it("stores the phone as E.164 and the payout as integer minor units in the partner's currency", async () => {
        const code = await ready();
        expect((await partnerRow(code)).contact_phone).toBe("+48512345678");
        const [mapping] = await scratch.sql<
          {
            partner_payout_minor: string;
            currency_code: string;
            source: string;
          }[]
        >`SELECT m.partner_payout_minor::text, m.currency_code, m.source
          FROM partner_catalog_mapping m JOIN fulfillment_partner p ON p.id = m.partner_id
          WHERE p.code = ${code}`;
        expect(mapping).toEqual({
          partner_payout_minor: "14900",
          currency_code: "PLN",
          source: "real",
        });
      });

      it("refuses a mapping in a currency other than the partner's", async () => {
        const code = await onboarding();
        expect(
          await saveMapping(
            actor,
            {
              ...(await version(code)),
              product: productId,
              canFulfil: "yes",
              payoutMinor: "3900",
              currency: "EUR",
            },
            run,
          ),
        ).toEqual({ ok: false, reason: "currency_mismatch" });
      });

      it("a stale save is a conflict and changes nothing", async () => {
        const code = await onboarding();
        const stale = await version(code);
        expect(
          await updatePartner(
            actor,
            { ...PROFILE, cityLabel: "Wieliczka", ...stale },
            run,
          ),
        ).toEqual({ ok: true, code });
        const after = await partnerRow(code);
        expect(
          await updatePartner(
            actor,
            { ...PROFILE, cityLabel: "Tarnów", ...stale },
            run,
          ),
        ).toEqual({ ok: false, reason: "conflict" });
        expect(
          await saveCoverage(
            actor,
            { ...stale, target: `city:${cityId}` },
            run,
          ),
        ).toEqual({ ok: false, reason: "conflict" });
        expect(await partnerRow(code)).toEqual(after);
        expect(after.city_label).toBe("Wieliczka");
      });

      it("refuses a zone in another country and a duplicate zone", async () => {
        const code = await onboarding();
        const otherCountry = await scratch.sql<{ id: string }[]>`
          INSERT INTO city (country_id) SELECT id FROM country WHERE iso2 = 'DE' RETURNING id`;
        expect(
          await saveCoverage(
            actor,
            {
              ...(await version(code)),
              target: `city:${otherCountry[0]?.id ?? ""}`,
            },
            run,
          ),
        ).toEqual({ ok: false, reason: "outside_country" });
        expect(
          await saveCoverage(
            actor,
            { ...(await version(code)), target: `city:${cityId}` },
            run,
          ),
        ).toEqual({ ok: true, code });
        expect(
          await saveCoverage(
            actor,
            { ...(await version(code)), target: `city:${cityId}` },
            run,
          ),
        ).toEqual({ ok: false, reason: "duplicate" });
      });

      it("adds and removes a day off", async () => {
        const code = await onboarding();
        expect(
          await saveBlackout(
            actor,
            { ...(await version(code)), date: TODAY },
            NOW,
            run,
          ),
        ).toEqual({ ok: true, code });
        expect(
          await saveBlackout(
            actor,
            { ...(await version(code)), date: TODAY },
            NOW,
            run,
          ),
        ).toEqual({ ok: false, reason: "duplicate" });
        expect(
          await saveBlackout(
            actor,
            { ...(await version(code)), op: "remove", date: TODAY },
            NOW,
            run,
          ),
        ).toEqual({ ok: true, code });
      });
    });

    describe("T-18 · the status graph and its preconditions (AC-16)", () => {
      it("activates a partner with all four conditions, and the audit row names the action", async () => {
        const code = await ready();
        expect(await status(code, "active")).toEqual({ ok: true, code });
        expect((await partnerRow(code)).status).toBe("active");
        const audit = await scratch.sql<
          { action: string; actor_user_id: string }[]
        >`
          SELECT a.action, a.actor_user_id FROM audit_log a
          JOIN fulfillment_partner p ON a.entity_id = p.id::text
          WHERE a.entity_table = 'fulfillment_partner' AND p.code = ${code}
            AND a.after ? 'status'
          ORDER BY a.at`;
        expect(audit.map((row) => row.action)).toEqual([
          "partner.create",
          "partner.status.active",
        ]);
        expect(audit[1]?.actor_user_id).toBe(adminId);
      });

      it("walks the rest of the graph: active → paused → active → offboarded", async () => {
        const code = await ready();
        for (const to of ["active", "paused", "active", "offboarded"]) {
          expect(await status(code, to), to).toEqual({ ok: true, code });
        }
      });

      it.each([
        [
          "terms",
          async (code: string) => {
            // No terms: zone and product only.
            await saveCoverage(
              actor,
              { ...(await version(code)), target: `zone:${zoneId}` },
              run,
            );
            await saveMapping(
              actor,
              {
                ...(await version(code)),
                product: productId,
                canFulfil: "yes",
                payoutMinor: "100",
                currency: "PLN",
              },
              run,
            );
          },
        ],
        [
          "coverage",
          async (code: string) => {
            await recordTerms(
              actor,
              { ...(await version(code)), signedOn: TODAY, version: "v1" },
              NOW,
              run,
            );
            await saveMapping(
              actor,
              {
                ...(await version(code)),
                product: productId,
                canFulfil: "yes",
                payoutMinor: "100",
                currency: "PLN",
              },
              run,
            );
          },
        ],
        [
          "mapping",
          async (code: string) => {
            await recordTerms(
              actor,
              { ...(await version(code)), signedOn: TODAY, version: "v1" },
              NOW,
              run,
            );
            await saveCoverage(
              actor,
              { ...(await version(code)), target: `zone:${zoneId}` },
              run,
            );
            // A product it cannot make does not count.
            await saveMapping(
              actor,
              {
                ...(await version(code)),
                product: productId,
                canFulfil: "no",
                payoutMinor: "100",
                currency: "PLN",
              },
              run,
            );
          },
        ],
      ] as const)(
        "refuses → active while %s is missing, and changes nothing",
        async (missing, prepare) => {
          const code = await onboarding();
          // Spec 030b AC-40: every other condition met, the agreement included.
          await scratch.sql.begin(async (tx) =>
            make.agreement(tx, (await partnerRow(code)).id),
          );
          await prepare(code);
          const before = await partnerRow(code);
          expect(await status(code, "active")).toEqual({
            ok: false,
            reason: "preflight",
            unmet: [missing],
          });
          expect(await partnerRow(code)).toEqual(before);
          const preflight = await partnerStatusPreflight(actor, before.id, run);
          expect(preflight?.[missing]).toBe(false);
        },
      );

      it("refuses → active while no signed agreement is on file (030b AC-40), and changes nothing", async () => {
        const code = await ready();
        const { id } = await partnerRow(code);
        await scratch.sql`DELETE FROM partner_contract WHERE partner_id = ${id}`;
        const before = await partnerRow(code);
        expect(await status(code, "active")).toEqual({
          ok: false,
          reason: "preflight",
          unmet: ["agreement"],
        });
        expect(await partnerRow(code)).toEqual(before);
        expect((await partnerStatusPreflight(actor, id, run))?.agreement).toBe(
          false,
        );
      });

      it("refuses → active while the contact for the chosen channel is not usable", async () => {
        const code = await ready();
        // Admin cannot save a malformed address (AC-15), so the bad contact is staged directly,
        // outside admin, as an imported row might carry it; the preflight reads the row.
        await scratch.sql`
          UPDATE fulfillment_partner SET contact_email = 'not-an-address' WHERE code = ${code}`;
        const before = await partnerRow(code);
        expect(await status(code, "active")).toEqual({
          ok: false,
          reason: "preflight",
          unmet: ["contact"],
        });
        expect(await partnerRow(code)).toEqual(before);
      });

      it("refuses every edge outside the graph, demo included", async () => {
        const code = await ready();
        for (const to of ["onboarding", "paused", "demo"]) {
          expect(await status(code, to), `onboarding → ${to}`).toEqual({
            ok: false,
            reason: "illegal_edge",
          });
        }
        expect(await status(code, "offboarded")).toEqual({ ok: true, code });
        for (const to of [
          "active",
          "paused",
          "onboarding",
          "demo",
          "offboarded",
        ]) {
          expect(await status(code, to), `offboarded → ${to}`).toEqual({
            ok: false,
            reason: "illegal_edge",
          });
        }
        expect((await partnerRow(code)).status).toBe("offboarded");
      });

      it("a demo partner can only be offboarded, whatever it has", async () => {
        const id = await scratch.sql.begin((tx) =>
          make.partner(tx, countryId, "demo"),
        );
        const [row] = await scratch.sql<{ code: string }[]>`
          SELECT code FROM fulfillment_partner WHERE id = ${id}`;
        const code = row?.code ?? "";
        await recordTerms(
          actor,
          { ...(await version(code)), signedOn: TODAY, version: "v1" },
          NOW,
          run,
        );
        await saveCoverage(
          actor,
          { ...(await version(code)), target: `zone:${zoneId}` },
          run,
        );
        for (const to of ["active", "paused", "onboarding"]) {
          expect(await status(code, to), to).toEqual({
            ok: false,
            reason: "illegal_edge",
          });
        }
        expect(await status(code, "offboarded")).toEqual({ ok: true, code });
      });

      it("create never makes a demo or active partner", async () => {
        const code = await onboarding();
        expect((await partnerRow(code)).status).toBe("onboarding");
        expect(
          await createPartner(
            actor,
            { ...PROFILE, code, status: "active" },
            run,
          ),
        ).toEqual({ ok: false, reason: "code_taken" });
      });
    });

    describe("the reads the pages render", () => {
      it("lists each partner with its own zone and fulfillable product counts, and reads its record", async () => {
        const code = await ready();
        const bare = await onboarding();
        const list = await listPartners(actor, { country: "PL" }, run);
        const row = list.items.find((item) => item.code === code);
        const other = list.items.find((item) => item.code === bare);
        expect(row).toMatchObject({
          zones: 1,
          products: 1,
          termsVersion: "v1",
        });
        expect(other).toMatchObject({
          zones: 0,
          products: 0,
          termsVersion: null,
        });
        expect(list.counts.onboarding).toBeGreaterThanOrEqual(2);
        const onlyActive = await listPartners(actor, { status: "active" }, run);
        expect(onlyActive.items.every((item) => item.status === "active")).toBe(
          true,
        );

        const detail = await partnerDetail(actor, code, run);
        expect(detail).toMatchObject({
          code,
          status: "onboarding",
          contactPhone: "+48512345678",
          termsVersion: "v1",
          preflight: {
            terms: true,
            coverage: true,
            mapping: true,
            contact: true,
          },
          moves: ["active", "offboarded"],
        });
        expect(detail?.zones).toEqual([
          {
            id: expect.any(String),
            cityName: "Krakow",
            prefix: "30-",
            capacityPerDay: null,
          },
        ]);
        expect(detail?.mappings).toEqual([
          {
            id: expect.any(String),
            productName: "FO-TEST-1",
            tierKey: null,
            stems: null,
            canFulfil: true,
            payoutMinor: 14900,
            currency: "PLN",
          },
        ]);
        expect(
          detail?.options.coverage.map((option) => option.value).sort(),
        ).toEqual([`city:${cityId}`, `zone:${zoneId}`].sort());
        expect(
          await partnerDetail(actor, "no-such-florist", run),
        ).toBeUndefined();
      });
    });

    describe("migration 0033 · signed terms are a pair", () => {
      it("refuses a version without a date and a date without a version", async () => {
        await rolledBack(scratch.sql, async (tx) => {
          const id = await make.partner(tx, countryId, "onboarding");
          const noDate = await pgFailure(
            tx,
            (sp) =>
              sp`UPDATE fulfillment_partner SET terms_version = 'v1' WHERE id = ${id}`,
          );
          expect(noDate.constraint).toBe(
            "fulfillment_partner_terms_pair_check",
          );
          const noVersion = await pgFailure(
            tx,
            (sp) =>
              sp`UPDATE fulfillment_partner SET terms_signed_at = current_date WHERE id = ${id}`,
          );
          expect(noVersion.constraint).toBe(
            "fulfillment_partner_terms_pair_check",
          );
        });
      });
    });

    describe("T-20 · applications through spec 011's queries (AC-17)", () => {
      async function applicationRow(id: string) {
        const [row] = await scratch.sql<
          {
            status: string;
            status_reason: string | null;
            converted_partner_id: string | null;
            updated_at: string;
            version: string;
          }[]
        >`SELECT status, status_reason, converted_partner_id, updated_at::text,
                 to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS version
          FROM partner_application WHERE id = ${id}`;
        if (row === undefined) throw new Error("no application");
        return row;
      }
      const appVersion = async (id: string) => ({
        applicationId: id,
        updatedAt: (await applicationRow(id)).version,
      });

      async function newApplication(name: string): Promise<string> {
        return scratch.sql.begin((tx) =>
          make.application(tx, { countryId, businessName: name }),
        );
      }

      it("moves new → contacted → converted, creating one linked onboarding partner from its fields", async () => {
        const id = await newApplication("Kwiaciarnia Pod Lipą");
        // new → converted skips a step and is refused.
        expect(
          await convertApplication(actor, await appVersion(id), run),
        ).toEqual({
          ok: false,
          reason: "illegal_edge",
        });
        expect(
          await markApplicationContacted(actor, await appVersion(id), run),
        ).toEqual({
          ok: true,
        });
        const partnersBefore =
          await scratch.sql`SELECT id FROM fulfillment_partner`;
        const converted = await convertApplication(
          actor,
          await appVersion(id),
          run,
        );
        expect(converted).toEqual({
          ok: true,
          partnerCode: "pl-kwiaciarnia-pod-lipa",
        });
        const partnersAfter =
          await scratch.sql`SELECT id FROM fulfillment_partner`;
        expect(partnersAfter.length).toBe(partnersBefore.length + 1);
        const partner = await partnerRow("pl-kwiaciarnia-pod-lipa");
        expect(partner).toMatchObject({
          status: "onboarding",
          legal_name: "Kwiaciarnia Pod Lipą",
          city_label: "Warszawa",
          contact_email: "applicant@example.test",
          contact_phone: "+48500000000",
          notification_channel: "email",
          payout_currency_code: "PLN",
          capacity_per_day: 1,
          terms_signed_at: null,
        });
        expect(await applicationRow(id)).toMatchObject({
          status: "converted",
          converted_partner_id: partner.id,
          status_reason: null,
        });
        // Converted is the end.
        expect(
          await convertApplication(actor, await appVersion(id), run),
        ).toEqual({
          ok: false,
          reason: "illegal_edge",
        });
        const audit = await scratch.sql<
          { action: string; entity_table: string }[]
        >`
          SELECT action, entity_table FROM audit_log
          WHERE (entity_table = 'partner_application' AND entity_id = ${id})
             OR (entity_table = 'fulfillment_partner' AND entity_id = ${partner.id})
          ORDER BY at`;
        expect(audit).toEqual([
          {
            action: "applications.status.contacted",
            entity_table: "partner_application",
          },
          {
            action: "application.convert",
            entity_table: "fulfillment_partner",
          },
          {
            action: "applications.status.converted",
            entity_table: "partner_application",
          },
        ]);
      });

      it("a second application with the same name gets the next free code", async () => {
        const id = await newApplication("Kwiaciarnia Pod Lipą");
        await markApplicationContacted(actor, await appVersion(id), run);
        expect(
          await convertApplication(actor, await appVersion(id), run),
        ).toEqual({
          ok: true,
          partnerCode: "pl-kwiaciarnia-pod-lipa-2",
        });
      });

      it("refuses a reject without a reason and stores the reason with the status", async () => {
        const id = await newApplication(make.unique("Kwiaty "));
        await markApplicationContacted(actor, await appVersion(id), run);
        const before = await applicationRow(id);
        for (const reason of [undefined, "", "  "]) {
          expect(
            await rejectApplication(
              actor,
              {
                ...(await appVersion(id)),
                ...(reason === undefined ? {} : { reason }),
              },
              run,
            ),
          ).toEqual({
            ok: false,
            reason: "invalid",
            errors: { reason: "reason" },
          });
        }
        expect(await applicationRow(id)).toEqual(before);
        expect(
          await rejectApplication(
            actor,
            {
              ...(await appVersion(id)),
              reason: "  Not adding florists in Warszawa this month.  ",
            },
            run,
          ),
        ).toEqual({ ok: true });
        expect(await applicationRow(id)).toMatchObject({
          status: "rejected",
          status_reason: "Not adding florists in Warszawa this month.",
          converted_partner_id: null,
        });
        const [audit] = await scratch.sql<
          { action: string; after: Record<string, unknown> }[]
        >`
          SELECT action, after FROM audit_log
          WHERE entity_table = 'partner_application' AND entity_id = ${id}
          ORDER BY at DESC LIMIT 1`;
        expect(audit?.action).toBe("applications.status.rejected");
        expect(audit?.after).toMatchObject({
          status: "rejected",
          status_reason: "Not adding florists in Warszawa this month.",
        });
      });

      it("spec 011's query changes nothing when the row no longer has the status it names", async () => {
        const id = await newApplication(make.unique("Kwiaty "));
        await markApplicationContacted(actor, await appVersion(id), run);
        const before = await applicationRow(id);
        expect(
          await setFloristApplicationStatus(
            actor,
            id,
            "rejected",
            { from: "new", statusReason: "Too far away." },
            run,
          ),
        ).toEqual({ ok: false, reason: "not_found" });
        expect(await applicationRow(id)).toEqual(before);
      });

      it("a new application cannot be rejected, and a stale form is a conflict", async () => {
        const id = await newApplication(make.unique("Kwiaty "));
        expect(
          await rejectApplication(
            actor,
            { ...(await appVersion(id)), reason: "Too far away." },
            run,
          ),
        ).toEqual({ ok: false, reason: "illegal_edge" });
        const stale = await appVersion(id);
        await markApplicationContacted(actor, stale, run);
        expect(await convertApplication(actor, stale, run)).toEqual({
          ok: false,
          reason: "conflict",
        });
        expect((await applicationRow(id)).status).toBe("contacted");
      });
    });
  },
);
