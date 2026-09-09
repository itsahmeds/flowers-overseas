/**
 * The four TASK-047 registries as a set (spec 004 §2 "Everything data-gated is config", §5.1,
 * §7, AC-2; T-03).
 *
 * Each registry has its own test file for its own rules; this one asserts the three properties
 * they share, because each is a property of the *set* and would otherwise be nobody's:
 *
 *  1. **T-03 / AC-2, the no-database seam.** `pnpm check:no-db` covers `src/config`, and each of
 *     the four modules imports and parses in a child process with `DATABASE_URL` **unset** — the
 *     literal wording of AC-2, asserted rather than promised. A registry that grew a database
 *     read (or a `process.env.DATABASE_URL` fallback) fails here and in `check:no-db`.
 *  2. **Every message key a registry names resolves in every launch locale.** The registries hold
 *     keys instead of copy (`CLAUDE.md`: no literal user-facing string), which only works if the
 *     key exists — in `en` and, after fallback, in `en-gb`, `de` and `pl` (spec 003 §5.3).
 *  3. **The files are registered where the repository expects config to be declared**:
 *     `scripts/check-layout.ts`'s `CONFIG_FILES` and, through
 *     `tests/unit/architecture-doc.test.ts`, `docs/architecture.md` §2.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { CONFIG_FILES } from "../../scripts/check-layout.ts";
import { SCANNED_PATHS } from "../../scripts/check-no-db-imports.ts";
import {
  CATEGORIES,
  CATEGORY_NAV_LABEL_KEY,
} from "../../src/config/categories.ts";
import { COMPANY } from "../../src/config/company.ts";
import { COUNTRIES, destinationStateKey } from "../../src/config/countries.ts";
import { launchLocales } from "../../src/config/locales.ts";
import { SITE_LINKS, SITE_LINK_GROUPS } from "../../src/config/site-links.ts";

const repoRoot = resolve(__dirname, "../..");

const REGISTRIES = [
  "src/config/countries.ts",
  "src/config/site-links.ts",
  "src/config/categories.ts",
  "src/config/company.ts",
] as const;

/** Every message key the four registries name, with the field that names it. */
const referencedKeys: readonly { key: string; source: string }[] = [
  ...COUNTRIES.flatMap((country) => [
    { key: country.nameKey, source: `countries[${country.iso2}].nameKey` },
    ...(country.citiesKey === undefined
      ? []
      : [
          {
            key: country.citiesKey,
            source: `countries[${country.iso2}].citiesKey`,
          },
        ]),
    {
      key: destinationStateKey(country),
      source: `destinationStateKey(${country.iso2})`,
    },
  ]),
  ...SITE_LINKS.flatMap((link) => [
    { key: link.labelKey, source: `siteLinks[${link.id}].labelKey` },
    ...(link.descriptionKey === undefined
      ? []
      : [
          {
            key: link.descriptionKey,
            source: `siteLinks[${link.id}].descriptionKey`,
          },
        ]),
  ]),
  ...SITE_LINK_GROUPS.map((group) => ({
    key: group.headingKey,
    source: `siteLinkGroups[${group.id}].headingKey`,
  })),
  ...CATEGORIES.flatMap((category) => [
    { key: category.labelKey, source: `categories[${category.id}].labelKey` },
    ...(category.shortLabelKey === undefined
      ? []
      : [
          {
            key: category.shortLabelKey,
            source: `categories[${category.id}].shortLabelKey`,
          },
        ]),
  ]),
  { key: CATEGORY_NAV_LABEL_KEY, source: "CATEGORY_NAV_LABEL_KEY" },
  { key: COMPANY.descriptionKey, source: "company.descriptionKey" },
  { key: COMPANY.operatedByKey, source: "company.operatedByKey" },
  { key: COMPANY.contact.labelKey, source: "company.contact.labelKey" },
  { key: COMPANY.contact.hoursKey, source: "company.contact.hoursKey" },
];

function catalogue(locale: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(repoRoot, "messages", `${locale}.json`), "utf8"),
  ) as Record<string, unknown>;
}

function valueAt(tree: Record<string, unknown>, key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        typeof node === "object" && node !== null
          ? (node as Record<string, unknown>)[part]
          : undefined,
      tree,
    );
}

describe("AC-2 / T-03: the registries need no database", () => {
  it("is covered by `pnpm check:no-db`", () => {
    expect([...SCANNED_PATHS]).toContain("src/config");
  });

  it("imports and parses every registry with `DATABASE_URL` unset", () => {
    const program = REGISTRIES.map(
      (file) => `import(${JSON.stringify(`./${file}`)})`,
    ).join(", ");
    const out = execFileSync(
      process.execPath,
      [
        "-e",
        `if ("DATABASE_URL" in process.env) { throw new Error("DATABASE_URL reached the child"); }
         Promise.all([${program}]).then((modules) => { console.log("parsed", modules.length); }, (error) => { console.error(error); process.exit(1); })`,
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: { ...process.env, DATABASE_URL: undefined },
      },
    );
    expect(out.trim()).toBe(`parsed ${String(REGISTRIES.length)}`);
  });
});

describe("§7: every registry key resolves in every launch locale", () => {
  it("names at least one key per registry", () => {
    expect(referencedKeys.length).toBeGreaterThan(30);
    expect(
      new Set(referencedKeys.map((entry) => entry.key.split(".")[0])),
    ).toEqual(new Set(["destinations", "nav", "footer", "company", "common"]));
  });

  it("resolves every key in `en`", () => {
    const en = catalogue("en");
    for (const { key, source } of referencedKeys) {
      expect(typeof valueAt(en, key), `${source} → ${key}`).toBe("string");
    }
  });

  it("resolves every key in every launch locale after fallback", () => {
    const en = catalogue("en");
    for (const locale of launchLocales) {
      const own = catalogue(locale);
      for (const { key, source } of referencedKeys) {
        const value = valueAt(own, key) ?? valueAt(en, key);
        expect(typeof value, `${locale}: ${source} → ${key}`).toBe("string");
      }
    }
  });

  it("has no duplicate key doing two jobs", () => {
    const byKey = new Map<string, string[]>();
    for (const { key, source } of referencedKeys) {
      byKey.set(key, [...(byKey.get(key) ?? []), source]);
    }
    const shared = [...byKey.entries()].filter(
      ([, sources]) =>
        sources.length > 1 &&
        // The two state keys are shared **by design**: every guide destination prints the same
        // "Guide · waiting list" line, which is the point of `destinationStateKey()`.
        !sources.every((source) => source.startsWith("destinationStateKey(")),
    );
    // `for-florists` is the one entry the canvas draws twice (header cluster and footer column),
    // and it is one link id with one label — not two rows that could drift.
    expect(shared).toEqual([]);
  });
});

describe("the layout manifest", () => {
  it("lists the four registries as required config modules", () => {
    for (const file of REGISTRIES) {
      expect([...CONFIG_FILES], file).toContain(file);
    }
  });
});
