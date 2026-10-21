/**
 * T-05 — `ADMIN_PERMISSIONS` is spec 012 §5.2's v0 matrix, cell by cell (AC-4; TASK-217).
 *
 * The expected table is written out here from the spec, not derived from the constant: a cell
 * flipped in `src/modules/admin/permissions.ts` turns exactly one row red.
 */
import { describe, expect, it } from "vitest";

import {
  ADMIN_PERMISSIONS,
  adminPermissions,
  can,
} from "../../src/modules/admin/permissions.ts";
import { adminRoles } from "../../db/schema/auth.ts";

/** spec 012 §5.2, "Permission matrix", v0. */
const MATRIX: Record<string, readonly string[]> = {
  "users.manage": ["admin"],
  "audit.read": ["admin"],
  "flags.toggle": ["admin"],
  "partner.edit": ["admin", "ops"],
  "partner.status": ["admin", "ops"],
  "application.manage": ["admin", "ops"],
  "partner.payout": ["admin", "finance"],
  "orders.view": ["admin", "ops", "finance"],
  "orders.view_pii": ["admin", "ops"],
  // spec 012b §5.2 "Permission rows" (TASK-293): the two the review ledger reads.
  "translation.attest": ["admin", "ops", "finance", "content"],
  "media.review": ["admin", "content"],
};

describe("T-05 — ADMIN_PERMISSIONS (spec 012 §5.2)", () => {
  it("names exactly the v0 permissions", () => {
    expect([...adminPermissions].sort()).toEqual(Object.keys(MATRIX).sort());
    expect(Object.keys(ADMIN_PERMISSIONS).sort()).toEqual(
      Object.keys(MATRIX).sort(),
    );
  });

  const cells = Object.entries(MATRIX).flatMap(([permission, allowed]) =>
    adminRoles.map(
      (role) => [permission, role, allowed.includes(role)] as const,
    ),
  );

  it.each(cells)("%s for %s → %s", (permission, role, allowed) => {
    expect(can([role], permission as never)).toBe(allowed);
  });

  it("allows a person with several roles what any of them allows, and nothing with none", () => {
    expect(can(["finance", "ops"], "orders.view_pii")).toBe(true);
    expect(can(["content"], "orders.view")).toBe(false);
    expect(can([], "orders.view")).toBe(false);
  });

  it("refuses an unknown permission", () => {
    expect(can(["admin"], "orders.transition" as never)).toBe(false);
  });
});
