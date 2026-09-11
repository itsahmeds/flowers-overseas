/**
 * The media manifest a Phase-0 repository does not have yet (spec 006 §2.5, AC-2/AC-17/AC-18/
 * AC-19; TASK-079).
 *
 * `seed/data/media-variants.json` has `rows: []` and every `seed/data/alt/{locale}.json` has
 * `rows: []`, because the founder has supplied no imagery (spec 006 §12's founder actions,
 * TASK-080). So the committed manifest renders **every** asset as a placeholder — which is
 * `plan/10` §3's honesty rule working correctly, and which would leave the `<img>` path, the
 * loader swap and the honesty label untested until imagery lands.
 *
 * This fixture is that manifest with bytes: the same asset ids, the same slots and the same
 * provenance as `seed/data/media.json`, plus the variant ladder `pnpm media:variants` will write
 * and the alt text the founder will supply. It is installed with the module's own
 * `setMediaManifest()` seam, so the tests exercise the shipped code path rather than a parallel
 * one — and it is also the shape of TASK-080's data-flip proof (AC-20): asset row + variants +
 * alt turns a placeholder into an image with no change under `src/app/`.
 */
import type {
  MediaAssetEntry,
  MediaManifest,
  MediaVariantEntry,
} from "../../../src/modules/ui/media/manifest.ts";

/** A product asset (`ai`), the one that obliges a page to render the honesty label. */
export const PRODUCT_ASSET = "fo-bq-001-hero";
/** A homepage band asset (`photo`, free-licence stock per spec 006 §13 Q1) — no label owed. */
export const BAND_ASSET = "fo-home-hero-band";
/** A second product asset, so a "two `priority` images" page can be built (AC-19). */
export const SECOND_PRODUCT_ASSET = "fo-bq-002-hero";

/** Three of the seven committed widths (spec 006 §13 Q5); enough to assert a ladder's shape. */
export const FIXTURE_WIDTHS = [384, 640, 1080] as const;

export const FIXTURE_ALT: Readonly<Record<string, string>> = {
  en: "Amber and cream roses hand-tied with kraft paper on a warm grey background",
  "en-gb":
    "Amber and cream roses hand-tied in kraft paper on a warm grey background",
  de: "Rosen in Amber und Creme, handgebunden in Kraftpapier auf warmem Grau",
  pl: "Róże w kolorach ambry i kremu, wiązane ręcznie w papier kraft na ciepłym szarym tle",
};

function asset(
  id: string,
  overrides: Partial<MediaAssetEntry> = {},
): MediaAssetEntry {
  return {
    id,
    depicts: "product",
    slot: "productHero",
    source: "ai",
    reviewState: "approved",
    productSku: "FO-BQ-001",
    sortOrder: 0,
    isPrimary: true,
    ...overrides,
  };
}

function ladder(assetId: string, aspect: number): MediaVariantEntry[] {
  return FIXTURE_WIDTHS.flatMap((width) =>
    (["avif", "webp"] as const).map((format) => ({
      assetId,
      variant: String(width),
      width,
      height: Math.round(width / aspect),
      format,
      bytes: width * 20,
      objectKey: `derived/${assetId}/${String(width)}.${format}`,
    })),
  );
}

export interface MediaFixtureOptions {
  /** Drop the founder's sign-off, so the asset is `pending` (AC-18's second column). */
  readonly unapproved?: boolean;
  /** Ship no derived files for the product asset (AC-18's third column). */
  readonly withoutVariants?: boolean;
  /** Locales that have alt text. Default: all four. `[]` is "no alt anywhere". */
  readonly altLocales?: readonly string[];
  /** Replace the alt text of every locale that has one — an empty string, say. */
  readonly alt?: string;
}

/**
 * The manifest: two product assets (`ai`, 4:5) and one homepage band (`photo`, 16:9), each with a
 * three-step AVIF+WebP ladder and four locales of alt text, minus whatever the options remove.
 */
export function mediaFixture(options: MediaFixtureOptions = {}): MediaManifest {
  const altLocales = options.altLocales ?? ["en", "en-gb", "de", "pl"];
  const assets: MediaAssetEntry[] = [
    asset(PRODUCT_ASSET, {
      ...(options.unapproved === true ? { reviewState: "pending" } : {}),
    }),
    asset(SECOND_PRODUCT_ASSET, {
      productSku: "FO-BQ-002",
      sortOrder: 1,
    }),
    // The homepage band belongs to no product, so its row carries no `productSku` at all and no
    // `product_media` row is projected for it (`seed/schema/media.ts`).
    {
      id: BAND_ASSET,
      depicts: "brand",
      slot: "hero",
      source: "photo",
      reviewState: "approved",
      sortOrder: 0,
      isPrimary: false,
    },
  ];

  const variants: MediaVariantEntry[] = [
    ...(options.withoutVariants === true ? [] : ladder(PRODUCT_ASSET, 0.8)),
    ...ladder(SECOND_PRODUCT_ASSET, 0.8),
    ...ladder(BAND_ASSET, 16 / 9),
  ];

  const alt = Object.fromEntries(
    altLocales.map((locale) => [
      locale,
      Object.fromEntries(
        [PRODUCT_ASSET, SECOND_PRODUCT_ASSET, BAND_ASSET].map((id) => [
          id,
          options.alt ?? FIXTURE_ALT[locale] ?? FIXTURE_ALT.en ?? "",
        ]),
      ),
    ]),
  );

  return { assets, variants, alt };
}
