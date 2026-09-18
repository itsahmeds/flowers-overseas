/**
 * T-29 / AC-29 (TASK-042): the pseudo-locales are deterministic, still valid ICU, visibly
 * expanded, right-to-left where they claim to be, and invisible to everything that speaks to a
 * buyer or a crawler.
 *
 * The e2e half of T-29 (`/ar-XB` served with `dir="rtl"` and `noindex`, no launch locale linking
 * to a pseudo-locale) is in `tests/e2e/locale-routing.spec.ts`, and the build failure of
 * `ENABLE_PSEUDO_LOCALES=true` + `VERCEL_ENV=production` is in `tests/unit/env.test.ts`; what is
 * proved here is everything a browser is not needed for.
 *
 * Two choices in this file are worth stating:
 *
 *  - **ICU validity is measured, not asserted.** Every generated value is parsed with
 *    `@formatjs/icu-messageformat-parser` and `requiresOtherClause: true` — the parser next-intl
 *    formats with, and the one `pnpm i18n:check` uses — so "the transform preserves ICU syntax"
 *    is a fact about the real catalogue rather than a property of the three strings a hand-written
 *    fixture would have covered. The parser is a devDependency and stays out of `src/`.
 *  - **The registry gate is exercised by re-importing the config with the flag stubbed.**
 *    `src/config/locales.ts` parses its registry at module load, which is the behaviour under
 *    test (a malformed registry must throw on import, AC-1), so the only honest way to ask "what
 *    does the registry look like with `ENABLE_PSEUDO_LOCALES=true`" is a fresh module graph.
 */
import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { parse } from "@formatjs/icu-messageformat-parser";
import { afterEach, describe, expect, it, vi } from "vitest";

import { draftLocale } from "../../scripts/i18n-draft.ts";
import { renderPseudoFiles } from "../../scripts/i18n-pseudo.ts";
import {
  LOCALES,
  LocaleRegistrySchema,
  PSEUDO_LOCALES,
  PSEUDO_LOCALE_CODES,
  isPseudoLocaleCode,
} from "../../src/config/locales.ts";
import { alternatesFor } from "../../src/modules/i18n/alternates.ts";
import { loadMessages } from "../../src/modules/i18n/messages.ts";
import {
  PSEUDO_ACCENT_LOCALE,
  PSEUDO_EXPANSION_RATIO,
  PSEUDO_RTL_LOCALE,
  RTL_MARK,
  generatePseudoCatalogues,
  pseudoAccent,
  pseudoRtl,
} from "../../src/modules/i18n/pseudo.ts";
import {
  localeRegistryOf,
  withLocaleRegistry,
} from "../../src/modules/i18n/registry.ts";
import {
  isLocaleIndexable,
  resetReviewCache,
} from "../../src/modules/i18n/review.ts";
import {
  launchLocaleCodes,
  routableLocale,
  routableLocaleCodes,
} from "../../src/modules/i18n/routing.ts";
import type { MessageTree } from "../../src/modules/i18n/schemas.ts";

const repoRoot = resolve(__dirname, "../..");

const english = JSON.parse(
  readFileSync(join(repoRoot, "messages/en.json"), "utf8"),
) as MessageTree;

/** `{ a: { b: "x" } }` -> `[["a.b", "x"], …]`, in catalogue order. */
function flatten(tree: MessageTree, prefix = ""): [string, string][] {
  const flat: [string, string][] = [];
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    if (typeof value === "string") flat.push([path, value]);
    else flat.push(...flatten(value, path));
  }
  return flat;
}

const catalogues = generatePseudoCatalogues(english);
const sourceKeys = flatten(english);

