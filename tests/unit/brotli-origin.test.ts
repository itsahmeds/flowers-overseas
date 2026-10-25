/**
 * `scripts/seo/brotli-origin.ts` — the measurement fixture the blocking `lighthouse` job serves
 * from (spec 004 AC-24, §14 A12; TASK-056).
 *
 * The job's whole claim is that the number it asserts is *this repository's bytes, in the encoding
 * the budget is written in*. Three properties carry that claim, and each one is one bad edit away
 * from making a red gate green or a green gate red, so each is pinned here:
 *
 *  1. Brotli at the CDN's quality, and only for compressible types — re-encoding a WOFF2 or an
 *     AVIF costs CPU and can inflate it, and the image budget is asserted on those same bytes;
 *  2. the encoding is negotiated, not assumed: a client that does not advertise `br` gets identity,
 *     the way a browser without Brotli would;
 *  3. a **document** keeps every header the application sent, and a **subresource** keeps only the
 *     headers that are not inert on it. That is the difference between measuring the application
 *     and measuring HTTP/1.1: 1 318 B of headers per chunk, 774 B of them document-only, is
 *     13 180 B on a locale document — more than the whole remaining budget.
 *
 * The end-to-end behaviour (a real request through the proxy) is exercised by the Lighthouse run
 * itself; what a unit test can hold is the policy above.
 */
import { brotliCompressSync, brotliDecompressSync, constants } from "node:zlib";

import { describe, expect, it } from "vitest";

import {
  COMPRESSIBLE_TYPES,
  DEFAULT_PORT,
  DEFAULT_UPSTREAM,
  SUBRESOURCE_HEADERS,
  acceptsBrotli,
  brotli,
  brotliQuality,
  forwardedHeaders,
  isCompressible,
} from "../../scripts/seo/brotli-origin.ts";

describe("what the origin encodes", () => {
  it("compresses text, JavaScript, JSON, XML and SVG", () => {
    for (const type of [
      "text/html; charset=utf-8",
      "application/javascript; charset=UTF-8",
      "application/json",
      "image/svg+xml",
      "APPLICATION/XML",
    ]) {
      expect(isCompressible(type), type).toBe(true);
    }
  });

  it("leaves already-compressed payloads alone", () => {
    for (const type of [
      "font/woff2",
      "image/avif",
      "image/webp",
      "image/png",
      undefined,
    ]) {
      expect(isCompressible(type), String(type)).toBe(false);
    }
  });

  it("round-trips a body through Brotli", () => {
    const body = Buffer.from("self.__next_f.push([1,'x'])".repeat(64), "utf8");
    const encoded = brotli(body);
    expect(encoded.length).toBeLessThan(body.length);
    expect(brotliDecompressSync(encoded).toString("utf8")).toBe(
      body.toString("utf8"),
    );
  });

  it("encodes a document at the edge's dynamic quality, 4, and every asset at 11 (TASK-411)", () => {
    // Measured 2026-10-25 against production (Cloudflare in front of Railway): `/en`, 222 783 B of
    // HTML, arrives as 28 248 B of Brotli, which is quality 4 (28 216 B), not quality 11
    // (22 039 B, at 183 ms of CPU per request that production never spends).
    expect(brotliQuality("text/html; charset=utf-8")).toBe(4);
    expect(brotliQuality("TEXT/HTML")).toBe(4);
    expect(brotliQuality("application/javascript; charset=UTF-8")).toBe(11);
    expect(brotliQuality("text/css; charset=utf-8")).toBe(11);
    expect(brotliQuality("application/json")).toBe(11);
    expect(brotliQuality(undefined)).toBe(11);

    // The quality reaches the encoder: one body, two different byte strings.
    const body = Buffer.from(
      Array.from(
        { length: 400 },
        (_, i) => `<li class="c${String(i % 37)}">${String(i * 7919)}</li>`,
      ).join(""),
      "utf8",
    );
    const at = (quality: number): Buffer =>
      brotliCompressSync(body, {
        params: { [constants.BROTLI_PARAM_QUALITY]: quality },
      });
    const document = brotli(body, brotliQuality("text/html"));
    const script = brotli(body, brotliQuality("application/javascript"));
    expect(document.equals(at(4))).toBe(true);
    expect(script.equals(at(11))).toBe(true);
    expect(document.equals(script)).toBe(false);
  });

  it("encodes only when the client advertises `br`", () => {
    expect(acceptsBrotli("gzip, deflate, br, zstd")).toBe(true);
    expect(acceptsBrotli("br;q=1.0, gzip;q=0.8")).toBe(true);
    expect(acceptsBrotli("gzip, deflate")).toBe(false);
    expect(acceptsBrotli(undefined)).toBe(false);
    // Not a substring match: `brotli-ish` is not an encoding, and neither is a header that merely
    // contains the two letters.
    expect(acceptsBrotli("x-nobr")).toBe(false);
  });

  it("serves the proxy on localhost in front of `next start`", () => {
    expect(DEFAULT_PORT).toBe(3001);
    expect(DEFAULT_UPSTREAM).toBe("http://localhost:3000");
    expect(COMPRESSIBLE_TYPES).toContain("text/");
  });
});

describe("which headers cross the proxy (§14 A12)", () => {
  const documentType = "text/html; charset=utf-8";
  const scriptType = "application/javascript; charset=UTF-8";

  it("gives a document every header the application sent", () => {
    for (const name of [
      "content-security-policy-report-only",
      "permissions-policy",
      "x-robots-tag",
      "cache-control",
      "reporting-endpoints",
    ]) {
      expect(forwardedHeaders(documentType, name), name).toBe(true);
    }
  });

  it("drops the document-only headers from a subresource, and keeps the rest", () => {
    for (const name of [
      "content-security-policy-report-only",
      "permissions-policy",
      "reporting-endpoints",
      "cross-origin-opener-policy",
      "x-frame-options",
      "referrer-policy",
    ]) {
      expect(forwardedHeaders(scriptType, name), name).toBe(false);
    }
    for (const name of SUBRESOURCE_HEADERS) {
      expect(forwardedHeaders(scriptType, name), name).toBe(true);
    }
  });

  it("keeps the headers a chunk is actually served with", () => {
    // `cache-control` and `etag` are how a second Lighthouse run is served from cache rather than
    // re-downloaded, and `content-type` is what makes it a script in the resource summary at all.
    expect(SUBRESOURCE_HEADERS).toContain("cache-control");
    expect(SUBRESOURCE_HEADERS).toContain("etag");
    expect(SUBRESOURCE_HEADERS).toContain("content-type");
    expect(SUBRESOURCE_HEADERS).toContain("content-encoding");
    // `nosniff` stays: it is about how the byte stream is interpreted, which is not inert.
    expect(SUBRESOURCE_HEADERS).toContain("x-content-type-options");
  });
});
