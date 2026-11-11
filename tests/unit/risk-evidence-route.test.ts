/**
 * T-28's route half (spec 021 AC-28; TASK-495): `GET /admin/risk/evidence/[orderId]` asks for
 * `risk.evidence` before anything else (a role without it is 403 and nothing is built or read),
 * answers the PDF as an attachment with `Cache-Control: no-store, private` and the admin robots
 * header, writes exactly one `order_evidence` read row, and stores nothing (the route has no
 * storage write: the only storage call it can make is the photo's signed read URL). A malformed
 * id and an order with no pack are 404. The no-session 401 is `admin-unauthenticated`'s.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
  permissions: [] as string[],
  reads: [] as { entity: string; id: string }[],
  builds: [] as string[],
  allowed: true,
  pdf: new Uint8Array([37, 80, 68, 70]) as Uint8Array | null,
}));

vi.mock("@/modules/admin", () => ({
  adminRequestId: () => Promise.resolve("req-1"),
  adminT: (key: string) => key,
  logAdminRead: (_actor: unknown, entity: string, id: string) => {
    calls.reads.push({ entity, id });
    return Promise.resolve();
  },
  requirePermission: (permission: string) => {
    calls.permissions.push(permission);
    if (!calls.allowed) {
      const error = new Error("NEXT_HTTP_ERROR_FALLBACK;403");
      Object.assign(error, { digest: "NEXT_HTTP_ERROR_FALLBACK;403" });
      return Promise.reject(error);
    }
    return Promise.resolve({ userId: "00000000-0000-4000-8000-000000000001" });
  },
}));

vi.mock("@/modules/payments", () => ({
  riskFactsFor: () => Promise.reject(new Error("unused")),
  stripeProviderFromEnv: () => {
    throw new Error("unused");
  },
}));

vi.mock("@/modules/risk", () => ({
  adminRiskTransaction: () => () => Promise.reject(new Error("unused")),
  buildEvidencePack: (orderId: string) => {
    calls.builds.push(orderId);
    return Promise.resolve(calls.pdf);
  },
}));

const ROUTE = "src/app/admin/(signed-in)/risk/evidence/[orderId]/route.ts";
const ORDER = "3f0c9a52-6d1b-4c3e-9a77-2b5d8e1f4a60";

const { GET } = (await import(`../../${ROUTE}`)) as {
  GET: (
    request: Request,
    context: { params: Promise<{ orderId: string }> },
  ) => Promise<Response>;
};

const get = (orderId: string) =>
  GET(new Request(`https://example.test/admin/risk/evidence/${orderId}`), {
    params: Promise.resolve({ orderId }),
  });

describe("GET /admin/risk/evidence/[orderId] (AC-28)", () => {
  beforeEach(() => {
    calls.permissions = [];
    calls.reads = [];
    calls.builds = [];
    calls.allowed = true;
    calls.pdf = new Uint8Array([37, 80, 68, 70]);
  });

  it("without risk.evidence: 403, nothing built, no read row", async () => {
    calls.allowed = false;
    const error = await get(ORDER).catch((caught: unknown) => caught);
    expect((error as { digest?: string }).digest).toBe(
      "NEXT_HTTP_ERROR_FALLBACK;403",
    );
    expect(calls.permissions).toEqual(["risk.evidence"]);
    expect(calls.builds).toEqual([]);
    expect(calls.reads).toEqual([]);
  });

  it("with it: the PDF as an attachment, no-store and private, one order_evidence read row", async () => {
    const response = await get(ORDER);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe(
      `attachment; filename="evidence-${ORDER}.pdf"`,
    );
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([37, 80, 68, 70]),
    );
    expect(calls.builds).toEqual([ORDER]);
    expect(calls.reads).toEqual([{ entity: "order_evidence", id: ORDER }]);
  });

  it("a malformed id or an order with no pack is 404, with no read row", async () => {
    expect((await get("not-a-uuid")).status).toBe(404);
    calls.pdf = null;
    expect((await get(ORDER)).status).toBe(404);
    expect(calls.reads).toEqual([]);
  });

  it("stores nothing: the route makes no storage write", () => {
    const source = readFileSync(
      resolve(import.meta.dirname, "../..", ROUTE),
      "utf8",
    );
    expect(source).not.toMatch(/\.put\(|storeDelivery|upload|\.write\(/u);
  });
});
