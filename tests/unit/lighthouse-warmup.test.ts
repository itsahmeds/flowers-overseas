/**
 * `scripts/seo/lighthouse-urls.ts --warm` — the warm-up the blocking `lighthouse` job runs before its
 * measured collect (spec 004 AC-24, §14 A18 "warmed"; spec 001 AC-23; TASK-235).
 *
 * The job's old warm-up `curl`ed each document and nothing else, so the stylesheets, the preloaded
 * fonts, the LCP image's candidates and the script chunks were first fetched by a measured run.
 * What is pinned here is that the warm-up reaches **those**: every same-origin subresource the
 * document names, requested the way Chrome requests it (`br`), each once — and that it fails out
 * loud rather than warming nothing.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  ACCEPT_ENCODING,
  type Fetch,
  warmMain,
  requestHeaders,
  srcsetUrls,
  subresourceUrls,
  warm,
} from "../../scripts/seo/lighthouse-urls.ts";

const BASE = "http://127.0.0.1:3001";

/** The shape `next start` writes, trimmed from `/en` (React's camelCase attribute names kept). */
const HOME = `<!DOCTYPE html><html lang="en"><head>
<link rel="preload" href="/_next/static/media/alegreya_400.woff2" as="font" crossorigin="" type="font/woff2"/>
<link rel="preload" as="image" type="image/avif" fetchPriority="high" imageSrcSet="/media/home-hero/384.avif 384w, /media/home-hero/828.avif 828w" imageSizes="100vw"/>
<link rel="stylesheet" href="/_next/static/chunks/a.css" data-precedence="next"/>
<link rel="stylesheet" href="/_next/static/chunks/b.css" data-precedence="next"/>
<link rel="preload" as="script" fetchPriority="low" href="/_next/static/chunks/low.js"/>
<script src="/_next/static/chunks/main.js" async=""></script>
<link rel="icon" href="/icon.svg" type="image/svg+xml"/>
<link rel="alternate" hrefLang="de" href="/de"/>
<link rel="canonical" href="/en"/>
<script id="fo-consent-mode">window.x=1</script>
</head><body>
<picture><source sizes="100vw" srcSet="/media/home-hero/384.avif 384w, /media/home-hero/1080.avif 1080w" type="image/avif"/>
<img alt="Flowers" fetchPriority="high" src="/media/home-hero/828.avif"/></picture>
<img alt="Remote" srcSet="https://media.flowersoverseas.com/media/fo-bq-001-hero/384.avif 384w" src="https://media.flowersoverseas.com/media/fo-bq-001-hero/384.avif"/>
<img alt="Optimised" src="/_next/image?url=%2Fmedia%2Fa.jpg&amp;w=828&amp;q=75"/>
<img alt="Inline" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="/>
<a href="/en/send-flowers-to">Send</a>
</body></html>`;

const paths = (html: string): string[] =>
  subresourceUrls(html, `${BASE}/en`).map(({ url }) => url.replace(BASE, ""));

