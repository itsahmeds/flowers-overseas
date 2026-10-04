/**
 * `GET /api/send/{locale}` — the sentence picker's route (spec 004 §14 **A21 clause 4**, T-12,
 * AC-11; TASK-177), called as a handler against the committed catalogue: no server, no database.
 *
 * Each case asserts the one `Location` the route must answer, plus the response contract every
 * answer shares — 303, `Cache-Control: no-store`, `X-Robots-Tag: noindex`.
 */
import { describe, expect, it } from "vitest";

import { GET } from "../../src/app/api/send/[locale]/route.ts";

async function send(locale: string, search: string): Promise<Response> {
  return GET(
    new Request(`https://flowersoverseas.test/api/send/${locale}?${search}`),
    {
      params: Promise.resolve({ locale }),
    },
  );
}

describe("GET /api/send/{locale}", () => {
  it("lands PL + birthday on Poland's birthday page, with no query string (T-12)", async () => {
    const response = await send("pl", "country=PL&occasion=birthday");

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "/pl/polska/kwiaty/kwiaty-na-urodziny",
    );
  });

  it("answers no-store and noindex on every response", async () => {
    for (const search of ["country=PL&occasion=birthday", "country=XX", ""]) {
      const response = await send("en", search);
      expect(response.headers.get("cache-control"), search).toBe("no-store");
      expect(response.headers.get("x-robots-tag"), search).toBe("noindex");
    }
  });

  it("lands a seasonal occasion on the country occasion page, and the rest on the shop root", async () => {
    expect(
      (await send("en", "country=PL&occasion=anniversary")).headers.get(
        "location",
      ),
    ).toBe("/en/poland/flowers/anniversary-flowers");
    expect(
      (await send("en", "country=PL&occasion=nameDay")).headers.get("location"),
    ).toBe("/en/poland/flowers");
    expect((await send("de", "country=PL")).headers.get("location")).toBe(
      "/de/polen/blumen",
    );
  });

  it("sends unknown and not-yet countries to the destinations hub", async () => {
    for (const search of [
      "country=XX&occasion=birthday",
      "country=DE&occasion=birthday",
      "country=",
      "x=1",
    ]) {
      const response = await send("en", search);
      expect(response.status, search).toBe(303);
      expect(response.headers.get("location"), search).toBe(
        "/en/send-flowers-to",
      );
    }
  });

  it("never echoes a submitted value, and ignores a relationship", async () => {
    const response = await send("en", "country=PL&occasion=birthday&who=mum");
    const location = response.headers.get("location") ?? "";

    expect(location).toBe("/en/poland/flowers/birthday-flowers");
    expect(location).not.toContain("?");
    expect(location).not.toContain("mum");
  });

  it("is 404 for a locale the site does not route", async () => {
    const response = await send("fr", "country=PL");

    expect(response.status).toBe(404);
    expect(response.headers.get("location")).toBeNull();
  });
});
