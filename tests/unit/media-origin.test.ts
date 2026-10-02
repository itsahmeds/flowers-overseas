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
 *
 * **The split (founder, 2026-10-03, option (a)).** The home page's LCP image — the `hero` crop
 * slot, which is `home-hero` — stays on the site's own origin, committed under `public/media/`;
 * every other photograph is served from the bucket. The expectations below are written out per
 * slot rather than read back from `SITE_ORIGIN_MEDIA_SLOTS`, so routing `hero` to the bucket (or
 * any other slot to the site) turns a named case red instead of moving the expectation with it.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { type MediaSlot, mediaSlots } from "../../seed/schema/media.ts";
import { cspValue } from "../../src/lib/csp.ts";
import { MEDIA_ORIGIN, mediaUrl } from "../../src/lib/media-origin.ts";
import {
  r2VariantLoader,
  resolveLoader,
  splitVariantLoader,
  staticVariantLoader,
  variantLoaderForSlot,
} from "../../src/modules/ui/media/loader.ts";
import {
  assetById,
  committedMediaManifest,
} from "../../src/modules/ui/media/manifest.ts";

const repoRoot = resolve(import.meta.dirname, "../..");

/** `""` is the site's own origin: the loader emits a root-relative path, served by this app. */
const SITE_ORIGIN = "";

/** Every seed crop slot and the one origin its variants are served from. */
const EXPECTED_ORIGIN: Readonly<Record<MediaSlot, string>> = {
  hero: SITE_ORIGIN,
  occasionTile: MEDIA_ORIGIN,
  productHero: MEDIA_ORIGIN,
  productDetail: MEDIA_ORIGIN,
  productThumb: MEDIA_ORIGIN,
  context: MEDIA_ORIGIN,
  og: MEDIA_ORIGIN,
};

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

describe("the origin split: the home hero on the site, everything else in the bucket", () => {
  it("is the loader in force", () => {
    expect(resolveLoader()).toBe(splitVariantLoader);
  });

  it("names every seed slot, so a new slot cannot be routed by default without a decision", () => {
    expect(Object.keys(EXPECTED_ORIGIN).sort()).toEqual([...mediaSlots].sort());
  });

  it.each(mediaSlots)("`%s` resolves to exactly its origin", (slot) => {
    const url = variantLoaderForSlot(slot)({
      assetId: "fo-slot-probe",
      width: 640,
      format: "avif",
      objectKey: "media/fo-slot-probe/640.avif",
    });

    expect(url).toBe(`${EXPECTED_ORIGIN[slot]}/media/fo-slot-probe/640.avif`);
  });

  // One real asset per slot the committed dataset populates, through the loader in force — the
  // same call `resolve.ts` makes for the `<picture>` and the preload. The URL is asserted whole.
  it.each([
    ["hero", "home-hero", 828, "/media/home-hero/828.avif"],
    [
      "productHero",
      "fo-bq-001-hero",
      828,
      `${MEDIA_ORIGIN}/media/fo-bq-001-hero/828.avif`,
    ],
    [
      "productDetail",
      "fo-bq-001-detail",
      384,
      `${MEDIA_ORIGIN}/media/fo-bq-001-detail/384.avif`,
    ],
    [
      "occasionTile",
      "home-occasion-birthday",
      384,
      `${MEDIA_ORIGIN}/media/home-occasion-birthday/384.avif`,
    ],
  ] as const)(
    "serves the committed `%s` asset %s from exactly its origin",
    (slot, assetId, width, expected) => {
      const row = committedMediaManifest.variants.find(
        (variant) =>
          variant.assetId === assetId &&
          variant.width === width &&
          variant.format === "avif",
      );

      expect(assetById(assetId)?.slot).toBe(slot);
      expect(row).toBeDefined();
      expect(
        resolveLoader()(
          row ?? { assetId, width, format: "avif", objectKey: "x" },
        ),
      ).toBe(expected);
    },
  );

  it("sends an asset the manifest does not know to the bucket, never to a file nobody committed", () => {
    expect(
      splitVariantLoader({
        assetId: "fo-not-in-the-manifest",
        width: 384,
        format: "webp",
        objectKey: "media/fo-not-in-the-manifest/384.webp",
      }),
    ).toBe(`${MEDIA_ORIGIN}/media/fo-not-in-the-manifest/384.webp`);
  });

  it("points every site-origin URL at a file that is committed under `public/`", () => {
    const hero = committedMediaManifest.variants.filter(
      (variant) => assetById(variant.assetId)?.slot === "hero",
    );

    expect(hero).toHaveLength(10);
    for (const variant of hero) {
      const url = resolveLoader()(variant);
      expect(url).toBe(staticVariantLoader(variant));
      expect(existsSync(resolve(repoRoot, "public", `.${url}`)), url).toBe(
        true,
      );
    }
  });
});
