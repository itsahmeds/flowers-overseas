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
