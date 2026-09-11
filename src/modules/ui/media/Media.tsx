/**
 * `Media` — the one wrapper every photograph on the site goes through (spec 004 §2 "Image
 * conventions", `plan/01` §6, ADR-0014, ADR-0015; TASK-052).
 *
 * It fixes the conventions of §2 once, per **named slot** (`./slots.ts`): the `sizes` string, the
 * reserved aspect-ratio box, lazy loading and `decoding="async"` below the fold, and at most one
 * `priority` candidate per page. And it requires `alt` as a prop **with no default**, because alt
 * text is per-locale data in `product_media` (spec 002) and is never generated at render time —
 * a wrapper that defaulted it would turn a missing translation into a silent accessibility
 * failure instead of a type error.
 *
 * **In Phase 0 it renders the token-gradient placeholder and no `<img>`.** Not a stub: it is the
 * `plan/10` §3 honesty rule, and it is why the box reserves its ratio now. The founder has
 * supplied no imagery and spec 006 generates it (ADR-0014), so `source` is optional and every
 * Phase-0 call site omits it — the hero, the occasion tiles, the trending row. When 006 lands
 * imagery, the `source` branch below becomes an `<Image>` from `next/image` with
 * `sizes={spec.sizes}`, `loader={getMediaLoader()}` and the same box, the LCP element on the home
 * page changes from text to image **with no layout shift and no template edit**, and no call site
 * changes. The `next/image` import is deliberately absent until then: a locale document is
 * already over §14 A1's 131 072 B (the addendum's accepted breach, TASK-085), and a component
 * that renders nothing must not spend a byte of it.
 *
 * `caption` is the placeholder's own copy — what the slot will hold, from the message catalogue.
 * It is what makes an empty box honest rather than broken, and it is dropped the moment a real
 * image renders, because a photograph does not need a sentence describing the photograph that
 * should be there.
 */
import type { ReactElement, ReactNode } from "react";

import { Photo } from "../primitives/Photo.tsx";

import { type MediaSlot, mediaSlot } from "./slots.ts";

/**
 * A real image, once one exists (spec 006). Present in the type so the shape of the swap is
 * reviewable now; `Media` refuses to render it in Phase 0 rather than fabricating a URL.
 */
export interface MediaSource {
  /** The store-relative key the loader resolves (spec 002's `product_media.path`). */
  readonly src: string;
  readonly width: number;
  readonly height: number;
}

export interface MediaProps {
  readonly slot: MediaSlot;
  /**
   * Per-locale alternative text. **Required, no default** (§2). Empty string is legitimate and
   * meaningful — a decorative image — and must be written out, so the decision is visible in the
   * call site rather than inherited from a default nobody chose.
   */
  readonly alt: string;
  /**
   * What the slot will hold, while it holds nothing. Phase 0's honest caption.
   *
   * A `ReactNode` rather than a `string` because a slot may carry **two** captions and let CSS
   * choose between them: the hero writes a short line under the mobile artboard's 300 px box and
   * the full shooting brief under the desktop band (TASK-054). It is still catalogue copy in
   * every case — the node holds message values, never a literal.
   */
  readonly caption?: ReactNode;
  /**
   * The page's single `priority` candidate. Only a slot whose spec says `aboveFold` may be one;
   * anything else is a caller error, because a below-the-fold `priority` image competes with the
   * LCP element for bandwidth (`plan/01` §6).
   */
  readonly priority?: boolean;
  readonly source?: MediaSource;
  readonly className?: string;
}

export function Media({
  slot,
  alt,
  caption,
  priority = false,
  source,
  className,
}: MediaProps): ReactElement {
  const spec = mediaSlot(slot);
  if (priority && !spec.aboveFold) {
    throw new Error(
      `media slot \`${slot}\` is never above the fold and cannot be the page's priority image (plan/01 §6)`,
    );
  }
  if (source !== undefined) {
    // Unreachable in Phase 0 and deliberately loud: there is no image store (ADR-0015), so the
    // only way to honour a `source` today would be to invent a URL. Spec 006 replaces this
    // branch with `<Image>`; `alt`, `sizes`, the box and the loader seam are already decided.
    throw new Error(
      `no image store in Phase 0: \`Media\` cannot render \`${source.src}\` (ADR-0015; spec 006 lands imagery)`,
    );
  }

  return (
    <Photo
      ratio={spec.ratio}
      {...(caption === undefined ? {} : { caption })}
      {...(className === undefined ? {} : { className })}
      // The alt text and the `sizes` string travel with the box even while there is no image, so
      // a slot that reaches spec 006 without per-locale copy is visible in a grep of the call
      // sites — and in the e2e assertion — rather than in a screen reader.
      dataset={{
        "data-fo-media-alt": alt,
        "data-fo-media-slot": slot,
        "data-fo-media-sizes": spec.sizes,
      }}
    />
  );
}
