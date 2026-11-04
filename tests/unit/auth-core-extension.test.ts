/**
 * The sign-in core's additive extension for the buyer surface (spec 018 §14 A-founder-2026-10-22
 * C.3, C.4, AC-47 core half, AC-50's unit cases; TASK-351), without a database:
 *
 *  - `AuthSurfaceSchema` admits `name` `buyer`, the tags `buyer_sign_in` and `occasion_reminder`,
 *    `cookiePath` `/` (which covers every path) and the optional `pagesFor`, `returnTo` and
 *    `afterSignIn`; what it refused before it still refuses.
 *  - `isSafeReturnPath` and the surface's `returnTo` decide the stored return path: another
 *    origin, `//`, a backslash, an encoded scheme or a path outside the pattern is never stored.
 *  - `pagesOf(locale)` gives the locale's pages, and the default pages for a locale that is not a
 *    tag or a `pagesFor` answer that is not a set of site paths.
 *  - `requestSignIn` answers the same bytes for every address, and sets (or clears) the surface's
 *    `callback-url` cookie only on a surface with `returnTo`: the admin answer carries no cookie.
 *
 * The fixture surface is the buyer configuration of C.3; `src/lib/auth/buyer.ts` is TASK-344's.
 */
import { describe, expect, it } from "vitest";

import { ADMIN_SURFACE, createAdminAuth } from "../../src/lib/auth/admin.ts";
import { FLORIST_SURFACE } from "../../src/lib/auth/florist.ts";
import {
  AuthSurfaceSchema,
  type AuthSurfaceConfig,
} from "../../src/lib/auth/schema.ts";
import {
  createAuthSurface,
  isSafeReturnPath,
} from "../../src/lib/auth/surface.ts";
import { mailTags } from "../../src/modules/notifications/mailer.ts";

const ORIGIN = "https://www.example.test";
const LOCALES = ["en", "en-gb", "de", "pl"] as const;

/** C.4's allowed targets: `/{locale}/account` and below, `/{locale}/checkout`. */
const buyerReturnTo = (path: string): boolean => {
  const [, locale, ...rest] = path.split("/");
  if (!(LOCALES as readonly string[]).includes(locale ?? "")) return false;
  return rest[0] === "account" || (rest[0] === "checkout" && rest.length === 1);
};

const BUYER: AuthSurfaceConfig = {
  name: "buyer",
  basePath: "/api/auth/buyer",
  cookiePath: "/",
  cookiePrefix: "__Secure-fo-buyer",
  sessionMaxAgeSeconds: 30 * 24 * 60 * 60,
  rolling: true,
  pages: {
    signIn: "/en/account",
    confirm: "/en/account/sign-in/confirm",
    home: "/en/account",
  },
  pagesFor: (locale) => ({
    signIn: `/${locale}/account`,
    confirm: `/${locale}/account/sign-in/confirm`,
    home: `/${locale}/account`,
  }),
  mailTag: "buyer_sign_in",
  allow: () => Promise.resolve(true),
  returnTo: buyerReturnTo,
  afterSignIn: () => Promise.resolve(),
};

function buyer(config: Partial<AuthSurfaceConfig> = {}) {
  return createAuthSurface(
    { ...BUYER, ...config },
    {
      secret: () => "unit-auth-secret-0123456789abcdef",
      siteOrigin: () => ORIGIN,
      renderEmail: (link) => ({ subject: "s", text: link, html: link }),
      // Nothing after the response runs here: these cases are about the response alone.
      defer: () => undefined,
    },
  );
}

function form(fields: Record<string, string>): Request {
  return new Request(`${ORIGIN}/api/auth/buyer/request`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      host: "www.example.test",
      origin: ORIGIN,
    },
    body: new URLSearchParams(fields).toString(),
  });
}

async function snapshot(response: Response) {
  return {
    status: response.status,
    headers: [...response.headers.entries()].sort(),
    body: await response.text(),
  };
}

