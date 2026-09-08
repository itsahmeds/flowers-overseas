/**
 * Parity between the zod-free locale constants and the zod-validated registry (spec 004 §13 Q13,
 * AC-25's precondition; TASK-046).
 *
 * TASK-046 split the locale set in two files so that the one client path that needs a locale —
 * `src/app/global-error.tsx`, whose chunk Next attaches to *every* document — reaches no zod.
 * That split creates exactly one new way to be wrong: the constants and the parsed registry could
 * disagree. Spec 003 AC-1 ("the registry is parsed at module load and a malformed edit names the
 * offending field") is unchanged only if the thing parsed is the thing shipped, so this file
 * asserts that, field for field and object for object, in both directions:
 *
 *  - every constant survives `LocaleRegistrySchema` unchanged — no default is being applied, no
 *    transform is rewriting a value, so what `locales.ts` exports *is* what `locales.data.ts`
 *    wrote;
 *  - the fields are exactly the schema's (`.strict()` would have thrown otherwise, which is the
 *    point of asserting the parse rather than a hand-written field list);
 *  - `X_DEFAULT_LOCALE` — the row the 500 document renders, read by position — is the row that
 *    declares `x-default` and the one `locales.ts` resolves as `xDefaultLocale`.
 */
import { describe, expect, it } from "vitest";

import {
  LAUNCH_LOCALE_DATA,
  PATH_SEGMENT_KEYS as DATA_PATH_SEGMENT_KEYS,
  PSEUDO_LOCALE_DATA,
  PSEUDO_LOCALE_CODES,
  X_DEFAULT,
  X_DEFAULT_LOCALE,
  isPseudoLocaleCode,
  textDirections as dataTextDirections,
} from "../../src/config/locales.data.ts";
import {
  LOCALES,
  LocaleRegistrySchema,
  PATH_SEGMENT_KEYS,
  PSEUDO_LOCALES,
  launchLocales,
  localeConfig,
  textDirections,
  xDefaultLocale,
} from "../../src/config/locales.ts";

describe("the constants and the zod-validated registry are the same rows", () => {
  it("survives LocaleRegistrySchema unchanged: no default, no transform, no rewrite", () => {
    expect(LocaleRegistrySchema.parse(LAUNCH_LOCALE_DATA)).toEqual([
      ...LAUNCH_LOCALE_DATA,
    ]);
    expect(
      LocaleRegistrySchema.parse([
        ...LAUNCH_LOCALE_DATA,
        ...PSEUDO_LOCALE_DATA,
      ]),
    ).toEqual([...LAUNCH_LOCALE_DATA, ...PSEUDO_LOCALE_DATA]);
  });

  it("is what `LOCALES` exports, in the same order", () => {
    expect(LOCALES).toEqual([...LAUNCH_LOCALE_DATA]);
  });

  it("spells out `formattingTag` and `isPseudo` rather than relying on the schema's defaults", () => {
    for (const locale of [...LAUNCH_LOCALE_DATA, ...PSEUDO_LOCALE_DATA]) {
      expect(locale.formattingTag, locale.code).toEqual(expect.any(String));
      expect(typeof locale.isPseudo, locale.code).toBe("boolean");
    }
  });

  it("re-exports the shared names from `locales.ts`, so no import path moved", () => {
    expect(PATH_SEGMENT_KEYS).toBe(DATA_PATH_SEGMENT_KEYS);
    expect(textDirections).toBe(dataTextDirections);
    expect(PSEUDO_LOCALES).toBe(PSEUDO_LOCALE_DATA);
    expect(PSEUDO_LOCALE_CODES).toEqual(["en-XA", "ar-XB"]);
    expect(isPseudoLocaleCode("ar-XB")).toBe(true);
    expect(isPseudoLocaleCode("de")).toBe(false);
  });

  it("keeps the launch set the four locales of ADR-0003", () => {
    expect(LAUNCH_LOCALE_DATA.map((locale) => locale.code)).toEqual([
      "en",
      "en-gb",
      "de",
      "pl",
    ]);
    expect(launchLocales).toEqual(["en", "en-gb", "de", "pl"]);
    expect(LAUNCH_LOCALE_DATA.every((locale) => locale.isLaunch)).toBe(true);
    expect(PSEUDO_LOCALE_DATA.every((locale) => !locale.isLaunch)).toBe(true);
  });
});

describe("X_DEFAULT_LOCALE — the row the 500 document renders", () => {
  it("is the row that declares `x-default`", () => {
    expect(X_DEFAULT_LOCALE.hreflangAliases).toContain(X_DEFAULT);
    // `.map(String)` widens each row's `as const` alias tuple to `string[]`: without it TypeScript
    // narrows `includes`' parameter to the intersection of the tuples, which is `never`.
    expect(
      LAUNCH_LOCALE_DATA.filter((locale) =>
        [...locale.hreflangAliases].map(String).includes(X_DEFAULT),
      ),
    ).toEqual([X_DEFAULT_LOCALE]);
  });

  it("is the row `locales.ts` resolves as `xDefaultLocale`", () => {
    expect(X_DEFAULT_LOCALE.code).toBe(xDefaultLocale);
    expect(X_DEFAULT_LOCALE).toEqual(localeConfig(xDefaultLocale));
  });

  it("is read by position, and the position is the first row", () => {
    expect(X_DEFAULT_LOCALE).toBe(LAUNCH_LOCALE_DATA[0]);
  });

  it("carries the two attributes the failure document needs", () => {
    expect(X_DEFAULT_LOCALE.bcp47).toBe("en");
    expect(dataTextDirections).toContain(X_DEFAULT_LOCALE.dir);
  });
});

describe("the data module imports nothing (that is what keeps it zod-free)", () => {
  it("has no import statement at all", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const source = readFileSync(
      resolve(__dirname, "../../src/config/locales.data.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toMatch(/\brequire\(/);
  });
});
