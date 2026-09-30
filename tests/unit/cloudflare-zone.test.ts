/**
 * The Cloudflare scripts' endpoint allow-list, token-scope map and declaration schema (spec 040
 * AC-24 / T-25, AC-17; TASK-100).
 *
 * AC-24: "a unit test pins the set of API endpoints it may call and fails on any `/accounts/`
 * path; a 403 is reported as a named missing scope". The allow-list is pinned whole, a planted
 * account-level entry or call is refused, and each endpoint's 403 names its one scope.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ALLOWED_ENDPOINTS,
  type AllowedEndpoint,
  type ApiRequest,
  type ApiResponse,
  CloudflareApiError,
  EndpointNotAllowedError,
  MissingScopeError,
  WriteInCheckModeError,
  type ZoneClient,
  createZoneClient,
  matchEndpoint,
  validateAllowList,
  zoneSettingsSchema,
} from "../../src/lib/cloudflare-zone";

const repoRoot = resolve(__dirname, "../..");
const ZONE_ID = "0f1e2d3c4b5a69788796a5b4c3d2e1f0";
const recorded403 = JSON.parse(
  readFileSync(
    resolve(repoRoot, "tests/fixtures/cloudflare/response-403.json"),
    "utf8",
  ),
) as ApiResponse;

/** A client over a transport that answers `response` and records every request it receives. */
function clientAnswering(
  response: ApiResponse,
  mode: "check" | "apply" = "apply",
): { client: ZoneClient; received: ApiRequest[] } {
  const received: ApiRequest[] = [];
  const client = createZoneClient({
    zoneId: ZONE_ID,
    mode,
    transport: (request) => {
      received.push(request);
      return Promise.resolve(response);
    },
  });
  return { client, received };
}

