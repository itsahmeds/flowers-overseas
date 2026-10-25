/**
 * The country chooser end to end (spec 004 §14 A-founder-2026-10-24a item 3; T-83, T-84, T-85,
 * T-95, T-96; AC-77, AC-78, AC-79, AC-89, AC-90; TASK-385).
 *
 * HTTP first (no redirect is followed, so every `303` and `Set-Cookie` is seen as sent), then the
 * browser with JavaScript on and off for the history and the cookie. A `fo_locale` cookie keeps the
 * first-visit language popup closed in the browser cases; it is not read by the chooser.
 */
import {
  type APIRequestContext,
  type BrowserContext,
  expect,
  test,
} from "@playwright/test";

const CHOOSER = "/en/choose-country";
const PRODUCT_NEXT = "/product/vistula-red";

/** Every `next` shape of item 3 in `en`, and where a choice of Poland lands. */
const SHAPES: readonly { next: string; poland: string }[] = [
  { next: "", poland: "/en/poland/flowers" },
  { next: "/flowers/roses", poland: "/en/poland/flowers/roses" },
  {
    next: "/occasions/birthday",
    poland: "/en/poland/flowers/birthday-flowers",
  },
  { next: PRODUCT_NEXT, poland: "/en/poland/product/vistula-red" },
  { next: "/price/low", poland: "/en/poland/flowers?price=low" },
  { next: "/search", poland: "/en/poland/flowers" },
];

/** Today's shop countries in `en` and their shop roots. */
const SHOP: readonly { code: string; root: string }[] = [
  { code: "fr", root: "/en/france/flowers" },
  { code: "de", root: "/en/germany/flowers" },
  { code: "it", root: "/en/italy/flowers" },
  { code: "nl", root: "/en/netherlands/flowers" },
  { code: "pl", root: "/en/poland/flowers" },
  { code: "ro", root: "/en/romania/flowers" },
  { code: "es", root: "/en/spain/flowers" },
];

const cookieLine = (code: string): string =>
  `fo_dest=${code}; Max-Age=15552000; Path=/; SameSite=Lax; Secure`;

async function get(
  request: APIRequestContext,
  url: string,
  headers: Record<string, string> = {},
): Promise<{
  status: number;
  location: string | undefined;
  setCookies: string[];
  headers: Record<string, string>;
  html: string;
}> {
  const response = await request.get(url, { maxRedirects: 0, headers });
  return {
    status: response.status(),
    location: response.headers()["location"],
    setCookies: response
      .headersArray()
      .filter((header) => header.name.toLowerCase() === "set-cookie")
      .map((header) => header.value),
    headers: response.headers(),
    html: response.status() === 200 ? await response.text() : "",
  };
}

/** The path of a `Location`, absolute or not. */
const pathOf = (location: string | undefined): string | undefined =>
  location === undefined
    ? undefined
    : (() => {
        const url = new URL(location, "http://x.test");
        return `${url.pathname}${url.search}`;
      })();

async function keepPopupClosed(
  context: BrowserContext,
  baseURL: string | undefined,
): Promise<void> {
  await context.addCookies([
    { name: "fo_locale", value: "en", url: baseURL ?? "http://localhost:3000" },
  ]);
}

test.describe("the chooser page (AC-77, T-83)", () => {
  for (const { next } of SHAPES) {
    test(`${CHOOSER}${next} is its own noindex, uncached page with no dialog`, async ({
      request,
    }) => {
      const page = await get(request, `${CHOOSER}${next}`);
      expect(page.status).toBe(200);
      expect(page.setCookies).toEqual([]);
      expect(page.headers["x-robots-tag"]).toBe("noindex, nofollow");
      expect(page.headers["cache-control"]).toMatch(/\bprivate\b/u);
      expect(page.headers["cache-control"]).toMatch(/\bno-store\b/u);
      expect(page.html).toMatch(
        /<meta name="robots" content="noindex, nofollow"\s*\/?>/u,
      );
      expect(page.html.match(/<h1\b/gu)).toHaveLength(1);
      expect(page.html).toMatch(
        /<h1[^>]*>Where should the flowers go\?<\/h1>/u,
      );
      expect(page.html).toContain("<main");
      expect(page.html).not.toMatch(/role="dialog"|aria-modal|<dialog\b/u);
      expect(page.html.match(/<option value="/gu)).toHaveLength(7);
      expect(page.html).toContain(
        "We will remember this country on this device. Change it any time under Sending to.",
      );
    });
  }

  test("with a remembered country it answers 200, never 3xx, Continue first", async ({
    request,
  }) => {
    const page = await get(request, `${CHOOSER}${PRODUCT_NEXT}`, {
      cookie: "fo_dest=fr",
    });
    expect(page.status).toBe(200);
    expect(page.location).toBeUndefined();
    expect(page.setCookies).toEqual([]);
    const firstButton = /<button\b[^>]*>([^<]*)<\/button>/u.exec(page.html);
    expect(firstButton?.[1]).toBe("Continue to France");
  });

  test("its URLs carry no personal data: path-only next, no query in any chooser link", async ({
    request,
  }) => {
    const page = await get(request, `${CHOOSER}${PRODUCT_NEXT}?to=Swedn`);
    const links = [
      ...page.html.matchAll(/href="([^"]*choose-country[^"]*)"/gu),
    ].map((match) => match[1] ?? "");
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link, link).not.toMatch(/[?@]|\d{3,}/u);
    }
  });
});

