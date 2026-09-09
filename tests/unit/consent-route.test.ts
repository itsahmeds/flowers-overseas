/**
 * `POST /api/consent` — the contract (spec 004 §5.2, §8, AC-19, AC-22; TASK-050).
 *
 * The route file under `src/app/` is three lines; everything worth asserting lives in
 * `src/lib/consent.ts` and is asserted here without a server, the same shape as
 * `tests/unit/csp-report-route.test.ts`.
 *
 * The compliance half is the reason this file is long: §8 says the consent record carries an
 * unlinkable `cid`, a timestamp, the categories and the policy version and **nothing else**, so
 * the tests below do not merely check that the right fields are logged — they hand the handler a
 * request stuffed with an IP header, a user agent, a `Referer` and a page URL, and assert that
 * none of those strings can be found anywhere in what was written.
 */
import { describe, expect, it, vi } from "vitest";

import {
  CONSENT_HEADERS,
  CONSENT_MAX_BYTES,
  CONSENT_POLICY_VERSION,
  ConsentDecisionSchema,
  type ConsentSink,
  consentResponse,
  logConsentSink,
} from "../../src/lib/consent";
import { createLogger } from "../../src/lib/logger";

const CID = "6f1e6e6a-1d3a-4b5e-9c2f-8f0a1b2c3d4e";

const decision = {
  cid: CID,
  policyVersion: CONSENT_POLICY_VERSION,
  analytics: true,
  marketing: false,
  decidedAt: "2026-09-09T10:00:00.000Z",
} as const;

/** Headers a browser sends that this endpoint must never read (§8). */
const NOSY_HEADERS = {
  "content-type": "application/json",
  "user-agent": "Mozilla/5.0 (marker-ua)",
  referer:
    "https://flowersoverseas.com/de/blumen-versenden-nach/polen?q=marker-referer",
  "x-forwarded-for": "203.0.113.7",
  "accept-language": "de-DE,de;q=0.9",
  cookie: "fo_locale=de; marker=cookie",
} as const;

function request(body: unknown, init: RequestInit = {}): Request {
  return new Request(
    "https://flowersoverseas.com/api/consent?page=/de/marker-url",
    {
      method: "POST",
      headers: NOSY_HEADERS,
      body: typeof body === "string" ? body : JSON.stringify(body),
      ...init,
    },
  );
}

function recordingSink(): { sink: ConsentSink; calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    sink: {
      record(input) {
        calls.push(input);
        return Promise.resolve();
      },
    },
  };
}

describe("ConsentDecisionSchema (spec 004 §5.2)", () => {
  it("accepts the five fields and nothing more", () => {
    expect(ConsentDecisionSchema.parse(decision)).toEqual(decision);
    expect(
      ConsentDecisionSchema.safeParse({ ...decision, ip: "203.0.113.7" })
        .success,
    ).toBe(false);
  });

  it("refuses a non-uuid cid, so the record cannot carry a chosen identifier", () => {
    for (const cid of ["", "abc", "user@example.com", CID.replace("-", "")]) {
      expect(
        ConsentDecisionSchema.safeParse({ ...decision, cid }).success,
        cid,
      ).toBe(false);
    }
  });

  it("refuses a missing, fractional or non-numeric policy version", () => {
    for (const policyVersion of [undefined, 1.5, "1", -1]) {
      expect(
        ConsentDecisionSchema.safeParse({ ...decision, policyVersion }).success,
        String(policyVersion),
      ).toBe(false);
    }
  });

  it("refuses a non-boolean category and a non-ISO timestamp", () => {
    expect(
      ConsentDecisionSchema.safeParse({ ...decision, analytics: "yes" })
        .success,
    ).toBe(false);
    expect(
      ConsentDecisionSchema.safeParse({ ...decision, marketing: 1 }).success,
    ).toBe(false);
    for (const decidedAt of ["2026-09-09", "yesterday", ""]) {
      expect(
        ConsentDecisionSchema.safeParse({ ...decision, decidedAt }).success,
        decidedAt,
      ).toBe(false);
    }
  });
});

describe("logConsentSink (spec 004 §8, §11)", () => {
  it("writes one line with the cid, the timestamp, the categories and the policy version", async () => {
    const lines: string[] = [];
    const sink = logConsentSink(
      createLogger({ write: (line) => lines.push(line), level: "info" }),
    );

    await sink.record(decision);

    expect(lines).toHaveLength(1);
    const written = JSON.parse(lines[0] ?? "{}") as Record<string, unknown>;
    expect(written["cid"]).toBe(CID);
    expect(written["policy_version"]).toBe(CONSENT_POLICY_VERSION);
    expect(written["analytics"]).toBe(true);
    expect(written["marketing"]).toBe(false);
    expect(written["decided_at"]).toBe(decision.decidedAt);
    // Exactly these fields, plus the logger's own three (`level`, `time`, `msg`).
    expect(Object.keys(written).sort()).toEqual([
      "analytics",
      "cid",
      "decided_at",
      "level",
      "marketing",
      "msg",
      "policy_version",
      "time",
    ]);
  });
});

