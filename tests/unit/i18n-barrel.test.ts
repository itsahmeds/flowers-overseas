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
 * `MessagesSchema`, `MessageMetaSchema` and `MessageMetaManifestSchema` (TASK-038) join
 * `MoneySchema` in `PINNED_SCHEMA_EXPORTS`; `MESSAGE_META_COLUMNS` and `messageMeta` are in
 * `FORBIDDEN_EXPORTS` instead, because the `message_catalog` column mapping is a fact spec 012's
 * mirror needs *inside* the module and the manifest reader is a provider read, not a caller API.
 *
 * TASK-039 adds `unreviewedShare`, `localeBetaTag`, `isLocaleIndexable` and `alternatesFor` —
 * four functions, no data. `UNREVIEWED_SHARE_THRESHOLD` (a constant), `resetReviewCache()` (the
 * memoisation test hook) and `emitInHreflang()` (an internal predicate) go to
 * `FORBIDDEN_EXPORTS`: a caller able to reach the first two could move the indexability answer at
 * runtime, which is the same objection AC-3 raises to `withLocaleRegistry`.
 *
 * TASK-042 adds `routableLocale`, `routableLocaleCodes` (the launch locales plus the pseudo-
 * locales, when `ENABLE_PSEUDO_LOCALES` is on) and `pseudoCatalogue` (the pure `en → en-XA/ar-XB`
 * derivation). Three functions, no data: the flag is read inside `src/config/locales.ts` and no
 * export lets a caller move it, `PSEUDO_LOCALES`/`isPseudoLocaleCode` stay in `src/config`, and
 * `generatePseudoCatalogues`/`mapIcuText` stay module-internal in `pseudo.ts`.
 *
 * TASK-041 adds `parseAcceptLanguage`, `preferredLocale`, the `LocaleSuggestionBanner` Server
 * Component and `LocaleCookieSchema` — the fifth pinned schema, here for the `MoneySchema`
 * reason: `fo_locale` is read back from `document.cookie` and spec 004's currency UI will ask
 * "is this a locale code the application offers?" without restating the enum. The island's own
 * seams are in `FORBIDDEN_EXPORTS`: `decideSuggestion`, `languagePreferences`, `readLocaleCookie`,
 * `serialiseLocaleCookie` and `suggestionCandidates` are how the banner is assembled, and the two
 * cookie constants are exported configuration of exactly the kind AC-3 forbids. `LocaleSwitcher`
 * and `LocaleSuggestionBanner` are the two components in the list.
 *
 * `LocaleSwitcher` (TASK-035) is the first component in the list. It is still a function and still
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
  "AddressInputSchema",
  "LocaleCookieSchema",
  "LocaleSuggestionBanner",
  "LocaleSwitcher",
  "MessageMetaManifestSchema",
  "MessageMetaSchema",
  "MessagesSchema",
  "MoneySchema",
  "formatAddressBlock",
  "normalisePostcode",
  "postcodeRegex",
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
  // Added by TASK-067 (spec 005 AC-11): integer minor units as a locale-independent decimal
  // string, so `Offer.price` and the rendered price are digit-shifted by the same code.
  "moneyDecimalString",
  "namespacesFor",
  "parseLocaleFromPath",
  "sortBy",
  "alternatesFor",
  "isLocaleIndexable",
  "localeBetaTag",
  "unreviewedShare",
  "pseudoCatalogue",
  "routableLocale",
  "routableLocaleCodes",
  "parseAcceptLanguage",
  "preferredLocale",
  // Added by TASK-105 (spec 008 AC-4, AC-1's routing half): the two listing URL builders. Both are
  // functions that compose through `localePath()` and contribute no string of their own, so the
  // locale's authored `pathSegments` stay the only source of a fixed segment. The *values* they
  // are built from — the six page-type names — deliberately stay out of this barrel and live in
  // `src/modules/catalog` as `listingPageTypes`, because a value list is exactly what AC-3 keeps
  // out of here.
  "listingPath",
  "productPath",
].sort();

/**
 * The only exports allowed not to be functions: zod schemas callers need at their own boundaries
 * (TASK-036 exports `MoneySchema` because money crosses every API, form and job boundary and
 * `plan/12` §2 would otherwise be met by a hand-written money schema per caller). Each must be a
 * real zod schema — not an object literal, not a config bag — and carries no locale set, no
 * provider and no setter, which is what AC-3 actually forbids.
 */
const PINNED_SCHEMA_EXPORTS = [
  "AddressInputSchema",
  "LocaleCookieSchema",
  "MessageMetaManifestSchema",
  "MessageMetaSchema",
  "MessagesSchema",
  "MoneySchema",
];

/** Names that must never appear in the barrel, with the reason each is a seam and not an API. */
const FORBIDDEN_EXPORTS = [
  "AcceptLanguageSchema",
  "FO_LOCALE_COOKIE",
  "FO_LOCALE_MAX_AGE",
  "decideSuggestion",
  "languagePreferences",
  "readLocaleCookie",
  "serialiseLocaleCookie",
  "suggestionCandidates",
  "UNREVIEWED_SHARE_THRESHOLD",
  "resetReviewCache",
  "emitInHreflang",
  "MESSAGE_META_COLUMNS",
  "messageMeta",
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
