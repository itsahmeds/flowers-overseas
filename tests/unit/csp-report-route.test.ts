/**
 * T-25, endpoint half (spec 004 AC-23, ADR-0016; TASK-046).
 *
 * AC-23 makes four claims about `POST /api/csp-report` and each one has a failure case, so each is
 * tested by the failure and not only by the happy path:
 *
 *  1. it accepts **both** report shapes — `application/csp-report` and the Reporting-API batch;
 *  2. it logs **only** the directive and the blocked origin;
 *  3. it never logs `document-uri`, `script-sample` or a query string — asserted by feeding a
 *     report whose every discarded field contains a distinctive marker and then asserting the
 *     marker appears in no log line at all, which is stronger than checking the two fields that
 *     *are* logged;
 *  4. it never returns 5xx for a malformed body.
 */
import { describe, expect, it } from "vitest";

import {
  CSP_DIRECTIVES,
  CSP_REPORT_CONTENT_TYPES,
  CSP_REPORT_HEADERS,
  CSP_REPORT_MAX_BYTES,
  CSP_REPORT_RATE_LIMIT,
  CSP_REPORT_WINDOW_MS,
  UNKNOWN_ORIGIN,
  acceptsContentType,
  blockedOrigin,
  createRateLimiter,
  cspReportResponse,
  declaredTooLarge,
} from "../../src/lib/csp-report";
import { createLogger, type Logger } from "../../src/lib/logger";

/** A marker that must never reach a log line, whichever field carries it. */
const SECRET = "recipient-town-and-query-marker";

interface Capture {
  readonly logger: Logger;
  readonly lines: string[];
  readonly text: () => string;
}

function capturingLogger(): Capture {
  const lines: string[] = [];
  return {
    logger: createLogger({
      level: "trace",
      pretty: false,
      write: (line) => lines.push(line),
    }),
    lines,
    text: () => lines.join("\n"),
  };
}

