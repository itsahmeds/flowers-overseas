/**
 * spec 030a AC-26 (TASK-366), without a browser or a database: `GET
 * /admin/api/payouts/exports/{id}` answers 401 with no session (also enumerated by
 * `admin-unauthenticated.test.ts`), 403 to `ops` and `content` with nothing read, and to `finance`
 * and `admin` the CSV as an attachment `wise-{id}.csv`, `text/csv; charset=utf-8`, `no-store` and
 * `noindex`, with one `logAdminRead('payout_export', id)` and nothing of the file logged.
 * A malformed id is 404 and a cancelled export 409 with its code; neither is recorded as read.
 *
 * The AC names a Playwright check; tonight's rules forbid Playwright on this machine, so this
 * route test carries the AC and the e2e is a carry-forward in the brief.
 */
import { describe, expect, it, vi } from "vitest";

import type { AdminSession } from "../../src/lib/auth/admin.ts";

vi.stubEnv("__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS", "true");

const state = vi.hoisted(() => ({
  session: null as AdminSession | null,
  logAdminRead: vi.fn(() => Promise.resolve()),
  readWiseExportFile: vi.fn(),
  logs: [] as unknown[],
}));

vi.mock("@/lib/auth/admin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/auth/admin.ts")>()),
  getAdminSession: () => Promise.resolve(state.session),
}));
vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers({ "x-request-id": "req-366" })),
  cookies: () => Promise.resolve({ get: () => undefined }),
}));
vi.mock("@/modules/admin", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../src/modules/admin/index.ts")
  >()),
  logAdminRead: state.logAdminRead,
}));
vi.mock("@/modules/partners/payouts", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../src/modules/partners/payouts/index.ts")
  >()),
  readWiseExportFile: state.readWiseExportFile,
}));
vi.mock("@/lib/logger", () => {
  const record = (...args: unknown[]) => {
    state.logs.push(args);
  };
  const logger: Record<string, unknown> = {
    info: record,
    warn: record,
    error: record,
    debug: record,
    fatal: record,
    trace: record,
  };
  logger.child = () => logger;
  return { logger, default: logger };
});

const { GET } =
  await import("../../src/app/admin/api/payouts/exports/[exportId]/route.ts");
const { PayoutError } =
  await import("../../src/modules/partners/payouts/amount.ts");

const EXPORT_ID = "6f1c1b7e-2a3d-4c5b-9e8f-0a1b2c3d4e5f";
const BODY =
  "name,recipientId,sourceCurrency,targetCurrency,amountCurrency,amount,paymentReference\r\n" +
  "Kwiaciarnia Lipa,12345678,EUR,PLN,PLN,149.00,P-000127\r\n";

function as(role: AdminSession["roles"][number]): AdminSession {
  return {
    userId: "00000000-0000-4000-8000-000000000366",
    displayName: "Payouts Test",
    roles: [role],
    timeZone: "Europe/Warsaw",
  };
}

function call(id: string = EXPORT_ID) {
  return GET(
    new Request(`https://example.test/admin/api/payouts/exports/${id}`),
    {
      params: Promise.resolve({ exportId: id }),
    },
  );
}

async function digestOf(fn: () => unknown): Promise<string> {
  try {
    await fn();
  } catch (error) {
    return typeof error === "object" && error !== null && "digest" in error
      ? String((error as { digest: unknown }).digest)
      : `other: ${String(error)}`;
  }
  return "no error";
}

function reset(session: AdminSession | null) {
  state.session = session;
  state.logAdminRead.mockClear();
  state.readWiseExportFile.mockReset();
  state.readWiseExportFile.mockResolvedValue({
    filename: `wise-${EXPORT_ID}.csv`,
    body: BODY,
    rowCount: 1,
  });
  state.logs.length = 0;
}

describe("AC-26 · the Wise CSV download", () => {
  it("no session: 401 and nothing read", async () => {
    reset(null);
    expect(await digestOf(call)).toBe("NEXT_HTTP_ERROR_FALLBACK;401");
    expect(state.readWiseExportFile).not.toHaveBeenCalled();
    expect(state.logAdminRead).not.toHaveBeenCalled();
  });

  it.each(["ops", "content"] as const)(
    "%s: 403 and nothing read",
    async (role) => {
      reset(as(role));
      expect(await digestOf(call)).toBe("NEXT_HTTP_ERROR_FALLBACK;403");
      expect(state.readWiseExportFile).not.toHaveBeenCalled();
      expect(state.logAdminRead).not.toHaveBeenCalled();
    },
  );

  it.each(["finance", "admin"] as const)(
    "%s: the CSV as an attachment, no-store, noindex, one read recorded, nothing logged",
    async (role) => {
      reset(as(role));
      const response = await call();
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe(
        "text/csv; charset=utf-8",
      );
      expect(response.headers.get("content-disposition")).toBe(
        `attachment; filename="wise-${EXPORT_ID}.csv"`,
      );
      expect(response.headers.get("cache-control")).toBe("no-store, private");
      expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
      expect(await response.text()).toBe(BODY);
      expect(state.readWiseExportFile).toHaveBeenCalledWith(
        expect.objectContaining({ userId: as(role).userId }),
        EXPORT_ID,
      );
      expect(state.logAdminRead).toHaveBeenCalledTimes(1);
      expect(state.logAdminRead).toHaveBeenCalledWith(
        expect.objectContaining({ userId: as(role).userId }),
        "payout_export",
        EXPORT_ID,
      );
      const logged = JSON.stringify(state.logs);
      expect(logged).not.toContain("12345678");
      expect(logged).not.toContain("Kwiaciarnia");
    },
  );

  it("a malformed id: 404, nothing read or recorded", async () => {
    reset(as("finance"));
    const response = await call("not-a-uuid");
    expect(response.status).toBe(404);
    expect(state.readWiseExportFile).not.toHaveBeenCalled();
    expect(state.logAdminRead).not.toHaveBeenCalled();
  });

  it("a cancelled export: 409 with its code, not recorded as read", async () => {
    reset(as("finance"));
    state.readWiseExportFile.mockRejectedValue(
      new PayoutError("PAYOUT_EXPORT_CANCELLED", "cancelled"),
    );
    const response = await call();
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ code: "PAYOUT_EXPORT_CANCELLED" });
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    expect(state.logAdminRead).not.toHaveBeenCalled();
  });

  it("an unknown export: 404", async () => {
    reset(as("admin"));
    state.readWiseExportFile.mockRejectedValue(
      new PayoutError("PAYOUT_NOT_FOUND", "missing"),
    );
    expect((await call()).status).toBe(404);
    expect(state.logAdminRead).not.toHaveBeenCalled();
  });
});
