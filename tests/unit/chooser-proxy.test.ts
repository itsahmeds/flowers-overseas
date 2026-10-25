/**
 * The proxy's half of the country chooser (spec 004 §14 A-founder-2026-10-24a item 3, AC-78,
 * AC-89, AC-90; T-84, T-95; TASK-385): a chooser address is rewritten, never redirected, to the
 * choice route for a choice and to the chooser page for everything else; the proxy itself sets no
 * cookie, and no request header but the path and `to` changes where it goes.
 */
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CHOOSER_ROBOTS,
  chooserAddress,
  chooserHeaderRules,
} from "../../src/lib/chooser-routes";
import { proxy } from "../../src/proxy";

const ORIGIN = "https://example.com";

/** Where the proxy sent a request: the rewrite's path and query, or `null` for none. */
async function rewrite(
  path: string,
  headers: Record<string, string> = {},
): Promise<{ target: string | null; response: Response }> {
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  const response = await proxy(
    new NextRequest(new Request(`${ORIGIN}${path}`, { headers })),
  );
  const header = response.headers.get("x-middleware-rewrite");
  return {
    target: header === null ? null : header.replace(ORIGIN, ""),
    response,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("chooserAddress()", () => {
  it("reads every launch locale's own segment and nothing else", () => {
    expect(chooserAddress("/en/choose-country")).toEqual({
      locale: "en",
      segments: [],
    });
    expect(
      chooserAddress("/en-gb/choose-country/pl/product/vistula-red"),
    ).toEqual({
      locale: "en-gb",
      segments: ["pl", "product", "vistula-red"],
    });
    expect(chooserAddress("/de/land-waehlen/")).toEqual({
      locale: "de",
      segments: [],
    });
    expect(chooserAddress("/pl/wybierz-kraj/kwiaty/roze")).toEqual({
      locale: "pl",
      segments: ["kwiaty", "roze"],
    });
    for (const path of [
      "/en",
      "/en/choose",
      "/de/choose-country",
      "/EN/choose-country",
      "/fr/choose-country",
      "/choose-country",
      "/en/poland/flowers",
    ]) {
      expect(chooserAddress(path), path).toBeUndefined();
    }
  });
});

describe("the proxy routes a chooser address (AC-78)", () => {
  it("sends a choice by button to the choice route", async () => {
    const { target, response } = await rewrite(
      "/en/choose-country/product/vistula-red?to=pl&to=",
    );
    expect(target).toBe("/api/choose/en/pl/product/vistula-red");
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(response.headers.get("location")).toBeNull();
    expect(response.status).toBe(200);
  });

  it("sends a typed name and the path form to the choice route", async () => {
    expect(
      (await rewrite("/en/choose-country/flowers/roses?to=fr&to=Polska"))
        .target,
    ).toBe("/api/choose/en/pl/flowers/roses");
    expect((await rewrite("/en-gb/choose-country/de/price/low")).target).toBe(
      "/api/choose/en-gb/de/price/low",
    );
  });

  it("sends everything else to the chooser page, the query kept", async () => {
    expect(
      (await rewrite("/en/choose-country/product/vistula-red")).target,
    ).toBe("/en/-choose/product/vistula-red");
    expect(
      (await rewrite("/en/choose-country/product/vistula-red?to=Swedn")).target,
    ).toBe("/en/-choose/product/vistula-red?to=Swedn");
    expect((await rewrite("/en/choose-country?to=")).target).toBe(
      "/en/-choose?to=",
    );
  });

  it("leaves every other address alone", async () => {
    for (const path of ["/en", "/en/poland/flowers", "/api/health", "/"]) {
      expect((await rewrite(path)).target, path).toBeNull();
    }
  });

  it("goes the same way whatever the geography, language, cookie or agent headers say (AC-89)", async () => {
    for (const path of [
      "/en/choose-country/product/vistula-red?to=pl",
      "/en/choose-country/product/vistula-red",
      "/en/choose-country/fr/occasions/birthday",
    ]) {
      const plain = (await rewrite(path)).target;
      for (const headers of [
        { "cf-ipcountry": "DE" },
        { "x-forwarded-for": "81.2.69.160" },
        { "accept-language": "pl-PL,pl;q=0.9" },
        { cookie: "fo_dest=ro; fo_locale=de" },
        { "user-agent": "Googlebot/2.1 (+http://www.google.com/bot.html)" },
      ]) {
        expect(
          (await rewrite(path, headers)).target,
          JSON.stringify(headers),
        ).toBe(plain);
      }
    }
  });
});

describe("chooserHeaderRules(): noindex, nofollow on every chooser address", () => {
  it("covers each launch locale's segment and the internal route", () => {
    const sources = chooserHeaderRules().map((rule) => rule.source);
    expect(sources).toContain("/:locale(en)/:segment(choose-country)/:path*");
    expect(sources).toContain("/:locale(de)/:segment(land-waehlen)/:path*");
    expect(sources).toContain("/:locale(pl)/:segment(wybierz-kraj)/:path*");
    expect(sources).toContain("/:locale/-choose/:path*");
    for (const rule of chooserHeaderRules()) {
      expect(rule.headers).toEqual([
        { key: "X-Robots-Tag", value: CHOOSER_ROBOTS },
      ]);
    }
    expect(CHOOSER_ROBOTS).toBe("noindex, nofollow");
  });
});
