/**
 * T-1 for spec 042's ideas, one row per idea of §5.3.0's byte table (AC-1). The first idea to land
 * creates this file; each later idea adds its row, and TASK-313 runs the table over all six.
 *
 * Idea 2, the card preview (TASK-308): JS at most 160 B Brotli inside the product island and
 * 160 B inside `CardCounter`, CSS growth at most 300 B Brotli, 0 B of HTML on listings.
 *
 *  - **CSS** is the growth of the shipped stylesheet: Tailwind compiles `globals.css` over the
 *    candidates the build's own scan finds, once as shipped and once with the idea's section cut out
 *    and the utilities this idea introduced taken out of the candidates. Both are Brotli'd at the
 *    build's quality after a whitespace minify. Taking a utility out that another file also uses
 *    can only over-state the growth, never hide it.
 *  - **JS, product island**: `CardMessageField` bundled with React external, the way
 *    `checkout-ui-islands.test.ts` weighs checkout's, against its size before this idea (main at
 *    `e590959f`, the same harness). The idea's change replaced the island's sample bookkeeping with
 *    a write into the words line, so it is smaller than before.
 *  - **JS, `CardCounter`**: unchanged by this idea (0 B); checkout's preview is drawn by the
 *    server and `CardCounter` already mirrors by field id. Its budget stays AC-38's 4,096 B for all
 *    checkout islands (`checkout-ui-islands.test.ts`).
 *  - **HTML on listings**: the preview is imported by the product page and checkout's primitive
 *    only, so no listing renders a byte of it.
 *
 * Idea 6, the route line (TASK-311): JS 0 B, CSS growth at most 300 B Brotli, HTML growth at most
 * 1,024 B uncompressed on the corridor page.
 *
 *  - **CSS** is the growth of the stylesheet: Tailwind compiles `globals.css` with and without the
 *    idea's section (the same candidates both times), and the two outputs are Brotli'd at the
 *    build's quality after a whitespace minify (comments, runs of spaces); the build's minifier
 *    also shortens values, so this can only over-state what ships.
 *  - **HTML** is the corridor document's growth: the page rendered as shipped against the page
 *    rendered with the switch off and the hero's two additions (`relative`, the
 *    `data-fo-corridor-hero` marker) taken back out, which is the document before the diff.
 *  - **JS**: the route line and its switch are server modules (no `"use client"`, no hook), so no
 *    byte reaches a client bundle; `pnpm budget:client-js` holds the route budgets in CI.
 */
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative, resolve } from "node:path";
import { brotliCompressSync, constants } from "node:zlib";

import { describe, expect, it, vi } from "vitest";

import { corridorView } from "../../src/modules/geo";
import { CorridorPage } from "../../src/modules/geo/ui/CorridorPage.tsx";

import { renderCorridor } from "./support/corridor-render.tsx";
import {
  compileGlobalsCss,
  GLOBALS_CSS,
  globalsSources,
} from "./support/tailwind.ts";

const repoRoot = resolve(__dirname, "../..");

/** §5.3.0's caps for idea 2. */
const CARD_PREVIEW_CAPS = {
  islandJsBrotli: 160,
  cardCounterJsBrotli: 160,
  cssBrotli: 300,
  listingHtml: 0,
} as const;

/** §5.3.0's caps for idea 6. */
const ROUTE_CAPS = { js: 0, cssBrotli: 300, html: 1024 } as const;

/** The product island's Brotli bytes in this harness before idea 2 (main `e590959f`). */
const PRODUCT_ISLAND_BEFORE_BROTLI = 1231;

/** Spec 009 AC-14 and spec 042 L5: the product page's one island, at most 2,048 B Brotli. */
const PRODUCT_ISLAND_CAP_BROTLI = 2048;

/**
 * The utilities idea 2 added to the shipped stylesheet (the card's phone order and the phone
 * field's content sizing); every other class it uses was already shipped.
 */
const CARD_PREVIEW_UTILITIES = [
  "max-md:order-first",
  "max-md:[field-sizing:content]",
  "max-md:supports-[field-sizing:content]:pb-[56px]",
  "md:min-h-[190px]",
] as const;

const SECTION_START = "/*\n * Spec 042 idea 2, the card preview";
const SECTION_END = "/* end of spec 042 idea 2 */";

/**
 * The whitespace half of what the build's minifier does: comments dropped, runs of whitespace
 * collapsed, none left around `{ } ; : ,`, no `;` before `}`.
 */
