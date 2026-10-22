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
 *  - **placeholder** — the wordless, `aria-hidden` box (spec 043 AC-14) and nothing else (v2
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
import {
  GalleryDots,
  HorizontalScroller,
} from "../primitives/HorizontalScroller.tsx";
import { Photo } from "../primitives/Photo.tsx";

import { localeOf } from "./labels.ts";

/**
 * The phone photograph (spec 004 §14 A24 clause 5): `min(470px, 100svh − 300px)`, at least 300 px,
 * full-bleed and square-cornered; from `md` the box keeps its 4∶5 ratio.
 */
export const PHONE_PHOTO =
  "max-md:aspect-auto max-md:h-[min(470px,calc(100svh-300px))] max-md:min-h-[300px] max-md:rounded-none";

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
  const code = localeOf(locale);
  const withManifest = manifest === undefined ? {} : { manifest };

  // v2 (product artboards, "Gallery · no photograph"): one fixed 4∶5 box, no thumbnails, no
  // honesty label — there is no generated image to be honest about.
  if (gallery.kind === "placeholder") {
    return (
      <div className="flex flex-col lg:col-[2/8]" data-fo-gallery="placeholder">
        <Photo
          decorative
          className={`${PHONE_PHOTO} lg:rounded-photo`}
          ratio="card"
          dataset={{
            "data-fo-media-slot": "hero",
            "data-fo-media-placeholder": "no-asset",
          }}
        />
      </div>
    );
  }

  // v3 (spec 004 §14 A24 clauses 4 (c), 5; TASK-197). One list, two layouts, no second copy of
  // any image:
  //  - **desktop** (`lg`): the gallery spans columns 1–7 of the page's 12-column grid as a subgrid;
  //    the hero is a full 4∶5 on columns 2–7 with no height cap, the other photographs stack as
  //    pictures on column 1 (not buttons: nothing here swaps the hero, spec 004 §14 A20);
  //  - **phone** (below `md`): a real horizontal scroller, full-bleed, every photograph at
  //    `min(470px, 100svh − 300px)` (at least 300 px), snapped one per screen, with the dots drawn
  //    only as in-page links to each photograph (`GalleryDots`, 24 × 24 targets). Nothing
  //    auto-advances and nothing is called a carousel.
  // The hero is the page's one `priority` image; every other photograph is lazy and keeps its own
  // `grid` box, so the phone slide is never a 96 px thumbnail stretched to the screen.
  // Contained from `lg` (TASK-227, the founder's report of 2026-10-14): the strip's desktop grid is
  // `!important`, so no later `display: flex` (the scroller's own base class included) can lay it
  // back out as the phone's row at a desktop width, and it clips (`overflow: clip`, not a scroll
  // container) so even then no photograph paints beside the hero or under the buy column.
  const images = [gallery.hero, ...gallery.thumbs];
  const anchor = (index: number): `#${string}` =>
    `#pdp-photo-${String(index + 1)}`;
  return (
    <div
      className="relative lg:col-span-full lg:grid lg:grid-cols-subgrid"
      data-fo-gallery="photos"
    >
      <HorizontalScroller
        bleed={false}
        className="max-lg:gap-0 lg:col-span-full lg:grid! lg:grid-cols-subgrid lg:grid-rows-[repeat(4,auto)_1fr] lg:[column-gap:normal] lg:gap-y-[12px] lg:overflow-clip [&>li]:w-full lg:[&>li]:col-start-1 lg:[&>li:first-child]:col-[2/8] lg:[&>li:first-child]:row-[1/6]"
        itemsFocusable={false}
        items={images.map((image, index) => ({
          key: image.assetId,
          node: (
            <div
              className={
                index === 0
                  ? "relative"
                  : "relative lg:overflow-hidden lg:rounded-[10px] lg:shadow-[inset_0_0_0_1px_var(--color-rule)]"
              }
              data-fo-gallery-image={index === 0 ? "hero" : "more"}
              id={anchor(index).slice(1)}
            >
              <MediaAsset
                assetId={image.assetId}
                className={`${PHONE_PHOTO} ${index === 0 ? "lg:rounded-photo" : "lg:rounded-[10px]"}`}
                locale={code}
                priority={index === 0 && priority}
                productName={productName}
                ratio="card"
                {...(index === 0 ? { slot: "hero" as const } : {})}
                {...withManifest}
              />
              {index === 0 ? (
                /* The honesty label as real text over the hero's corner (the artboards' `g-prov`
                   pill): top-start on the phone, bottom-start from `md`. */
                <div className="[&_p]:bg-card [&_p]:text-ink-muted pointer-events-none absolute start-[20px] top-[12px] max-w-[calc(100%-40px)] md:start-[16px] md:top-auto md:bottom-[16px] [&_p]:m-0 [&_p]:rounded-full [&_p]:px-[12px] [&_p]:py-[4px] [&_p]:text-xs">
                  <MediaProvenanceNote
                    assetIds={images.map((item) => item.assetId)}
                    locale={code}
                    {...withManifest}
                  />
                </div>
              ) : null}
            </div>
          ),
        }))}
        label={a11y("media.gallery")}
      />
      <GalleryDots
        // Until `lg` the gallery is a scroller (the phone and the tablet), so the dots show there.
        // No dot claims to be the current one: with no island nothing follows the scroll, so a
        // fixed `aria-current` would be wrong after the first swipe (review round 1).
        className="absolute start-0 end-0 bottom-[40px] z-[3] lg:hidden"
        current={-1}
        label={a11y("media.gallery")}
        links={images.map((image, index) => ({
          href: anchor(index),
          label: a11y("media.imageOfCount", {
            index: String(index + 1),
            total: String(images.length),
          }),
        }))}
      />
    </div>
  );
}
