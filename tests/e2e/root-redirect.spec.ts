/**
 * T-07 as spec 003 §14 A16 clause 6 restates it (AC-7; TASK-119): `/` answers one permanent 308
 * to `/en`, the same for every request.
 *
 * `GET /` and `HEAD /` are sent in five variants: plain, with `fo_locale=de`, with
 * `Accept-Language: de-DE,de;q=0.9`, with `cf-ipcountry: PL`, and with a Googlebot user agent.
 * Each must answer **308** exactly (not "a 3xx"), with a `Location` that resolves to `/en` on the
 * same origin, zero `Set-Cookie`, and a `Vary` that is absent or names neither `Cookie` nor
 * `Accept-Language`. A `has` condition on the rule, a `Vary` header rule for `/`, a cookie- or
 * header-driven branch, or a deleted rule each turns at least one variant red. The deep-equal on
 * the rule itself is `tests/unit/root-redirect.test.ts`.
 *
 * The locale homes and the 404 must not link to `/`, which is now a redirect hop (A16 clause 3).
 */
import { expect, test } from "@playwright/test";

import { NO_LOCALE_CHOICE } from "../support/locale-choice.ts";

// A first visit: the config seeds `fo_locale` for every other suite, and this one sends its own.
test.use({ storageState: NO_LOCALE_CHOICE });

const GOOGLEBOT =
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

const VARIANTS: readonly {
  readonly name: string;
  readonly headers: Readonly<Record<string, string>>;
}[] = [
  { name: "plain", headers: {} },
  { name: "with fo_locale=de", headers: { cookie: "fo_locale=de" } },
  {
    name: "with Accept-Language: de-DE",
    headers: { "accept-language": "de-DE,de;q=0.9" },
  },
  { name: "with cf-ipcountry: PL", headers: { "cf-ipcountry": "PL" } },
  { name: "as Googlebot", headers: { "user-agent": GOOGLEBOT } },
];

for (const method of ["GET", "HEAD"] as const) {
  for (const variant of VARIANTS) {
    test(`${method} / ${variant.name} → 308 to /en, no cookie, no varying`, async ({
      request,
      baseURL,
    }) => {
      const response = await request.fetch("/", {
        method,
        headers: variant.headers,
        maxRedirects: 0,
      });

      expect(response.status()).toBe(308);

      const location = response.headers()["location"];
      expect(location, "a Location header").toBeDefined();
      const origin = new URL(baseURL ?? "http://localhost:3000");
      const target = new URL(location ?? "", origin);
      expect(target.origin).toBe(origin.origin);
      expect(target.pathname).toBe("/en");

      const setCookie = response
        .headersArray()
        .filter((header) => header.name.toLowerCase() === "set-cookie");
      expect(setCookie).toEqual([]);

      const vary = (response.headers()["vary"] ?? "").toLowerCase();
      expect(vary).not.toContain("cookie");
      expect(vary).not.toContain("accept-language");
    });
  }
}

test("passes a query string through to /en", async ({ request }) => {
  const response = await request.get("/?ref=x", { maxRedirects: 0 });
  expect(response.status()).toBe(308);
  const target = new URL(
    response.headers()["location"] ?? "",
    "http://placeholder.invalid",
  );
  expect(target.pathname).toBe("/en");
  expect(target.searchParams.get("ref")).toBe("x");
});

test("following the redirect lands on the English home, which answers 200", async ({
  page,
}) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe("/en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

for (const path of ["/en", "/en-gb", "/de", "/pl", "/nope"]) {
  test(`${path} links nowhere to the bare origin (A16 clause 3)`, async ({
    request,
  }) => {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(path === "/nope" ? 404 : 200);
    const html = await response.text();
    expect(html).not.toMatch(/href="\/"/u);
    expect(html).not.toMatch(/href="\/[?#][^"]*"/u);
  });
}