const minify = (css: string): string =>
  css
    .replaceAll(/\/\*[\s\S]*?\*\//g, "")
    .replaceAll(/\s+/g, " ")
    .replaceAll(/\s*([{};:,])\s*/g, "$1")
    .replaceAll(";}", "}")
    .trim();

const brotli = (text: string): number =>
  brotliCompressSync(Buffer.from(text, "utf8"), {
    params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
  }).byteLength;

/** `globals.css` with idea 2's section cut out, from its header comment to its end marker. */
function withoutCardPreviewSection(source: string): string {
  const start = source.indexOf(SECTION_START);
  const end = source.indexOf(SECTION_END);
  if (start === -1 || end === -1) {
    throw new Error("idea 2's section markers are missing");
  }
  return source.slice(0, start) + source.slice(end + SECTION_END.length);
}

/** Bundles one client module with vite (vitest's own dependency), React external, minified. */
async function bundle(entry: string): Promise<string> {
  const requireFromVitest = createRequire(
    createRequire(import.meta.url).resolve("vitest/package.json"),
  );
  const vite = (await import(requireFromVitest.resolve("vite"))) as {
    build: (config: Record<string, unknown>) => Promise<unknown>;
  };
  const result = await vite.build({
    configFile: false,
    logLevel: "silent",
    mode: "production",
    // The production JSX runtime, as `next build` emits: no file names or line numbers in the
    // bundle, so the bytes do not depend on where the checkout sits.
    oxc: { jsx: { development: false } },
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    root: `${repoRoot}/`,
    resolve: { alias: { "@/": `${repoRoot}/src/` } },
    build: {
      write: false,
      minify: true,
      lib: { entry, formats: ["es"], fileName: "island" },
      rollupOptions: {
        external: [/^react(\/.*)?$/, /^react-dom(\/.*)?$/],
      },
    },
  });
  const outputs = (Array.isArray(result) ? result : [result]) as {
    output: { type: string; code?: string }[];
  }[];
  return outputs
    .flatMap((built) => built.output)
    .filter((chunk) => chunk.type === "chunk")
    .map((chunk) => chunk.code ?? "")
    .join("\n");
}

/** Every `.ts`/`.tsx` file under `dir`. */
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx?$/u.test(entry.name) ? [path] : [];
  });
}

