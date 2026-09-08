/**
 * T-27, repository half (AC-27, TASK-043).
 *
 * AC-27 has four clauses and they are measured in two places, because two of them need a real
 * `next build` output and two do not:
 *
 *  - **`pnpm budget:client-js`** measures the scripts a browser actually fetches for a URL out of
 *    the prerendered HTML in `.next/server/app/`, so the number is the page's own script set
 *    rather than a guess from a chunk manifest. The pure functions it is built from are asserted
 *    here against a temporary directory holding a fake build output; the CI `build` job runs the
 *    real thing and prints the table (`tests/unit/ci-workflow.test.ts` pins the wiring).
 *  - **the serialised messages payload** needs no build at all: it is exactly what
 *    `loadMessages(locale, namespacesFor("localeDocument"))` returns, which is what
 *    `NextIntlClientProvider` serialises into the document. It is asserted here, per launch
 *    locale, against the 4 KB gzipped budget of spec 003 §6.
 *
 * The budget was restated by spec 004 §13 Q13 (founder decision, 2026-09-08, option (a)): the
 * same 122 880 bytes, measured as **Brotli** transfer rather than gzip, because that is what
 * Vercel serves and what Lighthouse's `resource-summary:script:size` measures. TASK-046 changed
 * `withinBudget` to compare the Brotli total, and the gzip total is still reported beside it.
 *
 * The measured state of the two script clauses is **recorded, not asserted green**: with zod off
 * the client (TASK-046) `/` measures 113.7 KB Brotli — within — and `/en` 124.5 KB, 3.7% over,
 * because the Next 16.3.4 client runtime alone is ~112 KB Brotli and `NextIntlClientProvider`
 * costs 10.5 KB of the ~8 KB that leaves. Whether the budget or the provider moves is a founder
 * decision (spec 004 §13 Q13 option (b), carried on TASK-046), not something a test may quietly
 * lower, so what is asserted here is that the budget constants still say 122 880 and 4 096 bytes,
 * that the comparison is against the Brotli number, and that the script fails when a page is over
 * — never that today's build is under.
 *
 * TASK-046 also added `forbiddenModuleHits()`: no script a document fetches may contain zod or the
 * browser Sentry SDK (AC-25). It is asserted here against a fake build output whose chunks do and
 * do not contain the markers, so both directions of the check are exercised without a real build;
 * the CI `build` job runs it against one.
 */
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  CLIENT_JS_BUDGET_BYTES,
  FORBIDDEN_CLIENT_MODULES,
  MESSAGES_PAYLOAD_BUDGET_BYTES,
  forbiddenModuleHits,
  measurePages,
  messagesPayloadSizes,
  parseScriptTags,
  formatMarkdownTable,
  main,
} from "../../scripts/client-js-budget.ts";
import { namespacesFor } from "../../src/modules/i18n";
import { loadMessages } from "../../src/modules/i18n/messages.ts";

describe("the budget constants are plan/01 §7's as spec 004 §13 Q13 restated them", () => {
  it("caps client JS at 120 KB (122 880 B) and the client message payload at 4 KB", () => {
    expect(CLIENT_JS_BUDGET_BYTES).toBe(122880);
    expect(MESSAGES_PAYLOAD_BUDGET_BYTES).toBe(4096);
  });

  it("is the same number `lighthouserc.json` asserts, so the two gates cannot drift", () => {
    const rc = JSON.parse(
      readFileSync(resolve(__dirname, "../../lighthouserc.json"), "utf8"),
    ) as {
      ci: {
        assert: {
          assertions: Record<string, [string, { maxNumericValue?: number }]>;
        };
      };
    };
    expect(
      rc.ci.assert.assertions["resource-summary:script:size"]?.[1]
        ?.maxNumericValue,
    ).toBe(CLIENT_JS_BUDGET_BYTES);
  });
});

