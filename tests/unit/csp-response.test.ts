/**
 * The per-document Content-Security-Policy (spec 004 §14 A2, AC-23 enforcement half, ADR-0016;
 * TASK-058): the hashing rule, the policy composition, the manifest read-back, the stamp on a
 * cache entry, and the cache handler over Next's real `FileSystemCache` on a temporary
 * directory.
 *
 * The browser half — that a real build hydrates under the enforced header and that an injected
 * inline script is refused — is `tests/e2e/csp-enforced.spec.ts`. This file pins what a browser
 * cannot tell us cheaply: which `<script>` elements are hashed and which are not, and that a
 * report-only server sends no enforcing header whatever an entry was written with.
 */
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { nodeFs } from "next/dist/server/lib/node-fs-methods.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import CspCacheHandler from "../../src/lib/csp-cache-handler.ts";
import {
  CSP_HEADER,
  CSP_REPORT_ONLY_HEADER,
  cspEnforced,
  inlineScriptHashes,
  stampCspHeaders,
  staticPolicyFromRoutesManifest,
  withScriptHashes,
} from "../../src/lib/csp-response.ts";
import { cspValue } from "../../src/lib/csp";
import { cspReportOnly } from "../../src/lib/env.schema";

const sha = (text: string): string =>
  `sha256-${createHash("sha256").update(text, "utf8").digest("base64")}`;

const BOOTSTRAP = "window.dataLayer=window.dataLayer||[];";
const FLIGHT_A = 'self.__next_f.push([1,"0:{\\"a\\":1}"])';
const FLIGHT_B = 'self.__next_f.push([1,"1:\\"$Sreact.fragment\\""])';

/** The shape of a Next 16 document: bootstrap, JSON-LD, external chunk, flight blocks. */
const DOCUMENT = [
  "<!DOCTYPE html><html><head>",
  `<script id="fo-consent-mode">${BOOTSTRAP}</script>`,
  '<script type="application/ld+json">{"@context":"https://schema.org"}</script>',
  '<script src="/_next/static/chunks/main.js" async=""></script>',
  "</head><body><main>hi</main>",
  `<script>${FLIGHT_A}</script>`,
  `<script>${FLIGHT_B}</script>`,
  "</body></html>",
].join("");

const STATIC_POLICY = cspValue("production", {
  inlineHashes: [sha(BOOTSTRAP)],
});

describe("inlineScriptHashes", () => {
  it("hashes every inline executable script, in document order, over its exact bytes", () => {
    expect(inlineScriptHashes(DOCUMENT)).toEqual([
      sha(BOOTSTRAP),
      sha(FLIGHT_A),
      sha(FLIGHT_B),
    ]);
  });

  it("skips external scripts and JSON-LD, which `script-src` hashes do not govern", () => {
    expect(
      inlineScriptHashes(
        '<script src="/a.js"></script><script type="application/ld+json">{}</script>' +
          "<script type='text/plain'>x</script>",
      ),
    ).toEqual([]);
  });

  it("hashes the executable types, case-insensitively, and an empty body", () => {
    expect(
      inlineScriptHashes(
        '<SCRIPT type="module">m()</SCRIPT><script type=text/javascript>j()</script ><script></script>',
      ),
    ).toEqual([sha("m()"), sha("j()"), sha("")]);
  });

  it("does not trim or normalise: whitespace is part of the digest", () => {
    expect(inlineScriptHashes("<script> a() \n</script>")).toEqual([
      sha(" a() \n"),
    ]);
    expect(inlineScriptHashes("<script> a() \n</script>")).not.toEqual([
      sha("a()"),
    ]);
  });

  it("lists a repeated script once", () => {
    expect(
      inlineScriptHashes("<script>x()</script><p></p><script>x()</script>"),
    ).toEqual([sha("x()")]);
  });

  it("hashes multi-byte text as UTF-8, as the browser does", () => {
    const text = 'self.__next_f.push([1,"Łódź – Köln"])';
    expect(inlineScriptHashes(`<script>${text}</script>`)).toEqual([
      `sha256-${createHash("sha256").update(Buffer.from(text, "utf8")).digest("base64")}`,
    ]);
  });
});

