/**
 * The media origin — one configuration point for every image URL and for the CSP that has to
 * allow it (spec 006 §2.6, ADR-0015, ADR-0016; TASK-138).
 *
 * The value itself is deliberately **not** asserted here. It is a public host that the founder
 * can move to a custom domain in one edit, and a test that pinned the literal would fail on the
 * day of that edit for no reason anybody cares about. What is asserted is everything that must
 * stay true whatever the value is: the shape of the origin, the composition of a URL from a
 * manifest `objectKey` (never from a path invented here), and the fact that the policy which
 * allows the images and the loader which addresses them read the **same constant** — a build
 * where those two disagree serves a page whose every photograph is blocked.
 */
import { describe, expect, it } from "vitest";

import { cspValue } from "../../src/lib/csp.ts";
import { MEDIA_ORIGIN, mediaUrl } from "../../src/lib/media-origin.ts";
import {
  r2VariantLoader,
  resolveLoader,
} from "../../src/modules/ui/media/loader.ts";

describe("MEDIA_ORIGIN", () => {
  it("is an https origin with no path and no trailing slash", () => {
    const url = new URL(MEDIA_ORIGIN);

    expect(url.protocol).toBe("https:");
    expect(url.pathname).toBe("/");
    expect(MEDIA_ORIGIN.endsWith("/")).toBe(false);
    expect(MEDIA_ORIGIN).toBe(url.origin);
  });
});

describe("mediaUrl()", () => {
  it("appends the manifest's own object key to the origin", () => {
    expect(mediaUrl("media/fo-bq-001-hero/640.avif")).toBe(
      `${MEDIA_ORIGIN}/media/fo-bq-001-hero/640.avif`,
    );
  });

  it("refuses a key it would have to repair, rather than repairing it", () => {
    expect(() => mediaUrl("/media/fo-bq-001-hero/640.avif")).toThrow(
      /object key/u,
    );
    expect(() => mediaUrl("")).toThrow(/object key/u);
  });
});

describe("the origin is one configuration point", () => {
  it("is the origin the variant loader addresses", () => {
    expect(
      r2VariantLoader({
        assetId: "fo-bq-001-hero",
        width: 640,
        format: "avif",
        objectKey: "media/fo-bq-001-hero/640.avif",
      }),
    ).toBe(`${MEDIA_ORIGIN}/media/fo-bq-001-hero/640.avif`);
    expect(resolveLoader()).toBe(r2VariantLoader);
  });

  it("is the origin every environment's `img-src` allows", () => {
    for (const environment of [
      "development",
      "test",
      "preview",
      "staging",
      "production",
    ] as const) {
      expect(cspValue(environment)).toContain(
        `img-src 'self' data: blob: ${MEDIA_ORIGIN};`,
      );
    }
  });
});
