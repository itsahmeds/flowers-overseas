/**
 * `MediaAsset` — `Photo`'s asset path: a photograph from the manifest, or the honest placeholder
 * (spec 006 §2.5, §5.3, **AC-18**, **AC-19**; spec 004 §2 "Image conventions"; `plan/01` §6;
 * TASK-079).
 *
 * **Why this is a sibling of `Media` and not a prop on it.** `Media`'s `alt` is a required prop
 * with no default, which is right for a *reserved box*: the call site is promising per-locale copy
 * for a slot that has no asset yet. On the asset path `alt` is **data** — `product_media_alt`,
 * spec 002 §5.1, read from `seed/data/alt/{locale}.json` — and a prop would let a call site
 * override the dataset, which is precisely what AC-18 forbids ("`alt` is data, never generated at
 * render"). So this component takes an asset id and a locale and has **no `alt` prop at all**, and
 * the type system carries the rule.
 *
 * **Three states, one box** (§5.3): image, placeholder, and the runtime-404 case that degrades to
 * the placeholder rather than a broken-image icon. Every state reserves the same aspect box, so
 * the swap from placeholder to image costs **zero CLS and no template edit** — spec 004 §2's
 * promise, discharged here, and the mechanism behind TASK-080's data-flip proof (AC-20).
 *
 * **`<picture>` rather than `next/image`, deliberately.** Spec §2.5 requires an "AVIF-first
 * `srcset` with WebP fallback" and states that "`next/image` optimisation is bypassed for
 * already-derived variants (the loader returns the final URL)". `next/image` emits a single
 * `srcset` in one format and cannot express two formats with a type-negotiated fallback, and with
 * the optimiser bypassed it would add client JavaScript to every page carrying an image for no
 * behaviour at all — against spec 004 §14 A1's script budget, which a locale document is already
 * over. `<picture>` gives the exact markup the spec asks for at **zero client bytes**: the format
 * negotiation is the browser's, the lazy loading is the platform's, and the loader seam (AC-2)
 * still owns every URL.
 *
 * The placeholder's caption comes from `media.placeholder.*` per box, not from a prop: a caption a
 * call site could forget is a placeholder that looks broken instead of honest (`plan/10` §3).
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { preload } from "react-dom";

import { Photo, type PhotoRatio } from "../primitives/Photo.tsx";

import type { MediaManifest } from "./manifest.ts";

import { preloadArgsFor } from "./preload.ts";
import { type ResolvedImage, resolveMedia } from "./resolve.ts";
import { type MediaSlot, mediaSlot } from "./slots.ts";

/**
 * The `media.placeholder.*` key each box falls back to (`messages/*.json`, TASK-073). Typed as
 * the literal union rather than `string` so a key that leaves the catalogue is a type error here
 * rather than a `media.placeholder.…` string rendered to a buyer.
 */
const PLACEHOLDER_KEY: Readonly<
  Record<
    MediaSlot,
    | "placeholder.hero"
    | "placeholder.occasion"
    | "placeholder.product"
    | "placeholder.delivery"
  >
> = {
  hero: "placeholder.hero",
  // The editorial band of the home's explainer (TASK-053): the photograph it will hold is the
  // one taken at the recipient's door, which is what `media.placeholder.delivery` describes.
  band: "placeholder.delivery",
  tile: "placeholder.occasion",
  grid: "placeholder.product",
  thumb: "placeholder.product",
};

export interface MediaAssetProps {
  /** The manifest's asset id (`seed/data/media.json`). */
  readonly assetId: string;
  /** The resolved request locale. Alt text is per-locale data with **no** fallback (AC-18). */
  readonly locale: string;
  /**
   * The box to render in. Omitted means the box this asset's crop belongs to, through the seed↔UI
   * slot mapping of `./slots.ts`.
   */
  readonly slot?: MediaSlot;
  /**
   * The page's single LCP candidate (`plan/01` §6, AC-19). It renders eagerly, at
   * `fetchpriority="high"`, and emits the matching `<link rel="preload">` into `<head>` from the
   * same lookup.
   * Only a slot whose spec says `aboveFold` may be one.
   */
  readonly priority?: boolean;
  /** The product's name where the caller knows it, so an alt that merely repeats it is refused. */
  readonly productName?: string;
  /**
   * Resolve against this manifest instead of the committed one. `/dev/components` passes the
   * fixture manifest that renders the image state the committed dataset cannot produce yet (no
   * bytes, no alt text until TASK-080); a page never passes one. It bypasses nothing — the gate
   * of `./resolve.ts` applies to whatever manifest it is given.
   */
  readonly manifest?: MediaManifest;
  /**
   * The box to reserve, where the drawing's box is not the slot's own ratio. The product card is
   * the case that exists: spec 008 draws a **4∶5** box in all four card states while spec 006
   * derives the `grid` variants at 3∶4, and `object-cover` crops the difference rather than
   * letterboxing it. It changes the box, never the asset, the `sizes` or the alt text — and every
   * state of one call site gets the same box, which is what keeps the swap at zero CLS.
   */
  readonly ratio?: PhotoRatio;
  readonly className?: string;
}

