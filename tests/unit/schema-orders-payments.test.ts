/**
 * Migration `0007` read as text, against its Drizzle mirror and against spec 002 §14 A6 (AC-14,
 * T-14 unit half; AC-5, AC-7, AC-10; spec 010 §5.1 A; TASK-019).
 *
 * The connected half — the same seed read back out of a migrated database, and the constraints
 * refusing what they exist to refuse — is `tests/integration/schema-orders-payments.test.ts`.
 */
import { describe, expect, it } from "vitest";

import {
  assignmentResponses,
  buyerProjections,
  orderLineKinds,
  orderModes,
  reviewModerationStatuses,
  reviewSources,
  substitutionResolutions,
} from "../../db/schema/orders.ts";
import {
  paymentProviders,
  paymentStatuses,
  refundStatuses,
} from "../../db/schema/payments.ts";
import {
  STATES,
  STATUS_PRESERVING_EVENTS,
  TRANSITIONS,
  TRANSITION_EVENTS,
  derivedTerminal,
} from "../fixtures/order-machine.ts";
import {
  checkList,
  createdTables,
  droppedTables,
  mirrorShape,
  readMigration,
  sqlShape,
} from "./support/migration-sql.ts";

const up = readMigration("0007_orders_payments.sql");
const down = readMigration("0007_orders_payments.down.sql");
/**
 * `0013` (TASK-245) adds `"order".locale_code`, its key and `order_reference_idx`; `0017` (spec 002
 * §14 A7, TASK-254) the payment, refund and webhook-inbox columns, checks and index.
 */
const a7 = readMigration("0017_payments_a7.sql");
/** `0019` (spec 010 §14 A-founder-2026-10-22, TASK-347) adds `"order".purchase_id`, its key and index. */
const later = `${readMigration("0013_order_engine_columns.sql")}\n${a7}\n${readMigration("0019_purchase.sql")}`;

const TABLES = [
  "order_status",
  "order_transition",
  "order",
  "order_line",
  "order_event",
  "order_assignment",
  "substitution_note",
  "delivery_proof",
  "review",
  "payment",
  "refund",
  "webhook_inbox",
] as const;

/** The `INSERT … VALUES` rows of one table, as arrays of SQL literals. */
function seededRows(table: string): string[][] {
  const match = new RegExp(
    String.raw`INSERT INTO public\.${table} \([^)]*\) VALUES\s*([\s\S]*?);`,
  ).exec(up);
  if (match?.[1] === undefined) return [];
  return [...match[1].matchAll(/^\s*\((.*)\),?\s*$/gm)].map((m) =>
    [...(m[1] ?? "").matchAll(/ARRAY\[[^\]]*\]|'[^']*'|true|false/g)].map(
      (v) => v[0],
    ),
  );
}

const unquote = (value: string): string => value.replace(/^'|'$/g, "");

describe("migration 0007 — shape", () => {
  it("opens with the ownership preamble and closes with RESET ROLE", () => {
    expect(up.trimStart().startsWith("SET LOCAL ROLE app_owner;")).toBe(true);
    expect(up.trimEnd().endsWith("RESET ROLE;")).toBe(true);
    expect(down.trimStart().startsWith("SET LOCAL ROLE app_owner;")).toBe(true);
  });

  it("creates the twelve tables of §5.1 `orders` and `payments`, in dependency order", () => {
    expect(createdTables(up)).toEqual([...TABLES]);
  });

  it("its rollback drops each of them, leaf first, and the deferred key before them", () => {
    expect(droppedTables(down).sort()).toEqual([...TABLES].sort());
    expect(droppedTables(down)).toEqual([...TABLES].reverse());
    expect(down).toMatch(
      /^ALTER TABLE public\.payout_line DROP CONSTRAINT IF EXISTS payout_line_order_id_order_id_fk;/m,
    );
    expect(down).not.toMatch(/CASCADE/);
  });

  for (const table of TABLES) {
    it(`${table}: columns, nullability, checks, keys, foreign keys and indexes equal the mirror's`, () => {
      expect(mirrorShape(table)).toEqual(sqlShape(up, table, later));
    });
  }

  it("adds the deferred payout_line → order key, RESTRICT (TASK-018 carry-forward)", () => {
    expect(up).toMatch(
      /ALTER TABLE public\.payout_line\s+ADD CONSTRAINT payout_line_order_id_order_id_fk FOREIGN KEY \(order_id\)\s+REFERENCES public\."order" \(id\) ON DELETE RESTRICT;/,
    );
  });
});

