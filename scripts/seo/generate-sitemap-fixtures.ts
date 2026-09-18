/**
 * The committed sitemap fixtures, generated from the real builders (spec 007 §2 "Sitemaps", §11,
 * AC-13 / AC-14, T-14; TASK-094).
 *
 * Writes `tests/fixtures/seo/sitemap/*.xml` and its `noindex.json` from the **real builders**, so
 * the documents spec 001's `validate-sitemap` checks in CI are this repository's actual sitemap
 * rather than hand-written XML that could agree with nothing. It is the sibling of
 * `generate-hreflang-fixtures.ts` and it exists for the same two reasons:
 *
 *  - `pnpm seo:validate` then validates **the real URL set** — the clause AC-13 ends on. Break the
 *    XML, emit a relative `<loc>`, or let a `noindex` URL into a child and the `seo-validate` job
 *    goes red, on a machine with no deployment and no network.
 *  - `tests/unit/sitemap-fixtures.test.ts` regenerates in memory and asserts the committed bytes
 *    match, so a country, a locale or a review flag cannot move without the fixtures moving with
 *    it. That test is also the **writer**: run it with `UPDATE_SEO_FIXTURES=1` to refresh the
 *    directory after a deliberate change.
 *
 * ## Why the refresh runs through Vitest and not `node`
 *
 * `generate-hreflang-fixtures.ts` is a plain `node` script because `alternates.ts` is a leaf. The
 * sitemap builders are not: `modules/seo` may only reach `modules/geo` and `modules/i18n` through
 * their barrels (`import/no-restricted-paths`, `plan/01` §5), and both barrels export a Server
 * Component, so the import graph contains `.tsx` — which Node's type stripping cannot load and
 * Vitest's transform can. Loosening the boundary to get a `node` entry point would trade a real
 * architectural rule for a convenience, so the generator is a module and the test is its CLI.
 *
 * ## Why a fixed deployment
 *
 * The builders answer `[]` on every deployment that may not be indexed (spec 007 §6), which is
 * every deployment that exists until TASK-096's flip — so a fixture generated from the ambient
 * environment would be an empty document that proves nothing. The descriptor below is the one
 * deployment the site will have: production on the canonical host. That makes the committed
 * fixtures a **preview of the flip**: the exact bytes `/sitemap.xml` will serve the day
 * `NEXT_PUBLIC_SITE_URL` names the real domain, checked by the same validator that will check the
 * live one.
 *
 * `noindex.json` is generated from the same engine over the URLs the sitemap did *not* take: the
 * locale chooser and the hub of every locale that is not announced. `validate-sitemap` intersects
 * it with every `<loc>` it reads, which is AC-14's first half as a CI gate rather than an
 * argument.
 */
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  localePath,
  routableLocaleCodes,
} from "../../src/modules/i18n/index.ts";
import { absoluteUrl } from "../../src/modules/seo/canonical.ts";
import {
  CANONICAL_HOST,
  type DeploymentDescriptor,
} from "../../src/modules/seo/environment.ts";
import { corridorSitemapEntries } from "../../src/modules/seo/sitemap/corridors.ts";
import type { SitemapAlternate } from "../../src/modules/seo/sitemap/xml.ts";
import {
  SITEMAP_CHILDREN,
  localeSitemapDocument,
  sitemapChildDocument,
  sitemapIndexDocument,
  sitemapLocales,
} from "../../src/modules/seo/sitemap/index.ts";

/** The one deployment that may announce anything (spec 007 §6). See the header. */
export const FIXTURE_DEPLOYMENT: DeploymentDescriptor = {
  environment: "production",
  siteUrl: `https://${CANONICAL_HOST}`,
};

export const FIXTURE_DIR = "tests/fixtures/seo/sitemap";

