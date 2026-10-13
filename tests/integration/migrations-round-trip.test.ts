/**
 * T-01 and T-02 — the full round trip on an empty Postgres 16 (spec 002 AC-4; TASK-022).
 *
 * `pnpm db:migrate` against an empty database creates every table of §5.1 (the Drizzle mirror's
 * set, which `db:check` holds equal to the migrations), every trigger function and both roles;
 * `pnpm db:rollback --to 0000` returns it to zero — no table, type, function, trigger, role or
 * schema of ours left, only the runner's own `schema_migrations` — and the pair runs twice more.
 * Both directions go through the real runner (`scripts/db-migrate.ts`).
 *
 * Roles are cluster-wide, so this suite takes the roles lock exclusively: it runs when no other
 * scratch database owns objects through `app_owner` (`support/scratch-db.ts`). Local disposable
 * server only — CI's service container, or a throwaway Postgres 16.
 */
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CUSTOMER_VIEWS, PARTNER_VIEWS } from "../../db/rls.ts";
import * as schema from "../../db/schema/index.ts";
import {
  probeLocalServer,
  runner,
  scratchDatabase,
  type ScratchDatabase,
} from "./support/scratch-db.ts";

const server = await probeLocalServer();

const MIRROR_TABLES = Object.values(schema)
  .filter(
    (value) =>
      value !== null &&
      typeof value === "object" &&
      Symbol.for("drizzle:IsDrizzleTable") in value,
  )
  .map((table) => getTableConfig(table as PgTable).name)
  .sort();

/** The column-limited read paths of `0011` (`db/rls.ts`). */
const VIEWS = [...Object.keys(PARTNER_VIEWS), ...Object.keys(CUSTOMER_VIEWS)];

/** Functions the migrations create (trigger functions and `set_updated_at`). */
const FUNCTIONS = [
  "app_current_partner_ids",
  "app_current_role",
  "app_current_user_id",
  "app_customer_owns",
  "app_customer_owns_order",
  "app_customer_owns_payment",
  "app_customer_owns_recipient",
  "app_is_customer_user",
  "app_is_partner_of",
  "app_is_self",
  "app_is_staff",
  "app_partner_owns_payout",
  "app_partner_sees_order",
  "audit_log_append_only",
  "customer_self_update_guard",
  "delivery_proof_asset_check",
  "fulfillment_partner_coverage_country_guard",
  "media_asset_delivery_proof_guard",
  "media_asset_partner_application_guard",
  "order_assignment_mode_check",
  "order_event_append_only",
  "order_insert_guard",
  "order_mode_immutable",
  "order_status_guard",
  "partner_application_media_check",
  "partner_coverage_country_check",
  "payout_currency_check",
  "set_updated_at",
];

interface Census {
  tables: string[];
  functions: string[];
  triggers: number;
  types: string[];
  roles: string[];
  schemas: string[];
}

describe.skipIf(server.url === undefined)(
  `T-01 / T-02 — migrate, roll back to 0000, twice${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "roundtrip", {
        migrate: false,
        rolesLock: "exclusive",
      });
    }, 600_000);
    afterAll(async () => {
      await scratch.drop();
    });

    async function census(): Promise<Census> {
      const sql = scratch.sql;
      const tables = await sql<{ name: string }[]>`
        SELECT relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm') ORDER BY 1`;
      const functions = await sql<{ name: string }[]>`
        SELECT proname AS name FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' ORDER BY 1`;
      const [triggers] = await sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM pg_trigger WHERE NOT tgisinternal`;
      const types = await sql<{ name: string }[]>`
        SELECT t.typname AS name FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public' ORDER BY 1`;
      const roles = await sql<{ name: string }[]>`
        SELECT rolname AS name FROM pg_roles WHERE rolname IN ('app_owner', 'app_web') ORDER BY 1`;
      const schemas = await sql<{ name: string }[]>`
        SELECT nspname AS name FROM pg_namespace
        WHERE nspname NOT LIKE 'pg\\_%' AND nspname NOT IN ('information_schema', 'public')
        ORDER BY 1`;
      return {
        tables: tables.map((r) => r.name),
        functions: functions.map((r) => r.name),
        triggers: triggers?.n ?? -1,
        types: types.map((r) => r.name),
        roles: roles.map((r) => r.name),
        schemas: schemas.map((r) => r.name),
      };
    }

    const EMPTY: Census = {
      tables: ["schema_migrations"],
      functions: [],
      triggers: 0,
      types: ["_schema_migrations", "schema_migrations"],
      roles: [],
      schemas: [],
    };

    it("AC-4: migrate creates every table of §5.1, the functions and both roles; rollback to 0000 leaves nothing; three times", async () => {
      const rounds: { up: Census; down: Census }[] = [];
      for (let round = 0; round < 3; round += 1) {
        await runner(scratch.url);
        const up = await census();
        await runner(scratch.url, ["--down", "--to", "0000"]);
        const down = await census();
        rounds.push({ up, down });
      }
      for (const { up, down } of rounds) {
        expect(up.tables).toEqual(
          [...MIRROR_TABLES, ...VIEWS, "schema_migrations"].sort(),
        );
        expect(up.functions).toEqual(FUNCTIONS);
        expect(up.roles).toEqual(["app_owner", "app_web"]);
        expect(up.triggers).toBeGreaterThan(0);
        expect(down).toEqual(EMPTY);
      }
      // And forward once more: the pair is re-runnable from a rolled-back database.
      await runner(scratch.url);
      expect((await census()).tables).toHaveLength(
        MIRROR_TABLES.length + VIEWS.length + 1,
      );
    }, 600_000);
  },
);
