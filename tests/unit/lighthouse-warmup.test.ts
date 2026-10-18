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
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterAll, describe, expect, it, vi } from "vitest";

import {
  ACCEPT_ENCODING,
  defaultFetch,
  type Fetch,
  REQUEST_TIMEOUT_MS,
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

  it("reads a comma inside a descriptor's parentheses as part of the descriptor, with no nesting", () => {
    // HTML's descriptor tokenizer: "(" enters the paren state, the first ")" leaves it, and a
    // comma ends the candidate only outside it (/break r1 on PR 262, hole 1).
    expect(srcsetUrls("/a.avif 1x (x, y), /b.avif 2x")).toEqual([
      "/a.avif",
      "/b.avif",
    ]);
    expect(srcsetUrls("/a.avif 1x (( ), /b.avif 2x")).toEqual([
      "/a.avif",
      "/b.avif",
    ]);
  });

  it("splits on HTML's ASCII whitespace only: tab, LF, FF and CR separate, NBSP does not", () => {
    // /break r1 on PR 262, hole 2.
    expect(srcsetUrls("/a.avif\t1x,\n/b.avif\f2x,\r/c.avif")).toEqual([
      "/a.avif",
      "/b.avif",
      "/c.avif",
    ]);
    expect(srcsetUrls("/a\u00a0b.avif 1x, /c.avif 2x")).toEqual([
      "/a\u00a0b.avif",
      "/c.avif",
    ]);
  });

  it("keeps a `data:` candidate whole, as the HTML srcset parser does, so its comma names no path", () => {
    // A per-width `<picture>` selects a one-pixel `data:` GIF where its image is not displayed
    // (`src/modules/ui/media/preload.ts`, BLANK_IMAGE_SRCSET); split on every comma, its base64
    // tail became a relative path that answered 308 and failed the warm-up (PR 262).
    const blank =
      "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    expect(srcsetUrls(blank)).toEqual([blank]);
    expect(srcsetUrls(`${blank} 1x, /b.avif 2x`)).toEqual([blank, "/b.avif"]);
    expect(srcsetUrls("/a.avif 1x,, /b.avif,")).toEqual(["/a.avif", "/b.avif"]);
    expect(
      paths(
        `<picture><source media="(width < 48rem)" srcSet="${blank}"/><img src="/a.avif"/></picture>`,
      ),
    ).toEqual(["/a.avif"]);
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
  readonly signal: AbortSignal;
  /** How many times the body of this response was read to the end. */
  bodyReads: number;
}

function stubFetch(
  pages: Record<string, string>,
  status: (path: string) => number = () => 200,
): { fetch: Fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl: Fetch = (url, init) => {
    const call: Call = {
      url,
      headers: init.headers,
      signal: init.signal,
      bodyReads: 0,
    };
    calls.push(call);
    const path = url.replace(BASE, "");
    const code = status(path);
    const body = pages[path] ?? "";
    return Promise.resolve({
      ok: code >= 200 && code < 300,
      status: code,
      text: () => {
        call.bodyReads += 1;
        return Promise.resolve(body);
      },
      arrayBuffer: () => {
        call.bodyReads += 1;
        return Promise.resolve(new TextEncoder().encode(body).buffer);
      },
    });
  };
  return { fetch: fetchImpl, calls };
}

describe("the fetch `--warm` uses by default", () => {
  it("passes the headers and the timeout signal to the real `fetch` unchanged", async () => {
    const seen: RequestInit[] = [];
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((_url, init) => {
        seen.push(init ?? {});
        return Promise.resolve(new Response("ok"));
      });
    try {
      const init = {
        headers: requestHeaders("document"),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      };
      await defaultFetch(`${BASE}/en`, init);
      expect(seen).toHaveLength(1);
      expect(seen[0]?.signal).toBe(init.signal);
      expect(seen[0]?.headers).toBe(init.headers);
    } finally {
      spy.mockRestore();
    }
  });
});

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

  it("reads every body to the end, so the origin finishes each response it began (breaker r1, hole 4)", async () => {
    const { fetch, calls } = stubFetch({ "/en": pageA });
    await warm(BASE, ["/en"], fetch);
    expect(calls).toHaveLength(3);
    for (const call of calls) expect(call.bodyReads, call.url).toBe(1);
  });

  it("gives every request a 30 s timeout, so a hung origin fails the step instead of waiting 300 s", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    try {
      const { fetch, calls } = stubFetch({ "/en": pageA });
      await warm(BASE, ["/en"], fetch);
      expect(REQUEST_TIMEOUT_MS).toBe(30_000);
      expect(timeout.mock.calls).toEqual([[30_000], [30_000], [30_000]]);
      for (const call of calls) {
        expect(call.signal, call.url).toBe(
          timeout.mock.results[calls.indexOf(call)]?.value,
        );
      }
    } finally {
      timeout.mockRestore();
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

  it("with no fetch given, `warmMain` sends every request through the real `fetch` with a timeout signal", async () => {
    const seen: RequestInit[] = [];
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((url, init) => {
        seen.push(init ?? {});
        return Promise.resolve(
          new Response(
            String(url).endsWith("/s.css")
              ? ""
              : `<link rel="stylesheet" href="/s.css"/>`,
          ),
        );
      });
    try {
      const code = await warmMain(
        ["--file", urls],
        { LHCI_BASE_URL: BASE },
        sink(),
        sink(),
      );
      expect(code).toBe(0);
      expect(seen).toHaveLength(3);
      for (const init of seen) {
        expect(init.signal).toBeInstanceOf(AbortSignal);
        expect(init.headers).toBeInstanceOf(Headers);
      }
    } finally {
      spy.mockRestore();
    }
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

/**
 * The real script as a subprocess, against a real local server: the only thing that exercises the
 * `--warm` dispatch at the bottom of the file, without which `--warm` would print the URL list
 * and exit 0, warming nothing (breaker r1, hole 1).
 */
describe("`node scripts/seo/lighthouse-urls.ts --warm` as CI runs it", () => {
  const script = resolve(__dirname, "../../scripts/seo/lighthouse-urls.ts");
  const dir = mkdtempSync(join(tmpdir(), "lighthouse-warmup-cli-"));
  const urls = join(dir, "urls.json");
  writeFileSync(urls, JSON.stringify(["/en", "/de"]));
  const servers: Server[] = [];
  afterAll(() => {
    for (const server of servers) server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  async function serve(
    missing: readonly string[],
  ): Promise<{ base: string; hits: string[] }> {
    const hits: string[] = [];
    const server = createServer((request, response) => {
      const path = request.url ?? "";
      hits.push(path);
      if (missing.includes(path)) {
        response.writeHead(404).end("nope");
      } else if (path === "/en" || path === "/de") {
        response
          .writeHead(200, { "content-type": "text/html" })
          .end(`<link rel="stylesheet" href="/s.css"/>`);
      } else {
        response.writeHead(200).end("body");
      }
    });
    servers.push(server);
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    return {
      base: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`,
      hits,
    };
  }

  const run = (
    base: string,
  ): Promise<{ code: number; stdout: string; stderr: string }> =>
    new Promise((done) => {
      execFile(
        process.execPath,
        [script, "--warm", "--file", urls, "--base", base],
        (error, stdout, stderr) => {
          done({
            code:
              error === null ? 0 : Number((error as { code?: number }).code),
            stdout,
            stderr,
          });
        },
      );
    });

  it("fetches the documents and their subresource from the server, and exits 0", async () => {
    const { base, hits } = await serve([]);
    const result = await run(base);
    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    expect(hits).toEqual(["/en", "/s.css", "/de"]);
    expect(result.stdout).toContain(
      "lighthouse-warmup: 2 documents, 1 distinct subresources warmed",
    );
    // Not the URL list `main` prints without `--warm`.
    expect(result.stdout).not.toContain("--collect.url=");
  }, 30_000);

  it("exits 1 and names the path when a subresource answers 404", async () => {
    const { base } = await serve(["/s.css"]);
    const result = await run(base);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("/en: /s.css answered 404");
  }, 30_000);
});
