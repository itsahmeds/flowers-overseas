/**
 * `pnpm fonts:wordmark` — outlines the wordmark to paths (spec 004 §14 A21 clause 3; TASK-175).
 *
 * The logo stays exactly as it ships (founder, 2026-10-03): the trading name in **Newsreader 500**
 * at the axis values the shipped file was pinned to (`opsz` 32), tracked `0.04em`
 * (`--tracking-wordmark`), kerned. A21 clause 3 removes every Newsreader file from the build, so
 * the wordmark becomes geometry: this script shapes `TRADING_NAME` with harfbuzz (the same engine
 * `subset-font` uses, resolved through it rather than added as a dependency), draws each glyph's
 * outline, and writes
 *
 *  - `src/modules/ui/icons/wordmark-paths.ts` — the path data and view box `Wordmark` renders
 *    inline, filled with `--color-logo-ink`;
 *  - `public/brand/wordmark.svg` — the same outlines as a standalone file, for anything outside
 *    the app (an e-mail, a partner pack), in the logo ink's sRGB equivalent, as
 *    `content/brand/mark.svg` does for the mark.
 *
 * Like `fonts:build`, it needs the network (or `--sources <dir>` holding
 * `Newsreader[opsz,wght].ttf`) and is run by hand; its output is committed.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { TRADING_NAME } from "../../src/config/company.data.ts";

const SOURCE =
  "https://raw.githubusercontent.com/google/fonts/main/ofl/newsreader/Newsreader%5Bopsz,wght%5D.ttf";
/** The shipped wordmark's instance: `src/modules/ui/fonts/subset.json` before TASK-175. */
export const WORDMARK_AXES = { opsz: 32, wght: 500 } as const;
/** `--tracking-wordmark`. */
export const WORDMARK_TRACKING_EM = 0.04;
/** The logo ink (`--color-logo-ink`, oklch(19% 0.01 250)) in sRGB, as `content/brand/mark.svg` writes it. */
const LOGO_INK_SRGB = "#26282f";

export const PATHS_FILE = "src/modules/ui/icons/wordmark-paths.ts";
export const SVG_FILE = "public/brand/wordmark.svg";

interface HbGlyph {
  readonly g: number;
  readonly ax: number;
  readonly dx: number;
  readonly dy: number;
}

interface Harfbuzz {
  createBlob(data: ArrayBuffer): { destroy(): void };
  createFace(blob: unknown, index: number): { upem: number; destroy(): void };
  createFont(face: unknown): {
    setVariations(variations: Record<string, number>): void;
    glyphToPath(glyph: number): string;
    hExtents(): { ascender: number; descender: number };
    destroy(): void;
  };
  createBuffer(): {
    addText(text: string): void;
    guessSegmentProperties(): void;
    json(): HbGlyph[];
    destroy(): void;
  };
  shape(font: unknown, buffer: unknown): void;
}

/** Rounds a font-unit coordinate to one decimal: sub-pixel at any size the logo is drawn. */
const round = (value: number): number => Math.round(value * 10) / 10;

/** Moves every coordinate of an SVG path by `dx` and flips it into SVG's y-down space. */
function place(path: string, dx: number, dy: number): string {
  return path.replace(
    /([MLQCZ])([^MLQCZ]*)/g,
    (_match, command: string, args: string) => {
      const values = args
        .trim()
        .split(/[\s,]+/)
        .filter((value) => value.length > 0)
        .map(Number);
      const moved = values.map((value, index) =>
        index % 2 === 0 ? round(value + dx) : round(-(value + dy)),
      );
      return `${command}${moved.join(" ")}`;
    },
  );
}

async function main(root: string, sourcesDir: string | undefined) {
  const requireFromSubset = createRequire(
    createRequire(import.meta.url).resolve("subset-font"),
  );
  const hb = await (requireFromSubset("harfbuzzjs") as Promise<Harfbuzz>);
  const font =
    sourcesDir === undefined
      ? Buffer.from(await (await fetch(SOURCE)).arrayBuffer())
      : readFileSync(resolve(sourcesDir, "Newsreader[opsz,wght].ttf"));

  const blob = hb.createBlob(
    font.buffer.slice(font.byteOffset, font.byteOffset + font.byteLength),
  );
  const face = hb.createFace(blob, 0);
  const hbFont = hb.createFont(face);
  hbFont.setVariations({ ...WORDMARK_AXES });
  const buffer = hb.createBuffer();
  buffer.addText(TRADING_NAME);
  buffer.guessSegmentProperties();
  hb.shape(hbFont, buffer);
  const glyphs = buffer.json();
  const tracking = WORDMARK_TRACKING_EM * face.upem;
  const { ascender, descender } = hbFont.hExtents();

  let x = 0;
  const parts: string[] = [];
  glyphs.forEach((glyph, index) => {
    const outline = hbFont.glyphToPath(glyph.g);
    if (outline.length > 0) parts.push(place(outline, x + glyph.dx, glyph.dy));
    // CSS letter-spacing adds after every character; the last one's trailing space is not ink.
    x += glyph.ax + (index === glyphs.length - 1 ? 0 : tracking);
  });
  const d = parts.join("");
  const width = Math.ceil(x);
  const top = Math.floor(-ascender);
  const height = Math.ceil(ascender - descender);
  const viewBox = `0 ${String(top)} ${String(width)} ${String(height)}`;

  buffer.destroy();
  hbFont.destroy();
  face.destroy();
  blob.destroy();

  writeFileSync(
    resolve(root, PATHS_FILE),
    `/**
 * The wordmark's outlines — ${TRADING_NAME} in Newsreader 500, opsz ${String(WORDMARK_AXES.opsz)}, tracked ${String(WORDMARK_TRACKING_EM)}em
 * (spec 004 §14 A21 clause 3; TASK-175). **Generated by \`pnpm fonts:wordmark\`
 * (\`scripts/fonts/build-wordmark.ts\`); do not edit.** Font units, y down; \`Wordmark\` renders it.
 */
export const WORDMARK_VIEW_BOX = "${viewBox}";

export const WORDMARK_PATH =
  "${d}";
`,
  );
  mkdirSync(dirname(resolve(root, SVG_FILE)), { recursive: true });
  writeFileSync(
    resolve(root, SVG_FILE),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="${TRADING_NAME}"><path fill="${LOGO_INK_SRGB}" d="${d}"/></svg>\n`,
  );
  process.stdout.write(
    `wordmark: ${String(glyphs.length)} glyphs, view box ${viewBox}, ${String(d.length)} characters of path data\n`,
  );
}

const isMain =
  typeof process.argv[1] === "string" &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const argv = process.argv.slice(2);
  const flag = argv.indexOf("--sources");
  await main(
    process.cwd(),
    flag === -1 ? undefined : resolve(argv[flag + 1] ?? "."),
  );
}
