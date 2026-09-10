/**
 * No client graph reaches a message catalogue, a translator or a provider (spec 004 §13 Q13
 * option (b), §14 A1 addendum; TASK-085). The guard for the rule that made this task worth doing.
 *
 * ## What it prevents, in bytes
 *
 * Two static JSON imports were reachable from Client Components, and Turbopack tree-shakes a JSON
 * import only below a size threshold:
 *
 *  - `src/modules/i18n/error-document.ts` imported all of `messages/en.json` for four strings.
 *    `src/app/global-error.tsx` imports it, and Next attaches the root error boundary's chunk to
 *    **every** document, so the whole 12.5 KB catalogue — `home.*`, `catalog.*`, `media.*`, every
 *    namespace — sat in the initial script set of `/` and of every locale document at 4 751 B
 *    Brotli. Worse than the bytes: each copy task paid 0 B or ~3.4 KB depending on which side of
 *    the threshold `en.json` happened to land that day (recorded on TASK-052 and TASK-073).
 *  - `src/modules/i18n/messages.ts` statically imports **four** catalogues and their review
 *    manifests, and it is re-exported from the `@/modules/i18n` barrel, so one barrel import from
 *    an island would have shipped all of them.
 *
 * Both are closed, and `NextIntlClientProvider` — 10 705 B Brotli of provider plus payload on
 * every locale document — is gone with them.
 *
 * ## Why an import walk rather than `server-only`
 *
 * `import "server-only"` would poison `messages.ts` for the bundler, but the package exists only
 * inside Next's build: `messages.ts` is imported in plain Node by `scripts/i18n-check.ts`,
 * `scripts/i18n-draft.ts`, `scripts/client-js-budget.ts` and a dozen unit tests, all of which it
 * would break, and aliasing it to a stub in two runners risks silently disabling the poison in the
 * build as well. This walk is also the stronger guard: it fails on the barrel, on `next-intl`'s
 * client hooks and on a **direct** `messages/*.json` import, none of which a poison in one module
 * can see. `scripts/client-js-budget.ts` asserts the same thing from the other end — no fetched
 * chunk contains `home.*`/`finder.*`/`catalog.*`/`media.*` copy — so a leak has to get past a
 * source walk and a byte scan.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { importClosure } from "./support/import-closure.ts";

const repoRoot = resolve(__dirname, "../..");

/** Every `.ts`/`.tsx` file under `src/`, as absolute paths. */
function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(entry.name)) files.push(path);
  }
  return files.sort();
}

const allSources = sourceFiles(resolve(repoRoot, "src"));

/**
 * The client entry points: every module that declares `"use client"`. Next compiles each into a
 * client chunk together with everything it can import, so these are the roots of every graph a
 * browser ever downloads — the two error boundaries included, which is what makes this rule apply
 * to `/` as well as to a locale document.
 */
