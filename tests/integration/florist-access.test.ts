/**
 * Spec 026a T-07 to T-10 against a migrated scratch database (AC-7, AC-8, AC-9, AC-10; TASK-355):
 * florist access granted in admin.
 *
 *  - T-07 (AC-7): create, convert, a changed email and an unchanged email, a mixed-case address
 *    with spaces included, leave exactly one `owner` membership for the normalised contact email;
 *    the old user is deleted with its sessions, or kept for each of the four reasons; the old
 *    session has no florist context on its next request; a forced failure inside the sync leaves
 *    the partner row as it was.
 *  - T-08 (AC-8): one audit row per membership insert and delete, `{userId}:{partnerId}`, with
 *    `partner.member.grant` or `partner.member.revoke`; the partner write keeps its own action;
 *    the first-sign-in stamp and the language switch write none.
 *  - T-09 (AC-9): a created membership carries `floristLanguageFor`'s value; a re-sync keeps `de`
 *    for a Polish partner whose florist chose it.
 *  - T-10 (AC-10): the stamp is set once over two sign-ins; `floristSignInStatus` reads both
 *    states.
 *
 * Runs on a disposable local Postgres only (`support/scratch-db.ts`); skips with the reason when
 * none answers.
 */
import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthRunner } from "../../src/lib/auth/adapter.ts";
import {
  createFloristAuth,
  resolveFloristContext,
} from "../../src/lib/auth/florist.ts";
import { recordFirstFloristSignIn } from "../../src/modules/partners/access/first-sign-in.ts";
import { floristSignInStatus } from "../../src/modules/partners/access/status.ts";
import { convertApplication } from "../../src/modules/partners/admin/applications.ts";
import {
  type PartnerAdminRunner,
  createPartner,
  updatePartner,
} from "../../src/modules/partners/admin/commands.ts";
import { drizzleOver } from "./support/drizzle-tx.ts";
import * as make from "./support/rows.ts";
import {
  asApp,
  probeLocalServer,
  scratchDatabase,
  type ScratchDatabase,
} from "./support/scratch-db.ts";

const server = await probeLocalServer();

/** The database's message behind a Drizzle query error (its `cause`), or the error's own. */
function causeOf(error: unknown): string {
  if (!(error instanceof Error)) return `not an error: ${String(error)}`;
  return error.cause instanceof Error ? error.cause.message : error.message;
}

