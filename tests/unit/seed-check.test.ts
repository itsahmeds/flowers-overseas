/**
 * T-07, T-09, T-10 and T-30 (spec 006 AC-7, AC-9, AC-10, AC-30; TASK-075): `pnpm seed:check`.
 *
 * The order is the acceptance criterion's: the merged tree passes, then **one fixture per rule
 * family** fails with the file, the key and the rule named, then the §11 report, then the CI
 * wiring.
 *
 * Three assertions here are the ones worth defending in review:
 *
 *  - **every case's family set is asserted exactly**, not "contains". A fixture that quietly trips
 *    a second family is a fixture that could pass for the wrong reason, so a case declares
 *    `alsoFamilies` with a written reason and the test holds it to that list.
 *  - **no locale and no country can read ready while it is gated in code** (§11). The report's
 *    `ready` and `pages today` columns are computed from `isLocaleIndexable()` and
 *    `country.status` — the same predicates the application gates on — and the test asserts the
 *    implication in both directions rather than trusting the table.
 *  - **the PL set clears the six-product rule** (spec 006 §6, spec 002 §6) while the flower-type
 *    hubs and the seasonal occasions do not, because spec 008 has to be able to test *both* sides
 *    of the threshold against real data.
 *
 * `readSeedTree()` re-projects the whole dataset (`staleProjections()` runs Prettier over 34
 * files), so every test that builds a tree carries an explicit `{ timeout }`: the default 5 s was
 * already hit once by `tests/unit/seed-prices.test.ts`'s byte-for-byte projection test on a loaded
 * runner (TASK-075's row).
 */
import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";
import { parse } from "yaml";

import {
  COMPETITOR_MARKS,
  PII_PATTERNS,
  ROUTED_SLUG_TRANSLATION_STATUS,
  HOLIDAY_COVERAGE_WARNING_DAYS,
  HOLIDAY_COVERAGE_WARNING_MARKER,
  calendarHorizons,
  holidayCoverageReport,
  holidayCoverageRunway,
  pickerStateReport,
  PRODUCT_COUNT,
  PRODUCT_TYPE_SPLIT,
  SEED_CHECK_FAMILIES,
  SIX_PRODUCT_THRESHOLD,
  type SeedCheckFamily,
  type SeedTree,
  checkSeedDataset,
  coverageRows,
  familiesOf,
  formatSeedProblems,
  localeReadiness,
  readSeedTree,
  seedCheckExitCode,
  seedHealthReport,
  seoTitleNearDuplicates,
  stringsWithPaths,
} from "../../seed/check.ts";
import {
  SeedCheckCaseSchema,
  type SeedCheckCase,
  applySeedCheckCase,
} from "../../seed/check-cases.ts";
import {
  COMMITTED_MEDIA_BYTE_CAP,
  SLOT_BYTE_CAPS,
  SLOTS_WITHOUT_A_CAP,
} from "../../seed/budgets.ts";
import { asciiFoldSlug } from "../../seed/copy.ts";
import { SEED_DATA_DIR } from "../../seed/schema/files.ts";
import { COUNTRIES } from "../../src/config/countries.ts";
import { launchLocales } from "../../src/config/locales.ts";
import { isLocaleIndexable } from "../../src/modules/i18n/review.ts";
import { AUTHORED_TRANSLATION_STATUS } from "../../src/modules/catalog/copy.ts";
import { withActivePartnersProvider } from "../../src/modules/geo/partners.ts";

const repoRoot = resolve(__dirname, "../..");
const CASES_DIR = "tests/fixtures/seed/_cases";
/** Re-projecting and hashing the whole dataset: see the header. */
const TREE_TIMEOUT = 30_000;

/**
 * The instant the in-process tree is judged at. Family 10's holiday-coverage rule reads today
 * (spec 009 AC-2), and a unit suite whose verdict changed at midnight would be testing the
 * calendar rather than the rule — so the suite pins the day it was written, the boundary cases
 * below pin the exact minute the committed rows run out, and the real clock is the CI job's.
 */
const AS_OF = new Date("2026-09-23T10:00:00Z");

/** The new rules of spec 009 AC-2 and the fixture each must have (T-02). */
const SPEC_009_RULES = [
  "calendar/holiday-coverage",
  "calendar/holiday-name-key",
  "calendar/undatable-rule",
  "slugs/product-slug-required",
] as const;

let tree: SeedTree;

beforeAll(async () => {
  tree = await readSeedTree(repoRoot, new Map(), AS_OF);
}, TREE_TIMEOUT);

/* -------------------------------------------------------------------------- */
/* The case files.                                                            */
/* -------------------------------------------------------------------------- */

interface LoadedCase {
  readonly family: string;
  readonly name: string;
  readonly dir: string;
  readonly value: SeedCheckCase;
}

function loadCases(): readonly LoadedCase[] {
  const root = join(repoRoot, CASES_DIR);
  const out: LoadedCase[] = [];
  for (const family of readdirSync(root).sort()) {
    const dir = join(root, family);
    for (const name of readdirSync(dir).sort()) {
      // The five price files TASK-074 shipped are the *blocks* a case splices in, not cases
      // themselves; `case-*.json` is the case that wires each one.
      if (family === "prices" && !name.startsWith("case-")) continue;
      out.push({
        family,
        name,
        dir,
        value: SeedCheckCaseSchema.parse(
          JSON.parse(readFileSync(join(dir, name), "utf8")),
        ),
      });
    }
  }
  return out;
}

const cases = loadCases();

function runCase(
  testCase: LoadedCase,
): readonly ReturnType<typeof checkSeedDataset>[number][] {
  const mutated = applySeedCheckCase(tree, testCase.value, (file) =>
    JSON.parse(readFileSync(join(testCase.dir, file), "utf8")),
  );
  return checkSeedDataset(mutated);
}

/* -------------------------------------------------------------------------- */
/* AC-10: the merged tree, and one fixture per family.                        */
/* -------------------------------------------------------------------------- */

describe("spec 006 AC-10: the merged tree passes every rule family", () => {
  it(
    "reports no problem at all",
    () => {
      expect(formatSeedProblems(checkSeedDataset(tree))).toBe("");
      expect(seedCheckExitCode(checkSeedDataset(tree))).toBe(0);
    },
    TREE_TIMEOUT,
  );

  it("read every file the dataset layout declares", () => {
    expect(tree.missing).toEqual([]);
    expect(tree.stale).toEqual([]);
    expect(tree.raw.size).toBeGreaterThan(30);
    // TASK-078 shipped `media-variants.json` with a pinned header and no rows and TASK-079 shipped
    // `alt/{locale}.json` with no rows, because the founder had supplied no imagery. **TASK-080
    // filled both**, and the conditional halves of family 7 — written for exactly this moment —
    // are now the ones doing the work: every variant row has a file of the right size, and every
    // product asset has alt text in all four launch locales or the gate fails.
    expect(tree.raw.has("media-variants.json")).toBe(true);
    const variantRows = (
      tree.raw.get("media-variants.json") as { rows: unknown[] }
    ).rows;
    expect(variantRows.length).toBeGreaterThan(0);
    expect([...tree.altLocales].sort()).toEqual(["de", "en", "en-gb", "pl"]);
    const assetCount = (tree.raw.get("media.json") as { rows: unknown[] }).rows
      .length;
    for (const locale of tree.altLocales) {
      // The alt gate is all-or-nothing across locales by design (`seed/check.ts` family 7): one
      // alt row anywhere obliges every launch locale to carry one per product asset, because a
      // locale that is missing one renders the placeholder instead of the photograph (AC-18) and
      // a half-translated alt set is how an English sentence ends up on a Polish page.
      expect(
        (tree.raw.get(`alt/${locale}.json`) as { rows: unknown[] }).rows.length,
        locale,
      ).toBe(assetCount);
    }
  });

  it("covers all ten families with at least one fixture (AC-10's 'a fixture per family')", () => {
    const covered = new Set(cases.map((testCase) => testCase.value.family));
    expect([...covered].sort()).toEqual([...SEED_CHECK_FAMILIES].sort());
    expect(SEED_CHECK_FAMILIES).toHaveLength(10);
  });

  it("declares its cases from a table of 26 fixtures, and spec 009 AC-2's four rules have one each (T-02)", () => {
    // The `describe.each` below declares its cases from this directory; an emptied or thinned
    // directory would otherwise just declare fewer cases and stay green.
    expect(cases).toHaveLength(26);
    for (const rule of SPEC_009_RULES) {
      expect(
        cases.filter(
          (testCase) =>
            `${testCase.value.family}/${testCase.value.rule}` === rule,
        ),
        rule,
      ).toHaveLength(1);
    }
  });
});

