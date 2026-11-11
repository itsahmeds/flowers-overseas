/**
 * T-05 — `ADMIN_PERMISSIONS` is spec 012 §5.2's v0 matrix, cell by cell (AC-4; TASK-217), plus
 * spec 020a T-01: the four order-action permissions of §2.1 and §13 Q2 (AC-1; TASK-357), and no
 * `orders.transition`; spec 030a §5.2 "Permissions": `payouts.manage` (TASK-363).
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
  // spec 030a §5.2 "Permissions" (TASK-363): every payouts command but the terms; ops and content
  // get 403 (spec 030a AC-1 for the terms through `partner.payout`, AC-29 for the pages).
  "payouts.manage": ["admin", "finance"],
  "orders.view": ["admin", "ops", "finance"],
  "orders.view_pii": ["admin", "ops"],
  // spec 020a §2.1, §13 Q2: money moves admin only; reroute and resend also ops.
  "orders.reroute": ["admin", "ops"],
  "orders.cancel": ["admin"],
  "orders.refund": ["admin"],
  "orders.resend": ["admin", "ops"],
  // spec 012b §5.2 "Permission rows" (TASK-293): the two the review ledger reads.
  "translation.attest": ["admin", "ops", "finance", "content"],
  "media.review": ["admin", "content"],
  // spec 047 §13 Q12 (TASK-446): admin creates and edits, admin and finance read.
  "discounts.read": ["admin", "finance"],
  "discounts.write": ["admin"],
  // spec 030b §5.2 "Permissions", §13 Q1 and Q2 (TASK-440, AC-1): money admin only, the
  // relationship record admin and ops.
  "finance.view": ["admin"],
  "finance.export": ["admin"],
  "partner.crm.view": ["admin", "ops"],
  "partner.crm.write": ["admin", "ops"],
  // spec 030b §13 Q15 (TASK-442): contracts are admin only.
  "partner.contract.view": ["admin"],
  "partner.contract.write": ["admin"],
  // spec 021 §5.2 "Permissions" (TASK-494, AC-22): the queue admin and ops; blocking and the
  // evidence pack admin only.
  "risk.review": ["admin", "ops"],
  "risk.blocklist": ["admin"],
  "risk.evidence": ["admin"],
  // spec 012b §5.2 "Permission rows" (TASK-295): Publish.
  "catalogue.publish": ["admin", "content"],
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

  it("has no generic orders.transition permission (spec 020a AC-1)", () => {
    expect(Object.hasOwn(ADMIN_PERMISSIONS, "orders.transition")).toBe(false);
    expect(
      (adminPermissions as readonly string[]).includes("orders.transition"),
    ).toBe(false);
  });
});
