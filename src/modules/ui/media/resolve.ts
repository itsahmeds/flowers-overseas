/**
 * The honesty gate (spec 006 §2.5, §5.3, **AC-18**; `plan/07` §8; TASK-079).
 *
 * One function decides whether a photograph may be rendered at all, and every surface — `Media`,
 * `preload.ts`, `MediaProvenanceNote` — asks it rather than deciding for itself. That is what
 * makes the rule checkable in one place instead of four:
 *
 * > `Photo` renders an `<img>` **only** when the asset is approved, has variants **and** has alt
 * > text for the resolved locale; with any of those missing it renders spec 004's placeholder box
 * > with its caption and **no `<img>`**.
 *
 * The consequence is deliberate and is the reason the rule is written this way: a product whose
 * Polish alt text is missing renders a **captioned placeholder on the Polish page** rather than an
 * English alt on a Polish page (WCAG 1.1.1 + 3.1.2, `plan/07` §8). A missing translation degrades
 * to something honest; it never degrades to something wrong. There is no locale fallback here for
 * exactly that reason, even though the message catalogue has one.
 *
 * `alt` is **data**: it is returned by identity from `altFor()` and nothing in this module
 * concatenates, templates or derives it (`plan/01` §6). Two refusals enforce the rest of AC-18:
 * an empty or whitespace-only alt is not "decorative" on a product image, it is an informative
 * image announced as nothing at all, so it degrades to the placeholder; and an alt equal to the
 * product name — which the screen reader has already announced from the heading — is refused when
 * the caller knows the name, which is the case on spec 009's PDP.
 */
import {
  type MediaAssetEntry,
  type MediaManifest,
  type MediaVariantSet,
  type PageFormat,
  altFor,
  assetById,
  boxForAsset,
  variantsFor,
} from "./manifest.ts";
import { resolveLoader } from "./loader.ts";
import type { MediaSlot } from "./slots.ts";

/** Why an asset is not being rendered. Reported so a test — and `/dev/components` — can say. */
export const PLACEHOLDER_REASONS = [
  "unknownAsset",
  "notARenderBox",
  "unapproved",
  "noVariants",
  "noAlt",
  "altRepeatsProductName",
] as const;
export type PlaceholderReason = (typeof PLACEHOLDER_REASONS)[number];

/** One `<source>`'s worth of the ladder: a mime type and the `srcset` string for it. */
export interface MediaSourceSet {
  readonly format: PageFormat;
  readonly type: `image/${PageFormat}`;
  readonly srcSet: string;
}

export interface ResolvedImage {
  readonly kind: "image";
  readonly asset: MediaAssetEntry;
  readonly slot: MediaSlot;
  /** AVIF first, WebP second — the order the browser evaluates `<source>` in (§2.5). */
  readonly sources: readonly MediaSourceSet[];
  /** The `<img>`'s own `src`: the largest WebP step, the universally supported fallback. */
  readonly fallbackSrc: string;
  readonly sizes: string;
  readonly ratio: MediaVariantSet["ratio"];
  readonly width: number;
  readonly height: number;
  /** Straight from `seed/data/alt/{locale}.json`; never built here. */
  readonly alt: string;
}

export interface ResolvedPlaceholder {
  readonly kind: "placeholder";
  readonly reason: PlaceholderReason;
}

export type ResolvedMedia = ResolvedImage | ResolvedPlaceholder;

export interface ResolveMediaOptions {
  readonly assetId: string;
  /** The resolved request locale. No fallback chain: see the header. */
  readonly locale: string;
  /**
   * The box to render in. Omitted means "the box this asset's crop belongs to", which is the
   * seed↔UI mapping of `./slots.ts` — the only place the two slot vocabularies meet.
   */
  readonly slot?: MediaSlot;
  /** The product's name, where the caller knows it (spec 009's PDP). Used only to refuse an alt. */
  readonly productName?: string;
  /**
   * Resolve against this manifest instead of the one in force. `/dev/components` and the tests
   * are the callers (`./manifest.ts` explains why a request-time `setMediaManifest()` would be
   * wrong); a page never passes one, and passing one bypasses nothing — every rule below still
   * applies to whatever manifest arrives.
   */
  readonly manifest?: MediaManifest;
}

/** `"url 384w, url 640w, …"` for one format, ascending — the manifest's own width order. */
export function srcSetFor(set: MediaVariantSet, format: PageFormat): string {
  const load = resolveLoader();
  return set.steps[format]
    .map((variant) => `${load(variant)} ${String(variant.width)}w`)
    .join(", ");
}

function normalise(value: string): string {
  return value.trim().toLocaleLowerCase("en");
}

export function resolveMedia({
  assetId,
  locale,
  slot,
  productName,
  manifest,
}: ResolveMediaOptions): ResolvedMedia {
  const asset =
    manifest === undefined ? assetById(assetId) : assetById(assetId, manifest);
  if (asset === undefined)
    return { kind: "placeholder", reason: "unknownAsset" };

  const box = slot ?? boxForAsset(asset);
  // `og` is not a page box at all (`./slots.ts`): a social crop rendered into a layout is a
  // design bug, so the honest answer is the placeholder rather than a stretched image.
  if (box === undefined)
    return { kind: "placeholder", reason: "notARenderBox" };

  // Unreviewed and rejected imagery never reaches a page: the founder's sign-off against the
  // §2.4 checklist is what makes an asset renderable (spec 006 §13 Q9, ADR-0014's named risk).
  if (asset.reviewState !== "approved") {
    return { kind: "placeholder", reason: "unapproved" };
  }

  const set =
    manifest === undefined
      ? variantsFor(assetId, box)
      : variantsFor(assetId, box, manifest);
  if (set === undefined) return { kind: "placeholder", reason: "noVariants" };

  const alt =
    manifest === undefined
      ? altFor(assetId, locale)
      : altFor(assetId, locale, manifest);
  if (alt === undefined || alt.trim() === "") {
    return { kind: "placeholder", reason: "noAlt" };
  }
  if (productName !== undefined && normalise(alt) === normalise(productName)) {
    return { kind: "placeholder", reason: "altRepeatsProductName" };
  }

  const sources: MediaSourceSet[] = [];
  for (const format of ["avif", "webp"] as const) {
    const srcSet = srcSetFor(set, format);
    if (srcSet !== "")
      sources.push({ format, type: `image/${format}`, srcSet });
  }

  const webpFallback = set.steps.webp.at(-1) ?? set.steps.avif.at(-1);
  if (webpFallback === undefined) {
    return { kind: "placeholder", reason: "noVariants" };
  }

  return {
    kind: "image",
    asset,
    slot: box,
    sources,
    fallbackSrc: resolveLoader()(webpFallback),
    sizes: set.sizes,
    ratio: set.ratio,
    width: set.width,
    height: set.height,
    alt,
  };
}

/**
 * Would this asset actually be displayed in this locale? The question `MediaProvenanceNote` asks
 * (AC-17: the note follows the assets a page *displays*, not the assets it mentions) and the one
 * spec 009's `Product.image[]` builder must ask so the structured data and the visible gallery
 * agree (`plan/02` §15).
 */
export function isDisplayable(
  assetId: string,
  locale: string,
  manifest?: MediaManifest,
): boolean {
  return (
    resolveMedia({
      assetId,
      locale,
      ...(manifest === undefined ? {} : { manifest }),
    }).kind === "image"
  );
}
