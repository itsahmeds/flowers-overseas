/**
 * T-05 (unit half) / AC-4 (TASK-045): the committed font subsets are what the manifest says they
 * are, they fit the budget, and they cover every character any catalogue can render.
 *
 * AC-4 asks for "total font transfer per page ≤45 KB (build-output assertion)". Because every
 * document loads all three faces and each face is a **single** file with no unicode-range split,
 * the per-page total *is* the sum of the committed files — measurable here, offline, without a
 * build. `scripts/check-bundle-budget.ts` (TASK-056) re-asserts it against the real build output;
 * this test is what fails in five milliseconds when someone re-runs `pnpm fonts:build` with a
 * bigger repertoire.
 *
 * The coverage assertion is the interesting one. A subset that omits a character renders a tofu
 * box, and the character most likely to be omitted is exactly the one a translator adds next. So
 * every character of every committed catalogue must be in the repertoire — Polish `ą ć ę ł ń ó ś
 * ź ż` included, which is AC-4's Latin-Ext clause in the form a unit test can hold (the visual
 * `pl` baseline holds the "renders from the webfont, not a fallback" half).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  FACES,
  FONT_BUDGET_BYTES,
  FONT_DIR,
  readManifest,
  REPERTOIRE,
} from "../../scripts/fonts/build-fonts.ts";

const repoRoot = resolve(__dirname, "../..");
const manifest = readManifest(repoRoot);

function bytesOf(file: string): number {
  return statSync(resolve(repoRoot, FONT_DIR, file)).size;
}

describe("the committed font subsets (AC-4)", () => {
  it("ships exactly the three faces the design uses, and no italic", () => {
    expect(manifest.faces.map((face) => face.file)).toEqual(
      FACES.map((face) => face.file),
    );
    // §13 Q2: Newsreader display 500 roman only; IBM Plex Sans body 400 + 600.
    expect(
      manifest.faces.map((face) => `${face.family} ${String(face.weight)}`),
    ).toEqual(["Newsreader 500", "IBM Plex Sans 400", "IBM Plex Sans 600"]);
    for (const face of manifest.faces) {
      expect(face.file, face.file).toMatch(/\.woff2$/);
    }
  });

  it("records the real byte size of every committed file", () => {
    for (const face of manifest.faces) {
      expect(bytesOf(face.file), face.file).toBe(face.bytes);
    }
  });

  it("fits the ≤45 KB per-page budget across both families", () => {
    const total = manifest.faces.reduce((sum, face) => sum + face.bytes, 0);
    expect(manifest.totalBytes).toBe(total);
    expect(manifest.budgetBytes).toBe(FONT_BUDGET_BYTES);
    expect(
      total,
      `font transfer is ${String(total)} B, budget ${String(FONT_BUDGET_BYTES)} B`,
    ).toBeLessThanOrEqual(FONT_BUDGET_BYTES);
  });

  it("ships the licence of both families next to the files", () => {
    const files = readdirSync(resolve(repoRoot, FONT_DIR));
    expect(files).toContain("LICENSE-newsreader.txt");
    expect(files).toContain("LICENSE-ibm-plex-sans.txt");
    for (const licence of [
      "LICENSE-newsreader.txt",
      "LICENSE-ibm-plex-sans.txt",
    ]) {
      expect(
        readFileSync(resolve(repoRoot, FONT_DIR, licence), "utf8"),
        licence,
      ).toContain("SIL OPEN FONT LICENSE");
    }
    expect(manifest.licence).toContain("SIL Open Font License");
  });

  it("covers Latin and Latin-Ext, and the Polish diacritics by name", () => {
    for (const character of "ąćęłńóśźż".split("")) {
      expect(REPERTOIRE, character).toContain(character);
      expect(manifest.repertoire, character).toContain(character);
    }
    // German, Romanian and Turkish (Phase 4) too — §2's "Latin-Ext is non-negotiable".
    for (const character of "äöüßăâîșțçğış".split("")) {
      expect(REPERTOIRE, character).toContain(character);
    }
    expect(manifest.glyphCount).toBe(REPERTOIRE.length);
  });

  it("covers every character of every committed message catalogue", () => {
    const messagesDir = resolve(repoRoot, "messages");
    const covered = new Set(REPERTOIRE.split(""));
    const missing = new Map<string, string[]>();
    for (const file of readdirSync(messagesDir)) {
      if (!file.endsWith(".json") || file.includes(".meta.")) continue;
      const contents = readFileSync(resolve(messagesDir, file), "utf8");
      for (const character of new Set(contents.split(""))) {
        // Newlines and tabs are JSON structure, not glyphs.
        if (character === "\n" || character === "\r" || character === "\t")
          continue;
        if (covered.has(character)) continue;
        missing.set(character, [...(missing.get(character) ?? []), file]);
      }
    }
    expect(
      [...missing.keys()],
      `characters used in a catalogue but absent from the font subsets: ${[...missing.entries()].map(([character, files]) => `${character} (${files.join(", ")})`).join("; ")}`,
    ).toEqual([]);
  });
});

describe("the next/font/local declarations", () => {
  const source = readFileSync(
    resolve(repoRoot, "src/modules/ui/fonts/index.ts"),
    "utf8",
  );
  // The module's header *explains* why Google Fonts is not used, so the "no Google" assertion
  // below reads the code and not the prose.
  const code = source.replaceAll(/\/\*[\s\S]*?\*\//g, "");

  it("self-hosts every committed file and requests none from Google", () => {
    for (const face of FACES) expect(code).toContain(face.file);
    expect(code).not.toContain("next/font/google");
    expect(code).not.toContain("fonts.googleapis.com");
    expect(code).not.toContain("fonts.gstatic.com");
  });

  it("sets swap, preload and fallback metrics on both families (AC-4)", () => {
    expect(code.match(/display: "swap"/g)).toHaveLength(2);
    expect(code.match(/preload: true/g)).toHaveLength(2);
    expect(code).toContain('adjustFontFallback: "Times New Roman"');
    expect(code).toContain('adjustFontFallback: "Arial"');
  });

  it("publishes both variables through one string the layouts use", () => {
    expect(code).toContain("--font-newsreader");
    expect(code).toContain("--font-plex-sans");
    expect(code).toMatch(/export const fontVariables/);
  });
});
