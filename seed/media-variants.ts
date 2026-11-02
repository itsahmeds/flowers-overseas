/**
 * `pnpm media:variants [--check] [--only <assetId>]` — the deterministic `sharp` ladder
 * (spec 006 §2.4, §5.2, AC-12/AC-13/AC-14; TASK-078).
 *
 * For every asset in `seed/data/media.json` whose original is present under
 * `.local/imagery/originals/{assetId}.{ext}` it strips the metadata, crops to the slot's declared
 * aspect ratio, encodes the AVIF + WebP ladder plus the single OG/email JPEG, writes
 * `.local/media/{assetId}/{width}.{fmt}` — and, for the slots served from the site's own origin
 * (`COMMITTED_MEDIA_SLOTS`: the home `hero`), the same bytes to the committed
 * `public/media/{assetId}/{width}.{fmt}` — and rewrites `seed/data/media-variants.json` with the
 * width, height, byte count and SHA-256 of every file. Nothing else: the loader and `Photo` are
 * TASK-079's, the committed demo bytes are TASK-080's, R2 and the equivalent worker are TASK-082's.
 *
 * **Three properties are the whole point, and each has a test.**
 *
 *  1. **Determinism** (AC-13). No clock, no environment, no network, no machine name enters the
 *     output; the row order is `media.json`'s asset order then width then format; the pinned
 *     `sharp`/libvips versions and every encoder option are written into the manifest header and
 *     the run **refuses to start** if the loaded `sharp` is not the pinned one. `sharp` is held to
 *     one encoding thread because libaom's AVIF output depends on its thread count — the detail
 *     that would otherwise make "byte-identical" true only on the machine that ran it
 *     (`seed/schema/variants.ts` `ENCODER_CONCURRENCY`).
 *  2. **`--check` is the CI mode** (AC-14). Generation never runs in CI: there are no originals
 *     there and no generator. `--check` reads the manifest, the committed site-origin copies under
 *     `public/media/` (always) and the derived tree (where it exists) — every manifest row has a file,
 *     every file has a row, every checksum matches, every declared box matches the slot's ratio,
 *     and the header still equals the pinned pipeline — so a deleted file, an extra file, a
 *     one-byte edit or an un-regenerated option change each fail with the path named.
 *  3. **A missing original is a report, not a failure.** Phase 0 has none (`.local/` is
 *     git-ignored and empty on a fresh clone), so `pnpm media:variants` on this tree derives
 *     nothing and exits 0, leaving the rows and files of assets it has no original for untouched —
 *     which is what makes the command safe to run in a worktree that only holds the committed
 *     derived bytes.
 *
 * **`objectKey`.** Each row carries `media/{assetId}/{width}.{fmt}`: the path under `public/` and
 * the URL minus its leading slash, which in Phase 0 is also the only image origin. Spec 002 §5.2's
 * `objectKey(kind, id, variant)` does not exist yet (TASK-017), and TASK-082 recomputes the keys
 * when the bytes move to R2 (AC-27); until then a second convention invented here would be a
 * convention nobody reads.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { format as formatWithPrettier, resolveConfig } from "prettier";
import sharp from "sharp";

import {
  COMMITTED_MEDIA_DIR,
  COMMITTED_MEDIA_SLOTS,
  DERIVED_MEDIA_DIR,
} from "./budgets.ts";
import {
  MediaFileSchema,
  MediaVariantsFileSchema,
  SEED_DATA_DIR,
} from "./schema/files.ts";
import { SEED_DATASET_VERSION, SEED_SOURCE } from "./schema/header.ts";
import {
  type MediaAssetManifest,
  type MediaFormat,
  type MediaSlot,
  type MediaVariantManifest,
} from "./schema/media.ts";
import {
  ENCODER_CONCURRENCY,
  PINNED_SHARP_VERSION,
  type MediaVariantPipeline,
  variantDimensions,
  variantPipeline,
} from "./schema/variants.ts";
import {
  assertPinnedEncoder,
  deriveVariants,
  hasC2paXmp,
  sha256,
  sortVariants,
  variantLeaf,
  variantObjectKey,
} from "./derive.ts";

// The derive half lives in `./derive.ts` since TASK-082 (the worker shares it without `prettier`
// or the filesystem); every name this module exported before is still exported from here.
export {
  type DerivedVariant,
  type LadderStep,
  assertPinnedEncoder,
  deriveVariants,
  hasC2paXmp,
  ladderFor,
  sha256,
  variantObjectKey,
} from "./derive.ts";

/* -------------------------------------------------------------------------- */
/* Paths and keys.                                                            */
/* -------------------------------------------------------------------------- */

