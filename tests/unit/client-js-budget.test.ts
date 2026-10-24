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
 * both the initial and the lazily fetched chunks (TASK-046 and its `/review 26` round), a browser
 * fetches 116 393 B Brotli on `/` — within, 6 487 B spare — and 129 638 B on `/en` and `/de`,
 * 6 758 B (5.5%) over, because `/`'s total is already nothing but the framework floor and a
 * locale document adds `NextIntlClientProvider` at 10 705 B and the banner island at 2 173 B.
 * Whether the budget or the provider moves is a founder decision (spec 004 §13 Q13 option (b),
 * carried on TASK-046), not something a test may quietly lower, so what is asserted here is that
 * the budget constants still say 122 880 and 4 096 bytes, that the comparison is against the
 * Brotli number, and that the script fails when a page is over — never that today's build is
 * under.
 *
 * TASK-046 also added `forbiddenModuleHits()`: no script a page fetches may contain zod or the
 * browser Sentry SDK (AC-25). It is asserted here against a fake build output whose chunks do and
 * do not contain the markers, so both directions of the check are exercised without a real build;
 * the CI `build` job runs it against one.
 *
 * **What `/review 26` added, and why it is the important part of this file.** Both the byte total
 * and the forbidden-module scan used to read only the prerendered document's `<script src>` list,
 * so a `next/dynamic` chunk was invisible to them — and that is exactly where zod was: the
 * suggestion-banner island, rendered on every locale document with `ssr: false`. The script now
 * also follows `.next/server/app/<entry>/react-loadable-manifest.json`, and the fixtures below
 * include a route whose document is clean and whose lazy chunk is not, so a future edit that
 * stops following the manifest fails here rather than in a browser six weeks later.
 *
 * **What TASK-085 added** (`/review 36`'s finding): that manifest is an *app-level* list —
 * Turbopack writes the same `next/dynamic` ids into every route's copy of it — so following it
 * per route charged `/` 14.9 KB Brotli for islands the chooser never mounts (131 672 B charged
 * against 116 429 B fetched). The manifest is now filtered by reachability from the client
 * references the document actually mounts (`parseClientReferences`, `reachableAssets`), and the
 * fixtures below hold both directions: a document that mounts a loader and therefore pays for its
 * island, and one that lists the same chunks without mounting anything and therefore pays for
 * neither. The end-to-end check on the same claim is `tests/e2e/client-js-budget.spec.ts`, which
 * records what Chromium really fetches and asserts the two sets are equal.
 *
 * **What TASK-376 changed:** the loaders use `React.lazy`, which writes no loadable manifest, so
 * the candidate list is now every chunk a Turbopack loader stub names, less the on-input chunks of
 * `ON_INPUT_CHUNK_MARKERS` (`lazyCandidatesFor`, `lazyChunksNamedIn`). The reachability filter
 * above is unchanged.
 *
 * TASK-085 also added `catalogueLeaks()`: no chunk a page fetches may contain a `home.*`,
 * `finder.*`, `catalog.*` or `media.*` catalogue value. That is the byte-level half of the
 * §14 A1 addendum — the source-level half is `tests/unit/client-message-graph.test.ts` — and it
 * exists because the leak it catches (a static `messages/en.json` import in the 500 boundary)
 * cost 4 751 B Brotli on every document while being far too small to notice as a byte total.
 */
import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { gzipSync } from "node:zlib";

import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  CLIENT_FORBIDDEN_NAMESPACES,
  CLIENT_JS_BUDGET_BYTES,
  PRODUCT_CLIENT_JS_BUDGET_BYTES,
  DEFAULT_URLS,
  type PageMeasurement,
  FORBIDDEN_CLIENT_MODULES,
  MESSAGES_PAYLOAD_BUDGET_BYTES,
  catalogueLeaks,
  catalogueProbes,
  segmentLeaks,
  segmentProbes,
  forbiddenModuleHits,
  lazyCandidatesFor,
  lazyChunksNamedIn,
  ON_INPUT_CHUNK_MARKERS,
  CONSENT_ISLAND_MARKER,
  onInputChunkMarkers,
  measurePages,
  messagesPayloadSizes,
  parseClientReferences,
  parseScriptTags,
  formatChunkList,
  formatMarkdownTable,
  reachableAssets,
  routeEntryFor,
  main,
  BASELINE_FILE,
  REGRESSION_ALLOWANCE_BYTES,
  fontBreaches,
  fontBytesFor,
  fontTransfer,
  readBaseline,
  regressions,
} from "../../scripts/client-js-budget.ts";
import { namespacesFor } from "../../src/modules/i18n";
import { loadMessages } from "../../src/modules/i18n/messages.ts";

/** The checkout root, for the two inputs that are committed files rather than build output. */
const repoRoot = resolve(__dirname, "../..");

describe("the budget constants are plan/01 §7's as spec 004 §13 Q13 restated them", () => {
  it("caps client JS at 128 KB (131 072 B) and the client message payload at 4 KB", () => {
    // 120 KB was spec 004 §13 Q13's restatement; §14 A1 corrected it to 128 KB after TASK-046
    // measured the locale documents at 129 638 B with no application code left to remove. The
    // amendment says the budget is not raised a second time, and `lighthouserc.json` takes the
    // same number when TASK-056 flips the Lighthouse job to blocking.
    expect(CLIENT_JS_BUDGET_BYTES).toBe(131072);
    expect(MESSAGES_PAYLOAD_BUDGET_BYTES).toBe(4096);
  });

  it("is the same number `lighthouserc.json` asserts, so the two gates cannot drift", () => {
    const rc = JSON.parse(
      readFileSync(resolve(__dirname, "../../lighthouserc.json"), "utf8"),
    ) as {
      ci: {
        assert: {
          assertMatrix: {
            matchingUrlPattern?: string;
            assertions: Record<string, [string, { maxNumericValue?: number }]>;
          }[];
        };
      };
    };
    // Per URL since spec 004 §14 A-founder-2026-10-18a: the product pattern's number is
    // `PRODUCT_CLIENT_JS_BUDGET_BYTES`, every other URL's this one
    // (`tests/unit/product-script-budget.test.ts` asserts which URL gets which).
    expect(
      rc.ci.assert.assertMatrix
        .map(
          (entry) =>
            entry.assertions["resource-summary:script:size"]?.[1]
              ?.maxNumericValue,
        )
        .filter((value) => value !== undefined),
    ).toEqual([CLIENT_JS_BUDGET_BYTES, PRODUCT_CLIENT_JS_BUDGET_BYTES]);
  });
});

