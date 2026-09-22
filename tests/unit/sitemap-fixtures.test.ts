/**
 * The committed sitemap fixtures are the generator's real output (spec 007 §2 "Sitemaps", §11,
 * AC-13 / AC-14, T-14; TASK-094) — the sitemap half of what
 * `tests/unit/i18n-alternates.test.ts` does for the hreflang fixtures.
 *
 * `pnpm seo:validate` runs `validate-sitemap` over `tests/fixtures/seo/sitemap/` in CI. Those
 * documents are only worth validating if they are *this repository's* sitemap, so this test
 * regenerates them in memory and compares byte for byte: publish a country, review a guide, add a
 * locale or change the XML and the fixtures must move in the same commit.
 *
 * It is also the generator's CLI, for the reason
 * `scripts/seo/generate-sitemap-fixtures.ts` records (the builders' import graph reaches a Server
 * Component, which Node cannot load):
 *
 *     UPDATE_SEO_FIXTURES=1 pnpm test tests/unit/sitemap-fixtures.test.ts
 *
 * The write happens **before** the comparison, so a refresh run is green and a normal run never
 * touches the tree.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";

import { beforeAll, describe, expect, it } from "vitest";

import {
  FIXTURE_DIR,
  fixturePath,
  generateSitemapFixtures,
  noindexUrlSet,
  writeSitemapFixtures,
} from "../../scripts/seo/generate-sitemap-fixtures.ts";

const fixtures = generateSitemapFixtures();

beforeAll(() => {
  if (process.env["UPDATE_SEO_FIXTURES"] === "1") writeSitemapFixtures();
});

describe(`${FIXTURE_DIR} is generated, not written`, () => {
  for (const { dir, file, contents } of fixtures) {
    it(`${dir}/${file} matches the generator byte for byte`, () => {
      const path = fixturePath(dir, file);
      expect(existsSync(path), `${file} is missing`).toBe(true);
      expect(readFileSync(path, "utf8")).toBe(contents);
    });
  }

  it("carries no sitemap fixture the generator no longer produces", () => {
    const expected = new Set(
      fixtures
        .filter((fixture) => fixture.dir === FIXTURE_DIR)
        .map((fixture) => fixture.file),
    );
    const found = readdirSync(fixturePath(FIXTURE_DIR, ".")).filter(
      (name) => !name.startsWith("."),
    );
    for (const name of found) expect(expected.has(name), name).toBe(true);
  });

  it("announces the two English locales and their two children each", () => {
    expect(fixtures.map((fixture) => fixture.file)).toEqual([
      "sitemap.xml",
      "en-index.xml",
      "en-static.xml",
      "en-corridors.xml",
      "en-gb-index.xml",
      "en-gb-static.xml",
      "en-gb-corridors.xml",
      "noindex.json",
      // The hreflang validator's copy of the same clusters (AC-11's contract half).
      "corridor-clusters.json",
    ]);
  });

  it("lists the unannounced hubs and the chooser as noindex, and none of them as a <loc>", () => {
    const noindex = noindexUrlSet();
    expect(noindex).toContain("https://flowersoverseas.com/");
    expect(noindex).toContain(
      "https://flowersoverseas.com/de/blumen-verschicken",
    );
    expect(noindex).toContain("https://flowersoverseas.com/pl/wyslij-kwiaty");

    const locs = fixtures
      .filter((fixture) => fixture.file.endsWith(".xml"))
      .flatMap((fixture) =>
        [...fixture.contents.matchAll(/<loc>([^<]+)<\/loc>/gu)].map(
          (match) => match[1] ?? "",
        ),
      );
    for (const url of noindex) expect(locs).not.toContain(url);
  });
});