const clientEntries = allSources.filter((file) =>
  /^\s*["']use client["'];/m.test(readFileSync(file, "utf8")),
);

/** Modules a client graph may not reach, with the reason each one is expensive. */
const FORBIDDEN_FILES = [
  ["src/modules/i18n/messages.ts", "four static catalogue imports"],
  ["src/modules/i18n/index.ts", "the barrel re-exports `loadMessages`"],
  ["src/modules/i18n/request.ts", "loads every namespace"],
  ["src/modules/i18n/pseudo.ts", "derives a catalogue from `en`"],
  ["src/modules/i18n/schemas.ts", "zod"],
  ["src/config/locales.ts", "zod, and the whole locale registry"],
] as const;

/** Packages a client graph may not reach: the translator, the formatter and the provider. */
const FORBIDDEN_PACKAGES = [/^next-intl(\/|$)/, /^zod(\/|$)/, /^@sentry\//];

/** Source text no `"use client"` module may contain (the hooks, wherever they came from). */
const FORBIDDEN_SYMBOLS = [
  "useTranslations",
  "useFormatter",
  "useMessages",
  "NextIntlClientProvider",
  "getTranslations",
];

const show = (file: string): string => relative(repoRoot, file);

/**
 * A file's source with its comments removed — block comments (`/* … *\/`, JSX `{/* … *\/}`
 * included) and line comments. These names legitimately appear in prose: this rule is worth
 * explaining where it bites, and the headers of `[locale]/layout.tsx`, `messages.ts` and the two
 * boundaries all explain it. The import walk above is the authoritative half of the guard — no
 * `next-intl` edge means no hook can be called — so this scan only has to be free of false
 * positives, which is why it strips rather than counts.
 */
function codeOf(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("the client entry list this file walks", () => {
  it("finds every island, so no assertion below is vacuous", () => {
    expect(clientEntries.length).toBeGreaterThanOrEqual(5);
    for (const expected of [
      "src/app/global-error.tsx",
      "src/app/[locale]/error.tsx",
      "src/modules/i18n/ui/LocaleSuggestionBannerIsland.tsx",
      "src/modules/i18n/ui/LocaleSuggestionBannerLoader.tsx",
      "src/modules/ui/consent/ConsentBannerIsland.tsx",
      "src/modules/ui/home/FinderTypeahead.tsx",
    ]) {
      expect(clientEntries.map(show)).toContain(expected);
    }
  });

  it("walks a closure the test itself can vouch for", () => {
    // A resolver that silently returns nothing would make every assertion pass. The banner
    // island's own graph is the control: it reaches `hints.ts`, which reaches `locales.data.ts`.
    const closure = importClosure(
      resolve(repoRoot, "src/modules/i18n/ui/LocaleSuggestionBannerIsland.tsx"),
    );
    expect([...closure.files].map(show)).toContain("src/modules/i18n/hints.ts");
    expect([...closure.files].map(show)).toContain(
      "src/config/locales.data.ts",
    );
  });
});

describe("no client graph reaches a catalogue, a translator or a provider", () => {
  for (const entry of clientEntries) {
    const closure = importClosure(entry);

    it(`${show(entry)} imports no message catalogue JSON`, () => {
      expect([...closure.json].map(show)).toEqual([]);
    });

    it(`${show(entry)} reaches none of the catalogue-carrying modules`, () => {
      for (const [file, why] of FORBIDDEN_FILES) {
        expect(
          [...closure.files].map(show),
          `${show(entry)} must not reach ${file} (${why})`,
        ).not.toContain(file);
      }
    });

    it(`${show(entry)} reaches no next-intl, zod or Sentry package`, () => {
      for (const specifier of closure.packages) {
        for (const forbidden of FORBIDDEN_PACKAGES) {
          expect(specifier, `${show(entry)} reaches ${specifier}`).not.toMatch(
            forbidden,
          );
        }
      }
    });

    it(`${show(entry)} names no translator hook anywhere in its closure`, () => {
      for (const file of closure.files) {
        const code = codeOf(file);
        for (const symbol of FORBIDDEN_SYMBOLS) {
          expect(code, `${show(file)} (from ${show(entry)})`).not.toContain(
            symbol,
          );
        }
      }
    });
  }
});

describe("the walk would notice any of it coming back", () => {
  it("finds the catalogue JSON from `messages.ts`, and next-intl from a Server Component", () => {
    const messages = importClosure(
      resolve(repoRoot, "src/modules/i18n/messages.ts"),
    );
    expect([...messages.json].map(show)).toContain("messages/en.json");

    const footer = importClosure(
      resolve(repoRoot, "src/modules/ui/layout/SiteFooter.tsx"),
    );
    expect([...footer.packages]).toContain("next-intl");
  });

  it("no `NextIntlClientProvider` is mounted anywhere under `src/`", () => {
    // The provider is the 10 705 B item §14 A1's addendum removed. It may still appear in a test
    // harness (`vitest` resolves next-intl's client build, so a Server Component under test needs
    // context) but nowhere in the application.
    for (const file of allSources) {
      expect(codeOf(file), show(file)).not.toContain("NextIntlClientProvider");
    }
  });
});
