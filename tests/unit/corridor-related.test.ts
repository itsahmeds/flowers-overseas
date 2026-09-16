/**
 * T-19 / AC-18 (spec 007 §9, §10; TASK-088): `relatedIso2` sits in the 2–3 band, is reciprocal
 * wherever the target has a slot to reciprocate with, never names the file's own country, and a
 * target with no page in the locale is omitted from the rendered list rather than linked dead.
 *
 * ## Why AC-18 needed a ruling, and what it says (spec 007 §14 A3)
 *
 * AC-18 asks for a *fully* reciprocal graph; spec 007 §5.1 originally asked for **exactly three**
 * related countries per file; `plan/13` C2 and §13 Q1 fix the set at **seven** destinations, all of
 * which have a page in both English locales. Those three could not all hold at once, for a reason
 * that is arithmetic rather than editorial:
 *
 *   a fully reciprocal `relatedIso2` graph is an undirected graph; an undirected graph in which
 *   every vertex has degree 3 has 7 × 3 = 21 edge-ends; every undirected edge contributes two
 *   ends, so the number of edge-ends must be even. 21 is odd. No such graph exists.
 *
 * That is the handshake lemma, and `parityForcedAsymmetry()` below asserts it rather than
 * asserting a claim about our authoring. §14 **A3** resolved it: `relatedIso2` is a **2–3 band**,
 * and reciprocity is owed only where the target has a **free slot** — a one-way edge onto a page
 * already naming `RELATED_MAX` others costs that page one of its own authored neighbours, so it is
 * allowed; a one-way edge onto a page with room is an authoring omission, and gate rule 18 fails it.
 *
 * The corpus keeps maximal reciprocity under that ruling: ten reciprocal pairs per locale, every
 * page carrying three neighbours, and a single one-way edge (`NL → FR`) whose target is full. This
 * suite pins the count, the direction and the fullness, so the one permitted asymmetry cannot
 * quietly become two and cannot drift onto a target with a slot going spare.
 *
 * No database, no network, no clock: the corpus reader and the parser are pure functions of the
 * committed files, and the rendered-list case runs against an injected fake corpus.
 */
import { describe, expect, it } from "vitest";

import { readCorridorCorpus } from "../../src/modules/geo/content/corpus-files.ts";
import {
  parseCorridorContent,
  splitCorridorFile,
} from "../../src/modules/geo/content/parse.ts";
import {
  countryContentProviderOf,
  withCountryContentProvider,
} from "../../src/modules/geo/content/provider.ts";
import {
  RELATED_MAX,
  RELATED_MIN,
} from "../../src/modules/geo/content/schemas.ts";
import { relatedCorridorViews } from "../../src/modules/geo/content/view.ts";
import { renderCorridorFile } from "../../scripts/corridor-check-cases.ts";

/** One parsed record of the committed corpus, reduced to what a link decision needs. */
interface Node {
  readonly file: string;
  readonly iso2: string;
  readonly locale: string;
  readonly state: string;
  readonly relatedIso2: readonly string[];
}

const nodes: readonly Node[] = readCorridorCorpus().flatMap((file) => {
  const result = parseCorridorContent(file.path, file.source);
  if (!result.ok)
    throw new Error(`committed file does not parse: ${file.path}`);
  const { iso2, locale, state, relatedIso2 } = result.content;
  return [{ file: file.path, iso2, locale, state, relatedIso2 }];
});

const locales = [...new Set(nodes.map((node) => node.locale))].sort();

/** The committed Poland guide re-rendered with a different `relatedIso2`, and nothing else moved. */
function polandWith(relatedIso2: readonly string[]): string {
  const base = readCorridorCorpus().find(
    (file) => file.path === "en/pl-guide.md",
  );
  if (base === undefined) throw new Error("the Poland guide is missing");
  const split = splitCorridorFile(base.path, base.source);
  if (!split.ok) throw new Error("the Poland guide does not split");
  return renderCorridorFile(
    {
      ...(split.frontmatter as Record<string, unknown>),
      relatedIso2: [...relatedIso2],
    },
    split.body,
  );
}

/** The page for `iso2` in the same locale and state as `node`, or `undefined` if there is none. */
function targetOf(node: Node, iso2: string): Node | undefined {
  return nodes.find(
    (candidate) =>
      candidate.iso2 === iso2 &&
      candidate.locale === node.locale &&
      candidate.state === node.state,
  );
}

