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
import { brotliDecompressSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import {
  COMPRESSIBLE_TYPES,
  DEFAULT_PORT,
  DEFAULT_UPSTREAM,
  SUBRESOURCE_HEADERS,
  acceptsBrotli,
  brotli,
  createEncoder,
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

describe("an immutable asset is encoded once, a document every time (TASK-427)", () => {
  const STATIC = "public, max-age=31536000, immutable";
  const DOCUMENT = "s-maxage=31536000";

  /** A Brotli encoder that counts its own calls. */
  function counted(): {
    encode: ReturnType<typeof createEncoder>;
    calls: () => number;
  } {
    let calls = 0;
    const encode = createEncoder((body) => {
      calls += 1;
      return brotli(body);
    });
    return { encode, calls: () => calls };
  }

  it("serves the stored bytes for a second request of the same immutable body", () => {
    const { encode, calls } = counted();
    const chunk = Buffer.from(
      "(globalThis.TURBOPACK||=[]).push(1);".repeat(200),
    );
    const first = encode(chunk, STATIC);
    const second = encode(Buffer.from(chunk), STATIC);
    expect(calls()).toBe(1);
    expect(second.equals(first)).toBe(true);
    // The stored bytes are the quality-11 bytes, not some cheaper encoding.
    expect(second.equals(brotli(chunk))).toBe(true);
    expect(brotliDecompressSync(second).equals(chunk)).toBe(true);
  });

  it("encodes a document on every request, at quality 11", () => {
    const { encode, calls } = counted();
    const html = Buffer.from(
      "<!DOCTYPE html><html><body>x</body></html>".repeat(50),
    );
    encode(html, DOCUMENT);
    encode(html, DOCUMENT);
    encode(html, undefined);
    encode(html, null);
    expect(calls()).toBe(4);
    expect(encode(html, DOCUMENT).equals(brotli(html))).toBe(true);
  });

  it("never answers a changed immutable body with the old bytes", () => {
    const { encode, calls } = counted();
    const a = Buffer.from("a".repeat(500));
    const b = Buffer.from("b".repeat(500));
    encode(a, STATIC);
    const out = encode(b, STATIC);
    expect(calls()).toBe(2);
    expect(brotliDecompressSync(out).equals(b)).toBe(true);
  });

  it("reads `immutable` as a directive, not as a substring", () => {
    const { encode, calls } = counted();
    const body = Buffer.from("c".repeat(500));
    encode(body, "public, max-age=0, x-not-immutable");
    encode(body, "public, max-age=0, x-not-immutable");
    expect(calls()).toBe(2);
    encode(body, "public, max-age=31536000, IMMUTABLE");
    encode(body, "public, max-age=31536000, IMMUTABLE");
    expect(calls()).toBe(3);
  });
});
