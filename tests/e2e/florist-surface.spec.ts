/**
 * The florist surface on the served origin (spec 011 AC-21, AC-22, AC-32; T-21, T-22 and T-32,
 * e2e halves; TASK-212).
 *
 * What CI's preview can prove: it is `next start` over the build with `.env.example`'s
 * placeholders, `APP_ENV` unset (so `development`, where `signInPolicy` is `["demo"]` and the
 * surface is open) and **no database**. So this spec asserts what needs no row:
 *
 *  - T-22: every florist response carries `noindex` and `private, no-store`; the inbox without a
 *    session goes to sign-in; Auth.js's own endpoints answer 404; the sign-in request answers the
 *    same `303` for any two addresses, with no address in the `Location`; the sign-in page makes no
 *    GA4 request and loads no consent island.
 *  - T-21: six public page types answer the same status, headers and body with a florist session
 *    cookie as without one, with no `Set-Cookie` and no `Vary: Cookie`.
 *  - T-32: `?hl=` decides the document's language before sign-in; `Accept-Language` does not.
 *
 * The signed-in halves (T-19's cookie flags on a real sign-in, T-20's membership removal, T-32's
 * stored language) need a database and run at the handler level in
 * `tests/integration/florist-auth.test.ts`, the precedent of spec 012's T-11 (TASK-217).
 */
import { expect, test, type APIResponse } from "@playwright/test";

import { FLORIST_PATHS } from "@/config/florists";

function expectFloristHeaders(response: APIResponse, what: string): void {
  const headers = response.headers();
  expect(headers["x-robots-tag"], what).toMatch(/noindex/u);
  expect(headers["cache-control"], what).toMatch(/private/u);
  expect(headers["cache-control"], what).toMatch(/no-store/u);
}

test.describe("the florist surface (spec 011 AC-22, T-22)", () => {
  test("sign-in, confirm and the inbox are noindex and private, no-store; no session goes to sign-in", async ({
    request,
  }) => {
    for (const path of [FLORIST_PATHS.signIn, FLORIST_PATHS.confirm]) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(200);
      expectFloristHeaders(response, path);
      expect(await response.text(), path).toMatch(
        /<meta name="robots" content="noindex,\s?nofollow"/u,
      );
    }
    const inbox = await request.get(FLORIST_PATHS.base, { maxRedirects: 0 });
    expect([303, 307]).toContain(inbox.status());
    expect(inbox.headers()["location"]).toMatch(
      new RegExp(`${FLORIST_PATHS.signIn}$`, "u"),
    );
    expectFloristHeaders(inbox, FLORIST_PATHS.base);
  });

  test("Auth.js's own endpoints answer 404 under the base path", async ({
    request,
  }) => {
    for (const path of ["session", "signin", "providers", "callback/email"]) {
      const response = await request.get(`${FLORIST_PATHS.authBase}/${path}`);
      expect(response.status(), path).toBe(404);
      expectFloristHeaders(response, path);
    }
  });

  test("a sign-in request answers the same 303 for any address, and no Location carries one", async ({
    request,
  }) => {
    const answers = [];
    for (const email of ["someone@example.test", "nobody@example.test"]) {
      const response = await request.post(FLORIST_PATHS.request, {
        form: { email, hl: "pl" },
        maxRedirects: 0,
      });
      answers.push({
        status: response.status(),
        location: response.headers()["location"],
        body: await response.text(),
      });
    }
    expect(answers[0]).toEqual(answers[1]);
    expect(answers[0]?.status).toBe(303);
    expect(answers[0]?.location).toBe(
      `${FLORIST_PATHS.signIn}?state=sent&hl=pl`,
    );
    expect(answers[0]?.location).not.toContain("@");
  });

  test("the sign-in page makes no GA4 request and has no consent island", async ({
    page,
  }) => {
    const requested: string[] = [];
    page.on("request", (request) => requested.push(request.url()));
    await page.goto(FLORIST_PATHS.signIn);
    await expect(page.locator("h1")).toBeVisible();
    expect(
      requested.filter((url) =>
        /googletagmanager|google-analytics|\/g\/collect/u.test(url),
      ),
    ).toEqual([]);
    await expect(page.locator("[data-consent], #consent-banner")).toHaveCount(
      0,
    );
  });
});

test.describe("public pages ignore a florist session (spec 011 AC-21, T-21)", () => {
  // Home, corridor guide, shop root, product, a trust page, and the for-florists landing (its
  // page is TASK-210's; until it ships the path answers the same 404 either way).
  const PUBLIC = [
    "/en-gb",
    "/en-gb/send-flowers-to/poland",
    "/en-gb/poland/flowers",
    "/en-gb/poland/product/amber-hour",
    "/en/help",
    "/en/for-florists",
  ];
  const COOKIE = "__Secure-fo-florist.session-token=florist.e2e-not-a-session";

  /** Headers a server may legitimately vary per response. */
  const PER_RESPONSE = new Set([
    "date",
    "x-request-id",
    "age",
    "x-nextjs-stale-time",
    "x-nextjs-cache",
    "x-vercel-cache",
    "cf-ray",
    "cf-cache-status",
    "server-timing",
    "keep-alive",
    "connection",
  ]);

  for (const path of PUBLIC) {
    test(`${path}: identical with and without the florist cookie`, async ({
      request,
    }) => {
      const plain = await request.get(path, { maxRedirects: 0 });
      const withCookie = await request.get(path, {
        maxRedirects: 0,
        headers: { cookie: COOKIE },
      });
      expect(withCookie.status()).toBe(plain.status());
      const shape = (response: APIResponse) =>
        Object.entries(response.headers())
          .filter(([name]) => !PER_RESPONSE.has(name))
          .sort();
      expect(shape(withCookie)).toEqual(shape(plain));
      expect(withCookie.headers()["set-cookie"]).toBeUndefined();
      expect(withCookie.headers()["vary"] ?? "").not.toMatch(/cookie/iu);
      // A nonce or a per-request id in the markup would differ between any two responses.
      const body = async (response: APIResponse) =>
        (await response.text()).replace(/nonce="[^"]*"/gu, 'nonce=""');
      expect(await body(withCookie)).toBe(await body(plain));
    });
  }
});

test.describe("the language before sign-in (spec 011 AC-32, T-32)", () => {
  test("?hl= decides the document's language; Accept-Language does not", async ({
    request,
  }) => {
    const lang = async (path: string, headers: Record<string, string> = {}) =>
      /<html[^>]*\slang="([^"]+)"/u.exec(
        await (await request.get(path, { headers })).text(),
      )?.[1];
    expect(await lang(`${FLORIST_PATHS.signIn}?hl=pl`)).toBe("pl");
    expect(await lang(`${FLORIST_PATHS.signIn}?hl=de`)).toBe("de");
    expect(await lang(FLORIST_PATHS.signIn)).toBe("en");
    expect(
      await lang(FLORIST_PATHS.signIn, { "accept-language": "pl-PL,pl;q=0.9" }),
    ).toBe("en");
    expect(await lang(`${FLORIST_PATHS.signIn}?hl=fr`)).toBe("en");
  });
});
