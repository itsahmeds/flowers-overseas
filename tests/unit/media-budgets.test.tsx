/**
 * The committed-imagery budgets, the data-flip proof and the two honesty invariants that survive
 * landing real photographs (spec 006 **AC-15**, **AC-20**, **AC-21**, **AC-22**; T-15, T-20, T-21,
 * T-22; TASK-080).
 *
 * The budget half runs here rather than in Lighthouse on purpose, and spec 006 §6 says why: *a
 * 900 KB hero must fail a gate rather than a Lighthouse run*. `pnpm seed:check` enforces the same
 * caps on the tree before the bytes are committed; this file asserts them against the **manifest**,
 * which is the artefact both loaders read, and prints the numbers the PR body quotes. The
 * per-page transfer half is the only part that needs a browser and lives in
 * `tests/e2e/media-budgets.spec.ts`.
 *
 * The data-flip half (AC-20) is the proof that landing a photograph is a data change. It is a unit
 * test and not an e2e one because what it must demonstrate is a *causal* fact — that the only
 * input to "does this slot render an image" is the dataset — and a browser can only show that the
 * page changed, not that nothing else could have. Three assertions carry it: the flip itself
 * through the manifest seam, the absence of any asset id under `src/app/`, and the reserved box
 * being identical in both states (which is the CLS delta of 0).
 */
import { existsSync, readFileSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import { DERIVED_MEDIA_DIR, SLOT_BYTE_CAPS } from "../../seed/budgets.ts";
import type { MediaSlot } from "../../seed/schema/media.ts";
import { MEDIA_ORIGIN } from "../../src/lib/media-origin.ts";
import { loadMessages } from "../../src/modules/i18n";
import { OccasionTiles } from "../../src/modules/ui/home/OccasionTiles.tsx";
import {
  committedMediaManifest,
  setMediaManifest,
} from "../../src/modules/ui/media/manifest.ts";
import { isDisplayable } from "../../src/modules/ui/media/resolve.ts";

const repoRoot = resolve(import.meta.dirname, "../..");

interface AssetRow {
  readonly id: string;
  readonly slot: MediaSlot;
  readonly depicts: string;
  readonly source: string;
  readonly productSku?: string;
}
interface VariantRow {
  readonly assetId: string;
  readonly width: number;
  readonly format: string;
  readonly bytes: number;
}

const assets = (
  JSON.parse(readFileSync(join(repoRoot, "seed/data/media.json"), "utf8")) as {
    rows: AssetRow[];
  }
).rows;
const variants = (
  JSON.parse(
    readFileSync(join(repoRoot, "seed/data/media-variants.json"), "utf8"),
  ) as { rows: VariantRow[] }
).rows;

const slotOf = new Map(assets.map((asset) => [asset.id, asset.slot]));

/* -------------------------------------------------------------------------- */
/* T-15 — the committed byte total and the per-slot maxima (AC-15).           */
/* -------------------------------------------------------------------------- */

describe("T-15: the imagery in the manifest is inside every byte cap (AC-15)", () => {
  it("keeps every single variant inside its slot's cap, in both formats", () => {
    for (const variant of variants) {
      const slot = slotOf.get(variant.assetId);
      expect(slot, variant.assetId).toBeDefined();
      const cap = SLOT_BYTE_CAPS[slot as MediaSlot];
      expect(
        variant.bytes,
        `${variant.assetId}/${String(variant.width)}.${variant.format} against the ${String(cap)} B \`${String(slot)}\` cap`,
      ).toBeLessThanOrEqual(cap);
    }
  });

  it("has a file for every manifest row and a row for every file, where the derived tree exists (AC-14's tree half)", async () => {
    // TASK-138: the derived bytes are git-ignored (`.local/media/`) because they live in the
    // media bucket, so this half runs on a machine that has just derived them and is skipped on
    // a clean clone. It is not the only thing standing between a bad row and a buyer:
    // `pnpm media:variants --check` makes the same comparison, `scripts/media-upload.ts` refuses
    // to upload while it reports a problem, and the caps above are read from the committed
    // manifest and therefore run everywhere.
    const root = join(repoRoot, DERIVED_MEDIA_DIR);
    if (!existsSync(root)) {
      expect(variants.length).toBeGreaterThan(0);
      return;
    }
    const onDisk = new Map<string, number>();
    for (const assetDir of await readdir(root)) {
      for (const leaf of await readdir(join(root, assetDir))) {
        const info = await stat(join(root, assetDir, leaf));
        onDisk.set(`${assetDir}/${leaf}`, info.size);
      }
    }
    expect(onDisk.size).toBe(variants.length);
    for (const variant of variants) {
      const key = `${variant.assetId}/${String(variant.width)}.${variant.format}`;
      expect(onDisk.get(key), key).toBe(variant.bytes);
    }
  });

  it("gives every asset with bytes a WebP fallback, never AVIF alone", () => {
    // `/review 49`'s carry-forward: `resolve.ts` falls through to the AVIF step when there is no
    // WebP one, so an AVIF-only asset would be served a format a fallback browser cannot decode.
    const formats = new Map<string, Set<string>>();
    for (const variant of variants) {
      const seen = formats.get(variant.assetId) ?? new Set<string>();
      seen.add(variant.format);
      formats.set(variant.assetId, seen);
    }
    for (const [assetId, seen] of formats) {
      expect(seen.has("webp"), assetId).toBe(true);
    }
  });

  it("derives no upscaled file: every width is inside its own original", () => {
    // `plan/01` §6 asks for ≥ 2000 px originals and the approved intake is 1024–1672 px, so the
    // Phase-0 ladder stops at each slot's narrowest original rather than inventing pixels. The
    // manifest is the evidence: a variant wider than the widest width its slot ships would mean
    // the ladder grew without the table that bounds it.
    const widestPerSlot = new Map<MediaSlot, number>();
    for (const variant of variants) {
      const slot = slotOf.get(variant.assetId) as MediaSlot;
      widestPerSlot.set(
        slot,
        Math.max(widestPerSlot.get(slot) ?? 0, variant.width),
      );
    }
    expect(widestPerSlot.get("hero")).toBeLessThanOrEqual(1200);
    expect(widestPerSlot.get("occasionTile")).toBeLessThanOrEqual(384);
    expect(widestPerSlot.get("productHero")).toBeLessThanOrEqual(828);
    expect(widestPerSlot.get("productDetail")).toBeLessThanOrEqual(384);
  });
});

/* -------------------------------------------------------------------------- */
/* T-20 — the data-flip proof (AC-20).                                        */
/* -------------------------------------------------------------------------- */

function renderTiles(locale: string): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={loadMessages(locale, ["home", "media", "occasions", "a11y"])}
      timeZone="UTC"
    >
      <OccasionTiles locale={locale} />
    </NextIntlClientProvider>,
  );
}