describe("AuthSurfaceSchema, extended (AC-47 core half)", () => {
  it("accepts the buyer surface with cookie path /, and admin and florist as before", () => {
    const parsed = AuthSurfaceSchema.parse(BUYER);
    expect(parsed.name).toBe("buyer");
    expect(parsed.cookiePath).toBe("/");
    expect(parsed.mailTag).toBe("buyer_sign_in");
    expect(AuthSurfaceSchema.parse(ADMIN_SURFACE).cookiePath).toBe("/admin");
    expect(AuthSurfaceSchema.parse(FLORIST_SURFACE).cookiePath).toBe(
      FLORIST_SURFACE.cookiePath,
    );
  });

  it("registers buyer_sign_in and occasion_reminder as mail tags", () => {
    expect(mailTags).toContain("buyer_sign_in");
    expect(mailTags).toContain("occasion_reminder");
    expect(
      AuthSurfaceSchema.safeParse({ ...BUYER, mailTag: "occasion_reminder" })
        .success,
    ).toBe(true);
  });

  it.each([
    ["a name outside admin, florist, buyer", { name: "customer" }],
    ["an unregistered mail tag", { mailTag: "newsletter" }],
    ["a __Host- prefix", { cookiePrefix: "__Host-fo-buyer" }],
    ["a cookie path with a trailing slash", { cookiePath: "/en/" }],
    ["a cookie path of //", { cookiePath: "//" }],
    ["a pagesFor that is not a function", { pagesFor: "/en/account" }],
    ["a returnTo that is not a function", { returnTo: "^/en/" }],
    ["an afterSignIn that is not a function", { afterSignIn: true }],
  ])("refuses %s", (_label, change) => {
    expect(AuthSurfaceSchema.safeParse({ ...BUYER, ...change }).success).toBe(
      false,
    );
  });

  it("treats / as covering every path, and any other cookie path as before", () => {
    // Under `/`: the base path and pages anywhere on the site.
    expect(
      AuthSurfaceSchema.safeParse({ ...BUYER, basePath: "/api/auth/buyer" })
        .success,
    ).toBe(true);
    // The buyer surface scoped to `/en` (T-47's mutation) refuses its own base path.
    expect(
      AuthSurfaceSchema.safeParse({ ...BUYER, cookiePath: "/en" }).success,
    ).toBe(false);
    // The admin surface with its home outside `/admin` is still refused.
    expect(
      AuthSurfaceSchema.safeParse({
        ...ADMIN_SURFACE,
        pages: { ...ADMIN_SURFACE.pages, home: "/en/account" },
      }).success,
    ).toBe(false);
  });
});

describe("the return path (C.4; AC-50's unit cases)", () => {
  it.each([
    "/en/account",
    "/de/account/orders/FO-7Q3K-2M",
    "/en-gb/checkout",
    "/pl/account/details",
  ])("admits %s", (path) => {
    expect(isSafeReturnPath(path)).toBe(true);
    expect(buyerReturnTo(path)).toBe(true);
  });

  it.each([
    ["another origin", "https://evil.example"],
    ["a scheme-relative path", "//evil.example"],
    ["a backslash", "/\\evil.example"],
    ["an encoded //", "%2F%2Fevil.example"],
    ["an encoded path inside", "/en/account%2F..%2Fadmin"],
    ["a dot segment", "/en/account/../admin"],
    ["a scheme", "javascript:alert(1)"],
    ["a query", "/en/checkout?next=//evil"],
    ["a fragment", "/en/account#x"],
    ["a trailing slash", "/en/account/"],
    ["a control character", "/en/account\n/x"],
    ["a space", "/en/ account"],
    ["the root", "/"],
    ["the empty string", ""],
    ["a very long path", `/en/account/${"a".repeat(600)}`],
  ])("refuses %s", (_label, path) => {
    expect(isSafeReturnPath(path)).toBe(false);
  });

  it.each([
    "/en/admin",
    "/en/checkout/pay",
    "/xx/account",
    "/vendor",
    "/admin",
  ])(
    "the buyer pattern refuses %s, a safe path outside the allowed targets",
    (path) => {
      expect(isSafeReturnPath(path)).toBe(true);
      expect(buyerReturnTo(path)).toBe(false);
    },
  );
});

