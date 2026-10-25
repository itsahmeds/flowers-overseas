/**
 * Search's text core (spec 045 §2.3, §2.8; TASK-400): `normaliseForSearch`, `tokenise`, `stem`,
 * `damerauLevenshtein` and the typo allowance. Each case asserts the one output, never a set of
 * acceptable ones.
 */
import { describe, expect, it } from "vitest";

import {
  damerauLevenshtein,
  normaliseForSearch,
  stem,
  tokenise,
  typoAllowance,
} from "../../src/modules/search/index.ts";

describe("normaliseForSearch (§2.3)", () => {
  it.each([
    ["róża", "roza"],
    ["Róże", "roze"],
    ["ROZE", "roze"],
    [" roze ", "roze"],
    ["Kraków", "krakow"],
    ["Wrocław", "wroclaw"],
    ["Łódź", "lodz"],
    ["Strauß", "strauss"],
    ["STRAUẞ", "strauss"],
    ["Strauss", "strauss"],
    ["Maiglöckchen", "maiglockchen"],
    ["Maigloeckchen", "maiglockchen"],
    ["Grüße", "grusse"],
    ["Gruesse", "grusse"],
    ["Æble", "able"],
    ["Søren", "soren"],
    ["Đurđevak", "durdevak"],
    ["FO-BQ-001", "fo bq 001"],
    ["red,  roses!!", "red roses"],
    ["ﬁori", "fiori"],
    ["", ""],
    ["   ", ""],
  ])("%j → %j", (input, expected) => {
    expect(normaliseForSearch(input)).toBe(expected);
  });

  it("turns every non-letter, non-digit into one space (no markup survives)", () => {
    expect(normaliseForSearch('<script>alert("x")</script>')).toBe(
      "script alert x script",
    );
  });
});

describe("tokenise (§2.3)", () => {
  it("drops the request locale's stop words", () => {
    expect(tokenise("flowers for the mum", "en")).toEqual(["flowers", "mum"]);
    expect(tokenise("blumen fur mama und papa", "de")).toEqual([
      "blumen",
      "mama",
      "papa",
    ]);
    expect(tokenise("kwiaty dla mamy i taty", "pl")).toEqual([
      "kwiaty",
      "mamy",
      "taty",
    ]);
    // `en-gb` reads the English list.
    expect(tokenise("roses to the door", "en-gb")).toEqual(["roses", "door"]);
  });

  it("keeps at most 8 tokens", () => {
    expect(tokenise("a b c d e f g h i j k", "de")).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
      "f",
      "g",
      "h",
    ]);
  });

  it("returns no token for an empty string", () => {
    expect(tokenise("", "en")).toEqual([]);
  });
});

describe("stem (§2.3)", () => {
  it.each([
    ["en", "roses", "rose"],
    ["en", "rose", "rose"],
    ["en", "lilies", "lily"],
    ["en", "boxes", "box"],
    ["en", "dishes", "dish"],
    ["en", "glasses", "glass"],
    ["en", "peonies", "peony"],
    ["en-gb", "tulips", "tulip"],
    ["de", "rosen", "ros"],
    ["de", "rose", "ros"],
    ["de", "tulpen", "tulp"],
    ["de", "blumen", "blum"],
    ["de", "strauss", "straus"],
    ["pl", "roze", "roz"],
    ["pl", "roza", "roz"],
    ["pl", "tulipany", "tulipan"],
    ["pl", "tulipanow", "tulipan"],
    ["pl", "tulipan", "tulipan"],
    ["pl", "kwiatami", "kwiat"],
    ["pl", "kwiatach", "kwiat"],
  ])("%s %s → %s", (locale, token, expected) => {
    expect(stem(token, locale)).toBe(expected);
  });

  it("keeps at least 3 letters, or leaves the token whole", () => {
    expect(stem("bus", "en")).toBe("bus");
    expect(stem("ie", "pl")).toBe("ie");
    expect(stem("ose", "de")).toBe("ose");
  });

  it("leaves every token whole in a language with no rules", () => {
    expect(stem("roses", "ar-XB")).toBe("roses");
  });
});

describe("damerauLevenshtein (§2.3)", () => {
  it.each([
    ["tulips", "tulpis", 1, 1],
    ["tulips", "tolaps", 2, 2],
    ["sunflowers", "sunflwers", 2, 1],
    ["orchids", "orchds", 1, 1],
    ["abc", "abc", 2, 0],
    ["abcd", "bacd", 1, 1],
    ["ca", "abc", 3, 3],
    ["", "abc", 3, 3],
  ])("%s ↔ %s within %i is %i", (a, b, max, expected) => {
    expect(damerauLevenshtein(a, b, max)).toBe(expected);
  });

  it("counts an adjacent transposition as one edit (plain Levenshtein says 2)", () => {
    expect(damerauLevenshtein("tulpis", "tulips", 1)).toBe(1);
  });

  it("reports anything beyond the bound as bound + 1", () => {
    expect(damerauLevenshtein("tolaps", "tulips", 1)).toBe(2);
    expect(damerauLevenshtein("roses", "lilies", 2)).toBe(3);
    expect(damerauLevenshtein("a", "abcdef", 2)).toBe(3);
  });

  it("is symmetric", () => {
    expect(damerauLevenshtein("orchds", "orchids", 2)).toBe(
      damerauLevenshtein("orchids", "orchds", 2),
    );
  });
});

describe("typoAllowance (§2.3, §14 A-orchestrator-2026-10-24 item 2)", () => {
  it.each([
    ["rse", 0, 1],
    ["rose", 1, 2],
    ["tulips", 1, 2],
    ["tulipsx", 1, 2],
    ["sunflwrs", 2, 3],
    ["sunflwers", 2, 3],
    ["ab", 0, 0],
  ])("%s: %i, widened %i", (token, normal, widened) => {
    expect(typoAllowance(token)).toBe(normal);
    expect(typoAllowance(token, undefined, true)).toBe(widened);
  });
});
