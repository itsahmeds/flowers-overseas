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
import { z } from "zod";

import * as barrel from "../../src/modules/i18n";

const repoRoot = resolve(__dirname, "../..");

/** Every runtime export of `src/modules/i18n/index.ts`, in alphabetical order. */
const PINNED_EXPORTS = [
  "LocaleSwitcher",
  "MoneySchema",
  "collator",
  "documentFallbackLocale",
  "fallbackChain",
  "getLocaleRegistry",
  "isLaunchLocale",
  "launchLocale",
  "launchLocaleCodes",
  "launchLocales",
  "formatDate",
  "formatList",
  "formatMoney",
  "formatNumber",
  "formatPercentFromBasisPoints",
  "formatRange",
  "formatRelativeTime",
  "formatTimeInZone",
  "loadMessages",
  "localePath",
  "namespacesFor",
  "parseLocaleFromPath",
  "sortBy",
].sort();

/**
 * The only exports allowed not to be functions: zod schemas callers need at their own boundaries
 * (TASK-036 exports `MoneySchema` because money crosses every API, form and job boundary and
 * `plan/12` §2 would otherwise be met by a hand-written money schema per caller). Each must be a
 * real zod schema — not an object literal, not a config bag — and carries no locale set, no
 * provider and no setter, which is what AC-3 actually forbids.
 */
const PINNED_SCHEMA_EXPORTS = ["MoneySchema"];

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

  it("exports functions only, apart from the pinned zod schemas", () => {
    for (const [name, value] of Object.entries(barrel)) {
      if (PINNED_SCHEMA_EXPORTS.includes(name)) continue;
      expect(typeof value, name).toBe("function");
    }
  });

  it("exports each pinned schema as a zod schema and nothing mutable", () => {
    for (const name of PINNED_SCHEMA_EXPORTS) {
      const value = (barrel as Record<string, unknown>)[name];
      expect(value, name).toBeInstanceOf(z.ZodType);
      expect(Object.keys(value as object), name).not.toContain("set");
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
