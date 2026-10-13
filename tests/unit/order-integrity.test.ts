/**
 * Migration `0008` read as text, the two scans of spec 002 §14 A6.8, and the fixture walk's path
 * finder (AC-12, AC-13, AC-19, AC-35, AC-36; T-36 and T-37 unit halves; spec 010 §5.1 A;
 * TASK-020).
 *
 * The connected half — Postgres refusing each write — is
 * `tests/integration/order-integrity.test.ts`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import {
  INITIAL_STATUS,
  STATES,
  TRANSITIONS,
} from "../fixtures/order-machine.ts";
import { shortestPath } from "../fixtures/order-state.ts";
import { readMigration } from "./support/migration-sql.ts";

const up = readMigration("0008_order_integrity.sql");
const down = readMigration("0008_order_integrity.down.sql");

/** `[trigger, timing and events, table, function]` — what `0008` must create, and nothing else. */
const TRIGGERS: readonly (readonly [string, string, string, string])[] = [
  [
    "order_event_append_only",
    "BEFORE UPDATE OR DELETE",
    "order_event",
    "order_event_append_only",
  ],
  [
    "order_event_append_only_statement",
    "BEFORE TRUNCATE",
    "order_event",
    "order_event_append_only",
  ],
  [
    "order_status_guard",
    "BEFORE UPDATE OF status",
    '"order"',
    "order_status_guard",
  ],
  ["order_insert_guard", "BEFORE INSERT", '"order"', "order_insert_guard"],
  [
    "order_mode_immutable",
    "BEFORE UPDATE OF mode",
    '"order"',
    "order_mode_immutable",
  ],
  [
    "order_assignment_mode_check",
    "BEFORE INSERT OR UPDATE OF order_id, partner_id",
    "order_assignment",
    "order_assignment_mode_check",
  ],
  [
    "delivery_proof_asset_check",
    "BEFORE INSERT OR UPDATE OF media_asset_id",
    "delivery_proof",
    "delivery_proof_asset_check",
  ],
  [
    "media_asset_delivery_proof_guard",
    "BEFORE UPDATE OF kind, visibility, exif_stripped",
    "media_asset",
    "media_asset_delivery_proof_guard",
  ],
];

const FUNCTIONS = [...new Set(TRIGGERS.map(([, , , fn]) => fn))];

function body(fn: string): string {
  const start = up.indexOf(`CREATE FUNCTION public.${fn}()`);
  expect(start, fn).toBeGreaterThanOrEqual(0);
  return up.slice(start, up.indexOf("$fn$;", start));
}

const escape = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

describe("migration 0008 — shape", () => {
  it("opens with the ownership preamble and closes with RESET ROLE", () => {
    expect(up.trimStart().startsWith("SET LOCAL ROLE app_owner;")).toBe(true);
    expect(up.trimEnd().endsWith("RESET ROLE;")).toBe(true);
    expect(down.trimStart().startsWith("SET LOCAL ROLE app_owner;")).toBe(true);
  });

  it("creates exactly the pinned triggers, each on its table and events", () => {
    const created = [...up.matchAll(/CREATE TRIGGER (\w+)/g)].map((m) => m[1]);
    expect(created).toEqual(TRIGGERS.map(([name]) => name));
    for (const [name, when, table, fn] of TRIGGERS) {
      expect(up, name).toMatch(
        new RegExp(
          `CREATE TRIGGER ${name}\\s+${escape(when)} ON public\\.${escape(table)}\\s+FOR EACH (ROW|STATEMENT) EXECUTE FUNCTION public\\.${fn}\\(\\);`,
        ),
      );
    }
  });

  it("its rollback drops every trigger and every function, and nothing else", () => {
    for (const [name, , table] of TRIGGERS) {
      expect(down).toMatch(
        new RegExp(
          `^DROP TRIGGER IF EXISTS ${name} ON public\\.${escape(table)};$`,
          "m",
        ),
      );
    }
    for (const fn of FUNCTIONS) {
      expect(down).toMatch(
        new RegExp(`^DROP FUNCTION IF EXISTS public\\.${fn}\\(\\);$`, "m"),
      );
    }
    expect(down).not.toMatch(/DROP TABLE|CASCADE/);
  });

  it("each function that reads another table is SECURITY DEFINER with a pinned search_path", () => {
    for (const fn of [
      "order_status_guard",
      "order_assignment_mode_check",
      "delivery_proof_asset_check",
      "media_asset_delivery_proof_guard",
    ]) {
      expect(body(fn), fn).toMatch(
        /SECURITY DEFINER\s+SET search_path = pg_catalog, public/,
      );
    }
  });
});