export function MediaAsset({
  assetId,
  locale,
  slot,
  priority = false,
  productName,
  manifest,
  ratio,
  className,
}: MediaAssetProps): ReactElement {
  const t = useTranslations("media");
  const resolved = resolveMedia({
    assetId,
    locale,
    ...(slot === undefined ? {} : { slot }),
    ...(productName === undefined ? {} : { productName }),
    ...(manifest === undefined ? {} : { manifest }),
  });

  const box = resolved.kind === "image" ? resolved.slot : (slot ?? "grid");
  if (priority && !mediaSlot(box).aboveFold) {
    throw new Error(
      `media slot \`${box}\` is never above the fold and cannot be the page's priority image (plan/01 §6)`,
    );
  }

  if (resolved.kind === "placeholder") {
    return (
      <Photo
        caption={t(PLACEHOLDER_KEY[box])}
        ratio={ratio ?? mediaSlot(box).ratio}
        {...(className === undefined ? {} : { className })}
        // Why this box is a box and not a photograph, on the box itself: a reviewer, an e2e
        // assertion and `/dev/components` all read the same reason (spec 006 §5.3's states).
        dataset={{
          "data-fo-media-asset": assetId,
          "data-fo-media-slot": box,
          "data-fo-media-placeholder": resolved.reason,
        }}
      />
    );
  }

  // AVIF-first with a WebP fallback, in the canonical `<picture>` shape and with **no ladder
  // written twice**: every format but the last is a `<source>`, and the last one is the `<img>`'s
  // own `srcset`. So a browser that understands AVIF takes the first `<source>`; one that does
  // not falls through to the WebP ladder on the `<img>`; and one that understands neither takes
  // its `src` (§2.5).
  const negotiated = resolved.sources.slice(0, -1);
  const fallback = resolved.sources.at(-1);

  // AC-19: the LCP candidate's preload, hoisted into `<head>` by React (see `preloadLcpCandidate`).
  if (priority) preloadLcpCandidate(resolved);

  return (
    <Photo
      // No caption in the image state: a photograph does not need a sentence describing the
      // photograph that should be there. `@utility photo`'s `:has(> picture)` branch drops the
      // padding that insets the caption, so the image fills the reserved box edge to edge.
      {...(className === undefined ? {} : { className })}
      ratio={ratio ?? resolved.ratio}
      dataset={{
        "data-fo-media-asset": assetId,
        "data-fo-media-slot": resolved.slot,
        "data-fo-media-source": resolved.asset.source,
      }}
    >
      <picture className="block h-full w-full">
        {negotiated.map((source) => (
          <source
            key={source.format}
            sizes={resolved.sizes}
            srcSet={source.srcSet}
            type={source.type}
          />
        ))}
        {/* A raw `<img>`, not `next/image` — see the header: the variants are already derived,
            so the optimiser is bypassed either way (§2.5), `next/image` cannot express the
            AVIF→WebP fallback this spec requires, and it would add client JavaScript to every
            page carrying an image. */}
        <img
          alt={resolved.alt}
          // `object-cover` inside a box whose ratio was reserved before paint: where the asset's
          // crop and the box's ratio differ (`./slots.ts`), the difference is cropped rather than
          // letterboxed, and the CLS delta of landing imagery stays 0.
          className="h-full w-full object-cover"
          decoding={priority ? undefined : "async"}
          fetchPriority={priority ? "high" : undefined}
          height={resolved.height}
          loading={priority ? "eager" : "lazy"}
          sizes={resolved.sizes}
          src={resolved.fallbackSrc}
          srcSet={fallback?.srcSet}
          width={resolved.width}
        />
      </picture>
    </Photo>
  );
}

/**
 * The `<link rel="preload">` for the LCP candidate, emitted through React's `preload()` so that it
 * is **hoisted into `<head>`** and deduped there. It is built from the **same** `ResolvedImage` the
 * `<picture>` above rendered from, which is AC-19's "the two cannot disagree" as a data-flow fact.
 *
 * A `<link>` returned from this component would *not* be hoisted — React hoists a `<link>` only as
 * a resource keyed on `href`, and this preload carries `imagesrcset` instead — so it would sit in
 * the body immediately in front of the `<picture>` and the preload scanner would reach both in the
 * same breath. `./preload.ts` explains the `href` React's API requires and why it never reaches the
 * markup.
 */
function preloadLcpCandidate(image: ResolvedImage): void {
  const args = preloadArgsFor(image);
  if (args === undefined) return;
  preload(args.href, args.options);
}
