/**
 * T-01 / AC-1 (spec 018 §5.2 `src/lib/signed-link.ts`; TASK-337): `sign` then `verify` round-trips;
 * every single-byte change of the decoded payload and of the decoded MAC, every single-character
 * change of the token, another purpose and an expiry one millisecond or one second past all give
 * the **one** failure value (`toBe(SIGNED_LINK_FAILURE)`, identity), and the MAC comparison goes
 * through `timingSafeEqual`. `signedLinkSecret()` follows `authSecret()`'s rule.
 */
import * as crypto from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, timingSafeEqual: vi.fn(actual.timingSafeEqual) };
});

import {
  DEVELOPMENT_SIGNED_LINK_SECRET,
  EnvValidationError,
  validateRuntimeEnv,
} from "../../src/lib/env.schema.ts";
import { signedLinkSecret } from "../../src/lib/env.signed-link.ts";
import {
  EXPIRY_KEY,
  SIGNED_LINK_FAILURE,
  SIGNED_LINK_MAC_BYTES,
  SIGNED_LINK_PURPOSES,
  type Purpose,
  sign,
  verify,
} from "../../src/lib/signed-link.ts";

const SECRET = "k".repeat(64);
const OTHER_SECRET = "j".repeat(64);
const PAYLOAD = { publicToken: "AbCdEfGhIjKlMnOpQrStUv", version: 1 } as const;
const T0 = new Date("2026-11-01T10:00:00.000Z");
const at = (date: Date) => ({ secret: SECRET, now: () => date });
const plus = (ms: number) => new Date(T0.getTime() + ms);

const BASE64URL =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function segments(token: string): [Buffer, Buffer] {
  const [payload = "", mac = ""] = token.split(".");
  return [Buffer.from(payload, "base64url"), Buffer.from(mac, "base64url")];
}

function join(payload: Buffer, mac: Buffer): string {
  return `${payload.toString("base64url")}.${mac.toString("base64url")}`;
}

beforeEach(() => {
  vi.mocked(crypto.timingSafeEqual).mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sign and verify round-trip (AC-1)", () => {
  it.each(SIGNED_LINK_PURPOSES)(
    "a %s token verifies with its purpose and gives its payload back",
    (purpose) => {
      const token = sign(purpose, PAYLOAD, undefined, { secret: SECRET });
      expect(verify(purpose, token, at(T0))).toEqual({
        ok: true,
        payload: PAYLOAD,
        expiresAt: undefined,
      });
    },
  );

  it("is payload segment, a dot, and a 16-byte MAC, both base64url", () => {
    const token = sign("track", PAYLOAD, undefined, { secret: SECRET });
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}$/u);
    const [payload, mac] = segments(token);
    expect(mac).toHaveLength(SIGNED_LINK_MAC_BYTES);
    // A tracking token decodes to exactly the two keys (AC-2's first clause): no date, no order.
    expect(JSON.parse(payload.toString("utf8"))).toEqual(PAYLOAD);
    expect(Object.keys(JSON.parse(payload.toString("utf8")))).toEqual([
      "publicToken",
      "version",
    ]);
  });

  it("puts expiresAt inside the signed payload and returns it", () => {
    const expiresAt = plus(60_000);
    const token = sign("invoice", { invoiceId: "x" }, expiresAt, {
      secret: SECRET,
    });
    const [payload] = segments(token);
    expect(JSON.parse(payload.toString("utf8"))).toEqual({
      invoiceId: "x",
      [EXPIRY_KEY]: expiresAt.getTime(),
    });
    expect(verify("invoice", token, at(T0))).toEqual({
      ok: true,
      payload: { invoiceId: "x" },
      expiresAt,
    });
  });

  it("compares the MAC with timingSafeEqual", () => {
    const token = sign("track", PAYLOAD, undefined, { secret: SECRET });
    verify("track", token, at(T0));
    expect(crypto.timingSafeEqual).toHaveBeenCalledTimes(1);
    const [left, right] = vi.mocked(crypto.timingSafeEqual).mock.calls[0] as [
      Buffer,
      Buffer,
    ];
    expect(left).toHaveLength(SIGNED_LINK_MAC_BYTES);
    expect(right).toEqual(segments(token)[1]);
  });
});