describe("parseScriptTags", () => {
  it("reads the page's own script set from the prerendered document", () => {
    const html =
      '<html><head><script src="/_next/static/chunks/a.js"></script>' +
      '<link rel="preload" href="/_next/static/chunks/never.js"/>' +
      '</head><body><script src="/_next/static/chunks/b.js" async=""></script></body></html>';
    expect(parseScriptTags(html)).toEqual([
      { asset: "static/chunks/a.js", noModule: false },
      { asset: "static/chunks/b.js", noModule: false },
    ]);
  });

  it("marks the `noModule` polyfill bundle, which a modern browser never fetches", () => {
    const html =
      '<script src="/_next/static/chunks/polyfill.js" noModule=""></script>';
    expect(parseScriptTags(html)).toEqual([
      { asset: "static/chunks/polyfill.js", noModule: true },
    ]);
  });

  it("ignores third-party and inline scripts: only `/_next/` assets are ours to measure", () => {
    const html =
      '<script src="https://vercel.live/feedback.js"></script>' +
      "<script>self.__next_f.push([1])</script>";
    expect(parseScriptTags(html)).toEqual([]);
  });

  it("counts a chunk requested twice on one page once", () => {
    const html =
      '<script src="/_next/static/chunks/a.js"></script>' +
      '<script src="/_next/static/chunks/a.js"></script>';
    expect(parseScriptTags(html)).toHaveLength(1);
  });
});

