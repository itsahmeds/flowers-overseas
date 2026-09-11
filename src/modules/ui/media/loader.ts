/**
 * The image-loader seam (ADR-0015 "R2 for images"; spec 004 §2 "Image conventions"; TASK-052).
 *
 * §2: "`src/modules/ui/media/loader.ts` exporting a `next/image` custom loader behind an
 * interface, with a `placeholderLoader` in Phase 0 (no bucket exists) and the R2/variant loader
 * arriving with 002/006 as a swap inside the module — the same seam shape spec 003 used for the
 * locale registry, so no call site changes."
 *
 * Three properties this file is built for:
 *
 *  - **It is typed against `next/image`'s own contract, with a type-only import.** `MediaLoader`
 *    takes `next/image`'s `ImageLoaderProps` and returns a URL string, so the day spec 006 hands
 *    the object to `<Image loader={…}>` the types already agree. `import type` emits no code, so
 *    the seam costs the client bundle nothing — which matters, because a locale document is
 *    already over spec §14 A1's 131 072 B (the addendum's accepted breach, TASK-085).
 *  - **`placeholderLoader` throws rather than inventing a URL.** There is no bucket, no variant
 *    pipeline and no image (`plan/10` §3), so the only honest answer to "give me the URL of this
 *    image" in Phase 0 is that there is none. A loader that returned a data URI or a stock
 *    service would put a photograph we do not have onto a page, which is the one thing the
 *    honesty rule forbids outright. Nothing calls it in Phase 0 — `Media` renders the placeholder
 *    box and no `<img>` — so the throw is unreachable in production and is the assertion the unit
 *    test exercises.
 *  - **Swapping it is a `setMediaLoader()` call inside this module**, exactly as
 *    `src/modules/i18n/registry.ts` swaps the locale provider. No call site names a loader, and
 *    `Media` reads it through `getMediaLoader()` at render time rather than capturing it at
 *    import time, so the swap cannot be defeated by module evaluation order.
 */
import type { ImageLoaderProps } from "next/image";

/** What `next/image` calls with `{ src, width, quality }` and expects a URL back. */
export type MediaLoader = (props: ImageLoaderProps) => string;

/**
 * Phase 0: there is no image store. ADR-0015 chose Cloudflare R2 and spec 002/006 create the
 * bucket and the variants; until then a call here is a bug in the caller, not a missing URL to
 * paper over.
 */
export const placeholderLoader: MediaLoader = ({ src }) => {
  throw new Error(
    `no image store in Phase 0: cannot resolve a URL for \`${src}\` (ADR-0015; the R2 loader arrives with spec 002/006)`,
  );
};

let loader: MediaLoader = placeholderLoader;

/** The loader in force. Read at render time, never captured at import time. */
export function getMediaLoader(): MediaLoader {
  return loader;
}

/**
 * Install a loader (spec 006's R2/variant implementation, or a fake in a test). Returns the
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
   * one — the "a foreign key is passed in, never invented" rule applied to storage.
   */
  readonly objectKey: string;
}

/** What every image URL in the application comes from. Two implementations, one seam (AC-2). */
export type VariantLoader = (ref: VariantRef) => string;

/**
 * Phase 0: the derived bytes are committed under `public/media/` and served by the host
 * (spec 006 §13 Q4), so the URL is the path of the file itself —
 * `/media/{assetId}/{width}.{fmt}`, exactly §2.1's contract.
 *
 * The path is **content-addressed by width and asset version, never mutated**: a changed image is
 * a new asset id (`…-v2`), which is what makes `Cache-Control: public, max-age=31536000,
 * immutable` on `/media/*` safe (§2.5, `src/lib/media-headers.ts`).
 *
 * `/media/*` must also stay **crawlable** when spec 007 lifts `Disallow: /`, or Google cannot
 * fetch the images it evaluates for Core Web Vitals — recorded as a requirement on 007 here, in
 * spec 006 §6 and in `docs/runbooks/imagery.md` (TASK-081).
 */
export const staticVariantLoader: VariantLoader = ({
  assetId,
  width,
  format,
}) => `/media/${assetId}/${String(width)}.${format}`;

let variantLoader: VariantLoader = staticVariantLoader;

/**
 * The composition root of §2.1: **one** function the whole module reads its URLs through, read at
 * call time so the R2 flip of §2.6 (`r2VariantLoader`, `${R2_PUBLIC_BASE_URL}/{objectKey}`) is a
 * change to this file and nothing else. No call site anywhere names a loader — that is AC-2's
 * "zero changes outside `src/modules/ui/media/`", and `tests/unit/ui-media-asset.test.tsx`
 * proves it by swapping in a fake and watching every rendered URL change.
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
