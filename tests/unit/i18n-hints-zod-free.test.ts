/**
 * AC-25's precondition, the half `/review 26` found missing (TASK-046).
 *
 * TASK-046 took zod off `src/app/global-error.tsx` and reported the whole client bundle 72.5 KB
 * Brotli lighter. It was not: `src/modules/i18n/ui/LocaleSuggestionBannerIsland.tsx` imported
 * `../hints.ts`, which imported `./schemas.ts`, which imports zod — and the island is rendered on
 * every locale document by `LocaleSuggestionBannerLoader.tsx` through
 * `next/dynamic({ ssr: false })`, so the browser fetched a zod copy right after hydration whether
 * or not a banner appeared. The measurement script did not see it either (it read only the
 * document's `<script src>` list), so nothing in the suite could fail.
 *
 * Two kinds of assertion close that, and both are about a *graph*, which is why they are here
 * rather than in a browser test:
 *
 *  1. **No import path from a client entry point reaches a forbidden module.** The graph is walked
 *     from the three files whose bytes Next attaches to a public document — the island, its
 *     loader and the root error boundary — over static `import`/`export … from`/`import()`
 *     specifiers, and every bare specifier is checked against `zod` and `@sentry/*`. This fails
 *     on the *import*, before a build exists, and names the path that reintroduced it.
 *  2. **The zod-free predicates and the zod schemas agree.** Removing a schema from a client path
 *     is only safe if the rule survived the move, so `isLanguagePreference` is compared with
 *     `AcceptLanguageSchema` and `isLaunchLocaleCode` with `LocaleCookieSchema` over one corpus of
 *     accepted and forged values. The schemas are unchanged, still exported and still the
 *     server-side boundary parsers (`plan/12` §2); this is what pins them to the same rules.
 */
import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  LAUNCH_LOCALE_CODES,
  isLaunchLocaleCode,
} from "../../src/config/locales.data.ts";
import {
  LANGUAGE_RANGE_PATTERN,
  type LanguagePreference,
  isLanguagePreference,
} from "../../src/modules/i18n/hints.ts";
import {
  AcceptLanguageSchema,
  LocaleCookieSchema,
} from "../../src/modules/i18n/schemas.ts";

const repoRoot = resolve(__dirname, "../..");

/**
 * The client entry points whose transitive imports become bytes on a public document: the island
 * (a lazily fetched chunk on every locale document), its loader (in the initial bundle) and the
 * root error boundary (attached by Next to *every* document).
 */
const CLIENT_ENTRY_POINTS = [
  "src/modules/i18n/ui/LocaleSuggestionBannerIsland.tsx",
  "src/modules/i18n/ui/LocaleSuggestionBannerLoader.tsx",
  "src/app/global-error.tsx",
] as const;

/** The same two modules `scripts/client-js-budget.ts` refuses to find in a built chunk. */
const FORBIDDEN_PACKAGES = [
  "zod",
  "@sentry/nextjs",
  "@sentry/browser",
] as const;

const SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["']([^"']+)["']|\brequire\s*\(\s*["']([^"']+)["']\s*\)/g;

/** Every module specifier of a file, comments stripped so a documented name is not an import. */
function specifiersOf(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  const found: string[] = [];
  for (const match of code.matchAll(SPECIFIER)) {
    const specifier = match[1] ?? match[2];
    if (specifier !== undefined) found.push(specifier);
  }
  return found;
}

const EXTENSIONS = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"] as const;