describe("measurePages against a fake build output", () => {
  let dist = "";
  /**
   * `n` KB of deterministic, *incompressible* bytes (a 32-bit xorshift stream): a fixture that is
   * over budget in bytes must still be over budget after gzip, or the assertion below would
   * measure the compressor rather than the budget.
   */
  const kb = (n: number): Buffer => {
    const bytes = Buffer.alloc(n * 1024);
    let state = 0x9e3779b9;
    for (let index = 0; index < bytes.length; index += 1) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      bytes[index] = state & 0xff;
    }
    return bytes;
  };

  beforeAll(() => {
    dist = mkdtempSync(join(tmpdir(), "fo-budget-"));
    mkdirSync(join(dist, "static/chunks"), { recursive: true });
    mkdirSync(join(dist, "server/app"), { recursive: true });
    writeFileSync(join(dist, "static/chunks/runtime.js"), kb(200));
    writeFileSync(join(dist, "static/chunks/page.js"), kb(20));
    writeFileSync(join(dist, "static/chunks/polyfill.js"), kb(400));
    writeFileSync(
      join(dist, "server/app/index.html"),
      '<script src="/_next/static/chunks/runtime.js"></script>' +
        '<script src="/_next/static/chunks/polyfill.js" noModule=""></script>',
    );
    writeFileSync(
      join(dist, "server/app/en.html"),
      '<script src="/_next/static/chunks/runtime.js"></script>' +
        '<script src="/_next/static/chunks/page.js"></script>',
    );
  });

  afterAll(() => {
    rmSync(dist, { recursive: true, force: true });
  });

  it("compares the Brotli total against the budget, not the gzip one", () => {
    const [root] = measurePages(dist, ["/"]);
    const fetched = root?.assets.find((asset) => !asset.noModule);
    expect(root?.fetchedBrotliBytes).toBe(fetched?.brotliBytes);
    expect(root?.fetchedGzipBytes).toBe(fetched?.gzipBytes);
    // The fixture bytes are incompressible, so `gz` and `br` are both over: the direction of the
    // comparison is proven by `over-br-under-gz.html` below instead.
    expect(root?.withinBudget).toBe(false);
  });

  it("passes a page that is under budget in Brotli and over it in gzip", () => {
    // A 62 KB incompressible block, written twice. gzip's 32 KB window cannot see the repeat, so
    // it reports ~124 KB — over; Brotli's window can, so it reports ~62 KB — under. That is the
    // whole point of the restatement (spec 004 §13 Q13) and it is why this asserts *which*
    // encoding the budget reads rather than trusting a field name.
    const block = kb(62);
    writeFileSync(
      join(dist, "static/chunks/band.js"),
      Buffer.concat([block, block]),
    );
    writeFileSync(
      join(dist, "server/app/band.html"),
      '<script src="/_next/static/chunks/band.js"></script>',
    );
    const [page] = measurePages(dist, ["/band"]);
    expect(page?.fetchedGzipBytes).toBeGreaterThan(CLIENT_JS_BUDGET_BYTES);
    expect(page?.fetchedBrotliBytes).toBeLessThanOrEqual(
      CLIENT_JS_BUDGET_BYTES,
    );
    expect(page?.withinBudget).toBe(true);
  });

  it("measures the fetched scripts of each URL and leaves `noModule` out of the total", () => {
    const [root, locale] = measurePages(dist, ["/", "/en"]);
    expect(root?.url).toBe("/");
    // Biggest first, `noModule` included in the listing so a reader sees what was skipped.
    expect(root?.assets.map((asset) => asset.asset)).toEqual([
      "static/chunks/polyfill.js",
      "static/chunks/runtime.js",
    ]);
    // The 400 KB polyfill bundle is `noModule`, so it is reported and not counted.
    expect(root?.fetchedGzipBytes).toBe(
      root?.assets.find((asset) => !asset.noModule)?.gzipBytes,
    );
    expect(locale?.fetchedGzipBytes).toBeGreaterThan(
      root?.fetchedGzipBytes ?? 0,
    );
  });

  it("reports every URL as over budget when it is, and names the biggest chunk first", () => {
    const [root] = measurePages(dist, ["/"]);
    expect(root?.fetchedBrotliBytes).toBeGreaterThan(CLIENT_JS_BUDGET_BYTES);
    expect(root?.withinBudget).toBe(false);
    const sorted = [...(root?.assets ?? [])].map((asset) => asset.gzipBytes);
    expect(sorted).toEqual([...sorted].sort((a, b) => b - a));
  });

  it("passes a URL that fits, so the assertion is not vacuous", () => {
    writeFileSync(
      join(dist, "server/app/small.html"),
      '<script src="/_next/static/chunks/page.js"></script>',
    );
    const [small] = measurePages(dist, ["/small"]);
    expect(small?.withinBudget).toBe(true);
  });

  it("fails loudly when a page's HTML is missing rather than reporting 0 KB", () => {
    expect(() => measurePages(dist, ["/does-not-exist"])).toThrow(
      /does-not-exist/,
    );
  });

  it("renders a markdown table a step summary can carry", () => {
    const table = formatMarkdownTable(measurePages(dist, ["/", "/en"]));
    expect(table).toContain("| URL | fetched JS (gz) |");
    expect(table).toContain("budget 120 KB br");
    expect(table).toContain("| `/` |");
    expect(table).toContain("| `/en` |");
  });

  it("exits non-zero on a breach and 0 when everything fits", () => {
    const out: string[] = [];
    const write = (chunk: string): number => out.push(chunk);
    expect(main(["--dist", dist, "--url", "/"], { write }, { write })).toBe(1);
    expect(out.join("")).toContain("Brotli-encoded JavaScript");
    expect(out.join("")).toContain("over the 120 KB");
    out.length = 0;
    expect(
      main(["--dist", dist, "--url", "/small"], { write }, { write }),
    ).toBe(0);
  });
});

