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
 * The measured state of the two script clauses is **recorded, not asserted green**: on Next
 * 16.3.4 the framework's own client runtime is 130.1 KB gzipped, above `plan/01` §7's 120 KB
 * budget, before a single line of application code. That is a founder decision (`TASKS.md`
 * TASK-043 blockers, spec 003 §14 A12), not something a test may quietly lower, so what is
 * asserted here is that the budget constants still say 120 KB and 4 KB and that the script fails
 * when a page is over — never that today's build is under.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  CLIENT_JS_BUDGET_BYTES,
  MESSAGES_PAYLOAD_BUDGET_BYTES,
  measurePages,
  messagesPayloadSizes,
  parseScriptTags,
  formatMarkdownTable,
  main,
} from "../../scripts/client-js-budget.ts";
import { namespacesFor } from "../../src/modules/i18n";
import { loadMessages } from "../../src/modules/i18n/messages.ts";

describe("the budget constants are plan/01 §7's, in bytes", () => {
  it("caps client JS at 120 KB and the client message payload at 4 KB", () => {
    expect(CLIENT_JS_BUDGET_BYTES).toBe(122880);
    expect(MESSAGES_PAYLOAD_BUDGET_BYTES).toBe(4096);
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
    expect(root?.fetchedGzipBytes).toBeGreaterThan(CLIENT_JS_BUDGET_BYTES);
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
    expect(table).toContain("| `/` |");
    expect(table).toContain("| `/en` |");
  });

  it("exits non-zero on a breach and 0 when everything fits", () => {
    const out: string[] = [];
    const write = (chunk: string): number => out.push(chunk);
    expect(main(["--dist", dist, "--url", "/"], { write }, { write })).toBe(1);
    expect(out.join("")).toContain("over the 120 KB");
    out.length = 0;
    expect(
      main(["--dist", dist, "--url", "/small"], { write }, { write }),
    ).toBe(0);
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
