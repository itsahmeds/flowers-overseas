/**
 * `Gallery` — the product page's photographs, or the honest box that stands where they will go
 * (spec 009 §2 "Gallery", §5.3, AC-25's slot half; `docs/design/system/components.dc.html`
 * "Gallery"; TASK-126).
 *
 * Two states, one fixed 4∶5 box (v2, TASK-179), so the placeholder → photograph swap costs zero layout shift:
 *
 *  - **photos** — a list named "Product images" (`a11y.media.gallery`), hero first, then up to four
 *    thumbnails. The hero is the page's **single** `priority` image when the page says so: spec
 *    006's `MediaAsset` builds its `<link rel="preload">` from the same manifest lookup that
 *    produced its `srcset`, and every thumbnail is lazy. The honesty label renders beneath,
 *    through `MediaProvenanceNote`, which has no prop that could switch it off.
 *  - **placeholder** — `media.placeholder.product` verbatim in the hero box and nothing else (v2
 *    drops v1's four empty thumbnail boxes), **no `<img>`** and therefore **no honesty label**:
 *    there is no generated image to be honest about.
 *
 * No carousel: every image is in the DOM, in order, at both widths. Alt text is per-locale data
 * on the view model and is never derived from the product name.
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { ProductGallery } from "@/modules/catalog";

import { MediaAsset } from "../media/MediaAsset.tsx";
import type { MediaManifest } from "../media/manifest.ts";
import { MediaProvenanceNote } from "../media/MediaProvenanceNote.tsx";
import { Photo } from "../primitives/Photo.tsx";

import { localeOf } from "./labels.ts";

export interface GalleryProps {
  readonly gallery: ProductGallery;
  readonly locale: string;
  /** The product's name, so an alt text that merely repeats it is refused (spec 006 AC-18). */
  readonly productName: string;
  /** Whether the hero is the page's one LCP image (AC-25). The page nominates exactly one. */
  readonly priority?: boolean;
  readonly manifest?: MediaManifest;
}

export function Gallery({
  gallery,
  locale,
  productName,
  priority = false,
  manifest,
}: GalleryProps): ReactElement {
  const a11y = useTranslations("a11y");
  const media = useTranslations("media");
  const code = localeOf(locale);
  const withManifest = manifest === undefined ? {} : { manifest };

  // v2 (product artboards, "Gallery · no photograph"): one fixed 4∶5 box, no thumbnails, no
  // honesty label — there is no generated image to be honest about.
  if (gallery.kind === "placeholder") {
    return (
      <div className="flex flex-col" data-fo-gallery="placeholder">
        <Photo
          caption={media("placeholder.product")}
          className="lg:rounded-[24px]"
          ratio="card"
          dataset={{
            "data-fo-media-slot": "hero",
            "data-fo-media-placeholder": "no-asset",
          }}
        />
      </div>
    );
  }

  const assetIds = [
    gallery.hero.assetId,
    ...gallery.thumbs.map((image) => image.assetId),
  ];

  // The hero at 4∶5 with the honesty label laid over its corner as real text (the artboards'
  // `g-prov` pill), then the other photographs as 76 × 92 thumbnails. Every image is in the DOM,
  // in order; the thumbnails are pictures, not buttons, because nothing on this page swaps the
  // hero without the island spec 009 has not built (spec 004 §14 A20: no dead controls).
  return (
    <div className="flex flex-col" data-fo-gallery="photos">
      <ul
        aria-label={a11y("media.gallery")}
        className="m-0 flex list-none flex-wrap gap-[12px] p-0"
      >
        <li className="relative w-full">
          <MediaAsset
            assetId={gallery.hero.assetId}
            className="lg:rounded-[24px]"
            locale={code}
            priority={priority}
            productName={productName}
            ratio="card"
            slot="hero"
            {...withManifest}
          />
          <div className="[&_p]:bg-card [&_p]:text-ink-muted absolute start-[12px] bottom-[12px] max-w-[calc(100%-24px)] [&_p]:m-0 [&_p]:rounded-full [&_p]:px-[12px] [&_p]:py-[4px] [&_p]:text-xs">
            <MediaProvenanceNote
              assetIds={assetIds}
              locale={code}
              {...withManifest}
            />
          </div>
        </li>
        {gallery.thumbs.map((image) => (
          <li
            key={image.assetId}
            className="mt-[2px] w-[76px] overflow-hidden rounded-[12px] shadow-[inset_0_0_0_1.5px_var(--color-rule)]"
          >
            <MediaAsset
              assetId={image.assetId}
              className="rounded-[12px]! md:rounded-[12px]!"
              locale={code}
              productName={productName}
              ratio="card"
              slot="thumb"
              {...withManifest}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
