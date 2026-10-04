/**
 * T-05 (unit half) / AC-4 as amended by spec 004 §14 A21 clause 3 (TASK-045, TASK-175): the
 * committed font subsets are exactly A21's smallest compliant set, they fit A21's budgets, they
 * cover every character any catalogue can render, and the `next/font/local` declarations load,
 * split and preload them as the clause says.
 *
 * The browser half (`tests/e2e/fonts.spec.ts`) proves what only a served page can: the preload
 * links in the `<head>`, `swap` and the fallback metrics in the emitted `@font-face`, the bytes a
 * real `en` and `pl` page transfer, and zero requests to Google Fonts.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  FACES,
  FONT_BUDGETS,
  FONT_DIR,
  fontFile,
  handFontBytes,
  MAX_PRELOADS,
  pageFontBytes,
  PRELOADED_FILES,
  readManifest,
  repertoireOf,
  REPERTOIRE,
  SUBSETS,
  subsetOf,
  unicodeRange,
} from "../../scripts/fonts/build-fonts.ts";

const repoRoot = resolve(__dirname, "../..");
const manifest = readManifest(repoRoot);

function bytesOf(file: string): number {
  return statSync(resolve(repoRoot, FONT_DIR, file)).size;
}

const KB = 1024;

describe("the committed font subsets (A21 clause 3)", () => {
  it("ships exactly A21's faces — Fraunces 400 and 300 italic, Alegreya Sans 400 and 700, Caveat 500 — each as a Latin and a Latin-Ext file", () => {
    expect(
      FACES.map(
        (face) => `${face.family} ${String(face.weight)} ${face.style}`,
      ),
    ).toEqual([
      "Fraunces 400 normal",
      "Fraunces 300 italic",
      "Alegreya Sans 400 normal",
      "Alegreya Sans 700 normal",
      "Caveat 500 normal",
    ]);
    const expected = FACES.flatMap((face) =>
      SUBSETS.map((subset) => fontFile(face, subset)),
    );
    expect(manifest.faces.map((face) => face.file)).toEqual(expected);
    // Nothing else in the directory: no Newsreader, no IBM Plex, no stray instance.
    const woff2 = readdirSync(resolve(repoRoot, FONT_DIR))
      .filter((file) => file.endsWith(".woff2"))
      .sort();
    expect(woff2).toEqual([...expected].sort());
  });

  it("pins Fraunces to SOFT 100, WONK 0 and the artboards' opsz 144, leaving no axis", () => {
    for (const face of FACES.filter((f) => f.family === "Fraunces")) {
      expect(face.axes, face.stem).toEqual({
        opsz: 144,
        wght: face.weight,
        SOFT: 100,
        WONK: 0,
      });
    }
    expect(FACES.find((f) => f.family === "Caveat")?.axes).toEqual({
      wght: 500,
    });
  });

  it("records the real byte size of every committed file", () => {
    for (const face of manifest.faces) {
      expect(bytesOf(face.file), face.file).toBe(face.bytes);
    }
  });

  it("states A21's budgets: 90 KB en/en-gb/de, 120 KB pl, 30 KB Caveat, 50 KB preloaded, two preloads", () => {
    expect(FONT_BUDGETS).toEqual({
      preloadBytes: 50 * KB,
      latinPageBytes: 90 * KB,
      latinExtPageBytes: 120 * KB,
      handBytes: 30 * KB,
    });
    expect(manifest.budgets).toEqual(FONT_BUDGETS);
    expect(MAX_PRELOADS).toBe(2);
  });

  it("fits every budget", () => {
    // The en/en-gb/de line is charged the worst case too: `/en` names Wrocław and Dzień Kobiet.
    const latin = pageFontBytes(manifest, ["latin", "latin-ext"]);
    const ext = pageFontBytes(manifest, ["latin", "latin-ext"]);
    const hand = handFontBytes(manifest, ["latin", "latin-ext"]);
    const preloaded = manifest.faces
      .filter((face) =>
        (PRELOADED_FILES as readonly string[]).includes(face.file),
      )
      .reduce((sum, face) => sum + face.bytes, 0);
    expect(latin, `en page ${String(latin)} B`).toBeLessThanOrEqual(
      FONT_BUDGETS.latinPageBytes,
    );
    expect(ext, `pl page ${String(ext)} B`).toBeLessThanOrEqual(
      FONT_BUDGETS.latinExtPageBytes,
    );
    expect(hand, `Caveat ${String(hand)} B`).toBeLessThanOrEqual(
      FONT_BUDGETS.handBytes,
    );
    expect(preloaded, `preloaded ${String(preloaded)} B`).toBeLessThanOrEqual(
      FONT_BUDGETS.preloadBytes,
    );
    expect(PRELOADED_FILES.length).toBeLessThanOrEqual(MAX_PRELOADS);
  });

  it("counts a page's four faces and never Caveat, and a pl page's Latin-Ext files on top", () => {
    const bytesOfRole = (role: string, subset: string) =>
      manifest.faces
        .filter((face) => face.role === role && face.subset === subset)
        .reduce((sum, face) => sum + face.bytes, 0);
    const latinRoles = ["display", "display-em", "body", "body-bold"].reduce(
      (sum, role) => sum + bytesOfRole(role, "latin"),
      0,
    );
    expect(pageFontBytes(manifest, ["latin"])).toBe(latinRoles);
    expect(pageFontBytes(manifest, ["latin", "latin-ext"])).toBe(
      latinRoles +
        ["display", "display-em", "body", "body-bold"].reduce(
          (sum, role) => sum + bytesOfRole(role, "latin-ext"),
          0,
        ),
    );
    expect(handFontBytes(manifest, ["latin"])).toBe(
      bytesOfRole("hand", "latin"),
    );
    // A Caveat file that grew past 30 KB is caught by the same arithmetic.
    const swollen = {
      faces: manifest.faces.map((face) =>
        face.role === "hand" ? { ...face, bytes: 31 * KB } : face,
      ),
    };
    expect(handFontBytes(swollen, ["latin"])).toBeGreaterThan(
      FONT_BUDGETS.handBytes,
    );
  });

  it("ships the licence of all three families next to the files, and no other", () => {
    const licences = readdirSync(resolve(repoRoot, FONT_DIR)).filter((file) =>
      file.startsWith("LICENSE-"),
    );
    expect(licences.sort()).toEqual([
      "LICENSE-alegreyasans.txt",
      "LICENSE-caveat.txt",
      "LICENSE-fraunces.txt",
    ]);
    for (const licence of licences) {
      expect(
        readFileSync(resolve(repoRoot, FONT_DIR, licence), "utf8"),
        licence,
      ).toContain("SIL OPEN FONT LICENSE");
    }
  });
});

describe("the Latin / Latin-Ext split", () => {
  it("puts every repertoire character in exactly one subset", () => {
    for (const character of REPERTOIRE) {
      expect(subsetOf(character), character).toBeDefined();
    }
    expect(
      repertoireOf("latin").length + repertoireOf("latin-ext").length,
    ).toBe(REPERTOIRE.length);
  });

  it("keeps English and German in the Latin file, so text without Polish, Romanian or Turkish letters never loads Latin-Ext", () => {
    for (const character of "AZaz09€£„“”–—…·äöüßÄÖÜ ") {
      expect(subsetOf(character), character).toBe("latin");
    }
  });

  it("puts the Polish, Romanian and Turkish letters in the Latin-Ext file", () => {
    for (const character of "ąćęłńśźżĄĆĘŁŃŚŹŻășțğş") {
      expect(subsetOf(character), character).toBe("latin-ext");
    }
    // `ó` and `î` are Latin-1, so they live in the Latin file — and they are still covered.
    expect(subsetOf("ó")).toBe("latin");
    expect(subsetOf("î")).toBe("latin");
  });

  it("writes the CSS unicode-range of each subset into the manifest", () => {
    for (const face of manifest.faces) {
      expect(face.unicodeRange, face.file).toBe(unicodeRange(face.subset));
    }
    expect(unicodeRange("latin")).toMatch(/^U\+0000-00FF, /);
    expect(unicodeRange("latin-ext")).toMatch(/^U\+0100-0130, /);
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

/** The `localFont({ … })` calls of a module, comments stripped. */
function localFontCalls(file: string): string[] {
  const code = readFileSync(resolve(repoRoot, file), "utf8").replaceAll(
    /\/\*[\s\S]*?\*\//g,
    "",
  );
  return code.split("localFont({").slice(1);
}