describe("consentResponse (AC-19)", () => {
  it("answers 204 on a valid decision and hands it to the sink", async () => {
    const { sink, calls } = recordingSink();

    const response = await consentResponse(request(decision), { sink });

    expect(response.status).toBe(204);
    expect(calls).toEqual([decision]);
  });

  it("is never cached and never indexable", async () => {
    const { sink } = recordingSink();
    const response = await consentResponse(request(decision), { sink });

    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    expect(CONSENT_HEADERS["cache-control"]).toBe("no-store");
  });

  it("refuses a method other than POST with 405 and an `Allow` header", async () => {
    const { sink, calls } = recordingSink();
    for (const method of ["GET", "PUT", "DELETE"]) {
      const response = await consentResponse(
        new Request("https://flowersoverseas.com/api/consent", { method }),
        { sink },
      );
      expect(response.status, method).toBe(405);
      expect(response.headers.get("allow"), method).toBe("POST");
    }
    expect(calls).toEqual([]);
  });

  it("refuses a content type that is not JSON with 415", async () => {
    const { sink, calls } = recordingSink();
    for (const contentType of [
      "text/plain",
      "application/x-www-form-urlencoded",
      "",
    ]) {
      const response = await consentResponse(
        request(decision, { headers: { "content-type": contentType } }),
        { sink },
      );
      expect(response.status, contentType).toBe(415);
    }
    expect(calls).toEqual([]);
  });

  it("accepts `application/json` with a charset parameter", async () => {
    const { sink } = recordingSink();
    const response = await consentResponse(
      request(decision, {
        headers: { "content-type": "application/json; charset=utf-8" },
      }),
      { sink },
    );
    expect(response.status).toBe(204);
  });

  it("answers 400 on a body that is not a valid decision, and logs only a count", async () => {
    const lines: string[] = [];
    const logger = createLogger({
      write: (line) => lines.push(line),
      level: "info",
    });
    const { sink, calls } = recordingSink();

    for (const body of [
      "not json at all",
      JSON.stringify({}),
      JSON.stringify({ ...decision, cid: "nope" }),
      JSON.stringify([decision]),
    ]) {
      const response = await consentResponse(request(body), { sink, logger });
      expect(response.status, body).toBe(400);
    }

    expect(calls).toEqual([]);
    expect(lines).toHaveLength(4);
    for (const line of lines) {
      const written = JSON.parse(line) as Record<string, unknown>;
      expect(written["consent_invalid"]).toBe(1);
      // Not the body, not a zod message quoting it: a count and nothing else.
      expect(Object.keys(written).sort()).toEqual([
        "consent_invalid",
        "level",
        "msg",
        "time",
      ]);
    }
  });

  it("answers 413 without reading a body that declares more than the cap", async () => {
    const { sink, calls } = recordingSink();
    const response = await consentResponse(
      request(decision, {
        headers: {
          "content-type": "application/json",
          "content-length": String(CONSENT_MAX_BYTES + 1),
        },
      }),
      { sink },
    );
    expect(response.status).toBe(413);
    expect(calls).toEqual([]);
  });

  it("answers 500 and logs a failure when the sink cannot record (spec 002's table can)", async () => {
    const lines: string[] = [];
    const logger = createLogger({
      write: (line) => lines.push(line),
      level: "info",
    });
    const failing: ConsentSink = {
      record: () => Promise.reject(new Error("marker-sink-failure")),
    };

    const response = await consentResponse(request(decision), {
      sink: failing,
      logger,
    });

    expect(response.status).toBe(500);
    expect(lines.join("\n")).toContain("consent_sink_failed");
    // Not the error message either: a counter, because a sink error can quote its input.
    expect(lines.join("\n")).not.toContain("marker-sink-failure");
  });

  it("reads no IP, user agent, `Referer`, cookie or page URL — none of them can be logged (§8)", async () => {
    const lines: string[] = [];
    const logger = createLogger({
      write: (line) => lines.push(line),
      level: "info",
    });
    const { sink, calls } = recordingSink();
    const req = request(decision);
    const headerSpy = vi.spyOn(req.headers, "get");

    await consentResponse(req, { sink, logger });
    await consentResponse(request("nonsense"), { sink, logger });

    const read = headerSpy.mock.calls.map(([name]) =>
      String(name).toLowerCase(),
    );
    expect(read).not.toContain("user-agent");
    expect(read).not.toContain("referer");
    expect(read).not.toContain("x-forwarded-for");
    expect(read).not.toContain("cookie");
    expect(read).not.toContain("accept-language");
    // The two it *does* read, and nothing else.
    expect([...new Set(read)].sort()).toEqual([
      "content-length",
      "content-type",
    ]);

    const written = lines.join("\n") + JSON.stringify(calls);
    for (const marker of [
      "marker-ua",
      "marker-referer",
      "marker-url",
      "marker=cookie",
      "203.0.113.7",
      "de-DE",
    ]) {
      expect(written, marker).not.toContain(marker);
    }
  });

  it("defaults to the log sink, so a route that forgets to pass one still records", async () => {
    const lines: string[] = [];
    const logger = createLogger({
      write: (line) => lines.push(line),
      level: "info",
    });
    const response = await consentResponse(request(decision), { logger });

    expect(response.status).toBe(204);
    expect(lines.join("\n")).toContain(CID);
  });

  it("records a decision that names an older policy version rather than refusing it", async () => {
    const { sink, calls } = recordingSink();
    const response = await consentResponse(
      request({ ...decision, policyVersion: CONSENT_POLICY_VERSION }),
      { sink },
    );
    expect(response.status).toBe(204);
    expect(calls).toHaveLength(1);
    expect(CONSENT_POLICY_VERSION).toBeGreaterThanOrEqual(1);
  });
});

describe("the route file stays thin (plan/01 §5)", () => {
  it("exports POST and delegates to the contract", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const source = readFileSync(
      resolve(__dirname, "../../src/app/api/consent/route.ts"),
      "utf8",
    );
    expect(source).toContain("consentResponse");
    expect(source).toContain("export const dynamic");
    expect(source).not.toContain("ConsentDecisionSchema");
  });
});