/** `A → B` where `B` has a page in the same locale and state but does not name `A` back. */
function oneWayEdges(locale: string): readonly string[] {
  return nodes
    .filter((node) => node.locale === locale)
    .flatMap((node) =>
      node.relatedIso2.flatMap((target) => {
        const other = targetOf(node, target);
        if (other === undefined) return [];
        return other.relatedIso2.includes(node.iso2)
          ? []
          : [`${node.iso2}->${target}`];
      }),
    );
}

/**
 * The smallest number of one-way edges a `RELATED_MAX`-regular graph over `n` pages must carry.
 * Zero when `n * RELATED_MAX` is even, one when it is odd (the handshake lemma).
 */
function parityForcedAsymmetry(n: number): number {
  return (n * RELATED_MAX) % 2;
}

describe("relatedIso2 is a graph, not a wish (AC-18, T-19)", () => {
  it("covers both English locales, so the assertions below are not vacuous", () => {
    expect(locales).toStrictEqual(["en", "en-gb"]);
    for (const locale of locales) {
      expect(nodes.filter((node) => node.locale === locale)).toHaveLength(7);
    }
  });

  it("names two or three distinct others, never the file's own country (§14 A3)", () => {
    expect([RELATED_MIN, RELATED_MAX]).toStrictEqual([2, 3]);
    for (const node of nodes) {
      expect(node.relatedIso2).not.toContain(node.iso2);
      expect(node.relatedIso2.length).toBeGreaterThanOrEqual(RELATED_MIN);
      expect(node.relatedIso2.length).toBeLessThanOrEqual(RELATED_MAX);
      expect(new Set(node.relatedIso2).size).toBe(node.relatedIso2.length);
    }
  });

  it("accepts a page that names two, and refuses one that names one or four", () => {
    const band = (related: readonly string[]): boolean =>
      parseCorridorContent("en/pl-guide.md", polandWith(related)).ok;

    expect(band(["DE", "RO"])).toBe(true);
    expect(band(["DE", "RO", "NL"])).toBe(true);
    expect(band(["DE"])).toBe(false);
    expect(band(["DE", "RO", "NL", "FR"])).toBe(false);

    const tooFew = parseCorridorContent("en/pl-guide.md", polandWith(["DE"]));
    expect(tooFew.ok).toBe(false);
    if (tooFew.ok) return;
    expect(tooFew.issues.map((issue) => issue.message).join("\n")).toContain(
      "2–3 are required",
    );
  });

  it("refuses a file whose relatedIso2 names its own country", () => {
    const result = parseCorridorContent(
      "en/pl-guide.md",
      polandWith(["PL", "DE", "NL"]),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((issue) => issue.field)).toContain("relatedIso2");
    expect(result.issues.map((issue) => issue.message).join("\n")).toContain(
      "own country",
    );
  });

  it("names every target back, except the one asymmetry parity forces", () => {
    // 7 pages x 3 related = 21 edge-ends, which is odd, so at least one edge in each locale
    // cannot be reciprocated. See this file's header; ruled on in spec 007 §14 A3.
    expect(parityForcedAsymmetry(7)).toBe(1);

    for (const locale of locales) {
      const pages = nodes.filter((node) => node.locale === locale).length;
      expect(oneWayEdges(locale)).toHaveLength(parityForcedAsymmetry(pages));
    }

    // Pinned by name so that the known gap cannot silently move or multiply.
    expect(oneWayEdges("en")).toStrictEqual(["NL->FR"]);
    expect(oneWayEdges("en-gb")).toStrictEqual(["NL->FR"]);
  });

  it("lands every one-way edge on a target that is already full (§14 A3)", () => {
    for (const locale of locales) {
      const edges = oneWayEdges(locale);
      // Non-vacuous: the locale really does carry the edge whose target is being checked.
      expect(edges.length).toBeGreaterThan(0);
      for (const edge of edges) {
        const [from, to] = edge.split("->");
        const source = nodes.find(
          (node) => node.locale === locale && node.iso2 === from,
        );
        if (source === undefined || to === undefined) {
          throw new Error(`no page for ${edge}`);
        }
        const target = targetOf(source, to);
        // A free slot on the target would make this edge a gate failure, not a parity cost.
        expect(target?.relatedIso2).toHaveLength(RELATED_MAX);
      }
    }
  });

  it("reciprocates ten pairs per locale — the maximum an odd set allows", () => {
    for (const locale of locales) {
      const pairs = new Set<string>();
      for (const node of nodes.filter((entry) => entry.locale === locale)) {
        for (const iso2 of node.relatedIso2) {
          const other = targetOf(node, iso2);
          if (other === undefined) continue;
          if (!other.relatedIso2.includes(node.iso2)) continue;
          pairs.add([node.iso2, iso2].sort().join("-"));
        }
      }
      // 7 pages x 3 = 21 edge-ends; 10 reciprocal pairs use 20 of them and the 21st is the
      // one-way edge above. Nothing about this graph is left over.
      expect(pairs.size).toBe(10);
    }
  });

  it("proves no fully reciprocal three-per-page graph over seven pages exists", () => {
    // The finding behind §14 A3: "exactly three" and "fully reciprocal" are jointly unsatisfiable
    // over any odd-sized set, which is why the schema carries a band.
    // Exhaustive over every assignment of 3 distinct others to each of 7 vertices would be
    // 35^7 candidates; the handshake lemma settles it in one line, for every odd page count.
    for (const pages of [5, 7, 9, 11]) {
      expect(parityForcedAsymmetry(pages)).toBe(1);
    }
    for (const pages of [4, 6, 8, 10]) {
      expect(parityForcedAsymmetry(pages)).toBe(0);
    }
  });
});

