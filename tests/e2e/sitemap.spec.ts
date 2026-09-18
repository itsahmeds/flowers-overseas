/**
 * T-15 — every URL in every sitemap is fetched, and the sitemap never intersects the `noindex`
 * set (spec 007 §2 "Sitemaps", §5.4, AC-13, AC-14; TASK-094).
 *
 * **No sampling.** The suite walks the tree the way a crawler does — `/sitemap.xml` → each locale
 * index → each child → every `<loc>` — and fetches all of it. That is AC-14's wording and it is
 * also the only version of the test worth having: the URL a sampled run would have skipped is
 * exactly the one a wrong `generateStaticParams` broke.
 *
 * **The origin is swapped for the deployment's.** A sitemap carries absolute `https://` URLs
 * pointing at the canonical host (that is what makes it a sitemap), and this suite runs against
 * `PLAYWRIGHT_BASE_URL`. Every fetch therefore keeps the path and takes the base URL's origin,
 * which is what the crawl is about; that the origin is right is asserted separately, on the
 * string.
 *
 * **Both deployments are real answers.** Until TASK-096's flip nothing is indexable anywhere
 * (§6), so the honest sitemap is an empty index and the intersection with the `noindex` set is
 * empty because the sitemap is. The suite asserts *that pairing* rather than skipping: an empty
 * index is only correct while the corridor documents say `noindex`, and if one of them ever says
 * `index,follow` while the sitemap stays empty, this fails. Run the same suite against a build
 * whose `APP_ENV=production` and `NEXT_PUBLIC_SITE_URL=https://flowersoverseas.com` and it walks
 * the full sixteen-URL set instead, with every assertion below doing real work — which is how
 * AC-13 and AC-14 were observed for this task (recorded in the PR).
 */
import { expect, test, type APIRequestContext } from "@playwright/test";

/** One corridor URL that exists in every deployment — the control for the empty-index case. */
const CONTROL_PAGE = "/en/send-flowers-to/poland";

const loc = (xml: string): string[] =>
  [...xml.matchAll(/<loc>([^<]+)<\/loc>/gu)].map((match) =>
    (match[1] ?? "").trim(),
  );

/** The `xhtml:link` pairs of one `<url>` block, in document order. */
const alternatesOf = (urlBlock: string): { hreflang: string; href: string }[] =>
  [
    ...urlBlock.matchAll(
      /<xhtml:link\s+rel="alternate"\s+hreflang="([^"]+)"\s+href="([^"]+)"\s*\/>/gu,
    ),
  ].map((match) => ({ hreflang: match[1] ?? "", href: match[2] ?? "" }));

/** The `<url>` blocks of a `<urlset>`, keyed by `<loc>`. */
function urlBlocks(xml: string): Map<string, string> {
  const blocks = new Map<string, string>();
  for (const match of xml.matchAll(/<url>([\s\S]*?)<\/url>/gu)) {
    const block = match[1] ?? "";
    const [url] = loc(block);
    if (url !== undefined) blocks.set(url, block);
  }
  return blocks;
}

/** The `<head>` cluster of a served document, in document order. */
const headCluster = (html: string): { hreflang: string; href: string }[] =>
  [
    ...html.matchAll(
      /<link[^>]+rel="alternate"[^>]*>|<link[^>]+rel='alternate'[^>]*>/gu,
    ),
  ]
    .map((match) => match[0])
    .filter((tag) => /hreflang=/u.test(tag))
    .map((tag) => ({
      hreflang: /hreflang="([^"]+)"/u.exec(tag)?.[1] ?? "",
      href: /href="([^"]+)"/u.exec(tag)?.[1] ?? "",
    }));