describe("T-20: landing one asset flips a homepage slot, and nothing else moves (AC-20)", () => {
  const FLIPPED = "home-occasion-sympathy";

  /** The committed manifest minus one asset's rows — "the day before" that asset was approved. */
  function without(assetId: string) {
    return {
      assets: committedMediaManifest.assets.filter(
        (asset) => asset.id !== assetId,
      ),
      variants: committedMediaManifest.variants.filter(
        (variant) => variant.assetId !== assetId,
      ),
      alt: Object.fromEntries(
        Object.entries(committedMediaManifest.alt).map(([locale, index]) => [
          locale,
          Object.fromEntries(
            Object.entries(index).filter(([id]) => id !== assetId),
          ),
        ]),
      ),
    };
  }

  it("turns a captioned placeholder into a rendered image", () => {
    const previous = setMediaManifest(without(FLIPPED));
    let before: string;
    try {
      before = renderTiles("en");
      expect(isDisplayable(FLIPPED, "en")).toBe(false);
      expect(before).toContain(`data-fo-media-asset="${FLIPPED}"`);
      expect(before).toContain('data-fo-media-placeholder="unknownAsset"');
    } finally {
      setMediaManifest(previous);
    }

    const after = renderTiles("en");
    expect(isDisplayable(FLIPPED, "en")).toBe(true);
    expect(after).toContain(`${MEDIA_ORIGIN}/media/${FLIPPED}/384.avif`);
    expect([...after.matchAll(/<img/g)].length).toBe(
      [...before.matchAll(/<img/g)].length + 1,
    );
  });

  it("reserves the identical box in both states — the CLS delta is 0 by construction", () => {
    const previous = setMediaManifest(without(FLIPPED));
    let before: string;
    try {
      before = renderTiles("en");
    } finally {
      setMediaManifest(previous);
    }
    const after = renderTiles("en");

    // The box is the slot's, not the asset's: `Photo` writes the same `aspect-*` utility and the
    // same width in both arms, so the swap cannot move a pixel of the surrounding layout. Anything
    // else here would be a layout shift measured after paint instead of reserved before it.
    const box = /class="photo ([^"]*)"/g;
    expect([...after.matchAll(box)].map((match) => match[1])).toEqual(
      [...before.matchAll(box)].map((match) => match[1]),
    );
  });

  it("needs no asset id under `src/app/`: the flip cannot require a template edit", async () => {
    // The structural half of AC-20 and the reason the `git diff --stat` in T-20 is empty by
    // construction rather than by luck: nothing under `src/app/` names an asset. The ids live in
    // the dataset and are derived inside `src/modules/ui/home/` from the occasion registry and the
    // SKU, so a 32nd asset row is a data change and a seventh occasion is a config change.
    const ids = new Set(assets.map((asset) => asset.id));
    const appRoot = join(repoRoot, "src/app");
    const offenders: string[] = [];
    async function walk(dir: string): Promise<void> {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(path);
          continue;
        }
        if (!/\.(?:ts|tsx)$/.test(entry.name)) continue;
        const source = await readFile(path, "utf8");
        for (const id of ids) {
          if (source.includes(`"${id}"`)) {
            offenders.push(`${relative(repoRoot, path)} names ${id}`);
          }
        }
      }
    }
    await walk(appRoot);
    // `/dev/components` is the one exception the spec asks for: §5.3's gallery renders the states
    // the committed dataset cannot produce, against a fixture manifest, and it must name the
    // assets it is demonstrating. No page under `src/app/[locale]/` may.
    expect(
      offenders.filter((line) => !line.includes("(dev)")),
      offenders.join("; "),
    ).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* T-21 — Phase 0 AC 6 survives the imagery (AC-21).                          */
