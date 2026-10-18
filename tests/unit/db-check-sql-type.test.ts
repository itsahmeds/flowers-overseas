/**
 * `canonicalSqlType` (spec 002 AC-26, the connected half of `pnpm db:check`): Drizzle's
 * `getSQLType()` spelling of a column is compared with Postgres's `format_type()`. A
 * length-bearing alias keeps its length, so `auth_email_send.identifier_hash char(64)`
 * (spec 012 §5.1; TASK-217) is not reported as drift.
 */
import { describe, expect, it } from "vitest";

import { canonicalSqlType } from "../../scripts/db-check-live.ts";

describe("canonicalSqlType", () => {
  it("spells Drizzle's char(64) as Postgres's character(64)", () => {
    expect(canonicalSqlType("char(64)")).toBe("character(64)");
  });

  it("spells varchar(n) as character varying(n)", () => {
    expect(canonicalSqlType("varchar(255)")).toBe("character varying(255)");
  });

  it("keeps an array suffix on a sized type", () => {
    expect(canonicalSqlType("char(2)[]")).toBe("character(2)[]");
  });

  it("leaves the unsized aliases as they were", () => {
    expect(canonicalSqlType("timestamptz")).toBe("timestamp with time zone");
    expect(canonicalSqlType("varchar")).toBe("character varying");
    expect(canonicalSqlType("numeric(12, 2)")).toBe("numeric(12, 2)");
  });
});
