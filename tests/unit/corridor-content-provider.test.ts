/**
 * T-05 / AC-4 (spec 007 §9, §10; TASK-087): "corridor copy is a data source, not a file layout".
 *
 * A fake `CountryContentProvider` — a country and a locale that have **no committed file at all**
 * — is injected through the hook inside `src/modules/geo/content/provider.ts`, and the view model
 * a corridor page would render changes. That is the whole claim spec 002's
 * `dbCountryContentProvider` and spec 012's admin editor depend on: they replace the body of
 * `getCountryContentProvider()` and no caller changes.
 *
 * AC-4's "with **zero** changes outside `src/modules/geo/`" is asserted literally, in the shape
 * spec 003 AC-5's fifth-locale proof established: every file under `src/` is hashed before and
 * after the fake provider renders, and the two manifests must be identical outside
 * `src/modules/geo/` — and, because this fake writes nothing at all, identical inside it too. The
 * *pre-existing* files of this branch are irrelevant to the claim: the assertion is about what
 * swapping the source costs, not about what the repository contains.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { readCorridorCorpus } from "../../src/modules/geo/content/corpus.ts";
import {
  countryContentProviderOf,
  getCountryContentProvider,
  staticCountryContentProvider,
  withCountryContentProvider,
  type CountryContentProvider,
} from "../../src/modules/geo/content/provider.ts";
import { renderCorridorFile } from "../../scripts/corridor-check-cases.ts";
import {
  corridorContentView,
  listCorridorContent,
} from "../../src/modules/geo/content/view.ts";
import { splitCorridorFile } from "../../src/modules/geo/content/parse.ts";

const repoRoot = resolve(__dirname, "../..");

/** A sha256 per file under `dir`, keyed by repo-relative path. */
function manifest(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) walk(path);
      else {
        out[relative(repoRoot, path)] = createHash("sha256")
          .update(readFileSync(path))
          .digest("hex");
      }
    }
  };
  walk(join(repoRoot, dir));
  return out;
}

/**
 * A corridor file for a (country, locale, state) the corpus does not contain, built from the
 * committed Poland guide so the fake needs no 600-word literal of its own.
 */
function fakeFile(path: string, iso2: string, h1: string): string {
  const base = readCorridorCorpus().find(
    (file) => file.path === "en/pl-guide.md",
  );
  if (base === undefined)
    throw new Error("the committed Poland guide is missing");
  const split = splitCorridorFile(base.path, base.source);
  if (!split.ok) throw new Error("the committed Poland guide does not split");
  const frontmatter = {
    ...(split.frontmatter as Record<string, unknown>),
    h1,
    relatedIso2: ["PL", "DE", "RO"].filter((code) => code !== iso2).slice(0, 3),
  };
  return renderCorridorFile(frontmatter, split.body);
}

describe("the corridor content provider is a seam (AC-4)", () => {
  it("answers from the committed corpus by default", () => {
    expect(getCountryContentProvider()).toBe(staticCountryContentProvider);
    expect(corridorContentView("PL", "en", "guide")?.h1).toBe(
      "Sending flowers to Poland",
    );
    // `de` and `pl` have no corridor copy at all until a native writer delivers it (spec 007
    // §13 Q1), which is the Phase 0 "no page rather than a machine-drafted one" answer. TASK-088
    // filled the `en` and `en-gb` locales, so the absent record asserted here is a locale, not a
    // country.
    expect(corridorContentView("NL", "de", "guide")).toBeUndefined();
  });

  it("renders a different view model behind a fake provider", async () => {
    const fake: CountryContentProvider = countryContentProviderOf([
      {
        path: "en/nl-guide.md",
        source: fakeFile(
          "en/nl-guide.md",
          "NL",
          "Sending flowers to the Low Countries",
        ),
      },
    ]);

    const before = manifest("src");
    const [view, all] = await withCountryContentProvider(fake, () => [
      corridorContentView("NL", "en", "guide"),
      listCorridorContent(),
    ]);
    const after = manifest("src");

    // 1. the swap changes what a page would render …
    expect(view?.h1).toBe("Sending flowers to the Low Countries");
    expect(view?.iso2).toBe("NL");
    expect(all.map((entry) => `${entry.locale}/${entry.iso2}`)).toStrictEqual([
      "en/NL",
    ]);
    // … including making the committed country's page disappear, which is what "the corpus is
    // the source" means.
    expect(corridorContentView("PL", "en", "guide")).toBeDefined();
    await withCountryContentProvider(fake, () => {
      expect(corridorContentView("PL", "en", "guide")).toBeUndefined();
    });

    // 2. and it costs no file outside the module — it costs no file at all.
    expect(after).toStrictEqual(before);
  });

  it("restores the previous provider even when the body throws", async () => {
    const fake: CountryContentProvider = countryContentProviderOf([]);
    await expect(
      withCountryContentProvider(fake, () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(getCountryContentProvider()).toBe(staticCountryContentProvider);
  });

  it("refuses to build a provider over a file that does not parse, naming file and field", () => {
    expect(() =>
      countryContentProviderOf([
        { path: "en/nl-guide.md", source: "---\nseoTitle: x\n---\nbody\n" },
      ]),
    ).toThrow(/content\/corridors\/en\/nl-guide\.md: `[a-zA-Z]+`/u);
  });

  it("keeps the provider object out of the module barrel", async () => {
    const barrel: Record<string, unknown> =
      await import("../../src/modules/geo/index.ts");
    for (const name of [
      "staticCountryContentProvider",
      "getCountryContentProvider",
      "withCountryContentProvider",
      "countryContentProviderOf",
    ]) {
      expect(Object.keys(barrel), name).not.toContain(name);
    }
    // What a caller *may* import: the view model and the schema, never the source.
    expect(Object.keys(barrel)).toContain("corridorContentView");
    expect(Object.keys(barrel)).toContain("CountryLocaleContentSchema");
  });
});
