/**
 * The buyer surface (spec 018 §14 A-founder-2026-10-22 C.3, C.4; AC-47 surface half, AC-48's
 * response half, AC-50's return paths; TASK-344), without a database:
 *
 *  - the buyer configuration parses on the core and names the C.3 cookies, base path and pages;
 *  - `isBuyerReturnPath` admits `/{locale}/account` and below and `/{locale}/checkout`, and refuses
 *    another origin, `//`, a backslash, an encoded scheme and any other path;
 *  - `isBuyerAllowedAddress` and `addressForCore`: open sign-up except the `invalid` TLD; an entry
 *    with the address shape that spec 012's schema refuses goes on as an address the predicate
 *    refuses; the global cap does the same;
 *  - `requestBuyerSignIn` answers the six address cases of AC-48 with the same bytes, before
 *    anything address-dependent ran, and only the first three reach the send.
 */
import { describe, expect, it } from "vitest";

import {
  BUYER_SURFACE,
  REFUSED_ADDRESS,
  addressForCore,
  buyerPages,
  createBuyerAuth,
  isBuyerAllowedAddress,
  isBuyerReturnPath,
  requestBuyerSignIn,
  signInHref,
} from "../../src/lib/auth/buyer.ts";
import { AuthSurfaceSchema } from "../../src/lib/auth/schema.ts";
import { renderAccountSignInEmail } from "../../src/modules/notifications/emails/account-sign-in.ts";
import type { Mailer } from "../../src/modules/notifications/mailer.ts";

const ORIGIN = "https://www.example.test";

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

describe("the buyer configuration (AC-47 surface half)", () => {
  it("parses on the core with the C.3 names, base path and per-locale pages", () => {
    const parsed = AuthSurfaceSchema.parse(BUYER_SURFACE);
    expect(parsed.name).toBe("buyer");
    expect(parsed.basePath).toBe("/api/auth/buyer");
    expect(parsed.cookiePath).toBe("/");
    expect(parsed.cookiePrefix).toBe("__Secure-fo-buyer");
    expect(parsed.sessionMaxAgeSeconds).toBe(30 * 24 * 60 * 60);
    expect(parsed.rolling).toBe(true);
    expect(parsed.mailTag).toBe("buyer_sign_in");
    expect(buyerPages("pl")).toEqual({
      signIn: "/pl/account",
      confirm: "/pl/account/sign-in/confirm",
      home: "/pl/account",
    });
  });

  it("names the three cookies with the __Secure- prefix and no __Host- name", () => {
    const auth = createBuyerAuth({ defer: () => undefined });
    expect(auth.cookies).toEqual({
      sessionToken: "__Secure-fo-buyer.session-token",
      csrfToken: "__Secure-fo-buyer.csrf-token",
      callbackUrl: "__Secure-fo-buyer.callback-url",
    });
    expect(auth.pagesOf("de").home).toBe("/de/account");
  });
});

describe("return paths (AC-50)", () => {
  it.each([
    "/en/account",
    "/en-gb/account/orders/FO-AB12-CD34",
    "/pl/checkout",
  ])("admits %s", (path) => {
    expect(isBuyerReturnPath(path)).toBe(true);
  });

  it.each([
    "https://evil",
    "//evil",
    "/\\evil",
    "%2F%2Fevil",
    "/en/admin",
    "/en/account/sign-in/confirm",
    "/en/checkout/done",
    "/xx/account",
    "/en/account/",
    "/en/account?x=1",
  ])("refuses %s", (path) => {
    expect(isBuyerReturnPath(path)).toBe(false);
  });

  it("carries an admitted return path to the sign-in page and drops any other", () => {
    expect(signInHref("de", "/de/account/orders/FO-AB12-CD34")).toBe(
      "/de/account?return=%2Fde%2Faccount%2Forders%2FFO-AB12-CD34",
    );
    expect(signInHref("de", "//evil")).toBe("/de/account");
    expect(signInHref("zz")).toBe("/en/account");
  });
});

describe("who may receive a link (C.4, AC-48)", () => {
  it("admits any well-formed address but one under the invalid TLD", () => {
    expect(isBuyerAllowedAddress("anna+gifts@example.test")).toBe(true);
    expect(isBuyerAllowedAddress("redacted+1@invalid")).toBe(false);
    expect(isBuyerAllowedAddress("someone@shop.invalid")).toBe(false);
    expect(isBuyerAllowedAddress(REFUSED_ADDRESS)).toBe(false);
  });

  it("hands the core the address, a refused address, or nothing", async () => {
    const open = () => Promise.resolve(false);
    const full = () => Promise.resolve(true);
    expect(await addressForCore(" Anna+Gifts@Example.TEST ", open)).toBe(
      "anna+gifts@example.test",
    );
    expect(await addressForCore("redacted+x@invalid", open)).toBe(
      REFUSED_ADDRESS,
    );
    expect(await addressForCore("zoë@example.test", open)).toBe(
      REFUSED_ADDRESS,
    );
    expect(await addressForCore("anna@example.test", full)).toBe(
      REFUSED_ADDRESS,
    );
    expect(await addressForCore("anna", open)).toBeNull();
    expect(await addressForCore("", open)).toBeNull();
  });
});

