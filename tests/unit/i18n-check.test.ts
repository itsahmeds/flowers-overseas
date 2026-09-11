/**
 * `pnpm i18n:check` (T-22 / AC-22, T-13 / AC-13; TASK-040).
 *
 * Two halves, both driven the way spec 001's SEO validators are driven — the **real CLI in a child
 * process**, pointed at a fixture tree with `--messages-dir`, `--src` and `--registry`:
 *
 *  - **AC-22**: the committed tree exits 0, and each of the seven seeded faults exits non-zero
 *    naming the file and the key. The fixtures live in `tests/fixtures/i18n/_cases/<fault>/`, one
 *    directory per fault, each a miniature three-key catalogue set with its own `src/usage.ts`, so
 *    a case fails for exactly the reason it is named after and the committed catalogues are never
 *    mutated to prove a failure.
 *  - **AC-13**: `localePath()` is the only URL builder, so the per-locale output for every
 *    `plan/02` §4.1 page type is pinned here as a table; and the four malformed `pathSegments`
 *    registries (uppercase, non-ASCII, trailing slash, duplicate within one locale) each fail the
 *    check while the live registry passes.
 *
 * Running the CLI rather than importing `runCheck()` is deliberate: the exit code *is* the
 * acceptance criterion, and an in-process call cannot observe `process.exit`. The pure helpers
 * (`argumentSignature`, `pathSegmentProblems`, `formatSummary`) are unit-tested directly, because
 * their rules — particularly "plural categories are not part of a message's signature" — are the
 * ones a future edit is most likely to get wrong.
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  argumentSignature,
  formatShare,
  formatSummary,
  pathSegmentProblems,
} from "../../scripts/i18n-check.ts";
import { PATH_SEGMENT_KEYS } from "../../src/config/locales.ts";
import { PAGE_TYPES, localePath } from "../../src/modules/i18n/routing.ts";

const repoRoot = resolve(__dirname, "../..");
const casesDir = "tests/fixtures/i18n/_cases";

interface CliResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

function runCli(...args: readonly string[]): CliResult {
  try {
    const stdout = execFileSync(
      process.execPath,
      ["scripts/i18n-check.ts", ...args],
      { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    const failure = error as {
      status?: number;
      stdout?: string;
      stderr?: string;
    };
    return {
      status: failure.status ?? 1,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
    };
  }
}

/** A fault case: its own catalogues and its own consumer tree. */
function runCase(name: string, ...args: readonly string[]): CliResult {
  return runCli(
    "--messages-dir",
    `${casesDir}/${name}`,
    "--src",
    `${casesDir}/${name}/src`,
    ...args,
  );
}

describe("the committed tree (AC-22, first clause)", () => {
  it("exits 0 with no missing, unused, stale or malformed key", () => {
    const result = runCli();
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("4 locale(s) ok");
  });

  it("prints the §11 per-locale table under --summary, with de and pl not indexable", () => {
    const result = runCli("--summary");
    expect(result.status).toBe(0);
    // The table is the founder-facing number: `de` and `pl` are echoed English, so they must read
    // 100 % unreviewed and `no`. `en`/`en-gb` carry the founder's review queue — one authored key
    // at the time of writing (`/review 58`) — and must stay far below 5 % and read `yes`; the
    // queue's exact contents are pinned in `i18n-messages-schema.test.ts`.
    for (const locale of ["en", "en-gb"]) {
      expect(result.stdout, locale).toMatch(
        new RegExp(
          `\\| \`${locale}\` \\| \\d+ \\| 0 \\| \\d+ \\| [0-4]\\.\\d% \\| 0 \\| yes \\|`,
        ),
      );
    }
    for (const locale of ["de", "pl"]) {
      expect(result.stdout).toMatch(
        new RegExp(
          `\\| \`${locale}\` \\| \\d+ \\| 0 \\| \\d+ \\| 100\\.0% \\| 0 \\| no \\|`,
        ),
      );
    }
  });

  it("says nothing about a locale on a clean fixture tree either", () => {
    const result = runCase("clean");
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });
});

/**
 * AC-22's seven faults, in the order the AC lists them. Each row is the case directory, the file
 * the message must name, the key it must name, and a fragment of the reason — so a rewording that
 * loses the file, the key or the diagnosis fails the test.
 */