describe("pagesOf(locale)", () => {
  it("gives the locale's pages for each launch locale", () => {
    for (const locale of LOCALES) {
      expect(buyer().pagesOf(locale)).toEqual({
        signIn: `/${locale}/account`,
        confirm: `/${locale}/account/sign-in/confirm`,
        home: `/${locale}/account`,
      });
    }
  });

  it.each(["", "EN", "../admin", "en/../admin", "e", "x".repeat(40), "/en"])(
    "falls back to the default pages for the locale %j",
    (locale) => {
      expect(buyer().pagesOf(locale)).toEqual(BUYER.pages);
    },
  );

  it("falls back when pagesFor answers something that is not a set of site paths, or throws", () => {
    const evil = buyer({
      pagesFor: () => ({
        signIn: "//evil.example/account",
        confirm: "/en/account/sign-in/confirm",
        home: "/en/account",
      }),
    });
    expect(evil.pagesOf("de")).toEqual(BUYER.pages);
    const throwing = buyer({
      pagesFor: () => {
        throw new Error("no such locale");
      },
    });
    expect(throwing.pagesOf("de")).toEqual(BUYER.pages);
  });

  it("is the fixed pages on a surface without pagesFor (admin)", () => {
    expect(createAdminAuth({ secret: () => "x" }).pagesOf("de")).toEqual(
      ADMIN_SURFACE.pages,
    );
  });

  it("puts the locale into the sign-in page's state location", () => {
    expect(buyer().signInLocation("sent", "de")).toBe("/de/account?state=sent");
    expect(buyer().signInLocation("expired")).toBe("/en/account?state=expired");
  });
});

describe("requestSignIn with a locale and a return path", () => {
  const COOKIE_SET =
    "__Secure-fo-buyer.callback-url=/de/checkout; Path=/; Max-Age=3600; Secure; HttpOnly; SameSite=Lax";
  const COOKIE_CLEARED =
    "__Secure-fo-buyer.callback-url=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax";

  it("answers 303 to the locale's sent state and stores an admitted return path", async () => {
    const response = await buyer().requestSignIn(
      form({ email: "a@example.test" }),
      {
        locale: "de",
        returnTo: "/de/checkout",
      },
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/de/account?state=sent");
    expect(response.headers.getSetCookie()).toEqual([COOKIE_SET]);
  });

  it("answers byte-identical bytes for two different addresses", async () => {
    const options = { locale: "de", returnTo: "/de/checkout" };
    const one = await snapshot(
      await buyer().requestSignIn(
        form({ email: "known@example.test" }),
        options,
      ),
    );
    const two = await snapshot(
      await buyer().requestSignIn(
        form({ email: "Anna+gifts@Example.TEST" }),
        options,
      ),
    );
    expect(two).toEqual(one);
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "%2F%2Fevil.example",
    "/en/admin",
  ])(
    "stores nothing for %s, and clears an earlier return path",
    async (path) => {
      const response = await buyer().requestSignIn(
        form({ email: "a@example.test" }),
        {
          locale: "de",
          returnTo: path,
        },
      );
      expect(response.headers.get("location")).toBe("/de/account?state=sent");
      expect(response.headers.getSetCookie()).toEqual([COOKIE_CLEARED]);
    },
  );

  it("clears the return path when the request names none", async () => {
    const response = await buyer().requestSignIn(
      form({ email: "a@example.test" }),
      {
        locale: "pl",
      },
    );
    expect(response.headers.get("location")).toBe("/pl/account?state=sent");
    expect(response.headers.getSetCookie()).toEqual([COOKIE_CLEARED]);
  });

  it("an admin request carries no callback cookie, whatever options it is given", async () => {
    const admin = createAdminAuth({
      secret: () => "x",
      defer: () => undefined,
    });
    const plain = await admin.requestSignIn(
      new Request(`${ORIGIN}/admin/api/auth/request`, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          host: "www.example.test",
          origin: ORIGIN,
        },
        body: "email=a%40example.test",
      }),
      { locale: "de", returnTo: "/admin/users" },
    );
    expect(plain.headers.get("location")).toBe("/admin/sign-in?state=sent");
    expect(plain.headers.getSetCookie()).toEqual([]);
  });
});