test.describe("the choice (AC-78, T-84)", () => {
  for (const { code, root } of SHOP) {
    test(`choosing ${code} by button answers 303 to its shop root with one fo_dest`, async ({
      request,
    }) => {
      const answer = await get(request, `${CHOOSER}?to=${code}&to=`);
      expect(answer.status).toBe(303);
      expect(pathOf(answer.location)).toBe(root);
      expect(answer.setCookies).toEqual([cookieLine(code)]);
      expect(answer.headers["cache-control"]).toBe("private, no-store");
    });
  }

  for (const { next, poland } of SHAPES) {
    test(`Poland by name, code and path form from ${CHOOSER}${next}`, async ({
      request,
    }) => {
      for (const url of [
        `${CHOOSER}${next}?to=fr&to=Polska`,
        `${CHOOSER}${next}?to=Poland`,
        `${CHOOSER}${next}?to=pl`,
        `${CHOOSER}/pl${next}`,
      ]) {
        const answer = await get(request, url);
        expect(answer.status, url).toBe(303);
        expect(pathOf(answer.location), url).toBe(poland);
        expect(answer.setCookies, url).toEqual([cookieLine("pl")]);
      }
    });
  }

  test("an unknown name lists the closest names and every shop country, with no cookie", async ({
    request,
  }) => {
    const page = await get(request, `${CHOOSER}${PRODUCT_NEXT}?to=Swedn`);
    expect(page.status).toBe(200);
    expect(page.setCookies).toEqual([]);
    expect(page.html).toContain("We could not find “Swedn”.");
    expect(page.html).toMatch(
      /Did you mean <a[^>]*href="\/en\/choose-country\/es\/product\/vistula-red"[^>]*rel="nofollow"[^>]*>Spain<\/a>\?/u,
    );
    expect(page.html.match(/data-fo-choose-country="[a-z]{2}"/gu)).toHaveLength(
      7,
    );
  });

  test("choosing Germany on /pl keeps /pl (AC-89)", async ({ request }) => {
    const answer = await get(request, "/pl/wybierz-kraj?to=de");
    expect(answer.status).toBe(303);
    expect(pathOf(answer.location)).toBe("/pl/niemcy/kwiaty");
  });
});

test.describe("no guessing (AC-89, T-95)", () => {
  const VARIANTS: readonly Record<string, string>[] = [
    { "cf-ipcountry": "DE" },
    { "accept-language": "pl-PL,pl;q=0.9" },
    { "x-forwarded-for": "81.2.69.160" },
    { "user-agent": "Googlebot/2.1 (+http://www.google.com/bot.html)" },
  ];

  test("every answer is the same whatever the geography, language or agent", async ({
    request,
  }) => {
    for (const url of [
      `${CHOOSER}${PRODUCT_NEXT}?to=pl`,
      `${CHOOSER}/de/flowers/roses`,
    ]) {
      const plain = await get(request, url);
      for (const headers of VARIANTS) {
        const varied = await get(request, url, headers);
        expect(varied.status, JSON.stringify(headers)).toBe(plain.status);
        expect(varied.location, JSON.stringify(headers)).toBe(plain.location);
        expect(varied.setCookies, JSON.stringify(headers)).toEqual(
          plain.setCookies,
        );
      }
    }
    const plain = await get(request, `${CHOOSER}${PRODUCT_NEXT}`);
    const buttonsOf = (html: string): string[] =>
      [...html.matchAll(/<button\b[^>]*>([^<]*)<\/button>/gu)].map(
        (match) => match[1] ?? "",
      );
    for (const headers of VARIANTS) {
      const varied = await get(request, `${CHOOSER}${PRODUCT_NEXT}`, headers);
      expect(buttonsOf(varied.html), JSON.stringify(headers)).toEqual(
        buttonsOf(plain.html),
      );
    }
  });
});

