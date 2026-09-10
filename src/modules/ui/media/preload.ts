/**
 * The single LCP candidate and its matching preload (spec 006 §2.5 "LCP", **AC-19**; `plan/01` §6;
 * TASK-079).
 *
 * > Exactly one `priority` candidate per page, and the `<link rel="preload" as="image"
 * > imagesrcset imagesizes>` for it is emitted from the *same* manifest lookup that produced the
 * > `srcset`, so the two cannot disagree.
 *
 * "The same lookup" is taken literally: `preloadFor()` takes the **`ResolvedImage` the `<picture>`
 * rendered from**, not an asset id, so there is no second lookup that could resolve differently
 * after a manifest or loader swap. A preload that disagrees with the `srcset` is worse than no
 * preload — the browser fetches a resource the layout then never uses, spending the LCP budget
 * twice — which is why this is a type-level guarantee rather than a convention.
 *
 * **One preload, in the first format offered.** The `<picture>` offers AVIF then WebP; a preload
 * carries a `type`, and a browser that understands both formats would fetch both if both were
 * preloaded. So the descriptor is the AVIF ladder (or WebP where an asset has no AVIF), which is
 * the ladder that browser will use.
 *
 * Nothing eager above the LCP candidate (§2.5): `Media` marks every non-`priority` image
 * `loading="lazy"` + `decoding="async"`, and only the `priority` image is `fetchpriority="high"`.
 */
import type { ResolvedImage } from "./resolve.ts";

/**
 * A `data-` marker on the emitted `<link>`, so a unit test, an e2e test and a reviewer can count
 * the page's image preloads without parsing `rel` lists — and so AC-19's "a fixture page with two
 * `priority` images fails the test" is one selector.
 */
export const MEDIA_PRELOAD_MARKER = "data-fo-media-preload";

/** Exactly the attribute set of `<link rel="preload" as="image">`, ready to spread. */
export interface MediaPreloadDescriptor {
  readonly rel: "preload";
  readonly as: "image";
  readonly imageSrcSet: string;
  readonly imageSizes: string;
  readonly type: string;
  readonly fetchPriority: "high";
}

/**
 * The preload for the page's one LCP image, or `undefined` when the resolved asset offers no
 * ladder at all (which `resolveMedia` already refuses to render, so it is unreachable through
 * `Media`).
 */
export function preloadFor(
  image: ResolvedImage,
): MediaPreloadDescriptor | undefined {
  const first = image.sources[0];
  if (first === undefined) return undefined;
  return {
    rel: "preload",
    as: "image",
    imageSrcSet: first.srcSet,
    imageSizes: image.sizes,
    type: first.type,
    fetchPriority: "high",
  };
}

/**
 * The page-level half of AC-19, for a template that composes its own gallery: "exactly one" is a
 * property of a **page**, and no component can know it (`./slots.ts` explains why `aboveFold` is
 * eligibility rather than the decision). A template that nominates two candidates gets a loud
 * error at render rather than a Lighthouse finding two weeks later.
 */
export function assertSinglePriority(
  priorityAssetIds: readonly string[],
): void {
  if (priorityAssetIds.length > 1) {
    throw new Error(
      `a page has exactly one \`priority\` image (plan/01 §6, spec 006 AC-19); this one nominates ${String(priorityAssetIds.length)}: ${priorityAssetIds.join(", ")}`,
    );
  }
}