describe("POST /api/auth/buyer/request (AC-48 response half)", () => {
  it("answers the six cases with the same bytes, before any send, and sends only for the first three", async () => {
    const tasks: (() => Promise<void>)[] = [];
    const runs: number[] = [];
    const sent: string[] = [];
    const mailer: Mailer = {
      send: (message) => {
        sent.push(message.to);
        return Promise.resolve({ providerRef: "x" });
      },
    } as Mailer;
    const auth = createBuyerAuth({
      defer: (task) => {
        tasks.push(task);
      },
      secret: () => "unit-auth-secret-0123456789abcdef",
      siteOrigin: () => ORIGIN,
      mailer: () => mailer,
      // The send limit's claim is the first database touch of an admitted address.
      run: () => {
        runs.push(tasks.length);
        return Promise.reject(new Error("no database in a unit test"));
      },
    });
    const cases: { email: string; cap: boolean; admitted: boolean }[] = [
      { email: "live-order@example.test", cap: false, admitted: true },
      { email: "demo-order@example.test", cap: false, admitted: true },
      { email: "unknown@example.test", cap: false, admitted: true },
      { email: "redacted+x@invalid", cap: false, admitted: false },
      // The sixth request in an hour is the core's limit, decided after the response.
      { email: "sixth@example.test", cap: false, admitted: true },
      { email: "capped@example.test", cap: true, admitted: false },
    ];
    const answers = [];
    for (const entry of cases) {
      const before = tasks.length;
      const response = await requestBuyerSignIn(
        form({ email: entry.email, locale: "de" }),
        { auth, capReached: () => Promise.resolve(entry.cap) },
      );
      // Written before anything address-dependent: the send is deferred, nothing ran yet.
      expect(tasks.length).toBe(before + 1);
      expect(sent).toEqual([]);
      answers.push(await snapshot(response));
    }
    for (const answer of answers) expect(answer).toEqual(answers[0]);
    expect(answers[0]?.status).toBe(303);
    expect(answers[0]?.headers).toContainEqual([
      "location",
      "/de/account?state=sent",
    ]);
    for (const task of tasks) await task();
    // Refused addresses never reach the send limit's claim; admitted ones do.
    expect(runs.length).toBe(cases.filter((entry) => entry.admitted).length);
  });

  it("stores an admitted return path and clears a hostile one, bytes otherwise equal", async () => {
    const auth = createBuyerAuth({
      defer: () => undefined,
      secret: () => "unit-auth-secret-0123456789abcdef",
      siteOrigin: () => ORIGIN,
    });
    const closed = { auth, capReached: () => Promise.resolve(false) };
    const good = await requestBuyerSignIn(
      form({
        email: "anna@example.test",
        locale: "en",
        return: "/en/account/orders/FO-AB12-CD34",
      }),
      closed,
    );
    expect(good.headers.getSetCookie()[0]).toMatch(
      /^__Secure-fo-buyer\.callback-url=\/en\/account\/orders\/FO-AB12-CD34; Path=\/; Max-Age=3600; Secure; HttpOnly; SameSite=Lax$/u,
    );
    const evil = await requestBuyerSignIn(
      form({ email: "anna@example.test", locale: "en", return: "//evil" }),
      closed,
    );
    expect(evil.headers.getSetCookie()[0]).toMatch(/Max-Age=0/u);
  });

  it("sends an entry with no address shape back to the form with the field error", async () => {
    const auth = createBuyerAuth({ defer: () => undefined });
    const response = await requestBuyerSignIn(
      form({ email: "anna", locale: "pl" }),
      { auth, capReached: () => Promise.resolve(false) },
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/pl/account?state=invalid");
  });
});

describe("T14 (AC-48)", () => {
  it("links with only t, in the requested locale, without saying whether an account exists", () => {
    const link = `${ORIGIN}/en-gb/account/sign-in/confirm?t=${"a".repeat(43)}`;
    const email = renderAccountSignInEmail({ locale: "en-gb", link });
    expect(email.subject).toBe("Your sign-in link");
    expect(email.text).toContain(link);
    expect(email.html).toContain(link.replaceAll("&", "&amp;"));
    expect(email.text).not.toMatch(/@/u);
    expect(email.text).not.toMatch(/partner|florist accept|relay/iu);
  });
});