/** The asset manifest this CLI reads, relative to the repository root. */
export const MEDIA_MANIFEST_PATH = `${SEED_DATA_DIR}/media.json`;

/** The variant manifest this CLI writes, relative to the repository root. */
export const VARIANT_MANIFEST_PATH = `${SEED_DATA_DIR}/media-variants.json`;

/**
 * Where the derived bytes go. `.local/media/` since TASK-138: git-ignored, like the originals,
 * because the bytes now live in `flowersoverseas-media` and `scripts/media-upload.ts` puts them
 * there from this directory. It is `seed/budgets.ts`'s constant so that the gate over these
 * files and the CLI that writes them cannot name two different directories.
 */
export const MEDIA_OUTPUT_DIR = DERIVED_MEDIA_DIR;

/** Where the git-ignored originals live for the generation loop (spec 006 §13 Q6). */
export const ORIGINALS_DIR = ".local/imagery/originals";

/**
 * The extensions an original may have, in the order they are searched — sorted so that a directory
 * holding two files for one asset is a stated error rather than a coin flip.
 */
export const ORIGINAL_EXTENSIONS = [
  "avif",
  "jpeg",
  "jpg",
  "png",
  "tif",
  "tiff",
  "webp",
] as const;

/** The repository-relative path one variant is written to. */
export function variantFilePath(
  assetId: string,
  width: number,
  format: MediaFormat,
): string {
  return `${MEDIA_OUTPUT_DIR}/${variantLeaf(assetId, width, format)}`;
}

/**
 * The repository-relative path of a variant's **committed** copy, for an asset in one of
 * `COMMITTED_MEDIA_SLOTS` — the file `staticVariantLoader` addresses as `/media/{leaf}`.
 */
export function committedVariantFilePath(
  assetId: string,
  width: number,
  format: MediaFormat,
): string {
  return `${COMMITTED_MEDIA_DIR}/${variantLeaf(assetId, width, format)}`;
}

/** Whether an asset's variants are committed and served from the site's own origin (TASK-138). */
export function isCommittedSlot(slot: MediaSlot | undefined): boolean {
  return slot !== undefined && COMMITTED_MEDIA_SLOTS.includes(slot);
}

/* -------------------------------------------------------------------------- */
/* Reading the inputs.                                                        */
/* -------------------------------------------------------------------------- */

/** The asset manifest, parsed through its own schema (an unparseable file is a thrown error). */
export function readMediaAssets(root: string): readonly MediaAssetManifest[] {
  const file = MediaFileSchema.parse(
    JSON.parse(readFileSync(join(root, MEDIA_MANIFEST_PATH), "utf8")),
  );
  return file.rows;
}

/**
 * The original of one asset, or `null` when none is present — the Phase-0 case, which is reported
 * and never fatal. Two originals for one asset id is an error: which one produced the committed
 * bytes would otherwise depend on the extension search order, and that is not a fact anybody
 * should have to know.
 */