describe("parseScriptTags", () => {
  it("reads the page's own script set from the prerendered document", () => {
    const html =
      '<html><head><script src="/_next/static/chunks/a.js"></script>' +
      '<link rel="preload" href="/_next/static/chunks/never.js"/>' +
      '</head><body><script src="/_next/static/chunks/b.js" async=""></script></body></html>';
    expect(parseScriptTags(html)).toEqual([
      { asset: "static/chunks/a.js", noModule: false, kind: "document" },
      { asset: "static/chunks/b.js", noModule: false, kind: "document" },
    ]);
  });

  it("marks the `noModule` polyfill bundle, which a modern browser never fetches", () => {
    const html =
      '<script src="/_next/static/chunks/polyfill.js" noModule=""></script>';
    expect(parseScriptTags(html)).toEqual([
      { asset: "static/chunks/polyfill.js", noModule: true, kind: "document" },
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
    writeFileSync(join(dist, "static/chunks/island.js"), kb(30));
    // The loader chunk, as Turbopack writes one: it names the chunk its dynamic import will
    // request, verbatim. That string is the edge `reachableAssets()` follows.
    writeFileSync(
      join(dist, "static/chunks/loader.js"),
      'e.v(()=>Promise.all(["static/chunks/island.js"].map(t=>e.l(t))));',
    );
    // The URL -> entry map a real `next build` writes. The lazy candidates are read from the loader
    // stubs (`loader.js` above), an app-level list, so whether `island.js` is charged is decided by
    // reachability alone (TASK-376).
    writeFileSync(
      join(dist, "app-path-routes-manifest.json"),
      JSON.stringify({
        "/(chooser)/page": "/",
        "/[locale]/page": "/[locale]",
        "/en/deep/page": "/en/deep",
        "/quiet/page": "/quiet",
      }),
    );
    // `/` **mounts** the loader: its flight payload names it, so the browser fetches the island
    // chunk after hydration and the page is charged for it.
    writeFileSync(
      join(dist, "server/app/index.html"),
      '<script src="/_next/static/chunks/runtime.js"></script>' +
        '<script src="/_next/static/chunks/loader.js"></script>' +
        '<script src="/_next/static/chunks/polyfill.js" noModule=""></script>' +
        '<script>self.__next_f.push([1,"3:I[7,[\\"/_next/static/chunks/loader.js\\"],\\"Loader\\"]\\n"])</script>',
    );
    // `/quiet` lists the very same loader chunk — Turbopack puts an entry's client modules in the
    // entry's script set — but mounts nothing, so no dynamic import ever runs. It is charged the
    // loader's own bytes and **not** the island's.
    writeFileSync(
      join(dist, "server/app/quiet.html"),
      '<script src="/_next/static/chunks/runtime.js"></script>' +
        '<script src="/_next/static/chunks/loader.js"></script>',
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
    const fetched = (root?.assets ?? []).filter((asset) => !asset.noModule);
    expect(root?.fetchedBrotliBytes).toBe(
      fetched.reduce((total, asset) => total + asset.brotliBytes, 0),
    );
    expect(root?.fetchedGzipBytes).toBe(
      fetched.reduce((total, asset) => total + asset.gzipBytes, 0),
    );
    // The fixture bytes are incompressible, so `gz` and `br` are both over: the direction of the
    // comparison is proven by `over-br-under-gz.html` below instead.
    expect(root?.withinBudget).toBe(false);
  });

  it("passes a page that is under budget in Brotli and over it in gzip", () => {
    // A 68 KB incompressible block, written twice. gzip's 32 KB window cannot see the repeat, so
    // it reports ~136 KB — over the 128 KB budget; Brotli's window can, so it reports ~68 KB —
    // under. That is the whole point of the restatement (spec 004 §13 Q13, corrected by §14 A1)
    // and it is why this asserts *which* encoding the budget reads rather than trusting a field
    // name.
    const block = kb(68);
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
      "static/chunks/island.js",
      "static/chunks/loader.js",
    ]);
    // The 400 KB polyfill bundle is `noModule`, so it is reported and not counted; the 30 KB
    // `next/dynamic` chunk is not in the document at all and *is* counted.
    expect(root?.fetchedGzipBytes).toBe(
      (root?.assets ?? [])
        .filter((asset) => !asset.noModule)
        .reduce((total, asset) => total + asset.gzipBytes, 0),
    );
    expect(locale?.assets.map((asset) => asset.kind)).toEqual([
      "document",
      "document",
    ]);
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

  it("renders the §11 bundle table a step summary can carry", () => {
    const table = formatMarkdownTable(
      measurePages(dist, ["/", "/en"]),
      fontTransfer(repoRoot),
      readBaseline(repoRoot),
    );
    expect(table).toContain("| Route | first-load JS (br) |");
    expect(table).toContain("+ lazy (br)");
    expect(table).toContain("128 KB br");
    expect(table).toContain("| `/` |");
    expect(table).toContain("| `/en` |");
    // spec 004 §11's table has a Fonts column and a budget line; a budget printed nowhere is a
    // budget nobody reads (TASK-056).
    expect(table).toContain("fonts");
    // A21 clause 3's four font budgets, each printed with its measurement.
    expect(table).toMatch(/Fonts: en\/en-gb\/de page .* budget 90\.0 KB/);
    expect(table).toMatch(/pl page .* budget 120\.0 KB/);
    expect(table).toMatch(/Caveat \(product page only\) .* budget 30\.0 KB/);
    expect(table).toMatch(/preloaded .* budget 50\.0 KB/);
    expect(table).toContain("Regression allowance");
  });

  /**
   * `/review 36`'s finding, as a fixture. `/quiet` lists the loader chunk and mounts nothing; the
   * island chunk is in its route's loadable manifest all the same, because that list is
   * app-level. Charging it was worth 14.9 KB Brotli on the real `/`.
   */
  it("charges a lazy chunk only to a URL that mounts the component fetching it", () => {
    const [mounted, quiet] = measurePages(dist, ["/", "/quiet"]);

    expect(mounted?.references.map((reference) => reference.name)).toEqual([
      "Loader",
    ]);
    expect(
      mounted?.assets
        .filter((asset) => asset.kind === "lazy")
        .map((asset) => asset.asset),
    ).toEqual(["static/chunks/island.js"]);

    expect(quiet?.references).toEqual([]);
    expect(quiet?.assets.map((asset) => asset.asset)).toEqual([
      "static/chunks/runtime.js",
      "static/chunks/loader.js",
    ]);
    expect(quiet?.lazyBrotliBytes).toBe(0);
    // The loader's own bytes are still charged: the document lists them, so a browser fetches
    // them. Only the deferred import it never triggers is not.
    expect(quiet?.fetchedBrotliBytes).toBeLessThan(
      mounted?.fetchedBrotliBytes ?? 0,
    );
  });

  it("names the client references of a document in the printed breakdown", () => {
    const printed = formatChunkList(measurePages(dist, ["/", "/quiet"]));

    expect(printed).toContain("client references: Loader");
    expect(printed).toContain("client references: none");
  });

  it("exits non-zero on a breach and 0 when everything fits", () => {
    const out: string[] = [];
    const write = (chunk: string): number => out.push(chunk);
    expect(main(["--dist", dist, "--url", "/"], { write }, { write })).toBe(1);
    expect(out.join("")).toContain("Brotli-encoded JavaScript");
    expect(out.join("")).toContain("over the 128 KB");
    out.length = 0;
    // `--url /small` is a fixture route, so it has no baseline row; the "nothing guards this
    // route" breach TASK-056 added is expected here and is asserted separately below.
    expect(
      main(["--dist", dist, "--url", "/small"], { write }, { write }),
    ).toBe(1);
    expect(out.join("")).toContain("has no row in");
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
    // Clean of both markers, and — like a real Turbopack client chunk — it names the chunk its
    // deferred import will request. Whether that chunk is charged depends on whether the document
    // *mounts* this one (TASK-085); `/` and `/en` list it without mounting it, `/banner` mounts it.
    writeFileSync(
      join(dist, "static/chunks/clean.js"),
      'export const a=1;const b=_zodiac;e.v(t=>Promise.all(["static/chunks/lazy-zod.js"].map(t=>e.l(t))).then(()=>t(58628)));',
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
    // The same clean page at a URL the committed baseline has a row for: `main()` measures the
    // baseline too, and `/` has no row since spec 003 §14 A16 made it a 308.
    writeFileSync(
      join(dist, "server/app/de.html"),
      '<script src="/_next/static/chunks/clean.js"></script>' +
        '<script src="/_next/static/chunks/legacy.js" noModule=""></script>',
    );
    writeFileSync(
      join(dist, "server/app/en.html"),
      '<script src="/_next/static/chunks/clean.js"></script>' +
        '<script src="/_next/static/chunks/zod.js"></script>' +
        '<script src="/_next/static/chunks/sentry.js"></script>',
    );
    // `/review 26`'s finding, as a fixture: a document whose own scripts are clean and whose
    // route defers a zod-carrying chunk through a lazy import. Before the fix this page measured
    // 0 forbidden modules and 5 KB.
    writeFileSync(
      join(dist, "static/chunks/lazy-zod.js"),
      `class $ZodError extends Error{};${"/*pad*/".repeat(500)}`,
    );
    writeFileSync(
      join(dist, "server/app/banner.html"),
      '<script src="/_next/static/chunks/clean.js"></script>' +
        '<script>self.__next_f.push([1,"4:I[9,[\\"/_next/static/chunks/clean.js\\"],\\"BannerLoader\\"]\\n"])</script>',
    );
    writeFileSync(
      join(dist, "app-path-routes-manifest.json"),
      JSON.stringify({
        "/(chooser)/page": "/",
        "/[locale]/page": "/[locale]",
        "/banner/page": "/banner",
      }),
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

  /**
   * The assertion whose absence let the regression ship (`/review 26`): the island's chunk is not
   * in any document, so a check that reads only `<script src>` cannot see what it contains.
   */
  it("sees a forbidden module in a lazy chunk no document lists", () => {
    const [page] = measurePages(dist, ["/banner"]);

    expect(
      [...(page?.assets ?? [])]
        .map((asset) => [asset.asset, asset.kind])
        .sort(),
    ).toEqual([
      ["static/chunks/clean.js", "document"],
      ["static/chunks/lazy-zod.js", "lazy"],
    ]);
    expect(forbiddenModuleHits(dist, [page as PageMeasurement])).toEqual([
      { url: "/banner", asset: "static/chunks/lazy-zod.js", label: "zod" },
    ]);
  });

  it("counts a lazy chunk's bytes, so the budget cannot be met by deferring", () => {
    const [page] = measurePages(dist, ["/banner"]);
    const lazy = page?.assets.find((asset) => asset.kind === "lazy");

    expect(lazy?.brotliBytes ?? 0).toBeGreaterThan(0);
    expect(page?.fetchedBrotliBytes).toBe(
      (page?.assets ?? []).reduce(
        (total, asset) => total + asset.brotliBytes,
        0,
      ),
    );
  });

  it("makes `pnpm budget:client-js` exit non-zero for a lazily fetched zod", () => {
    const out: string[] = [];
    const write = (chunk: string): number => out.push(chunk);

    expect(
      main(["--dist", dist, "--url", "/banner"], { write }, { write }),
    ).toBe(1);
    expect(out.join("")).toContain("`zod` in its client bundle");
    expect(out.join("")).toContain("[lazy, fetched after hydration]");
  });

  it("maps a URL to its app-router entry, route group and dynamic segment included", () => {
    expect(routeEntryFor(dist, "/")).toBe("/(chooser)/page");
    expect(routeEntryFor(dist, "/en")).toBe("/[locale]/page");
    expect(routeEntryFor(dist, "/de")).toBe("/[locale]/page");
    expect(routeEntryFor(dist, "/banner")).toBe("/banner/page");
    expect(routeEntryFor(dist, "/a/b/c")).toBeNull();
  });

  it("lists every chunk a loader stub names as a candidate, and throws when it cannot tell", () => {
    // App-level, as the loadable manifest was: `/en` mounts nothing that runs the import, which is
    // `reachableAssets()`'s question, not this one's.
    expect(lazyCandidatesFor(dist, "/en")).toEqual([
      { asset: "static/chunks/lazy-zod.js", noModule: false, kind: "lazy" },
    ]);
    expect(() => lazyCandidatesFor(dist, "/a/b/c")).toThrow(
      /no app-router entry/,
    );
    expect(() =>
      routeEntryFor(mkdtempSync(join(tmpdir(), "fo-empty-")), "/"),
    ).toThrow(/pnpm build/);
    // A routes manifest and no chunk directory: "no lazy chunks" would be a guess.
    const bare = mkdtempSync(join(tmpdir(), "fo-bare-"));
    writeFileSync(
      join(bare, "app-path-routes-manifest.json"),
      JSON.stringify({ "/[locale]/page": "/[locale]" }),
    );
    expect(() => lazyCandidatesFor(bare, "/en")).toThrow(
      /static\/chunks — run `pnpm build` first/,
    );
    rmSync(bare, { recursive: true, force: true });
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
    expect(main(["--dist", dist, "--url", "/de"], { write }, { write })).toBe(
      0,
    );
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

describe("parseClientReferences (which Client Components a document mounts)", () => {
  it('reads the `I[id,[chunks],"Name"]` rows out of the escaped flight payload', () => {
    const html =
      '<script>self.__next_f.push([1,"3:I[63491,[\\"/_next/static/chunks/a.js\\",' +
      '\\"/_next/static/chunks/b.js\\"],\\"default\\"]\\n"])</script>' +
      '<script>self.__next_f.push([1,"4:I[64460,[\\"/_next/static/chunks/a.js\\"],' +
      '\\"LocaleSuggestionBannerLoader\\"]\\n"])</script>';

    expect(parseClientReferences(html)).toEqual([
      {
        id: "63491",
        name: "default",
        chunks: ["static/chunks/a.js", "static/chunks/b.js"],
      },
      {
        id: "64460",
        name: "LocaleSuggestionBannerLoader",
        chunks: ["static/chunks/a.js"],
      },
    ]);
  });

  it("counts a reference once and answers `[]` for a document with no payload", () => {
    const row = '3:I[7,[\\"/_next/static/chunks/a.js\\"],\\"Loader\\"]\\n';

    expect(parseClientReferences(`<script>${row}${row}</script>`)).toHaveLength(
      1,
    );
    expect(
      parseClientReferences("<html><body>no scripts</body></html>"),
    ).toEqual([]);
  });

  // Next 16.4 (TASK-375; the carry-forward TASK-376 closes): each chunk path is written once, as
  // its own flight row, and a reference names the row. The shapes below are the ones CI's 16.4.2
  // build wrote into `.next/server/app/en.html` (run 39965504535).
  it("resolves the Next 16.4 form: `$row` references to chunk rows, in the HTML payload", () => {
    const html =
      '<script>self.__next_f.push([1,"1:\\"$Sreact.fragment\\"\\n2:\\"/_next/static/chunks/f.js\\"\\n' +
      '3:I[836782,[\\"$2\\"],\\"default\\"]\\n"])</script>' +
      '<script>self.__next_f.push([1,"1b:\\"/_next/static/chunks/a.js\\"\\n' +
      '1c:\\"/_next/static/chunks/e.js\\"\\n' +
      '1d:I[144668,[\\"$2\\",\\"$1b\\",\\"$1c\\"],\\"default\\"]\\n"])</script>';

    expect(parseClientReferences(html)).toEqual([
      { id: "836782", name: "default", chunks: ["static/chunks/f.js"] },
      {
        id: "144668",
        name: "default",
        chunks: [
          "static/chunks/f.js",
          "static/chunks/a.js",
          "static/chunks/e.js",
        ],
      },
    ]);
  });

  it("reads a chunk row that opens a push string, and one in the raw `.rsc` form", () => {
    // The row is the first thing in its `self.__next_f.push([1,"…` string: no newline before it.
    const opening =
      '<script>self.__next_f.push([1,"2:\\"/_next/static/chunks/f.js\\"\\n"])</script>' +
      '<script>self.__next_f.push([1,"9:I[7,[\\"$2\\"],\\"Loader\\"]\\n"])</script>';
    expect(parseClientReferences(opening)).toEqual([
      { id: "7", name: "Loader", chunks: ["static/chunks/f.js"] },
    ]);

    // The `.rsc` file: unescaped quotes and real newlines.
    const rsc =
      '0:{"b":"x"}\n2:"/_next/static/chunks/f.js"\n' +
      '1b:"/_next/static/chunks/a.js"\n' +
      '29:I[317756,["$2","$1b"],"ConsentBannerLoader"]\n';
    expect(parseClientReferences(rsc)).toEqual([
      {
        id: "317756",
        name: "ConsentBannerLoader",
        chunks: ["static/chunks/f.js", "static/chunks/a.js"],
      },
    ]);
  });

  it("reads both forms side by side in one reference", () => {
    const html =
      '<script>self.__next_f.push([1,"1b:\\"/_next/static/chunks/a.js\\"\\n' +
      '3:I[63491,[\\"/_next/static/chunks/old.js\\",\\"$1b\\"],\\"default\\"]\\n"])</script>';

    expect(parseClientReferences(html)).toEqual([
      {
        id: "63491",
        name: "default",
        chunks: ["static/chunks/old.js", "static/chunks/a.js"],
      },
    ]);
  });

  it("throws on a `$row` reference whose chunk row is not in the document, naming both", () => {
    const missing =
      '<script>self.__next_f.push([1,"2:\\"/_next/static/chunks/f.js\\"\\n' +
      '1d:I[144668,[\\"$2\\",\\"$1c\\"],\\"default\\"]\\n"])</script>';
    expect(() => parseClientReferences(missing)).toThrow(
      'client reference 144668 names flight row $1c, and no chunk row 1c:"/_next/static/….js" is in the document',
    );

    // A row that exists but is not a chunk path (here, an export name the payload deduplicated)
    // is not a chunk either: reading it as one would charge a string, reading it as none would
    // hide one.
    const notAChunk =
      '<script>self.__next_f.push([1,"28:\\"ConsentBannerLoader\\"\\n' +
      '29:I[317756,[\\"$28\\"],\\"$28\\"]\\n"])</script>';
    expect(() => parseClientReferences(notAChunk)).toThrow(
      "client reference 317756 names flight row $28",
    );
  });
});

describe("reachableAssets (the edge the Turbopack runtime follows)", () => {
  let dist = "";

  beforeAll(() => {
    dist = mkdtempSync(join(tmpdir(), "fo-reach-"));
    mkdirSync(join(dist, "static/chunks"), { recursive: true });
    writeFileSync(
      join(dist, "static/chunks/root.js"),
      'e.l("static/chunks/first.js")',
    );
    writeFileSync(
      join(dist, "static/chunks/first.js"),
      'e.l("static/chunks/second.js")',
    );
    writeFileSync(join(dist, "static/chunks/second.js"), "export const x=1;");
    writeFileSync(join(dist, "static/chunks/orphan.js"), "export const y=1;");
  });

  afterAll(() => {
    rmSync(dist, { recursive: true, force: true });
  });

  const candidate = (asset: string) =>
    ({ asset, noModule: false, kind: "lazy" }) as const;

  it("follows a chain of dynamic imports and stops at what nothing names", () => {
    const found = reachableAssets(
      dist,
      ["static/chunks/root.js"],
      [
        candidate("static/chunks/first.js"),
        candidate("static/chunks/second.js"),
        candidate("static/chunks/orphan.js"),
      ],
    );

    expect(found.map((tag) => tag.asset).sort()).toEqual([
      "static/chunks/first.js",
      "static/chunks/second.js",
    ]);
  });

  it("charges nothing when the seed is empty — a document that mounts no island", () => {
    expect(
      reachableAssets(dist, [], [candidate("static/chunks/first.js")]),
    ).toEqual([]);
  });

  it("treats a chunk missing from the output as unfetchable rather than throwing", () => {
    expect(
      reachableAssets(
        dist,
        ["static/chunks/gone.js"],
        [candidate("static/chunks/first.js")],
      ),
    ).toEqual([]);
  });
});

describe("lazy candidates from Turbopack's loader stubs (TASK-376)", () => {
  let dist = "";
  /** The id CI's `consent-active` build carries (`tests/support/consent-active.ts`). */
  const GA4_FIXTURE = "G-FIXTURE00";

  afterEach(() => {
    vi.unstubAllEnvs();
  });
  const stub = (...assets: string[]): string =>
    `e.v(t=>Promise.all([${assets.map((asset) => `"${asset}"`).join(",")}].map(t=>e.l(t))).then(()=>t(1)))`;

  beforeAll(() => {
    dist = mkdtempSync(join(tmpdir(), "fo-lazy-"));
    mkdirSync(join(dist, "static/chunks"), { recursive: true });
    writeFileSync(
      join(dist, "app-path-routes-manifest.json"),
      JSON.stringify({ "/[locale]/page": "/[locale]" }),
    );
    // The layout's loader chunk, as CI's 16.4.2 build wrote it: one stub per lazy import.
    writeFileSync(
      join(dist, "static/chunks/loaders.js"),
      `${stub("static/chunks/popup.js")},${stub("static/chunks/sentence.js")},${stub("static/chunks/consent.js")}`,
    );
    writeFileSync(
      join(dist, "static/chunks/popup.js"),
      'q("data-fo-language-popup");',
    );
    // An interaction island of the deferred set, by its marker: fetched only on input.
    writeFileSync(
      join(dist, "static/chunks/sentence.js"),
      `performance.mark("fo:deferred:home-sentence");${stub("static/chunks/under-sentence.js")}`,
    );
    writeFileSync(join(dist, "static/chunks/under-sentence.js"), "x();");
    // The consent island names the settings panel, which is fetched only when "Settings" is pressed.
    // It carries its mark, so while nothing needs consent it is on-input itself (TASK-279).
    writeFileSync(
      join(dist, "static/chunks/consent.js"),
      `performance.mark("fo:consent:island");q("data-fo-consent-sheet");${stub("static/chunks/panel.js")}`,
    );
    writeFileSync(
      join(dist, "static/chunks/panel.js"),
      'h("div",{"data-fo-consent-panel":""});',
    );
    // The runtime's own list of the document's chunks is a string mention, not a loader stub.
    writeFileSync(
      join(dist, "static/chunks/runtime.js"),
      'R({otherChunks:["static/chunks/listed.js"]});',
    );
    writeFileSync(join(dist, "static/chunks/listed.js"), "y();");
  });

  afterAll(() => {
    rmSync(dist, { recursive: true, force: true });
  });

  it("reads every chunk path a loader stub requests, and nothing a plain string mentions", () => {
    expect(
      lazyChunksNamedIn(
        `${stub("static/chunks/a.js", "static/chunks/b.js")};${stub("static/chunks/c.js")}`,
      ),
    ).toEqual([
      "static/chunks/a.js",
      "static/chunks/b.js",
      "static/chunks/c.js",
    ]);
    expect(
      lazyChunksNamedIn('R({otherChunks:["static/chunks/listed.js"]});'),
    ).toEqual([]);
  });

  it("marks the deferred set's interaction islands and the consent settings panel as on-input", () => {
    expect(ON_INPUT_CHUNK_MARKERS).toEqual([
      "fo:deferred:home-sentence",
      "data-fo-consent-panel",
    ]);
  });

  it("adds the consent island's mark exactly while nothing needs consent (TASK-279)", () => {
    expect(CONSENT_ISLAND_MARKER).toBe("fo:consent:island");
    expect(onInputChunkMarkers({})).toEqual([
      "fo:deferred:home-sentence",
      "data-fo-consent-panel",
      "fo:consent:island",
    ]);
    // A malformed id loads no tag (`ga4MeasurementId`), so nothing needs consent.
    expect(
      onInputChunkMarkers({ NEXT_PUBLIC_GA4_MEASUREMENT_ID: "G-" }),
    ).toEqual([...ON_INPUT_CHUNK_MARKERS, "fo:consent:island"]);
    // The consent-active build: the sheet asks on load, so its chunk is page-load again.
    expect(
      onInputChunkMarkers({ NEXT_PUBLIC_GA4_MEASUREMENT_ID: GA4_FIXTURE }),
    ).toEqual(["fo:deferred:home-sentence", "data-fo-consent-panel"]);
  });

  it("finds the consent island by a mark only the island's module carries (TASK-279)", () => {
    // The chunk is found by the literal, so it must ship in the island's code and in no other
    // module: one more carrier would hide that module's chunk from the page load too.
    const root = resolve(import.meta.dirname, "../../src");
    const carriers = readdirSync(root, { recursive: true, encoding: "utf8" })
      .filter((file) => /\.(ts|tsx)$/u.test(file))
      .filter((file) =>
        readFileSync(join(root, file), "utf8").includes(CONSENT_ISLAND_MARKER),
      );
    expect(carriers).toEqual([
      join("modules", "ui", "consent", "ConsentBannerIsland.tsx"),
    ]);
    const island = readFileSync(
      join(root, "modules/ui/consent/ConsentBannerIsland.tsx"),
      "utf8",
    )
      .replace(/\/\*[\s\S]*?\*\//gu, "")
      .replace(/(^|[^:])\/\/.*$/gmu, "$1");
    expect(island).toContain(`performance.mark("${CONSENT_ISLAND_MARKER}")`);
  });

  it("offers every stub-named chunk but the on-input ones as a candidate", () => {
    // `under-sentence.js` is a candidate (nothing marks it), but only an on-input chunk names it,
    // so no page reaches it: the next case.
    expect(
      lazyCandidatesFor(dist, "/en", {
        NEXT_PUBLIC_GA4_MEASUREMENT_ID: GA4_FIXTURE,
      }).map((tag) => tag.asset),
    ).toEqual([
      "static/chunks/consent.js",
      "static/chunks/popup.js",
      "static/chunks/under-sentence.js",
    ]);
    // Nothing needs consent: the island is fetched only on a press, so it is no candidate.
    expect(lazyCandidatesFor(dist, "/en", {}).map((tag) => tag.asset)).toEqual([
      "static/chunks/popup.js",
      "static/chunks/under-sentence.js",
    ]);
  });

  it("charges a page that mounts the loaders the page-load chunks, and none of the on-input ones", () => {
    mkdirSync(join(dist, "server/app"), { recursive: true });
    writeFileSync(
      join(dist, "server/app/en.html"),
      '<script src="/_next/static/chunks/runtime.js"></script>' +
        '<script>self.__next_f.push([1,"3:I[7,[\\"/_next/static/chunks/loaders.js\\"],\\"Loaders\\"]\\n"])</script>',
    );
    vi.stubEnv("NEXT_PUBLIC_GA4_MEASUREMENT_ID", GA4_FIXTURE);
    const [page] = measurePages(dist, ["/en"]);
    expect(
      (page?.assets ?? []).map((asset) => [asset.asset, asset.kind]).sort(),
    ).toEqual([
      ["static/chunks/consent.js", "lazy"],
      ["static/chunks/loaders.js", "lazy"],
      ["static/chunks/popup.js", "lazy"],
      ["static/chunks/runtime.js", "document"],
    ]);
  });

  it("charges no consent island to a page load while nothing needs consent (TASK-279)", () => {
    // `server/app/en.html` from the previous case; the build's environment carries no GA4 id.
    vi.stubEnv("NEXT_PUBLIC_GA4_MEASUREMENT_ID", "");
    const [page] = measurePages(dist, ["/en"]);
    expect(
      (page?.assets ?? []).map((asset) => [asset.asset, asset.kind]).sort(),
    ).toEqual([
      ["static/chunks/loaders.js", "lazy"],
      ["static/chunks/popup.js", "lazy"],
      ["static/chunks/runtime.js", "document"],
    ]);
  });
});

describe("catalogueLeaks — no client chunk carries server-only copy (§14 A1 addendum)", () => {
  let dist = "";
  const probes = catalogueProbes();

  beforeAll(() => {
    dist = mkdtempSync(join(tmpdir(), "fo-catalogue-"));
    mkdirSync(join(dist, "static/chunks"), { recursive: true });
    mkdirSync(join(dist, "server/app"), { recursive: true });
    writeFileSync(
      join(dist, "app-path-routes-manifest.json"),
      JSON.stringify({ "/(chooser)/page": "/", "/[locale]/page": "/[locale]" }),
    );
    // A chunk with a bundled catalogue in it, exactly as a static `messages/en.json` import
    // shipped before TASK-085 — the probe values are taken from the shipped catalogue, so this
    // fixture cannot drift away from what it is meant to catch.
    writeFileSync(
      join(dist, "static/chunks/leaky.js"),
      `const m=${JSON.stringify(
        Object.fromEntries(probes.map((probe) => [probe.key, probe.value])),
      )};`,
    );
    writeFileSync(join(dist, "static/chunks/clean.js"), "export const a=1;");
    writeFileSync(
      join(dist, "server/app/index.html"),
      '<script src="/_next/static/chunks/clean.js"></script>',
    );
    // A clean page at a URL with a baseline row, for `main()` (see the zod fixture above).
    writeFileSync(
      join(dist, "server/app/de.html"),
      '<script src="/_next/static/chunks/clean.js"></script>',
    );
    writeFileSync(
      join(dist, "server/app/en.html"),
      '<script src="/_next/static/chunks/leaky.js"></script>',
    );
  });

  afterAll(() => {
    rmSync(dist, { recursive: true, force: true });
  });

  it("has a probe for every namespace it forbids, so the check cannot go quiet", () => {
    expect(probes.map((probe) => probe.namespace)).toEqual([
      ...CLIENT_FORBIDDEN_NAMESPACES,
    ]);
    for (const probe of probes) {
      expect(probe.value.length, probe.key).toBeGreaterThanOrEqual(24);
      expect(probe.key.startsWith(`${probe.namespace}.`), probe.key).toBe(true);
    }
  });

  it("names the URL, the chunk and the namespace of every leak", () => {
    const leaks = catalogueLeaks(dist, measurePages(dist, ["/", "/en"]));

    expect(leaks.map((leak) => [leak.url, leak.namespace])).toEqual(
      CLIENT_FORBIDDEN_NAMESPACES.map((namespace) => ["/en", namespace]),
    );
    expect(new Set(leaks.map((leak) => leak.asset))).toEqual(
      new Set(["static/chunks/leaky.js"]),
    );
  });

  it("finds nothing on a page whose chunks carry no copy", () => {
    expect(catalogueLeaks(dist, measurePages(dist, ["/"]))).toEqual([]);
  });

  it("makes `pnpm budget:client-js` exit non-zero and say which namespace leaked", () => {
    const out: string[] = [];
    const write = (chunk: string): number => out.push(chunk);

    expect(main(["--dist", dist, "--url", "/en"], { write }, { write })).toBe(
      1,
    );
    expect(out.join("")).toContain("catalogue in a fetched chunk");
    out.length = 0;
    expect(main(["--dist", dist, "--url", "/de"], { write }, { write })).toBe(
      0,
    );
    expect(out.join("")).toContain(
      "no fetched chunk contains home.*, catalog.*, media.* catalogue copy",
    );
  });
});

describe("segmentLeaks: no client chunk carries the locale rows (spec 003 AC-52 (c), T-52)", () => {
  let dist = "";
  const probes = segmentProbes();

  beforeAll(() => {
    dist = mkdtempSync(join(tmpdir(), "fo-segments-"));
    mkdirSync(join(dist, "static/chunks"), { recursive: true });
    mkdirSync(join(dist, "server/app"), { recursive: true });
    writeFileSync(
      join(dist, "app-path-routes-manifest.json"),
      JSON.stringify({ "/(chooser)/page": "/", "/[locale]/page": "/[locale]" }),
    );
    // A chunk with one German row segment in it, minified the way a bundled row array ships.
    writeFileSync(
      join(dist, "static/chunks/rows.js"),
      'const r={howItWorks:"so-funktioniert-es"};',
    );
    // The same word unquoted (in a comment or a longer string) is not a row value.
    writeFileSync(
      join(dist, "static/chunks/clean.js"),
      "/* so-funktioniert-es */export const a=1;",
    );
    writeFileSync(
      join(dist, "server/app/index.html"),
      '<script src="/_next/static/chunks/clean.js"></script>',
    );
    writeFileSync(
      join(dist, "server/app/en.html"),
      '<script src="/_next/static/chunks/rows.js"></script>',
    );
  });

  afterAll(() => {
    rmSync(dist, { recursive: true, force: true });
  });

  it("reads its probes from locales.data.ts: German and Polish segments English does not share", () => {
    expect(probes).toHaveLength(16);
    expect(probes).toContainEqual({
      locale: "de",
      key: "howItWorks",
      value: "so-funktioniert-es",
    });
    expect(probes).toContainEqual({
      locale: "pl",
      key: "delivery",
      value: "dostawa-i-platnosc",
    });
    for (const probe of probes) {
      expect(probe.value.length, probe.key).toBeGreaterThanOrEqual(8);
    }
  });

  it("finds a planted row segment and names the URL, chunk and segment", () => {
    expect(segmentLeaks(dist, measurePages(dist, ["/", "/en"]))).toEqual([
      {
        url: "/en",
        asset: "static/chunks/rows.js",
        locale: "de",
        key: "howItWorks",
        value: "so-funktioniert-es",
      },
    ]);
  });

  it("finds nothing on a page whose chunks carry no quoted segment", () => {
    expect(segmentLeaks(dist, measurePages(dist, ["/"]))).toEqual([]);
  });

  it("refuses to run with an empty probe set", () => {
    expect(() => segmentLeaks(dist, measurePages(dist, ["/en"]), [])).toThrow(
      /no locale path-segment probe/u,
    );
    expect(segmentProbes([])).toEqual([]);
  });
});

/**
 * TASK-056's three additions to the gate (spec 004 AC-25): the font budget, the committed
 * baseline with its 5 KB regression allowance, and the assertion behind "`/` ships zero
 * application JavaScript" — a claim spec 003 AC-7 made and nothing measured until now.
 */
describe("the AC-25 clauses TASK-056 added", () => {
  describe("font transfer (spec 004 §14 A21 clause 3's budgets, printed in the §11 table)", () => {
    it("reads the committed manifest and is inside every budget", () => {
      const fonts = fontTransfer(repoRoot);
      expect(fonts.faces.length).toBe(10);
      expect(fonts.lines.map((line) => [line.label, line.budgetBytes])).toEqual(
        [
          ["en/en-gb/de page", 90 * 1024],
          ["pl page", 120 * 1024],
          ["Caveat (product page only)", 30 * 1024],
          ["preloaded", 50 * 1024],
        ],
      );
      expect(fonts.preloadCount).toBe(2);
      expect(fonts.withinBudget).toBe(true);
      expect(fontBreaches(fonts)).toEqual([]);
    });

    it("charges every page the worst case, because /en names Polish places too", () => {
      const fonts = fontTransfer(repoRoot);
      const [latin, latinExt] = fonts.lines;
      // Both lines count the Latin and the Latin-Ext files of the four page faces.
      expect(latin?.bytes).toBe(latinExt?.bytes);
      expect(latin?.bytes).toBe(
        fonts.faces
          .filter((face) => !face.file.startsWith("caveat"))
          .reduce((sum, face) => sum + face.bytes, 0),
      );
      expect(fontBytesFor("/en", fonts)).toBe(latin?.bytes);
      expect(fontBytesFor("/pl/kwiaty", fonts)).toBe(latinExt?.bytes);
    });

    it("charges the Caveat line both Caveat files (breaker hole 4)", () => {
      const fonts = fontTransfer(repoRoot);
      const caveat = fonts.faces.filter((face) =>
        face.file.startsWith("caveat-"),
      );
      expect(caveat.map((face) => face.file).sort()).toEqual([
        "caveat-500-latin-ext.woff2",
        "caveat-500-latin.woff2",
      ]);
      expect(fonts.lines[2]?.label).toBe("Caveat (product page only)");
      expect(fonts.lines[2]?.bytes).toBe(
        caveat.reduce((sum, face) => sum + face.bytes, 0),
      );
    });

    it("picks the pl line for a /pl URL and the en line elsewhere, when the two differ (breaker hole 5)", () => {
      const fixture = {
        lines: [
          { label: "en/en-gb/de page", bytes: 1000, budgetBytes: 90 * 1024 },
          { label: "pl page", bytes: 2000, budgetBytes: 120 * 1024 },
          {
            label: "Caveat (product page only)",
            bytes: 3,
            budgetBytes: 30 * 1024,
          },
          { label: "preloaded", bytes: 4, budgetBytes: 50 * 1024 },
        ],
        preloadCount: 2,
        withinBudget: true,
        faces: [],
      };
      expect(fontBytesFor("/en", fixture)).toBe(1000);
      expect(fontBytesFor("/de/blumen", fixture)).toBe(1000);
      expect(fontBytesFor("/plants", fixture)).toBe(1000);
      expect(fontBytesFor("/pl", fixture)).toBe(2000);
      expect(fontBytesFor("/pl/kwiaty", fixture)).toBe(2000);
    });

    it("is not within budget when a listed preload file is missing from the manifest (breaker hole 6)", () => {
      const root = mkdtempSync(join(tmpdir(), "fo-fonts-"));
      const manifestPath = join(root, "src/modules/ui/fonts/subset.json");
      mkdirSync(dirname(manifestPath), { recursive: true });
      const manifest = JSON.parse(
        readFileSync(
          resolve(repoRoot, "src/modules/ui/fonts/subset.json"),
          "utf8",
        ),
      ) as { faces: { file: string }[] };
      writeFileSync(
        manifestPath,
        JSON.stringify({
          ...manifest,
          faces: manifest.faces.filter(
            (face) => face.file !== "alegreya-sans-700-latin.woff2",
          ),
        }),
      );
      const fonts = fontTransfer(root);
      expect(fonts.preloadCount).toBe(1);
      expect(fonts.withinBudget).toBe(false);
      rmSync(root, { recursive: true, force: true });
    });

    it("names the budget a line breaks, and a third preload", () => {
      const fonts = fontTransfer(repoRoot);
      const over = {
        ...fonts,
        lines: fonts.lines.map((line) =>
          line.label === "pl page"
            ? { ...line, bytes: line.budgetBytes + 1 }
            : line,
        ),
        preloadCount: 3,
      };
      const breaches = fontBreaches(over);
      expect(breaches).toHaveLength(2);
      expect(breaches[0]).toContain("pl page");
      expect(breaches[0]).toContain("120.0 KB");
      expect(breaches[1]).toContain("3 font files are preloaded");
    });
  });

  describe("the committed baseline and its regression allowance", () => {
    const baseline = readBaseline(repoRoot);

    it("exists, covers every measured route and states the budget it belongs to", () => {
      expect(baseline).not.toBeNull();
      expect(baseline?.budgetBytes).toBe(CLIENT_JS_BUDGET_BYTES);
      expect(baseline?.regressionAllowanceBytes).toBe(
        REGRESSION_ALLOWANCE_BYTES,
      );
      for (const url of ["/en", "/en-gb", "/de", "/pl"]) {
        expect(
          baseline?.routes[url],
          `${url} has no row in ${BASELINE_FILE}`,
        ).toBeGreaterThan(0);
      }
      // `/` is a 308 with no document (spec 003 §14 A16, AC-27 as restated): no row, not measured.
      expect(baseline?.routes["/"]).toBeUndefined();
      expect(DEFAULT_URLS).not.toContain("/");
    });

    it("reports a route that grew past the allowance, and not one inside it", () => {
      const page = (url: string, bytes: number): PageMeasurement =>
        ({
          url,
          assets: [],
          references: [],
          fetchedGzipBytes: bytes,
          fetchedBrotliBytes: bytes,
          documentBrotliBytes: bytes,
          lazyBrotliBytes: 0,
          budgetBytes: CLIENT_JS_BUDGET_BYTES,
          withinBudget: true,
        }) satisfies PageMeasurement;
      const committed = {
        budgetBytes: CLIENT_JS_BUDGET_BYTES,
        regressionAllowanceBytes: REGRESSION_ALLOWANCE_BYTES,
        routes: { "/a": 100_000, "/b": 100_000 },
      };

      const { grown, unknown } = regressions(committed, [
        page("/a", 100_000 + REGRESSION_ALLOWANCE_BYTES + 1),
        page("/b", 100_000 + REGRESSION_ALLOWANCE_BYTES),
        page("/c", 1),
      ]);
      expect(grown.map((regression) => regression.url)).toEqual(["/a"]);
      expect(grown[0]?.deltaBytes).toBe(REGRESSION_ALLOWANCE_BYTES + 1);
      // A route with no row is reported too: "no guard" and "guarded and fine" must not look
      // alike, which is the same rule `loadableAssetsFor` follows for a missing manifest.
      expect(unknown).toEqual(["/c"]);
    });

    it("treats a missing or malformed baseline as `no guard`, not as a pass", () => {
      expect(
        readBaseline(mkdtempSync(join(tmpdir(), "fo-baseline-"))),
      ).toBeNull();
      expect(regressions(null, []).unknown).toEqual([]);
    });
  });
});
