/**
 * Spec 034's data layer against a migrated PG16 (T-08, T-09, T-26, T-27; AC-8, AC-9, AC-26, AC-27;
 * TASK-449): migration `0040_basket_reminder` down and up with its guard, every check of §5.1, the
 * row-level security per role, `recordBasketReminderConsent`'s rows, the 24-hour personal sweep
 * clearing the consent, and the three retention handlers with their boundaries and dry run.
 *
 * Its own scratch database, because it rolls the migration back. The env is the test default, so
 * `contactHmac` runs under the fixed test secret.
 */
import { createHmac, randomBytes } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { TEST_CONTACT_HMAC_SECRET } from "@/lib/env.basket-reminders";
import { recordBasketReminderConsent } from "@/modules/customers";

import { runRetentionSweep } from "../../src/jobs/retention.ts";
import { base } from "./support/rows.ts";
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
import { runnerOf } from "./support/sql-runner.ts";

const server = await probeLocalServer();
const MIGRATION_MS = 180_000;

const T0 = new Date("2026-11-18T12:00:00.000Z");
const DAY = 86_400_000;
const at = (ms: number): Date => new Date(T0.getTime() + ms);
const hmac = (email: string): string =>
  createHmac("sha256", Buffer.from(TEST_CONTACT_HMAC_SECRET, "base64"))
    .update(email.trim().toLowerCase())
    .digest("hex");
const hex64 = (): string => randomBytes(32).toString("hex");

let db: ScratchDatabase | undefined;

beforeAll(async () => {
  if (server.url !== undefined) {
    db = await scratchDatabase(server.url, "basket_reminder_data");
  }
}, MIGRATION_MS);

afterAll(async () => {
  await db?.drop();
});