describe(`${PSEUDO_ACCENT_LOCALE}: accented, expanded, bracketed (AC-29)`, () => {
  it("brackets every value and expands it by at least 40 %", () => {
    for (const [key, value] of sourceKeys) {
      const pseudo = pseudoAccent(value);
      expect(pseudo.startsWith("["), key).toBe(true);
      expect(pseudo.endsWith("]"), key).toBe(true);
      // AC-29 asks for ≥ 30 % "visibly expanded"; the generator targets `plan/03` §4's 40 %.
      // Compared in whole characters: a ratio of two lengths is not exactly representable.
      expect(pseudo.length, `${key} expansion`).toBeGreaterThanOrEqual(
        value.length + Math.ceil(value.length * PSEUDO_EXPANSION_RATIO),
      );
    }
  });

  it("accents ASCII letters and leaves everything else alone", () => {
    expect(pseudoAccent("Home")).toContain("Ĥóɱé");
    expect(pseudoAccent("Home")).not.toContain("Home");
    // Digits, punctuation and non-ASCII stay: only letters have accented twins.
    expect(pseudoAccent("24/7 — ok?")).toContain("24/7 — óķ?");
  });

  it("never touches an ICU argument, a plural keyword or `#`", () => {
    const pseudo = pseudoAccent(
      "{count, plural, one {# florist} other {# florists}}",
    );
    expect(pseudo).toContain("{count, plural,");
    expect(pseudo).toContain("one {# ƒļóŕíšţ}");
    expect(pseudo).toContain("other {# ƒļóŕíšţš}");
    expect(pseudoAccent("Read this in {language}?")).toContain("{language}");
  });

  it("keeps an ICU quoted run verbatim and treats a lone apostrophe as text", () => {
    expect(pseudoAccent("a '{literal}' b")).toContain("'{literal}'");
    // `don't` is ordinary text in ICU 4.8: the rest of the sentence must still be transformed.
    expect(pseudoAccent("don't stop")).toContain("ðóñ'ţ šţóþ");
  });
});

/** Whether an ICU message carries any text outside its arguments and plural keywords. */
function hasLiteralRun(value: string): boolean {
  return value.replaceAll(/\{[^{}]*\}/gu, "").trim() !== "";
}

describe(`${PSEUDO_RTL_LOCALE}: right-to-left mirror (AC-29)`, () => {
  it("marks every value right-to-left and wraps each literal run in an override", () => {
    for (const [key, value] of sourceKeys) {
      const pseudo = pseudoRtl(value);
      expect(pseudo.startsWith(RTL_MARK), key).toBe(true);
      // A value that is **only** an ICU argument (`breadcrumb.entity` is `{name}`: a crumb whose
      // visible label is the founder's authored category name, which is content and not chrome —
      // `plan/02` §12) has no literal run to wrap, and the RTL mark is the whole of its mirror.
      // The criterion is "every literal run is inside an override", not "every value contains
      // one": asserting the latter would be satisfiable only by inventing filler text in a
      // message whose whole job is to carry a name (TASK-109).
      if (!hasLiteralRun(value)) continue;
      expect(pseudo, key).toContain("‮");
      expect(pseudo, key).toContain("‬");
    }
  });

  it("leaves the ICU skeleton outside the override", () => {
    const pseudo = pseudoRtl("Read this in {language}?");
    expect(pseudo).toContain("{language}");
    expect(pseudo).not.toContain("‮{language}");
  });

  it("carries no direction attribute of its own: `dir` is locale config, not a string", () => {
    for (const value of Object.values(catalogues[PSEUDO_RTL_LOCALE] ?? {})) {
      expect(JSON.stringify(value)).not.toContain("dir=");
    }
    expect(
      PSEUDO_LOCALES.find((locale) => locale.code === PSEUDO_RTL_LOCALE)?.dir,
    ).toBe("rtl");
  });
});