describe("which subresources a document names", () => {
  it("lists the stylesheets, preloads, scripts, icon and every image candidate, in document order", () => {
    expect(paths(HOME)).toEqual([
      "/_next/static/media/alegreya_400.woff2",
      "/media/home-hero/384.avif",
      "/media/home-hero/828.avif",
      "/_next/static/chunks/a.css",
      "/_next/static/chunks/b.css",
      "/_next/static/chunks/low.js",
      "/_next/static/chunks/main.js",
      "/icon.svg",
      "/media/home-hero/1080.avif",
      "/_next/image?url=%2Fmedia%2Fa.jpg&w=828&q=75",
    ]);
  });

  it("reaches the LCP image through `imageSrcSet` on the preload, not only through `<img src>`", () => {
    // The preload is what Chrome fetches first for the LCP element (spec 004 AC-46); a parser that
    // read only `href` would leave every candidate of it cold.
    const onlyPreload = `<link rel="preload" as="image" imageSrcSet="/media/x/640.avif 640w, /media/x/828.avif 828w"/>`;
    expect(paths(onlyPreload)).toEqual([
      "/media/x/640.avif",
      "/media/x/828.avif",
    ]);
  });

  it("classifies each one, so it is requested with the `accept` Chrome would send", () => {
    const kinds = Object.fromEntries(
      subresourceUrls(HOME, `${BASE}/en`).map(({ url, kind }) => [
        url.replace(BASE, ""),
        kind,
      ]),
    );
    expect(kinds["/_next/static/chunks/a.css"]).toBe("style");
    expect(kinds["/_next/static/chunks/main.js"]).toBe("script");
    expect(kinds["/_next/static/chunks/low.js"]).toBe("script");
    expect(kinds["/_next/static/media/alegreya_400.woff2"]).toBe("font");
    expect(kinds["/media/home-hero/828.avif"]).toBe("image");
  });

  it("skips other origins, `data:` URLs, links that are not fetched, and the document itself", () => {
    const found = paths(HOME).join(" ");
    expect(found).not.toContain("media.flowersoverseas.com");
    expect(found).not.toContain("data:");
    expect(found).not.toContain("/de");
    expect(found).not.toContain("/en/send-flowers-to");
    expect(
      paths(
        `<link rel="canonical" href="/en"/><link rel="stylesheet" href="/en"/>`,
      ),
    ).toEqual([]);
  });

  it("de-duplicates a URL named twice", () => {
    expect(
      paths(
        `<script src="/a.js"></script><link rel="preload" as="script" href="/a.js"/>`,
      ),
    ).toEqual(["/a.js"]);
  });

  it("reads unquoted and single-quoted attributes and any attribute case", () => {
    expect(
      paths(`<LINK REL=stylesheet HREF=/x.css><script SRC='/y.js'></script>`),
    ).toEqual(["/x.css", "/y.js"]);
  });

  it("splits a srcset into its URLs", () => {
    expect(srcsetUrls("/a.avif 384w, /b.avif 640w,/c.avif 2x")).toEqual([
      "/a.avif",
      "/b.avif",
      "/c.avif",
    ]);
    expect(srcsetUrls("")).toEqual([]);
  });
});

describe("how it requests them", () => {
  it("asks for Brotli on every request, because that is the encoding the measured runs get", () => {
    for (const kind of [
      "document",
      "style",
      "script",
      "font",
      "image",
      "other",
    ] as const) {
      expect(requestHeaders(kind).get("accept-encoding"), kind).toBe(
        ACCEPT_ENCODING,
      );
      expect(ACCEPT_ENCODING.split(",").map((part) => part.trim())).toContain(
        "br",
      );
    }
  });

  it("sends an image `accept` that offers AVIF, so the variant warmed is the one Chrome gets", () => {
    expect(requestHeaders("image").get("accept")).toMatch(/^image\/avif,/);
    expect(requestHeaders("document").get("accept")).toMatch(/^text\/html/);
  });
});

interface Call {
  readonly url: string;
  readonly headers: Headers;
}

function stubFetch(
  pages: Record<string, string>,
  status: (path: string) => number = () => 200,
): { fetch: Fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl: Fetch = (url, init) => {
    calls.push({ url, headers: init.headers });
    const path = url.replace(BASE, "");
    const code = status(path);
    const body = pages[path] ?? "";
    return Promise.resolve({
      ok: code >= 200 && code < 300,
      status: code,
      text: () => Promise.resolve(body),
      arrayBuffer: () => Promise.resolve(new TextEncoder().encode(body).buffer),
    });
  };
  return { fetch: fetchImpl, calls };
}