describe("forbiddenModuleHits — no zod, no browser Sentry on a public route (AC-25)", () => {
  let dist = "";

  beforeAll(() => {
    dist = mkdtempSync(join(tmpdir(), "fo-forbidden-"));
    mkdirSync(join(dist, "static/chunks"), { recursive: true });
    mkdirSync(join(dist, "server/app"), { recursive: true });
    // Minified-looking chunks: the markers are what survives a minifier, which is why the check
    // greps for them rather than for an import path.
    writeFileSync(
      join(dist, "static/chunks/clean.js"),
      "export const a=1;const b=_zodiac;",
    );
    writeFileSync(
      join(dist, "static/chunks/zod.js"),
      "class $ZodError extends Error{};const x=_zod.util;",
    );
    writeFileSync(
      join(dist, "static/chunks/sentry.js"),
      'const m="@sentry/browser";',
    );
    writeFileSync(
      join(dist, "static/chunks/legacy.js"),
      "class $ZodError extends Error{}",
    );
    writeFileSync(
      join(dist, "server/app/index.html"),
      '<script src="/_next/static/chunks/clean.js"></script>' +
        '<script src="/_next/static/chunks/legacy.js" noModule=""></script>',
    );
    writeFileSync(
      join(dist, "server/app/en.html"),
      '<script src="/_next/static/chunks/clean.js"></script>' +
        '<script src="/_next/static/chunks/zod.js"></script>' +
        '<script src="/_next/static/chunks/sentry.js"></script>',
    );
  });

  afterAll(() => {
    rmSync(dist, { recursive: true, force: true });
  });

  it("names both modules it forbids", () => {
    expect(FORBIDDEN_CLIENT_MODULES.map((module) => module.label)).toEqual([
      "zod",
      "@sentry/",
    ]);
  });

  it("finds nothing on a clean page, and does not fire on a near-miss identifier", () => {
    expect(forbiddenModuleHits(dist, measurePages(dist, ["/"]))).toEqual([]);
  });

  it("names the URL, the chunk and the module for each hit", () => {
    expect(forbiddenModuleHits(dist, measurePages(dist, ["/en"]))).toEqual([
      { url: "/en", asset: "static/chunks/zod.js", label: "zod" },
      { url: "/en", asset: "static/chunks/sentry.js", label: "@sentry/" },
    ]);
  });

  it("ignores `noModule` chunks, which no modern browser fetches", () => {
    // `/`'s only offending chunk is the `noModule` one, and the previous assertion is what makes
    // this one non-vacuous: the marker is there, the bundle is not fetched, so it is not a hit.
    expect(
      readFileSync(join(dist, "static/chunks/legacy.js"), "utf8"),
    ).toContain("$ZodError");
    expect(forbiddenModuleHits(dist, measurePages(dist, ["/"]))).toEqual([]);
  });

  it("makes the script exit non-zero and say which route ships what", () => {
    const out: string[] = [];
    const write = (chunk: string): number => out.push(chunk);
    expect(main(["--dist", dist, "--url", "/en"], { write }, { write })).toBe(
      1,
    );
    expect(out.join("")).toContain("`zod` in its client bundle");
    expect(out.join("")).toContain("`@sentry/` in its client bundle");
  });

  it("says so explicitly when a run finds none, so silence is not the only evidence", () => {
    const out: string[] = [];
    const write = (chunk: string): number => out.push(chunk);
    expect(main(["--dist", dist, "--url", "/"], { write }, { write })).toBe(0);
    expect(out.join("")).toContain("no measured URL ships zod or @sentry/");
  });
});

describe("the serialised client message payload (AC-27)", () => {
  const sizes = messagesPayloadSizes();

  it("covers every launch locale", () => {
    expect(sizes.map((size) => size.locale)).toEqual([
      "en",
      "en-gb",
      "de",
      "pl",
    ]);
  });

  it("is the `localeDocument` namespace subset, not the whole catalogue", () => {
    for (const { locale, bytes } of sizes) {
      const payload = JSON.stringify(
        loadMessages(locale, namespacesFor("localeDocument")),
      );
      expect(gzipSync(Buffer.from(payload, "utf8")).length).toBe(bytes);
      expect(Object.keys(JSON.parse(payload) as object).sort()).toEqual([
        "a11y",
        "banner",
        "common",
        "errors",
        "meta",
      ]);
    }
  });

  it("stays inside the 4 KB gzipped budget for every launch locale", () => {
    for (const { locale, bytes } of sizes) {
      expect(bytes, locale).toBeLessThanOrEqual(MESSAGES_PAYLOAD_BUDGET_BYTES);
    }
  });
});

describe("`/` carries no Client Component of its own (AC-7, AC-27)", () => {
  it("has no `use client` file anywhere in the (chooser) route group", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const group = resolve(__dirname, "../../src/app/(chooser)");
    const files = readdirSync(group, { recursive: true, encoding: "utf8" });
    for (const file of files) {
      const path = join(group, file);
      if (!/\.tsx?$/.test(file)) continue;
      expect(readFileSync(path, "utf8"), file).not.toContain('"use client"');
    }
  });
});