export function findOriginal(root: string, assetId: string): string | null {
  const found = ORIGINAL_EXTENSIONS.map(
    (extension) => `${ORIGINALS_DIR}/${assetId}.${extension}`,
  ).filter((path) => existsSync(join(root, path)));
  if (found.length > 1) {
    throw new Error(
      `${assetId}: ${String(found.length)} originals present (${found.join(", ")}) — keep exactly one per asset id, so the bytes have one source (spec 006 §2.4)`,
    );
  }
  return found[0] ?? null;
}

/* -------------------------------------------------------------------------- */
/* The manifest file.                                                         */
/* -------------------------------------------------------------------------- */

/** The manifest value: the seed header, the pinned pipeline, and one row per derived file. */
export function variantManifestValue(
  rows: readonly MediaVariantManifest[],
  pipeline: MediaVariantPipeline = variantPipeline(),
): Record<string, unknown> {
  return {
    version: SEED_DATASET_VERSION,
    source: SEED_SOURCE,
    entity: "media_variant",
    // `authored` in the two-value vocabulary of `seed/schema/header.ts`: the file is not a
    // projection of `src/config/catalogue/` (the only thing `projected` may mean, ADR-0017), and
    // the header's own `pipeline` records what wrote it far more precisely than an origin flag
    // could. `seed/README.md` states that `pnpm media:variants` is its only writer.
    origin: "authored",
    pipeline,
    rows,
  };
}

/**
 * Serialise the manifest exactly as `pnpm format:check` expects it — `JSON.stringify` with
 * two-space indentation, then Prettier with the repository configuration resolved for the path.
 * The same choice `seed/project.ts` makes, for the same reason: one formatter, one gate, no
 * generated-file exemption.
 */
export async function serialiseVariantManifest(
  root: string,
  rows: readonly MediaVariantManifest[],
  pipeline: MediaVariantPipeline = variantPipeline(),
): Promise<string> {
  const filepath = join(root, VARIANT_MANIFEST_PATH);
  const config = await resolveConfig(filepath);
  return await formatWithPrettier(
    JSON.stringify(variantManifestValue(rows, pipeline), null, 2),
    { ...(config ?? {}), filepath },
  );
}

/** The committed manifest, parsed, or `null` when the file does not exist yet. */
export function readVariantManifest(root: string): {
  readonly pipeline: MediaVariantPipeline;
  readonly rows: readonly MediaVariantManifest[];
} | null {
  const path = join(root, VARIANT_MANIFEST_PATH);
  if (!existsSync(path)) return null;
  const file = MediaVariantsFileSchema.parse(
    JSON.parse(readFileSync(path, "utf8")),
  );
  return { pipeline: file.pipeline, rows: file.rows };
}

/* -------------------------------------------------------------------------- */
/* Generate mode.                                                             */
/* -------------------------------------------------------------------------- */

/** What one run derived, skipped and removed — printed, and asserted by the tests. */
export interface GenerateReport {
  /** One entry per asset that had an original, in `media.json` order. */
  readonly derived: readonly {
    readonly assetId: string;
    readonly files: number;
    readonly bytes: number;
  }[];
  /** Assets with no original present: reported, never fatal (Phase 0 has 31 of them). */
  readonly missingOriginals: readonly string[];
  /** Assets whose original carries a C2PA claim `sharp` cannot re-embed (spec 006 §8). */
  readonly c2paNotCarried: readonly string[];
  /** Files removed because the ladder no longer contains them (a width or format was dropped). */
  readonly removed: readonly string[];
  /**
   * Rows dropped because neither the file nor an original is there any more — how an asset is
   * retired: delete `public/media/{assetId}/` and re-run.
   */
  readonly droppedRows: readonly string[];
  /** Total bytes of every file the manifest lists — the input to spec 006 AC-15's 6 MB cap. */
  readonly manifestBytes: number;
  /** The manifest's row count after the run. */
  readonly rows: number;
}

