/**
 * T-12, T-13 and T-14 (spec 006 AC-12, AC-13, AC-14; TASK-078): the deterministic `sharp` ladder,
 * the pinned encoder recorded in the manifest header, and the `--check` mode CI runs.
 *
 * **The fixture originals are generated here and never committed.** Spec 006 §2.4 and §13 Q6 are
 * unconditional — no original enters the repository — so the three T-12 fixtures (portrait 4:5,
 * square 1:1, landscape 3:2) are built with `sharp` itself from a deterministic pixel pattern into
 * a temporary directory, complete with an ICC profile and an EXIF block carrying GPS, which is
 * what makes "EXIF and GPS are stripped, the colour profile is kept" an observable assertion
 * rather than a claim about a default.
 *
 * **Why some cases run a reduced ladder.** AVIF at effort 4 is slow on purpose (it buys the
 * transfer budget of `plan/01` §7): the full seven-width ladder of one asset is ~8 s. So the
 * ladder itself is asserted once at the **real pinned pipeline**, and the aspect-ratio, metadata,
 * determinism and `--check` cases run a pipeline that differs from it only in `widths` and
 * `ogJpegWidth` — the two fields that cannot change what any of them is testing. The pinned values
 * themselves are asserted against spec 006 §13 Q5 field by field in the first block, so a reduced
 * ladder in a test can never hide a changed quality setting.
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  MEDIA_OUTPUT_DIR,
  VARIANT_MANIFEST_PATH,
  assertPinnedEncoder,
  checkVariants,
  committedVariantFiles,
  deriveVariants,
  findOriginal,
  generateVariants,
  hasC2paXmp,
  readVariantManifest,
  serialiseVariantManifest,
  variantFilePath,
  variantObjectKey,
} from "../../seed/media-variants.ts";
import {
  MediaVariantsFileSchema,
  SEED_DATA_DIR,
} from "../../seed/schema/files.ts";
import type { MediaSlot } from "../../seed/schema/media.ts";
import {
  AVIF_OPTIONS,
  ENCODER_CONCURRENCY,
  JPEG_OPTIONS,
  OG_JPEG_WIDTH,
  PINNED_LIBVIPS_VERSION,
  PINNED_SHARP_VERSION,
  VARIANT_WIDTHS,
  WEBP_OPTIONS,
  type MediaVariantPipeline,
  aspectFor,
  variantDimensions,
  variantPipeline,
} from "../../seed/schema/variants.ts";

const repoRoot = resolve(__dirname, "../..");

/** A long timeout for the cases that encode AVIF at production effort. */
const ENCODE_TIMEOUT = 240_000;

/* -------------------------------------------------------------------------- */
/* Fixtures.                                                                  */
/* -------------------------------------------------------------------------- */

/** The IFD0 copyright the fixture carries and no derived file may. */
const FIXTURE_COPYRIGHT = "Flowers Overseas fixture";

/**
 * A deterministic image: the pixel values are a pure function of (x, y), so the fixture bytes are
 * the same on every run and every machine. Noise would have been a better encoder workout and
 * would have made "two runs are byte-identical" untestable.
 */
async function fixtureOriginal(width: number, height: number): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 3;
      raw[index] = (x * 7 + y * 3) % 256;
      raw[index + 1] = (x * x + y) % 256;
      raw[index + 2] = (x + y * 11) % 256;
    }
  }
  return await sharp(raw, { raw: { width, height, channels: 3 } })
    // A wide-gamut profile, so "the colour profile is kept" is visible as a byte-for-byte
    // comparison rather than as the presence of some profile.
    .withIccProfile("p3")
    // Exactly the metadata `plan/01` §6 says must not survive: authorship in IFD0 and a location
    // in the GPS IFD.
    .withExif({
      IFD0: { Copyright: FIXTURE_COPYRIGHT, Artist: "fixture-studio" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "51/1 30/1 0/1" },
    })
    .jpeg({ quality: 95 })
    .toBuffer();
}

