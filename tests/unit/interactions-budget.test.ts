/**
 * T-1 for spec 042's ideas, one row per idea of §5.3.0's byte table (AC-1). The first idea to land
 * creates this file; each later idea adds its row, and TASK-313 runs the table over all six.
 *
 * Idea 6, the route line (TASK-311): JS 0 B, CSS growth at most 300 B Brotli, HTML growth at most
 * 1,024 B uncompressed on the corridor page.
 *
 *  - **CSS** is the growth of the stylesheet: Tailwind compiles `globals.css` with and without the
 *    idea's section (the same candidates both times), and the two outputs are Brotli'd at the
 *    build's quality after a whitespace minify (comments, runs of spaces); the build's minifier
 *    also shortens values, so this can only over-state what ships.
 *  - **HTML** is the corridor document's growth: the page rendered as shipped against the page
 *    rendered with the switch off and the first screen's one addition (its `relative`
 *    class) taken back out, which is the document before the diff.
 *  - **JS**: the route line and its switch are server modules (no `"use client"`, no hook), so no
 *    byte reaches a client bundle; `pnpm budget:client-js` holds the route budgets in CI.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { brotliCompressSync, constants } from "node:zlib";

import { describe, expect, it, vi } from "vitest";

import { corridorView } from "../../src/modules/geo";
import { CorridorPage } from "../../src/modules/geo/ui/CorridorPage.tsx";

import { renderCorridor } from "./support/corridor-render.tsx";
import { compileGlobalsCss, GLOBALS_CSS } from "./support/tailwind.ts";

const repoRoot = resolve(__dirname, "../..");

/** §5.3.0's caps for idea 6. */
const ROUTE_CAPS = { js: 0, cssBrotli: 300, html: 1024 } as const;

/**
 * The whitespace half of what the build's minifier does: comments dropped, runs of whitespace
 * collapsed, none left around `{ } ; : ,`, no `;` before `}`. Spaces inside `calc()` survive.
 */
const minify = (css: string): string =>
  css
    .replaceAll(/\/\*[\s\S]*?\*\//g, "")
    .replaceAll(/\s+/g, " ")
    .replaceAll(/\s*([{};:,])\s*/g, "$1")
    .replaceAll(";}", "}")
    .trim();

/** Brotli at the build's quality, over the minified CSS. */
const brotli = (text: string): number =>
  brotliCompressSync(Buffer.from(minify(text), "utf8"), {
    params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
  }).byteLength;

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
    // Not `"fo-route"` alone: since TASK-283 the motion 13 section carries its own
    // `fo-route-unroll` keyframes, which are not this idea's bytes and stay in `without`.
    expect(without).not.toContain("fo-route-draw");
    expect(without).not.toContain("fo-route-dot");
    expect(without).not.toContain("data-fo-route-line");
    const growth = brotli(withRoute) - brotli(without);
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
    const before = off.replace('class="relative grid ', 'class="grid ');
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