/** The `unicode-range` value a call declares. */
function rangeOf(call: string): string | undefined {
  return /prop: "unicode-range",\s*value:\s*"([^"]+)"/.exec(call)?.[1];
}

describe("the next/font/local declarations", () => {
  const pageCalls = localFontCalls("src/modules/ui/fonts/index.ts");
  const handCalls = localFontCalls("src/modules/ui/fonts/hand.ts");
  const allCalls = [...pageCalls, ...handCalls];

  it("declares one call per family and subset: four page calls, two Caveat calls", () => {
    expect(pageCalls).toHaveLength(4);
    expect(handCalls).toHaveLength(2);
  });

  it("references every committed file once, in a call whose unicode-range is its subset's", () => {
    for (const face of manifest.faces) {
      const calls = allCalls.filter((call) =>
        call.includes(`"./${face.file}"`),
      );
      expect(calls, face.file).toHaveLength(1);
      expect(rangeOf(calls[0] ?? ""), face.file).toBe(
        unicodeRange(face.subset),
      );
    }
    // Caveat lives only in `hand.ts`.
    for (const call of pageCalls) expect(call).not.toContain("caveat");
  });

  it("sets swap on every call and matched fallback metrics on each Latin page call", () => {
    for (const call of allCalls) expect(call).toContain('display: "swap"');
    const latinPage = pageCalls.filter((call) => call.includes("-latin.woff2"));
    expect(latinPage).toHaveLength(2);
    expect(latinPage.join("\n")).toContain(
      'adjustFontFallback: "Times New Roman"',
    );
    expect(latinPage.join("\n")).toContain('adjustFontFallback: "Arial"');
  });

  it("preloads exactly the Alegreya Sans Latin files, and never the italic, a Latin-Ext file or Caveat", () => {
    const preloaded = allCalls.filter((call) => call.includes("preload: true"));
    expect(preloaded).toHaveLength(1);
    const files = [
      ...(preloaded[0] ?? "").matchAll(/"\.\/([\w-]+\.woff2)"/g),
    ].map((match) => match[1]);
    expect(files.sort()).toEqual([...PRELOADED_FILES].sort());
    expect(files.length).toBeLessThanOrEqual(MAX_PRELOADS);
    for (const file of files) {
      expect(file).not.toMatch(/italic|latin-ext|caveat/);
    }
    for (const call of allCalls.filter((c) => !c.includes("preload: true"))) {
      expect(call).toContain("preload: false");
    }
  });

  it("self-hosts and requests nothing from Google; ships no Newsreader or Plex face", () => {
    for (const file of [
      "src/modules/ui/fonts/index.ts",
      "src/modules/ui/fonts/hand.ts",
    ]) {
      const code = readFileSync(resolve(repoRoot, file), "utf8").replaceAll(
        /\/\*[\s\S]*?\*\//g,
        "",
      );
      expect(code).not.toContain("next/font/google");
      expect(code).not.toContain("fonts.googleapis.com");
      expect(code).not.toContain("fonts.gstatic.com");
      expect(code.toLowerCase()).not.toMatch(/newsreader|plex/);
    }
  });

  it("publishes the four page-face variables through one string the layouts use", () => {
    const code = readFileSync(
      resolve(repoRoot, "src/modules/ui/fonts/index.ts"),
      "utf8",
    );
    for (const variable of [
      "--font-fraunces",
      "--font-fraunces-ext",
      "--font-alegreya",
      "--font-alegreya-ext",
    ]) {
      expect(code).toContain(`variable: "${variable}"`);
    }
    expect(code).toMatch(/export const fontVariables/);
  });

  it("keeps Caveat out of every module graph but the product page's", () => {
    // Every import or re-export specifier in `src/`, resolved (relative, or `@/` = `src/`), that
    // lands on `ui/fonts/hand`. Only the product module may hold one: `ui/fonts/index.ts` and the
    // `ui` barrel are imported by every document layout, so a single `import "./hand"` or
    // `export … from "./hand"` there would put Caveat's `@font-face` on every page (breaker hole
    // 1, PR 168). Exempt: `hand.ts` itself.
    const HAND = "src/modules/ui/fonts/hand";
    const SPECIFIER =
      /(?:^|\n)\s*(?:import|export)\b[^;]*?(?:from\s*)?["']([^"']+)["']/g;
    const resolveSpecifier = (from: string, specifier: string) => {
      const target = specifier.startsWith("@/")
        ? `src/${specifier.slice(2)}`
        : specifier.startsWith(".")
          ? relative(repoRoot, resolve(repoRoot, dirname(from), specifier))
          : specifier;
      return target.replace(/\.(?:ts|tsx|js)$/, "").replace(/\/index$/, "");
    };
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(resolve(repoRoot, dir), {
        withFileTypes: true,
      })) {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          walk(path);
          continue;
        }
        if (
          !/\.tsx?$/.test(entry.name) ||
          path === `${HAND}.ts` ||
          path.startsWith("src/modules/ui/product/")
        ) {
          continue;
        }
        const code = readFileSync(resolve(repoRoot, path), "utf8")
          .replaceAll(/\/\*[\s\S]*?\*\//g, "")
          .replaceAll(/^\s*\/\/.*$/gm, "");
        for (const match of code.matchAll(SPECIFIER)) {
          if (resolveSpecifier(path, match[1] ?? "") === HAND) {
            offenders.push(`${path} -> ${match[1] ?? ""}`);
          }
        }
      }
    };
    walk("src");
    expect(offenders).toEqual([]);
  });

  it("finds a Caveat import however it is written (the walk's own check)", () => {
    // The resolver above, against the three shapes the breaker used.
    const shapes = [
      'import "./hand";',
      'export { handFontVariables } from "./hand";',
      'import { handFont } from "@/modules/ui/fonts/hand";',
    ];
    const SPECIFIER =
      /(?:^|\n)\s*(?:import|export)\b[^;]*?(?:from\s*)?["']([^"']+)["']/g;
    for (const shape of shapes) {
      const specifier = [...shape.matchAll(SPECIFIER)][0]?.[1] ?? "";
      const target = specifier.startsWith("@/")
        ? `src/${specifier.slice(2)}`
        : relative(
            repoRoot,
            resolve(repoRoot, "src/modules/ui/fonts", specifier),
          );
      expect(target, shape).toBe("src/modules/ui/fonts/hand");
    }
  });
});