/**
 * Derive every asset whose original is present and rewrite the manifest.
 *
 * An asset with **no** original keeps its existing rows and its existing files untouched. That is
 * the case on every machine but the founder's: the committed derived bytes of TASK-080 live in the
 * repository while the originals do not, so a run that dropped their rows would delete the
 * manifest for the bytes that are actually shipped — and `--check` would then fail on a clean
 * checkout. `--only` narrows the same rule to one asset. The single exception is a kept row whose
 * file is not on disk: nothing can honour it, so it is dropped and reported, which is also how an
 * asset is retired (delete its directory, re-run).
 */
export async function generateVariants(options: {
  readonly root: string;
  readonly only?: readonly string[];
  readonly pipeline?: MediaVariantPipeline;
}): Promise<GenerateReport> {
  assertPinnedEncoder();
  const { root } = options;
  const pipeline = options.pipeline ?? variantPipeline();
  const assets = readMediaAssets(root);
  const assetOrder = assets.map((asset) => asset.id);

  if (options.only !== undefined) {
    const unknown = options.only.filter((id) => !assetOrder.includes(id));
    if (unknown.length > 0) {
      throw new Error(
        `--only names ${unknown.join(", ")}, which is not an asset in ${MEDIA_MANIFEST_PATH}`,
      );
    }
  }
  const targeted = (asset: MediaAssetManifest): boolean =>
    options.only === undefined || options.only.includes(asset.id);

  const existing = readVariantManifest(root)?.rows ?? [];
  const kept: MediaVariantManifest[] = [];
  const derivedRows: MediaVariantManifest[] = [];
  const report = {
    derived: [] as { assetId: string; files: number; bytes: number }[],
    missingOriginals: [] as string[],
    c2paNotCarried: [] as string[],
    removed: [] as string[],
    droppedRows: [] as string[],
  };

  for (const asset of assets) {
    const original = targeted(asset) ? findOriginal(root, asset.id) : null;
    if (original === null) {
      // No original: the existing rows and files stay exactly as they are — except a row whose
      // file is not on disk, which nothing can honour. Dropping it (and saying so) is what makes
      // "delete the directory and re-run" the way to retire an asset; `--check`, which never
      // regenerates anything, still fails on a file deleted behind the manifest's back (AC-14).
      for (const row of existing.filter(
        (entry) => entry.assetId === asset.id,
      )) {
        const path = variantFilePath(row.assetId, row.width, row.format);
        if (existsSync(join(root, path))) kept.push(row);
        else report.droppedRows.push(path);
      }
      if (targeted(asset)) report.missingOriginals.push(asset.id);
      continue;
    }

    const bytes = readFileSync(join(root, original));
    const metadata = await sharp(bytes).metadata();
    if (hasC2paMarking(bytes) && !hasC2paXmp(metadata.xmp)) {
      report.c2paNotCarried.push(asset.id);
    }

    const variants = await deriveVariants(asset, bytes, pipeline);
    const written = new Set<string>();
    const committed = isCommittedSlot(asset.slot);
    for (const variant of variants) {
      const path = variantFilePath(
        asset.id,
        variant.row.width,
        variant.row.format,
      );
      mkdirSync(join(root, MEDIA_OUTPUT_DIR, asset.id), { recursive: true });
      writeFileSync(join(root, path), variant.data);
      written.add(path);
      if (committed) {
        // The site-origin copy (TASK-138's split): the same bytes, so the committed file, the
        // derived file and the object in the bucket can never be three different photographs.
        const copy = committedVariantFilePath(
          asset.id,
          variant.row.width,
          variant.row.format,
        );
        mkdirSync(join(root, COMMITTED_MEDIA_DIR, asset.id), {
          recursive: true,
        });
        writeFileSync(join(root, copy), variant.data);
        written.add(copy);
      }
      derivedRows.push(variant.row);
    }
    report.removed.push(
      ...removeOrphans(root, MEDIA_OUTPUT_DIR, asset.id, written),
      ...(committed
        ? removeOrphans(root, COMMITTED_MEDIA_DIR, asset.id, written)
        : []),
    );
    report.derived.push({
      assetId: asset.id,
      files: variants.length,
      bytes: variants.reduce((sum, variant) => sum + variant.row.bytes, 0),
    });
  }

  // Rows the manifest listed for assets that are no longer in `media.json` are dropped: the asset
  // manifest is the source of truth for what exists (spec 006 §2.1).
  const rows = sortRows([...kept, ...derivedRows], assetOrder);
  writeFileSync(
    join(root, VARIANT_MANIFEST_PATH),
    await serialiseVariantManifest(root, rows, pipeline),
  );

  return {
    ...report,
    rows: rows.length,
    manifestBytes: rows.reduce((sum, row) => sum + row.bytes, 0),
  };
}

