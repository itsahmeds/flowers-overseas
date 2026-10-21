/**
 * T-28 (spec 012b §8, AC-28; migration `0019`'s `review_attestation` retention row; TASK-293): the
 * `retention.sweep` handler for the review ledger, on an injected clock.
 *
 * Three years (the policy's 1095 days) after an attester's `admin_profile.deactivated_at`, every
 * ledger row of theirs has `attester_name` replaced by "Reviewer {n}", n the same across their
 * rows, and no other column changes; an attester deactivated two years ago, an active one and an
 * imported row are untouched. A dry run writes nothing; a second sweep changes nothing.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  type RetentionSweepResult,
  runRetentionSweep,
} from "../../src/jobs/retention.ts";
import { runnerOf } from "./support/sql-runner.ts";
import {
  asApp,
  probeLocalServer,
  rolledBack,
  scratchDatabase,
  type ScratchDatabase,
  type Tx,
} from "./support/scratch-db.ts";

const server = await probeLocalServer();

const NOW = new Date("2030-06-01T03:00:00.000Z");
const DAY = 86_400_000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY);

async function sweep(tx: Tx, dryRun = false): Promise<RetentionSweepResult> {
  await asApp(tx, { role: "system" });
  const result = await runRetentionSweep(runnerOf(tx), { now: NOW, dryRun });
  await tx.unsafe("RESET ROLE");
  return result;
}

async function attester(
  tx: Tx,
  label: string,
  deactivated: Date | null,
): Promise<string> {
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO users (email) VALUES (${`${label}@example.test`}) RETURNING id`;
  const id = row?.id ?? "";
  await tx`INSERT INTO admin_profile (user_id, display_name, deactivated_at)
           VALUES (${id}, ${`${label} Person`}, ${deactivated})`;
  return id;
}

async function decision(
  tx: Tx,
  userId: string | null,
  name: string,
  ref: string,
): Promise<void> {
  await tx`INSERT INTO review_attestation (subject_kind, subject_ref, locale_code, value_hash,
             decision, note, attester_user_id, attester_name, channel)
           VALUES ('product_translation', ${ref}, 'en', ${"a".repeat(64)},
             ${userId === null ? "approved" : "changes_requested"},
             ${userId === null ? null : "a note"}, ${userId}, ${name},
             ${userId === null ? "import" : "admin"})`;
}

function withoutName(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => key !== "attester_name"),
  );
}

/** Every ledger row, keyed by id, as JSON. */
async function ledger(tx: Tx): Promise<Map<string, Record<string, unknown>>> {
  const rows = await tx<{ id: string; row: Record<string, unknown> }[]>`
    SELECT id, to_jsonb(a) AS row FROM review_attestation a`;
  return new Map(rows.map((r) => [r.id, r.row]));
}

describe.skipIf(server.url === undefined)(
  `T-28 — the ledger's attester names are pseudonymised (spec 012b AC-28)${server.url === undefined ? ` — skipped: ${server.reason}` : ""}`,
  () => {
    let scratch: ScratchDatabase;

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url ?? "", "reviewret");
      await scratch.sql`INSERT INTO locale (code, bcp47, name) VALUES ('en', 'en', 'English')`;
    }, 120_000);

    afterAll(async () => {
      await scratch.drop();
    });

    it("3 years and 1 day after deactivation: Reviewer n on every row, n stable, nothing else changed", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const old = await attester(tx, "old", daysAgo(1096));
        const older = await attester(tx, "older", daysAgo(2000));
        const recent = await attester(tx, "recent", daysAgo(730));
        const active = await attester(tx, "active", null);
        await decision(tx, old, "Old Person", "FO-BQ-001");
        await decision(tx, old, "Old Person", "FO-BQ-002");
        // `older` was swept before as Reviewer 4, and has one row the sweep has not reached.
        await decision(tx, older, "Reviewer 4", "FO-BQ-003");
        await decision(tx, older, "Older Person", "FO-BQ-004");
        await decision(tx, recent, "Recent Person", "FO-BQ-005");
        await decision(tx, active, "Active Person", "FO-BQ-006");
        await decision(tx, null, "founder", "FO-BQ-007");
        const before = await ledger(tx);

        const dry = await sweep(tx, true);
        expect(await ledger(tx)).toEqual(before);

        const real = await sweep(tx);
        const outcome = real.policies.find(
          (p) => p.key === "review_attestation",
        );
        expect(outcome).toEqual({
          key: "review_attestation",
          status: "applied",
          counts: { attesters: 2, review_attestation: 3 },
          skipped: {},
        });
        expect(
          dry.policies.find((p) => p.key === "review_attestation")?.counts,
        ).toEqual(outcome?.counts);

        const after = await ledger(tx);
        const names = new Map<string, string[]>();
        for (const [id, row] of after) {
          const was = before.get(id) ?? {};
          // No other column changes.
          expect(withoutName(row)).toEqual(withoutName(was));
          const user = String(row["attester_user_id"] ?? "import");
          names.set(user, [
            ...(names.get(user) ?? []),
            String(row["attester_name"]),
          ]);
        }
        expect(names.get(older)).toEqual(["Reviewer 4", "Reviewer 4"]);
        const oldNames = names.get(old) ?? [];
        expect(oldNames).toHaveLength(2);
        expect(new Set(oldNames)).toEqual(new Set(["Reviewer 5"]));
        expect(names.get(recent)).toEqual(["Recent Person"]);
        expect(names.get(active)).toEqual(["Active Person"]);
        expect(names.get("import")).toEqual(["founder"]);

        const again = await sweep(tx);
        expect(
          again.policies.find((p) => p.key === "review_attestation")?.counts,
        ).toEqual({ attesters: 0, review_attestation: 0 });
        expect(await ledger(tx)).toEqual(after);
      });
    });

    it("2 years after deactivation, nothing is touched", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const recent = await attester(tx, "two-years", daysAgo(731));
        await decision(tx, recent, "Two Years", "FO-BQ-008");
        const before = await ledger(tx);
        await sweep(tx);
        expect(await ledger(tx)).toEqual(before);
      });
    });
  },
);
