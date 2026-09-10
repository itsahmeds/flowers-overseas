/**
 * The media manifest as the renderer sees it (spec 006 §2.1 "Media bytes"/"Alt text", §2.5, §5.2
 * `variantsFor(assetId, slot)`, §5.4; TASK-079).
 *
 * Four properties this file exists to guarantee, all of them load-bearing:
 *
 *  - **It is a plain build-time import.** `seed/data/media.json`, `media-variants.json` and the
 *    four `alt/{locale}.json` files are `import`ed, so resolving an image costs a cached page
 *    **zero queries and zero fetches** (§5.4, which is ADR-0015's Neon compute-hour constraint
 *    restated), and no database client, no `sharp` and no `fs` call can enter the render path
 *    (`pnpm check:no-db`, AC-1).
 *  - **No zod at render time.** The JSON is typed here through the narrow interfaces below and
 *    validated *against the seed schemas in a unit test* (`tests/unit/ui-media-manifest.test.ts`)
 *    rather than at import time. A parse in this module would put zod into the server render path
 *    of every page carrying an image and, through the `@/modules/ui` barrel, risk it reaching a
 *    client island — the byte spec 003 spent a whole task removing from the browser. The gate that
 *    keeps the files honest is `pnpm seed:check` and that test, not a runtime cost paid on every
 *    request.
 *  - **Every lookup is pure and synchronous** (§5.2), so `generateMetadata`, the preload builder,
 *    the `srcset` builder and spec 009's schema builder cannot get different answers about the
 *    same asset — the property spec 003 required of `isLocaleIndexable()`.
 *  - **The manifest itself is a seam.** `getMediaManifest()` is read at call time, never captured
 *    at import time, and `setMediaManifest()` swaps it. That is what lets a test prove the
 *    `<img>` path and the loader swap (AC-2, AC-18) while the committed manifest still has
 *    `rows: []`, and it is the same seam shape `src/modules/i18n/registry.ts` uses for locales and
 *    `./loader.ts` uses for URLs.
 *
 * **Phase-0 state, stated plainly:** `seed/data/media-variants.json` has no rows and every
 * `seed/data/alt/{locale}.json` has no rows, because the founder has supplied no imagery yet
 * (spec 006 §12's founder actions, TASK-080). So every asset resolves to the placeholder today —
 * which is `plan/10` §3's honesty rule, not a stub — and landing imagery is a data edit with no
 * change under `src/app/` (AC-20, TASK-080 proves it).
 */
import altDe from "../../../../seed/data/alt/de.json" with { type: "json" };
import altEnGb from "../../../../seed/data/alt/en-gb.json" with { type: "json" };
import altEn from "../../../../seed/data/alt/en.json" with { type: "json" };
import altPl from "../../../../seed/data/alt/pl.json" with { type: "json" };
import assetsFile from "../../../../seed/data/media.json" with { type: "json" };
import variantsFile from "../../../../seed/data/media-variants.json" with { type: "json" };

import {
  type MediaSlot,
  type SeedMediaSlot,
  mediaSlot,
  uiSlotForSeedSlot,
} from "./slots.ts";

/** The image formats a page ladder uses, AVIF first (spec 006 §13 Q5). `jpeg` is OG/email only. */
export const PAGE_FORMATS = ["avif", "webp"] as const;
export type PageFormat = (typeof PAGE_FORMATS)[number];

/** Every format in the manifest, including the single OG/email JPEG. */
export type VariantFormat = PageFormat | "jpeg";

/**
 * One asset, as `seed/data/media.json` carries it and as the renderer needs it: enough to decide
 * whether it may be shown, which box it belongs in, and whether the page owes a provenance note.
 * The provenance *evidence* (generator, model, prompt hash, seed, credit, licence, reviewer) stays
 * in the seed manifest and in spec 002's `media_asset`; nothing on a page renders it, so nothing
 * here reads it.
 */
export interface MediaAssetEntry {
  readonly id: string;
  readonly depicts: string;
  readonly slot: SeedMediaSlot;
  /** `ai` is the one value that obliges the page to render the honesty label (AC-17). */
  readonly source: string;
  readonly reviewState: string;
  readonly productSku?: string;
  readonly sortOrder: number;
  readonly isPrimary: boolean;
}

/** One derived file: a width, a format and the object key the loader turns into a URL. */
export interface MediaVariantEntry {
  readonly assetId: string;
  readonly variant: string;
  readonly width: number;
  readonly height: number;
  readonly format: VariantFormat;
  readonly bytes: number;
  readonly objectKey: string;
}

/** Alt text by asset id, for one locale. Data, never generated at render (`plan/01` §6). */
export type AltIndex = Readonly<Record<string, string>>;

export interface MediaManifest {
  readonly assets: readonly MediaAssetEntry[];
  readonly variants: readonly MediaVariantEntry[];
  /** Keyed by locale code exactly as `seed/data/alt/{locale}.json` names it. */
  readonly alt: Readonly<Record<string, AltIndex>>;
}

interface AltFile {
  readonly locale: string;
  readonly rows: readonly { readonly assetId: string; readonly alt: string }[];
}

/**
 * The four alt files. The cast is the same "typed build-time import" as the two above, and it is
 * needed for a second reason here: with `rows: []` TypeScript infers `never[]`, so a locale that
 * has no alt text yet would make its own row type unusable rather than empty.
 */
const ALT_FILES = [altEn, altEnGb, altDe, altPl] as readonly AltFile[];

/**
 * The committed manifest. The casts are the "typed build-time import" of §5.2: TypeScript infers
 * `string` for every JSON enum member, and re-narrowing it here without a runtime parse is what
 * keeps zod out of the render path. `tests/unit/ui-media-manifest.test.ts` parses these same six
 * files through `seed/schema/files.ts`, so the shape is asserted where an assertion is free.
 */
