/**
 * `pnpm fonts:build` — regenerates the committed WOFF2 subsets under `src/modules/ui/fonts/`
 * (spec 004 §2 "Font", §14 A21 clause 3; TASK-045, TASK-175).
 *
 * **This script needs the network and is run by hand, not by the build.** Its *output* is
 * committed — the `.woff2` files, the upstream licences and `subset.json` — so `pnpm build`,
 * `pnpm test` and a clean clone never fetch a font (AC-2; no request to `fonts.googleapis.com` or
 * `fonts.gstatic.com`, ever). Re-run it only to change the repertoire, an axis pin or an upstream
 * version, and commit the diff together with the byte table it prints. `--sources <dir>` reads
 * the upstream files from a local directory instead of downloading them (same file names as the
 * `google/fonts` repository).
 *
 * What it ships is A21 clause 3's "smallest compliant set", binding:
 *
 *  - **Fraunces** roman 400 and italic 300, `SOFT` 100, `WONK` 0, `opsz` pinned at 144 — the
 *    artboards' H1 value (`--font-variation-display-hero`). One roman instance, not two: the
 *    typography sheet's rule is that "if TASK-175 ships one roman instance, it pins 144 for the H1
 *    steps and the H2 and smaller steps take the nearest value it can ship", and a second roman
 *    instance at a text `opsz` would cost another Latin file per page against the 90 KB budget.
 *    The italic is pinned at the same value because its first use is the poppy phrase in an H1.
 *  - **Alegreya Sans** 400 and 700, the upstream static instances (Alegreya Sans has no variable
 *    master upstream; a static instance is the smaller of A21's two options by construction, since
 *    each face ships exactly one weight).
 *  - **Caveat** 500 (`wght` pinned), for the product page's printed-card preview only.
 *  - **No Newsreader file.** The wordmark is the committed SVG that `build-wordmark.ts` outlines
 *    from Newsreader 500; nothing loads the font.
 *
 * Every face is split into a **Latin** and a **Latin-Ext** file with a matching `unicode-range`
 * (A21 clause 3 "as separate `unicode-range` files"), so an `en`, `en-gb` or `de` page never
 * downloads the Polish, Romanian and Turkish glyphs and a `pl` page downloads them only for the
 * faces it renders. The ranges are disjoint: a character belongs to exactly one file.
 *
 * Each file drops TrueType hinting and every OpenType layout feature except `kern`, `lnum` and
 * `tnum` (Caveat keeps `kern` alone; see its entry): kerning because the
 * display face sets 42–90 px headlines, the two numeral features because prices and dates are set
 * `lining-nums tabular-nums` (typography sheet "Numbers line up") and Alegreya Sans defaults to
 * old-style figures.
 *
 * The manifest it writes (`subset.json`) is what `tests/unit/fonts.test.ts` and
 * `pnpm budget:client-js` assert against: the committed files' real sizes, the per-locale transfer
 * budgets, the preload budget, and every character of every message catalogue covered.
 */
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Where the committed subsets and the manifest live. */
export const FONT_DIR = "src/modules/ui/fonts";
export const MANIFEST_FILE = `${FONT_DIR}/subset.json`;

/**
 * The character repertoire the committed subsets cover, built from named blocks so a future locale
 * is one line rather than a mystery string.
 *
 * Latin-Ext is non-negotiable (spec 004 §2, AC-4): `ą ć ę ł ń ó ś ź ż` for `pl`, `ă â î ș ț` and
 * `ç ğ ı ş` for the Phase-4 `ro`/`tr` locales, plus the Latin-1 accents the localised country and
 * place names need.
 */