describe("idea 2, the card preview, against §5.3.0's caps (AC-1)", () => {
  it(`grows the stylesheet by at most ${String(CARD_PREVIEW_CAPS.cssBrotli)} B Brotli`, async () => {
    const source = readFileSync(resolve(repoRoot, GLOBALS_CSS), "utf8");
    const { Scanner } = await import("@tailwindcss/oxide");
    const scanned = new Scanner({
      sources: [...(await globalsSources(repoRoot))],
    }).scan();
    // The list is not stale: every utility it names is in what ships.
    for (const utility of CARD_PREVIEW_UTILITIES) {
      expect(scanned, utility).toContain(utility);
    }
    const shipped = await compileGlobalsCss(repoRoot, scanned, source);
    const before = await compileGlobalsCss(
      repoRoot,
      scanned.filter(
        (candidate) =>
          !(CARD_PREVIEW_UTILITIES as readonly string[]).includes(candidate),
      ),
      withoutCardPreviewSection(source),
    );
    expect(shipped).toContain("[data-fo-card-swap]");
    expect(before).not.toContain("data-fo-card-swap");
    expect(before).not.toContain("data-fo-card-sample");
    const growth = brotli(minify(shipped)) - brotli(minify(before));
    // The number the brief's `## Result` records.
    console.info(`idea 2 CSS growth: ${String(growth)} B Brotli`);
    expect(growth).toBeGreaterThan(0);
    expect(growth).toBeLessThanOrEqual(CARD_PREVIEW_CAPS.cssBrotli);
  });

  it(`grows the product island by at most ${String(CARD_PREVIEW_CAPS.islandJsBrotli)} B Brotli, and keeps it under ${String(PRODUCT_ISLAND_CAP_BROTLI)} B`, async () => {
    const code = await bundle(
      resolve(repoRoot, "src/modules/ui/product/CardMessageField.tsx"),
    );
    // The bundle is the island: it carries the build check's marker (AC-37).
    expect(code).toContain("[data-fo-card-text]");
    const bytes = brotli(code);
    console.info(
      `idea 2 product island: ${String(bytes)} B Brotli (before ${String(PRODUCT_ISLAND_BEFORE_BROTLI)} B)`,
    );
    expect(bytes - PRODUCT_ISLAND_BEFORE_BROTLI).toBeLessThanOrEqual(
      CARD_PREVIEW_CAPS.islandJsBrotli,
    );
    expect(bytes).toBeLessThanOrEqual(PRODUCT_ISLAND_CAP_BROTLI);
  });

  it(`adds ${String(CARD_PREVIEW_CAPS.cardCounterJsBrotli)} B or less to \`CardCounter\`: the preview and its switch are server modules`, () => {
    for (const file of [
      "src/modules/ui/product/PrintedCardPreview.tsx",
      "src/config/interactions.ts",
    ]) {
      const text = readFileSync(resolve(repoRoot, file), "utf8");
      expect(text, file).not.toMatch(/^\s*["']use client["']/m);
      expect(text, file).not.toMatch(/\buse(State|Effect|LayoutEffect|Ref)\b/);
    }
    // `CardCounter` mirrors by field id into whatever preview the server drew; it names no part
    // of the card, so the card can change without it.
    const counter = readFileSync(
      resolve(repoRoot, "src/modules/ui/checkout/CardCounter.tsx"),
      "utf8",
    );
    expect(counter).not.toMatch(/data-fo-card-|PrintedCardPreview/u);
  });

  it(`adds ${String(CARD_PREVIEW_CAPS.listingHtml)} B to listings: only the product page and checkout's primitive draw the preview`, () => {
    const importers = sources(resolve(repoRoot, "src"))
      .filter((file) =>
        /from\s+["'][^"']*PrintedCardPreview(\.tsx)?["']/u.test(
          readFileSync(file, "utf8"),
        ),
      )
      .map((file) => relative(repoRoot, file))
      .sort();
    expect(importers).toEqual([
      "src/modules/ui/checkout/TextAreaWithCounter.tsx",
      "src/modules/ui/product/ProductPage.tsx",
    ]);
  });
});

/** `globals.css` with idea 6's section cut out: from its header comment to the end of the file. */
function withoutRouteSection(source: string): string {
  const start = source.indexOf("/*\n * Spec 042 idea 6, the route line");
  if (start === -1) throw new Error("idea 6's section header is missing");
  return source.slice(0, start);
}

async function corridorHtml(): Promise<string> {
  const view = corridorView("PL", "en-gb", { from: "2026-09-15" });
  if (view === undefined) throw new Error("the en-gb Poland guide must exist");
  return renderCorridor(view, "en-gb");
}

describe("idea 6, the route line, against §5.3.0's caps (AC-1)", () => {
  const source = readFileSync(resolve(repoRoot, GLOBALS_CSS), "utf8");

  it(`grows the stylesheet by at most ${String(ROUTE_CAPS.cssBrotli)} B Brotli`, async () => {
    const withRoute = await compileGlobalsCss(repoRoot, undefined, source);
    const without = await compileGlobalsCss(
      repoRoot,
      undefined,
      withoutRouteSection(source),
    );
    expect(withRoute).toContain("@keyframes fo-route-draw");
    expect(without).not.toContain("fo-route");
    const growth = brotli(minify(withRoute)) - brotli(minify(without));
    // The number the brief's `## Result` records.
    console.info(`idea 6 CSS growth: ${String(growth)} B Brotli`);
    expect(growth).toBeGreaterThan(0);
    expect(growth).toBeLessThanOrEqual(ROUTE_CAPS.cssBrotli);
  });

  it(`grows the corridor document by at most ${String(ROUTE_CAPS.html)} B`, async () => {
    const on = await corridorHtml();
    vi.resetModules();
    vi.doMock("../../src/config/interactions.ts", () => ({
      interactions: { routeLine: false },
    }));
    const off = await corridorHtml();
    vi.doUnmock("../../src/config/interactions.ts");
    const before = off
      .replace(' data-fo-corridor-hero=""', "")
      .replace('class="relative grid ', 'class="grid ');
    expect(before).not.toBe(off);
    const growth =
      Buffer.byteLength(on, "utf8") - Buffer.byteLength(before, "utf8");
    console.info(`idea 6 HTML growth: ${String(growth)} B uncompressed`);
    expect(growth).toBeGreaterThan(0);
    expect(growth).toBeLessThanOrEqual(ROUTE_CAPS.html);
  });

  it(`adds ${String(ROUTE_CAPS.js)} B of client script: server modules only`, () => {
    for (const file of [
      "src/modules/geo/ui/CorridorRouteLine.tsx",
      "src/config/interactions.ts",
    ]) {
      const text = readFileSync(resolve(repoRoot, file), "utf8");
      expect(text, file).not.toMatch(/^\s*["']use client["']/m);
      expect(text, file).not.toMatch(/\buse(State|Effect|LayoutEffect|Ref)\b/);
    }
  });

  it("is still the page the rest of the suite renders", () => {
    // The static import keeps this file in the corridor page's test set for `gates:cheap`.
    expect(typeof CorridorPage).toBe("function");
  });
});