/** `sortVariants` for bare rows (the kept ones have no buffer). */
function sortRows(
  rows: readonly MediaVariantManifest[],
  assetOrder: readonly string[],
): MediaVariantManifest[] {
  return sortVariants(
    rows.map((row) => ({ row, data: Buffer.alloc(0) })),
    assetOrder,
  ).map((variant) => variant.row);
}

/**
 * Delete files under one asset's directory that the current ladder no longer produces. Without
 * this, dropping a width from the pinned ladder would leave an orphan file that `--check` reports
 * as "no manifest entry" on the next CI run — a failure whose cause is three commits old.
 */
function removeOrphans(
  root: string,
  base: string,
  assetId: string,
  written: ReadonlySet<string>,
): string[] {
  const directory = join(root, base, assetId);
  if (!existsSync(directory)) return [];
  const removed: string[] = [];
  for (const leaf of readdirSync(directory).sort()) {
    const path = `${base}/${assetId}/${leaf}`;
    if (written.has(path)) continue;
    rmSync(join(root, path), { recursive: true });
    removed.push(path);
  }
  return removed;
}

/**
 * Whether the original carries a C2PA manifest at all — the JUMBF box label `c2pa` or a `c2pa`
 * claim in its XMP. Used only to tell the operator when a marking cannot survive the re-encode
 * (spec 006 §8); it never changes what is written.
 */
export function hasC2paMarking(original: Buffer): boolean {
  return original.includes(Buffer.from("c2pa", "latin1"));
}

/* -------------------------------------------------------------------------- */
/* Check mode (the CI gate, AC-14).                                           */
/* -------------------------------------------------------------------------- */

/** Every problem `--check` found, plus the totals it prints. */
export interface CheckReport {
  /** One line per problem, each naming the file or the row it is about. */
  readonly problems: readonly string[];
  readonly rows: number;
  readonly files: number;
  /**
   * Whether a derived tree was there to check at all. `false` on a clean clone and on every CI
   * runner since TASK-138 — the bytes are git-ignored — and the flag is reported rather than
   * inferred from `files === 0` so that "no tree" and "an empty tree" cannot be confused, and so
   * that a reader of the CI log can see which half of the check ran.
   */
  readonly derivedTreePresent: boolean;
  /**
   * Files under `public/media/` — the committed site-origin copies (`COMMITTED_MEDIA_SLOTS`).
   * Checked on **every** runner, CI included, because they are in the repository: a missing one
   * is a 404 on the home page's LCP image, and an extra one is committed bytes no page requests.
   */
  readonly committedFiles: number;
  /**
   * The bytes of every file the manifest lists — the input to spec 006 AC-15's 6 MB cap, printed
   * rather than enforced: the cap is `pnpm seed:check`'s rule 9 (TASK-075) and the committed set
   * is TASK-080's. (The field is not called `total…` because `fo/no-float-money` reads that word
   * as money, and no `eslint-disable` for that rule may exist anywhere — spec 005 AC-4.)
   */
  readonly manifestBytes: number;
}

