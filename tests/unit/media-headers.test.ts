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

import { cspValue } from "../../src/lib/csp.ts";
import {
  MEDIA_CACHE_CONTROL,
  MEDIA_PRECONNECT_LINK,
  mediaHeaderRules,
} from "../../src/lib/media-headers.ts";
import { MEDIA_ORIGIN } from "../../src/lib/media-origin.ts";
import { ALL_PATHS } from "../../src/lib/robots-headers.ts";
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

describe("MEDIA_PRECONNECT_LINK", () => {
  it("is a `Link` hint for the media origin and for no other host", () => {
    expect(MEDIA_PRECONNECT_LINK).toBe(`<${MEDIA_ORIGIN}>; rel=preconnect`);
  });

  it("carries no `crossorigin`, so the warmed connection is the one the images use", () => {
    // A connection is reused only by a request whose credentials mode matches. `crossorigin`
    // opens an anonymous connection; the `<img>`/`<source>` elements and the hero preload are
    // credentialed non-CORS fetches, so an anonymous socket would sit unused beside a second one
    // opened for the image — a hint that is present, well-formed and worthless. This assertion
    // is the pair of the absence of `crossOrigin` from `preloadArgsFor()`; if one gains it, this
    // fails until the other does too.
    expect(MEDIA_PRECONNECT_LINK).not.toContain("crossorigin");
    expect(MEDIA_PRECONNECT_LINK).not.toContain("crossOrigin");
  });

  it("is the same origin the policy allows, in every environment", () => {
    // The hint, the image URLs and `img-src` are one constant. A hint to an origin the policy
    // blocked would spend a handshake on bytes the document then refuses to render.
    const hinted = MEDIA_PRECONNECT_LINK.slice(
      1,
      MEDIA_PRECONNECT_LINK.indexOf(">"),
    );

    expect(hinted).toBe(MEDIA_ORIGIN);
    for (const environment of [
      "development",
      "test",
      "preview",
      "staging",
      "production",
    ] as const) {
      expect(cspValue(environment)).toContain(
        `img-src 'self' data: blob: ${hinted};`,
      );
    }
  });
});

describe("mediaHeaderRules()", () => {
  it("sends the hint on every path, in `headers()` shape", () => {
    const rules = mediaHeaderRules();

    expect(rules).toEqual([
      {
        source: ALL_PATHS,
        headers: [{ key: "Link", value: MEDIA_PRECONNECT_LINK }],
      },
    ]);
  });

  it("returns fresh objects, so a caller cannot mutate the next build's headers", () => {
    const first = mediaHeaderRules();
    first[0]?.headers.push({ key: "X-Not-Ours", value: "1" });

    expect(mediaHeaderRules()[0]?.headers).toHaveLength(1);
  });

  it("is wired into the config, on a response rather than into `<head>`", () => {
    // Nothing rendered into `<head>` can be emitted ahead of the hero preload: a rendered
    // `<link rel="preconnect">` is a React hoistable and flushes after `highImagePreloads`, and
    // `preconnect()` from `react-dom` never crosses the RSC boundary under Next at all. The hint
    // is therefore a response header, and this is the assertion that it stayed one.
    const config = readFileSync(resolve(repoRoot, "next.config.ts"), "utf8");

    expect(config).toContain("mediaHeaderRules()");
  });
});