const FAULTS = [
  {
    fault: "a key missing from `en`'s dependants after fallback resolution",
    directory: "missing-key",
    file: "missing-key/de.json",
    key: "errors.notFound.heading",
    reason: /is missing after fallback resolution \(chain de -> en\)/,
  },
  {
    fault: "an unused key without `meta.retained`",
    directory: "unused-key",
    file: "unused-key/en.json",
    key: "meta.home.subtitle",
    reason: /is unused: no `t\(\)` call or catalogue read/,
  },
  {
    fault: "an ICU syntax error",
    directory: "icu-syntax",
    file: "icu-syntax/de.json",
    key: "errors.notFound.heading",
    reason: /is not valid ICU MessageFormat at column \d+/,
  },
  {
    fault: "an argument-set mismatch between `en` and `de`",
    directory: "argument-mismatch",
    file: "argument-mismatch/de.json",
    key: "banner.headline",
    reason:
      /argument set differs from `en`: expected \{language:argument\}, found \{\}/,
  },
  {
    fault: "a redundant `en-gb` override",
    directory: "redundant-override",
    file: "redundant-override/en-gb.json",
    key: "errors.notFound.heading",
    reason: /is a redundant override: identical to `en`/,
  },
  {
    fault: "a key without a meta entry",
    directory: "missing-meta",
    file: "missing-meta/en.meta.json",
    key: "banner.headline",
    reason: /has no review record/,
  },
  {
    fault: "a stale `sourceHash`",
    directory: "stale-hash",
    file: "stale-hash/de.meta.json",
    key: "meta.home.title",
    reason: /has a stale sourceHash/,
  },
] as const;

describe("the seven seeded faults (AC-22 / T-22)", () => {
  it.each(FAULTS)("$fault", ({ directory, file, key, reason }) => {
    const result = runCase(directory);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("i18n:check failed with");
    const line = result.stderr
      .split("\n")
      .find((candidate) => candidate.includes(`[${key}]`));
    expect(line, `no line names the key ${key}`).toBeDefined();
    expect(line).toContain(file);
    expect(line).toMatch(reason);
  });

  it("says stale differently for a reviewed translation than for an undrafted one", () => {
    // Both are errors (see the script header), but the action differs: re-review versus re-run
    // `i18n:draft`. The fixture's record is unreviewed, so it must name the script.
    expect(runCase("stale-hash").stderr).toContain(
      "re-run `pnpm i18n:draft --locale de`",
    );
  });

  it("keeps the fault cases out of the committed catalogue check", () => {
    // The cases are read with `--messages-dir`; nothing about them can turn the default run red.
    expect(runCli().status).toBe(0);
  });
});

describe("pathSegments shape and per-locale uniqueness (AC-13 / T-13)", () => {
  const MALFORMED = [
    {
      what: "an uppercase character",
      fixture: "registry-uppercase.json",
      key: "en.pathSegments.destinations",
      reason: /must be lowercase ASCII/,
    },
    {
      what: "a non-ASCII character",
      fixture: "registry-non-ascii.json",
      key: "de.pathSegments.occasions",
      reason: /must be lowercase ASCII/,
    },
    {
      what: "a trailing slash",
      fixture: "registry-trailing-slash.json",
      key: "en.pathSegments.legal",
      reason: /no slash and no trailing separator/,
    },
    {
      what: "a duplicate within one locale",
      fixture: "registry-duplicate.json",
      key: "pl.pathSegments.product",
      reason: /is already used by `occasions` in locale `pl`/,
    },
  ] as const;

  it.each(MALFORMED)(
    "fails a registry with $what",
    ({ fixture, key, reason }) => {
      const result = runCli("--registry", `${casesDir}/${fixture}`);
      expect(result.status).not.toBe(0);
      const line = result.stderr
        .split("\n")
        .find((candidate) => candidate.includes(`[${key}]`));
      expect(line, `no line names ${key}`).toBeDefined();
      expect(line).toContain(fixture);
      expect(line).toMatch(reason);
    },
  );

  it("passes the live registry serialised as a fixture", () => {
    expect(runCli("--registry", `${casesDir}/registry-valid.json`).status).toBe(
      0,
    );
  });

  it("passes the live `src/config/locales.ts` on a default run", () => {
    expect(runCli().stderr).not.toContain("pathSegments");
  });

  it("reports a non-string segment rather than crashing on it", () => {
    expect(
      pathSegmentProblems(
        [{ code: "en", pathSegments: { legal: 7 } }],
        "x.json",
      ),
    ).toEqual([
      {
        file: "x.json",
        key: "en.pathSegments.legal",
        reason: "path segment must be a string, not number",
      },
    ]);
  });
});

/**
 * T-13's first clause: `localePath()` is the only URL builder in the app, so its output for every
 * `plan/02` §4.1 page type is pinned per locale. The table is exhaustive by assertion — a page
 * type added to `PATH_SEGMENT_KEYS` without a row here fails the last test in this block, which is
 * what stops a new page type from shipping with an unreviewed slug in three languages.
 */
