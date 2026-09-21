/**
 * `Media`, the slot table and the R2 loader seam (spec 004 §2 "Image conventions", `plan/01` §6,
 * ADR-0014, ADR-0015; TASK-052).
 *
 * The properties asserted here are the ones that must hold **before** spec 006 has any imagery,
 * because they are what make landing imagery a one-branch change rather than a survey:
 *
 *  - every named slot has a `sizes` string and a reserved ratio, and the ratio names are exactly
 *    `Photo`'s, so the box the placeholder reserves is the box the image will fill;
 *  - `Media` renders **no `<img>`** and no `src` anywhere (`plan/10` §3's honesty rule, AC-10);
 *  - `alt` is a required prop with no default — a type-level fact, asserted here as a rendered
 *    one so a later default cannot slip in unnoticed;
 *  - only an above-the-fold slot may be the page's `priority` candidate;
 *  - the loader seam is swappable and its Phase-0 implementation refuses to invent a URL.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { MEDIA_ORIGIN } from "../../src/lib/media-origin.ts";
import { Media } from "../../src/modules/ui/media/Media.tsx";
import {
  getMediaLoader,
  placeholderLoader,
  r2Loader,
  setMediaLoader,
} from "../../src/modules/ui/media/loader.ts";
import {
  MEDIA_SLOTS,
  MEDIA_SLOT_SPECS,
  mediaSlot,
} from "../../src/modules/ui/media/slots.ts";
import { PHOTO_RATIOS } from "../../src/modules/ui/primitives/Photo.tsx";

const CAPTION = "Photography to supply";

describe("the media slot table", () => {
  it("covers every named slot with a `sizes` string and a reserved ratio", () => {
    expect(Object.keys(MEDIA_SLOT_SPECS).sort()).toEqual(
      [...MEDIA_SLOTS].sort(),
    );
    for (const slot of MEDIA_SLOTS) {
      const spec = mediaSlot(slot);
      expect(spec.sizes.length, slot).toBeGreaterThan(0);
      // The ratio names are `Photo`'s, not a second vocabulary.
      expect(PHOTO_RATIOS, slot).toContain(spec.ratio);
    }
  });

  it("gives the hero slot the full viewport and the thumb a fixed pixel width", () => {
    expect(mediaSlot("hero").sizes).toBe("100vw");
    expect(mediaSlot("thumb").sizes).toBe("96px");
  });

  it("describes the grid mobile-first, so the mobile fraction is the fallback", () => {
    for (const slot of ["grid", "tile"] as const) {
      const sizes = mediaSlot(slot).sizes;
      expect(sizes, slot).toMatch(/^\(min-width: \d+px\) \d+vw, \d+vw$/);
    }
  });

  it("marks exactly the two above-the-fold slots as `priority` candidates", () => {
    const eligible = MEDIA_SLOTS.filter((slot) => mediaSlot(slot).aboveFold);
    expect([...eligible]).toEqual(["hero", "grid"]);
  });
});

describe("Media in Phase 0", () => {
  it("renders the gradient placeholder box, its caption and no image at all", () => {
    const html = renderToStaticMarkup(
      <Media alt="" caption={CAPTION} slot="hero" />,
    );

    expect(html).toContain("photo");
    expect(html).toContain(CAPTION);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("src=");
    expect(html).not.toContain("srcset");
  });

  it("records the slot, its `sizes` and the per-locale alt on the reserved box", () => {
    const html = renderToStaticMarkup(
      <Media alt="A florist ties a bouquet" slot="grid" />,
    );

    expect(html).toContain('data-fo-media-slot="grid"');
    expect(html).toContain(`data-fo-media-sizes="${mediaSlot("grid").sizes}"`);
    expect(html).toContain('data-fo-media-alt="A florist ties a bouquet"');
  });

  it("reserves the slot's aspect ratio, so imagery cannot shift the layout", () => {
    const html = renderToStaticMarkup(<Media alt="" slot="thumb" />);
    expect(html).toContain("aspect-square");
  });

  it("refuses `priority` on a slot that is never above the fold", () => {
    expect(() =>
      renderToStaticMarkup(<Media alt="" priority slot="thumb" />),
    ).toThrow(/never above the fold/);
  });

  it("refuses to render a source, because there is no image store yet", () => {
    expect(() =>
      renderToStaticMarkup(
        <Media
          alt=""
          slot="hero"
          source={{ src: "bouquet.jpg", width: 1600, height: 1067 }}
        />,
      ),
    ).toThrow(/no image store in Phase 0/);
  });
});

describe("the loader seam (ADR-0015)", () => {
  afterEach(() => {
    setMediaLoader(r2Loader);
  });

  it("addresses R2 by default, and the refusal still refuses", () => {
    expect(getMediaLoader()).toBe(r2Loader);
    expect(
      getMediaLoader()({
        src: "media/fo-bq-001-hero/640.avif",
        width: 640,
        quality: 75,
      }),
    ).toBe(`${MEDIA_ORIGIN}/media/fo-bq-001-hero/640.avif`);
    // TASK-138 moved where images are served from; it invented none. A caller that asks for the
    // URL of an image nobody derived still gets an error rather than a plausible URL.
    expect(() =>
      placeholderLoader({ src: "bouquet.jpg", width: 800, quality: 75 }),
    ).toThrow(/no derived variant/);
  });

  it("is swapped inside the module and returns the loader it replaced", () => {
    const r2: typeof placeholderLoader = ({ src, width }) =>
      `https://images.example/${src}?w=${String(width)}`;

    const previous = setMediaLoader(r2);

    expect(previous).toBe(r2Loader);
    expect(getMediaLoader()).toBe(r2);
    // Read at call time, not captured at import time: this is the property that makes the swap
    // work regardless of module evaluation order.
    expect(getMediaLoader()({ src: "a.jpg", width: 400, quality: 75 })).toBe(
      "https://images.example/a.jpg?w=400",
    );
  });
});