describe("generated catalogues are deterministic and valid ICU (AC-29)", () => {
  it("parses every generated value with the parser next-intl formats with", () => {
    for (const code of PSEUDO_LOCALE_CODES) {
      const tree = catalogues[code];
      expect(tree, code).toBeDefined();
      for (const [key, value] of flatten(tree ?? {})) {
        expect(
          () => parse(value, { requiresOtherClause: true }),
          `${code} ${key}`,
        ).not.toThrow();
      }
    }
  });

  it("covers exactly the English key set, in sorted order", () => {
    const expected = sourceKeys.map(([key]) => key).sort();
    for (const code of PSEUDO_LOCALE_CODES) {
      const keys = flatten(catalogues[code] ?? {}).map(([key]) => key);
      expect(keys, code).toEqual(expected);
      // Sorted at every level, which is what makes the written files byte-stable.
      expect(keys, code).toEqual([...keys].sort());
    }
  });

  it("produces identical bytes twice: no clock, no randomness, no I/O", () => {
    const first = JSON.stringify(generatePseudoCatalogues(english));
    const second = JSON.stringify(generatePseudoCatalogues(english));
    expect(second).toBe(first);
  });

  it("renders the same bytes the generator would write to disk", () => {
    const files = renderPseudoFiles(join(repoRoot, "messages"));
    expect(files.map((file) => file.locale)).toEqual([...PSEUDO_LOCALE_CODES]);
    for (const file of files) {
      expect(file.contents.endsWith("\n"), file.locale).toBe(true);
      expect(JSON.parse(file.contents)).toEqual(catalogues[file.locale]);
    }
  });
});