describe("one failure value for every cause (AC-1)", () => {
  const token = sign("track", PAYLOAD, undefined, { secret: SECRET });
  const [payload, mac] = segments(token);

  it("every single-byte change of the payload fails", () => {
    expect(payload.length).toBeGreaterThan(0);
    for (let index = 0; index < payload.length; index += 1) {
      for (const flip of [0x01, 0x80, 0xff]) {
        const changed = Buffer.from(payload);
        changed[index] = (changed[index] ?? 0) ^ flip;
        expect(
          verify("track", join(changed, mac), at(T0)),
          `payload byte ${index} ^ ${flip}`,
        ).toBe(SIGNED_LINK_FAILURE);
      }
    }
  });

  it("every single-byte change of the MAC fails", () => {
    for (let index = 0; index < mac.length; index += 1) {
      for (const flip of [0x01, 0x80, 0xff]) {
        const changed = Buffer.from(mac);
        changed[index] = (changed[index] ?? 0) ^ flip;
        expect(
          verify("track", join(payload, changed), at(T0)),
          `mac byte ${index} ^ ${flip}`,
        ).toBe(SIGNED_LINK_FAILURE);
      }
    }
  });

  it("every single-character change of the token string fails, padding bits included", () => {
    for (let index = 0; index < token.length; index += 1) {
      for (const replacement of `${BASE64URL}.=+/ `) {
        if (replacement === token[index]) continue;
        const changed = `${token.slice(0, index)}${replacement}${token.slice(index + 1)}`;
        expect(
          verify("track", changed, at(T0)),
          `char ${index} -> ${replacement}`,
        ).toBe(SIGNED_LINK_FAILURE);
      }
    }
  });

  it("a token signed for another purpose fails, for every pair of purposes", () => {
    for (const signedFor of SIGNED_LINK_PURPOSES) {
      const other = sign(signedFor, PAYLOAD, undefined, { secret: SECRET });
      for (const verifiedAs of SIGNED_LINK_PURPOSES) {
        const result = verify(verifiedAs, other, at(T0));
        if (signedFor === verifiedAs) expect(result.ok).toBe(true);
        else
          expect(result, `${signedFor} as ${verifiedAs}`).toBe(
            SIGNED_LINK_FAILURE,
          );
      }
    }
  });

  it("a token under another secret fails", () => {
    const foreign = sign("track", PAYLOAD, undefined, {
      secret: OTHER_SECRET,
    });
    expect(verify("track", foreign, at(T0))).toBe(SIGNED_LINK_FAILURE);
  });

  it("expires at expiresAt: one millisecond before passes, at and one second past fail", () => {
    const expiresAt = plus(30 * 24 * 3600 * 1000);
    const expiring = sign("export", { requestId: "r" }, expiresAt, {
      secret: SECRET,
    });
    expect(
      verify("export", expiring, at(new Date(expiresAt.getTime() - 1))).ok,
    ).toBe(true);
    expect(verify("export", expiring, at(expiresAt))).toBe(SIGNED_LINK_FAILURE);
    expect(
      verify("export", expiring, at(new Date(expiresAt.getTime() + 1000))),
    ).toBe(SIGNED_LINK_FAILURE);
  });

  it("an expiry moved later by re-encoding the payload fails (exp is inside the MAC)", () => {
    const expiring = sign("export", { requestId: "r" }, plus(1000), {
      secret: SECRET,
    });
    const [body, tag] = segments(expiring);
    const moved = {
      ...JSON.parse(body.toString("utf8")),
      [EXPIRY_KEY]: plus(10 ** 9).getTime(),
    };
    expect(
      verify(
        "export",
        join(Buffer.from(JSON.stringify(moved)), tag),
        at(plus(5000)),
      ),
    ).toBe(SIGNED_LINK_FAILURE);
  });

  it.each([
    ["empty", ""],
    ["no dot", "abc"],
    ["three parts", `${token}.x`],
    ["empty payload", `.${token.split(".")[1] ?? ""}`],
    ["empty mac", `${token.split(".")[0] ?? ""}.`],
    [
      "a short MAC",
      `${token.split(".")[0] ?? ""}.${Buffer.alloc(8).toString("base64url")}`,
    ],
    ["standard base64", token.replaceAll("-", "+").replaceAll("_", "/") + "=="],
  ])("a malformed token (%s) fails", (_name, malformed) => {
    expect(verify("track", malformed, at(T0))).toBe(SIGNED_LINK_FAILURE);
  });

  it("a signed body that is not a JSON object, or carries a non-integer exp, fails", () => {
    // Signed with the right key and purpose, so only the body rule can refuse them.
    const forge = (body: string): string => {
      const segment = Buffer.from(body, "utf8").toString("base64url");
      const tag = crypto
        .createHmac("sha256", SECRET)
        .update(`track:v1:${segment}`)
        .digest()
        .subarray(0, SIGNED_LINK_MAC_BYTES)
        .toString("base64url");
      return `${segment}.${tag}`;
    };
    expect(verify("track", forge(JSON.stringify(PAYLOAD)), at(T0)).ok).toBe(
      true,
    );
    for (const body of [
      "[1,2]",
      "42",
      "null",
      "not json",
      '{"exp":"soon"}',
      '{"exp":1.5}',
      '{"exp":null}',
    ]) {
      expect(verify("track", forge(body), at(T0)), body).toBe(
        SIGNED_LINK_FAILURE,
      );
    }
  });

  it("an unknown purpose fails on verify and throws on sign", () => {
    expect(verify("admin" as Purpose, token, at(T0))).toBe(SIGNED_LINK_FAILURE);
    expect(() =>
      sign("admin" as Purpose, PAYLOAD, undefined, { secret: SECRET }),
    ).toThrow();
  });

  it("sign refuses the reserved key and an invalid date", () => {
    expect(() =>
      sign("track", { [EXPIRY_KEY]: 1 }, undefined, { secret: SECRET }),
    ).toThrow(/reserved/u);
    expect(() =>
      sign("track", PAYLOAD, new Date(Number.NaN), { secret: SECRET }),
    ).toThrow(/date/u);
  });
});