/**
 * The metric-matched Linux fallback faces (A21 clause 3 "matched fallback metrics on every face";
 * AC-7, AC-28's CLS 0; TASK-175, carried to TASK-176 as PR 168's breaker hole 2).
 *
 * `adjustFontFallback` matches its generated face to `local("Arial")` / `local("Times New Roman")`,
 * which Linux lacks; `src/app/globals.css` declares a second face per Latin call over the
 * metric-compatible clones, and the call names it first in `fallback`. These cases recompute the
 * overrides with Next's own `getFallbackMetricsFromFontFile`, over the file Next's own
 * `pickFontFileForFallbackGeneration` picks from the call's `src`, so a re-subset, a hand edit or a
 * renamed face fails here rather than as a timing-dependent CLS in CI.
 */
interface FontMetrics {
  readonly ascent: number;
  readonly descent: number;
  readonly lineGap: number;
  readonly unitsPerEm: number;
}
interface FallbackMetrics {
  readonly ascentOverride: string;
  readonly descentOverride: string;
  readonly lineGapOverride: string;
  readonly sizeAdjust: string;
  readonly fallbackFont: string;
}
interface SrcEntry {
  readonly path: string;
  readonly weight: string;
  readonly style: string;
}

const nextRequire = createRequire(resolve(repoRoot, "package.json"));
const NEXT_FONT = "next/dist/compiled/@next/font/dist";
const fontkitModule = nextRequire(`${NEXT_FONT}/fontkit`) as {
  default: ((buffer: Buffer) => FontMetrics) & {
    default?: (buffer: Buffer) => FontMetrics;
  };
};
const fontFromBuffer = fontkitModule.default.default ?? fontkitModule.default;
const { getFallbackMetricsFromFontFile } = nextRequire(
  `${NEXT_FONT}/local/get-fallback-metrics-from-font-file`,
) as {
  getFallbackMetricsFromFontFile: (
    font: FontMetrics,
    category: "serif" | "sans-serif",
  ) => FallbackMetrics;
};
const { pickFontFileForFallbackGeneration } = nextRequire(
  `${NEXT_FONT}/local/pick-font-file-for-fallback-generation`,
) as {
  pickFontFileForFallbackGeneration: (files: SrcEntry[]) => SrcEntry;
};