describe.each(
  cases.map(
    (testCase) => [`${testCase.family}/${testCase.name}`, testCase] as const,
  ),
)("fixture %s", (_label, testCase) => {
  it(
    "fails its own family with the file, the key and the rule named",
    () => {
      const problems = runCase(testCase);
      expect(problems.length).toBeGreaterThan(0);
      expect(seedCheckExitCode(problems)).toBe(1);

      const own = problems.filter(
        (problem) =>
          problem.family === testCase.value.family &&
          problem.rule === testCase.value.rule,
      );
      expect(
        own.length,
        `expected a ${testCase.value.family}/${testCase.value.rule} problem, got:\n${formatSeedProblems(problems)}`,
      ).toBeGreaterThan(0);
      // The *line* must name the fault: `formatSeedProblems` prints the key and the message
      // together, and which of the two carries the SKU depends on the rule.
      expect(
        own.some((problem) =>
          `${problem.key} ${problem.message}`.includes(testCase.value.expect),
        ),
        `no ${testCase.value.rule} problem mentions "${testCase.value.expect}":\n${formatSeedProblems(own)}`,
      ).toBe(true);
      for (const problem of own) {
        expect(problem.file.length).toBeGreaterThan(3);
        expect(problem.key.length).toBeGreaterThan(0);
      }
    },
    TREE_TIMEOUT,
  );

  it(
    "trips exactly the families it declares",
    () => {
      const expected = [
        testCase.value.family,
        ...testCase.value.alsoFamilies,
      ] as SeedCheckFamily[];
      expect(familiesOf(runCase(testCase)).slice().sort()).toEqual(
        SEED_CHECK_FAMILIES.filter((family) => expected.includes(family))
          .slice()
          .sort(),
      );
    },
    TREE_TIMEOUT,
  );

  it("says why it exists, so a later reader can tell a rule from a typo", () => {
    expect(testCase.value.why.length).toBeGreaterThan(60);
    expect(testCase.value.why).toMatch(/spec 006|AC-|plan\/|§/u);
  });
});

/* -------------------------------------------------------------------------- */
/* AC-7: slugs.                                                               */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* Rules no fixture reached (TASK-143).                                        */
/* -------------------------------------------------------------------------- */

/**
 * AC-10 asks for "a fixture per family", and the families are covered — but a family is several
 * rules, and neutering each `problems.push` of `seed/check.ts` in turn left 11 of its 23 with all
 * 113 cases green. These are tree-level facts (a stray file, a missing one, a stale projection, a
 * committed image with no asset) or one-field edits, so each is written here as the smallest
 * mutation of the committed tree rather than as a case file, and each must be reported under its
 * own rule and key.
 */
describe("seed:check rules no fixture reached (TASK-143)", () => {
  const COPY = "copy/en/products.json";
  const copyFile = (): { rows: Record<string, unknown>[] } & Record<
    string,
    unknown
  > => structuredClone(tree.raw.get(COPY)) as never;
  const withRaw = (path: string, value: unknown): SeedTree => ({
    ...tree,
    raw: new Map([...tree.raw, [path, value]]),
  });
  const reported = (mutated: SeedTree, rule: string): readonly string[] =>
    checkSeedDataset(mutated)
      .filter((problem) => problem.rule === rule)
      .map((problem) => `${problem.key} ${problem.message}`);

  it(
    "unknown-file: a file the layout does not declare",
    () => {
      const found = reported(withRaw("stray.json", {}), "unknown-file");
      expect(found).toHaveLength(1);
      expect(found[0]).toMatch(
        /^stray\.json is not part of the dataset layout/u,
      );
    },
    TREE_TIMEOUT,
  );

  it(
    "missing-file: a file the layout requires and the disk lacks",
    () => {
      const found = reported(
        { ...tree, missing: ["products.json"] },
        "missing-file",
      );
      expect(found).toEqual([
        "products.json is required by the `seed/data/` layout of spec 006 §2.2 and is not on disk",
      ]);
    },
    TREE_TIMEOUT,
  );

  it(
    "origin: an authored file that claims to be projected",
    () => {
      const file = copyFile();
      // A projected header must name its module, or the header schema objects first and the
      // layout rule is never reached; with `projectedFrom` it is a well-formed lie.
      const found = reported(
        withRaw(COPY, {
          ...file,
          origin: "projected",
          projectedFrom: "src/config/catalogue/products.data.ts",
        }),
        "origin",
      );
      expect(found).toHaveLength(1);
      expect(found[0]).toContain(`${COPY} claims \`origin: "projected"\``);
    },
    TREE_TIMEOUT,
  );

  it(
    "stale-projection: a projected file that differs from a fresh projection",
    () => {
      const found = reported(
        { ...tree, stale: [`${SEED_DATA_DIR}/products.json`] },
        "stale-projection",
      );
      expect(found).toHaveLength(1);
      expect(found[0]).toMatch(
        /^products\.json differs from a fresh projection/u,
      );
    },
    TREE_TIMEOUT,
  );

  it(
    "prompt-file: an imagery prompt file that does not parse",
    () => {
      const found = reported(
        {
          ...tree,
          prompts: new Map([...tree.prompts, ["zz-broken", { records: "x" }]]),
        },
        "prompt-file",
      );
      expect(found).toHaveLength(1);
      expect(found[0]).toMatch(/^zz-broken does not parse as a prompt file/u);
    },
    TREE_TIMEOUT,
  );

  it(
    "copy-owner: copy for a product the dataset does not have",
    () => {
      const file = copyFile();
      const [first] = file.rows;
      if (first === undefined) throw new Error(`${COPY} has no rows`);
      const found = reported(
        withRaw(COPY, {
          ...file,
          rows: [
            ...file.rows,
            { ...first, key: "FO-XX-999", slug: "no-such-bouquet" },
          ],
        }),
        "copy-owner",
      );
      expect(found).toEqual([
        "product:FO-XX-999 is copy for an entity the dataset does not have",
      ]);
    },
    TREE_TIMEOUT,
  );

  it(
    "source-locale: no `en` copy at all",
    () => {
      const found = reported(
        {
          ...tree,
          copyLocales: tree.copyLocales.filter((locale) => locale !== "en"),
        },
        "source-locale",
      );
      expect(found).toHaveLength(1);
      expect(found[0]).toMatch(/^en has no copy files/u);
    },
    TREE_TIMEOUT,
  );

  it(
    "florist-sentence-key: a copy locale with no florist sentence to verify against",
    () => {
      const sentences = new Map(tree.floristSentences);
      sentences.delete("en");
      const found = reported(
        { ...tree, floristSentences: sentences },
        "florist-sentence-key",
      );
      expect(found.length).toBeGreaterThan(0);
      expect(
        found.every((line) =>
          line.startsWith("en has no `catalog.floristSentence`"),
        ),
      ).toBe(true);
    },
    TREE_TIMEOUT,
  );

  it(
    "person-allowlist: a person's name where only a role may appear",
    () => {
      const file = copyFile();
      const [first, ...rest] = file.rows;
      if (first === undefined) throw new Error(`${COPY} has no rows`);
      const found = reported(
        withRaw(COPY, {
          ...file,
          rows: [{ ...first, reviewedBy: "Jan Kowalski" }, ...rest],
        }),
        "person-allowlist",
      );
      expect(found).toHaveLength(1);
      expect(found[0]).toContain("`reviewedBy` is `Jan Kowalski`");
    },
    TREE_TIMEOUT,
  );

  it(
    "unknown-slot: a committed image whose asset id is not in media.json",
    () => {
      const stray = "public/media/not-an-asset/640.avif";
      const found = reported(
        {
          ...tree,
          mediaFiles: [...tree.mediaFiles, { path: stray, bytes: 10 }],
        },
        "unknown-slot",
      );
      expect(found).toHaveLength(1);
      expect(found[0]).toMatch(new RegExp(`^${stray} is committed under`, "u"));
    },
    TREE_TIMEOUT,
  );

  // TASK-138's split (founder, 2026-10-03, option (a)): the `hero` slot is committed and served
  // from this origin, so the committed half runs on the real tree on every runner.
  it(
    "variant-file: a committed `hero` variant missing from public/media/",
    () => {
      const victim = "public/media/home-hero/828.avif";
      expect(tree.mediaFiles.map((file) => file.path)).toContain(victim);
      const found = reported(
        {
          ...tree,
          mediaFiles: tree.mediaFiles.filter((file) => file.path !== victim),
        },
        "variant-file",
      );
      expect(found).toEqual([
        `home-hero/828.avif is in the manifest with no file at \`${victim}\`: the \`hero\` slot is served from the site's own origin, so a missing committed file is a 404 on the page's LCP image (TASK-138)`,
      ]);
    },
    TREE_TIMEOUT,
  );

  it(
    "variant-bytes: a committed `hero` file whose size disagrees with its row",
    () => {
      const victim = "public/media/home-hero/384.webp";
      const found = reported(
        {
          ...tree,
          mediaFiles: tree.mediaFiles.map((file) =>
            file.path === victim ? { ...file, bytes: file.bytes + 1 } : file,
          ),
        },
        "variant-bytes",
      );
      expect(found).toHaveLength(1);
      expect(found[0]).toContain(`the committed file \`${victim}\``);
    },
    TREE_TIMEOUT,
  );
});