test.describe("the cookie (AC-90, T-96)", () => {
  test("no page view sets fo_dest; only a choice does", async ({ request }) => {
    for (const url of [
      "/en",
      "/en/poland/flowers",
      "/en/occasions",
      `${CHOOSER}${PRODUCT_NEXT}`,
      `${CHOOSER}${PRODUCT_NEXT}?to=Swedn`,
      `${CHOOSER}${PRODUCT_NEXT}?to=`,
    ]) {
      const answer = await get(request, url);
      expect(
        answer.setCookies.filter((line) => line.startsWith("fo_dest=")),
        url,
      ).toEqual([]);
    }
  });

  test("document.cookie gains fo_dest only after the choice", async ({
    page,
    context,
    baseURL,
  }) => {
    await keepPopupClosed(context, baseURL);
    await page.goto("/en");
    expect(await page.evaluate(() => document.cookie)).not.toContain("fo_dest");
    await page.goto(`${CHOOSER}${PRODUCT_NEXT}`);
    expect(await page.evaluate(() => document.cookie)).not.toContain("fo_dest");
    await expect(
      page.getByText(
        "We will remember this country on this device. Change it any time under Sending to.",
      ),
    ).toBeVisible();
    await page.getByRole("button", { name: "Poland", exact: true }).click();
    await page.waitForURL("**/en/poland/product/vistula-red");
    expect(await page.evaluate(() => document.cookie)).toContain("fo_dest=pl");
  });
});

test.describe("history, JavaScript on (AC-79, T-85)", () => {
  test("Back from the product page returns to the page before the chooser", async ({
    page,
    context,
    baseURL,
  }) => {
    await keepPopupClosed(context, baseURL);
    await page.goto("/en/occasions");
    await page.goto(`${CHOOSER}${PRODUCT_NEXT}`);
    // The replace lives in the motion module, which loads after the paint.
    await expect(page.locator("html[data-fo-motion]")).toHaveCount(1, {
      timeout: 15_000,
    });
    await page.getByRole("button", { name: "Poland", exact: true }).click();
    await page.waitForURL("**/en/poland/product/vistula-red");
    await page.goBack();
    await page.waitForURL("**/en/occasions");
    expect(new URL(page.url()).pathname).toBe("/en/occasions");
  });

  test("a typed name goes the same way", async ({ page, context, baseURL }) => {
    await keepPopupClosed(context, baseURL);
    await page.goto("/en/occasions");
    await page.goto(`${CHOOSER}${PRODUCT_NEXT}`);
    await expect(page.locator("html[data-fo-motion]")).toHaveCount(1, {
      timeout: 15_000,
    });
    await page.getByLabel("Search all countries").fill("Polska");
    await page.getByLabel("Search all countries").press("Enter");
    await page.waitForURL("**/en/poland/product/vistula-red");
    await page.goBack();
    await page.waitForURL("**/en/occasions");
  });
});

test.describe("history, JavaScript off (AC-79, T-85)", () => {
  test.use({ javaScriptEnabled: false });

  test("Back shows the chooser again with 200 and Continue first, never a redirect", async ({
    page,
    context,
    baseURL,
    request,
  }) => {
    await keepPopupClosed(context, baseURL);
    await page.goto("/en/occasions");
    await page.goto(`${CHOOSER}${PRODUCT_NEXT}`);
    await page.getByRole("button", { name: "Poland", exact: true }).click();
    await page.waitForURL("**/en/poland/product/vistula-red");
    await page.goBack();
    await page.waitForURL(`**${CHOOSER}${PRODUCT_NEXT}`);
    await expect(
      page.getByRole("button", { name: "Continue to Poland" }),
    ).toBeVisible();
    const again = await get(request, `${CHOOSER}${PRODUCT_NEXT}`, {
      cookie: "fo_dest=pl",
    });
    expect(again.status).toBe(200);
    expect(again.location).toBeUndefined();
  });
});
