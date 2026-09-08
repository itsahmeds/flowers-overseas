/**
 * T-03 / AC-3 (TASK-034): the `src/modules/i18n` barrel exports the documented functions and types
 * and **nothing else** — no provider instance, no injection hook, no `messages/` path.
 *
 * The export list is pinned, not merely filtered: adding `staticLocaleRegistry`,
 * `repoMessageSource`, `withLocaleRegistry` or a mutable config object to `index.ts` fails here,
 * which is what keeps spec 002/012's "hydrate from Postgres without touching a caller" promise
 * enforceable (AC-5) rather than aspirational. A later spec-003 task that legitimately adds a
 * function (the formatters, `alternatesFor`, …) extends `PINNED_EXPORTS` in the same PR.
 *
 * `LocaleSwitcher` (TASK-035) is the one component in the list. It is still a function and still
 * carries no configuration — a Server Component reading the registry through the same accessor as
 * every other export — so the "functions only, no mutable config" assertion below holds unchanged.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import * as barrel from "../../src/modules/i18n";

const repoRoot = resolve(__dirname, "../..");

/** Every runtime export of `src/modules/i18n/index.ts`, in alphabetical order. */
const PINNED_EXPORTS = [
  "LocaleSwitcher",
  "documentFallbackLocale",
  "fallbackChain",
  "getLocaleRegistry",
  "isLaunchLocale",
  "launchLocale",
  "launchLocaleCodes",
  "launchLocales",
  "loadMessages",
  "localePath",
  "namespacesFor",
  "parseLocaleFromPath",
].sort();

/** Names that must never appear in the barrel, with the reason each is a seam and not an API. */
const FORBIDDEN_EXPORTS = [
  "staticLocaleRegistry",
  "repoMessageSource",
  "withLocaleRegistry",
  "withMessageSource",
  "localeRegistryOf",
  "getMessageSource",
  "resolveCatalogue",
];

describe("the i18n barrel (AC-3)", () => {
  it("exports exactly the pinned list", () => {
    expect(Object.keys(barrel).sort()).toEqual(PINNED_EXPORTS);
  });

  it("exports no provider instance and no injection hook", () => {
    for (const name of FORBIDDEN_EXPORTS) {
      expect(barrel, name).not.toHaveProperty(name);
    }
  });

  it("exports functions only: no object, no array, no mutable config", () => {
    for (const [name, value] of Object.entries(barrel)) {
      expect(typeof value, name).toBe("function");
    }
  });

  it("names no `messages/` path", () => {
    const source = readFileSync(
      resolve(repoRoot, "src/modules/i18n/index.ts"),
      "utf8",
    );
    const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    expect(code).not.toContain("messages/");
    expect(code).not.toContain(".json");
  });
});
