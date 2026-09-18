/**
 * The two sitemap route handlers as responses (spec 007 §2 "Sitemaps", §5.2, §5.4, AC-13, AC-14;
 * T-14's route half; TASK-094).
 *
 * The builders are asserted in `tests/unit/seo-sitemap.test.ts`; what is asserted here is
 * everything the *route* is responsible for — the status, the two headers, the absence of a
 * cookie and of a `Vary`, and the 404 shapes a crawler can invent. The environment is swapped
 * around each case because the handlers read `process.env` at request time, which is the property
 * that lets one container image answer correctly on staging and in production (ADR-0018).
 */
import { afterEach, describe, expect, it } from "vitest";

import { CANONICAL_HOST } from "../../src/modules/seo";
import { GET as getChild } from "../../src/app/sitemaps/[locale]/[child]/route.ts";
import { GET as getIndex } from "../../src/app/sitemap.xml/route.ts";

const ORIGINAL = {
  APP_ENV: process.env["APP_ENV"],
  NEXT_PUBLIC_SITE_URL: process.env["NEXT_PUBLIC_SITE_URL"],
};

/** Make the running process look like the one deployment that may announce anything (§6). */
function indexingEnvironment(): void {
  process.env["APP_ENV"] = "production";
  process.env["NEXT_PUBLIC_SITE_URL"] = `https://${CANONICAL_HOST}`;
}

afterEach(() => {
  for (const [key, value] of Object.entries(ORIGINAL)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const child = async (locale: string, name: string): Promise<Response> =>
  getChild(
    new Request(`https://${CANONICAL_HOST}/sitemaps/${locale}/${name}`),
    {
      params: Promise.resolve({ locale, child: name }),
    },
  );

describe("GET /sitemap.xml", () => {
  it("is XML, cached for an hour, with no cookie and no Vary (AC-13, §5.4)", () => {
    const response = getIndex();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^application\/xml/u);
    expect(response.headers.get("cache-control")).toBe("public, max-age=3600");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("vary")).toBeNull();
  });

  it("announces nothing on a deployment that may not be indexed", async () => {
    const body = await getIndex().text();
    expect(body).toContain("<sitemapindex");
    expect(body).not.toContain("<loc>");
  });

  it("lists one child index per announced locale once indexing is on", async () => {
    indexingEnvironment();
    const body = await getIndex().text();
    expect(body).toContain(
      `<loc>https://${CANONICAL_HOST}/sitemaps/en/index.xml</loc>`,
    );
    expect(body).toContain(
      `<loc>https://${CANONICAL_HOST}/sitemaps/en-gb/index.xml</loc>`,
    );
    expect(body).not.toContain("/sitemaps/de/");
    expect(body).not.toContain("/sitemaps/pl/");
  });
});

describe("GET /sitemaps/{locale}/{child}.xml", () => {
  it("serves the locale index and both children when indexing is on", async () => {
    indexingEnvironment();
    for (const name of ["index.xml", "static.xml", "corridors.xml"]) {
      const response = await child("en", name);
      expect(response.status, name).toBe(200);
      expect(response.headers.get("cache-control")).toBe(
        "public, max-age=3600",
      );
      const body = await response.text();
      expect(body).toContain(
        name === "index.xml" ? "<sitemapindex" : "<urlset",
      );
    }
  });

  it("404s — never redirects — on every shape we do not publish", async () => {
    indexingEnvironment();
    for (const [locale, name] of [
      ["EN", "corridors.xml"],
      ["fr", "corridors.xml"],
      ["de", "corridors.xml"],
      ["en", "products.xml"],
      ["en", "corridors"],
      ["en", "../../etc/passwd"],
    ] as const) {
      const response = await child(locale, name);
      expect(response.status, `${locale}/${name}`).toBe(404);
      expect(response.headers.get("location")).toBeNull();
    }
  });

  it("404s on every child of a deployment that may not be indexed", async () => {
    for (const name of ["index.xml", "static.xml", "corridors.xml"]) {
      expect((await child("en", name)).status, name).toBe(404);
    }
  });
});