/** The three T-12 originals: portrait 4:5, square 1:1, landscape 3:2. */
const FIXTURES = [
  { id: "fixture-portrait", slot: "productHero", width: 1000, height: 1250 },
  { id: "fixture-square", slot: "occasionTile", width: 1200, height: 1200 },
  { id: "fixture-landscape", slot: "hero", width: 1500, height: 1000 },
] as const satisfies readonly {
  id: string;
  slot: MediaSlot;
  width: number;
  height: number;
}[];

const PROMPT_HASH = createHash("sha256").update("fixture").digest("hex");

/** A `seed/data/media.json` for the fixture assets, parseable by `MediaFileSchema`. */
function fixtureMediaJson(): string {
  return JSON.stringify(
    {
      version: 1,
      source: "seed",
      entity: "media_asset",
      origin: "authored",
      rows: FIXTURES.map((fixture, index) => ({
        id: fixture.id,
        depicts: fixture.slot === "occasionTile" ? "brand" : "product",
        slot: fixture.slot,
        source: "ai",
        generator: "fixture",
        generatorModel: "fixture-1",
        promptHash: PROMPT_HASH,
        generatorSeed: 1,
        reviewState: "pending",
        sortOrder: index,
        isPrimary: false,
      })),
    },
    null,
    2,
  );
}

/**
 * A temporary repository root holding `seed/data/media.json` and, unless `withOriginals` is false,
 * one original per fixture asset under the git-ignored originals path.
 */
async function makeRoot(
  options: { readonly withOriginals?: boolean } = {},
): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), "fo-media-variants-"));
  mkdirSync(join(root, SEED_DATA_DIR), { recursive: true });
  writeFileSync(join(root, SEED_DATA_DIR, "media.json"), fixtureMediaJson());
  if (options.withOriginals !== false) {
    mkdirSync(join(root, ".local/imagery/originals"), { recursive: true });
    for (const fixture of FIXTURES) {
      writeFileSync(
        join(root, `.local/imagery/originals/${fixture.id}.jpeg`),
        await fixtureOriginal(fixture.width, fixture.height),
      );
    }
  }
  return root;
}

/**
 * The pinned pipeline with a shorter ladder, for the cases whose subject is not the ladder. Only
 * `widths` and `ogJpegWidth` change; every encoder option, the aspect table and the metadata
 * policy are the real ones.
 */
function reducedPipeline(
  overrides: Partial<MediaVariantPipeline> = {},
): MediaVariantPipeline {
  return {
    ...variantPipeline(),
    widths: [384, 1080],
    ogJpegWidth: 384,
    ...overrides,
  };
}

const roots: string[] = [];
function trackedRoot(root: string): string {
  roots.push(root);
  return root;
}

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

/* -------------------------------------------------------------------------- */
/* The pinned pipeline (AC-13).                                               */
/* -------------------------------------------------------------------------- */

