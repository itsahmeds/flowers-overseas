/**
 * `searchParamsSchema` (spec 045 §5.2, AC-4; T-04; TASK-402): AC-4's inputs, each mapped to the
 * one output it must give. The shop set and the date rule are handed in as data (two fixture
 * destinations with a shop, one of them taking dates), so nothing here depends on which
 * countries are open today.
 */
import { describe, expect, it } from "vitest";

import { SEARCH_CONFIG } from "../../src/config/search.ts";
import {
  parseQuery,
  searchParamsSchema,
} from "../../src/modules/search/index.ts";

const schema = searchParamsSchema({
  shops: new Set(["pl", "de"]),
  takesDates: (iso2) => iso2 === "de",
});

const parse = (
  raw: Record<string, string | string[] | undefined>,
): ReturnType<typeof schema.parse> => schema.parse(raw);

describe("q (AC-4)", () => {
  it("truncates a 120-letter query to its first 80 code points", () => {
    const q = "r".repeat(120);
    expect(parse({ q }).q).toBe("r".repeat(80));
    expect([...parse({ q }).q]).toHaveLength(SEARCH_CONFIG.maxQueryChars);
  });

  it("never cuts a surrogate pair: 120 astral characters keep 80 whole ones", () => {
    const q = "🌹".repeat(120);
    expect(parse({ q }).q).toBe("🌹".repeat(80));
  });

  it("removes \\u0000 and the zero-width space, leaving the text without them", () => {
    expect(parse({ q: "ro\u0000ses​" }).q).toBe("roses");
    expect(parse({ q: "​roses" }).q).toBe("roses");
  });

  it("applies NFC and trims", () => {
    expect(parse({ q: "  róże  " }).q).toBe("róże");
  });

  it("keeps markup as text (it is escaped when rendered, never parsed)", () => {
    expect(parse({ q: "<script>alert(1)</script>" }).q).toBe(
      "<script>alert(1)</script>",
    );
  });

  it("is empty when absent, and takes the first of a repeated key", () => {
    expect(parse({}).q).toBe("");
    expect(parse({ q: ["roses", "tulips"] }).q).toBe("roses");
  });

  it("keeps the first 8 non-stop-word tokens of a 12-token query (parseQuery)", () => {
    const q =
      "the red roses for a white tulips with pink lilies blue orchids yellow sunflowers green";
    const parsed = parseQuery(parse({ q }).q, "en", []);
    expect(parsed.tokens).toHaveLength(SEARCH_CONFIG.maxTokens);
    expect(parsed.tokens[0]).toBe("red");
  });
});

describe("to (AC-4)", () => {
  it("drops a code with no shop", () => {
    expect(parse({ to: "xx" }).to).toBeUndefined();
    expect(parse({ to: "fr" }).to).toBeUndefined();
  });

  it("folds case: PL is pl", () => {
    expect(parse({ to: "PL" }).to).toBe("pl");
    expect(parse({ to: "pl" }).to).toBe("pl");
  });

  it("drops anything that is not two letters", () => {
    expect(parse({ to: "pol" }).to).toBeUndefined();
    expect(parse({ to: "" }).to).toBeUndefined();
  });
});

describe("page (AC-4: the route's 404)", () => {
  it.each(["11", "0", "1.5", "abc", "-1", "01x", ""])(
    "page=%s is notFound",
    (page) => {
      expect(parse({ page }).page).toBe("notFound");
    },
  );

  it.each([
    ["1", 1],
    ["2", 2],
    ["10", 10],
  ])("page=%s is %d", (page, expected) => {
    expect(parse({ page }).page).toBe(expected);
  });

  it("absent is page 1", () => {
    expect(parse({}).page).toBe(1);
  });
});

describe("unknown keys and date (AC-4)", () => {
  it("drops utm_source: the result equals the same URL without it", () => {
    expect(parse({ q: "roses", to: "pl", utm_source: "x" })).toEqual(
      parse({ q: "roses", to: "pl" }),
    );
  });

  it("drops a date while the destination takes no dates", () => {
    expect(parse({ q: "roses", to: "pl", date: "2026-12-01" }).date).toBe(
      undefined,
    );
  });

  it("drops a date with no destination", () => {
    expect(parse({ q: "roses", date: "2026-12-01" }).date).toBeUndefined();
  });

  it("keeps a valid ISO date for a destination that takes dates, and only a valid one", () => {
    expect(parse({ q: "roses", to: "de", date: "2026-12-01" }).date).toBe(
      "2026-12-01",
    );
    expect(
      parse({ q: "roses", to: "de", date: "2026-02-30" }).date,
    ).toBeUndefined();
    expect(parse({ q: "roses", to: "de", date: "tomorrow" }).date).toBe(
      undefined,
    );
  });
});