describe("the CLI and the checks (AC-29)", () => {
  const temporary: string[] = [];

  afterEach(() => {
    while (temporary.length > 0) {
      const path = temporary.pop();
      if (path !== undefined) rmSync(path, { recursive: true, force: true });
    }
  });

  function messagesFixture(): string {
    const dir = mkdtempSync(join(tmpdir(), "fo-pseudo-"));
    temporary.push(dir);
    cpSync(join(repoRoot, "messages/en.json"), join(dir, "en.json"));
    return dir;
  }

  function run(...args: readonly string[]): { status: number; output: string } {
    try {
      const stdout = execFileSync(
        process.execPath,
        ["scripts/i18n-pseudo.ts", ...args],
        { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      );
      return { status: 0, output: stdout };
    } catch (error) {
      const failure = error as {
        status?: number;
        stdout?: string;
        stderr?: string;
      };
      return {
        status: failure.status ?? 1,
        output: `${failure.stdout ?? ""}${failure.stderr ?? ""}`,
      };
    }
  }

  it("writes both catalogues and reports no change on a second run", () => {
    const dir = messagesFixture();
    const first = run("--messages-dir", dir);
    expect(first.status).toBe(0);
    expect(first.output).toContain("wrote");
    const bytes = PSEUDO_LOCALE_CODES.map((code) =>
      readFileSync(join(dir, `${code}.json`), "utf8"),
    );

    const second = run("--messages-dir", dir);
    expect(second.status).toBe(0);
    expect(second.output).toContain("no change");
    expect(
      PSEUDO_LOCALE_CODES.map((code) =>
        readFileSync(join(dir, `${code}.json`), "utf8"),
      ),
    ).toEqual(bytes);
  });

  it("`--check` fails on a missing file and on a hand-edited one, naming it", () => {
    const dir = messagesFixture();
    const missing = run("--check", "--messages-dir", dir);
    expect(missing.status).toBe(1);
    expect(missing.output).toContain(`${PSEUDO_ACCENT_LOCALE}.json`);
    expect(missing.output).toContain("i18n:pseudo");

    expect(run("--messages-dir", dir).status).toBe(0);
    expect(run("--check", "--messages-dir", dir).status).toBe(0);

    const tampered = join(dir, `${PSEUDO_RTL_LOCALE}.json`);
    writeFileSync(
      tampered,
      readFileSync(tampered, "utf8").replace("Skip", "Sk1p"),
      "utf8",
    );
    const stale = run("--check", "--messages-dir", dir);
    expect(stale.status).toBe(1);
    expect(stale.output).toContain(`${PSEUDO_RTL_LOCALE}.json`);
  });

  it("`pnpm i18n:check` reports a stale generated catalogue (check 9)", () => {
    const dir = mkdtempSync(join(tmpdir(), "fo-pseudo-check-"));
    temporary.push(dir);
    cpSync(join(repoRoot, "tests/fixtures/i18n/_cases/clean"), dir, {
      recursive: true,
    });
    // Clean tree, no generated files: the clause is silent (they are git-ignored).
    const before = checkCli(dir);
    expect(before.status).toBe(0);

    const files = renderPseudoFiles(dir);
    for (const file of files) writeFileSync(file.path, file.contents, "utf8");
    expect(checkCli(dir).status).toBe(0);

    const first = files[0];
    expect(first).toBeDefined();
    if (first !== undefined) {
      writeFileSync(first.path, first.contents.replace("[", "[!"), "utf8");
    }
    const after = checkCli(dir);
    expect(after.status).toBe(1);
    expect(after.output).toContain("i18n:pseudo");
  });

  function checkCli(messagesDir: string): { status: number; output: string } {
    const args = [
      "scripts/i18n-check.ts",
      "--messages-dir",
      messagesDir,
      "--src",
      join(messagesDir, "src"),
    ];
    try {
      const stdout = execFileSync(process.execPath, args, {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      return { status: 0, output: stdout };
    } catch (error) {
      const failure = error as {
        status?: number;
        stdout?: string;
        stderr?: string;
      };
      return {
        status: failure.status ?? 1,
        output: `${failure.stdout ?? ""}${failure.stderr ?? ""}`,
      };
    }
  }

  it("refuses to draft a pseudo-locale: it is generated, not translated", () => {
    for (const code of PSEUDO_LOCALE_CODES) {
      expect(() => draftLocale({ root: repoRoot, locale: code })).toThrow(
        /generated pseudo-locale/,
      );
      expect(isPseudoLocaleCode(code)).toBe(true);
    }
    expect(isPseudoLocaleCode("pl")).toBe(false);
  });
});

/**
 * The registry gate. `LOCALES` is parsed at module load, so the flag is exercised by re-importing
 * `src/config/locales.ts` with `ENABLE_PSEUDO_LOCALES` stubbed — which also proves the registry
 * refinements (`exactly one x-default`, resolvable fallback chains, unique aliases) still hold
 * with six locales rather than four (AC-1, AC-29).
 */
describe("ENABLE_PSEUDO_LOCALES gates the registry (AC-29)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function registryWith(
    value: string | undefined,
  ): Promise<typeof import("../../src/config/locales.ts")> {
    if (value === undefined) vi.stubEnv("ENABLE_PSEUDO_LOCALES", "");
    else vi.stubEnv("ENABLE_PSEUDO_LOCALES", value);
    vi.resetModules();
    return import("../../src/config/locales.ts");
  }

  it("is off by default: exactly the four launch locales", async () => {
    const config = await registryWith(undefined);
    expect(config.LOCALES.map((locale) => locale.code)).toEqual([
      "en",
      "en-gb",
      "de",
      "pl",
    ]);
    for (const locale of config.LOCALES) {
      expect(locale.isPseudo, locale.code).toBe(false);
    }
  });

  it("adds `en-XA` and `ar-XB` when the flag is `true`, and never as launch locales", async () => {
    const config = await registryWith("true");
    expect(config.LOCALES.map((locale) => locale.code)).toEqual([
      "en",
      "en-gb",
      "de",
      "pl",
      PSEUDO_ACCENT_LOCALE,
      PSEUDO_RTL_LOCALE,
    ]);
    for (const code of PSEUDO_LOCALE_CODES) {
      const locale = config.LOCALES.find(
        (candidate) => candidate.code === code,
      );
      expect(locale?.isPseudo, code).toBe(true);
      expect(locale?.isLaunch, code).toBe(false);
      expect(locale?.fallbackCode, code).toBe("en");
      // Structurally incapable of appearing in hreflang or a sitemap (§6).
      expect(locale?.hreflangAliases, code).toEqual([]);
    }
    expect(
      config.LOCALES.find((locale) => locale.code === PSEUDO_RTL_LOCALE)?.dir,
    ).toBe("rtl");
    // Still exactly one `x-default`, and it is still `en` (the refinement, re-run with six).
    expect(
      config.LOCALES.filter((locale) =>
        locale.hreflangAliases.includes("x-default"),
      ).map((locale) => locale.code),
    ).toEqual(["en"]);
    expect(config.xDefaultLocale).toBe("en");
  });

  it("rejects a pseudo-locale that claims a launch flag or an hreflang alias", () => {
    for (const [field, patch] of [
      ["isLaunch", { isLaunch: true }],
      ["hreflangAliases", { hreflangAliases: ["ar-XB"] }],
    ] as const) {
      const registry = [
        ...LOCALES.map((locale) => ({ ...locale })),
        { ...PSEUDO_LOCALES[1], ...patch },
      ];
      const result = LocaleRegistrySchema.safeParse(registry);
      expect(result.success, field).toBe(false);
      expect(
        result.error?.issues.map((issue) => issue.path.join(".")).join(" "),
        field,
      ).toContain(field);
    }
  });
});

/**
 * The consequences AC-29 lists, asserted against an injected registry that *does* contain the
 * pseudo-locales — the state a preview runs in. Injection rather than a stubbed env because these
 * functions read the registry through the seam, which is the point of the seam (AC-5).
 */
describe("pseudo-locales route but are invisible to buyers and crawlers (AC-29)", () => {
  const withPseudo = LocaleRegistrySchema.parse([
    ...LOCALES.map((locale) => ({ ...locale })),
    ...PSEUDO_LOCALES.map((locale) => ({ ...locale })),
  ]);

  async function inRegistry<T>(body: () => T | Promise<T>): Promise<T> {
    resetReviewCache();
    try {
      return await withLocaleRegistry(localeRegistryOf(withPseudo), body);
    } finally {
      resetReviewCache();
    }
  }

  it("have URLs (`routableLocale`) but are not launch locales", async () => {
    await inRegistry(() => {
      expect(routableLocaleCodes()).toEqual([
        "en",
        "en-gb",
        "de",
        "pl",
        PSEUDO_ACCENT_LOCALE,
        PSEUDO_RTL_LOCALE,
      ]);
      // `launchLocales()` is the switcher's only source, so the switcher cannot list them.
      expect(launchLocaleCodes()).toEqual(["en", "en-gb", "de", "pl"]);
      expect(routableLocale(PSEUDO_RTL_LOCALE)?.dir).toBe("rtl");
      // An unknown or mis-cased code is still no locale at all (AC-8).
      expect(routableLocale("/EN")).toBeUndefined();
      expect(routableLocale("ar-xb")).toBeUndefined();
    });
  });

  it("collapse to the launch locales when the flag is off, so production prerenders four", () => {
    // `generateStaticParams` in `src/app/[locale]/layout.tsx` is `routableLocaleCodes()`; with the
    // flag off — which the env schema guarantees in production (AC-29) — the two sets are equal,
    // which is §5.4's "never a pseudo-locale in `generateStaticParams`".
    expect(routableLocaleCodes()).toEqual(launchLocaleCodes());
    expect(routableLocaleCodes()).toEqual(["en", "en-gb", "de", "pl"]);
  });

  it("are never indexable and never appear in `alternatesFor()`", async () => {
    await inRegistry(() => {
      for (const code of PSEUDO_LOCALE_CODES) {
        expect(isLocaleIndexable(code), code).toBe(false);
      }
      const pages = alternatesFor(
        { pageType: "home" },
        { baseUrl: "https://flowersoverseas.com" },
      );
      const serialised = JSON.stringify(pages);
      for (const code of PSEUDO_LOCALE_CODES) {
        expect(serialised, code).not.toContain(code);
      }
      expect(pages.length).toBeGreaterThan(0);
    });
  });

  it("resolve to their own generated catalogue, not to English", async () => {
    await inRegistry(() => {
      // `meta.home.title`, not the placeholder `meta.home.heading` TASK-052 deleted with the
      // placeholder `<h1>` it was written for: the locale home's heading is `home.hero.heading`
      // now, the artboards' headline.
      const accented = loadMessages(PSEUDO_ACCENT_LOCALE, ["meta"]);
      expect(accented.meta.home.title).toBe(
        pseudoAccent("Flowers Overseas — send flowers to Europe"),
      );
      const rtl = loadMessages(PSEUDO_RTL_LOCALE, ["a11y"]);
      expect(rtl.a11y.skipToContent.startsWith(RTL_MARK)).toBe(true);
      // A launch locale is untouched by any of this.
      expect(loadMessages("en", ["a11y"]).a11y.skipToContent).toBe(
        "Skip to content",
      );
    });
  });
});