/* -------------------------------------------------------------------------- */

describe("T-21: the dataset still claims nothing it cannot back (AC-21)", () => {
  it("has no review, delivery proof or public partner profile in it", () => {
    for (const name of ["review", "delivery_proof", "partner_profile"]) {
      expect(
        (
          JSON.parse(
            readFileSync(join(repoRoot, "seed/data/media.json"), "utf8"),
          ) as Record<string, unknown>
        )[name],
        name,
      ).toBeUndefined();
    }
    // The imagery half of the same rule: no asset may depict a delivery, and none does — an
    // AI-generated "delivery photo" is a misleading commercial practice, and a real one carries
    // consent and belongs to spec 018/027 (`plan/07` §1.2, ADR-0014).
    for (const asset of assets) {
      expect(asset.depicts, asset.id).not.toBe("delivery");
    }
  });

  it("leaves the home's delivery band a placeholder, because we have no delivery photograph", () => {
    // §2.4, explicitly: the band renders the placeholder in Phase 0 *in every case*. The proof is
    // that the dataset contains no asset for it — `HowItWorks` still renders the reserved box.
    const source = readFileSync(
      join(repoRoot, "src/modules/ui/home/HowItWorks.tsx"),
      "utf8",
    );
    expect(source).toContain('slot="band"');
    expect(source).not.toContain("MediaAsset");
    expect(assets.some((asset) => asset.slot === ("band" as MediaSlot))).toBe(
      false,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* T-22 — no client JavaScript is added (AC-22).                              */
/* -------------------------------------------------------------------------- */

describe("T-22: rendering a photograph costs zero client bytes (AC-22)", () => {
  it("keeps `sharp` and the variant CLI out of every module a page imports", async () => {
    const mediaDir = join(repoRoot, "src/modules/ui/media");
    for (const name of await readdir(mediaDir)) {
      const source = await readFile(join(mediaDir, name), "utf8");
      expect(source, name).not.toMatch(/from\s+"sharp"/);
      expect(source, name).not.toContain("seed/media-variants");
      expect(source, name).not.toContain("seed/watermark");
    }
  });

  it("makes no media component an island", async () => {
    // `MediaAsset` renders a `<picture>` rather than `next/image` precisely so that a page
    // carrying a photograph ships no JavaScript for it (§2.5, spec 004 §14 A1). A `"use client"`
    // anywhere in this module would undo that silently.
    // Every file of the media module, and the three home sections this task wired to it. The home
    // directory as a whole is not asserted: `FinderTypeahead` is a deliberate island (spec 004),
    // and the point here is that landing photographs added none.
    const files = [
      ...(await readdir(join(repoRoot, "src/modules/ui/media"))).map((name) =>
        join("src/modules/ui/media", name),
      ),
      "src/modules/ui/home/HomeHero.tsx",
      "src/modules/ui/home/OccasionTiles.tsx",
      "src/modules/ui/home/TrendingRow.tsx",
      "src/modules/ui/home/HomeProvenanceNote.tsx",
    ];
    for (const path of files) {
      const source = await readFile(join(repoRoot, path), "utf8");
      const firstLine = source.split("\n").find((line) => line.trim() !== "");
      expect(firstLine, path).not.toContain("use client");
    }
  });
});
