/**
 * The image-space cache promise (spec 006 §2.5 "Cache headers", §5.4; TASK-079, TASK-138).
 *
 * The value is asserted as a **whole string** and against the URL shape the loader produces,
 * because `immutable` for a year is only safe while a variant URL never changes meaning: the two
 * facts are one decision, and drifting either half silently would serve a stale photograph for
 * twelve months.
 *
 * Since TASK-138 the header is no longer a `next.config.ts` rule over `/media/*` — the
 * application serves no image at all — it is metadata written onto each object at upload. So the
 * third assertion here is that the rule really is gone from the config, and
 * `tests/e2e/media-delivery.spec.ts` asserts the header on a real response from the bucket,
 * which the old rule could never be tested for: a 404 in that space correctly answered
 * `no-store`.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { MEDIA_CACHE_CONTROL } from "../../src/lib/media-headers.ts";
import { MEDIA_ORIGIN } from "../../src/lib/media-origin.ts";
import { r2VariantLoader } from "../../src/modules/ui/media/loader.ts";

const repoRoot = resolve(import.meta.dirname, "../..");

describe("MEDIA_CACHE_CONTROL", () => {
  it("caches a variant for a year, immutably", () => {
    expect(MEDIA_CACHE_CONTROL).toBe("public, max-age=31536000, immutable");
  });

  it("covers the URLs the loader actually produces, and they are content-addressed", () => {
    const url = r2VariantLoader({
      assetId: "fo-bq-001-hero",
      width: 640,
      format: "avif",
      objectKey: "media/fo-bq-001-hero/640.avif",
    });

    expect(url).toBe(`${MEDIA_ORIGIN}/media/fo-bq-001-hero/640.avif`);
    // `immutable` is keepable only because the width and the asset version are *in* the key: a
    // changed photograph is a new asset id, never the same key with new bytes.
    expect(url).toContain("/fo-bq-001-hero/");
    expect(url).toContain("640.avif");
  });

  it("is no longer a header rule on this origin, because this origin serves no image", () => {
    const config = readFileSync(resolve(repoRoot, "next.config.ts"), "utf8");

    expect(config).not.toContain("mediaCacheHeaderRules");
    expect(config).not.toContain("/media/:path*");
  });
});
