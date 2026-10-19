/**
 * The `fo_checkout` cookie, its token and the log redaction the checkout adds (spec 010 §5.2,
 * §8 "Logs and PII", "Security", AC-6 cookie attributes, AC-36 cookie half; TASK-203).
 */
import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { redact } from "@/lib/logger";
import {
  CHECKOUT_COOKIE_ATTRIBUTES,
  CHECKOUT_COOKIE_NAME,
  checkoutCookieHeader,
  draftTokenFromCookieHeader,
  draftTokenHash,
  isDraftToken,
} from "@/modules/checkout";

import { newDraftToken } from "../../src/modules/checkout/cookie.ts";

describe("the draft token (§8: 256-bit, hashed at rest)", () => {
  it("is 32 random bytes, base64url, never the same twice", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => newDraftToken()));
    expect(tokens.size).toBe(200);
    for (const token of tokens) {
      expect(isDraftToken(token)).toBe(true);
      expect(Buffer.from(token, "base64url")).toHaveLength(32);
    }
  });

  it("is stored as its SHA-256 only", () => {
    const token = newDraftToken();
    expect(draftTokenHash(token)).toBe(
      createHash("sha256").update(token).digest("hex"),
    );
    expect(draftTokenHash(token)).not.toContain(token);
  });

  it("refuses anything not shaped like one of ours", () => {
    for (const value of [
      null,
      undefined,
      "",
      "x".repeat(42),
      "x".repeat(44),
      `${"a".repeat(42)}=`,
      `${"a".repeat(42)};`,
      42,
    ]) {
      expect(isDraftToken(value)).toBe(false);
    }
  });
});

describe("the cookie (AC-6)", () => {
  it("is fo_checkout; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400", () => {
    const token = newDraftToken();
    const header = checkoutCookieHeader(token);
    const [pair, ...attributes] = header.split("; ");
    expect(pair).toBe(`${CHECKOUT_COOKIE_NAME}=${token}`);
    expect(new Set(attributes)).toEqual(
      new Set([
        "Path=/",
        "Max-Age=86400",
        "HttpOnly",
        "Secure",
        "SameSite=Lax",
      ]),
    );
    expect(CHECKOUT_COOKIE_NAME).toBe("fo_checkout");
    expect(CHECKOUT_COOKIE_ATTRIBUTES).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 86_400,
    });
  });

  it("never writes a value that is not a token", () => {
    expect(() => checkoutCookieHeader("a; Domain=evil.example")).toThrow();
  });

  it("reads the token back from a Cookie header, and nothing else", () => {
    const token = newDraftToken();
    expect(
      draftTokenFromCookieHeader(`fo_locale=pl; fo_checkout=${token}; x=1`),
    ).toBe(token);
    expect(draftTokenFromCookieHeader("fo_checkout=forged")).toBeNull();
    expect(draftTokenFromCookieHeader("fo_checkoutx=abc")).toBeNull();
    expect(draftTokenFromCookieHeader(null)).toBeNull();
  });
});

describe("the logger redacts what a checkout carries (§8)", () => {
  it("redacts email, sign_as, delivery_note, token and *_snapshot at any depth", () => {
    const line = redact({
      draft_id: "d1",
      step: "card",
      email: "a@b.example",
      sign_as: "Mum",
      signAs: "Mum",
      delivery_note: "ring twice",
      deliveryNote: "ring twice",
      token: "t",
      nested: {
        buyer_snapshot: { name: "x" },
        recipientSnapshot: "y",
        draftToken: "t",
      },
    }) as Record<string, unknown>;
    expect(line["draft_id"]).toBe("d1");
    expect(line["step"]).toBe("card");
    for (const key of [
      "email",
      "sign_as",
      "signAs",
      "delivery_note",
      "deliveryNote",
      "token",
    ]) {
      expect(line[key], key).toBe("[REDACTED]");
    }
    expect(line["nested"]).toEqual({
      buyer_snapshot: "[REDACTED]",
      recipientSnapshot: "[REDACTED]",
      draftToken: "[REDACTED]",
    });
  });
});