describe("migration 0007 — the CHECK lists are the mirror's tuples (AC-7)", () => {
  const LISTS: readonly (readonly [string, readonly string[]])[] = [
    ["order_status_buyer_projection_check", buyerProjections],
    ["order_mode_check", orderModes],
    ["order_line_kind_check", orderLineKinds],
    ["order_assignment_response_check", assignmentResponses],
    ["substitution_note_resolution_check", substitutionResolutions],
    ["review_source_check", reviewSources],
    ["review_moderation_status_check", reviewModerationStatuses],
    ["payment_provider_check", paymentProviders],
    ["payment_status_check", paymentStatuses],
    ["refund_status_check", refundStatuses],
    ["webhook_inbox_provider_check", paymentProviders],
  ];
  for (const [constraint, values] of LISTS) {
    it(constraint, () => {
      // A7 (`0017`) drops and re-adds the two status lists; the latest definition is the one.
      expect(checkList(a7, constraint) ?? checkList(up, constraint)).toEqual([
        ...values,
      ]);
    });
  }

  it("spec 010 §5.1 A: mode has no default, and a live order needs its terms version", () => {
    expect(up).toMatch(/^\s+mode\s+text\s+NOT NULL,$/m);
    expect(up).toMatch(
      /CONSTRAINT order_terms_version_check CHECK \(mode <> 'live' OR terms_version IS NOT NULL\)/,
    );
    expect(up).toMatch(/^\s+buyer_snapshot\s+jsonb\s+NOT NULL,$/m);
  });

  it("every *_minor column is bigint (AC-5)", () => {
    for (const table of TABLES) {
      for (const column of sqlShape(up, table).columns) {
        if (column.name.endsWith("_minor")) {
          expect(column.type, `${table}.${column.name}`).toBe("bigint");
        }
      }
    }
  });

  it("every table that is updated has its updated_at trigger (AC-10)", () => {
    for (const table of TABLES) {
      const hasUpdatedAt = sqlShape(up, table).columns.some(
        (column) => column.name === "updated_at",
      );
      const trigger = new RegExp(
        `CREATE TRIGGER ${table}_set_updated_at BEFORE UPDATE ON public\\."?${table}"?`,
      );
      expect(trigger.test(up), table).toBe(hasUpdatedAt);
    }
  });
});

describe("AC-14 / T-14 (unit) — the seed is A6, both ways", () => {
  const statusRows = seededRows("order_status").map(([key, terminal, proj]) =>
    [unquote(key ?? ""), terminal === "true", unquote(proj ?? "")].join("|"),
  );
  const transitionRows = seededRows("order_transition").map(
    ([from, event, to, actors]) =>
      [
        unquote(from ?? ""),
        unquote(event ?? ""),
        unquote(to ?? ""),
        [...(actors ?? "").matchAll(/'([^']*)'/g)].map((m) => m[1]).join(","),
      ].join("|"),
  );

  it("order_status holds exactly A6.4's 26 rows", () => {
    expect(statusRows).toHaveLength(26);
    expect(new Set(statusRows)).toEqual(
      new Set(
        STATES.map((s) => [s.key, s.isTerminal, s.buyerProjection].join("|")),
      ),
    );
  });

  it("order_transition holds exactly A6.3's 73 rows (sets expanded)", () => {
    expect(transitionRows).toHaveLength(73);
    expect(new Set(transitionRows)).toEqual(
      new Set(
        TRANSITIONS.map((t) =>
          [t.from, t.event, t.to, t.allowedActors.join(",")].join("|"),
        ),
      ),
    );
  });

  it("is_terminal is true exactly for the states with no row to a different state (A6.1)", () => {
    const derived = derivedTerminal(STATES, TRANSITIONS);
    for (const state of STATES) {
      expect(state.isTerminal, state.key).toBe(derived.get(state.key));
    }
  });

  it("the distinct events are A6.6's 28 transition events, and no status-preserving event has a row", () => {
    const events = new Set(transitionRows.map((row) => row.split("|")[1]));
    expect(events).toEqual(new Set(TRANSITION_EVENTS));
    for (const event of STATUS_PRESERVING_EVENTS) {
      expect(events.has(event), event).toBe(false);
    }
  });

  it("no event is an arrow label of the diagram (ruling R8)", () => {
    for (const row of transitionRows) {
      expect(row.split("|")[1]).toMatch(/^(order|assignment)\./);
    }
  });
});
