/**
 * The single LCP candidate and its matching preload (spec 006 §2.5 "LCP", **AC-19**; `plan/01` §6;
 * TASK-079).
 *
 * > Exactly one `priority` candidate per page, and the `<link rel="preload" as="image"
 * > imagesrcset imagesizes>` for it is emitted from the *same* manifest lookup that produced the
 * > `srcset`, so the two cannot disagree.
 *
 * "The same lookup" is taken literally: `preloadArgsFor()` takes the **`ResolvedImage` the `<picture>`
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
 * **It reaches `<head>` because `MediaAsset` calls React's `preload()`, not because a `<link>` is
 * rendered.** An element rendered in the body stays in the body: React hoists a `<link>` only as a
 * *hoistable resource*, which is keyed on `href`, and an image preload built from `imagesrcset`
 * has none. A preload discovered at the same point in the byte stream as the `<img>` buys nothing,
 * so the descriptor below is fed to `preload()` from `react-dom`, which hoists and dedupes it into
 * the document head. `tests/e2e/dev-components.spec.ts` asserts the placement on the built page,
 * because `renderToStaticMarkup` has no document and cannot see it.
 *
 * Nothing eager above the LCP candidate (§2.5): `Media` marks every non-`priority` image
 * `loading="lazy"` + `decoding="async"`, and only the `priority` image is `fetchpriority="high"`.
 */
import type { ResolvedImage } from "./resolve.ts";

/**
 * The two arguments of React's `preload()` for `<link rel="preload" as="image">`, built as a pure
 * value so the agreement AC-19 demands can be asserted without a DOM.
 *
 * **Why an `href` at all.** React's `preload(href, options)` ignores the call when `href` is empty
 * (`react-dom` 19.2, `ReactDOMFloat`'s `L` dispatcher: `if (as && href)`), and when `imageSrcSet`
 * is present it dedupes on `imageSrcSet + "\n" + imageSizes` and emits the link **without** the
 * `href` — `href: imageSrcSet ? void 0 : href`. So `href` here is the largest AVIF candidate: it
 * keeps the call from being dropped, it never reaches the markup, and it can therefore never
 * cause a second fetch. The attribute the browser acts on is `imagesrcset`, exactly as the
 * `<picture>` renders it.
 */
export interface MediaPreloadArgs {
  /** React's positional `href`. Not emitted — see above. */
  readonly href: string;
  readonly options: {
    readonly as: "image";
    readonly imageSrcSet: string;
    readonly imageSizes: string;
    readonly type: string;
    readonly fetchPriority: "high";
  };
}

/** The last (largest) candidate URL of an ascending `srcset`, or `""` for an empty ladder. */
function largestCandidate(srcSet: string): string {
  const last = srcSet.split(",").at(-1)?.trim() ?? "";
  return last.split(/\s+/)[0] ?? "";
}

/**
 * The preload arguments for the page's one LCP image, or `undefined` when the resolved asset
 * offers no ladder at all (which `resolveMedia` already refuses to render, so it is unreachable
 * through `MediaAsset`).
 */
export function preloadArgsFor(
  image: ResolvedImage,
): MediaPreloadArgs | undefined {
  const first = image.sources[0];
  if (first === undefined) return undefined;
  const href = largestCandidate(first.srcSet);
  if (href === "") return undefined;
  return {
    href,
    options: {
      as: "image",
      imageSrcSet: first.srcSet,
      imageSizes: image.sizes,
      type: first.type,
      fetchPriority: "high",
    },
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
