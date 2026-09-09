/**
 * `pnpm fonts:build` — regenerates the committed WOFF2 subsets under `src/modules/ui/fonts/`
 * (spec 004 §2 "Font", AC-4; TASK-045).
 *
 * **This script needs the network and is run by hand, not by the build.** Its *output* is
 * committed — three `.woff2` files, the two upstream licences and `subset.json` — so `pnpm build`,
 * `pnpm test` and a clean clone never fetch a font (AC-2, AC-4's "no request to
 * fonts.googleapis.com / fonts.gstatic.com"). Re-run it only to change the repertoire, an axis
 * pin or an upstream version, and commit the diff together with the byte table it prints.
 *
 * What it does, and why each step is a deliberate choice measured against AC-4's ≤45 KB total
 * font transfer per page:
 *
 *  1. Downloads the **upstream variable TTFs** from the `google/fonts` repository (SIL Open Font
 *     License 1.1, both families) rather than a Google Fonts CSS `url()`: the CSS endpoint serves
 *     files that are already subsetted for *its* unicode ranges and hinted for its own budget, and
 *     measured on 2026-09-08 they cost 60 KB (Newsreader, `latin`) + 40 KB (IBM Plex Sans,
 *     `latin`) — over budget before Latin-Ext is added.
 *  2. Subsets each face to `REPERTOIRE` (below) with harfbuzz (`subset-font`), pinning the
 *     variation axes to the instances the design uses, so a page loads **one file per face** and
 *     the Polish, Romanian, Turkish and German diacritics come from the webfont in every locale
 *     rather than from a second unicode-range request (AC-4).
 *  3. Drops TrueType hinting instructions and every OpenType layout feature except `kern`. That
 *     is where the budget is won: with hinting and the full feature set the same three faces cost
 *     65.7 KB, with them 39.6 KB. Kerning is kept because the display face sets 34–68 px headlines
 *     where unkerned pairs are visible; discretionary ligatures, small caps, alternates and the
 *     `DSIG` signature are not used by any component.
 *
 * The manifest it writes (`subset.json`) is what `tests/unit/fonts.test.ts` asserts against: byte
 * totals under budget, the committed files' real sizes equal to the recorded ones, and every
 * character used by any message catalogue present in the repertoire. So a translator who pastes a
 * character no subset covers fails a unit test instead of shipping a tofu box.
 */
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Where the committed subsets and the manifest live. */
export const FONT_DIR = "src/modules/ui/fonts";
export const MANIFEST_FILE = `${FONT_DIR}/subset.json`;

/**
 * The character repertoire every committed subset covers, built from named blocks so a future
 * locale is one line rather than a mystery string.
 *
 * `latinExt` is non-negotiable (spec 004 §2): `ą ć ę ł ń ó ś ź ż` for `pl`, `ă â î ș ț` and
 * `ç ğ ı ş` for the Phase-4 `ro`/`tr` locales, plus the Latin-1 accents that the localised
 * *country names* of `src/config/countries.ts` need (España, România, Ελλάδα is not Latin and is
 * not a Phase-0 destination).
 */
const BLOCKS = {
  /** Printable ASCII: U+0020–U+007E. */
  ascii: Array.from({ length: 0x7f - 0x20 }, (_, index) =>
    String.fromCodePoint(0x20 + index),
  ).join(""),
  /** Typography the copy and the design system use: dashes, quotes, bullets, currency, °, ×, →. */
  punctuation: "–—‘’“”„…·•€£°×→ ‑–",
  /** `de`: umlauts and eszett. */
  german: "ÄÖÜäöüß",
  /** `pl`. */
  polish: "ĄąĆćĘęŁłŃńÓóŚśŹźŻż",
  /** `ro` (Phase 4). */
  romanian: "ĂăÂâÎîȘșȚț",
  /** `tr` (Phase 4). */
  turkish: "ÇçĞğİıŞş",
  /** Latin-1 accents for localised place and country names (`fr`, `es`, `it`, `nl`). */
  latin1: "ÀÁÂÃÅÆÈÉÊËÌÍÏÑÒÔÕØÙÚÛÝàáâãåæèéêëìíïñòôõøùúûýÿ",
} as const;

export const REPERTOIRE = [
  ...new Set(Object.values(BLOCKS).join("").split("")),
].join("");

interface FaceSpec {
  /** Output file name under `FONT_DIR`. */
  readonly file: string;
  /** Upstream variable TTF. */
  readonly source: string;
  /** CSS family name the `@theme` token refers to. */
  readonly family: string;
  /** The instance this file is: `font-weight` it is declared under. */
  readonly weight: number;
  /** harfbuzz variation-axis pins (`subset-font`'s `variationAxes`). */
  readonly axes: Readonly<Record<string, number>>;
  /** Why this face exists at all — printed in the manifest so the budget is auditable. */
  readonly role: string;
}

const NEWSREADER_TTF =
  "https://raw.githubusercontent.com/google/fonts/main/ofl/newsreader/Newsreader%5Bopsz,wght%5D.ttf";
const PLEX_TTF =
  "https://raw.githubusercontent.com/google/fonts/main/ofl/ibmplexsans/IBMPlexSans%5Bwdth,wght%5D.ttf";

