/**
 * The florist read models open their transaction under the member's partner context and nothing
 * wider (spec 011 AC-23; TASK-214): `role: 'partner'` with exactly the member's partner ids, so
 * the database's row-level security is what scopes every read. The database is mocked here; the
 * integration suite (`tests/integration/florist-inbox.test.ts`) proves what that context sees.
 */
import { describe, expect, it, vi } from "vitest";

const contexts: unknown[] = [];

vi.mock("../../src/lib/db.ts", () => ({
  withDbContext: (context: unknown) => {
    contexts.push(context);
    return Promise.resolve([]);
  },
}));

const { floristOrderView, listFloristAssignments } =
  await import("../../src/modules/orders/florist/read.ts");

const USER = "0b8e7d6c-5a4f-4e3d-8c2b-1a0f9e8d7c6b";
const PARTNER = "6f1c2a40-3b7e-4c1d-9a55-0d2e4f6a8b10";

describe("AC-23 — the read models run under the member's partner context", () => {
  it("list and order page pass role partner and exactly the member's partner ids", async () => {
    contexts.length = 0;
    const ctx = {
      role: "partner" as const,
      userId: USER,
      partnerIds: [PARTNER],
      requestId: "req-1",
    };
    await listFloristAssignments(ctx);
    await floristOrderView(ctx, "6f1c2e0a-3b7d-4c55-9a1e-2d8f0b7c4e91");
    expect(contexts).toEqual([
      {
        role: "partner",
        userId: USER,
        partnerIds: [PARTNER],
        requestId: "req-1",
      },
      {
        role: "partner",
        userId: USER,
        partnerIds: [PARTNER],
        requestId: "req-1",
      },
    ]);
  });
});