export const committedMediaManifest: MediaManifest = {
  assets: assetsFile.rows as readonly MediaAssetEntry[],
  variants: variantsFile.rows as readonly MediaVariantEntry[],
  alt: Object.fromEntries(
    ALT_FILES.map((file) => [
      file.locale,
      Object.fromEntries(file.rows.map((row) => [row.assetId, row.alt])),
    ]),
  ),
};

let manifest: MediaManifest = committedMediaManifest;

/** The manifest in force. Read at call time, never captured at import time. */
export function getMediaManifest(): MediaManifest {
  return manifest;
}

/**
 * Install a manifest (a fixture in a test; spec 006 §2.6's R2 manifest later). Returns the
 * previous one so a caller can restore it without knowing what it replaced.
 */
export function setMediaManifest(next: MediaManifest): MediaManifest {
  const previous = manifest;
  manifest = next;
  return previous;
}

/**
 * Per-manifest lookup indexes, built once per manifest object. A `WeakMap` rather than a module
 * constant because the manifest is swappable: keying the index on the object means a fixture
 * cannot inherit the committed manifest's index, and a discarded fixture cannot leak.
 */
interface ManifestIndex {
  readonly assets: ReadonlyMap<string, MediaAssetEntry>;
  readonly variants: ReadonlyMap<string, readonly MediaVariantEntry[]>;
}

const indexes = new WeakMap<MediaManifest, ManifestIndex>();

function indexFor(source: MediaManifest): ManifestIndex {
  const existing = indexes.get(source);
  if (existing !== undefined) return existing;

  const assets = new Map<string, MediaAssetEntry>();
  for (const asset of source.assets) assets.set(asset.id, asset);

  const variants = new Map<string, MediaVariantEntry[]>();
  for (const variant of source.variants) {
    const list = variants.get(variant.assetId);
    if (list === undefined) variants.set(variant.assetId, [variant]);
    else list.push(variant);
  }
  for (const list of variants.values()) list.sort((a, b) => a.width - b.width);

  const built: ManifestIndex = { assets, variants };
  indexes.set(source, built);
  return built;
}

/**
 * The asset with this id, or `undefined`.
 *
 * Every lookup below takes an optional `source` manifest, defaulting to the one in force. It is
 * how `/dev/components` renders the image state that the committed dataset cannot yet produce
 * (no bytes, no alt text) **without** mutating module state inside a request: a Server Component
 * that called `setMediaManifest()` would change what a concurrently rendering page resolves.
 * Passing a manifest cannot bypass anything — the honesty gate of `./resolve.ts` runs against
 * whichever manifest it is given.
 */
export function assetById(
  assetId: string,
  source: MediaManifest = getMediaManifest(),
): MediaAssetEntry | undefined {
  return indexFor(source).assets.get(assetId);
}

/** Every asset belonging to a product, primary first, then `sortOrder` (editorial intent, §7). */
export function assetsForProduct(
  sku: string,
  source: MediaManifest = getMediaManifest(),
): readonly MediaAssetEntry[] {
  return source.assets
    .filter((asset) => asset.productSku === sku)
    .sort(
      (a, b) =>
        Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder,
    );
}

/** Alt text for this asset in exactly this locale. No fallback: a locale's alt is its own (§7). */
export function altFor(
  assetId: string,
  locale: string,
  source: MediaManifest = getMediaManifest(),
): string | undefined {
  return source.alt[locale]?.[assetId];
}

/**
 * The page ladder for an asset in a box: one ascending width list per page format, the box's
 * `sizes` string, its reserved ratio, and the intrinsic dimensions of the largest AVIF step.
 *
 * `slot` is the **UI** slot (the box), not the seed crop slot, because `sizes` is a property of
 * the layout that produced the box (`./slots.ts`). `variantsFor` is the single lookup §2.5
 * requires the `srcset` and the `<link rel="preload">` to share, which is what makes it
 * impossible for the two to disagree.
 */
export interface MediaVariantSet {
  readonly assetId: string;
  readonly slot: MediaSlot;
  readonly sizes: string;
  readonly ratio: "hero" | "landscape" | "portrait" | "square";
  /** Intrinsic size of the largest page variant, for `width`/`height` on the `<img>`. */
  readonly width: number;
  readonly height: number;
  readonly steps: Readonly<Record<PageFormat, readonly MediaVariantEntry[]>>;
}

export function variantsFor(
  assetId: string,
  slot: MediaSlot,
  source: MediaManifest = getMediaManifest(),
): MediaVariantSet | undefined {
  const all = indexFor(source).variants.get(assetId) ?? [];
  const steps = {
    avif: all.filter((variant) => variant.format === "avif"),
    webp: all.filter((variant) => variant.format === "webp"),
  } as const;
  // AVIF is the format the `<img>` itself falls back from, and the one whose intrinsic size the
  // box uses; without it there is no page ladder at all and the asset is not displayable.
  const largest = steps.avif.at(-1);
  if (largest === undefined) return undefined;

  const box = mediaSlot(slot);
  return {
    assetId,
    slot,
    sizes: box.sizes,
    ratio: box.ratio,
    width: largest.width,
    height: largest.height,
    steps,
  };
}

/**
 * The box an asset belongs in, from its own crop slot — the seed↔UI translation of `./slots.ts`
 * applied to a manifest row, so a call site never has to know both vocabularies.
 */
export function boxForAsset(asset: MediaAssetEntry): MediaSlot | undefined {
  return uiSlotForSeedSlot(asset.slot);
}