describe("spec 006 AC-7: slug rules", () => {
  it("folds Polish diacritics: `Kraków Spring` → `krakow-spring`", () => {
    expect(asciiFoldSlug("Kraków Spring")).toBe("krakow-spring");
    // The dataset already carries the case AC-7 names, so the fold is exercised over real data
    // rather than only over a literal: `FO-BQ-009` is `Kraków Spring` in every locale.
    const products = JSON.parse(
      readFileSync(
        join(repoRoot, SEED_DATA_DIR, "copy/en/products.json"),
        "utf8",
      ),
    ) as { rows: { key: string; name: string; slug: string }[] };
    const krakow = products.rows.find((row) => row.key === "FO-BQ-009");
    expect(krakow?.name).toBe("Kraków Spring");
    expect(krakow?.slug).toBe("krakow-spring");
    expect(asciiFoldSlug("Wrocław Light")).toBe("wroclaw-light");
    expect(asciiFoldSlug("Valentine's Day")).toBe("valentines-day");
  });

  it(
    "accepts the fold and rejects the unfolded form for the same name",
    () => {
      const base = {
        family: "slugs" as const,
        rule: "fold",
        replaces: "copy/en/products.json",
        expect: "is not the ASCII fold of",
        alsoFamilies: [],
        why: "AC-7's fold rule, driven from a literal so the pass and the fail differ in one field.",
      };
      const withSlug = (name: string, slug: string): SeedCheckCase => ({
        ...base,
        ops: [
          {
            op: "setRow",
            match: { key: "FO-BQ-001" },
            set: { name, slug },
          },
        ],
      });
      const folded = checkSeedDataset(
        applySeedCheckCase(
          tree,
          withSlug("Gdańsk Morning", "gdansk-morning"),
          () => ({}),
        ),
      ).filter((problem) => problem.family === "slugs");
      expect(formatSeedProblems(folded)).toBe("");

      const unfolded = checkSeedDataset(
        applySeedCheckCase(
          tree,
          withSlug("Gdańsk Morning", "gdańsk-morning"),
          () => ({}),
        ),
      ).filter((problem) => problem.family === "slugs");
      expect(unfolded.map((problem) => problem.rule)).toContain("fold");
      expect(unfolded.map((problem) => problem.rule)).toContain("ascii");
      expect(formatSeedProblems(unfolded)).toContain("gdansk-morning");
    },
    TREE_TIMEOUT,
  );

  it("holds slugs unique per locale across products, categories and occasions", () => {
    const slugs = new Map<string, string[]>();
    for (const [path, value] of tree.raw) {
      if (!path.startsWith("copy/")) continue;
      for (const row of (
        value as {
          rows: { key: string; slug: string; locale: string; entity: string }[];
        }
      ).rows) {
        const key = `${row.locale}/${row.slug}`;
        slugs.set(key, [...(slugs.get(key) ?? []), `${row.entity}:${row.key}`]);
      }
    }
    for (const [key, owners] of slugs) {
      expect(owners, key).toHaveLength(1);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* AC-9: PII and third-party marks.                                           */
/* -------------------------------------------------------------------------- */

describe("spec 006 AC-9: no PII and no third-party marks", () => {
  it("reports the JSON path, not an array index, so the offending value can be found", () => {
    const paths = stringsWithPaths({
      rows: [{ seoTitle: "a", nested: { deep: ["b"] } }],
    });
    expect(paths.map((entry) => entry.path)).toEqual([
      "$.rows[0].seoTitle",
      "$.rows[0].nested.deep[0]",
    ]);
  });

  it("matches the four shapes rule 8 names, and nothing that merely looks like them", () => {
    const of = (rule: string): RegExp =>
      PII_PATTERNS.find((pattern) => pattern.rule === rule)?.pattern ?? /(?!)/u;
    expect(of("email").test("hello@flowersoverseas.com")).toBe(true);
    expect(of("email").test("18 stems @ 24 EUR")).toBe(false);
    expect(of("phone").test("+48 22 123 45 67")).toBe(true);
    expect(of("phone").test("+30 %")).toBe(false);
    expect(of("postcode").test("00-001")).toBe(true);
    expect(of("postcode").test("1012 AB")).toBe(true);
    expect(of("postcode").test("SW1A 1AA")).toBe(true);
    expect(of("postcode").test("10115 Berlin")).toBe(true);
    // The dataset is full of dates and hashes; neither is a postcode.
    expect(of("postcode").test("2026-09-01")).toBe(false);
    expect(of("postcode").test("stems_12")).toBe(false);
  });

  it("bans only marks that are traceable to `docs/research/competitors-*.md`", () => {
    const research = readdirSync(join(repoRoot, "docs/research"))
      .filter((name) => name.startsWith("competitors-"))
      .map((name) =>
        readFileSync(
          join(repoRoot, "docs/research", name),
          "utf8",
        ).toLowerCase(),
      )
      .join("\n");
    // Compared with hyphens and spaces removed on both sides: the studies write `1800flowers.com`
    // and `Bloom & Wild`, and the mark list has to catch `1-800-Flowers` and `bloomandwild` too.
    const squash = (value: string): string => value.replace(/[\s&-]+/gu, "");
    const squashed = squash(research);
    for (const mark of COMPETITOR_MARKS) {
      expect(squashed, mark).toContain(squash(mark));
    }
    expect(COMPETITOR_MARKS.length).toBeGreaterThanOrEqual(15);
  });

  it("does not ban the German and Polish words for `flowers`", () => {
    // `docs/research/**` is full of `blumen…` and `kwiaty…` because they are the search terms;
    // banning them would ban the `de` and `pl` copy. What is banned is a brand.
    for (const noun of ["blumen", "kwiaty", "fleurs", "fiori"]) {
      expect(COMPETITOR_MARKS).not.toContain(noun);
    }
  });

  it("finds nothing in the committed dataset", () => {
    expect(
      checkSeedDataset(tree).filter((problem) => problem.family === "privacy"),
    ).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* AC-30 / §11: the report.                                                   */
/* -------------------------------------------------------------------------- */

describe("spec 006 §11 / AC-30: the catalogue-health report", () => {
  let report: string;

  beforeAll(() => {
    report = seedHealthReport(tree);
  }, TREE_TIMEOUT);

  it("prints the product counts by type", () => {
    for (const [type, count] of Object.entries(PRODUCT_TYPE_SPLIT)) {
      expect(report).toContain(`| ${type} | ${String(count)} |`);
    }
    expect(report).toContain(`**${String(PRODUCT_COUNT)}**`);
  });

  it("prints the six-product coverage table with both sides of the threshold", () => {
    const rows = coverageRows(tree);
    expect(rows.some((row) => row.meetsThreshold)).toBe(true);
    expect(rows.some((row) => !row.meetsThreshold)).toBe(true);
    expect(report).toContain("six-product rule");
    expect(report).toContain("| PL | live | category |");
    expect(report).toContain("| DE | demo | occasion |");
    expect(report).toContain("Below the threshold in PL");
  });

  it("guarantees the PL set passes, so spec 008 can test both sides (spec 006 §6, spec 002 §6)", () => {
    const pl = coverageRows(tree).filter((row) => row.countryIso2 === "PL");
    // Every product-type root and every occasion *category* clears six in the launch destination.
    const categories = pl.filter(
      (row) => row.kind === "category" && !row.key.startsWith("flowerType:"),
    );
    expect(categories.length).toBeGreaterThan(0);
    for (const row of categories) {
      expect(row.products, row.key).toBeGreaterThanOrEqual(
        SIX_PRODUCT_THRESHOLD,
      );
      expect(row.pageExists, row.key).toBe(true);
    }
    // And the other side is real, not hypothetical: three flower hubs and the thin seasonal
    // occasions are below it, which is what spec 008's negative case needs.
    const below = pl.filter((row) => !row.meetsThreshold);
    expect(below.length).toBeGreaterThan(3);
    expect(below.map((row) => row.key)).toContain("flowerType:orchids");
  });

  it("prints the description word-count distribution and the copy review shares", () => {
    expect(report).toContain("description word counts");
    expect(report).toMatch(/min \d+ · median \d+ · max \d+/u);
    expect(report).toContain("copy review per locale");
    for (const locale of ["de", "pl"]) {
      const line = report
        .split("\n")
        .find((row) => row.startsWith(`| ${locale} |`));
      expect(line, locale).toBeDefined();
      // The machine-drafted locales must read 100 % machine and **not** ready.
      expect(line).toContain("100 %");
      expect(line).toContain("**no**");
    }
  });

  it("prints the stored image bytes, the committed total against its cap, the per-slot maxima and the placeholder count", () => {
    // Since TASK-138 the manifest total is reported, not capped — most bytes are in the media
    // bucket — while what is still committed (the site-origin `hero` ladder) is shown against the
    // 6 MB cap that still governs it.
    expect(report).toContain("reported, not capped");
    expect(report).toMatch(
      new RegExp(
        `Committed under \`public/media/\` \\(site origin: hero\\): 10 files, \\d+ B of ${String(COMMITTED_MEDIA_BYTE_CAP)} B`,
        "u",
      ),
    );
    for (const [slot, cap] of Object.entries(SLOT_BYTE_CAPS)) {
      expect(report).toContain(`| ${slot} | ${String(cap)} |`);
    }
    expect(report).toContain("Products still rendering the placeholder");
    expect(SLOTS_WITHOUT_A_CAP).toEqual([]);
  });

  it("surfaces the ten category/occasion `seoTitle` near-duplicate pairs (`/review 41`)", () => {
    const pairs = seoTitleNearDuplicates(tree);
    expect(pairs).toHaveLength(10);
    expect(pairs.map((pair) => pair.key)).toContain("birthday");
    for (const pair of pairs) {
      expect(pair.categoryTitle.length).toBeGreaterThan(10);
      expect(pair.occasionTitle.length).toBeGreaterThan(10);
    }
    expect(report).toContain("`seoTitle` near-duplicates (10 pairs)");
    expect(report).toContain("nominate the primary");
  });
});

describe("§11: a locale or a country cannot look ready in CI while it is gated in code", () => {
  it("computes locale readiness from `isLocaleIndexable()` itself", () => {
    for (const locale of localeReadiness(tree)) {
      expect(locale.indexable, locale.locale).toBe(
        isLocaleIndexable(locale.locale),
      );
      // Ready implies indexable, in both directions of the implication that matters: a locale
      // whose copy is entirely machine-drafted can never read ready.
      if (locale.ready) expect(locale.indexable, locale.locale).toBe(true);
      if (locale.machineShare > 0)
        expect(locale.ready, locale.locale).toBe(false);
    }
  });

  it("reports `de` and `pl` as not ready, which is the correct answer and not a failure", () => {
    const byLocale = new Map(
      localeReadiness(tree).map((locale) => [locale.locale, locale]),
    );
    for (const locale of ["de", "pl"]) {
      expect(byLocale.get(locale)?.machineShare, locale).toBe(1);
      expect(byLocale.get(locale)?.ready, locale).toBe(false);
    }
    expect(byLocale.get("en")?.ready).toBe(true);
    for (const locale of launchLocales) {
      expect(byLocale.has(locale), locale).toBe(true);
    }
  });

  it("shows a page for a country only when the country is `live` in code", () => {
    const live = new Set<string>(
      COUNTRIES.filter((country) => country.status === "live").map(
        (country) => country.iso2,
      ),
    );
    for (const row of coverageRows(tree)) {
      if (!row.pageExists) continue;
      expect(live.has(row.countryIso2), row.countryIso2).toBe(true);
      expect(row.products).toBeGreaterThanOrEqual(SIX_PRODUCT_THRESHOLD);
    }
    // And a demo destination with plenty of products still shows no page.
    const demo = coverageRows(tree).filter(
      (row) => row.countryStatus === "demo" && row.meetsThreshold,
    );
    expect(demo.length).toBeGreaterThan(0);
    expect(demo.every((row) => !row.pageExists)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Spec 009 AC-2 / T-02: the delivery-calendar rules and the picker summary.  */
/* -------------------------------------------------------------------------- */

/**
 * The tree with one year of Poland's holiday rows removed, through the case overlay every other
 * fixture uses. It asserts that it removed all fourteen, because a removal that matched nothing
 * would leave each case below quietly asserting the committed tree (TASK-149).
 */
function withoutHolidayYear(base: SeedTree, year: number): SeedTree {
  const file = base.raw.get("holidays.json") as {
    rows: { iso2: string; date: string }[];
  };
  const ops = file.rows
    .filter(
      (row) => row.iso2 === "PL" && row.date.startsWith(`${String(year)}-`),
    )
    .map((row) => ({
      op: "removeRow" as const,
      match: { iso2: "PL", date: row.date },
    }));
  expect(ops).toHaveLength(14);
  return applySeedCheckCase(
    base,
    {
      family: "calendar",
      rule: "holiday-coverage",
      replaces: "holidays.json",
      expect: `PL/${String(year)}`,
      alsoFamilies: [],
      why: `TASK-149: Poland's ${String(year)} rows removed, to replay the edge they close.`,
      ops,
    },
    () => ({}),
  );
}

/** The tree judged at another instant: what `--as-of=` does to the CLI. */
const atInstant = (base: SeedTree, instant: string): SeedTree => ({
  ...base,
  asOf: new Date(instant),
});

describe("spec 009 AC-2: the calendar family and the product-slug rule", () => {
  it("routes a product slug by the same translation status the catalogue does", () => {
    expect(ROUTED_SLUG_TRANSLATION_STATUS).toBe(AUTHORED_TRANSLATION_STATUS);
  });

  it("gives Poland — and nobody else — a horizon, of the picker's full 366 days in Warsaw", () => {
    expect(calendarHorizons(tree)).toEqual([
      {
        iso2: "PL",
        timeZone: "Europe/Warsaw",
        from: "2026-09-23",
        through: "2027-09-24",
        years: [2026, 2027],
      },
    ]);
  });

  it(
    "measures the horizon from today in the destination, not in UTC",
    () => {
      // 23:30 UTC on 30 Dec is already 31 Dec in Warsaw, so the horizon reaches 2028.
      const late = { ...tree, asOf: new Date("2026-12-30T23:30:00Z") };
      expect(calendarHorizons(late)[0]?.from).toBe("2026-12-31");
      expect(calendarHorizons(late)[0]?.years).toEqual([2026, 2027, 2028]);
      const calendarProblems = (subject: SeedTree): string[] =>
        checkSeedDataset(subject)
          .filter((problem) => problem.family === "calendar")
          .map((problem) => `${problem.rule} ${problem.key}`);
      // TASK-149's rows close the gap the horizon opens that night; without them it is red.
      expect(calendarProblems(late)).toEqual([]);
      expect(calendarProblems(withoutHolidayYear(late, 2028))).toEqual([
        "holiday-coverage PL/2028",
      ]);
    },
    TREE_TIMEOUT,
  );

  it(
    "names a year in the middle of the horizon too, not only the last one",
    () => {
      const withoutFirstYear: SeedCheckCase = {
        family: "calendar",
        rule: "holiday-coverage",
        replaces: "holidays.json",
        expect: "PL/2026",
        alsoFamilies: [],
        why: "spec 009 AC-2, driven from a literal: the horizon's first year is uncovered.",
        ops: [{ op: "clearRows" }],
      };
      const problems = checkSeedDataset(
        applySeedCheckCase(tree, withoutFirstYear, () => ({})),
      ).filter((problem) => problem.rule === "holiday-coverage");
      expect(problems.map((problem) => problem.key)).toEqual([
        "PL/2026",
        "PL/2027",
      ]);
      // The first uncovered date of the current year is today, not 1 January.
      expect(problems[0]?.message).toContain(
        "the first uncovered date is 2026-09-23",
      );
    },
    TREE_TIMEOUT,
  );

  it("prints the picker state of every destination as the step summary's second line (spec 009 §11)", async () => {
    const report = pickerStateReport(tree).join("\n");
    expect(report).toContain(
      "| PL | yes | Europe/Warsaw · 14:00 · days 1,2,3,4,5,6 · Sunday none | no | **preview** | 2026, 2027, 2028 | 2026-09-23 → 2027-09-24 | yes |",
    );
    for (const iso2 of ["DE", "FR", "ES", "IT", "RO", "NL"]) {
      expect(report).toContain(
        `| ${iso2} | yes | none | no | **unavailable** | — | — | — |`,
      );
    }
    expect(report).toContain(
      "Destinations promising a delivery date today: **none**.",
    );
    expect(seedHealthReport(tree)).toContain(
      "#### delivery picker state per destination (spec 009 §11)",
    );
    await withActivePartnersProvider(
      { hasActivePartners: (iso2) => iso2 === "PL" },
      () => {
        const live = pickerStateReport(tree).join("\n");
        expect(live).toContain(
          "| PL | yes | Europe/Warsaw · 14:00 · days 1,2,3,4,5,6 · Sunday none | yes | **live** |",
        );
        expect(live).toContain(
          "Destinations promising a delivery date today: PL.",
        );
      },
    );
  });
});

/* -------------------------------------------------------------------------- */
/* TASK-149: the holiday-coverage early warning.                              */
/* -------------------------------------------------------------------------- */

/**
 * `holiday-coverage` is right to go red the day the horizon reaches a year with no rows; what it
 * must not be is a surprise. `--report` prints the days left for every published destination,
 * and under 60 the report carries a warning line CI's step summary repeats. Every count below was
 * worked by hand from the calendar (2028 is a leap year), not read back from the code.
 */
describe("TASK-149: the holiday-coverage runway and its 60-day warning", () => {
  const WARNING_59_DAYS_2028 =
    "holiday coverage early warning: PL goes red in 59 days, on 2028-01-01 (Europe/Warsaw), the first day its 366-day picker horizon reaches 2029 with no holiday row; author PL's 2029 rows in seed/data/holidays.json (spec 009 AC-2).";

  it("warns under 60 days, and not at 60", () => {
    expect(HOLIDAY_COVERAGE_WARNING_DAYS).toBe(60);
    expect(HOLIDAY_COVERAGE_WARNING_MARKER).toBe(
      "holiday coverage early warning:",
    );
  });

  it(
    "counts the days to the first red day, from today in Warsaw",
    () => {
      // 23 Sep 2026 → 1 Jan 2028 is 99 + 1 + 365 days; without 2028's rows, 99 to 31 Dec 2026.
      expect(holidayCoverageRunway(tree)).toEqual([
        {
          iso2: "PL",
          timeZone: "Europe/Warsaw",
          from: "2026-09-23",
          firstUncoveredYear: 2029,
          redOn: "2028-01-01",
          daysLeft: 465,
        },
      ]);
      expect(holidayCoverageRunway(withoutHolidayYear(tree, 2028))).toEqual([
        {
          iso2: "PL",
          timeZone: "Europe/Warsaw",
          from: "2026-09-23",
          firstUncoveredYear: 2028,
          redOn: "2026-12-31",
          daysLeft: 99,
        },
      ]);
    },
    TREE_TIMEOUT,
  );

  it(
    "reaches 0 the minute the rule goes red, and is 1 the minute before",
    () => {
      const coverage = (subject: SeedTree): string[] =>
        checkSeedDataset(subject)
          .filter((problem) => problem.rule === "holiday-coverage")
          .map((problem) => problem.key);
      // With 2028: 23:59 on 31 Dec 2027 in Warsaw is green, 00:00 on 1 Jan 2028 is red on 2029.
      const lastGreen = atInstant(tree, "2027-12-31T22:59:00Z");
      const firstRed = atInstant(tree, "2027-12-31T23:00:00Z");
      expect(holidayCoverageRunway(lastGreen)[0]?.daysLeft).toBe(1);
      expect(coverage(lastGreen)).toEqual([]);
      expect(holidayCoverageRunway(firstRed)[0]?.daysLeft).toBe(0);
      expect(coverage(firstRed)).toEqual(["PL/2029"]);
      // Without 2028: the edge TASK-149 was opened for, 2026-12-30 23:00 UTC.
      const bare = withoutHolidayYear(tree, 2028);
      expect(
        holidayCoverageRunway(atInstant(bare, "2026-12-30T22:59:00Z"))[0]
          ?.daysLeft,
      ).toBe(1);
      expect(coverage(atInstant(bare, "2026-12-30T22:59:00Z"))).toEqual([]);
      expect(
        holidayCoverageRunway(atInstant(bare, "2026-12-30T23:00:00Z"))[0]
          ?.daysLeft,
      ).toBe(0);
      expect(coverage(atInstant(bare, "2026-12-30T23:00:00Z"))).toEqual([
        "PL/2028",
      ]);
    },
    TREE_TIMEOUT,
  );

  it("prints the warning at 59 days left, and not at 60 or 61", () => {
    // 00:00 on 3 Nov 2027 in Warsaw is 59 days before 1 Jan 2028; one minute earlier is 60.
    const at59 = holidayCoverageReport(
      atInstant(tree, "2027-11-02T23:00:00Z"),
    ).join("\n");
    expect(at59).toContain(
      "| PL | 2027-11-03 | 2029 | 2028-01-01 (Europe/Warsaw) | 59 |",
    );
    expect(at59).toContain(`\n${WARNING_59_DAYS_2028}\n`);
    for (const [instant, today, days] of [
      ["2027-11-02T22:59:00Z", "2027-11-02", "60"],
      ["2027-11-01T12:00:00Z", "2027-11-01", "61"],
    ] as const) {
      const quiet = holidayCoverageReport(atInstant(tree, instant)).join("\n");
      expect(quiet).toContain(
        `| PL | ${today} | 2029 | 2028-01-01 (Europe/Warsaw) | ${days} |`,
      );
      expect(quiet).not.toContain(HOLIDAY_COVERAGE_WARNING_MARKER);
      expect(quiet).toContain("No destination is within 60 days of going red.");
    }
  });

  it("says `1 day` and `red today` at the last two counts", () => {
    expect(
      holidayCoverageReport(atInstant(tree, "2027-12-31T22:59:00Z")).join("\n"),
    ).toContain(
      "holiday coverage early warning: PL goes red in 1 day, on 2028-01-01 (Europe/Warsaw), the first day its 366-day picker horizon reaches 2029 with no holiday row; author PL's 2029 rows in seed/data/holidays.json (spec 009 AC-2).",
    );
    expect(
      holidayCoverageReport(atInstant(tree, "2027-12-31T23:00:00Z")).join("\n"),
    ).toContain(
      "holiday coverage early warning: PL is red today, 2028-01-01 (Europe/Warsaw): its 366-day picker horizon reaches 2029, which has no holiday row; author PL's 2029 rows in seed/data/holidays.json (spec 009 AC-2).",
    );
  });

  it(
    "days past the red day: 0 left and red today, never negative (/break 133 hole 1)",
    () => {
      // 5 Jan 2028 without the 2028 rows: the horizon first reached 2028 on 31 Dec 2026, 370 days
      // ago. The runway is clamped to today; unclamped it would read 2026-12-31 and -370.
      const late = atInstant(
        withoutHolidayYear(tree, 2028),
        "2028-01-05T12:00:00Z",
      );
      expect(holidayCoverageRunway(late)).toEqual([
        {
          iso2: "PL",
          timeZone: "Europe/Warsaw",
          from: "2028-01-05",
          firstUncoveredYear: 2028,
          redOn: "2028-01-05",
          daysLeft: 0,
        },
      ]);
      const report = holidayCoverageReport(late).join("\n");
      expect(report).toContain(
        "| PL | 2028-01-05 | 2028 | 2028-01-05 (Europe/Warsaw) | 0 |",
      );
      expect(report).toContain(
        "\nholiday coverage early warning: PL is red today, 2028-01-05 (Europe/Warsaw): its 366-day picker horizon reaches 2028, which has no holiday row; author PL's 2028 rows in seed/data/holidays.json (spec 009 AC-2).\n",
      );
      // And the rule agrees: red, on both years the horizon now spans.
      expect(
        checkSeedDataset(late)
          .filter((problem) => problem.rule === "holiday-coverage")
          .map((problem) => problem.key),
      ).toEqual(["PL/2028", "PL/2029"]);
    },
    TREE_TIMEOUT,
  );

  it("counts each destination's own years, not every country's (/break 133 hole 3)", () => {
    // PL has no 2028 rows; a DE row for 2028 must not lend PL a year it does not have.
    const pooled = applySeedCheckCase(
      withoutHolidayYear(tree, 2028),
      {
        family: "calendar",
        rule: "holiday-coverage",
        replaces: "holidays.json",
        expect: "PL/2028",
        alsoFamilies: [],
        why: "/break 133 hole 3: another country's 2028 row beside Poland's missing year.",
        ops: [
          {
            op: "addRow",
            row: {
              iso2: "DE",
              date: "2028-01-01",
              nameKey: "delivery.holiday.de.newYear",
              closed: true,
            },
          },
        ],
      },
      () => ({}),
    );
    const at = atInstant(pooled, "2026-11-02T12:00:00Z");
    expect(holidayCoverageRunway(at)).toEqual([
      {
        iso2: "PL",
        timeZone: "Europe/Warsaw",
        from: "2026-11-02",
        firstUncoveredYear: 2028,
        redOn: "2026-12-31",
        daysLeft: 59,
      },
    ]);
    expect(holidayCoverageReport(at).join("\n")).toContain(
      "\nholiday coverage early warning: PL goes red in 59 days, on 2026-12-31 (Europe/Warsaw), the first day its 366-day picker horizon reaches 2028 with no holiday row; author PL's 2028 rows in seed/data/holidays.json (spec 009 AC-2).\n",
    );
  });

  it("is quiet on the day it was written, with or without the 2028 rows", () => {
    // 2 Oct 2026: 456 days with the rows; 90 without them (the red day is 31 Dec 2026, so the
    // last green day, 30 Dec, is 89 days out). Neither is under 60.
    const today = "2026-10-02T12:00:00Z";
    const withRows = holidayCoverageReport(atInstant(tree, today)).join("\n");
    expect(withRows).toContain(
      "| PL | 2026-10-02 | 2029 | 2028-01-01 (Europe/Warsaw) | 456 |",
    );
    expect(withRows).not.toContain(HOLIDAY_COVERAGE_WARNING_MARKER);
    const bare = holidayCoverageReport(
      atInstant(withoutHolidayYear(tree, 2028), today),
    ).join("\n");
    expect(bare).toContain(
      "| PL | 2026-10-02 | 2028 | 2026-12-31 (Europe/Warsaw) | 90 |",
    );
    expect(bare).not.toContain(HOLIDAY_COVERAGE_WARNING_MARKER);
  });

  it("lists every published destination, and says which render no calendar", () => {
    const report = holidayCoverageReport(tree).join("\n");
    expect(report).toContain("#### holiday coverage runway (spec 009 AC-2)");
    for (const iso2 of ["DE", "FR", "ES", "IT", "RO", "NL"]) {
      expect(report).toContain(`| ${iso2} | — | — | — | no calendar |`);
    }
    expect(seedHealthReport(tree)).toContain(
      "#### holiday coverage runway (spec 009 AC-2)",
    );
  });
});

/* -------------------------------------------------------------------------- */
/* The CLI (AC-10's exit codes).                                              */
/* -------------------------------------------------------------------------- */

/**
 * `pnpm seed:check` as CI runs it, with `$GITHUB_STEP_SUMMARY` pointed at `summary` (or nowhere),
 * so a test never appends to the summary of the CI run executing it.
 */
function runSeedCheck(
  args: readonly string[],
  summary = "",
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync("node", ["seed/check.ts", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, GITHUB_STEP_SUMMARY: summary },
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

/** A private copy of the dataset under `$TMPDIR` with one year of Poland's rows removed. */
function writeTreeWithoutHolidayYear(year: number): string {
  const root = mkdtempSync(join(tmpdir(), "fo-seed-runway-"));
  cpSync(join(repoRoot, SEED_DATA_DIR), join(root, SEED_DATA_DIR), {
    recursive: true,
  });
  for (const directory of ["messages", "content", "public"]) {
    symlinkSync(join(repoRoot, directory), join(root, directory));
  }
  writeFileSync(
    join(root, SEED_DATA_DIR, "holidays.json"),
    JSON.stringify(
      withoutHolidayYear(tree, year).raw.get("holidays.json"),
      null,
      2,
    ),
  );
  return root;
}

describe("the `pnpm seed:check` CLI", () => {
  it(
    "exits 0 on the committed tree and prints what it read",
    () => {
      const stdout = execFileSync(
        "node",
        ["seed/check.ts", `--as-of=${AS_OF.toISOString()}`],
        { cwd: repoRoot, encoding: "utf8" },
      );
      expect(stdout).toContain("all ten rule families clean");
    },
    TREE_TIMEOUT,
  );

  it(
    "goes red the Warsaw day Poland's committed holidays stop covering the horizon, and not a minute before (spec 009 AC-2)",
    () => {
      // 31 Dec 2027 23:59 in Warsaw: the horizon ends 31 Dec 2028, inside the committed rows.
      const before = runSeedCheck(["--as-of=2027-12-31T22:59:00Z"]);
      expect(before.status).toBe(0);
      expect(before.stdout).toContain("all ten rule families clean");

      // 1 Jan 2028 00:00 in Warsaw: the horizon reaches 1 Jan 2029, and there is no 2029 row.
      const after = runSeedCheck(["--as-of=2027-12-31T23:00:00Z"]);
      expect(after.status).toBe(1);
      expect(after.stderr).toContain(
        "seed/data/holidays.json: [calendar/holiday-coverage] `PL/2029`",
      );
      expect(after.stderr).toContain("the first uncovered date is 2029-01-01");
      expect(after.stderr).toContain("1 problem(s) in 1 rule family/families");
    },
    TREE_TIMEOUT,
  );

  it(
    "without the 2028 rows: warns at 59 days, is quiet at 61, and fails on `PL/2028` past the edge (TASK-149)",
    () => {
      const root = writeTreeWithoutHolidayYear(2028);
      try {
        // 2 Nov 2026 is 59 days before 31 Dec 2026, the first red day.
        const at59 = runSeedCheck([
          root,
          "--report",
          "--as-of=2026-11-02T12:00:00Z",
        ]);
        expect(at59.status).toBe(0);
        expect(at59.stdout).toContain(
          "\nholiday coverage early warning: PL goes red in 59 days, on 2026-12-31 (Europe/Warsaw), the first day its 366-day picker horizon reaches 2028 with no holiday row; author PL's 2028 rows in seed/data/holidays.json (spec 009 AC-2).\n",
        );
        expect(at59.stdout).toContain(
          "| PL | 2026-11-02 | 2028 | 2026-12-31 (Europe/Warsaw) | 59 |",
        );

        const at61 = runSeedCheck([
          root,
          "--report",
          "--as-of=2026-10-31T12:00:00Z",
        ]);
        expect(at61.status).toBe(0);
        expect(at61.stdout).toContain(
          "| PL | 2026-10-31 | 2028 | 2026-12-31 (Europe/Warsaw) | 61 |",
        );
        expect(at61.stdout).not.toContain(HOLIDAY_COVERAGE_WARNING_MARKER);

        const past = runSeedCheck([root, "--as-of=2026-12-30T23:00:00Z"]);
        expect(past.status).toBe(1);
        expect(past.stderr).toContain(
          "seed/data/holidays.json: [calendar/holiday-coverage] `PL/2028`",
        );
        expect(past.stderr).toContain("the first uncovered date is 2028-01-01");
        expect(past.stderr).toContain("1 problem(s) in 1 rule family/families");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
    TREE_TIMEOUT,
  );

  it("refuses an `--as-of=` that is not an instant", () => {
    let status = 0;
    try {
      execFileSync("node", ["seed/check.ts", "--as-of=next-tuesday"], {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      status = (error as { status?: number }).status ?? 0;
    }
    expect(status).toBe(2);
  });

  it(
    "exits non-zero with one line per problem on a faulty tree",
    () => {
      // A real subprocess over a real (temporary) tree, because an exit code is not a return
      // value: `seed:check` is a CI job, and the job's contract is the status code.
      const faultyCase = cases.find(
        (testCase) => testCase.value.family === "copy",
      );
      if (faultyCase === undefined) throw new Error("no copy case");
      const mutated = applySeedCheckCase(tree, faultyCase.value, (file) =>
        JSON.parse(readFileSync(join(faultyCase.dir, file), "utf8")),
      );
      const root = mkdtempSync(join(tmpdir(), "fo-seed-check-"));
      cpSync(join(repoRoot, SEED_DATA_DIR), join(root, SEED_DATA_DIR), {
        recursive: true,
      });
      for (const directory of ["messages", "content"]) {
        symlinkSync(join(repoRoot, directory), join(root, directory));
      }
      const path = faultyCase.value.replaces;
      const target = join(root, SEED_DATA_DIR, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, JSON.stringify(mutated.raw.get(path), null, 2));

      let status = 0;
      let output = "";
      try {
        execFileSync("node", ["seed/check.ts", root], {
          cwd: repoRoot,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (error) {
        const failure = error as { status?: number; stderr?: string };
        status = failure.status ?? 0;
        output = failure.stderr ?? "";
      }
      expect(status).toBe(1);
      expect(output).toContain("seed:check failed with");
      expect(output).toContain(faultyCase.value.expect);
      // One line per problem, and the line names the file.
      expect(output).toContain(`${SEED_DATA_DIR}/${path}`);
    },
    TREE_TIMEOUT,
  );
});

/* -------------------------------------------------------------------------- */
/* T-30 / AC-30: the CI job.                                                  */
/* -------------------------------------------------------------------------- */

describe("spec 006 AC-30 / T-30: the `seed-check` CI job", () => {
  const ci = parse(
    readFileSync(join(repoRoot, ".github/workflows/ci.yml"), "utf8"),
  ) as {
    jobs: Record<
      string,
      {
        name?: string;
        needs?: string | string[];
        if?: string;
        "continue-on-error"?: boolean;
        "timeout-minutes"?: number;
        steps: { run?: string; if?: string }[];
      }
    >;
  };
  const job = ci.jobs["seed-check"];

  it("exists, is named after itself and is bounded by a timeout", () => {
    expect(job).toBeDefined();
    expect(job?.name).toBe("seed-check");
    expect(job?.["timeout-minutes"]).toBeGreaterThan(0);
  });

  it("hangs off `typecheck`, as spec 001 §14 A9 places a data gate", () => {
    expect(job?.needs).toBe("typecheck");
  });

  it("runs the gate with `--report`, so the §11 report is the step summary", () => {
    const scripts = (job?.steps ?? []).map((step) => step.run ?? "").join("\n");
    expect(scripts).toContain("pnpm seed:check --report");
    const summary = (job?.steps ?? []).find((step) =>
      (step.run ?? "").includes("GITHUB_STEP_SUMMARY"),
    );
    expect(summary?.if).toBe("always()");
  });

  it("tees the gate's stdout and stderr into the log the summary step reads (/break 133 hole 2)", () => {
    // The warning is on stdout (the report) and the failure on stderr; the summary step greps
    // `seed-check.log` for both. Run the gate step's own script with a `pnpm` that prints one of
    // each, and the log must hold both — a dropped `tee`, or `2>` alone, leaves one out.
    const gate = (job?.steps ?? []).filter(
      (step) =>
        (step.run ?? "").includes("pnpm seed:check --report") &&
        !(step.run ?? "").includes("GITHUB_STEP_SUMMARY"),
    );
    expect(gate).toHaveLength(1);
    const dir = mkdtempSync(join(tmpdir(), "fo-seed-gate-"));
    try {
      const bin = join(dir, "stub-bin");
      mkdirSync(bin);
      writeFileSync(
        join(bin, "pnpm"),
        [
          "#!/bin/sh",
          'echo "argv: $*"',
          'echo "holiday coverage early warning: stdout line"',
          'echo "seed:check failed with 1 problem(s): stderr line" >&2',
          "exit 0",
          "",
        ].join("\n"),
        { mode: 0o755 },
      );
      const result = spawnSync(
        "bash",
        ["--noprofile", "--norc", "-eo", "pipefail", "-c", gate[0]?.run ?? ""],
        {
          cwd: dir,
          encoding: "utf8",
          env: { ...process.env, PATH: `${bin}:${process.env["PATH"] ?? ""}` },
        },
      );
      expect(result.status).toBe(0);
      expect(readFileSync(join(dir, "seed-check.log"), "utf8")).toBe(
        [
          "argv: seed:check --report",
          "holiday coverage early warning: stdout line",
          "seed:check failed with 1 problem(s): stderr line",
          "",
        ].join("\n"),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it(
    "repeats the holiday-coverage warning in the step summary at 59 days, and not at 61 (TASK-149)",
    () => {
      const step = (job?.steps ?? []).find((candidate) =>
        (candidate.run ?? "").includes("GITHUB_STEP_SUMMARY"),
      );
      expect(step?.run).toContain(HOLIDAY_COVERAGE_WARNING_MARKER);
      // The job, end to end: the gate tees its log, then the summary step reads that log.
      const runJob = (instant: string): string => {
        const dir = mkdtempSync(join(tmpdir(), "fo-seed-summary-"));
        try {
          const summaryFile = join(dir, "summary.md");
          writeFileSync(summaryFile, "");
          const gate = runSeedCheck(
            ["--report", `--as-of=${instant}`],
            summaryFile,
          );
          expect(gate.status).toBe(0);
          writeFileSync(
            join(dir, "seed-check.log"),
            `${gate.stdout}${gate.stderr}`,
          );
          const script = (step?.run ?? "").replace(
            /\$\{\{[^}]*\}\}/g,
            "success",
          );
          const result = spawnSync(
            "bash",
            ["--noprofile", "--norc", "-e", "-o", "pipefail", "-c", script],
            {
              cwd: dir,
              encoding: "utf8",
              env: { ...process.env, GITHUB_STEP_SUMMARY: summaryFile },
            },
          );
          expect(result.status).toBe(0);
          return readFileSync(summaryFile, "utf8");
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      };
      // 3 Nov 2027 in Warsaw is 59 days before 1 Jan 2028, the committed rows' first red day.
      const at59 = runJob("2027-11-03T12:00:00Z");
      expect(at59).toContain(
        "> [!WARNING]\n> - holiday coverage early warning: PL goes red in 59 days, on 2028-01-01 (Europe/Warsaw), the first day its 366-day picker horizon reaches 2029 with no holiday row; author PL's 2029 rows in seed/data/holidays.json (spec 009 AC-2).\n",
      );
      const at61 = runJob("2027-11-01T12:00:00Z");
      expect(at61).toContain(
        "| PL | 2027-11-01 | 2029 | 2028-01-01 (Europe/Warsaw) | 61 |",
      );
      expect(at61).not.toContain("[!WARNING]");
      expect(at61).not.toContain(HOLIDAY_COVERAGE_WARNING_MARKER);
    },
    TREE_TIMEOUT,
  );

  it("is a required check, so a broken dataset cannot be merged past it", () => {
    expect(job?.["continue-on-error"]).toBeUndefined();
  });

  it("shares `i18n-check`'s and `catalogue-check`'s on-demand condition", () => {
    // spec 001 §14 A14's Actions-minutes budget: the data gates run with `ci:full` or a manual
    // dispatch, and the same rules run in the spine through this file. Being in the same set as
    // its siblings is asserted rather than described.
    expect(job?.if).toBe(ci.jobs["catalogue-check"]?.if);
    expect(job?.if).toContain("ci:full");
  });

  it("is in `scripts/branch-protection.ts`'s derived required set", async () => {
    const { checkContract, readWorkflows } =
      await import("../../scripts/branch-protection.ts");
    expect(checkContract(readWorkflows(repoRoot)).required).toContain(
      "seed-check",
    );
  });

  it("is documented in `README.md` and `seed/README.md`", () => {
    expect(readFileSync(join(repoRoot, "README.md"), "utf8")).toContain(
      "pnpm seed:check",
    );
    const seedReadme = readFileSync(join(repoRoot, "seed/README.md"), "utf8");
    expect(seedReadme).toContain("ten rule families");
    expect(seedReadme).toContain("`--report`");
  });
});