/**
 * Verify the manifest, and the files wherever they exist: manifest ↔ files ↔ checksums, plus the
 * invariants a hand edit would break — the header still equals the pinned pipeline, every row's
 * box is the one the slot's declared aspect ratio gives at that width, every `objectKey` and
 * `variant` is the canonical one.
 *
 * **Two halves since TASK-138, and the split is deliberate.** The derived bytes are no longer
 * committed, so a clean clone and every CI runner have no files to read. The manifest half —
 * which is every rule above — runs *always*, because the manifest is committed, is what both the
 * loader and the uploader read, and is therefore the artefact a review can actually catch a fault
 * in. The file half runs wherever `.local/media/` exists (the founder's machine, immediately
 * after a derivation, and before every upload), and there it is exact: byte count and SHA-256 per
 * file, plus an orphan check in the other direction. What CI loses by not holding the bytes it
 * gets back at the only moment it matters — `scripts/media-upload.ts` runs this same check and
 * refuses to put a single object into the bucket while it reports a problem.
 *
 * No `sharp` call and no image decode: the checksum already ties the recorded width, height and
 * byte count to those exact bytes, so re-decoding would only add a dependency to the mode that
 * runs most often.
 */
export function checkVariants(options: {
  readonly root: string;
  /** The pipeline the header must equal; the pinned one everywhere but a test fixture. */
  readonly pipeline?: MediaVariantPipeline;
}): CheckReport {
  const { root } = options;
  const problems: string[] = [];

  const manifest = readVariantManifest(root);
  if (manifest === null) {
    return {
      problems: [
        `${VARIANT_MANIFEST_PATH}: missing — run \`pnpm media:variants\` (the file exists with an empty \`rows\` list until the first asset is derived)`,
      ],
      rows: 0,
      files: 0,
      derivedTreePresent: false,
      committedFiles: 0,
      manifestBytes: 0,
    };
  }

  const pinned = options.pipeline ?? variantPipeline();
  for (const key of Object.keys(pinned) as (keyof MediaVariantPipeline)[]) {
    if (
      JSON.stringify(manifest.pipeline[key]) !== JSON.stringify(pinned[key])
    ) {
      problems.push(
        `${VARIANT_MANIFEST_PATH}: header \`pipeline.${key}\` is ${JSON.stringify(manifest.pipeline[key])} but the pinned pipeline says ${JSON.stringify(pinned[key])} — an encoder change is a whole-manifest re-derivation, never a header edit (spec 006 AC-13). Run \`pnpm media:variants\``,
      );
    }
  }

  const slots = new Map<string, MediaSlot>(
    readMediaAssets(root).map((asset) => [asset.id, asset.slot]),
  );
  const expectedFiles = new Set<string>();
  const expectedCommitted = new Set<string>();
  const derivedTreePresent = existsSync(join(root, MEDIA_OUTPUT_DIR));

  for (const row of manifest.rows) {
    const path = variantFilePath(row.assetId, row.width, row.format);
    expectedFiles.add(path);

    const slot = slots.get(row.assetId);
    // The committed half (TASK-138's split) runs on **every** runner: these bytes are in the
    // repository, and `staticVariantLoader` sends the home page's LCP request straight at them.
    if (isCommittedSlot(slot)) {
      const copy = committedVariantFilePath(row.assetId, row.width, row.format);
      expectedCommitted.add(copy);
      problems.push(...fileProblems(root, copy, row));
    }
    if (slot === undefined) {
      problems.push(
        `${VARIANT_MANIFEST_PATH}: row \`${path}\` names \`${row.assetId}\`, which is not an asset in ${MEDIA_MANIFEST_PATH}`,
      );
    } else {
      const box = variantDimensions(slot, row.width);
      if (row.width !== box.width || row.height !== box.height) {
        problems.push(
          `${path}: manifest says ${String(row.width)}×${String(row.height)} but slot \`${slot}\` at width ${String(row.width)} is ${String(box.width)}×${String(box.height)} (spec 006 §13 Q5's declared aspect ratios)`,
        );
      }
    }
    if (
      row.objectKey !== variantObjectKey(row.assetId, row.width, row.format)
    ) {
      problems.push(
        `${path}: manifest \`objectKey\` is \`${row.objectKey}\`, expected \`${variantObjectKey(row.assetId, row.width, row.format)}\``,
      );
    }
    if (row.variant !== String(row.width)) {
      problems.push(
        `${path}: manifest \`variant\` is \`${row.variant}\`, expected \`${String(row.width)}\` (spec 006 §5.2: the ladder step's name is its width)`,
      );
    }

    // No derived tree: the manifest is checked on its own terms and the byte-level half is
    // reported as not run (see the header). Reporting 118 "missing file" problems for a tree
    // nobody is expected to hold would turn the gate into noise, and noise is how a real missing
    // file gets scrolled past.
    if (!derivedTreePresent) continue;

    problems.push(...fileProblems(root, path, row));
  }

  for (const path of derivedVariantFiles(root)) {
    if (!expectedFiles.has(path)) {
      problems.push(
        `${path}: no entry in ${VARIANT_MANIFEST_PATH} — every derived byte under ${MEDIA_OUTPUT_DIR}/ is listed with its checksum or it is not uploaded (spec 006 AC-14)`,
      );
    }
  }

  const committedFiles = committedVariantFiles(root);
  for (const path of committedFiles) {
    if (!expectedCommitted.has(path)) {
      problems.push(
        `${path}: committed under ${COMMITTED_MEDIA_DIR}/ but not a variant of a site-origin slot (${COMMITTED_MEDIA_SLOTS.join(", ")}) in ${VARIANT_MANIFEST_PATH} — only those slots are served from this origin, so any other committed byte is weight under the repository cap that no page requests (TASK-138)`,
      );
    }
  }

  return {
    problems,
    rows: manifest.rows.length,
    files: derivedVariantFiles(root).length,
    derivedTreePresent,
    committedFiles: committedFiles.length,
    manifestBytes: manifest.rows.reduce((sum, row) => sum + row.bytes, 0),
  };
}