describe("spec 006 AC-13: the encoder is pinned and recorded, not defaulted", () => {
  const manifest = JSON.parse(
    readFileSync(join(repoRoot, "package.json"), "utf8"),
  ) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    scripts: Record<string, string>;
  };

  it("pins sharp to an exact version, as a devDependency only", () => {
    // spec 006 §8: `sharp` is used by a local CLI and never at request time, so its CVE surface is
    // outside the deployed runtime — which is only true while it is not a production dependency.
    expect(manifest.dependencies.sharp).toBeUndefined();
    expect(manifest.devDependencies.sharp).toBe(PINNED_SHARP_VERSION);
    expect(manifest.devDependencies.sharp).not.toMatch(/[\^~><*]/);
  });

  it("exposes the CLI as `pnpm media:variants`", () => {
    expect(manifest.scripts["media:variants"]).toBe(
      "node seed/media-variants.ts",
    );
  });

  it("runs on the pinned sharp and libvips, or refuses to run at all", () => {
    expect(sharp.versions.sharp).toBe(PINNED_SHARP_VERSION);
    expect(sharp.versions.vips).toBe(PINNED_LIBVIPS_VERSION);
    expect(() => {
      assertPinnedEncoder();
    }).not.toThrow();
  });

  it("records spec 006 §13 Q5's ladder and qualities verbatim", () => {
    expect([...VARIANT_WIDTHS]).toEqual([
      384, 640, 828, 1080, 1200, 1600, 1920,
    ]);
    expect(OG_JPEG_WIDTH).toBe(1200);
    expect(AVIF_OPTIONS.quality).toBe(50);
    expect(AVIF_OPTIONS.effort).toBe(4);
    expect(WEBP_OPTIONS.quality).toBe(72);
    expect(JPEG_OPTIONS.quality).toBe(82);
    // One thread: libaom's AVIF output depends on the thread count, so this is the difference
    // between "deterministic" and "deterministic on the machine that ran it".
    expect(ENCODER_CONCURRENCY).toBe(1);
    expect(variantPipeline().concurrency).toBe(1);
  });

  it("declares the aspect ratio of every slot spec 006 §13 Q5 names", () => {
    expect(aspectFor("productHero", 640).ratio).toBe("4:5");
    expect(aspectFor("productDetail", 640).ratio).toBe("4:5");
    expect(aspectFor("productThumb", 640).ratio).toBe("4:5");
    expect(aspectFor("occasionTile", 640).ratio).toBe("1:1");
    expect(aspectFor("context", 640).ratio).toBe("3:2");
    // The hero band is 4:3 at the mobile widths and 16:9 from 1080 up.
    expect(aspectFor("hero", 384).ratio).toBe("4:3");
    expect(aspectFor("hero", 828).ratio).toBe("4:3");
    expect(aspectFor("hero", 1080).ratio).toBe("16:9");
    expect(aspectFor("hero", 1920).ratio).toBe("16:9");
  });

  it("keeps the committed manifest's header equal to the pinned pipeline", () => {
    const committed = readVariantManifest(repoRoot);
    expect(committed).not.toBeNull();
    expect(committed?.pipeline).toEqual(variantPipeline());
  });

  it("records no clock, environment or machine name in the manifest", () => {
    const text = readFileSync(join(repoRoot, VARIANT_MANIFEST_PATH), "utf8");
    expect(text).not.toMatch(
      /generatedAt|timestamp|\bhostname\b|\d{4}-\d\d-\d\d/,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* T-12 — the ladder, the ratios and the metadata (AC-12).                    */
/* -------------------------------------------------------------------------- */

describe("T-12: the ladder over three fixture originals (AC-12)", () => {
  it(
    "derives AVIF and WebP at every declared width plus one OG JPEG",
    async () => {
      const pipeline = variantPipeline();
      const original = await fixtureOriginal(1000, 1250);
      const derived = await deriveVariants(
        { id: "fixture-portrait", slot: "productHero" },
        original,
        pipeline,
      );

      expect(derived).toHaveLength(VARIANT_WIDTHS.length * 2 + 1);
      for (const width of VARIANT_WIDTHS) {
        for (const format of ["avif", "webp"] as const) {
          const row = derived.find(
            (variant) =>
              variant.row.width === width && variant.row.format === format,
          );
          expect(row, `${String(width)}.${format}`).toBeDefined();
        }
      }
      const jpegs = derived.filter((variant) => variant.row.format === "jpeg");
      expect(jpegs).toHaveLength(1);
      expect(jpegs[0]?.row.width).toBe(OG_JPEG_WIDTH);

      // Every row describes its own bytes: the byte count, the checksum, the key and the ladder
      // step's name (spec 006 §5.2 — the width as a string).
      for (const { row, data } of derived) {
        expect(row.bytes).toBe(data.byteLength);
        expect(row.checksumSha256).toBe(
          createHash("sha256").update(data).digest("hex"),
        );
        expect(row.objectKey).toBe(
          variantObjectKey(row.assetId, row.width, row.format),
        );
        expect(row.variant).toBe(String(row.width));
        // The declared 4:5 box, and the actual pixels agree with it.
        expect({ width: row.width, height: row.height }).toEqual(
          variantDimensions("productHero", row.width),
        );
        const metadata = await sharp(data).metadata();
        expect(metadata.width).toBe(row.width);
        expect(metadata.height).toBe(row.height);
      }

      // Rows come out in ladder order — width ascending, then AVIF, WebP, JPEG — so a manifest
      // diff reads top-down.
      expect(
        derived.map(
          (variant) => `${String(variant.row.width)}.${variant.row.format}`,
        ),
      ).toEqual([
        "384.avif",
        "384.webp",
        "640.avif",
        "640.webp",
        "828.avif",
        "828.webp",
        "1080.avif",
        "1080.webp",
        "1200.avif",
        "1200.webp",
        "1200.jpeg",
        "1600.avif",
        "1600.webp",
        "1920.avif",
        "1920.webp",
      ]);
    },
    ENCODE_TIMEOUT,
  );

  it(
    "crops each slot to its declared aspect ratio, whatever the original's",
    async () => {
      const pipeline = reducedPipeline();
      const cases = [
        {
          fixture: FIXTURES[0],
          expected: [
            { width: 384, height: 480 },
            { width: 1080, height: 1350 },
          ],
        },
        {
          fixture: FIXTURES[1],
          expected: [
            { width: 384, height: 384 },
            { width: 1080, height: 1080 },
          ],
        },
        {
          // The hero band: 4:3 at 384 (a phone) and 16:9 at 1080 (a desktop).
          fixture: FIXTURES[2],
          expected: [
            { width: 384, height: 288 },
            { width: 1080, height: 608 },
          ],
        },
      ] as const;

      for (const testCase of cases) {
        const original = await fixtureOriginal(
          testCase.fixture.width,
          testCase.fixture.height,
        );
        const derived = await deriveVariants(
          { id: testCase.fixture.id, slot: testCase.fixture.slot },
          original,
          pipeline,
        );
        for (const box of testCase.expected) {
          const avif = derived.find(
            (variant) =>
              variant.row.width === box.width && variant.row.format === "avif",
          );
          expect(
            avif,
            `${testCase.fixture.id} ${String(box.width)}`,
          ).toBeDefined();
          expect(avif?.row.height).toBe(box.height);
          const metadata = await sharp(avif?.data as Buffer).metadata();
          expect(metadata.width).toBe(box.width);
          expect(metadata.height).toBe(box.height);
        }
      }
    },
    ENCODE_TIMEOUT,
  );

  it(
    "strips EXIF and GPS unconditionally and keeps the colour profile",
    async () => {
      const original = await fixtureOriginal(1000, 1250);
      const originalMetadata = await sharp(original).metadata();
      // The fixture really does carry what must not survive.
      expect(originalMetadata.exif).toBeDefined();
      expect(originalMetadata.icc).toBeDefined();

      const derived = await deriveVariants(
        { id: "fixture-portrait", slot: "productHero" },
        original,
        reducedPipeline({ widths: [384], ogJpegWidth: 384 }),
      );
      expect(derived.map((variant) => variant.row.format).sort()).toEqual([
        "avif",
        "jpeg",
        "webp",
      ]);

      for (const { row, data } of derived) {
        const metadata = await sharp(data).metadata();
        expect(metadata.exif, `${row.format} exif`).toBeUndefined();
        // The profile is not merely present, it is the original's: dropping it and re-tagging
        // sRGB would silently shift a colour a buyer chose on.
        expect(metadata.icc, `${row.format} icc`).toBeDefined();
        expect(
          Buffer.compare(
            metadata.icc as Buffer,
            originalMetadata.icc as Buffer,
          ),
        ).toBe(0);
        // Nothing personal survives in the bytes either — not the IFD0 authorship, not the GPS.
        expect(data.includes(Buffer.from(FIXTURE_COPYRIGHT, "latin1"))).toBe(
          false,
        );
        expect(data.includes(Buffer.from("GPSLatitude", "latin1"))).toBe(false);
      }
    },
    ENCODE_TIMEOUT,
  );

  it("recognises a C2PA claim in XMP and no claim at all", () => {
    expect(hasC2paXmp(undefined)).toBe(false);
    expect(hasC2paXmp(Buffer.from("<x:xmpmeta><dc:title/></x:xmpmeta>"))).toBe(
      false,
    );
    expect(
      hasC2paXmp(Buffer.from('<x:xmpmeta xmlns:c2pa="http://c2pa.org/"/>')),
    ).toBe(true);
  });

  it(
    "writes the files and the manifest the report describes",
    async () => {
      const root = trackedRoot(await makeRoot());
      const report = await generateVariants({
        root,
        pipeline: reducedPipeline({ widths: [384], ogJpegWidth: 384 }),
      });

      expect(report.missingOriginals).toEqual([]);
      expect(report.derived.map((entry) => entry.assetId)).toEqual(
        FIXTURES.map((fixture) => fixture.id),
      );
      expect(report.rows).toBe(FIXTURES.length * 3);

      const manifest = MediaVariantsFileSchema.parse(
        JSON.parse(readFileSync(join(root, VARIANT_MANIFEST_PATH), "utf8")),
      );
      expect(manifest.rows).toHaveLength(FIXTURES.length * 3);
      expect(
        manifest.rows
          .map((row) => row.assetId)
          .filter((id, index, all) => all.indexOf(id) === index),
      ).toEqual(FIXTURES.map((fixture) => fixture.id));
      for (const row of manifest.rows) {
        const path = join(
          root,
          variantFilePath(row.assetId, row.width, row.format),
        );
        expect(existsSync(path), path).toBe(true);
        expect(readFileSync(path).byteLength).toBe(row.bytes);
      }
      expect(report.manifestBytes).toBe(
        manifest.rows.reduce((sum, row) => sum + row.bytes, 0),
      );
    },
    ENCODE_TIMEOUT,
  );

  it("reports a missing original instead of failing, and touches nothing", async () => {
    const root = trackedRoot(await makeRoot({ withOriginals: false }));
    const report = await generateVariants({
      root,
      pipeline: reducedPipeline(),
    });

    expect(report.missingOriginals).toEqual(FIXTURES.map((f) => f.id));
    expect(report.derived).toEqual([]);
    expect(report.rows).toBe(0);
    expect(existsSync(join(root, MEDIA_OUTPUT_DIR))).toBe(false);
    expect(findOriginal(root, FIXTURES[0].id)).toBeNull();
  });

  it(
    "retires an asset: its directory deleted and re-run drops its rows",
    async () => {
      const root = trackedRoot(await makeRoot());
      const pipeline = reducedPipeline({ widths: [384], ogJpegWidth: 384 });
      await generateVariants({ root, pipeline });
      const retired = FIXTURES[1].id;
      rmSync(join(root, MEDIA_OUTPUT_DIR, retired), { recursive: true });
      rmSync(join(root, `.local/imagery/originals/${retired}.jpeg`));

      const report = await generateVariants({ root, pipeline });
      expect(report.droppedRows).toEqual([
        variantFilePath(retired, 384, "avif"),
        variantFilePath(retired, 384, "webp"),
        variantFilePath(retired, 384, "jpeg"),
      ]);
      expect(
        (readVariantManifest(root)?.rows ?? []).some(
          (row) => row.assetId === retired,
        ),
      ).toBe(false);
      // …and the tree is consistent again, which is the point of dropping them.
      expect(checkVariants({ root, pipeline }).problems).toEqual([]);
    },
    ENCODE_TIMEOUT,
  );

  it("rejects an --only that names an asset the manifest does not have", async () => {
    const root = trackedRoot(await makeRoot({ withOriginals: false }));
    await expect(
      generateVariants({
        root,
        only: ["not-an-asset"],
        pipeline: reducedPipeline(),
      }),
    ).rejects.toThrow(/not-an-asset/);
  });
});

/* -------------------------------------------------------------------------- */
/* T-13 — determinism (AC-13).                                                */
/* -------------------------------------------------------------------------- */

describe("T-13: two runs are byte-identical; one changed option is a whole-manifest diff (AC-13)", () => {
  const pipeline = reducedPipeline({ widths: [384], ogJpegWidth: 384 });
  let first: string;
  let second: string;

  beforeAll(async () => {
    first = trackedRoot(await makeRoot());
    second = trackedRoot(await makeRoot());
    await generateVariants({ root: first, pipeline });
    await generateVariants({ root: second, pipeline });
  }, ENCODE_TIMEOUT);

  it("produces byte-identical files across two runs", () => {
    const files = committedVariantFiles(first);
    expect(files).toHaveLength(FIXTURES.length * 3);
    expect(committedVariantFiles(second)).toEqual(files);
    for (const path of files) {
      expect(
        Buffer.compare(
          readFileSync(join(first, path)),
          readFileSync(join(second, path)),
        ),
        path,
      ).toBe(0);
    }
  });

  it("produces no manifest diff across two runs", () => {
    expect(readFileSync(join(second, VARIANT_MANIFEST_PATH), "utf8")).toBe(
      readFileSync(join(first, VARIANT_MANIFEST_PATH), "utf8"),
    );
  });

  it(
    "re-running in the same tree rewrites the same bytes",
    async () => {
      const before = readFileSync(join(first, VARIANT_MANIFEST_PATH), "utf8");
      const files = committedVariantFiles(first).map(
        (path) => [path, readFileSync(join(first, path))] as const,
      );
      await generateVariants({ root: first, pipeline });
      expect(readFileSync(join(first, VARIANT_MANIFEST_PATH), "utf8")).toBe(
        before,
      );
      for (const [path, data] of files) {
        expect(
          Buffer.compare(readFileSync(join(first, path)), data),
          path,
        ).toBe(0);
      }
    },
    ENCODE_TIMEOUT,
  );

  it(
    "changes every affected checksum, and the header, when one option changes",
    async () => {
      const changed = trackedRoot(await makeRoot());
      const nudged = reducedPipeline({
        widths: [384],
        ogJpegWidth: 384,
        encoders: {
          ...pipeline.encoders,
          avif: { ...pipeline.encoders.avif, quality: 30 },
        },
      });
      await generateVariants({ root: changed, pipeline: nudged });

      const before = readVariantManifest(first);
      const after = readVariantManifest(changed);
      expect(after?.pipeline.encoders.avif.quality).toBe(30);
      expect(after?.pipeline).not.toEqual(before?.pipeline);

      const avifBefore = (before?.rows ?? []).filter(
        (row) => row.format === "avif",
      );
      const avifAfter = (after?.rows ?? []).filter(
        (row) => row.format === "avif",
      );
      expect(avifAfter).toHaveLength(FIXTURES.length);
      for (const [index, row] of avifAfter.entries()) {
        expect(row.checksumSha256, row.objectKey).not.toBe(
          avifBefore[index]?.checksumSha256,
        );
      }
      // …and only the AVIF files: the WebP and JPEG encoders were not touched, which is what makes
      // the diff readable instead of total.
      const webpBefore = (before?.rows ?? []).filter(
        (row) => row.format === "webp",
      );
      const webpAfter = (after?.rows ?? []).filter(
        (row) => row.format === "webp",
      );
      for (const [index, row] of webpAfter.entries()) {
        expect(row.checksumSha256, row.objectKey).toBe(
          webpBefore[index]?.checksumSha256,
        );
      }
    },
    ENCODE_TIMEOUT,
  );

  it("serialises the manifest as the Prettier gate expects", async () => {
    const rows = readVariantManifest(first)?.rows ?? [];
    expect(await serialiseVariantManifest(first, rows, pipeline)).toBe(
      readFileSync(join(first, VARIANT_MANIFEST_PATH), "utf8"),
    );
  });
});

/* -------------------------------------------------------------------------- */
/* T-14 — the `--check` CI mode (AC-14).                                      */
/* -------------------------------------------------------------------------- */

describe("T-14: --check fails on a deleted, an added and a one-byte-edited file (AC-14)", () => {
  const pipeline = reducedPipeline({ widths: [384], ogJpegWidth: 384 });
  let root: string;
  let victim: string;

  beforeAll(async () => {
    root = trackedRoot(await makeRoot());
    await generateVariants({ root, pipeline });
    victim = variantFilePath(FIXTURES[0].id, 384, "avif");
  }, ENCODE_TIMEOUT);

  it("passes on the tree it just derived", () => {
    const report = checkVariants({ root, pipeline });
    expect(report.problems).toEqual([]);
    expect(report.rows).toBe(FIXTURES.length * 3);
    expect(report.files).toBe(FIXTURES.length * 3);
    expect(report.manifestBytes).toBeGreaterThan(0);
  });

  it("fails on a deleted file, naming it", () => {
    const data = readFileSync(join(root, victim));
    rmSync(join(root, victim));
    try {
      const problems = checkVariants({ root, pipeline }).problems;
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain(victim);
      expect(problems[0]).toMatch(/missing/);
    } finally {
      writeFileSync(join(root, victim), data);
    }
  });

  it("fails on an added file, naming it", () => {
    const extra = `${MEDIA_OUTPUT_DIR}/${FIXTURES[0].id}/999.avif`;
    writeFileSync(join(root, extra), Buffer.from("not a variant"));
    try {
      const problems = checkVariants({ root, pipeline }).problems;
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain(extra);
      expect(problems[0]).toMatch(/no entry/);
    } finally {
      rmSync(join(root, extra));
    }
  });

  it("fails on a one-byte edit, naming the file and both checksums", () => {
    const data = readFileSync(join(root, victim));
    const edited = Buffer.from(data);
    // The last byte, so the header still parses as an image: the point is that the checksum, not
    // the decoder, is what catches it.
    edited[edited.length - 1] = (edited[edited.length - 1] ?? 0) ^ 0xff;
    writeFileSync(join(root, victim), edited);
    try {
      const problems = checkVariants({ root, pipeline }).problems;
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain(victim);
      expect(problems[0]).toMatch(/sha256/);
    } finally {
      writeFileSync(join(root, victim), data);
    }
  });

  it("fails on a manifest byte count that no longer matches the file", () => {
    const path = join(root, VARIANT_MANIFEST_PATH);
    const text = readFileSync(path, "utf8");
    const manifest = JSON.parse(text) as { rows: { bytes: number }[] };
    const row = manifest.rows[0] as { bytes: number };
    row.bytes += 1;
    writeFileSync(path, JSON.stringify(manifest, null, 2));
    try {
      const problems = checkVariants({ root, pipeline }).problems;
      expect(problems.some((problem) => /bytes on disk/.test(problem))).toBe(
        true,
      );
    } finally {
      writeFileSync(path, text);
    }
  });

  it("fails when the header no longer equals the pinned pipeline", () => {
    // The un-regenerated option change: somebody edited a quality setting (or the pinned constant)
    // without re-deriving the bytes. The bytes are still self-consistent, which is exactly why the
    // header has to be compared as well.
    const problems = checkVariants({ root }).problems;
    expect(problems.some((problem) => /pipeline\.widths/.test(problem))).toBe(
      true,
    );
    expect(
      problems.every((problem) => problem.includes(VARIANT_MANIFEST_PATH)),
    ).toBe(true);
  });

  it("fails on a row whose asset is not in media.json", () => {
    const path = join(root, VARIANT_MANIFEST_PATH);
    const text = readFileSync(path, "utf8");
    const manifest = JSON.parse(text) as {
      rows: { assetId: string }[];
    };
    (manifest.rows[0] as { assetId: string }).assetId = "ghost-asset";
    writeFileSync(path, JSON.stringify(manifest, null, 2));
    try {
      const problems = checkVariants({ root, pipeline }).problems;
      expect(problems.some((problem) => problem.includes("ghost-asset"))).toBe(
        true,
      );
    } finally {
      writeFileSync(path, text);
    }
  });

  it("reports a missing manifest rather than throwing", async () => {
    const empty = trackedRoot(await makeRoot({ withOriginals: false }));
    const report = checkVariants({ root: empty });
    expect(report.problems).toHaveLength(1);
    expect(report.problems[0]).toContain(VARIANT_MANIFEST_PATH);
  });

  it("passes on the committed tree, which carries no derived bytes yet", () => {
    // The Phase-0 state this PR ships: a manifest with the pinned header and an empty row list,
    // no `public/media/` at all, and `pnpm media:variants --check` green (TASK-080 commits the
    // demo bytes).
    const report = checkVariants({ root: repoRoot });
    expect(report.problems).toEqual([]);
    expect(report.rows).toBe(0);
    expect(committedVariantFiles(repoRoot)).toEqual([]);
    expect(
      existsSync(join(repoRoot, SEED_DATA_DIR, "media-variants.json")),
    ).toBe(true);
  });
});