describe("signedLinkSecret() (spec 018 §12 founder action 1)", () => {
  it("uses the development secret only in development and test", () => {
    expect(signedLinkSecret({ NODE_ENV: "test" })).toBe(
      DEVELOPMENT_SIGNED_LINK_SECRET,
    );
    expect(signedLinkSecret({ APP_ENV: "development" })).toBe(
      DEVELOPMENT_SIGNED_LINK_SECRET,
    );
  });

  it.each(["preview", "staging", "production"])(
    "throws in %s without a secret, naming the key and no value",
    (env) => {
      expect(() => signedLinkSecret({ APP_ENV: env })).toThrow(
        EnvValidationError,
      );
      expect(() => signedLinkSecret({ APP_ENV: env })).toThrow(
        /SIGNED_LINK_SECRET/u,
      );
    },
  );

  it("refuses the development secret in a deployed environment and a production build", () => {
    expect(() =>
      signedLinkSecret({
        APP_ENV: "production",
        SIGNED_LINK_SECRET: DEVELOPMENT_SIGNED_LINK_SECRET,
      }),
    ).toThrow(/SIGNED_LINK_SECRET/u);
    expect(() =>
      signedLinkSecret({
        NODE_ENV: "production",
        SIGNED_LINK_SECRET: DEVELOPMENT_SIGNED_LINK_SECRET,
      }),
    ).toThrow(/SIGNED_LINK_SECRET/u);
  });

  it("returns a real secret anywhere, and refuses a short one", () => {
    expect(
      signedLinkSecret({ APP_ENV: "production", SIGNED_LINK_SECRET: SECRET }),
    ).toBe(SECRET);
    expect(() =>
      signedLinkSecret({ APP_ENV: "staging", SIGNED_LINK_SECRET: "short" }),
    ).toThrow(/at least 32/u);
    try {
      signedLinkSecret({ APP_ENV: "staging", SIGNED_LINK_SECRET: "short" });
    } catch (error) {
      expect(String(error)).not.toContain("short");
    }
  });

  it("is refused at boot when a deployed environment carries the development key", () => {
    const result = validateRuntimeEnv({
      APP_ENV: "production",
      SIGNED_LINK_SECRET: DEVELOPMENT_SIGNED_LINK_SECRET,
    });
    expect(
      result.issues.some((issue) => issue.key === "SIGNED_LINK_SECRET"),
    ).toBe(true);
  });

  it("signs with process.env's secret when no option is given", () => {
    vi.stubEnv("SIGNED_LINK_SECRET", SECRET);
    vi.stubEnv("APP_ENV", "production");
    const token = sign("track", PAYLOAD);
    expect(verify("track", token, at(T0)).ok).toBe(true);
    expect(
      verify("track", token, { secret: OTHER_SECRET, now: () => T0 }),
    ).toBe(SIGNED_LINK_FAILURE);
  });
});