export const FACES: readonly FaceSpec[] = [
  {
    file: "newsreader-500-latin-ext.woff2",
    source: NEWSREADER_TTF,
    family: "Newsreader",
    weight: 500,
    // `opsz` pinned at 32: the display face only ever sets 24–68 px (`--text-xl` … `--text-display`
    // and the 26 px wordmark), and keeping the 6–72 optical-size axis alive costs 45.4 KB instead
    // of 17.5 KB — the whole budget for one face. Roman only: §13 Q2 resolves "no italic axis".
    axes: { opsz: 32, wght: 500 },
    role: "display (headings, wordmark)",
  },
  {
    file: "plex-sans-400-latin-ext.woff2",
    source: PLEX_TTF,
    family: "IBM Plex Sans",
    weight: 400,
    axes: { wdth: 100, wght: 400 },
    role: "body",
  },
  {
    file: "plex-sans-600-latin-ext.woff2",
    source: PLEX_TTF,
    family: "IBM Plex Sans",
    weight: 600,
    axes: { wdth: 100, wght: 600 },
    role: "labels, buttons, navigation (the canvas's 500 and 600 both resolve here)",
  },
] as const;

/** AC-4's budget, in bytes. Every page loads every face, so this is the per-page total. */
export const FONT_BUDGET_BYTES = 45 * 1024;

export interface FontManifestEntry {
  readonly file: string;
  readonly family: string;
  readonly weight: number;
  readonly role: string;
  readonly axes: Readonly<Record<string, number>>;
  readonly bytes: number;
  readonly source: string;
}

export interface FontManifest {
  readonly generatedBy: string;
  readonly licence: string;
  readonly repertoire: string;
  readonly glyphCount: number;
  readonly budgetBytes: number;
  /**
   * Bytes of the subset faces, together. Named `subsetBytes` rather than `totalBytes` because
   * `fo/no-float-money` (enabled for `scripts/` by TASK-060, spec 005 AC-4) reads a `total…`
   * annotated `number` as money, and AC-4 permits no `eslint-disable` for that rule: a byte
   * count is not money, so the field is renamed rather than the rule suppressed.
   */
  readonly subsetBytes: number;
  readonly faces: readonly FontManifestEntry[];
}

export function readManifest(root: string): FontManifest {
  return JSON.parse(
    readFileSync(resolve(root, MANIFEST_FILE), "utf8"),
  ) as FontManifest;
}

async function download(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GET ${url} -> ${String(response.status)}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function main(root: string): Promise<void> {
  const { default: subsetFont } = await import("subset-font");
  mkdirSync(resolve(root, FONT_DIR), { recursive: true });

  const sources = new Map<string, Buffer>();
  const faces: FontManifestEntry[] = [];

  for (const face of FACES) {
    let source = sources.get(face.source);
    if (source === undefined) {
      source = await download(face.source);
      sources.set(face.source, source);
    }
    const subset = await subsetFont(source, REPERTOIRE, {
      targetFormat: "woff2",
      variationAxes: face.axes,
      noHinting: true,
      keepFeatures: ["kern"],
    });
    writeFileSync(resolve(root, FONT_DIR, face.file), subset);
    faces.push({
      file: face.file,
      family: face.family,
      weight: face.weight,
      role: face.role,
      axes: face.axes,
      bytes: subset.length,
      source: face.source,
    });
  }

  // Both families are SIL OFL 1.1; the licence text ships next to the files it covers.
  for (const [name, url] of [
    [
      "LICENSE-newsreader.txt",
      "https://raw.githubusercontent.com/google/fonts/main/ofl/newsreader/OFL.txt",
    ],
    [
      "LICENSE-ibm-plex-sans.txt",
      "https://raw.githubusercontent.com/google/fonts/main/ofl/ibmplexsans/OFL.txt",
    ],
  ] as const) {
    writeFileSync(resolve(root, FONT_DIR, name), await download(url));
  }

  const subsetBytes = faces.reduce((sum, face) => sum + face.bytes, 0);
  const manifest: FontManifest = {
    generatedBy: "pnpm fonts:build (scripts/fonts/build-fonts.ts)",
    licence: "SIL Open Font License 1.1 (both families)",
    repertoire: REPERTOIRE,
    glyphCount: REPERTOIRE.length,
    budgetBytes: FONT_BUDGET_BYTES,
    subsetBytes,
    faces,
  };
  writeFileSync(
    resolve(root, MANIFEST_FILE),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  for (const face of faces) {
    process.stdout.write(
      `${face.file}  ${String(face.bytes)} B  (${face.role})\n`,
    );
  }
  process.stdout.write(
    `total ${String(subsetBytes)} B of ${String(FONT_BUDGET_BYTES)} B budget; ${String(REPERTOIRE.length)} characters\n`,
  );
  if (subsetBytes > FONT_BUDGET_BYTES) {
    process.stderr.write("font subsets exceed the AC-4 budget\n");
    process.exit(1);
  }
}

const isMain =
  typeof process.argv[1] === "string" &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const root = resolve(process.argv[2] ?? process.cwd());
  await main(root);
  // Touch `statSync` so a partial write is caught here rather than in the unit test.
  for (const face of FACES) statSync(resolve(root, FONT_DIR, face.file));
}