describe("the warm-up pass", () => {
  const pageA = `<link rel="stylesheet" href="/s.css"/><script src="/a.js"></script>`;
  const pageB = `<link rel="stylesheet" href="/s.css"/><script src="/b.js"></script>`;

  it("fetches each document and then each of its subresources, every URL once across the set", async () => {
    const { fetch, calls } = stubFetch({ "/en": pageA, "/de": pageB });
    const report = await warm(BASE, ["/en", "/de"], fetch);
    expect(calls.map(({ url }) => url.replace(BASE, ""))).toEqual([
      "/en",
      "/s.css",
      "/a.js",
      "/de",
      "/b.js",
    ]);
    expect(report.problems).toEqual([]);
    expect(report.pages).toEqual([
      { path: "/en", subresources: 2 },
      { path: "/de", subresources: 2 },
    ]);
    expect(report.warmed.map((url) => url.replace(BASE, ""))).toEqual([
      "/s.css",
      "/a.js",
      "/b.js",
    ]);
    for (const call of calls) {
      expect(call.headers.get("accept-encoding"), call.url).toContain("br");
    }
  });

  it("reports a document that does not answer 2xx", async () => {
    const { fetch } = stubFetch({ "/en": pageA }, (path) =>
      path === "/en" ? 500 : 200,
    );
    const report = await warm(BASE, ["/en"], fetch);
    expect(report.problems).toEqual(["/en: document answered 500"]);
  });

  it("reports a subresource that does not answer 2xx, naming the page and the path", async () => {
    const { fetch } = stubFetch({ "/en": pageA }, (path) =>
      path === "/a.js" ? 404 : 200,
    );
    const report = await warm(BASE, ["/en"], fetch);
    expect(report.problems).toEqual(["/en: /a.js answered 404"]);
  });

  it("reports a document that names no subresource, rather than passing having warmed nothing", async () => {
    const { fetch } = stubFetch({ "/en": "<p>no links</p>" });
    const report = await warm(BASE, ["/en"], fetch);
    expect(report.problems).toEqual([
      "/en: the document names no same-origin subresource, so nothing was warmed",
    ]);
  });
});

describe("the CLI", () => {
  const dir = mkdtempSync(join(tmpdir(), "lighthouse-warmup-"));
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  const urls = join(dir, "urls.json");
  writeFileSync(urls, JSON.stringify(["/en", "/de"]));

  function sink(): { write: (chunk: string) => boolean; text: () => string } {
    let buffer = "";
    return {
      write: (chunk: string) => {
        buffer += chunk;
        return true;
      },
      text: () => buffer,
    };
  }

  it("warms the URL list against `LHCI_BASE_URL` and exits 0", async () => {
    const { fetch, calls } = stubFetch({
      "/en": `<link rel="stylesheet" href="/s.css"/>`,
      "/de": `<link rel="stylesheet" href="/s.css"/>`,
    });
    const out = sink();
    const err = sink();
    const code = await warmMain(
      ["--file", urls],
      { LHCI_BASE_URL: BASE },
      out,
      err,
      fetch,
    );
    expect(err.text()).toBe("");
    expect(code).toBe(0);
    expect(calls.map(({ url }) => url)).toEqual([
      `${BASE}/en`,
      `${BASE}/s.css`,
      `${BASE}/de`,
    ]);
    expect(out.text()).toContain("lighthouse-warmup: /en + 1 subresources");
    expect(out.text()).toContain("2 documents, 1 distinct subresources warmed");
  });

  it("exits 1 and names the problem when anything was not warmed", async () => {
    const { fetch } = stubFetch({ "/en": "", "/de": "" });
    const err = sink();
    const code = await warmMain(
      ["--file", urls],
      { LHCI_BASE_URL: BASE },
      sink(),
      err,
      fetch,
    );
    expect(code).toBe(1);
    expect(err.text()).toContain(
      "/en: the document names no same-origin subresource",
    );
  });

  it("exits 1 when the URL list cannot be read", async () => {
    const err = sink();
    const code = await warmMain(
      ["--file", join(dir, "missing.json")],
      { LHCI_BASE_URL: BASE },
      sink(),
      err,
      stubFetch({}).fetch,
    );
    expect(code).toBe(1);
    expect(err.text()).toMatch(/^lighthouse-warmup: /);
  });
});
