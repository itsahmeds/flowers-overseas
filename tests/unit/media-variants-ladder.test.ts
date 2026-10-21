/**
 * T-20, unit half (spec 042 **AC-20**, variants and `seed:check` half; spec 006 §14
 * A-founder-2026-10-20b; TASK-306): the detail photographs ship the product hero's ladder.
 *
 * The detail asset is idea 5's second gallery slide and idea 3's second photo on hover, both shown
 * as wide as the hero on the same page, so a detail asset at 384 px only looks soft there. Two
 * halves, matching the AC's two clauses:
 *
 *  1. **The data.** For every approved `productDetail` asset in `seed/data/media.json`, its widths
 *     in `seed/data/media-variants.json` equal the product hero ladder's, in AVIF and in WebP, and
 *     equal the widths of the same product's own hero asset. Red with one detail asset left at
 *     384 px only.
 *  2. **The gate.** `pnpm seed:check` (`checkSeedDataset`) fails, with the asset and the rung
 *     named, over a tree missing one detail asset's 828 px rows; it stays clean on the real tree,
 *     on a rejected detail asset (never shown) and on an approved one with no rows (it resolves to
 *     the placeholder, so nothing can show it).
 *
 * The gallery half (the second slide's `currentSrc` at 390 x 844) is TASK-309's e2e.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import {
  type SeedTree,
  checkSeedDataset,
  readSeedTree,
  seedCheckExitCode,
} from "../../seed/check.ts";
import { variantPipeline, widthsForSlot } from "../../seed/schema/variants.ts";

const repoRoot = resolve(import.meta.dirname, "../..");
const TREE_TIMEOUT = 60_000;
const AS_OF = new Date("2026-10-21T10:00:00Z");
const VARIANTS = "media-variants.json";
const MEDIA = "media.json";

/** The product hero's ladder today (spec 006 §14 A11 clause 1): "up to 828 px today" in AC-20. */
const HERO_LADDER_TODAY = [384, 480, 640, 828];

interface AssetRow {
  readonly id: string;
  readonly slot: string;
  readonly reviewState: string;
  readonly productSku?: string;
}
interface VariantRow {
  readonly assetId: string;
  readonly width: number;
  readonly format: string;
  readonly objectKey: string;
}

const assets = (
  JSON.parse(readFileSync(join(repoRoot, "seed/data", MEDIA), "utf8")) as {
    rows: AssetRow[];
  }
).rows;
const variants = (
  JSON.parse(readFileSync(join(repoRoot, "seed/data", VARIANTS), "utf8")) as {
    rows: VariantRow[];
  }
).rows;

/** The ascending widths one asset ships in one format, read from the manifest rows. */
function widthsOf(assetId: string, format: string): readonly number[] {
  return variants
    .filter((row) => row.assetId === assetId && row.format === format)
    .map((row) => row.width)
    .sort((a, b) => a - b);
}

const approvedDetails = assets.filter(
  (asset) => asset.slot === "productDetail" && asset.reviewState === "approved",
);

describe("T-20 (unit): every approved detail photograph has the product hero's ladder (AC-20)", () => {
  it("the product hero ladder is 384 / 480 / 640 / 828, and the detail slot ships the same one", () => {
    expect(widthsForSlot("productHero")).toEqual(HERO_LADDER_TODAY);
    expect(widthsForSlot("productDetail")).toEqual(HERO_LADDER_TODAY);
    // The manifest header is what `pnpm media:variants --check` compares the rows against.
    expect(variantPipeline().aspects["productDetail"]).toEqual([
      { ratio: "4:5", widths: HERO_LADDER_TODAY },
    ]);
  });

  it("gives each approved productDetail asset the hero ladder in AVIF and WebP, as wide as its own product's hero", () => {
    // Not vacuous: the dataset holds the 82 approved detail photographs of spec 042 §1.
    expect(approvedDetails.length).toBeGreaterThan(0);
    const heroOf = new Map(
      assets
        .filter(
          (asset) =>
            asset.slot === "productHero" && asset.reviewState === "approved",
        )
        .map((asset) => [asset.productSku, asset.id]),
    );
    const mismatches: string[] = [];
    for (const detail of approvedDetails) {
      const hero = heroOf.get(detail.productSku);
      for (const format of ["avif", "webp"]) {
        const widths = widthsOf(detail.id, format).join("/");
        if (widths !== HERO_LADDER_TODAY.join("/")) {
          mismatches.push(`${detail.id} ${format}: ${widths}`);
        }
        if (hero !== undefined && widths !== widthsOf(hero, format).join("/")) {
          mismatches.push(`${detail.id} ${format}: not ${hero}'s widths`);
        }
      }
    }
    expect(mismatches).toEqual([]);
  });
});