const metaRobots = (html: string): string[] =>
  [
    ...html.matchAll(
      /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["'][^>]*>/gi,
    ),
  ].map((match) => match[1] ?? "");

/** Fetch an absolute sitemap URL from *this* deployment: its path, our origin. */
async function fetchHere(
  request: APIRequestContext,
  baseURL: string,
  absolute: string,
): Promise<{ status: number; body: string; headers: Record<string, string> }> {
  const { pathname } = new URL(absolute);
  const response = await request.get(new URL(pathname, baseURL).toString(), {
    maxRedirects: 0,
  });
  return {
    status: response.status(),
    body: await response.text(),
    headers: response.headers(),
  };
}

test.describe("sitemaps, as served (AC-13, AC-14; T-15)", () => {
  test("the index is XML, cached for an hour, with no cookie and no Vary", async ({
    request,
  }) => {
    const response = await request.get("/sitemap.xml", { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    const headers = response.headers();
    expect(headers["content-type"]).toMatch(/xml/u);
    expect(headers["cache-control"]).toBe("public, max-age=3600");
    expect(headers["set-cookie"]).toBeUndefined();
    expect(headers["vary"]).toBeUndefined();
    expect(await response.text()).toContain("<sitemapindex");
  });

  test("every sitemap URL answers 200, and none of them is noindex", async ({
    request,
    baseURL,
  }) => {
    const base = baseURL ?? "";
    const index = await request.get("/sitemap.xml", { maxRedirects: 0 });
    expect(index.status()).toBe(200);
    const indexXml = await index.text();

    // Level 2 and 3: every child document announced by the level above must exist.
    const pageUrls = new Map<string, string>();
    for (const localeIndexUrl of loc(indexXml)) {
      expect(localeIndexUrl.startsWith("https://")).toBe(true);
      const localeIndex = await fetchHere(request, base, localeIndexUrl);
      expect(localeIndex.status, localeIndexUrl).toBe(200);
      expect(localeIndex.body).toContain("<sitemapindex");

      for (const childUrl of loc(localeIndex.body)) {
        const child = await fetchHere(request, base, childUrl);
        expect(child.status, childUrl).toBe(200);
        expect(child.headers["cache-control"]).toBe("public, max-age=3600");
        expect(child.body).toContain("<urlset");
        // Spec 007 §2's cap, observed on the served document.
        expect(Buffer.byteLength(child.body, "utf8")).toBeLessThanOrEqual(
          10 * 1024 * 1024,
        );
        for (const [url, block] of urlBlocks(child.body)) {
          expect(loc(child.body).length).toBeLessThanOrEqual(10_000);
          pageUrls.set(url, block);
        }
      }
    }

    // AC-14, both halves: every announced URL is a 200 document, and none of them says
    // `noindex` — which is the intersection with the `noindex` set, computed rather than assumed.
    for (const [url, block] of pageUrls) {
      const page = await fetchHere(request, base, url);
      expect(page.status, url).toBe(200);
      for (const directive of metaRobots(page.body)) {
        expect(directive, url).not.toContain("noindex");
      }
      // AC-11 on the served bytes: the `<head>` cluster is the row's `xhtml:link` set.
      expect(headCluster(page.body), url).toEqual(alternatesOf(block));
    }

    // The empty case is an answer, not an absence: a deployment that announces nothing must be
    // one whose documents say `noindex` (§6, §12). Asserted here so "empty" can never be a way
    // for a broken builder to pass this suite.
    if (pageUrls.size === 0) {
      const control = await request.get(CONTROL_PAGE, { maxRedirects: 0 });
      expect(control.status()).toBe(200);
      expect(metaRobots(await control.text())).toEqual(["noindex,follow"]);
    }
  });

  test("an unknown locale, an unknown child and a bare name are 404s, never redirects", async ({
    request,
  }) => {
    for (const path of [
      "/sitemaps/fr/corridors.xml",
      "/sitemaps/EN/corridors.xml",
      "/sitemaps/en/products.xml",
      "/sitemaps/en/corridors",
    ]) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(404);
      expect(response.headers()["location"], path).toBeUndefined();
    }
  });
});