const BLOCKS = {
  /** Printable ASCII: U+0020–U+007E. */
  ascii: Array.from({ length: 0x7f - 0x20 }, (_, index) =>
    String.fromCodePoint(0x20 + index),
  ).join(""),
  /** Typography the copy and the design system use: dashes, quotes, bullets, currency, °, ×, →. */
  punctuation: "–—‘’“”„…·•€£°×→ ‑–",
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

/** One `unicode-range` file per face and subset. */
export const SUBSETS = ["latin", "latin-ext"] as const;
export type SubsetName = (typeof SUBSETS)[number];

/** Inclusive code-point ranges, in the order the CSS `unicode-range` descriptor lists them. */
export const SUBSET_RANGES: Readonly<
  Record<SubsetName, readonly (readonly [number, number])[]>
> = {
  // Basic Latin, Latin-1, the dotless i and the œ ligature, general punctuation (quotes, dashes,
  // the non-breaking hyphen, the ellipsis), €, ™, the arrows, the minus sign.
  latin: [
    [0x0000, 0x00ff],
    [0x0131, 0x0131],
    [0x0152, 0x0153],
    [0x2000, 0x206f],
    [0x20ac, 0x20ac],
    [0x2122, 0x2122],
    [0x2190, 0x2193],
    [0x2212, 0x2212],
  ],
  // Latin Extended-A and -B less the three code points the Latin file already holds, Latin
  // Extended Additional, Latin Extended-C and -D.
  "latin-ext": [
    [0x0100, 0x0130],
    [0x0132, 0x0151],
    [0x0154, 0x024f],
    [0x1e00, 0x1eff],
    [0x2c60, 0x2c7f],
    [0xa720, 0xa7ff],
  ],
};

const hex = (codePoint: number): string =>
  codePoint.toString(16).toUpperCase().padStart(4, "0");

/** The CSS `unicode-range` value of a subset. */
export function unicodeRange(subset: SubsetName): string {
  return SUBSET_RANGES[subset]
    .map(([start, end]) =>
      start === end ? `U+${hex(start)}` : `U+${hex(start)}-${hex(end)}`,
    )
    .join(", ");
}

/** The subset a character belongs to, or `undefined` when it is in neither range. */
export function subsetOf(character: string): SubsetName | undefined {
  const codePoint = character.codePointAt(0) ?? -1;
  return SUBSETS.find((subset) =>
    SUBSET_RANGES[subset].some(
      ([start, end]) => codePoint >= start && codePoint <= end,
    ),
  );
}

/** The repertoire characters a subset file carries. */
export function repertoireOf(subset: SubsetName): string {
  return REPERTOIRE.split("")
    .filter((character) => subsetOf(character) === subset)
    .join("");
}

/** What a face is for, which decides where it may load (A21 clause 3). */
export type FaceRole = "display" | "display-em" | "body" | "body-bold" | "hand";

interface FaceSpec {
  /** File stem; the subset is appended (`fraunces-400-latin.woff2`). */
  readonly stem: string;
  /** Upstream file name in the `google/fonts` repository directory `directory`. */
  readonly upstream: string;
  readonly directory: string;
  /** Family name, for the manifest and the licence. */
  readonly family: string;
  readonly weight: number;
  readonly style: "normal" | "italic";
  /** harfbuzz variation-axis pins (`subset-font`'s `variationAxes`); empty for a static file. */
  readonly axes: Readonly<Record<string, number>>;
  readonly features: readonly string[];
  readonly role: FaceRole;
  readonly use: string;
}

const RAW = "https://raw.githubusercontent.com/google/fonts/main/ofl";
const TEXT_FEATURES = ["kern", "lnum", "tnum"] as const;

export const FACES: readonly FaceSpec[] = [
  {
    stem: "fraunces-400",
    upstream: "Fraunces[SOFT,WONK,opsz,wght].ttf",
    directory: "fraunces",
    family: "Fraunces",
    weight: 400,
    style: "normal",
    axes: { opsz: 144, wght: 400, SOFT: 100, WONK: 0 },
    features: TEXT_FEATURES,
    role: "display",
    use: "every heading, the sentence, the product page's price and total",
  },
  {
    stem: "fraunces-300-italic",
    upstream: "Fraunces-Italic[SOFT,WONK,opsz,wght].ttf",
    directory: "fraunces",
    family: "Fraunces",
    weight: 300,
    style: "italic",
    axes: { opsz: 144, wght: 300, SOFT: 100, WONK: 0 },
    features: TEXT_FEATURES,
    role: "display-em",
    use: "the one poppy phrase per heading, the sentence's choices, the P.S., every note warm-c drew in Caveat",
  },
  {
    stem: "alegreya-sans-400",
    upstream: "AlegreyaSans-Regular.ttf",
    directory: "alegreyasans",
    family: "Alegreya Sans",
    weight: 400,
    style: "normal",
    axes: {},
    features: TEXT_FEATURES,
    role: "body",
    use: "running text and controls (warm-c's 500 renders here, --font-weight-medium)",
  },
  {
    stem: "alegreya-sans-700",
    upstream: "AlegreyaSans-Bold.ttf",
    directory: "alegreyasans",
    family: "Alegreya Sans",
    weight: 700,
    style: "normal",
    axes: {},
    features: TEXT_FEATURES,
    role: "body-bold",
    use: "labels, eyebrows, buttons, standalone links",
  },
  {
    stem: "caveat-500",
    upstream: "Caveat[wght].ttf",
    directory: "caveat",
    family: "Caveat",
    weight: 500,
    style: "normal",
    axes: { wght: 500 },
    // Not `calt`: Caveat's contextual handwriting alternates pull 22 KB of extra glyphs into the
    // Latin file through layout closure (41,956 B with it, 20,048 B without), which alone would
    // break the 30 KB Caveat budget.
    features: ["kern"],
    role: "hand",
    use: "the buyer's own words in the product page's printed-card preview, nowhere else",
  },
] as const;

/** The file name of one face in one subset. */
export function fontFile(
  face: { readonly stem: string },
  subset: SubsetName,
): string {
  return `${face.stem}-${subset}.woff2`;
}

/**
 * A21 clause 3's budgets, in bytes (WOFF2 is already Brotli-compressed, so the file size is the
 * transfer). They supersede AC-4's and AC-25's single 45 KB figure and are "not raised a second
 * time".
 */
export const FONT_BUDGETS = {
  /** Bytes preloaded on any page. */
  preloadBytes: 50 * 1024,
  /**
   * Font transfer on an `en`, `en-gb` or `de` page: the four page faces' Latin files, plus their
   * Latin-Ext files where the page names a Polish place or date (the home does), so the worst case.
   */
  latinPageBytes: 90 * 1024,
  /** Font transfer on a `pl` page (Latin and Latin-Ext files of the four page faces). */
  latinExtPageBytes: 120 * 1024,
  /** Caveat on top of the above, product page only (both of its files). */
  handBytes: 30 * 1024,
} as const;

/** At most two files are preloaded on any page (A21 clause 3). */
export const MAX_PRELOADS = 2;

/**
 * The files `src/modules/ui/fonts/index.ts` preloads: its one `preload: true` call, Alegreya Sans
 * Latin 400 and 700 (that file explains why the 700 rides with the 400). `tests/unit/fonts.test.ts`
 * pins this list to the `localFont()` declarations, and the budget gate sums it.
 */
export const PRELOADED_FILES = [
  "alegreya-sans-400-latin.woff2",
  "alegreya-sans-700-latin.woff2",
] as const;

export interface FontManifestEntry {
  readonly file: string;
  readonly family: string;
  readonly weight: number;
  readonly style: "normal" | "italic";
  readonly subset: SubsetName;
  readonly unicodeRange: string;
  readonly role: FaceRole;
  readonly use: string;
  readonly axes: Readonly<Record<string, number>>;
  readonly bytes: number;
  readonly source: string;
}

export interface FontManifest {
  readonly generatedBy: string;
  readonly licence: string;
  readonly repertoire: string;
  readonly glyphCount: number;
  readonly budgets: typeof FONT_BUDGETS;
  readonly faces: readonly FontManifestEntry[];
}

export function readManifest(root: string): FontManifest {
  return JSON.parse(
    readFileSync(resolve(root, MANIFEST_FILE), "utf8"),
  ) as FontManifest;
}

/** The roles every page renders; Caveat (`hand`) is the product page's alone. */
export const PAGE_ROLES: readonly FaceRole[] = [
  "display",
  "display-em",
  "body",
  "body-bold",
];

/**
 * Font transfer of a page in bytes: the files of the four page roles in the subsets the locale's
 * text touches. Named `…Bytes` and not `total…` because `fo/no-float-money` reads the latter as
 * money.
 */
export function pageFontBytes(
  manifest: Pick<FontManifest, "faces">,
  subsets: readonly SubsetName[],
): number {
  return manifest.faces
    .filter(
      (face) => subsets.includes(face.subset) && PAGE_ROLES.includes(face.role),
    )
    .reduce((sum, face) => sum + face.bytes, 0);
}

/** The Caveat bytes a product page adds on top of its page faces. */
export function handFontBytes(
  manifest: Pick<FontManifest, "faces">,
  subsets: readonly SubsetName[],
): number {
  return manifest.faces
    .filter((face) => face.role === "hand" && subsets.includes(face.subset))
    .reduce((sum, face) => sum + face.bytes, 0);
}

async function download(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GET ${url} -> ${String(response.status)}`);
  return Buffer.from(await response.arrayBuffer());
}

function upstreamUrl(directory: string, file: string): string {
  return `${RAW}/${directory}/${file.replaceAll("[", "%5B").replaceAll("]", "%5D")}`;
}

async function main(root: string, sourcesDir: string | undefined) {
  const { default: subsetFont } = await import("subset-font");
  mkdirSync(resolve(root, FONT_DIR), { recursive: true });

  const faces: FontManifestEntry[] = [];
  for (const face of FACES) {
    const source =
      sourcesDir === undefined
        ? await download(upstreamUrl(face.directory, face.upstream))
        : readFileSync(resolve(sourcesDir, face.upstream));
    for (const subset of SUBSETS) {
      const output = await subsetFont(source, repertoireOf(subset), {
        targetFormat: "woff2",
        ...(Object.keys(face.axes).length > 0
          ? { variationAxes: face.axes }
          : {}),
        noHinting: true,
        keepFeatures: [...face.features],
      });
      const file = fontFile(face, subset);
      writeFileSync(resolve(root, FONT_DIR, file), output);
      faces.push({
        file,
        family: face.family,
        weight: face.weight,
        style: face.style,
        subset,
        unicodeRange: unicodeRange(subset),
        role: face.role,
        use: face.use,
        axes: face.axes,
        bytes: output.length,
        source: upstreamUrl(face.directory, face.upstream),
      });
    }
  }

  // All three families are SIL OFL 1.1; the licence text ships next to the files it covers.
  for (const directory of [...new Set(FACES.map((face) => face.directory))]) {
    writeFileSync(
      resolve(root, FONT_DIR, `LICENSE-${directory}.txt`),
      await download(`${RAW}/${directory}/OFL.txt`),
    );
  }

  const manifest: FontManifest = {
    generatedBy: "pnpm fonts:build (scripts/fonts/build-fonts.ts)",
    licence: "SIL Open Font License 1.1 (all three families)",
    repertoire: REPERTOIRE,
    glyphCount: REPERTOIRE.length,
    budgets: FONT_BUDGETS,
    faces,
  };
  writeFileSync(
    resolve(root, MANIFEST_FILE),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  for (const face of faces) {
    process.stdout.write(`${face.file}  ${String(face.bytes)} B\n`);
  }
  // An `en` page can name Polish places too, so both lines are charged the worst case.
  const latin = pageFontBytes(manifest, ["latin", "latin-ext"]);
  const ext = latin;
  const hand = handFontBytes(manifest, ["latin", "latin-ext"]);
  process.stdout.write(
    `en/en-gb/de page ${String(latin)} B of ${String(FONT_BUDGETS.latinPageBytes)}; pl page ${String(ext)} B of ${String(FONT_BUDGETS.latinExtPageBytes)}; Caveat ${String(hand)} B of ${String(FONT_BUDGETS.handBytes)}\n`,
  );
  if (
    latin > FONT_BUDGETS.latinPageBytes ||
    ext > FONT_BUDGETS.latinExtPageBytes ||
    hand > FONT_BUDGETS.handBytes
  ) {
    process.stderr.write("font subsets exceed the A21 clause 3 budget\n");
    process.exit(1);
  }
}

const isMain =
  typeof process.argv[1] === "string" &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const argv = process.argv.slice(2);
  const sourcesFlag = argv.indexOf("--sources");
  const sourcesDir =
    sourcesFlag === -1 ? undefined : resolve(argv[sourcesFlag + 1] ?? ".");
  const positional = argv.filter(
    (_value, index) =>
      sourcesFlag === -1 ||
      (index !== sourcesFlag && index !== sourcesFlag + 1),
  );
  const root = resolve(positional[0] ?? process.cwd());
  await main(root, sourcesDir);
  // Touch `statSync` so a partial write is caught here rather than in the unit test.
  for (const face of FACES) {
    for (const subset of SUBSETS) {
      statSync(resolve(root, FONT_DIR, fontFile(face, subset)));
    }
  }
}