/** Every `@font-face` block of `globals.css` as a property map, keyed by its `font-family`. */
function fontFaceBlocks(): Map<string, Map<string, string>> {
  const css = readFileSync(
    resolve(repoRoot, "src/app/globals.css"),
    "utf8",
  ).replaceAll(/\/\*[\s\S]*?\*\//g, "");
  const blocks = new Map<string, Map<string, string>>();
  for (const match of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const props = new Map<string, string>();
    for (const declaration of (match[1] ?? "").split(";")) {
      const colon = declaration.indexOf(":");
      if (colon === -1) continue;
      props.set(
        declaration.slice(0, colon).trim(),
        declaration.slice(colon + 1).trim(),
      );
    }
    const family = props.get("font-family")?.replaceAll('"', "");
    // The roman face of each family; the Fraunces italic fallbacks (TASK-177) have their own
    // recompute in `./fonts-italic-fallback.test.ts`.
    if (family && props.get("font-style") !== "italic")
      blocks.set(family, props);
  }
  return blocks;
}

/** A call's `src` entries, its `fallback` list and its `adjustFontFallback` value. */
function callShape(call: string) {
  const src = [
    ...call.matchAll(
      /path:\s*"\.\/([^"]+)",\s*weight:\s*"([^"]+)",\s*style:\s*"([^"]+)"/g,
    ),
  ].map(([, path = "", weight = "", style = ""]) => ({ path, weight, style }));
  const fallback = [
    ...(/fallback:\s*\[([^\]]*)\]/.exec(call)?.[1] ?? "").matchAll(
      /"([^"]+)"/g,
    ),
  ].map((match) => match[1]);
  const adjust = /adjustFontFallback:\s*"([^"]+)"/.exec(call)?.[1];
  return { src, fallback, adjust };
}