describe("the endpoint allow-list (AC-24, T-25)", () => {
  it("is exactly these four zone-scoped endpoints, each with its token scope", () => {
    expect(ALLOWED_ENDPOINTS).toEqual([
      {
        method: "GET",
        pattern: "/zones/{zone_id}",
        scope: "Zone → Zone → Read",
      },
      {
        method: "GET",
        pattern: "/zones/{zone_id}/settings/{setting_id}",
        scope: "Zone → Zone Settings → Edit",
      },
      {
        method: "PATCH",
        pattern: "/zones/{zone_id}/settings/{setting_id}",
        scope: "Zone → Zone Settings → Edit",
      },
      {
        method: "GET",
        pattern: "/zones/{zone_id}/bot_management",
        scope: "Zone → Bot Management → Read",
      },
    ]);
  });

  it("accepts the pinned list and refuses a planted `/accounts/` entry", () => {
    expect(() => {
      validateAllowList(ALLOWED_ENDPOINTS);
    }).not.toThrow();
    const planted: AllowedEndpoint[] = [
      ...ALLOWED_ENDPOINTS,
      {
        method: "GET",
        pattern: "/accounts/{account_id}/tokens/verify",
        scope: "Account → API Tokens → Read",
      },
    ];
    expect(() => {
      validateAllowList(planted);
    }).toThrow(
      "GET /accounts/{account_id}/tokens/verify is not zone-scoped: no account-level endpoint may be allow-listed",
    );
  });

  it("refuses an entry that is not under the one zone, and one that reaches `/accounts` from it", () => {
    expect(() => {
      validateAllowList([
        { method: "GET", pattern: "/user/tokens/verify", scope: "User" },
      ]);
    }).toThrow(EndpointNotAllowedError);
    expect(() => {
      validateAllowList([
        {
          method: "GET",
          pattern: "/zones/{zone_id}/accounts/{account_id}",
          scope: "Account",
        },
      ]);
    }).toThrow(EndpointNotAllowedError);
  });

  it("refuses a planted `/accounts/…` call before it reaches the transport", async () => {
    const { client, received } = clientAnswering({ status: 200, body: {} });
    await expect(
      client.request({ method: "GET", path: "/accounts/abc123/tokens/verify" }),
    ).rejects.toThrow(
      "GET /accounts/abc123/tokens/verify is not on the endpoint allow-list (src/lib/cloudflare-zone.ts ALLOWED_ENDPOINTS)",
    );
    expect(received).toEqual([]);
  });

  it("binds `{zone_id}` to the configured zone and `{setting_id}` to one identifier", () => {
    expect(
      matchEndpoint("GET", `/zones/${ZONE_ID}/settings/ssl`, ZONE_ID)?.pattern,
    ).toBe("/zones/{zone_id}/settings/{setting_id}");
    expect(
      matchEndpoint(
        "GET",
        "/zones/ffffffffffffffffffffffffffffffff/settings/ssl",
        ZONE_ID,
      ),
    ).toBeUndefined();
    expect(
      matchEndpoint(
        "GET",
        `/zones/${ZONE_ID}/settings/../../accounts`,
        ZONE_ID,
      ),
    ).toBeUndefined();
    expect(
      matchEndpoint("DELETE", `/zones/${ZONE_ID}`, ZONE_ID),
    ).toBeUndefined();
    expect(
      matchEndpoint("GET", `/zones/${ZONE_ID}/dns_records`, ZONE_ID),
    ).toBeUndefined();
  });

  it("keeps the live `fetch` to one call site, the transport that holds the token", () => {
    const script = readFileSync(
      resolve(repoRoot, "scripts/cloudflare/apply-zone-settings.ts"),
      "utf8",
    );
    const lib = readFileSync(
      resolve(repoRoot, "src/lib/cloudflare-zone.ts"),
      "utf8",
    );
    // Any second `fetch(` could call an endpoint without passing through the client's guard.
    expect(script.match(/\bfetch\(/g)).toHaveLength(1);
    expect(script).toContain(
      "await fetch(`${CLOUDFLARE_API_BASE}${request.path}`, init)",
    );
    expect(lib.match(/\bfetch\(/g)).toBeNull();
    expect(script).not.toContain("/accounts");
  });
});

describe("a 403 names the missing scope (AC-24, T-25)", () => {
  const cases: [
    string,
    (client: ZoneClient) => Promise<unknown>,
    string,
    string,
  ][] = [
    [
      "the zone",
      (client) => client.getZone(),
      "Zone → Zone → Read",
      "GET /zones/{zone_id}",
    ],
    [
      "a setting",
      (client) => client.getSetting("ssl"),
      "Zone → Zone Settings → Edit",
      "GET /zones/{zone_id}/settings/ssl",
    ],
    [
      "a setting write",
      (client) => client.patchSetting("ssl", "strict"),
      "Zone → Zone Settings → Edit",
      "PATCH /zones/{zone_id}/settings/ssl",
    ],
    [
      "bot management",
      (client) => client.getBotManagement(),
      "Zone → Bot Management → Read",
      "GET /zones/{zone_id}/bot_management",
    ],
  ];

  for (const [what, call, scope, request] of cases) {
    it(`reading ${what}: "${scope}"`, async () => {
      const { client } = clientAnswering(recorded403);
      const failure = await call(client).then(
        () => undefined,
        (error: unknown) => error,
      );
      expect(failure).toBeInstanceOf(MissingScopeError);
      expect((failure as MissingScopeError).scope).toBe(scope);
      expect((failure as Error).message).toBe(
        `the token is missing scope ${scope} (${request} answered 403)`,
      );
    });
  }

  it("reports a refused token (401) as refused, not as a scope", async () => {
    const { client } = clientAnswering({
      status: 401,
      body: {
        success: false,
        errors: [{ code: 1000, message: "Invalid API Token" }],
        result: null,
      },
    });
    await expect(client.getZone()).rejects.toThrow(
      "GET /zones/{zone_id} answered 401: the token was refused (invalid, expired or revoked)",
    );
  });

  it("reports any other refusal with Cloudflare's error codes", async () => {
    const { client } = clientAnswering({
      status: 400,
      body: {
        success: false,
        errors: [{ code: 1007, message: "This setting is not editable" }],
        result: null,
      },
    });
    const failure = await client
      .patchSetting("http2", "on")
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(CloudflareApiError);
    expect((failure as Error).message).toBe(
      "PATCH /zones/{zone_id}/settings/http2 answered 400: 1007 This setting is not editable",
    );
  });
});

describe("a check-mode client performs no write (AC-23)", () => {
  it("refuses a PATCH before the transport sees it", async () => {
    const { client, received } = clientAnswering(
      { status: 200, body: {} },
      "check",
    );
    await expect(client.patchSetting("ssl", "strict")).rejects.toBeInstanceOf(
      WriteInCheckModeError,
    );
    await expect(
      client.request({
        method: "PATCH",
        path: `/zones/${ZONE_ID}/settings/brotli`,
      }),
    ).rejects.toThrow(
      "PATCH /zones/{zone_id}/settings/brotli refused: cloudflare:check performs no write",
    );
    expect(received).toEqual([]);
  });
});

describe("config/cloudflare/zone-settings.json parses, and a broken one does not", () => {
  const file = (): Record<string, unknown> =>
    JSON.parse(
      readFileSync(
        resolve(repoRoot, "config/cloudflare/zone-settings.json"),
        "utf8",
      ),
    ) as Record<string, unknown>;

  it("parses as committed, for the one zone", () => {
    expect(zoneSettingsSchema.parse(file()).zone).toBe("flowersoverseas.com");
  });

  it("refuses a do-not-enable row with no check and no gate named for it", () => {
    const broken = file();
    broken["doNotEnable"] = [
      { feature: "Rocket Loader", state: "off", reason: "hash", checks: [] },
    ];
    const result = zoneSettingsSchema.safeParse(broken);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      "a row with no checks must name the gate that checks it (checkedElsewhere)",
    );
  });

  it("refuses a setting declared twice", () => {
    const broken = file();
    broken["doNotEnable"] = [
      {
        feature: "Rocket Loader",
        state: "off",
        reason: "hash",
        checks: [{ source: "setting", setting: "ssl", value: "off" }],
      },
    ];
    const result = zoneSettingsSchema.safeParse(broken);
    expect(result.error?.issues[0]?.message).toBe("ssl is declared twice");
  });

  it("refuses a row without its reason, and an unknown field", () => {
    const noReason = file();
    noReason["protocol"] = [
      { setting: "ssl", feature: "SSL/TLS mode", value: "strict" },
    ];
    expect(zoneSettingsSchema.safeParse(noReason).success).toBe(false);
    const extra = { ...file(), cacheEverything: true };
    expect(zoneSettingsSchema.safeParse(extra).success).toBe(false);
  });
});