describe("withScriptHashes", () => {
  it("appends quoted hashes to `script-src` and leaves every other directive alone", () => {
    const policy = withScriptHashes(STATIC_POLICY, [sha(FLIGHT_A)]);
    expect(policy).toBe(
      STATIC_POLICY.replace(
        `script-src 'self' '${sha(BOOTSTRAP)}'`,
        `script-src 'self' '${sha(BOOTSTRAP)}' '${sha(FLIGHT_A)}'`,
      ),
    );
  });

  it("does not repeat a hash the static policy already names", () => {
    const policy = withScriptHashes(STATIC_POLICY, [sha(BOOTSTRAP)]) ?? "";
    expect(policy.split(sha(BOOTSTRAP))).toHaveLength(2);
  });

  it("never adds 'unsafe-inline' or 'unsafe-eval'", () => {
    const policy =
      withScriptHashes(STATIC_POLICY, inlineScriptHashes(DOCUMENT)) ?? "";
    expect(policy).not.toContain("'unsafe-eval'");
    const scriptSrc = policy
      .split(";")
      .find((part) => part.trim().startsWith("script-src"));
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });

  it("refuses to guess when there is no `script-src` to extend", () => {
    expect(withScriptHashes("default-src 'self';", [sha("x")])).toBeUndefined();
  });
});

describe("staticPolicyFromRoutesManifest", () => {
  it("reads the Report-Only value next.config.ts compiled into the manifest", () => {
    expect(
      staticPolicyFromRoutesManifest({
        headers: [
          {
            source: "/media/:p*",
            headers: [{ key: "Cache-Control", value: "x" }],
          },
          {
            source: "/:path*",
            headers: [
              { key: "X-Frame-Options", value: "DENY" },
              { key: CSP_REPORT_ONLY_HEADER, value: STATIC_POLICY },
            ],
          },
        ],
      }),
    ).toBe(STATIC_POLICY);
  });

  it("is undefined for a manifest without one, or not a manifest at all", () => {
    expect(staticPolicyFromRoutesManifest({ headers: [] })).toBeUndefined();
    expect(staticPolicyFromRoutesManifest({})).toBeUndefined();
    expect(staticPolicyFromRoutesManifest(null)).toBeUndefined();
    expect(staticPolicyFromRoutesManifest("x")).toBeUndefined();
  });
});

describe("cspEnforced", () => {
  it("enforces on the exact string `false` only, the mirror of cspReportOnly()", () => {
    for (const value of [undefined, "", "true", "False", "0", "no"]) {
      const source = value === undefined ? {} : { CSP_REPORT_ONLY: value };
      expect(cspEnforced(source), String(value)).toBe(false);
      expect(cspReportOnly(source), String(value)).toBe(true);
    }
    expect(cspEnforced({ CSP_REPORT_ONLY: "false" })).toBe(true);
    expect(cspReportOnly({ CSP_REPORT_ONLY: "false" })).toBe(false);
  });
});

describe("stampCspHeaders", () => {
  const page = (headers: Record<string, string> = {}) => ({
    kind: "APP_PAGE",
    html: DOCUMENT,
    headers,
  });

  it("enforcing: the static policy plus this document's hashes, other headers kept", () => {
    const value = page({ "x-next-cache-tags": "_N_T_/en" });
    expect(
      stampCspHeaders(value, { staticPolicy: STATIC_POLICY, enforce: true }),
    ).toBe(true);
    expect(value.headers).toEqual({
      "x-next-cache-tags": "_N_T_/en",
      [CSP_HEADER]: withScriptHashes(STATIC_POLICY, [
        sha(BOOTSTRAP),
        sha(FLIGHT_A),
        sha(FLIGHT_B),
      ]),
    });
  });

  it("report-only: no CSP on the entry, and a stale one from an earlier write is removed", () => {
    const value = page({
      "content-security-policy": "stale",
      [CSP_REPORT_ONLY_HEADER]: "stale",
      "x-keep": "1",
    });
    expect(
      stampCspHeaders(value, { staticPolicy: STATIC_POLICY, enforce: false }),
    ).toBe(false);
    expect(value.headers).toEqual({ "x-keep": "1" });
  });

  it("fails open when the static policy is unknown: no enforcing header, nothing thrown", () => {
    const value = page();
    expect(
      stampCspHeaders(value, { staticPolicy: undefined, enforce: true }),
    ).toBe(false);
    expect(value.headers).toEqual({});
  });

  it("leaves everything that is not a cached HTML page untouched", () => {
    const route = { kind: "APP_ROUTE", body: Buffer.from("{}"), headers: {} };
    const fetch = { kind: "FETCH", data: {} };
    const streaming = { kind: "APP_PAGE", html: { pipe: true }, headers: {} };
    for (const value of [route, fetch, streaming]) {
      const before = JSON.stringify(value);
      expect(
        stampCspHeaders(value, { staticPolicy: STATIC_POLICY, enforce: true }),
      ).toBe(false);
      expect(JSON.stringify(value)).toBe(before);
    }
    expect(
      stampCspHeaders(null, { staticPolicy: STATIC_POLICY, enforce: true }),
    ).toBe(false);
  });
});

