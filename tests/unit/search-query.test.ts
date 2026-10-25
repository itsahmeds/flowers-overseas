/**
 * `parseQuery` (spec 045 §2.4 item 1, AC-11, T-11; TASK-400): country words in three languages
 * leave the query and set the destination; the first named wins; stop words go; nothing that is
 * not a destination word is consumed. The destination words are test data here, the shape the
 * engine builds from the country registry and the catalogues.
 */
import { describe, expect, it } from "vitest";

import {
  type DestinationWords,
  destinationPhrase,
  parseQuery,
} from "../../src/modules/search/index.ts";

const DESTINATIONS: readonly DestinationWords[] = [
  {
    iso2: "PL",
    phrases: ["Poland", "Polen", "Polska"].map(destinationPhrase),
  },
  {
    iso2: "DE",
    phrases: ["Germany", "Deutschland", "Niemcy"].map(destinationPhrase),
  },
  {
    iso2: "NL",
    phrases: ["the Netherlands", "netherlands", "Niederlande", "Holandia"].map(
      destinationPhrase,
    ),
  },
  { iso2: "RO", phrases: ["Rumänien", "rumaenien"].map(destinationPhrase) },
];

describe("parseQuery (AC-11, T-11)", () => {
  it.each([
    ["en", "flowers to poland", ["flowers"], "PL"],
    ["de", "Blumen nach Polen", ["blumen"], "PL"],
    ["pl", "kwiaty do Polska", ["kwiaty"], "PL"],
    ["pl", "polska", [], "PL"],
    ["en", "POLAND roses", ["roses"], "PL"],
    ["de", "Rosen Deutschland", ["rosen"], "DE"],
    ["en", "tulips the netherlands", ["tulips"], "NL"],
    ["de", "Rumänien", [], "RO"],
    ["de", "rumaenien", [], "RO"],
  ] as const)(
    "%s %j → tokens %j, destination %s",
    (locale, raw, tokens, destination) => {
      const parsed = parseQuery(raw, locale, DESTINATIONS);
      expect(parsed.tokens).toEqual(tokens);
      expect(parsed.destination).toBe(destination);
    },
  );

  it("with no country word the destination is none", () => {
    const parsed = parseQuery("white roses", "en", DESTINATIONS);
    expect(parsed.tokens).toEqual(["white", "roses"]);
    expect(parsed.destination).toBeUndefined();
  });

  it("the first country named wins, and every country word leaves the query", () => {
    const parsed = parseQuery("germany roses poland", "en", DESTINATIONS);
    expect(parsed.destination).toBe("DE");
    expect(parsed.tokens).toEqual(["roses"]);
  });

  it("matches a country word exactly, never by prefix, stem or typo", () => {
    for (const raw of ["polan", "polandia", "poalnd", "polens"]) {
      expect(
        parseQuery(raw, "en", DESTINATIONS).destination,
        raw,
      ).toBeUndefined();
    }
  });

  it("a multi-word name matches only as the whole run", () => {
    expect(parseQuery("netherlands", "en", DESTINATIONS).destination).toBe(
      "NL",
    );
    expect(parseQuery("the", "en", DESTINATIONS).destination).toBeUndefined();
  });

  it("counts letters of the whole normalised query for the too-short test", () => {
    expect(parseQuery("r", "en", DESTINATIONS).letters).toBe(1);
    expect(parseQuery(" ró ", "pl", DESTINATIONS).letters).toBe(2);
    expect(parseQuery("", "en", DESTINATIONS).letters).toBe(0);
  });

  it("keeps at most 8 tokens after the destination words leave", () => {
    const parsed = parseQuery(
      "poland a1 a2 a3 a4 a5 a6 a7 a8 a9",
      "en",
      DESTINATIONS,
    );
    expect(parsed.tokens).toEqual([
      "a1",
      "a2",
      "a3",
      "a4",
      "a5",
      "a6",
      "a7",
      "a8",
    ]);
  });
});
