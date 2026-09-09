/**
 * The 500 document's copy path is zod-free and says the same thing the catalogue does (spec 004
 * §13 Q13, AC-25's precondition; TASK-046).
 *
 * Two independent claims, both of which would otherwise be a comment nobody can check:
 *
 *  1. **Parity.** `errorDocument()` reads `messages/en.json` and the x-default locale row
 *     directly. Every value must equal what the ordinary, zod-validated path answers —
 *     `documentFallbackLocale()` for the attributes and `loadMessages()` for the four strings —
 *     or the failure page would quietly drift away from every other document's copy. Asserting
 *     the equality is also what makes the shortcut safe to keep: change the x-default locale, or
 *     move a key, and this fails.
 *  2. **Reachability.** No module reachable from `src/app/global-error.tsx` may import zod. That
 *     is asserted by walking the *actual* import graph from the file, not by reading it: the whole
 *     failure mode being prevented is a transitive import three files deep (`messages.ts` →
 *     `schemas.ts` → `zod`) that nobody notices, and Next attaches this file's client chunk to
 *     every document, so one such import puts ~70 KB Brotli of validator on `/`.
 *
 * The build-output half of the same claim — that no chunk a document fetches contains zod or the
 * Sentry SDK — is `scripts/client-js-budget.ts`'s `forbiddenModuleHits()`, run by the CI `build`
 * job against a real build.
 */
import { readFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { X_DEFAULT_LOCALE } from "../../src/config/locales.data.ts";
import { errorDocument } from "../../src/modules/i18n/error-document.ts";
import { loadMessages } from "../../src/modules/i18n/messages.ts";
import { documentFallbackLocale } from "../../src/modules/i18n/registry.ts";

const repoRoot = resolve(__dirname, "../..");

describe("errorDocument() (parity with the validated path)", () => {
  const copy = errorDocument();
  const messages = loadMessages(documentFallbackLocale().code, [
    "meta",
    "errors",
  ]);

  it("declares the same locale the registry resolves for a non-localised document", () => {
    const locale = documentFallbackLocale();
    expect(copy.lang).toBe(locale.bcp47);
    expect(copy.dir).toBe(locale.dir);
    expect(X_DEFAULT_LOCALE.code).toBe(locale.code);
  });

  it("renders the same four strings `loadMessages` resolves", () => {
    expect(copy.title).toBe(messages.meta.error.title);
    expect(copy.heading).toBe(messages.errors.serverError.heading);
    expect(copy.body).toBe(messages.errors.serverError.body);
    expect(copy.retry).toBe(messages.errors.serverError.retry);
  });

  it("returns four non-empty strings, so no `<title>` or heading can be blank (AC-25)", () => {
    for (const [field, value] of Object.entries(copy)) {
      expect(value, field).toEqual(expect.any(String));
      expect((value as string).length, field).toBeGreaterThan(0);
    }
  });
});

/**
 * Resolve a relative import specifier to a file inside the repository, or `undefined` for a
 * package. Handles the repository's two conventions: explicit `.ts`/`.tsx` extensions and the
 * `@/*` alias from `tsconfig.json`.
 */
function resolveImport(
  fromFile: string,
  specifier: string,
): string | undefined {
  const base = specifier.startsWith("@/")
    ? resolve(repoRoot, "src", specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(dirname(fromFile), specifier)
      : undefined;
  if (base === undefined) return undefined;
  if (extname(base) !== "") return base;
  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
  ]) {
    try {
      readFileSync(candidate, "utf8");
      return candidate;
    } catch {
      continue;
    }
  }
  return undefined;
}

const IMPORT = /(?:^|\n)\s*import\s[^;]*?from\s*"([^"]+)"/g;

/** Every repository file reachable from `entry`, plus every bare package specifier seen. */
function importClosure(entry: string): {
  files: Set<string>;
  packages: Set<string>;
} {
  const files = new Set<string>();
  const packages = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || files.has(file)) continue;
    files.add(file);
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(IMPORT)) {
      const specifier = match[1];
      if (specifier === undefined) continue;
      const resolved = resolveImport(file, specifier);
      if (resolved === undefined) {
        packages.add(specifier);
        continue;
      }
      if (!resolved.endsWith(".json")) queue.push(resolved);
    }
  }
  return { files, packages };
}

describe("nothing reachable from global-error.tsx imports zod (AC-25's precondition)", () => {
  const entry = resolve(repoRoot, "src/app/global-error.tsx");
  const { files, packages } = importClosure(entry);

  it("walks a closure the test itself can vouch for", () => {
    // A closure of one file would make every assertion below vacuous, and the resolver silently
    // failing is exactly how that happens.
    expect(files.size).toBeGreaterThanOrEqual(3);
    expect([...files]).toContain(
      resolve(repoRoot, "src/modules/i18n/error-document.ts"),
    );
    expect([...files]).toContain(
      resolve(repoRoot, "src/config/locales.data.ts"),
    );
  });

  it("reaches neither zod nor the Sentry SDK, as a package or as a file", () => {
    for (const specifier of packages) {
      expect(specifier, specifier).not.toMatch(/^zod/);
      expect(specifier, specifier).not.toMatch(/^@sentry\//);
    }
    for (const file of files) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(
        /from "zod"|from "@sentry\//,
      );
    }
  });

  it("reaches neither the i18n barrel nor the modules that used to pull the whole set in", () => {
    for (const forbidden of [
      "src/modules/i18n/index.ts",
      "src/modules/i18n/messages.ts",
      "src/modules/i18n/registry.ts",
      "src/modules/i18n/schemas.ts",
      "src/modules/i18n/format.ts",
      "src/config/locales.ts",
      "src/lib/env.schema.ts",
    ]) {
      expect([...files], forbidden).not.toContain(resolve(repoRoot, forbidden));
    }
  });

  it("would notice a zod import coming back: the same walk finds it elsewhere", () => {
    // Sanity check on the walker, against a file that *does* reach zod through two hops.
    const control = importClosure(
      resolve(repoRoot, "src/modules/i18n/messages.ts"),
    );
    expect([...control.packages]).toContain("zod");
  });
});