describe("localePath per locale for every plan/02 §4.1 page type (AC-13 / T-13)", () => {
  const PATHS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
    en: {
      home: "/en",
      destinations: "/en/send-flowers-to",
      shopCategory: "/en/flowers",
      occasions: "/en/occasions",
      product: "/en/product",
      blog: "/en/blog",
      forFlorists: "/en/for-florists",
      legal: "/en/legal",
    },
    "en-gb": {
      home: "/en-gb",
      destinations: "/en-gb/send-flowers-to",
      shopCategory: "/en-gb/flowers",
      occasions: "/en-gb/occasions",
      product: "/en-gb/product",
      blog: "/en-gb/blog",
      forFlorists: "/en-gb/for-florists",
      legal: "/en-gb/legal",
    },
    de: {
      home: "/de",
      destinations: "/de/blumen-verschicken",
      shopCategory: "/de/blumen",
      occasions: "/de/anlaesse",
      product: "/de/produkt",
      blog: "/de/blog",
      forFlorists: "/de/fuer-floristen",
      legal: "/de/rechtliches",
    },
    pl: {
      home: "/pl",
      destinations: "/pl/wyslij-kwiaty",
      shopCategory: "/pl/kwiaty",
      occasions: "/pl/okazje",
      product: "/pl/produkt",
      blog: "/pl/blog",
      forFlorists: "/pl/dla-kwiaciarni",
      legal: "/pl/regulamin",
    },
  };

  it.each(Object.keys(PATHS))("%s", (locale) => {
    const expected = PATHS[locale] ?? {};
    for (const [pageType, path] of Object.entries(expected)) {
      expect(
        localePath(locale, pageType as (typeof PAGE_TYPES)[number]),
        `${locale} ${pageType}`,
      ).toBe(path);
    }
  });

  it("covers every page type, so a new §4.1 row cannot ship unpinned", () => {
    for (const locale of Object.keys(PATHS)) {
      expect(Object.keys(PATHS[locale] ?? {}).sort()).toEqual(
        [...PAGE_TYPES].sort(),
      );
    }
    expect([...PAGE_TYPES].sort()).toEqual(
      ["home", ...PATH_SEGMENT_KEYS].sort(),
    );
  });

  it("emits no two identical paths across locales except the shared ones", () => {
    // `blog`, `product` and the English pair legitimately coincide; what must never happen is a
    // German slug on a Polish URL, which shows up as a `/pl/…` path equal to a `/de/…` one.
    const de = Object.values(PATHS["de"] ?? {}).map((path) =>
      path.replace("/de", ""),
    );
    const pl = Object.values(PATHS["pl"] ?? {}).map((path) =>
      path.replace("/pl", ""),
    );
    const shared = de.filter((path) => pl.includes(path) && path !== "");
    expect(shared.sort()).toEqual(["/blog", "/produkt"]);
  });
});

describe("argumentSignature (the check-4 rule)", () => {
  it("names every argument with its kind", () => {
    expect([...argumentSignature("Read this in {language}?")]).toEqual([
      "language:argument",
    ]);
    expect([
      ...argumentSignature("{count, plural, one {# shop} other {# shops}}"),
    ]).toEqual(["count:plural"]);
  });

  it("ignores plural categories, because CLDR gives Polish four and English two", () => {
    const english = argumentSignature(
      "{count, plural, one {# florist} other {# florists}}",
    );
    const polish = argumentSignature(
      "{count, plural, one {# kwiaciarnia} few {# kwiaciarnie} many {# kwiaciarni} other {# kwiaciarni}}",
    );
    expect([...polish]).toEqual([...english]);
  });

  it("sees arguments nested inside a plural branch", () => {
    expect([
      ...argumentSignature(
        "{count, plural, one {one shop in {city}} other {# shops in {city}}}",
      ),
    ]).toEqual(["count:plural", "city:argument"]);
  });

  it("separates a bare placeholder from a plural of the same name", () => {
    expect([...argumentSignature("{count}")]).not.toEqual([
      ...argumentSignature("{count, plural, other {#}}"),
    ]);
  });

  it("rejects a plural with no `other` branch, which throws at render time", () => {
    expect(() => argumentSignature("{count, plural, one {#}}")).toThrow(
      /MISSING_OTHER_CLAUSE/,
    );
  });
});

describe("the summary formatter (§11)", () => {
  it("renders one row per locale with the share as a percentage", () => {
    const summary = formatSummary([
      {
        locale: "de",
        keys: 26,
        missing: 0,
        unreviewed: 26,
        share: 1,
        stale: 0,
        indexable: false,
      },
    ]);
    expect(summary).toContain("| `de` | 26 | 0 | 26 | 100.0% | 0 | no |");
    expect(summary).toContain("### i18n:check");
  });

  it("formats the 5 % threshold itself unambiguously", () => {
    expect(formatShare(0.05)).toBe("5.0%");
    expect(formatShare(0)).toBe("0.0%");
    expect(formatShare(1)).toBe("100.0%");
  });
});
