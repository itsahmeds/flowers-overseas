/**
 * The image-loader seam (ADR-0015 "R2 for images"; spec 004 §2 "Image conventions"; TASK-052,
 * flipped to R2 by TASK-138).
 *
 * §2: "`src/modules/ui/media/loader.ts` exporting a `next/image` custom loader behind an
 * interface, with a `placeholderLoader` in Phase 0 (no bucket exists) and the R2/variant loader
 * arriving with 002/006 as a swap inside the module — the same seam shape spec 003 used for the
 * locale registry, so no call site changes."
 *
 * That swap is what TASK-138 performed, and the three properties the seam was built for are the
 * three things it preserved:
 *
 *  - **It is typed against `next/image`'s own contract, with a type-only import.** `MediaLoader`
 *    takes `next/image`'s `ImageLoaderProps` and returns a URL string, so the day a call site
 *    hands the object to `<Image loader={…}>` the types already agree. `import type` emits no
 *    code, so the seam costs the client bundle nothing — which matters, because a locale document
 *    is already over spec §14 A1's 131 072 B (the addendum's accepted breach, TASK-085). The R2
 *    loaders below add one string concatenation and one imported constant, and no runtime import
 *    of anything that is not already in the graph.
 *  - **`placeholderLoader` throws rather than inventing a URL**, and it still does. What it
 *    refuses is unchanged by the bucket existing: a variant that was never derived has no URL,
 *    and answering with a data URI or a stock service would put a photograph we do not have onto
 *    a page. The honesty gate that decides *whether* an `<img>` may be rendered at all is
 *    `./resolve.ts`, untouched here; this file only ever decides *where* an image that exists is
 *    served from.
 *  - **Swapping it is a `setMediaLoader()` / `setVariantLoader()` call inside this module**,
 *    exactly as `src/modules/i18n/registry.ts` swaps the locale provider. No call site names a
 *    loader, `Media` reads it through `getMediaLoader()` and `./resolve.ts` through
 *    `resolveLoader()` at render time rather than capturing it at import time, so the swap could
 *    not be defeated by module evaluation order — and, as promised, the flip to R2 changed **zero
 *    call sites** outside this module (AC-2).
 */
import type { ImageLoaderProps } from "next/image";

import { mediaUrl } from "@/lib/media-origin";

/** What `next/image` calls with `{ src, width, quality }` and expects a URL back. */
export type MediaLoader = (props: ImageLoaderProps) => string;

/**
 * The refusal. Kept, exported and still throwing after the R2 flip (TASK-138), because what it
 * refuses has not changed: a URL for an image that does not exist. The 72 products with no
 * imagery keep their captioned placeholder — `./resolve.ts` is the gate that decides that — until
 * their photographs are taken, derived and uploaded; this loader is what a caller gets if it
 * reaches for a URL anyway, and what a test installs to prove nothing reached.
 */
export const placeholderLoader: MediaLoader = ({ src }) => {
  throw new Error(
    `no derived variant for \`${src}\`: an image that has not been derived has no URL, and inventing one would put a photograph we do not have onto the page (ADR-0014, ADR-0015)`,
  );
};

/**
 * The R2 flip on `next/image`'s own seam (§2.6): `src` is the stored object key and the URL is
 * that key under the single media origin (`src/lib/media-origin.ts`).
 *
 * Nothing renders through `next/image` today — `MediaAsset` emits a `<picture>`, because the
 * optimiser is bypassed for already-derived variants and `next/image` cannot express the
 * AVIF→WebP fallback at zero client bytes (§2.5) — so this half of the seam is the one that
 * matters the day a call site *does* hand a source to `<Image>`: it will address the bucket like
 * everything else rather than re-encoding bytes that are already final.
 */
export const r2Loader: MediaLoader = ({ src }) => mediaUrl(src);

let loader: MediaLoader = r2Loader;

/** The loader in force. Read at render time, never captured at import time. */
export function getMediaLoader(): MediaLoader {
  return loader;
}

/**
 * Install a loader (the R2 implementation, the refusal, or a fake in a test). Returns the
 * previous one so a test can restore it without knowing what it replaced.
 */
export function setMediaLoader(next: MediaLoader): MediaLoader {
  const previous = loader;
  loader = next;
  return previous;
}

/* -------------------------------------------------------------------------- */
/* `VariantLoader` — the URL half of the R2 flip (spec 006 §2.1, §2.5, AC-2).  */
/* -------------------------------------------------------------------------- */

/**
 * A derived variant, as the manifest identifies it. Not `next/image`'s `{ src, width, quality }`:
 * a variant is already derived, so there is nothing to ask an optimiser for — the loader's whole
 * job is to turn *(asset, width, format)* into the URL of a file that already exists (§2.5
 * "`next/image` optimisation is bypassed for already-derived variants").
 */
export interface VariantRef {
  readonly assetId: string;
  readonly width: number;
  readonly format: "avif" | "webp" | "jpeg";
  /**
   * The manifest's own object key for this variant. Passed in rather than derived, so a loader
   * that addresses objects by key (R2, §2.6) needs no second key convention and cannot invent
   * one — the "a foreign key is passed in, never invented" rule applied to storage. It is now
   * load-bearing rather than merely principled: it is the key the object was **uploaded** under
   * (`scripts/media-upload.ts` reads the same field), so the URL and the object cannot drift.
   */
  readonly objectKey: string;
}

/** What every image URL in the application comes from. Two implementations, one seam (AC-2). */
export type VariantLoader = (ref: VariantRef) => string;

/**
 * §2.6, in force since TASK-138: `${MEDIA_ORIGIN}/{objectKey}`.
 *
 * The bytes are no longer committed under `public/media/` — the 6 MB repository cap that bought
 * twelve demo assets is gone with them, which is what lets all 84 products carry photographs —
 * and they are not served by the application at all. They are objects in `flowersoverseas-media`,
 * uploaded by `scripts/media-upload.ts` from the same manifest rows this loader reads, with
 * `Cache-Control: public, max-age=31536000, immutable` set **on the object** (the header rule
 * that used to do that for `/media/*` left `next.config.ts` with the files).
 *
 * `immutable` stays safe for the same reason it always was: the key is content-addressed by asset
 * version and width, so a changed photograph is a new asset id (`…-v2`) and never the same key
 * with new bytes.
 *
 * The origin must also stay **crawlable** when spec 007 lifts `Disallow: /` — Google cannot fetch
 * the images it evaluates for Core Web Vitals otherwise. With the images now on a third-party
 * host that requirement moved with them: it is the bucket's `robots.txt` that matters, not ours
 * (`docs/runbooks/imagery.md`, spec 006 §6).
 */
export const r2VariantLoader: VariantLoader = ({ objectKey }) =>
  mediaUrl(objectKey);

let variantLoader: VariantLoader = r2VariantLoader;

/**
 * The composition root of §2.1: **one** function the whole module reads its URLs through, read at
 * call time. No call site anywhere names a loader — that is AC-2's "zero changes outside
 * `src/modules/ui/media/`", and `tests/unit/ui-media-asset.test.tsx` proves it by swapping in a
 * fake and watching every rendered URL change.
 */
export function resolveLoader(): VariantLoader {
  return variantLoader;
}

/** Install a variant loader (the R2 implementation, or a fake). Returns the previous one. */
export function setVariantLoader(next: VariantLoader): VariantLoader {
  const previous = variantLoader;
  variantLoader = next;
  return previous;
}
