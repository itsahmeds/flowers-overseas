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
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  argumentSignature,
  formatShare,
  formatSummary,
  pathSegmentProblems,
} from "../../scripts/i18n-check.ts";
import { PATH_SEGMENT_KEYS } from "../../src/config/locales.ts";
import {
  NON_INDEXABLE_SCOPE,
  scopeEntryFor,
} from "../../src/modules/i18n/review-scope.ts";
import { PAGE_TYPES, localePath } from "../../src/modules/i18n/routing.ts";
import {
  ERROR_COPY,
  X_DEFAULT_ERROR_COPY,
} from "../../src/modules/i18n/error-copy.data.ts";
import {
  HEAD_MESSAGE_KEYS,
  headDashesIn,
  isHeadMessageKey,
} from "../../src/modules/i18n/head-punctuation.ts";
import enCatalogue from "../../messages/en.json";

const repoRoot = resolve(__dirname, "../..");
const casesDir = "tests/fixtures/i18n/_cases";

/** The dot paths of a nested catalogue's leaves. */
function leafKeys(
  tree: Readonly<Record<string, unknown>>,
  prefix = "",
): string[] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    return typeof value === "object" && value !== null
      ? leafKeys(value as Record<string, unknown>, path)
      : [path];
  });
}

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
    // 100 % unreviewed and `no`. `en`/`en-gb` carry the founder's review queue and must stay at
    // or under 5 % (spec 003 §2: `<=`) and read `yes`; the table is where the founder sees that
    // queue, and its exact contents are pinned in `i18n-messages-schema.test.ts`.
    for (const locale of ["en", "en-gb"]) {
      expect(result.stdout, locale).toMatch(
        new RegExp(
          `\\| \`${locale}\` \\| \\d+ \\| \\d+ \\| \\d+ \\| 0 \\| \\d+ \\| (?:[0-4]\\.\\d|5\\.0)% \\| 0 \\| yes \\|`,
        ),
      );
    }
    for (const locale of ["de", "pl"]) {
      expect(result.stdout).toMatch(
        new RegExp(
          `\\| \`${locale}\` \\| \\d+ \\| \\d+ \\| \\d+ \\| 0 \\| \\d+ \\| 100\\.0% \\| 0 \\| no \\|`,
        ),
      );
    }
  });

  it("says nothing about a locale on a clean fixture tree either", () => {
    const result = runCase("clean");
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });

  it("applies the committed scope registry to the committed tree only (check 11)", () => {
    // The committed registry names the committed keys and files. Over the committed tree, named
    // explicitly, its entries apply: `en` reads exactly the keys they reach as not counted.
    const enKeys = leafKeys(enCatalogue);
    const notCounted = enKeys.filter(
      (key) => scopeEntryFor(key, NON_INDEXABLE_SCOPE) !== undefined,
    ).length;
    expect(notCounted).toBeGreaterThan(0);
    const committed = runCli(
      "--messages-dir",
      "messages",
      "--src",
      "src",
      "--summary",
    );
    expect(committed.stderr).toBe("");
    expect(committed.status).toBe(0);
    expect(committed.stdout).toContain(
      `| \`en\` | ${String(enKeys.length)} | ${String(enKeys.length - notCounted)} | ${String(notCounted)} |`,
    );

    // Over a fixture tree with no `--scope` it has no entry: every key counts, and check 11 does
    // not report the committed entries as matching no key of the fixture's `en`.
    const fixture = runCase("clean", "--summary");
    expect(fixture.stderr).toBe("");
    expect(fixture.status).toBe(0);
    const fixtureKeys = leafKeys(
      JSON.parse(
        readFileSync(resolve(repoRoot, casesDir, "clean/en.json"), "utf8"),
      ) as Record<string, unknown>,
    ).length;
    expect(fixture.stdout).toContain(
      `| \`en\` | ${String(fixtureKeys)} | ${String(fixtureKeys)} | 0 |`,
    );
  });

  it("needs both halves of the committed tree for the committed registry (check 11, /break 1 hole 1)", () => {
    // The committed catalogue over a fixture source: not the committed tree, so no entry
    // applies and every `en` key counts. (The run fails on unused keys; the summary still prints.)
    const enKeys = leafKeys(enCatalogue).length;
    const messagesOnly = runCli(
      "--messages-dir",
      "messages",
      "--src",
      `${casesDir}/clean/src`,
      "--summary",
    );
    expect(messagesOnly.stdout).toContain(
      `| \`en\` | ${String(enKeys)} | ${String(enKeys)} | 0 |`,
    );
    expect(messagesOnly.stderr).not.toContain("scope entry");

    // A fixture catalogue over the committed source: not the committed tree either, so the
    // committed entries are not held against keys the fixture does not have.
    const srcOnly = runCli(
      "--messages-dir",
      `${casesDir}/clean`,
      "--src",
      "src",
      "--summary",
    );
    expect(srcOnly.stderr).not.toContain("scope entry");
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

/**
 * **The file-level faults no case reached** (TASK-143). Neutering each `problems.push` of
 * `scripts/i18n-check.ts` in turn left 11 of its 23 sites with all 54 cases green: a catalogue or
 * manifest that is not the documented shape, a file that is not JSON, a missing `en`, a key that
 * `en` does not have, a missing manifest, an orphan review record and a registry that is not one.
 * Each is a miniature copy of `clean/` with that one fault, so it fails for exactly the reason it
 * is named after; the line must name the file and the diagnosis.
 */
const FILE_FAULTS = [
  {
    fault: "a catalogue that is JSON but not a message catalogue",
    directory: "malformed-catalogue",
    file: "malformed-catalogue/de.json",
    reason: /is not a valid message catalogue/,
  },
  {
    fault: "a review manifest that is JSON but not a manifest",
    directory: "malformed-meta",
    file: "malformed-meta/de.meta.json",
    reason: /is not a valid review manifest/,
  },
  {
    fault: "a catalogue that is not JSON at all",
    directory: "invalid-json",
    file: "invalid-json/de.json",
    reason: /is not valid JSON/,
  },
  {
    fault: "no source catalogue",
    directory: "missing-source",
    file: "missing-source/en.json",
    reason: /the source catalogue `en` is missing/,
  },
  {
    fault: "a key the source catalogue does not have",
    directory: "extra-key",
    file: "extra-key/de.json",
    reason: /\[banner\.footnote\]: is not a key of `en`/,
  },
  {
    fault: "a catalogue with no review manifest",
    directory: "missing-manifest",
    file: "missing-manifest/de.meta.json",
    reason: /is missing: a catalogue file needs its review manifest/,
  },
  {
    fault: "a review record for a message that does not exist",
    directory: "orphan-meta",
    file: "orphan-meta/de.meta.json",
    reason: /\[banner\.footnote\]: is an orphan review record/,
  },
] as const;

const REGISTRY_FAULTS = [
  {
    fault: "a registry file that is not a list of locales",
    fixture: "registry-not-a-registry.json",
    reason: /is not a locale registry/,
  },
  {
    fault: "a registry whose segments are fine but whose `dir` is not ltr/rtl",
    fixture: "registry-bad-direction.json",
    reason: /does not parse as a locale registry \(0\.dir:/,
  },
] as const;

describe("the file-level faults (TASK-143)", () => {
  it.each(FILE_FAULTS)("$fault", ({ directory, file, reason }) => {
    const result = runCase(directory);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("i18n:check failed with 1 problem(s)");
    const line = result.stderr
      .split("\n")
      .find((candidate) => candidate.includes(file));
    expect(line, `no line names ${file}`).toBeDefined();
    expect(line).toMatch(reason);
  });

  it.each(REGISTRY_FAULTS)("$fault", ({ fixture, reason }) => {
    const result = runCli("--registry", `${casesDir}/${fixture}`);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("i18n:check failed with 1 problem(s)");
    const line = result.stderr
      .split("\n")
      .find((candidate) => candidate.includes(fixture));
    expect(line, `no line names ${fixture}`).toBeDefined();
    expect(line).toMatch(reason);
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

/**
 * The italic phrase's tag pair (spec 004 §14 A-founder-2026-10-14d clause 4, AC-52, T-57;
 * TASK-231): a `de` or `pl` heading value carries exactly the `<em>` pairs its `en` source does.
 * The tag is part of the argument set, counted, so a draft that drops the pair or adds a second
 * one fails the same check a dropped `{language}` does.
 */
describe("the italic phrase's `<em>` pair is part of the argument set (AC-52)", () => {
  it("fails a `de` heading value without the pair, naming the file and the key", () => {
    const result = runCase("em-pair-missing");
    expect(result.status).not.toBe(0);
    const line = result.stderr
      .split("\n")
      .find((candidate) => candidate.includes("[meta.home.title]"));
    expect(line, "no line names meta.home.title").toBeDefined();
    expect(line).toContain("em-pair-missing/de.json");
    expect(line).toMatch(
      /argument set differs from `en`: expected \{em:tag\}, found \{\}/,
    );
  });

  it("counts the pairs: a second `<em>` differs, the same one matches", () => {
    const one = argumentSignature("Flowers for someone <em>far away.</em>");
    expect([...one]).toEqual(["em:tag"]);
    expect([...argumentSignature("Kwiaty dla kogoś <em>daleko.</em>")]).toEqual(
      [...one],
    );
    expect([
      ...argumentSignature("<em>Kwiaty</em> dla kogoś <em>daleko.</em>"),
    ]).toEqual(["em:tag", "em:tag#2"]);
    expect([...argumentSignature("Kwiaty dla kogoś daleko.")]).toEqual([]);
  });
});

describe("check 12: a shown locale in another language is reviewed (spec 003 AC-48 / T-48)", () => {
  it("exits non-zero naming `pl` when `pl` is shown with its drafts unreviewed", () => {
    // The committed catalogues, the committed registry but for one field: `pl` is `shown: true`.
    const result = runCli("--registry", `${casesDir}/registry-pl-shown.json`);
    expect(result.status).toBe(1);
    const lines = result.stderr
      .split("\n")
      .filter((line) => line.includes("`shown: true`"));
    expect(lines).toEqual([
      `  - ${casesDir}/registry-pl-shown.json: locale \`pl\` is \`shown: true\` with 100.0% of its counted keys unreviewed, above the 5.0% threshold: a language is offered to visitors only once a person has reviewed it (spec 003 §14 A-founder-2026-10-14c). Set \`shown: false\`, or have its catalogue reviewed first`,
    ]);
  });

  it("exits 0 on the same registry with `pl` hidden, and on the committed tree", () => {
    expect(runCli("--registry", `${casesDir}/registry-valid.json`).status).toBe(
      0,
    );
    expect(runCli().status).toBe(0);
  });
});

/**
 * A throwaway tree for check 12's edges (breaker r1 H1, H2): `total` English keys, `en` and
 * `en-gb` (an empty catalogue that falls back to `en`) and `de`, each `shown` as given. The
 * registry is the committed one's `en`, `en-gb` and `de` rows (fallbacks intact); `de` carries
 * `deUnreviewed` machine drafts and the rest reviewed; `en` is `enReviewed` or not at all.
 */
function check12Tree(options: {
  readonly total: number;
  readonly enReviewed: boolean;
  readonly deUnreviewed: number;
}): {
  readonly messagesDir: string;
  readonly src: string;
  readonly registry: string;
} {
  const root = mkdtempSync(join(tmpdir(), "i18n-check12-"));
  const srcDir = join(root, "src");
  mkdirSync(srcDir);
  const keys = Array.from(
    { length: options.total },
    (_, index) => `k${String(index).padStart(2, "0")}`,
  );
  const english = Object.fromEntries(keys.map((key) => [key, `Value ${key}`]));
  const hash = (value: string): string =>
    createHash("sha256").update(value, "utf8").digest("hex");
  const meta = (reviewed: (index: number) => boolean): object =>
    Object.fromEntries(
      keys.map((key, index) => [
        `grid.${key}`,
        reviewed(index)
          ? {
              source: "human",
              reviewed: true,
              reviewedBy: "founder",
              reviewedAt: "2026-09-08T00:00:00Z",
              sourceHash: hash(`Value ${key}`),
            }
          : {
              source: "machine",
              reviewed: false,
              sourceHash: hash(`Value ${key}`),
            },
      ]),
    );
  const write = (name: string, value: object): void =>
    writeFileSync(join(root, name), `${JSON.stringify(value, null, 2)}\n`);
  write("en.json", { grid: english });
  write(
    "en.meta.json",
    meta(() => options.enReviewed),
  );
  write("en-gb.json", {});
  write("en-gb.meta.json", {});
  write("de.json", { grid: english });
  write(
    "de.meta.json",
    meta((index) => index >= options.deUnreviewed),
  );
  writeFileSync(
    join(srcDir, "usage.ts"),
    `declare function useTranslations(namespace: string): (key: string) => string;\nconst grid = useTranslations("grid");\nexport const rendered: readonly string[] = [\n${keys.map((key) => `  grid("${key}"),`).join("\n")}\n];\n`,
  );
  const committed = JSON.parse(
    readFileSync(resolve(repoRoot, casesDir, "registry-valid.json"), "utf8"),
  ) as Record<string, unknown>[];
  const registry = committed
    .filter((row) => ["en", "en-gb", "de"].includes(row["code"] as string))
    .map((row) => ({ ...row, shown: true }));
  write("registry.json", registry);
  return {
    messagesDir: root,
    src: srcDir,
    registry: join(root, "registry.json"),
  };
}

function runCheck12Tree(tree: ReturnType<typeof check12Tree>): CliResult {
  return runCli(
    "--messages-dir",
    tree.messagesDir,
    "--src",
    tree.src,
    "--registry",
    tree.registry,
  );
}

describe("check 12's two edges (spec 003 AC-48, breaker r1 H1 and H2)", () => {
  it("never judges the source language: `en` and `en-gb` shown and 100% unreviewed exit 0 (H1)", () => {
    const tree = check12Tree({ total: 20, enReviewed: false, deUnreviewed: 0 });
    const result = runCheck12Tree(tree);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });

  it("passes a shown locale at exactly 5.00% unreviewed (1 of 20) and fails at 2 of 20 (H2)", () => {
    const at = runCheck12Tree(
      check12Tree({ total: 20, enReviewed: true, deUnreviewed: 1 }),
    );
    expect(at.stderr).toBe("");
    expect(at.status).toBe(0);

    const over = runCheck12Tree(
      check12Tree({ total: 20, enReviewed: true, deUnreviewed: 2 }),
    );
    expect(over.status).toBe(1);
    expect(
      over.stderr.split("\n").filter((line) => line.includes("`shown: true`")),
    ).toHaveLength(1);
    expect(over.stderr).toContain("locale `de` is `shown: true` with 10.0%");
  });

  it("the control: the same tree with `de` at 3 of 20 unreviewed names `de` and only `de`", () => {
    const result = runCheck12Tree(
      check12Tree({ total: 20, enReviewed: false, deUnreviewed: 3 }),
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("locale `de` is `shown: true` with 15.0%");
    expect(result.stderr).not.toContain("locale `en`");
    expect(result.stderr).not.toContain("locale `en-gb`");
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
        counted: 24,
        notCounted: 2,
        missing: 0,
        unreviewed: 24,
        share: 1,
        stale: 0,
        indexable: false,
      },
    ]);
    expect(summary).toContain(
      "| `de` | 26 | 24 | 2 | 0 | 24 | 100.0% | 0 | no |",
    );
    expect(summary).toContain("### i18n:check");
  });

  it("formats the 5 % threshold itself unambiguously", () => {
    expect(formatShare(0.05)).toBe("5.0%");
    expect(formatShare(0)).toBe("0.0%");
    expect(formatShare(1)).toBe("100.0%");
  });
});

/**
 * Check 13, head punctuation (spec 003 §14 A-founder-2026-10-15a clause 4, AC-50 / T-50; TASK-242).
 * The spec numbers it 12; TASK-237 took 12 for "shown", so it is 13 (the header of
 * `scripts/i18n-check.ts` says so). Each fixture is the committed catalogues with one value
 * changed, written to a throwaway directory and checked against the committed `src/`, so the only
 * new fault in the tree is the one the case is named after.
 */
function headFixture(
  edits: readonly {
    readonly locale: string;
    readonly key: string;
    readonly value: string;
  }[],
): CliResult {
  const root = mkdtempSync(join(tmpdir(), "i18n-check13-"));
  const hash = (value: string): string =>
    createHash("sha256").update(value, "utf8").digest("hex");
  const englishEdits = edits.filter((edit) => edit.locale === "en");
  for (const locale of ["en", "en-gb", "de", "pl"]) {
    const catalogue = JSON.parse(
      readFileSync(resolve(repoRoot, "messages", `${locale}.json`), "utf8"),
    ) as Record<string, unknown>;
    const meta = JSON.parse(
      readFileSync(
        resolve(repoRoot, "messages", `${locale}.meta.json`),
        "utf8",
      ),
    ) as Record<string, { sourceHash: string }>;
    for (const edit of edits.filter((entry) => entry.locale === locale)) {
      const path = edit.key.split(".");
      let node = catalogue;
      for (const segment of path.slice(0, -1)) {
        node = node[segment] as Record<string, unknown>;
      }
      const leaf = path.at(-1) ?? "";
      expect(typeof node[leaf], `${locale} ${edit.key}`).toBe("string");
      node[leaf] = edit.value;
    }
    // An English edit keeps every record of the key fresh, so check 7 (stale `sourceHash`) stays
    // quiet and the case's only fault is the one it is named after.
    for (const edit of englishEdits) {
      const record = meta[edit.key];
      if (record !== undefined) record.sourceHash = hash(edit.value);
    }
    writeFileSync(
      join(root, `${locale}.json`),
      `${JSON.stringify(catalogue, null, 2)}\n`,
    );
    writeFileSync(
      join(root, `${locale}.meta.json`),
      `${JSON.stringify(meta, null, 2)}\n`,
    );
  }
  const result = runCli("--messages-dir", root, "--src", "src");
  // The throwaway directory stands in for `messages/`; the lines are compared as the committed
  // tree would print them.
  return {
    ...result,
    stderr: result.stderr.split(`${root}/`).join("messages/"),
  };
}

/** The check-13 lines of a run, so another check's fault cannot pass a case. */
function headLines(result: CliResult): string[] {
  return result.stderr
    .split("\n")
    .filter((line) => line.includes("is head copy"));
}

describe("check 13: no dash in head copy (spec 003 AC-50 / T-50)", () => {
  it("refuses `meta.home.title` with an em dash, naming `en` and the key", () => {
    const result = headFixture([
      {
        locale: "en",
        key: "meta.home.title",
        value: "Flowers Overseas — send flowers to Europe",
      },
    ]);
    expect(result.status).toBe(1);
    expect(headLines(result)).toEqual([
      "  - messages/en.json [meta.home.title]: in locale `en` is head copy (it reaches a `<title>`, a meta description or a JSON-LD name) and carries an em dash (U+2014): use a colon or a full stop (spec 003 §14 A-founder-2026-10-15a)",
    ]);
  });

  it("refuses `shop.category.seoTitle` with a spaced hyphen, naming `en` and the key", () => {
    const result = headFixture([
      {
        locale: "en",
        key: "shop.category.seoTitle",
        value: "{entity} for {country} - one all-in price",
      },
    ]);
    expect(result.status).toBe(1);
    expect(headLines(result)).toEqual([
      "  - messages/en.json [shop.category.seoTitle]: in locale `en` is head copy (it reaches a `<title>`, a meta description or a JSON-LD name) and carries a spaced hyphen: use a colon or a full stop (spec 003 §14 A-founder-2026-10-15a)",
    ]);
  });

  it("refuses `pl`'s `meta.notFound.title` with a spaced en dash, naming `pl` and the key", () => {
    const result = headFixture([
      {
        locale: "pl",
        key: "meta.notFound.title",
        value: "Nie znaleziono strony – Flowers Overseas",
      },
    ]);
    expect(result.status).toBe(1);
    expect(headLines(result)).toEqual([
      "  - messages/pl.json [meta.notFound.title]: in locale `pl` is head copy (it reaches a `<title>`, a meta description or a JSON-LD name) and carries a spaced en dash (U+2013): use a colon or a full stop (spec 003 §14 A-founder-2026-10-15a)",
    ]);
  });

  it("refuses `de` too: a German head key with an em dash is named as `de`'s", () => {
    const result = headFixture([
      {
        locale: "de",
        key: "shop.root.seoTitle",
        value: "Blumen nach {country} — was wir dort binden",
      },
    ]);
    expect(result.status).toBe(1);
    expect(headLines(result)).toHaveLength(1);
    expect(headLines(result)[0]).toContain(
      "messages/de.json [shop.root.seoTitle]: in locale `de`",
    );
  });

  it('passes hyphenated words: "hand-tied, all-in" is not a dash', () => {
    const result = headFixture([
      {
        locale: "en",
        key: "shop.category.seoTitle",
        value: "{entity} for {country}: hand-tied, all-in",
      },
    ]);
    expect(headLines(result)).toEqual([]);
    expect(result.status).toBe(0);
  });

  it("the committed tree carries no dash in any head key, in any locale", () => {
    expect(headLines(runCli())).toEqual([]);
  });

  it("every `HEAD_MESSAGE_KEYS` entry reaches an `en` key, and the list is the spec's", () => {
    const keys = leafKeys(enCatalogue as Record<string, unknown>);
    for (const pattern of HEAD_MESSAGE_KEYS) {
      expect(
        keys.filter((key) => isHeadMessageKey(key, [pattern])),
        pattern,
      ).not.toEqual([]);
    }
    expect(keys.filter((key) => isHeadMessageKey(key)).sort()).toEqual([
      "catalog.descriptor.name",
      "categoryHub.h1",
      "destinationsHub.seoDescription",
      "destinationsHub.seoTitle",
      "meta.error.description",
      "meta.error.title",
      "meta.home.description",
      "meta.home.title",
      "meta.notFound.description",
      "meta.notFound.title",
      "occasionHub.h1",
      "occasionsIndex.h1",
      "occasionsIndex.intro",
      "shop.category.seoDescription",
      "shop.category.seoTitle",
      "shop.occasion.seoDescription",
      "shop.occasion.seoTitle",
      "shop.pagination.titleSuffix",
      "shop.root.seoDescription",
      "shop.root.seoTitle",
    ]);
  });

  it("no title in `error-copy.data.ts` (the 500 boundary's static copy) carries a dash", () => {
    const titles = [
      X_DEFAULT_ERROR_COPY.title,
      ...Object.values(ERROR_COPY).map((copy) => copy.title),
    ];
    expect(Object.keys(ERROR_COPY).sort()).toEqual(["de", "en", "en-gb", "pl"]);
    for (const title of titles) {
      expect(headDashesIn(title), title).toEqual([]);
    }
    expect(X_DEFAULT_ERROR_COPY.title).toBe(
      "Something went wrong. Flowers Overseas",
    );
  });
});