describe("CspCacheHandler over Next's FileSystemCache", () => {
  let dist = "";
  const previous = process.env["CSP_REPORT_ONLY"];

  beforeEach(() => {
    dist = mkdtempSync(join(tmpdir(), "fo-csp-"));
    mkdirSync(join(dist, "server", "app"), { recursive: true });
    writeFileSync(
      join(dist, "routes-manifest.json"),
      JSON.stringify({
        headers: [
          {
            source: "/:path*",
            headers: [{ key: CSP_REPORT_ONLY_HEADER, value: STATIC_POLICY }],
          },
        ],
      }),
    );
  });

  afterEach(() => {
    rmSync(dist, { recursive: true, force: true });
    if (previous === undefined) delete process.env["CSP_REPORT_ONLY"];
    else process.env["CSP_REPORT_ONLY"] = previous;
  });

  const handler = (reportOnly: string | undefined) => {
    if (reportOnly === undefined) delete process.env["CSP_REPORT_ONLY"];
    else process.env["CSP_REPORT_ONLY"] = reportOnly;
    return new CspCacheHandler({
      fs: nodeFs,
      serverDistDir: join(dist, "server"),
      flushToDisk: true,
      dev: false,
    });
  };

  const expected = withScriptHashes(
    STATIC_POLICY,
    inlineScriptHashes(DOCUMENT),
  );

  /** The entry value as the tests read it; the handler's contract types it as `unknown`. */
  const valueOf = (data: { value: unknown } | null) =>
    data?.value as { html?: unknown; headers?: unknown } | undefined;

  it("serves a build-time entry with the enforcing header when the server enforces", async () => {
    // What `next build` leaves: html, rsc and a meta without any CSP.
    writeFileSync(join(dist, "server", "app", "en.html"), DOCUMENT);
    writeFileSync(join(dist, "server", "app", "en.rsc"), "0:{}");
    writeFileSync(
      join(dist, "server", "app", "en.meta"),
      JSON.stringify({ headers: { "x-nextjs-prerender": "1" }, status: 200 }),
    );

    const data = await handler("false").get("/en", {
      kind: "APP_PAGE",
      isRoutePPREnabled: false,
      isFallback: false,
    });
    expect(valueOf(data)?.headers).toEqual({
      "x-nextjs-prerender": "1",
      [CSP_HEADER]: expected,
    });
  });

  it("stamps an entry on `set` — the object the first response is sent from — and on disk", async () => {
    const value = {
      kind: "APP_PAGE",
      html: DOCUMENT,
      rscData: Buffer.from("0:{}"),
      headers: {},
      status: 200,
    };
    await handler("false").set("/de", value, {
      cacheControl: { revalidate: 3600, expire: undefined },
      isRoutePPREnabled: false,
      isFallback: false,
    });
    expect(value.headers).toEqual({ [CSP_HEADER]: expected });
    const meta = JSON.parse(
      readFileSync(join(dist, "server", "app", "de.meta"), "utf8"),
    ) as { headers: Record<string, string> };
    expect(meta.headers[CSP_HEADER]).toBe(expected);
  });

  it("serves no enforcing header from a report-only server, even for an entry written enforcing", async () => {
    const value = {
      kind: "APP_PAGE",
      html: DOCUMENT,
      rscData: Buffer.from("0:{}"),
      headers: {},
      status: 200,
    };
    await handler("false").set("/pl", value, {
      cacheControl: { revalidate: 3600, expire: undefined },
      isRoutePPREnabled: false,
      isFallback: false,
    });
    for (const flag of [undefined, "true"]) {
      const data = await handler(flag).get("/pl", {
        kind: "APP_PAGE",
        isRoutePPREnabled: false,
        isFallback: false,
      });
      expect(valueOf(data)?.headers, String(flag)).toEqual({});
    }
  });

  it("fails open without a routes manifest: the page is served, unenforced", async () => {
    rmSync(join(dist, "routes-manifest.json"));
    writeFileSync(join(dist, "server", "app", "x.html"), DOCUMENT);
    writeFileSync(join(dist, "server", "app", "x.rsc"), "0:{}");
    writeFileSync(
      join(dist, "server", "app", "x.meta"),
      JSON.stringify({ headers: {}, status: 200 }),
    );
    const data = await handler("false").get("/x", {
      kind: "APP_PAGE",
      isRoutePPREnabled: false,
      isFallback: false,
    });
    expect(valueOf(data)?.html).toBe(DOCUMENT);
    expect(valueOf(data)?.headers).toEqual({});
  });
});