describe("migration 0008 — what each guard reads (AC-12, AC-13, AC-19, AC-35)", () => {
  it("the status guard reads the switch and the event transaction-locally, checks the triple, and resets both", () => {
    const guard = body("order_status_guard");
    expect(guard).toContain(
      "coalesce(current_setting('app.allow_status_write', true), '') <> 'on'",
    );
    expect(guard).toContain(
      "coalesce(current_setting('app.transition_event', true), '')",
    );
    expect(guard).toMatch(
      /t\.from_status = OLD\.status AND t\.event = event_name AND t\.to_status = NEW\.status/,
    );
    expect(guard).toMatch(/event_name = '' OR NOT EXISTS/);
    expect(guard).toContain(
      "PERFORM set_config('app.allow_status_write', '', true);",
    );
    expect(guard).toContain(
      "PERFORM set_config('app.transition_event', '', true);",
    );
    expect(guard).toContain("ORDER_STATUS_DIRECT_WRITE");
    expect(guard).toContain("ORDER_TRANSITION_ILLEGAL");
  });

  it("the append-only guard names the table it protects", () => {
    expect(body("order_event_append_only")).toMatch(
      /ORDER_EVENT_APPEND_ONLY: order_event is append-only/,
    );
  });

  it("the delivery photo must be a private, EXIF-stripped delivery_proof asset", () => {
    expect(body("delivery_proof_asset_check")).toMatch(
      /NOT \(kind = 'delivery_proof' AND visibility = 'private' AND exif_stripped\)\s+FOR SHARE;/,
    );
  });

  it("spec 010 §5.1 A: live → active, every other mode → demo", () => {
    expect(body("order_assignment_mode_check")).toMatch(
      /\(order_mode = 'live' AND partner_status <> 'active'\)\s+OR \(order_mode <> 'live' AND partner_status <> 'demo'\)/,
    );
    expect(body("order_insert_guard")).toMatch(
      /NEW\.status IS DISTINCT FROM 'placed'/,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* The two scans of A6.8                                                      */
/* -------------------------------------------------------------------------- */

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...filesUnder(path));
    else if (/\.(ts|tsx|sql|mjs|js)$/.test(name)) out.push(path);
  }
  return out;
}

/** Each hit as `file:line`. A line that only asserts on a rollback's text (`/^DROP …/`) is exempt. */
function hits(roots: readonly string[], pattern: RegExp): string[] {
  const found: string[] = [];
  for (const root of roots) {
    for (const file of filesUnder(join(process.cwd(), root))) {
      readFileSync(file, "utf8")
        .split(/\r?\n/)
        .forEach((line, index) => {
          if (pattern.test(line)) {
            found.push(`${relative(process.cwd(), file)}:${String(index + 1)}`);
          }
        });
    }
  }
  return found;
}

describe("AC-35 (scan) — the switch and the event are never set for the session", () => {
  const SESSION_SET = new RegExp(
    String.raw`\bSET\s+(SESSION\s+)?app\.(allow_status_write|transition_event)\b`,
    "i",
  );
  const SESSION_SET_CONFIG = new RegExp(
    String.raw`set_config\(\s*'app\.(allow_status_write|transition_event)'\s*,[^)]*,\s*false\s*\)`,
    "i",
  );

  it("no `SET app.…` without LOCAL, and no set_config(…, false), in src/, db/ or tests/", () => {
    expect(hits(["src", "db", "tests"], SESSION_SET)).toEqual([]);
    expect(hits(["src", "db", "tests"], SESSION_SET_CONFIG)).toEqual([]);
  });

  it("the scan finds what it exists to find", () => {
    // Built from parts, so this file does not match its own scan.
    expect(
      SESSION_SET.test(["SET", "app.allow_status_write = 'on'"].join(" ")),
    ).toBe(true);
    expect(
      SESSION_SET.test(["set session", "app.transition_event = 'x'"].join(" ")),
    ).toBe(true);
    expect(SESSION_SET.test("SET LOCAL app.allow_status_write = 'on'")).toBe(
      false,
    );
    expect(
      SESSION_SET_CONFIG.test(
        ["set_config('app.allow_status_write', 'on',", "false)"].join(" "),
      ),
    ).toBe(true);
  });
});

describe("AC-36 (scan) — no test switches a trigger off", () => {
  // Built from parts, so this file does not match its own scan.
  const FORBIDDEN = new RegExp(
    [
      ["DISABLE", "TRIGGER"],
      ["DROP", "TRIGGER"],
      ["CREATE", "OR", "REPLACE", "TRIGGER"],
      ["session", "replication", "role"],
    ]
      .map((words, i) =>
        i === 3 ? words.join("_") : `\\b${words.join("\\s+")}\\b`,
      )
      .join("|"),
    "i",
  );
  /** A regex literal asserting on a rollback file's text: `/^DROP TRIGGER IF EXISTS … ON …;$/`. */
  const ROLLBACK_ASSERTION = new RegExp(
    ["[`/]\\^DROP", "TRIGGER IF EXISTS "].join(" "),
  );

  it("finds none under tests/, outside assertions on a rollback's text", () => {
    const found = hits(["tests"], FORBIDDEN).filter((hit) => {
      const [file, line] = hit.split(":");
      const text =
        readFileSync(join(process.cwd(), file ?? ""), "utf8").split(/\r?\n/)[
          Number(line) - 1
        ] ?? "";
      return !ROLLBACK_ASSERTION.test(text);
    });
    expect(found).toEqual([]);
  });

  it("the scan finds what it exists to find", () => {
    for (const statement of [
      ["ALTER TABLE x DISABLE", "TRIGGER ALL"].join(" "),
      ["DROP", "TRIGGER order_status_guard ON x"].join(" "),
      ["CREATE OR REPLACE", "TRIGGER t"].join(" "),
      ["SET session", "replication_role = replica"].join("_"),
    ]) {
      expect(FORBIDDEN.test(statement), statement).toBe(true);
    }
  });
});

describe("T-37 (unit) — every state is reachable from placed along legal rows", () => {
  const edges = TRANSITIONS.map((t) => ({
    from: t.from,
    event: t.event,
    to: t.to,
  }));
  for (const state of STATES.filter((s) => s.key !== INITIAL_STATUS)) {
    it(`placed → ${state.key}`, () => {
      const path = shortestPath(edges, INITIAL_STATUS, state.key);
      expect(path, state.key).toBeDefined();
      let at = INITIAL_STATUS;
      for (const step of path ?? []) {
        expect(
          TRANSITIONS.some(
            (t) => t.from === at && t.event === step.event && t.to === step.to,
          ),
        ).toBe(true);
        at = step.to;
      }
      expect(at).toBe(state.key);
    });
  }
});