/** One file against its manifest row: present, the recorded byte count, the recorded SHA-256. */
function fileProblems(
  root: string,
  path: string,
  row: { readonly bytes: number; readonly checksumSha256: string },
): string[] {
  const absolute = join(root, path);
  if (!existsSync(absolute)) {
    return [
      `${path}: listed in ${VARIANT_MANIFEST_PATH} but the file is missing — a manifest entry without a file renders a 404 (spec 006 AC-14)`,
    ];
  }
  const problems: string[] = [];
  const data = readFileSync(absolute);
  if (data.byteLength !== row.bytes) {
    problems.push(
      `${path}: ${String(data.byteLength)} bytes on disk, ${String(row.bytes)} in ${VARIANT_MANIFEST_PATH}`,
    );
  }
  const digest = sha256(data);
  if (digest !== row.checksumSha256) {
    problems.push(
      `${path}: sha256 ${digest} on disk, ${row.checksumSha256} in ${VARIANT_MANIFEST_PATH} — the file was edited without re-deriving (spec 006 AC-14)`,
    );
  }
  return problems;
}

/** Every derived file, repository-relative, sorted — the "every file" of AC-14. */
export function derivedVariantFiles(root: string): readonly string[] {
  return filesUnder(root, MEDIA_OUTPUT_DIR);
}

/** Every committed site-origin file under `public/media/`, repository-relative, sorted. */
export function committedVariantFiles(root: string): readonly string[] {
  return filesUnder(root, COMMITTED_MEDIA_DIR);
}

function filesUnder(root: string, base: string): readonly string[] {
  const walk = (relativeDirectory: string): string[] => {
    const absolute = join(root, relativeDirectory);
    if (!existsSync(absolute)) return [];
    return readdirSync(absolute)
      .sort()
      .flatMap((leaf) => {
        const path = `${relativeDirectory}/${leaf}`;
        return statSync(join(root, path)).isDirectory()
          ? walk(path)
          : [path.split(sep).join("/")];
      });
  };
  return walk(base);
}

