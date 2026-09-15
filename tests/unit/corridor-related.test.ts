/**
 * T-19 / AC-18 (spec 007 §9, §10; TASK-088): `relatedIso2` is reciprocal across the committed
 * corpus, never names the file's own country, and a target with no page in the locale is omitted
 * from the rendered list rather than linked dead.
 *
 * ## The one clause of AC-18 the corpus cannot satisfy, and why (escalated, TASK-088)
 *
 * AC-18 asks for a *fully* reciprocal graph; spec 007 §5.1 and `CountryLocaleContentSchema` ask
 * for **exactly three** related countries per file; `plan/13` C2 and spec 007 §13 Q1 fix the set
 * at **seven** destinations, all of which have a page in both English locales. Those three
 * requirements cannot all hold at once, and the reason is arithmetic rather than editorial:
 *
 *   a fully reciprocal `relatedIso2` graph is an undirected graph; an undirected graph in which
 *   every vertex has degree 3 has 7 × 3 = 21 edge-ends; every undirected edge contributes two
 *   ends, so the number of edge-ends must be even. 21 is odd. No such graph exists.
 *
 * This is the handshake lemma, and `parityForcedAsymmetry()` below asserts it rather than
 * asserting a claim about our authoring. The corpus is therefore built to the *maximum*
 * reciprocity available — every edge reciprocated except the single one parity forces, in each
 * locale — and this suite pins that, so the one known asymmetry cannot quietly become two. The
 * decision needed (widen `relatedIso2` to 2–3, or reciprocate only where the target has a free
 * slot) is recorded in `docs/tasks/TASK-088.md` §Escalations and in the PR; it is a change to
 * TASK-087's schema and gate, not to content, which is why it is not made here.
 *
 * No database, no network, no clock: the corpus reader and the parser are pure functions of the
 * committed files, and the rendered-list case runs against an injected fake corpus.
 */
import { describe, expect, it } from "vitest";

import { readCorridorCorpus } from "../../src/modules/geo/content/corpus.ts";
import {
  parseCorridorContent,
  splitCorridorFile,
} from "../../src/modules/geo/content/parse.ts";
import {
  countryContentProviderOf,
  withCountryContentProvider,
} from "../../src/modules/geo/content/provider.ts";
import { RELATED_COUNT } from "../../src/modules/geo/content/schemas.ts";
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

/** `A → B` where `B` has a page in the same locale and state but does not name `A` back. */
function oneWayEdges(locale: string): readonly string[] {
  const local = nodes.filter((node) => node.locale === locale);
  return local.flatMap((node) =>
    node.relatedIso2.flatMap((target) => {
      const other = local.find(
        (candidate) =>
          candidate.iso2 === target && candidate.state === node.state,
      );
      if (other === undefined) return [];
      return other.relatedIso2.includes(node.iso2)
        ? []
        : [`${node.iso2}->${target}`];
    }),
  );
}

/**
 * The smallest number of one-way edges a `RELATED_COUNT`-regular graph over `n` pages must carry.
 * Zero when `n * RELATED_COUNT` is even, one when it is odd (the handshake lemma).
 */
function parityForcedAsymmetry(n: number): number {
  return (n * RELATED_COUNT) % 2;
}

describe("relatedIso2 is a graph, not a wish (AC-18, T-19)", () => {
  it("covers both English locales, so the assertions below are not vacuous", () => {
    expect(locales).toStrictEqual(["en", "en-gb"]);
    for (const locale of locales) {
      expect(nodes.filter((node) => node.locale === locale)).toHaveLength(7);
    }
  });

  it("never names the file's own country, in any committed file", () => {
    for (const node of nodes) {
      expect(node.relatedIso2).not.toContain(node.iso2);
      expect(node.relatedIso2).toHaveLength(RELATED_COUNT);
      expect(new Set(node.relatedIso2).size).toBe(RELATED_COUNT);
    }
  });

  it("refuses a file whose relatedIso2 names its own country", () => {
    const base = readCorridorCorpus().find(
      (file) => file.path === "en/pl-guide.md",
    );
    if (base === undefined) throw new Error("the Poland guide is missing");
    const split = splitCorridorFile(base.path, base.source);
    if (!split.ok) throw new Error("the Poland guide does not split");
    const source = renderCorridorFile(
      {
        ...(split.frontmatter as Record<string, unknown>),
        relatedIso2: ["PL", "DE", "NL"],
      },
      split.body,
    );

    const result = parseCorridorContent("en/pl-guide.md", source);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((issue) => issue.field)).toContain("relatedIso2");
    expect(result.issues.map((issue) => issue.message).join("\n")).toContain(
      "own country",
    );
  });

  it("names every target back, except the one asymmetry parity forces", () => {
    // 7 pages x 3 related = 21 edge-ends, which is odd, so exactly one edge in each locale
    // cannot be reciprocated. See this file's header; escalated in docs/tasks/TASK-088.md.
    expect(parityForcedAsymmetry(7)).toBe(1);

    for (const locale of locales) {
      const pages = nodes.filter((node) => node.locale === locale).length;
      expect(oneWayEdges(locale)).toHaveLength(parityForcedAsymmetry(pages));
    }

    // Pinned by name so that the known gap cannot silently move or multiply.
    expect(oneWayEdges("en")).toStrictEqual(["NL->FR"]);
    expect(oneWayEdges("en-gb")).toStrictEqual(["NL->FR"]);
  });

  it("proves no fully reciprocal three-per-page graph over seven pages exists", () => {
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