describe.skipIf(server.url === undefined)(
  `florist access in admin${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    let run: PartnerAdminRunner;
    let systemRun: AuthRunner;
    let plId: string;
    const adminId = randomUUID();
    const actor = { userId: adminId, requestId: "it-florist-access" };

    const PROFILE = {
      legalName: "Kwiaciarnia Dostępu",
      cityLabel: "Kraków",
      countryIso2: "PL",
      notificationChannel: "email",
      contactEmail: "florist@example.test",
      contactPhone: "512 345 678",
      payoutCurrency: "PLN",
      capacityPerDay: "8",
    };

    async function partnerRow(code: string) {
      const [row] = await scratch.sql<
        { id: string; version: string; contact_email: string }[]
      >`SELECT id, contact_email,
               to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS version
        FROM fulfillment_partner WHERE code = ${code}`;
      if (row === undefined) throw new Error(`no partner ${code}`);
      return row;
    }

    /** Every membership of the partner, with its user's address. */
    async function members(partnerId: string) {
      return scratch.sql<
        {
          email: string;
          user_id: string;
          role: string;
          locale_code: string;
          accepted_at: string | null;
        }[]
      >`SELECT u.email, m.user_id, m.role, m.locale_code,
               to_char(m.accepted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS accepted_at
        FROM partner_member m JOIN users u ON u.id = m.user_id
        WHERE m.partner_id = ${partnerId} ORDER BY u.email`;
    }

    async function userExists(id: string): Promise<boolean> {
      const rows = await scratch.sql`SELECT 1 FROM users WHERE id = ${id}`;
      return rows.length === 1;
    }

    async function memberAudit(partnerId: string) {
      return scratch.sql<{ action: string; entity_id: string }[]>`
        SELECT action, entity_id FROM audit_log
        WHERE entity_table = 'partner_member' AND entity_id LIKE ${`%:${partnerId}`}
        ORDER BY at, id`;
    }

    async function create(contactEmail: string, countryIso2 = "PL") {
      const code = make.unique("pl-access-");
      expect(
        await createPartner(
          actor,
          { ...PROFILE, countryIso2, contactEmail, code },
          run,
        ),
      ).toEqual({ ok: true, code });
      return partnerRow(code);
    }

    async function changeEmail(code: string, contactEmail: string) {
      const row = await partnerRow(code);
      return updatePartner(
        actor,
        { ...PROFILE, contactEmail, partnerId: row.id, updatedAt: row.version },
        run,
      );
    }

    async function codeOf(partnerId: string): Promise<string> {
      const [row] = await scratch.sql<{ code: string }[]>`
        SELECT code FROM fulfillment_partner WHERE id = ${partnerId}`;
      return row?.code ?? "";
    }

    async function session(userId: string): Promise<string> {
      const token = `florist.${randomUUID().replaceAll("-", "")}`;
      await scratch.sql`INSERT INTO sessions (session_token, user_id, expires)
                        VALUES (${token}, ${userId}, now() + interval '30 days')`;
      return token;
    }

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "floristaccess");
      await scratch.sql.begin(async (tx) => {
        plId = await make.country(tx, "PL");
        await tx`INSERT INTO locale (code, bcp47, name) VALUES ('de', 'de-DE', 'Deutsch')
                 ON CONFLICT DO NOTHING`;
        for (const iso2 of ["DE", "AT", "FR"]) {
          await tx`INSERT INTO currency (code, minor_unit_exponent) VALUES ('EUR', 2)
                   ON CONFLICT DO NOTHING`;
          await tx`INSERT INTO country (iso2, currency_code, vat_rate_bp, iana_zone)
                   VALUES (${iso2}, 'EUR', 2000, 'Europe/Berlin') ON CONFLICT DO NOTHING`;
        }
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
      systemRun = (fn) =>
        scratch.sql.begin(async (tx) => {
          await asApp(tx, { role: "system" });
          return fn(drizzleOver(tx, scratch.sql));
        }) as never;
    }, 300_000);

    afterAll(async () => {
      await scratch.drop();
    });

    describe("T-07 · one owner for the contact email (AC-7)", () => {
      it("creating a partner with a mixed-case address with spaces makes one owner for the normalised address", async () => {
        const partner = await create("  Piotr.Nowak@Example.TEST ");
        expect(partner.contact_email).toBe("piotr.nowak@example.test");
        const rows = await members(partner.id);
        expect(rows.map((r) => [r.email, r.role])).toEqual([
          ["piotr.nowak@example.test", "owner"],
        ]);
        // Polish partner, no application: Polish (AC-9).
        expect(rows[0]?.locale_code).toBe("pl");
      });

      it("converting an application makes one owner in the application's language", async () => {
        const applicationId = await scratch.sql.begin((tx) =>
          make.application(tx, {
            countryId: plId,
            businessName: make.unique("Kwiaty Konwersja "),
            languageCode: "de",
            status: "contacted",
          }),
        );
        const [app] = await scratch.sql<{ version: string }[]>`
          SELECT to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS version
          FROM partner_application WHERE id = ${applicationId}`;
        const converted = await convertApplication(
          actor,
          { applicationId, updatedAt: app?.version ?? "" },
          run,
        );
        expect(converted).toMatchObject({ ok: true });
        const code = (converted as { partnerCode: string }).partnerCode;
        const partner = await partnerRow(code);
        const rows = await members(partner.id);
        expect(rows.map((r) => [r.email, r.role, r.locale_code])).toEqual([
          ["applicant@example.test", "owner", "de"],
        ]);
      });

      it("an unchanged email changes no membership and writes no membership audit row", async () => {
        const partner = await create("same@example.test");
        const before = await members(partner.id);
        const auditBefore = await memberAudit(partner.id);
        expect(
          await changeEmail(await codeOf(partner.id), " SAME@example.test"),
        ).toMatchObject({ ok: true });
        expect(await members(partner.id)).toEqual(before);
        expect(await memberAudit(partner.id)).toEqual(auditBefore);
      });

      it("a changed email moves access: the old user goes with its sessions, its next request has no context", async () => {
        // A demo partner, so the staging policy lets the member in before the change.
        const partnerId = await scratch.sql.begin((tx) =>
          make.partner(tx, plId, "demo"),
        );
        const code = await codeOf(partnerId);
        expect(await changeEmail(code, "old-owner@example.test")).toMatchObject(
          { ok: true },
        );
        const [old] = await members(partnerId);
        expect(old?.email).toBe("old-owner@example.test");
        const oldUser = old?.user_id ?? "";
        const token = await session(oldUser);
        const florist = createFloristAuth({
          run: systemRun,
          environment: "staging",
        });
        const contextOf = () =>
          resolveFloristContext(token, {
            auth: florist,
            run: systemRun,
            environment: "staging",
          });
        expect((await contextOf())?.userId).toBe(oldUser);

        expect(await changeEmail(code, "New-Owner@Example.test")).toMatchObject(
          { ok: true },
        );
        const after = await members(partnerId);
        expect(after.map((r) => [r.email, r.role])).toEqual([
          ["new-owner@example.test", "owner"],
        ]);
        expect(await userExists(oldUser)).toBe(false);
        const sessions =
          await scratch.sql`SELECT 1 FROM sessions WHERE user_id = ${oldUser}`;
        expect(sessions.length).toBe(0);
        expect(await contextOf()).toBeNull();
      });

      it.each([
        ["another membership", "membership"],
        ["an admin profile", "admin_profile"],
        ["a role", "user_role"],
        ["a customer row", "customer"],
      ] as const)(
        "keeps the old user when it has %s, and removes only this membership",
        async (_label, reason) => {
          const oldEmail = `${make.unique(`kept-${reason}-`)}@example.test`;
          const partner = await create(oldEmail);
          const [old] = await members(partner.id);
          const oldUser = old?.user_id ?? "";
          const token = await session(oldUser);
          await scratch.sql.begin(async (tx) => {
            if (reason === "membership") {
              const other = await make.partner(tx, plId, "onboarding");
              await tx`INSERT INTO partner_member (user_id, partner_id, role)
                       VALUES (${oldUser}, ${other}, 'owner')`;
            } else if (reason === "admin_profile") {
              await tx`INSERT INTO admin_profile (user_id, display_name)
                       VALUES (${oldUser}, 'Kept Person')`;
            } else if (reason === "user_role") {
              await tx`INSERT INTO user_role (user_id, role) VALUES (${oldUser}, 'ops')`;
            } else {
              await make.customer(tx, oldUser);
            }
          });
          expect(
            await changeEmail(
              await codeOf(partner.id),
              `${make.unique("moved-")}@example.test`,
            ),
          ).toMatchObject({ ok: true });
          expect(await userExists(oldUser)).toBe(true);
          const rows = await members(partner.id);
          expect(rows.map((r) => r.user_id)).not.toContain(oldUser);
          expect(rows).toHaveLength(1);
          // Kept, with its session: what ended is this partner's membership, not the person.
          const sessions =
            await scratch.sql`SELECT 1 FROM sessions WHERE session_token = ${token}`;
          expect(sessions.length).toBe(1);
        },
      );

      it("a failure inside the sync rolls the partner write back", async () => {
        const partner = await create("before-failure@example.test");
        const code = await codeOf(partner.id);
        const before = await partnerRow(code);
        const membersBefore = await members(partner.id);
        await scratch.sql.unsafe(`
          CREATE FUNCTION public.it_refuse_member() RETURNS trigger LANGUAGE plpgsql AS $fn$
          BEGIN RAISE EXCEPTION 'IT_FORCED_SYNC_FAILURE'; END; $fn$;
          CREATE TRIGGER it_refuse_member BEFORE INSERT ON public.partner_member
            FOR EACH ROW EXECUTE FUNCTION public.it_refuse_member();`);
        try {
          expect(
            causeOf(
              await changeEmail(code, "after-failure@example.test").catch(
                (error: unknown) => error,
              ),
            ),
          ).toMatch(/IT_FORCED_SYNC_FAILURE/u);
          const failedCode = make.unique("pl-access-fail-");
          expect(
            causeOf(
              await createPartner(
                actor,
                {
                  ...PROFILE,
                  contactEmail: "new-failure@example.test",
                  code: failedCode,
                },
                run,
              ).catch((error: unknown) => error),
            ),
          ).toMatch(/IT_FORCED_SYNC_FAILURE/u);
          const created =
            await scratch.sql`SELECT 1 FROM fulfillment_partner WHERE code = ${failedCode}`;
          expect(created.length).toBe(0);
          const users =
            await scratch.sql`SELECT 1 FROM users WHERE email IN ('after-failure@example.test', 'new-failure@example.test')`;
          expect(users.length).toBe(0);
        } finally {
          await scratch.sql.unsafe(`
            DROP TRIGGER it_refuse_member ON public.partner_member;
            DROP FUNCTION public.it_refuse_member();`);
        }
        expect(await partnerRow(code)).toEqual(before);
        expect(await members(partner.id)).toEqual(membersBefore);
      });
    });

    describe("T-08 · every grant and removal is audited (AC-8)", () => {
      it("one grant per insert and one revoke per delete, `{userId}:{partnerId}`; the partner keeps its action", async () => {
        const partner = await create("audit-one@example.test");
        const [first] = await members(partner.id);
        expect(await memberAudit(partner.id)).toEqual([
          {
            action: "partner.member.grant",
            entity_id: `${first?.user_id ?? ""}:${partner.id}`,
          },
        ]);
        expect(
          await changeEmail(await codeOf(partner.id), "audit-two@example.test"),
        ).toMatchObject({ ok: true });
        const [second] = await members(partner.id);
        expect(await memberAudit(partner.id)).toEqual([
          {
            action: "partner.member.grant",
            entity_id: `${first?.user_id ?? ""}:${partner.id}`,
          },
          {
            action: "partner.member.grant",
            entity_id: `${second?.user_id ?? ""}:${partner.id}`,
          },
          {
            action: "partner.member.revoke",
            entity_id: `${first?.user_id ?? ""}:${partner.id}`,
          },
        ]);
        const partnerActions = await scratch.sql<{ action: string }[]>`
          SELECT action FROM audit_log
          WHERE entity_table = 'fulfillment_partner' AND entity_id = ${partner.id}
          ORDER BY at, id`;
        expect(partnerActions.map((r) => r.action)).toEqual([
          "partner.create",
          "partner.update",
        ]);
      });

      it("the first-sign-in stamp and the language switch write no audit row", async () => {
        const partnerId = await scratch.sql.begin((tx) =>
          make.partner(tx, plId, "demo"),
        );
        expect(
          await changeEmail(await codeOf(partnerId), "quiet@example.test"),
        ).toMatchObject({ ok: true });
        const [member] = await members(partnerId);
        const before = await memberAudit(partnerId);
        await recordFirstFloristSignIn(member?.user_id ?? "", {
          run: systemRun,
          environment: "staging",
        });
        await systemRun((db) =>
          db.execute(
            sql`UPDATE partner_member SET locale_code = 'de' WHERE partner_id = ${partnerId}`,
          ),
        );
        const [after] = await members(partnerId);
        expect(after?.accepted_at).not.toBeNull();
        expect(after?.locale_code).toBe("de");
        expect(await memberAudit(partnerId)).toEqual(before);
      });
    });

    describe("T-09 · the starting language (AC-9)", () => {
      it.each([
        ["DE", "de"],
        ["AT", "de"],
        ["FR", "en"],
      ] as const)(
        "a partner in %s with no application starts in %s",
        async (iso2, expected) => {
          const partner = await create(
            `${make.unique(`lang-${iso2}-`)}@example.test`,
            iso2,
          );
          expect((await members(partner.id))[0]?.locale_code).toBe(expected);
        },
      );

      it("a re-sync after an address change keeps `de` for a Polish partner whose florist chose it", async () => {
        const partner = await create("chose-german@example.test");
        expect((await members(partner.id))[0]?.locale_code).toBe("pl");
        await scratch.sql`UPDATE partner_member SET locale_code = 'de' WHERE partner_id = ${partner.id}`;
        expect(
          await changeEmail(
            await codeOf(partner.id),
            "chose-german-new@example.test",
          ),
        ).toMatchObject({ ok: true });
        expect(
          (await members(partner.id)).map((r) => [r.email, r.locale_code]),
        ).toEqual([["chose-german-new@example.test", "de"]]);
      });
    });

    describe("T-10 · the first sign-in, stamped once (AC-10)", () => {
      it("sets accepted_at on the first sign-in and leaves it on the second; the admin read shows both states", async () => {
        const partnerId = await scratch.sql.begin((tx) =>
          make.partner(tx, plId, "demo"),
        );
        expect(
          await changeEmail(await codeOf(partnerId), "First.Time@example.test"),
        ).toMatchObject({ ok: true });
        const [member] = await members(partnerId);
        expect(await floristSignInStatus(actor, partnerId, run)).toEqual({
          email: "first.time@example.test",
          firstSignedInAt: null,
        });
        // Not in the policy's statuses here (production allows active and paused): no stamp.
        await recordFirstFloristSignIn(member?.user_id ?? "", {
          run: systemRun,
          environment: "production",
        });
        expect((await members(partnerId))[0]?.accepted_at).toBeNull();

        await recordFirstFloristSignIn(member?.user_id ?? "", {
          run: systemRun,
          environment: "staging",
        });
        const first = (await members(partnerId))[0]?.accepted_at;
        expect(first).toMatch(/^\d{4}-\d{2}-\d{2}T/u);
        await recordFirstFloristSignIn(member?.user_id ?? "", {
          run: systemRun,
          environment: "staging",
        });
        expect((await members(partnerId))[0]?.accepted_at).toEqual(first);
        expect(await floristSignInStatus(actor, partnerId, run)).toEqual({
          email: "first.time@example.test",
          firstSignedInAt: new Date(first ?? "").toISOString(),
        });
      });

      it("reads nothing for an unknown partner", async () => {
        expect(
          await floristSignInStatus(actor, randomUUID(), run),
        ).toBeUndefined();
      });
    });
  },
);
