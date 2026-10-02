/**
 * `Gallery` — the product page's photographs, or the honest box that stands where they will go
 * (spec 009 §2 "Gallery", §5.3, AC-25's slot half; `docs/design/system/components.dc.html`
 * "Gallery"; TASK-126).
 *
 * Two states, one fixed 1∶1 box, so the placeholder → photograph swap costs zero layout shift:
 *
 *  - **photos** — a list named "Product images" (`a11y.media.gallery`), hero first, then up to four
 *    thumbnails. The hero is the page's **single** `priority` image when the page says so: spec
 *    006's `MediaAsset` builds its `<link rel="preload">` from the same manifest lookup that
 *    produced its `srcset`, and every thumbnail is lazy. The honesty label renders beneath,
 *    through `MediaProvenanceNote`, which has no prop that could switch it off.
 *  - **placeholder** — 72 of the 84 products. `media.placeholder.product` verbatim in the hero box,
 *    four empty boxes where the thumbnails go, **no `<img>`** and therefore **no honesty label**:
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

/** The thumbnail row's length in the placeholder state — the drawing's four empty boxes. */
const EMPTY_THUMBS = ["a", "b", "c", "d"] as const;

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

  if (gallery.kind === "placeholder") {
    return (
      <div className="gap-sm flex flex-col" data-fo-gallery="placeholder">
        <Photo
          caption={media("placeholder.product")}
          ratio="square"
          dataset={{
            "data-fo-media-slot": "hero",
            "data-fo-media-placeholder": "no-asset",
          }}
        />
        <div aria-hidden="true" className="gap-sm grid grid-cols-4">
          {EMPTY_THUMBS.map((key) => (
            <div
              key={key}
              className="border-border-strong bg-surface-raised aspect-square border border-dashed"
            />
          ))}
        </div>
      </div>
    );
  }

  const assetIds = [
    gallery.hero.assetId,
    ...gallery.thumbs.map((image) => image.assetId),
  ];

  return (
    <div className="gap-sm flex flex-col" data-fo-gallery="photos">
      <ul
        aria-label={a11y("media.gallery")}
        className="gap-sm m-0 grid list-none grid-cols-4 p-0"
      >
        <li className="col-span-4">
          <MediaAsset
            assetId={gallery.hero.assetId}
            locale={code}
            priority={priority}
            productName={productName}
            ratio="square"
            slot="hero"
            {...withManifest}
          />
        </li>
        {gallery.thumbs.map((image) => (
          <li key={image.assetId}>
            <MediaAsset
              assetId={image.assetId}
              locale={code}
              productName={productName}
              ratio="square"
              slot="thumb"
              {...withManifest}
            />
          </li>
        ))}
      </ul>
      <MediaProvenanceNote
        assetIds={assetIds}
        locale={code}
        {...withManifest}
      />
    </div>
  );
}