/**
 * The hreflang validator's directory (spec 003's `generate-hreflang-fixtures.ts` owns two files
 * in it). The corridor clusters are added here rather than there for the reason the header gives:
 * a corridor's per-locale path is *entity* data (`polen`, `polska`), so its cluster comes from
 * `corridorAlternatePaths()` and cannot be produced by a `node`-runnable leaf script. It is the
 * cluster AC-11 is about — the one the `<head>` and the `xhtml:link` set share — so
 * `validate-hreflang` should be reading it, not only the page-type shaped sample.
 */
export const HREFLANG_FIXTURE_DIR = "tests/fixtures/seo/hreflang";

export interface GeneratedFixture {
  /** Repository-relative directory, so one writer serves both validators. */
  readonly dir: string;
  readonly file: string;
  readonly contents: string;
}

/** Two-space indent and one trailing newline: what Prettier prints for a JSON file. */
function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** Every URL the sitemap declined, as `validate-sitemap`'s `noindex.json` shape. */
export function noindexUrlSet(
  deployment: DeploymentDescriptor = FIXTURE_DEPLOYMENT,
): readonly string[] {
  const announced = new Set(sitemapLocales(deployment));
  const urls = [
    // `plan/02` §7: the locale chooser is `noindex` whatever the environment.
    absoluteUrl("/", { baseUrl: deployment.siteUrl }),
    ...routableLocaleCodes()
      .filter((locale) => !announced.has(locale))
      .map((locale) =>
        absoluteUrl(localePath(locale, "destinations"), {
          baseUrl: deployment.siteUrl,
        }),
      ),
  ];
  return [...urls].sort();
}

/**
 * Every announced corridor URL with its cluster, in `validate-hreflang`'s fixture shape. Taken
 * from the **sitemap rows**, so the file the hreflang validator reads and the `xhtml:link` sets
 * the sitemap prints are the same bytes by construction (AC-11).
 */
export function corridorClusters(
  deployment: DeploymentDescriptor = FIXTURE_DEPLOYMENT,
): readonly { url: string; alternates: readonly SitemapAlternate[] }[] {
  return sitemapLocales(deployment).flatMap((locale) =>
    corridorSitemapEntries(locale, deployment).map((entry) => ({
      url: entry.loc,
      alternates: entry.alternates,
    })),
  );
}

/** The fixture set: the index, then each announced locale's index and children. */
export function generateSitemapFixtures(
  deployment: DeploymentDescriptor = FIXTURE_DEPLOYMENT,
): readonly GeneratedFixture[] {
  const fixtures: GeneratedFixture[] = [
    {
      dir: FIXTURE_DIR,
      file: "sitemap.xml",
      contents: sitemapIndexDocument(deployment),
    },
  ];

  for (const locale of sitemapLocales(deployment)) {
    const index = localeSitemapDocument(locale, deployment);
    if (index !== undefined) {
      fixtures.push({
        dir: FIXTURE_DIR,
        file: `${locale}-index.xml`,
        contents: index,
      });
    }
    for (const child of SITEMAP_CHILDREN) {
      const document = sitemapChildDocument(locale, child, deployment);
      if (document === undefined) continue;
      fixtures.push({
        dir: FIXTURE_DIR,
        file: `${locale}-${child}.xml`,
        contents: document,
      });
    }
  }

  fixtures.push({
    dir: FIXTURE_DIR,
    file: "noindex.json",
    contents: json({ noindex: noindexUrlSet(deployment) }),
  });

  fixtures.push({
    dir: HREFLANG_FIXTURE_DIR,
    file: "corridor-clusters.json",
    contents: json({ pages: corridorClusters(deployment) }),
  });

  return fixtures;
}

/** Absolute path of one fixture file inside the repository. */
export function fixturePath(dir: string, file: string): string {
  return join(resolve(fileURLToPath(import.meta.url), "../../.."), dir, file);
}

/** Write the whole set to its two directories. The test is the only caller. */
export function writeSitemapFixtures(): readonly string[] {
  const written: string[] = [];
  for (const { dir, file, contents } of generateSitemapFixtures()) {
    writeFileSync(fixturePath(dir, file), contents, "utf8");
    written.push(`${dir}/${file}`);
  }
  return written;
}