/** A live draft with a saved buyer, last active at `lastActivity`. */
async function draft(
  tx: Tx,
  options: {
    email?: string;
    lastActivity?: Date;
    consentAt?: Date | null;
  } = {},
): Promise<string> {
  await base(tx);
  const last = options.lastActivity ?? T0;
  const buyer = {
    email: options.email ?? "buyer@example.test",
    buyerName: "Ann Buyer",
    buyerPhone: null,
    residenceCountry: "GB",
  };
  const consent = options.consentAt ?? null;
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO checkout_draft (token_sha256, locale_code, mode, buyer, buyer_saved,
                                last_activity_at, expires_at, reminder_consent_at,
                                reminder_consent_version)
    VALUES (${hex64()}, 'en', 'live', ${tx.json(buyer)}, true, ${last},
            ${new Date(last.getTime() + 30 * DAY)}, ${consent}, ${consent === null ? null : 1})
    RETURNING id`;
  return row?.id ?? "";
}

async function consentRows(tx: Tx) {
  return tx<
    {
      subject_kind: string;
      subject_hmac: string | null;
      subject_ref: string | null;
      anonymous_id: string | null;
      source_ip_truncated: string | null;
      choices: Record<string, unknown>;
      row: string;
    }[]
  >`SELECT subject_kind, subject_hmac, subject_ref, anonymous_id,
           source_ip_truncated::text, choices, to_jsonb(c)::text AS row
      FROM consent_log c WHERE subject_kind = 'contact' ORDER BY created_at, id`;
}

describe.skipIf(server.url === undefined)("spec 034 data layer (PG16)", () => {
  it("T-08 (AC-8): tick, re-save, untick and an email change write exactly their contact rows", async () => {
    await rolledBack(db!.sql, async (tx) => {
      const id = await draft(tx);
      await asApp(tx, { role: "system" });
      const executor = runnerOf(tx);
      const input = {
        draftId: id,
        email: "buyer@example.test",
        locale: "en",
        wordingVersion: 1,
        now: T0,
      };

      expect(
        await recordBasketReminderConsent(executor, { ...input, given: true }),
      ).toEqual({ granted: 1, withdrawn: 0 });
      const [afterGrant] = await tx<
        { at: Date | null; version: number | null }[]
      >`SELECT reminder_consent_at AS at, reminder_consent_version AS version
          FROM checkout_draft WHERE id = ${id}`;
      expect(afterGrant?.at?.toISOString()).toBe(T0.toISOString());
      expect(afterGrant?.version).toBe(1);
      let rows = await consentRows(tx);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        subject_kind: "contact",
        subject_hmac: hmac("buyer@example.test"),
        subject_ref: null,
        anonymous_id: null,
        source_ip_truncated: null,
      });
      expect(rows[0]?.choices).toEqual({
        basket_reminder: true,
        locale: "en",
        wording_key: "checkout.basketReminder.label",
        wording_hash: expect.stringMatching(/^[0-9a-f]{64}$/u) as unknown,
      });
      // No column of any contact row holds the address.
      for (const row of rows) expect(row.row).not.toContain("buyer@example");

      // Same state again: nothing.
      expect(
        await recordBasketReminderConsent(executor, { ...input, given: true }),
      ).toEqual({ granted: 0, withdrawn: 0 });
      expect(await consentRows(tx)).toHaveLength(1);

      // An email change with the box still ticked: a withdrawal for the old hash, a grant for the new.
      await tx`UPDATE checkout_draft SET buyer = jsonb_set(buyer, '{email}', '"buyer@example.test"') WHERE id = ${id}`;
      expect(
        await recordBasketReminderConsent(executor, {
          ...input,
          email: "New@Example.test",
          given: true,
        }),
      ).toEqual({ granted: 1, withdrawn: 1 });
      rows = await consentRows(tx);
      // One transaction: every row shares a timestamp, so they are compared as a sorted set.
      const pairs = (list: typeof rows) =>
        list
          .map(
            (row) =>
              `${row.subject_hmac ?? ""}:${String(row.choices["basket_reminder"])}`,
          )
          .sort();
      expect(pairs(rows)).toEqual(
        [
          `${hmac("buyer@example.test")}:true`,
          `${hmac("buyer@example.test")}:false`,
          `${hmac("new@example.test")}:true`,
        ].sort(),
      );

      // Unticked: both columns cleared, one withdrawal.
      await tx`UPDATE checkout_draft SET buyer = jsonb_set(buyer, '{email}', '"new@example.test"') WHERE id = ${id}`;
      expect(
        await recordBasketReminderConsent(executor, {
          ...input,
          email: "new@example.test",
          given: false,
        }),
      ).toEqual({ granted: 0, withdrawn: 1 });
      const [cleared] = await tx<{ at: Date | null; version: number | null }[]>`
        SELECT reminder_consent_at AS at, reminder_consent_version AS version
          FROM checkout_draft WHERE id = ${id}`;
      expect(cleared).toEqual({ at: null, version: null });
      rows = await consentRows(tx);
      expect(rows).toHaveLength(4);
      expect(
        rows.filter(
          (row) =>
            row.subject_hmac === hmac("new@example.test") &&
            row.choices["basket_reminder"] === false,
        ),
      ).toHaveLength(1);
    });
  });

  it("T-08 (AC-8): a contact row with a null or malformed hash, or with subject_ref, is refused", async () => {
    for (const values of [
      { hmac: null, ref: null },
      { hmac: "ABC", ref: null },
      { hmac: hex64(), ref: "7c9e6679-7425-40de-944b-e07fc1f90ae7" },
    ]) {
      await rolledBack(db!.sql, async (tx) => {
        const failure = await pgFailure(
          tx,
          (
            sp,
          ) => sp`INSERT INTO consent_log (subject_kind, subject_hmac, subject_ref, choices, policy_version, occurred_at)
             VALUES ('contact', ${values.hmac}, ${values.ref}, '{}'::jsonb, 1, now())`,
        );
        expect(failure.constraint).toBe("consent_log_subject_check");
      });
    }
    // A customer row may not carry a hash either.
    await rolledBack(db!.sql, async (tx) => {
      const failure = await pgFailure(
        tx,
        (
          sp,
        ) => sp`INSERT INTO consent_log (subject_kind, subject_hmac, subject_ref, choices, policy_version, occurred_at)
           VALUES ('customer', ${hex64()}, '7c9e6679-7425-40de-944b-e07fc1f90ae7', '{}'::jsonb, 1, now())`,
      );
      expect(failure.constraint).toBe("consent_log_subject_check");
    });
  });

  it("T-26 (AC-26): every check of §5.1 rejects its violating row", async () => {
    const cases: [string, string][] = [
      ["status = 'sent'", "basket_reminder_sent_check"],
      ["status = 'skipped'", "basket_reminder_skipped_check"],
      ["skip_reason = 'flag_off'", "basket_reminder_skipped_check"],
      ["status = 'nope'", "basket_reminder_status_check"],
      [
        "skip_reason = 'bored', status = 'skipped'",
        "basket_reminder_skip_reason_check",
      ],
      ["sequence = 3", "basket_reminder_sequence_check"],
      ["line_count = 6", "basket_reminder_line_count_check"],
      ["email_hmac = 'x'", "basket_reminder_email_hmac_check"],
      [
        `restore_token_sha256 = '${hex64()}'`,
        "basket_reminder_restore_pair_check",
      ],
      [
        "restore_token_sha256 = 'x', restore_expires_at = now()",
        "basket_reminder_restore_token_sha256_check",
      ],
      [
        "unsubscribe_token_sha256 = 'x'",
        "basket_reminder_unsubscribe_token_sha256_check",
      ],
      ["delivery_status = 'opened'", "basket_reminder_delivery_status_check"],
      ["recovered_at = now()", "basket_reminder_recovered_pair_check"],
      ["restore_count = -1", "basket_reminder_restore_count_check"],
    ];
    for (const [set, constraint] of cases) {
      await rolledBack(db!.sql, async (tx) => {
        const id = await draft(tx);
        const [row] = await tx<{ id: string }[]>`
          INSERT INTO basket_reminder (draft_id, locale_code, status, scheduled_for)
          VALUES (${id}, 'en', 'scheduled', now()) RETURNING id`;
        const failure = await pgFailure(tx, (sp) =>
          sp.unsafe(
            `UPDATE basket_reminder SET ${set} WHERE id = '${row?.id ?? ""}'`,
          ),
        );
        expect(failure.constraint, set).toBe(constraint);
      });
    }
    await rolledBack(db!.sql, async (tx) => {
      await base(tx);
      for (const [values, constraint] of [
        [
          `'x', 'basket_reminder', 'unsubscribed'`,
          "email_suppression_email_hmac_check",
        ],
        [
          `'${hex64()}', 'newsletter', 'unsubscribed'`,
          "email_suppression_scope_check",
        ],
        [
          `'${hex64()}', 'basket_reminder', 'bored'`,
          "email_suppression_reason_check",
        ],
      ] as const) {
        const failure = await pgFailure(tx, (sp) =>
          sp.unsafe(
            `INSERT INTO email_suppression (email_hmac, scope, reason) VALUES (${values})`,
          ),
        );
        expect(failure.constraint).toBe(constraint);
      }
    });
    await rolledBack(db!.sql, async (tx) => {
      const id = await draft(tx);
      const failure = await pgFailure(
        tx,
        (sp) =>
          sp`UPDATE checkout_draft SET reminder_consent_at = now() WHERE id = ${id}`,
      );
      expect(failure.constraint).toBe(
        "checkout_draft_reminder_consent_pair_check",
      );
    });
    await rolledBack(db!.sql, async (tx) => {
      const id = await draft(tx);
      await tx`UPDATE checkout_draft SET pending_notice = 'restored_details' WHERE id = ${id}`;
      const failure = await pgFailure(
        tx,
        (sp) =>
          sp`UPDATE checkout_draft SET pending_notice = 'bogus' WHERE id = ${id}`,
      );
      expect(failure.constraint).toBe("checkout_draft_pending_notice_check");
    });
  });

  it("T-26 (AC-26): public, customer and partner read nothing; admin reads reminders, not suppression", async () => {
    await rolledBack(db!.sql, async (tx) => {
      const id = await draft(tx);
      await tx`INSERT INTO basket_reminder (draft_id, locale_code, status, scheduled_for)
               VALUES (${id}, 'en', 'scheduled', now())`;
      await tx`INSERT INTO email_suppression (email_hmac, scope, reason)
               VALUES (${hex64()}, 'basket_reminder', 'unsubscribed')`;
      const count = async (role: string) => {
        await asApp(tx, {
          role,
          userId: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
          partnerIds: ["7c9e6679-7425-40de-944b-e07fc1f90ae8"],
        });
        const [row] = await tx<{ reminders: number; suppressions: number }[]>`
          SELECT (SELECT count(*)::int FROM basket_reminder) AS reminders,
                 (SELECT count(*)::int FROM email_suppression) AS suppressions`;
        await tx.unsafe("RESET ROLE");
        return row;
      };
      for (const role of ["public", "customer", "partner"]) {
        expect(await count(role), role).toEqual({
          reminders: 0,
          suppressions: 0,
        });
      }
      expect(await count("admin")).toEqual({ reminders: 1, suppressions: 0 });
      expect(await count("system")).toEqual({ reminders: 1, suppressions: 1 });
    });
  });

  it("T-09 (AC-9): the personal sweep clears the consent with the buyer at 24 h, not at 23 h 59 min, and keeps the proof", async () => {
    await rolledBack(db!.sql, async (tx) => {
      const id = await draft(tx, { consentAt: T0 });
      await tx`INSERT INTO consent_log (subject_kind, subject_hmac, choices, policy_version, occurred_at)
               VALUES ('contact', ${hmac("buyer@example.test")}, '{"basket_reminder": true}'::jsonb, 1, ${T0})`;
      const state = () => tx<
        { buyer: unknown; at: Date | null; version: number | null }[]
      >`
        SELECT buyer, reminder_consent_at AS at, reminder_consent_version AS version
          FROM checkout_draft WHERE id = ${id}`;
      await asApp(tx, { role: "system" });
      await runRetentionSweep(runnerOf(tx), {
        now: at(DAY - 60_000),
        dryRun: false,
      });
      await tx.unsafe("RESET ROLE");
      const [early] = await state();
      expect(early?.at?.toISOString()).toBe(T0.toISOString());
      expect(early?.buyer).not.toBeNull();

      await asApp(tx, { role: "system" });
      await runRetentionSweep(runnerOf(tx), { now: at(DAY), dryRun: false });
      await tx.unsafe("RESET ROLE");
      expect((await state())[0]).toEqual({
        buyer: null,
        at: null,
        version: null,
      });
      const [proof] = await tx<{ count: number }[]>`
        SELECT count(*)::int AS count FROM consent_log WHERE subject_kind = 'contact'`;
      expect(proof?.count).toBe(1);
      const [policy] = await tx<{ days: number; table: string }[]>`
        SELECT retention_days AS days, entity_table AS table FROM retention_policy WHERE key = 'consent_records'`;
      expect(policy).toEqual({ days: 1825, table: "consent_log" });
    });
  });

  it("T-27 (AC-27): tokens cleared at 60 days, rows deleted at 395 days, suppression at 5 years; dry run writes nothing", async () => {
    await rolledBack(db!.sql, async (tx) => {
      const id = await draft(tx);
      const [sent] = await tx<{ id: string }[]>`
        INSERT INTO basket_reminder (draft_id, locale_code, status, scheduled_for, sent_at, line_count,
                                     email_hmac, restore_token_sha256, restore_expires_at,
                                     unsubscribe_token_sha256, created_at)
        VALUES (${id}, 'en', 'sent', ${T0}, ${T0}, 1, ${hex64()}, ${hex64()}, ${at(7 * DAY)},
                ${hex64()}, ${T0}) RETURNING id`;
      const [never] = await tx<{ id: string }[]>`
        INSERT INTO basket_reminder (draft_id, sequence, locale_code, status, skip_reason, scheduled_for,
                                     email_hmac, created_at)
        VALUES (${id}, 2, 'en', 'skipped', 'suppressed', ${T0}, ${hex64()}, ${T0}) RETURNING id`;
      await tx`INSERT INTO email_suppression (email_hmac, scope, reason, created_at, updated_at)
               VALUES (${hex64()}, 'basket_reminder', 'complained', ${T0}, ${T0})`;
      const tokens = () => tx<{ id: string; cleared: boolean }[]>`
        SELECT id, (restore_token_sha256 IS NULL AND unsubscribe_token_sha256 IS NULL
                    AND restore_expires_at IS NULL AND email_hmac IS NULL) AS cleared
          FROM basket_reminder ORDER BY sequence`;
      const sweep = async (now: Date, dryRun = false) => {
        await asApp(tx, { role: "system" });
        const result = await runRetentionSweep(runnerOf(tx), { now, dryRun });
        await tx.unsafe("RESET ROLE");
        return result;
      };

      await sweep(at(60 * DAY - 3_600_000));
      expect((await tokens()).map((row) => row.cleared)).toEqual([
        false,
        false,
      ]);

      const dry = await sweep(at(60 * DAY), true);
      expect(
        dry.policies.find((p) => p.key === "basket_reminder_tokens")?.counts,
      ).toEqual({
        basket_reminder: 2,
      });
      expect((await tokens()).map((row) => row.cleared)).toEqual([
        false,
        false,
      ]);
      const applied = await sweep(at(60 * DAY));
      expect(
        applied.policies.find((p) => p.key === "basket_reminder_tokens")
          ?.counts,
      ).toEqual({
        basket_reminder: 2,
      });
      expect(await tokens()).toEqual([
        { id: sent?.id, cleared: true },
        { id: never?.id, cleared: true },
      ]);

      await sweep(at(394 * DAY));
      expect(await tokens()).toHaveLength(2);
      await sweep(at(395 * DAY));
      expect(await tokens()).toHaveLength(0);

      const suppressions = async () =>
        (
          await tx<
            { count: number }[]
          >`SELECT count(*)::int AS count FROM email_suppression`
        )[0]?.count;
      await sweep(at(1824 * DAY));
      expect(await suppressions()).toBe(1);
      await sweep(at(1825 * DAY));
      expect(await suppressions()).toBe(0);
    });
  });

  it(
    "T-26 (AC-26): down refuses with BASKET_REMINDER_CONSENT_ROWS_EXIST while a contact row exists; without one it runs down and up",
    async () => {
      const sql = db!.sql;
      await sql`INSERT INTO consent_log (subject_kind, subject_hmac, choices, policy_version, occurred_at)
                VALUES ('contact', ${hex64()}, '{}'::jsonb, 1, now())`;
      await expect(runner(db!.url, ["--down", "--to", "0039"])).rejects.toThrow(
        /BASKET_REMINDER_CONSENT_ROWS_EXIST/u,
      );
      const [still] = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM pg_class WHERE relname IN ('basket_reminder', 'email_suppression')`;
      expect(still?.count).toBe(2);

      await sql`DELETE FROM consent_log WHERE subject_kind = 'contact'`;
      await runner(db!.url, ["--down", "--to", "0039"]);
      const [gone] = await sql<
        { tables: number; columns: number; flag: number; policies: number }[]
      >`
        SELECT (SELECT count(*)::int FROM pg_class WHERE relname IN ('basket_reminder', 'email_suppression')) AS tables,
               (SELECT count(*)::int FROM information_schema.columns
                 WHERE (table_name = 'checkout_draft' AND column_name IN ('reminder_consent_at', 'reminder_consent_version', 'restored_from_reminder_id'))
                    OR (table_name = 'consent_log' AND column_name = 'subject_hmac')) AS columns,
               (SELECT count(*)::int FROM feature_flag WHERE key = 'marketing.basket_reminder') AS flag,
               (SELECT count(*)::int FROM retention_policy
                 WHERE key IN ('basket_reminder_tokens', 'basket_reminder', 'email_suppression')) AS policies`;
      expect(gone).toEqual({ tables: 0, columns: 0, flag: 0, policies: 0 });

      await runner(db!.url);
      const [back] = await sql<{ tables: number; flag: boolean }[]>`
        SELECT (SELECT count(*)::int FROM pg_class WHERE relname IN ('basket_reminder', 'email_suppression')) AS tables,
               (SELECT enabled_default FROM feature_flag WHERE key = 'marketing.basket_reminder') AS flag`;
      expect(back).toEqual({ tables: 2, flag: false });
    },
    MIGRATION_MS,
  );
});
