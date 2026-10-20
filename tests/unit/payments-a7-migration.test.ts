/**
 * T-37, static half (spec 013 AC-37; spec 002 §14 A7.1, A7.8; TASK-254): what can be decided from
 * the tree alone.
 *
 *  - PR 210's tables are not edited: migrations `0007` to `0011`, forward and down, are
 *    byte-identical to the files A7 was written against (sha256 pinned here; a change to any of
 *    them is a new migration, never an edit).
 *  - A7 is one migration with its rollback, and the rollback's **first** statement after the
 *    ownership preamble is the `A7_ROLLBACK_LIVE_PAYMENTS` guard, before any `DROP`, `DELETE` or
 *    `ALTER` (the connected half, `tests/integration/payments-a7.test.ts`, runs it).
 *  - Neither file touches `order_status` or `order_transition` (A7.1).
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const DIR = resolve(import.meta.dirname, "../../db/migrations");

/** sha256 of PR 210's migrations as merged (origin/main when A7 was written). */
const PR_210_FILES: Readonly<Record<string, string>> = {
  "0007_orders_payments.sql":
    "34c8e302f9986ed019012959fc8f880f3f397af2e0921844281249ed119009ca",
  "0007_orders_payments.down.sql":
    "57f222d9336bdd79ac18156207cc73e4d651ef5343e5ddaca6b7ea00c7b854cd",
  "0008_order_integrity.sql":
    "169d230b0eb2b14b4778a97467789941326f478b45b3e4a26743e3dc7a1a33c7",
  "0008_order_integrity.down.sql":
    "24ecb244f487c8195b11726332989d791068584e0b510d1612a203b670ffe694",
  "0009_notifications_ops.sql":
    "67f40dce334b7f71f0d1fd64d3fc98e7f2865d8d14355e77ead7d853ddf980ec",
  "0009_notifications_ops.down.sql":
    "c4df3c0372b75c0fca968eef9aec99694346d3c4b5baffe063042f9514430e99",
  "0010_auth.sql":
    "fab9d34e6b95f1f331ae7f38be03c85671e95d2ef53b2f98d85b3305c8f9feba",
  "0010_auth.down.sql":
    "6d6e7a33545f70b879200567cde1e3ca70459df9804a315804c7cf8f42001f8c",
  "0011_rls_policies.sql":
    "20c5033218c8d5fa4ac9f7d160baa1efbf860db11b22c2556f04ea2f70d24300",
  "0011_rls_policies.down.sql":
    "360e7a6e37d16213c8aa2cd0dfc6963aa95ef7ec859341d1472ff57ea5d3a2e4",
};

function sha256(file: string): string {
  return createHash("sha256")
    .update(readFileSync(resolve(DIR, file)))
    .digest("hex");
}

/** The SQL with comments removed, so a word in a comment is never read as a statement. */
function statements(file: string): string {
  return readFileSync(resolve(DIR, file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--[^\n]*/g, "");
}

const a7 = readdirSync(DIR).filter((name) =>
  /^\d{4}_payments_a7\.sql$/.test(name),
);

describe("A7 leaves PR 210's migrations byte-identical (spec 013 AC-37, spec 002 A7.1)", () => {
  it("0007 to 0011, forward and down, hash to the merged files", () => {
    const actual = Object.fromEntries(
      Object.keys(PR_210_FILES).map((file) => [file, sha256(file)]),
    );
    expect(actual).toEqual(PR_210_FILES);
  });
});

describe("the A7 migration pair (spec 002 A7.8)", () => {
  it("is exactly one forward file named payments_a7, with its rollback", () => {
    expect(a7).toHaveLength(1);
    const down = (a7[0] ?? "").replace(/\.sql$/, ".down.sql");
    expect(readdirSync(DIR)).toContain(down);
  });

  it("guards the rollback before it drops, deletes or alters anything", () => {
    const down = statements((a7[0] ?? "").replace(/\.sql$/, ".down.sql"));
    const guard = down.indexOf("A7_ROLLBACK_LIVE_PAYMENTS");
    const firstChange = down.search(/\b(DROP|DELETE|ALTER)\b/);
    expect(guard).toBeGreaterThan(0);
    expect(firstChange).toBeGreaterThan(guard);
    expect(down).toMatch(
      /IF EXISTS \(SELECT 1 FROM public\.payment WHERE livemode\) THEN\s+RAISE EXCEPTION 'A7_ROLLBACK_LIVE_PAYMENTS/,
    );
  });

  it("touches neither order_status nor order_transition (A7.1)", () => {
    for (const file of [
      a7[0] ?? "",
      (a7[0] ?? "").replace(/\.sql$/, ".down.sql"),
    ]) {
      expect(statements(file), file).not.toMatch(
        /order_status|order_transition/,
      );
    }
  });

  it("adds livemode with no default, so a non-empty payment table fails loudly (A7.3)", () => {
    expect(statements(a7[0] ?? "")).toMatch(
      /ADD COLUMN livemode\s+boolean\s+NOT NULL,/,
    );
  });
});