/** Resolve a relative or `@/`-aliased specifier to a repository-relative file, or `null`. */
function resolveLocal(fromFile: string, specifier: string): string | null {
  const base = specifier.startsWith("@/")
    ? resolve(repoRoot, "src", specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(repoRoot, dirname(fromFile), specifier)
      : null;
  if (base === null) return null;
  for (const extension of EXTENSIONS) {
    const candidate = `${base}${extension}`;
    try {
      readFileSync(candidate, "utf8");
      return relative(repoRoot, candidate);
    } catch {
      continue;
    }
  }
  throw new Error(`unresolvable import ${specifier} in ${fromFile}`);
}

interface Reached {
  readonly files: readonly string[];
  /** `package -> the import chain that reaches it`, entry point first. */
  readonly packages: ReadonlyMap<string, readonly string[]>;
}

/** Walk the static import graph from one entry point. JSON imports are files, not packages. */
function reachableFrom(entry: string): Reached {
  const files: string[] = [];
  const packages = new Map<string, string[]>();
  const walk = (file: string, chain: readonly string[]): void => {
    if (files.includes(file)) return;
    files.push(file);
    const source = readFileSync(resolve(repoRoot, file), "utf8");
    for (const specifier of specifiersOf(source)) {
      const local = resolveLocal(file, specifier);
      if (local === null) {
        if (!packages.has(specifier)) packages.set(specifier, [...chain, file]);
        continue;
      }
      if (local.endsWith(".json")) continue;
      walk(local, [...chain, file]);
    }
  };
  walk(entry, []);
  return { files, packages };
}

describe("no client entry point imports a forbidden module (AC-25 precondition)", () => {
  for (const entry of CLIENT_ENTRY_POINTS) {
    const reached = reachableFrom(entry);

    for (const forbidden of FORBIDDEN_PACKAGES) {
      it(`${entry} does not reach \`${forbidden}\``, () => {
        const chain = reached.packages.get(forbidden);

        expect(
          chain === undefined ? null : [...chain, forbidden].join(" -> "),
        ).toBeNull();
      });
    }

    it(`${entry} reaches no module of the i18n barrel or the parsed locale registry`, () => {
      // Both are how zod came back the last two times: the barrel pulls the whole module and
      // `src/config/locales.ts` parses its registry at module load.
      expect(reached.files).not.toContain("src/modules/i18n/index.ts");
      expect(reached.files).not.toContain("src/config/locales.ts");
    });
  }

  /**
   * The guard on the guard: the walker must actually see through a re-export chain. A file that
   * *does* reach zod through two hops has to be reported, or the assertions above would pass on a
   * broken walker — which is precisely how the regression hid.
   */
  it("reports zod through a multi-hop chain, so a green result means something", () => {
    const reached = reachableFrom("src/modules/i18n/ui/LocaleSwitcher.tsx");

    expect([...reached.packages.keys()]).toContain("zod");
    expect(reached.packages.get("zod")?.[0]).toBe(
      "src/modules/i18n/ui/LocaleSwitcher.tsx",
    );
  });
});

describe("the zod-free predicates carry the schemas' rules", () => {
  const preferences: readonly unknown[] = [
    { tag: "de", quality: 1 },
    { tag: "en-GB", quality: 0.9 },
    { tag: "zh-Hant-TW", quality: 0.001 },
    { tag: "de", quality: 0 },
    { tag: "de", quality: 1.0001 },
    { tag: "de", quality: -0.1 },
    { tag: "de", quality: Number.NaN },
    { tag: "de", quality: "1" },
    { tag: "de_DE", quality: 1 },
    { tag: "de-DE-", quality: 1 },
    { tag: "*", quality: 1 },
    { tag: "", quality: 1 },
    { tag: "abcdefghi", quality: 1 },
    { tag: "de" },
    { quality: 1 },
    { tag: "de", quality: 1, extra: true },
    null,
    "de",
    42,
    [],
  ];

  for (const value of preferences) {
    it(`agrees with AcceptLanguageSchema on ${JSON.stringify(value) ?? "undefined"}`, () => {
      expect(isLanguagePreference(value)).toBe(
        AcceptLanguageSchema.safeParse([value]).success,
      );
    });
  }

  it("is the same regular expression the schema is built from", () => {
    expect(LANGUAGE_RANGE_PATTERN.source).toBe(
      /^[A-Za-z]{1,8}(?:-[A-Za-z0-9]{1,8})*$/.source,
    );
  });

  it("types a preference the schema accepts", () => {
    const parsed = AcceptLanguageSchema.parse([{ tag: "de", quality: 1 }]);
    const first: LanguagePreference | undefined = parsed[0];

    expect(first?.tag).toBe("de");
  });

  it("holds exactly the launch locale codes LocaleCookieSchema offers", () => {
    expect([...LAUNCH_LOCALE_CODES].sort()).toEqual(
      [...LocaleCookieSchema.options].sort(),
    );
  });

  for (const value of [
    "en",
    "en-gb",
    "de",
    "pl",
    "zz",
    "fr",
    "EN",
    "en-GB",
    "en_gb",
    " de ",
    "",
    "en-XA",
    "ar-XB",
    "de,pl",
    "../../etc/passwd",
  ]) {
    it(`agrees with LocaleCookieSchema on \`${value}\``, () => {
      expect(isLaunchLocaleCode(value)).toBe(
        LocaleCookieSchema.safeParse(value).success,
      );
    });
  }
});