function reportRequest(
  body: unknown,
  contentType: string = CSP_REPORT_CONTENT_TYPES[0],
): Request {
  return new Request("https://example.test/api/csp-report", {
    method: "POST",
    headers: {
      "content-type": contentType,
      // Read by nothing: the handler never touches the request headers beyond the content type.
      "user-agent": `Mozilla/5.0 ${SECRET}`,
      referer: `https://example.test/en?q=${SECRET}`,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** A `report-uri` body whose discarded fields all carry the marker. */
const reportUriBody = {
  "csp-report": {
    "document-uri": `https://example.test/en/send-flowers-to?q=${SECRET}`,
    referrer: `https://example.test/?r=${SECRET}`,
    "violated-directive": "script-src 'self'",
    "effective-directive": "script-src",
    "original-policy": `default-src 'self'; report-uri /api/csp-report?x=${SECRET}`,
    "blocked-uri": `https://evil.test/a/b/c?token=${SECRET}`,
    "source-file": `https://example.test/chunk.js?v=${SECRET}`,
    "line-number": 42,
    "column-number": 7,
    "status-code": 200,
    "script-sample": `alert("${SECRET}")`,
  },
};

/** The Reporting-API batch shape, same idea. */
const reportingApiBody = [
  {
    type: "csp-violation",
    age: 12,
    url: `https://example.test/de?q=${SECRET}`,
    user_agent: `Mozilla/5.0 ${SECRET}`,
    body: {
      documentURL: `https://example.test/de?q=${SECRET}`,
      referrer: `https://example.test/?r=${SECRET}`,
      effectiveDirective: "img-src",
      blockedURL: `https://cdn.evil.test/x.png?t=${SECRET}`,
      sample: SECRET,
      disposition: "report",
      statusCode: 200,
    },
  },
];

describe("content-type gating", () => {
  it("accepts the two content types browsers send, with or without parameters", () => {
    expect(acceptsContentType("application/csp-report")).toBe(true);
    expect(acceptsContentType("application/reports+json")).toBe(true);
    expect(acceptsContentType("application/csp-report; charset=utf-8")).toBe(
      true,
    );
    expect(acceptsContentType("APPLICATION/CSP-REPORT")).toBe(true);
  });

  it("rejects everything else, including plain JSON and a missing header", () => {
    for (const type of [
      "application/json",
      "text/plain",
      "multipart/form-data",
      "",
    ]) {
      expect(acceptsContentType(type), type).toBe(false);
    }
    expect(acceptsContentType(null)).toBe(false);
  });

  it("answers 415 and logs nothing for a wrong content type", async () => {
    const capture = capturingLogger();
    const response = await cspReportResponse(
      reportRequest(reportUriBody, "application/json"),
      { logger: capture.logger },
    );
    expect(response.status).toBe(415);
    expect(capture.lines).toHaveLength(0);
  });
});

describe("blockedOrigin", () => {
  it("keeps the origin and drops the path and the query", () => {
    expect(blockedOrigin("https://evil.test/a/b?token=secret")).toBe(
      "https://evil.test",
    );
    expect(blockedOrigin("https://evil.test:8443/x")).toBe(
      "https://evil.test:8443",
    );
  });

  it("passes the CSP keyword forms through, because they are not URLs", () => {
    for (const keyword of ["inline", "eval", "data", "blob", "wasm-eval"]) {
      expect(blockedOrigin(keyword), keyword).toBe(keyword);
    }
  });

  it("answers `unknown` for an absent or unparsable value", () => {
    expect(blockedOrigin(undefined)).toBe(UNKNOWN_ORIGIN);
    expect(blockedOrigin("")).toBe(UNKNOWN_ORIGIN);
    expect(blockedOrigin("not a url")).toBe(UNKNOWN_ORIGIN);
  });
});

describe("what reaches the log (AC-23)", () => {
  it("logs the directive and the blocked origin of a `report-uri` report", async () => {
    const capture = capturingLogger();
    const response = await cspReportResponse(reportRequest(reportUriBody), {
      logger: capture.logger,
    });
    expect(response.status).toBe(204);
    expect(capture.lines).toHaveLength(1);
    const line = JSON.parse(capture.lines[0] ?? "{}") as Record<
      string,
      unknown
    >;
    expect(line["directive"]).toBe("script-src");
    expect(line["blocked_origin"]).toBe("https://evil.test");
  });

  it("logs the same two fields for a Reporting-API batch", async () => {
    const capture = capturingLogger();
    const response = await cspReportResponse(
      reportRequest(reportingApiBody, "application/reports+json"),
      { logger: capture.logger },
    );
    expect(response.status).toBe(204);
    const line = JSON.parse(capture.lines[0] ?? "{}") as Record<
      string,
      unknown
    >;
    expect(line["directive"]).toBe("img-src");
    expect(line["blocked_origin"]).toBe("https://cdn.evil.test");
  });

  it("logs nothing but those two fields plus the logger's own reserved keys", async () => {
    const capture = capturingLogger();
    await cspReportResponse(reportRequest(reportUriBody), {
      logger: capture.logger,
    });
    expect(
      Object.keys(JSON.parse(capture.lines[0] ?? "{}") as object).sort(),
    ).toEqual(["blocked_origin", "directive", "level", "msg", "time"]);
  });

  it("never writes document-uri, script-sample, a query string or a user agent", async () => {
    const capture = capturingLogger();
    for (const [body, type] of [
      [reportUriBody, CSP_REPORT_CONTENT_TYPES[0]],
      [reportingApiBody, CSP_REPORT_CONTENT_TYPES[1]],
    ] as const) {
      await cspReportResponse(reportRequest(body, type), {
        logger: capture.logger,
      });
    }
    expect(capture.text()).not.toContain(SECRET);
    expect(capture.text()).not.toContain("Mozilla");
    expect(capture.text()).not.toContain("?");
    expect(capture.text()).not.toContain("send-flowers-to");
  });

  it("normalises an unrecognised directive to `other` rather than logging its text", async () => {
    const capture = capturingLogger();
    await cspReportResponse(
      reportRequest({
        "csp-report": { "effective-directive": `evil-${SECRET}` },
      }),
      { logger: capture.logger },
    );
    const line = JSON.parse(capture.lines[0] ?? "{}") as Record<
      string,
      unknown
    >;
    expect(line["directive"]).toBe("other");
    expect(capture.text()).not.toContain(SECRET);
    expect(CSP_DIRECTIVES).toContain("other");
  });

  it("reads the first token of the legacy `violated-directive` form", async () => {
    const capture = capturingLogger();
    await cspReportResponse(
      reportRequest({
        "csp-report": {
          "violated-directive": "style-src-elem 'self' https://x",
        },
      }),
      { logger: capture.logger },
    );
    expect(
      (JSON.parse(capture.lines[0] ?? "{}") as Record<string, unknown>)[
        "directive"
      ],
    ).toBe("style-src-elem");
  });

  it("ignores non-CSP reports in a Reporting-API batch", async () => {
    const capture = capturingLogger();
    await cspReportResponse(
      reportRequest(
        [
          { type: "deprecation", body: { id: SECRET } },
          { type: "csp-violation", body: { effectiveDirective: "font-src" } },
        ],
        CSP_REPORT_CONTENT_TYPES[1],
      ),
      { logger: capture.logger },
    );
    expect(capture.lines).toHaveLength(1);
    expect(capture.text()).toContain("font-src");
    expect(capture.text()).not.toContain(SECRET);
  });
});

describe("it never fails, and it never floods (AC-23)", () => {
  it("answers 204 and counts a malformed body instead of throwing", async () => {
    const capture = capturingLogger();
    for (const body of [
      "not json at all",
      "{}",
      JSON.stringify({ "csp-report": "a string" }),
      JSON.stringify(null),
      JSON.stringify(7),
    ]) {
      const response = await cspReportResponse(reportRequest(body), {
        logger: capture.logger,
      });
      expect(response.status, body).toBe(204);
    }
    expect(capture.text()).toContain("csp_report_invalid");
    expect(capture.text()).not.toContain("not json at all");
  });

  it("answers 2xx for every input, so no report can produce a 5xx", async () => {
    const capture = capturingLogger();
    for (const [body, type] of [
      [reportUriBody, CSP_REPORT_CONTENT_TYPES[0]],
      [reportingApiBody, CSP_REPORT_CONTENT_TYPES[1]],
      ["garbage", CSP_REPORT_CONTENT_TYPES[0]],
      [reportUriBody, "text/plain"],
    ] as const) {
      const response = await cspReportResponse(reportRequest(body, type), {
        logger: capture.logger,
      });
      expect(response.status, type).toBeLessThan(500);
    }
  });

  it("is uncacheable and unindexable", async () => {
    const response = await cspReportResponse(reportRequest(reportUriBody), {
      logger: capturingLogger().logger,
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    expect(CSP_REPORT_HEADERS["cache-control"]).toBe("no-store");
  });

  it("drops reports past the per-minute allowance and lets the next window through", async () => {
    let now = 0;
    const limiter = createRateLimiter(3, 1000, () => now);
    const capture = capturingLogger();
    for (let index = 0; index < 5; index += 1) {
      const response = await cspReportResponse(reportRequest(reportUriBody), {
        logger: capture.logger,
        limiter,
      });
      expect(response.status).toBe(204);
    }
    // Three logged, two dropped silently.
    expect(capture.lines).toHaveLength(3);
    now = 1001;
    await cspReportResponse(reportRequest(reportUriBody), {
      logger: capture.logger,
      limiter,
    });
    expect(capture.lines).toHaveLength(4);
  });

  it("states its allowance in minutes and reports, not in magic numbers", () => {
    expect(CSP_REPORT_WINDOW_MS).toBe(60_000);
    expect(CSP_REPORT_RATE_LIMIT).toBeGreaterThan(0);
  });

  /**
   * `/review 26`, non-blocking note 1: the schemas cap what is *kept*, not what is *parsed*, so a
   * declared body over `CSP_REPORT_MAX_BYTES` is answered without reading it. Asserted by proving
   * the body was never consumed — a `Request` whose body is still unread is the observable fact,
   * and it is what distinguishes the guard from a parse that happens to reject.
   */
  it("answers an oversized declared body without reading it", async () => {
    const capture = capturingLogger();
    const request = new Request("https://example.test/api/csp-report", {
      method: "POST",
      headers: {
        "content-type": CSP_REPORT_CONTENT_TYPES[0],
        "content-length": String(CSP_REPORT_MAX_BYTES + 1),
      },
      body: JSON.stringify(reportUriBody),
    });

    const response = await cspReportResponse(request, {
      logger: capture.logger,
    });

    expect(response.status).toBe(204);
    expect(request.bodyUsed).toBe(false);
    expect(capture.text()).toContain("csp_report_oversized");
    expect(capture.text()).not.toContain("csp violation");
  });

  it("reads a body at the limit, and one that declares no length at all", async () => {
    const capture = capturingLogger();
    const atLimit = new Request("https://example.test/api/csp-report", {
      method: "POST",
      headers: {
        "content-type": CSP_REPORT_CONTENT_TYPES[0],
        "content-length": String(CSP_REPORT_MAX_BYTES),
      },
      body: JSON.stringify(reportUriBody),
    });

    expect(
      (await cspReportResponse(atLimit, { logger: capture.logger })).status,
    ).toBe(204);
    expect(capture.text()).toContain("csp violation");
    // An absent, empty or unparsable declaration is "no declaration", not "too big".
    for (const value of ["", "  ", "not-a-number", "-1"]) {
      expect(declaredTooLarge(value), value).toBe(false);
    }
    expect(declaredTooLarge(null)).toBe(false);
    expect(declaredTooLarge(String(CSP_REPORT_MAX_BYTES + 1))).toBe(true);
  });

  it("caps the parsed body far above a real report and far below a flood", () => {
    // A real `report-uri` body is a few hundred bytes; the cap is generous and still bounded.
    expect(JSON.stringify(reportUriBody).length).toBeLessThan(
      CSP_REPORT_MAX_BYTES,
    );
    expect(CSP_REPORT_MAX_BYTES).toBe(16 * 1024);
  });
});

describe("the route handler is thin (plan/01 §5)", () => {
  it("delegates to @/lib/csp-report and sets no policy of its own", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const source = readFileSync(
      resolve(__dirname, "../../src/app/api/csp-report/route.ts"),
      "utf8",
    );
    expect(source).toContain("cspReportResponse(request)");
    expect(source).toContain('export const dynamic = "force-dynamic"');
    expect(source).not.toContain("z.object");
  });
});
