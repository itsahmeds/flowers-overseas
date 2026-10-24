/**
 * Spec 042 T-1 (unit) and AC-1 for idea 1, the photo morph (motion 14; TASK-307): the bytes the
 * idea adds against §5.3.0's caps. TASK-313 and every later idea extend this file with their rows,
 * and TASK-313 adds the build-output half (`pnpm budget:client-js`, the route budgets).
 *
 *  - **JS, 400 B Brotli** in the deferred motion module: the motion chunk's code with the switch
 *    on, less the same code with it off, each minified (terser) and Brotli-compressed as the
 *    chunk is. Measured inside the chunk, so the bytes the module already carries (event names,
 *    `querySelector`) are not charged twice. Red with the cap at the measured size less one.
 *  - **CSS, 400 B Brotli**: the growth of the shipped stylesheet (`compileScannedCss`, whitespace
 *    collapsed as the build's minifier does): the whole sheet, less the sheet without motion 14's
 *    block.
 *  - **HTML, 60 B per card**: a card gains none, because the name is the asset id its photograph
 *    box already carries and is set by the click (`tests/unit/interactions-morph.test.tsx`).
 *  - The product page's `<style data-fo-morph>` is recorded, not capped (the table has no product
 *    HTML cap for idea 1); its size goes into the brief's `## Result`.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { brotliCompressSync, constants } from "node:zlib";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { morphHeroRule } from "../../src/modules/ui/motion/morph.ts";

import { compileScannedCss } from "./support/tailwind.ts";

const repoRoot = resolve(__dirname, "../..");
const require = createRequire(import.meta.url);

/** §5.3.0's caps for idea 1, in Brotli bytes. */
export const MORPH_CAPS = { js: 400, css: 400, htmlPerCard: 60 } as const;

const brotli = (text: string): number =>
  brotliCompressSync(Buffer.from(text), {
    params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
  }).length;

/** A module's TypeScript as the browser runs it: types and imports gone. */
function transpiled(path: string): string {
  return ts
    .transpileModule(readFileSync(resolve(repoRoot, path), "utf8"), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        jsx: ts.JsxEmit.ReactJSX,
      },
    })
    .outputText.replaceAll(/^import [\s\S]*?;$/gm, "");
}

interface Terser {
  minify(
    code: string,
    options: object,
  ): Promise<{ readonly code?: string | undefined }>;
}

/** The motion chunk's code, minified, with the morph's switch at `on`. */
async function motionChunk(on: boolean): Promise<string> {
  const terser = require("next/dist/compiled/terser/bundle.min.js") as Terser;
  const morph = transpiled("src/modules/ui/motion/morph.ts").replaceAll(
    /^export /gm,
    "",
  );
  const island = transpiled(
    "src/modules/ui/motion/MotionIsland.tsx",
  ).replaceAll("INTERACTIONS.morph", String(on));
  const result = await terser.minify(`${morph}\n${island}`, {
    module: true,
    compress: { passes: 2 },
  });
  return result.code ?? "";
}

/** A stylesheet with its comments gone and its whitespace collapsed, as the build ships it. */
function minified(css: string): string {
  return css
    .replaceAll(/\/\*[\s\S]*?\*\//g, "")
    .replaceAll(/\s+/g, " ")
    .replaceAll(/\s*([{};:,>])\s*/g, "$1")
    .replaceAll(";}", "}")
    .trim();
}

/** Motion 14's block in the shipped stylesheet: its keyframes and its one `@media` block. */
function morphCss(css: string): string {
  const start = css.indexOf("@keyframes fo-morph-in");
  const media = css.indexOf(
    "@media (prefers-reduced-motion: no-preference) and (min-width: 64rem)",
    start,
  );
  let depth = 0;
  let cursor = css.indexOf("{", media);
  do {
    if (css[cursor] === "{") depth += 1;
    else if (css[cursor] === "}") depth -= 1;
    cursor += 1;
  } while (depth > 0 && cursor < css.length);
  expect(start).toBeGreaterThan(-1);
  expect(media).toBeGreaterThan(start);
  return css.slice(start, cursor);
}

describe("spec 042 AC-1, idea 1 (the morph): the bytes it adds", () => {
  it("adds at most 400 B Brotli to the motion module", async () => {
    const on = await motionChunk(true);
    const off = await motionChunk(false);
    expect(off).not.toContain("pageswap");
    expect(on).toContain("pageswap");
    const added = brotli(on) - brotli(off);
    console.info(`idea 1 JS: ${String(added)} B Brotli in the motion module`);
    expect(added).toBeGreaterThan(0);
    expect(added).toBeLessThanOrEqual(MORPH_CAPS.js);
  });

  it("adds at most 400 B Brotli to the shipped stylesheet", async () => {
    const sheet = await compileScannedCss(repoRoot);
    const block = morphCss(sheet);
    expect(block).toContain("::view-transition-group(*)");
    const added =
      brotli(minified(sheet)) - brotli(minified(sheet.replace(block, "")));
    console.info(`idea 1 CSS: ${String(added)} B Brotli`);
    expect(added).toBeLessThanOrEqual(MORPH_CAPS.css);
  });

  it("records the product page's opt-in", () => {
    const rule = morphHeroRule("fo-bq-001-hero") ?? "";
    const element = `<style data-fo-morph="">${rule}</style>`;
    console.info(
      `idea 1 product HTML: ${String(element.length)} B, ${String(brotli(element))} B Brotli alone`,
    );
    expect(rule).not.toBe("");
  });
});