describe("the rendered related list drops what does not exist (AC-18, T-19)", () => {
  /** A corridor file for one country, built from the committed Poland guide. */
  function fileFor(
    path: string,
    iso2: string,
    relatedIso2: readonly string[],
  ): { path: string; source: string } {
    const base = readCorridorCorpus().find(
      (file) => file.path === "en/pl-guide.md",
    );
    if (base === undefined) throw new Error("the Poland guide is missing");
    const split = splitCorridorFile(base.path, base.source);
    if (!split.ok) throw new Error("the Poland guide does not split");
    return {
      path,
      source: renderCorridorFile(
        {
          ...(split.frontmatter as Record<string, unknown>),
          h1: `Sending flowers to ${iso2}`,
          relatedIso2: [...relatedIso2],
        },
        split.body,
      ),
    };
  }

  it("omits a target that has no page in this locale, and keeps authored order", async () => {
    // `PL` names `DE`, `RO` and `NL`; only `DE` and `NL` have been authored in this corpus.
    const fake = countryContentProviderOf([
      fileFor("en/pl-guide.md", "PL", ["DE", "RO", "NL"]),
      fileFor("en/de-guide.md", "DE", ["PL", "RO", "NL"]),
      fileFor("en/nl-guide.md", "NL", ["PL", "DE", "RO"]),
    ]);

    await withCountryContentProvider(fake, () => {
      const related = relatedCorridorViews("PL", "en", "guide");
      expect(related.map((view) => view.iso2)).toStrictEqual(["DE", "NL"]);
      // Not rendered dead, not rendered disabled: absent.
      expect(related.map((view) => view.iso2)).not.toContain("RO");
    });
  });

  it("omits a target authored only in another locale", async () => {
    const fake = countryContentProviderOf([
      fileFor("en/pl-guide.md", "PL", ["DE", "RO", "NL"]),
      fileFor("en-gb/de-guide.md", "DE", ["PL", "RO", "NL"]),
    ]);

    await withCountryContentProvider(fake, () => {
      expect(relatedCorridorViews("PL", "en", "guide")).toStrictEqual([]);
    });
  });

  it("is empty for a country with no page of its own", async () => {
    const fake = countryContentProviderOf([
      fileFor("en/de-guide.md", "DE", ["PL", "RO", "NL"]),
    ]);

    await withCountryContentProvider(fake, () => {
      expect(relatedCorridorViews("ES", "en", "guide")).toStrictEqual([]);
    });
  });

  it("returns the committed neighbours for the real corpus", () => {
    expect(
      relatedCorridorViews("PL", "en", "guide").map((view) => view.iso2),
    ).toStrictEqual(["DE", "RO", "NL"]);
    expect(
      relatedCorridorViews("NL", "en-gb", "guide").map((view) => view.iso2),
    ).toStrictEqual(["PL", "DE", "FR"]);
  });
});