describe("T-20 (unit): `pnpm seed:check` refuses a detail photograph missing a rung of the hero ladder (AC-20)", () => {
  let tree: SeedTree;
  beforeAll(async () => {
    tree = await readSeedTree(repoRoot, new Map(), AS_OF);
  }, TREE_TIMEOUT);

  const detailLadderKeys = (mutated: SeedTree): readonly string[] =>
    checkSeedDataset(mutated)
      .filter((problem) => problem.rule === "detail-ladder")
      .map((problem) => problem.key);

  /** The real tree with its variant rows passed through `edit`. */
  function withVariants(
    edit: (rows: VariantRow[]) => VariantRow[],
    media?: (rows: AssetRow[]) => AssetRow[],
  ): SeedTree {
    const file = structuredClone(tree.raw.get(VARIANTS)) as {
      rows: VariantRow[];
    };
    file.rows = edit(file.rows);
    const raw = new Map([...tree.raw, [VARIANTS, file]]);
    if (media !== undefined) {
      const mediaFile = structuredClone(tree.raw.get(MEDIA)) as {
        rows: AssetRow[];
      };
      mediaFile.rows = media(mediaFile.rows);
      raw.set(MEDIA, mediaFile);
    }
    return { ...tree, raw };
  }

  const firstDetail = approvedDetails[0]?.id ?? "";

  it(
    "is clean on the committed tree",
    () => {
      expect(firstDetail).not.toBe("");
      expect(detailLadderKeys(tree)).toEqual([]);
    },
    TREE_TIMEOUT,
  );

  it(
    "fails with the asset and the rung named when one detail asset lacks its 828 px width",
    () => {
      const mutated = withVariants((rows) =>
        rows.filter(
          (row) => !(row.assetId === firstDetail && row.width === 828),
        ),
      );
      expect(detailLadderKeys(mutated)).toEqual([
        `${firstDetail}/828.avif`,
        `${firstDetail}/828.webp`,
      ]);
      expect(seedCheckExitCode(checkSeedDataset(mutated))).not.toBe(0);
    },
    TREE_TIMEOUT,
  );

  it(
    "fails when one detail asset is left at 384 px only, naming every missing rung",
    () => {
      const mutated = withVariants((rows) =>
        rows.filter((row) => !(row.assetId === firstDetail && row.width > 384)),
      );
      // The rule reports per format, then per rung: AVIF's three, then WebP's three.
      expect(detailLadderKeys(mutated)).toEqual(
        ["avif", "webp"].flatMap((format) =>
          HERO_LADDER_TODAY.slice(1).map(
            (width) => `${firstDetail}/${String(width)}.${format}`,
          ),
        ),
      );
    },
    TREE_TIMEOUT,
  );

  it(
    "fails on a rung the hero ladder does not have",
    () => {
      const mutated = withVariants((rows) => [
        ...rows,
        {
          ...(rows.find(
            (row) =>
              row.assetId === firstDetail &&
              row.width === 828 &&
              row.format === "webp",
          ) as VariantRow),
          width: 1080,
          objectKey: `media/${firstDetail}/1080.webp`,
        },
      ]);
      expect(detailLadderKeys(mutated)).toEqual([`${firstDetail}/1080.webp`]);
    },
    TREE_TIMEOUT,
  );

  it(
    "ignores a detail asset nothing can show: rejected, or approved with no rows",
    () => {
      const rejected = assets.find(
        (asset) =>
          asset.slot === "productDetail" && asset.reviewState === "rejected",
      )?.id;
      expect(rejected).toBeDefined();
      const shortRejected = withVariants((rows) =>
        rows.filter((row) => !(row.assetId === rejected && row.width > 384)),
      );
      expect(detailLadderKeys(shortRejected)).toEqual([]);

      const noRows = withVariants((rows) =>
        rows.filter((row) => row.assetId !== firstDetail),
      );
      expect(detailLadderKeys(noRows)).toEqual([]);

      // And the same short ladder **is** red the moment the asset is approved, so the clean
      // result above is the review state's doing and not a rule that never runs.
      const approvedShort = withVariants(
        (rows) =>
          rows.filter((row) => !(row.assetId === rejected && row.width > 384)),
        (rows) =>
          rows.map((row) =>
            row.id === rejected ? { ...row, reviewState: "approved" } : row,
          ),
      );
      expect(detailLadderKeys(approvedShort)).toHaveLength(6);
    },
    TREE_TIMEOUT,
  );
});
