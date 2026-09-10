/**
 * `/media/*` cache headers (spec 006 §2.5 "Cache headers", §5.4; TASK-079).
 *
 * The header is asserted as a **whole string** and against the loader's URL shape, because
 * `immutable` for a year is only safe while a variant URL never changes meaning: the two facts
 * are one decision and drifting either half silently would serve a stale photograph for twelve
 * months.
 */
import { describe, expect, it } from "vitest";

import {
  MEDIA_CACHE_CONTROL,
  MEDIA_PATHS,
  mediaCacheHeaderRules,
} from "../../src/lib/media-headers.ts";
import { staticVariantLoader } from "../../src/modules/ui/media/loader.ts";

describe("mediaCacheHeaderRules()", () => {
  it("caches the image space for a year, immutably", () => {
    expect(mediaCacheHeaderRules()).toEqual([
      {
        source: "/media/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ]);
  });

  it("returns fresh objects on every call", () => {
    expect(mediaCacheHeaderRules()[0]).not.toBe(mediaCacheHeaderRules()[0]);
  });

  it("covers the URLs the static loader actually produces", () => {
    const url = staticVariantLoader({
      assetId: "fo-bq-001-hero",
      width: 640,
      format: "avif",
      objectKey: "derived/fo-bq-001-hero/640.avif",
    });

    expect(url).toBe("/media/fo-bq-001-hero/640.avif");
    // `immutable` is keepable only because the width and the asset version are *in* the path.
    expect(url.startsWith(MEDIA_PATHS.replace(":path*", ""))).toBe(true);
    expect(MEDIA_CACHE_CONTROL).toContain("immutable");
  });
});