/* -------------------------------------------------------------------------- */
/* CLI.                                                                       */
/* -------------------------------------------------------------------------- */

/** `--only a --only b` and `--only=a` both name assets; anything else positional is the root. */
export function parseArgs(argv: readonly string[]): {
  readonly check: boolean;
  readonly only: readonly string[] | undefined;
  readonly root: string | undefined;
} {
  const only: string[] = [];
  let check = false;
  let root: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] as string;
    if (arg === "--check") {
      check = true;
    } else if (arg.startsWith("--only=")) {
      only.push(arg.slice("--only=".length));
    } else if (arg === "--only") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error("--only needs an asset id: `--only fo-bq-001-hero`");
      }
      only.push(value);
      index += 1;
    } else if (!arg.startsWith("--")) {
      root = arg;
    } else {
      throw new Error(
        `unknown flag \`${arg}\` — \`pnpm media:variants [--check] [--only <assetId>]\``,
      );
    }
  }
  return { check, only: only.length > 0 ? only : undefined, root };
}

const isMain =
  typeof process.argv[1] === "string" &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  const root = resolve(args.root ?? process.cwd());

  if (args.check) {
    const report = checkVariants({ root });
    for (const problem of report.problems) {
      process.stderr.write(`${problem}\n`);
    }
    if (report.problems.length > 0) process.exit(1);
    const committed = `${String(report.committedFiles)} committed file(s) under ${COMMITTED_MEDIA_DIR}/ matched (${COMMITTED_MEDIA_SLOTS.join(", ")})`;
    process.stdout.write(
      report.derivedTreePresent
        ? `${VARIANT_MANIFEST_PATH}: ${String(report.rows)} variant(s), ${String(report.files)} file(s) under ${MEDIA_OUTPUT_DIR}/, ${String(report.manifestBytes)} byte(s), every checksum matched; ${committed} (sharp ${PINNED_SHARP_VERSION}, ${String(ENCODER_CONCURRENCY)} thread)\n`
        : `${VARIANT_MANIFEST_PATH}: ${String(report.rows)} variant(s), ${String(report.manifestBytes)} byte(s), manifest clean; ${committed} — no derived tree under ${MEDIA_OUTPUT_DIR}/, so the derived checksum half did not run (every other slot lives in the media bucket since TASK-138; run \`pnpm media:variants\` to derive them locally)\n`,
    );
  } else {
    const report = await generateVariants({
      root,
      ...(args.only === undefined ? {} : { only: args.only }),
    });
    for (const asset of report.derived) {
      process.stdout.write(
        `${asset.assetId}: ${String(asset.files)} file(s), ${String(asset.bytes)} byte(s)\n`,
      );
    }
    for (const path of report.removed) {
      process.stdout.write(`${path}: removed (no longer in the ladder)\n`);
    }
    for (const path of report.droppedRows) {
      process.stdout.write(
        `${path}: dropped from the manifest (no file on disk and no original to re-derive it from)\n`,
      );
    }
    for (const assetId of report.c2paNotCarried) {
      process.stdout.write(
        `${assetId}: the original carries a C2PA marking sharp cannot re-embed; provenance stays in ${MEDIA_MANIFEST_PATH} (spec 006 §8)\n`,
      );
    }
    if (report.missingOriginals.length > 0) {
      process.stdout.write(
        `no original under ${ORIGINALS_DIR}/ for ${String(report.missingOriginals.length)} asset(s): ${report.missingOriginals.join(", ")} — nothing derived for them, their existing rows and files are untouched (spec 006 §2.4: originals are never committed)\n`,
      );
    }
    process.stdout.write(
      `${VARIANT_MANIFEST_PATH}: ${String(report.rows)} variant(s), ${String(report.manifestBytes)} byte(s) total\n`,
    );
  }
}