/** `103.05%` → 103.05; Next writes `0.00%` where the stylesheet writes `0%`. */
const percent = (value: string | undefined) =>
  Number.parseFloat((value ?? "").replace("%", ""));

describe("the metric-matched Linux fallback faces (A21 clause 3)", () => {
  const pageCalls = localFontCalls("src/modules/ui/fonts/index.ts");
  const blocks = fontFaceBlocks();
  const FACES_BY_CALL = [
    {
      file: "fraunces-400-latin.woff2",
      family: "Fraunces Fallback Liberation",
      adjust: "Times New Roman",
      category: "serif",
      src: 'local("Liberation Serif"), local("Tinos")',
    },
    {
      file: "alegreya-sans-400-latin.woff2",
      family: "Alegreya Sans Fallback Liberation",
      adjust: "Arial",
      category: "sans-serif",
      src: 'local("Liberation Sans"), local("Arimo")',
    },
  ] as const;

  for (const face of FACES_BY_CALL) {
    describe(face.family, () => {
      const call = pageCalls.find((c) => c.includes(`"./${face.file}"`)) ?? "";
      const shape = callShape(call);

      it("is the first named fallback of its Latin call, which matches the same metric family", () => {
        expect(shape.fallback[0]).toBe(face.family);
        expect(shape.adjust).toBe(face.adjust);
      });

      it("is declared in globals.css over the Liberation and Croscore clones only", () => {
        const block = blocks.get(face.family);
        expect(block, `@font-face "${face.family}"`).toBeDefined();
        expect(block?.get("src")).toBe(face.src);
      });

      it("carries the overrides Next computes for the call's own fallback file", () => {
        const picked = pickFontFileForFallbackGeneration(shape.src);
        expect(picked.path).toBe(face.file);
        const font = fontFromBuffer(
          readFileSync(resolve(repoRoot, FONT_DIR, picked.path)),
        );
        const expected = getFallbackMetricsFromFontFile(font, face.category);
        expect(expected.fallbackFont).toBe(face.adjust);
        const block = blocks.get(face.family);
        for (const [prop, key] of [
          ["ascent-override", "ascentOverride"],
          ["descent-override", "descentOverride"],
          ["line-gap-override", "lineGapOverride"],
          ["size-adjust", "sizeAdjust"],
        ] as const) {
          expect(percent(block?.get(prop)), `${face.family} ${prop}`).toBe(
            percent(expected[key]),
          );
        }
      });
    });
  }
});
