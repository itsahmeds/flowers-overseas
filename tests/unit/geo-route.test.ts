/**
 * `GET /api/geo` — the country hint route (spec 003 §14 A14; TASK-119).
 *
 * The route exists because ADR-0006 refuses to let a country anywhere near a page: a localised
 * document must stay byte-identical for every visitor (AC-7, AC-9), so the one lawful way for the
 * suggestion island to learn a country is to ask for it after hydration. That makes this file's
 * job to pin the four promises the amendment and `docs/compliance/ropa.md` make about what comes
 * back — and each of them has a failure case, so each is tested by the failure too:
 *
 *  1. the body carries the country code **and nothing else**;
 *  2. an absent, unplaceable (`XX`) or malformed country is `null`, never a guessed default;
 *  3. the response can never be cached or indexed, and sets no cookie;
 *  4. nothing is logged — asserted by handing the route a request whose every other header
 *     carries a distinctive marker and checking that the marker reaches neither the body nor any
 *     console stream.
 */
import { describe, expect, it, vi } from "vitest";

import { GET, dynamic, revalidate } from "../../src/app/api/geo/route.ts";

/** A marker that must never leave the request: an IP-shaped value in every other header. */
const MARKER = "203.0.113.7-do-not-record";

function request(headers: Record<string, string> = {}): Request {
  return new Request("https://flowersoverseas.com/api/geo", {
    headers: {
      "cf-connecting-ip": MARKER,
      "x-forwarded-for": MARKER,
      "user-agent": `Mozilla/5.0 ${MARKER}`,
      ...headers,
    },
  });
}

async function body(response: Response): Promise<unknown> {
  return response.json();
}

describe("the country it reports", () => {
  it("answers the Cloudflare country in front of the Railway replica", async () => {
    const response = GET(request({ "cf-ipcountry": "DE" }));

    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({ country: "DE" });
  });

  it("answers the Vercel country on the cold-standby platform (ADR-0018)", async () => {
    expect(await body(GET(request({ "x-vercel-ip-country": "PL" })))).toEqual({
      country: "PL",
    });
  });

  it("carries the country code and nothing else", async () => {
    const parsed = await body(GET(request({ "cf-ipcountry": "GB" })));

    expect(Object.keys(parsed as object)).toEqual(["country"]);
  });

  it.each([
    ["no header at all", {}],
    ["Cloudflare's unplaceable answer", { "cf-ipcountry": "XX" }],
    ["a Tor exit node", { "cf-ipcountry": "T1" }],
    ["a three-letter code", { "cf-ipcountry": "DEU" }],
    ["an empty header", { "cf-ipcountry": "" }],
  ])(
    "answers `null` for %s — never a guessed default",
    async (_name, headers) => {
      expect(await body(GET(request(headers)))).toEqual({ country: null });
    },
  );
});

describe("what the response may never do", () => {
  const response = GET(request({ "cf-ipcountry": "DE" }));

  it("is never cached: `no-store`, and `Vary` on both country headers", () => {
    expect(response.headers.get("cache-control")).toBe("no-store");
    const vary = response.headers.get("vary") ?? "";
    expect(vary).toContain("cf-ipcountry");
    expect(vary).toContain("x-vercel-ip-country");
  });

  it("is never prerendered or revalidated (the segment config)", () => {
    expect(dynamic).toBe("force-dynamic");
    expect(revalidate).toBe(0);
  });

  it("is never indexed and sets no cookie", () => {
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("location")).toBeNull();
  });

  it("answers JSON, so the island can parse it without sniffing", () => {
    expect(response.headers.get("content-type")).toContain("application/json");
  });
});

describe("what the route records — nothing (RoPA: in memory, retention none)", () => {
  it("writes no log line, and no IP or user agent reaches the response", async () => {
    const streams = ["log", "info", "warn", "error", "debug"] as const;
    const spies = streams.map((stream) =>
      vi.spyOn(console, stream).mockImplementation(() => undefined),
    );
    try {
      const response = GET(request({ "cf-ipcountry": "DE" }));
      const text = await response.text();

      expect(text).toBe(JSON.stringify({ country: "DE" }));
      expect(text).not.toContain(MARKER);
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });

  it("imports no logger and no storage: the source names neither", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const source = readFileSync(
      resolve(__dirname, "../../src/app/api/geo/route.ts"),
      "utf8",
    );

    for (const forbidden of ["logger", "cookies(", "db", "sentry"]) {
      expect(source.toLowerCase(), forbidden).not.toContain(
        `from "@/lib/${forbidden}`,
      );
    }
    expect(source).not.toContain("console.");
  });
});
