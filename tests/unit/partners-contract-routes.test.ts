/**
 * Spec 030b AC-36, contracts half (TASK-442): the upload route (`partner.contract.write`) and the
 * download route (`partner.contract.view`) are guarded first. Without a session each answers 401,
 * and `ops`, `finance` and `content` get 403, before any florist lookup, upload or signed URL; a
 * denied write stores nothing. `admin` gets the 303 of each, with the admin headers.
 *
 * The guard is the real `requirePermission` over a mocked session; the commands are recorded.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// What `next build` sets from `experimental.authInterrupts` (next.config.ts), so the guard's
// `unauthorized()` and `forbidden()` behave as in the deployed server.
vi.stubEnv("__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS", "true");

const USER = "8b0f3c2e-6a1d-4e5f-9a7b-1c2d3e4f5a6b";
const PARTNER = "2d4c6e8a-0b1d-4f3e-8a5c-7b9d1e3f5a7c";
const CONTRACT = "5f7e9d1c-3b5a-4c2e-9f8d-6a4b2c0e8d1f";

type Role = "admin" | "ops" | "finance" | "content";

const data = vi.hoisted(() => ({
  session: true,
  roles: ["admin"] as Role[],
  calls: [] as string[],
}));

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers()),
  cookies: () => Promise.resolve({ get: () => undefined }),
}));

vi.mock("@/modules/admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/admin")>();
  const session = () =>
    Promise.resolve(
      data.session
        ? {
            userId: USER,
            displayName: "Founder Test",
            roles: data.roles,
            timeZone: "Europe/Warsaw",
          }
        : null,
    );
  return {
    ...actual,
    requirePermission: (
      permission: Parameters<typeof actual.requirePermission>[0],
    ) => actual.requirePermission(permission, { session }),
    adminRequestId: () => Promise.resolve("request-1"),
  };
});

vi.mock("@/modules/partners", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/partners")>();
  return {
    ...actual,
    partnerHead: (_actor: unknown, code: string) => {
      data.calls.push(`partnerHead:${code}`);
      return Promise.resolve({ id: PARTNER, code });
    },
  };
});

vi.mock("@/modules/partners/contracts", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/modules/partners/contracts")>();
  return {
    ...actual,
    uploadContract: () => {
      data.calls.push("uploadContract");
      return Promise.resolve({ ok: true, contractId: CONTRACT, versionNo: 1 });
    },
    contractDownloadUrl: (_actor: unknown, id: string) => {
      data.calls.push(`contractDownloadUrl:${id}`);
      return Promise.resolve({
        ok: true,
        url: "https://r2.example.test/signed",
      });
    },
  };
});

const upload =
  await import("../../src/app/admin/(signed-in)/partners/[code]/contracts/upload/route.ts");
const download =
  await import("../../src/app/admin/(signed-in)/partners/[code]/contracts/[id]/download/route.ts");

const digestOf = (error: unknown): string =>
  typeof error === "object" && error !== null && "digest" in error
    ? String((error as { digest: unknown }).digest)
    : `not a Next interrupt: ${String(error)}`;

async function outcome(fn: () => Promise<Response>): Promise<string> {
  try {
    const response = await fn();
    return `status:${String(response.status)}`;
  } catch (error) {
    return digestOf(error);
  }
}

function uploadRequest(): Request {
  const form = new FormData();
  form.set("docKind", "agreement");
  form.set(
    "file",
    new Blob(["%PDF-1.7"], { type: "application/pdf" }),
    "a.pdf",
  );
  return new Request("https://admin.example.test/upload", {
    method: "POST",
    body: form,
  });
}

const callUpload = () =>
  upload.POST(uploadRequest(), {
    params: Promise.resolve({ code: "pl-waw-01" }),
  });
const callDownload = () =>
  download.GET(new Request("https://admin.example.test/download"), {
    params: Promise.resolve({ code: "pl-waw-01", id: CONTRACT }),
  });

beforeEach(() => {
  data.session = true;
  data.roles = ["admin"];
  data.calls = [];
});

describe.each([
  ["upload", callUpload],
  ["download", callDownload],
] as const)("the contract %s route (AC-36)", (_name, call) => {
  it("answers 401 without a session, and nothing runs", async () => {
    data.session = false;
    expect(await outcome(call)).toBe("NEXT_HTTP_ERROR_FALLBACK;401");
    expect(data.calls).toEqual([]);
  });

  for (const role of ["ops", "finance", "content"] as const) {
    it(`answers 403 for ${role}, and nothing runs`, async () => {
      data.roles = [role];
      expect(await outcome(call)).toBe("NEXT_HTTP_ERROR_FALLBACK;403");
      expect(data.calls).toEqual([]);
    });
  }

  it("answers 303 for admin with the admin headers", async () => {
    const response = await call();
    expect(response.status).toBe(303);
    expect(response.headers.get("Cache-Control")).toBe("no-store, private");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(data.calls.length).toBeGreaterThan(0);
  });
});

describe("what admin's 303 points at", () => {
  it("upload: back to the Contracts tab with the new entry, after one upload", async () => {
    const response = await callUpload();
    expect(response.headers.get("Location")).toBe(
      `/admin/partners/pl-waw-01/contracts?form=upload&result=uploaded&entry=${CONTRACT}`,
    );
    expect(data.calls).toEqual(["partnerHead:pl-waw-01", "uploadContract"]);
  });

  it("download: the signed URL, after one lookup of the contract", async () => {
    const response = await callDownload();
    expect(response.headers.get("Location")).toBe(
      "https://r2.example.test/signed",
    );
    expect(data.calls).toEqual([`contractDownloadUrl:${CONTRACT}`]);
  });
});
