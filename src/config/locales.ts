/**
 * Locale registry (spec 003 §2 "the no-database seam", §5.2, §5.3, §6; TASK-033).
 *
 * The Phase 0 source of truth for the locale set. Four launch locales — `en` (EUR, x-default),
 * `en-gb` (GBP), `de` (EUR), `pl` (PLN) — per ADR-0003, `plan/02` §3 and spec 003 §13 Q1. No
 * database is read here and none may be (`pnpm check:no-db`, AC-2): spec 002's
 * `locale(code, bcp47, name, is_launch, rtl, fallback_code)` stays the later persistence target
 * and hydrates through `LocaleRegistryProvider` (TASK-034) with no caller change.
 *
 * Two things about this file are load-bearing for later specs:
 *
 *  - **`isLaunch` is the Phase 0 locale go-live switch.** That is a stated, bounded deviation
 *    from `CLAUDE.md`'s "go-live is a data flip in admin, never a code change" while spec 002 is
 *    parked and there is no admin: spec 003 §12 and §13 Q8. The flag is read only through
 *    `LocaleRegistryProvider`, so spec 002's `feature_flag` scope `locale` plus spec 012's admin
 *    take over the authority with zero caller changes.
 *  - **`pathSegments` is human-authored URL data taken from `plan/02` §4.1**, never machine
 *    drafted (spec 003 §6). `localePath()` (TASK-034) is the only URL builder, so specs 007–011
 *    cannot hand-concatenate a path or emit a German slug on a Polish URL. Shape and per-locale
 *    uniqueness are also gated by `pnpm i18n:check` (AC-13, TASK-040).
 *
 * `toLocaleRow()` projects exactly spec 002 §5.1's `locale` column set so TASK-015's seed reads
 * the projection instead of restating the locale set (AC-4).
 */
import { isCurrencyCode } from "./currencies.ts";

import { z } from "zod";

/**
 * Localised URL path segments, one key per `plan/02` §4.1 page type whose segment that table
 * spells out in all three of its locale columns. The remaining §4.1 rows ("How it works, about,
 * guarantee, contact, FAQ, reviews" and the noindex funnel paths) say only "localised" and are
 * authored by the spec that ships those pages (004/007) — as a key added here for **every**
 * locale at once, which `LocaleRegistrySchema`'s completeness refinement enforces. Leaf slugs
 * (`terms`, `agb`, a product slug) are per-entity translations in the database, not segments
 * (`plan/02` §4).
 */
export const PATH_SEGMENT_KEYS = [
  "destinations",
  "shopCategory",
  "occasions",
  "product",
  "blog",
  "forFlorists",
  "legal",
] as const;
export type PathSegmentKey = (typeof PATH_SEGMENT_KEYS)[number];

/** Lowercase ASCII, hyphen-separated, no trailing slash, no path separator (`plan/02` §4). */
const PATH_SEGMENT_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const PathSegmentSchema = z
  .string()
  .regex(
    PATH_SEGMENT_PATTERN,
    "must be a lowercase ASCII, hyphen-separated URL segment with no slash (plan/02 §4)",
  );

const PathSegmentsSchema = z
  .object(
    Object.fromEntries(
      PATH_SEGMENT_KEYS.map((key) => [key, PathSegmentSchema]),
    ) as Record<PathSegmentKey, typeof PathSegmentSchema>,
  )
  .strict();

/** `x-default` is an hreflang value but not a language tag, so it is allowed by name only. */
export const X_DEFAULT = "x-default";

const HreflangSchema = z.string().refine(
  (value) => {
    if (value === X_DEFAULT) return true;
    try {
      return new Intl.Locale(value).baseName === value;
    } catch {
      return false;
    }
  },
  { error: "must be `x-default` or a language tag `Intl.Locale` accepts" },
);

export const textDirections = ["ltr", "rtl"] as const;
export type TextDirection = (typeof textDirections)[number];

export const LocaleConfigSchema = z
  .object({
    /** URL prefix: lowercase, ASCII, `language` or `language-region` (`plan/02` §4). */
    code: z
      .string()
      .regex(
        /^[a-z]{2,3}(?:-[a-z]{2})?$/,
        "must be a lowercase ASCII URL prefix such as `de` or `en-gb`",
      ),
    /** The tag that reaches `<html lang>`, `Intl` and hreflang; `Intl.Locale` must accept it. */
    bcp47: z.string().refine(
      (value) => {
        try {
          return new Intl.Locale(value).baseName === value;
        } catch {
          return false;
        }
      },
      { error: "must be a canonical BCP-47 tag `Intl.Locale` accepts" },
    ),
    /** English name, as spec 002 §5.1's `locale.name` stores it. */
    name: z.string().min(1),
    /** Endonym shown in the chooser and the switcher — language names, never flags (plan/03 §2). */
    nativeName: z.string().min(1),
    dir: z.enum(textDirections),
    isLaunch: z.boolean(),
    /** Message fallback chain (`en-gb → en`, `de → en`, `pl → en`); `null` on the default. */
    fallbackCode: z.string().nullable(),
    /** Default display currency; must be a code in `src/config/currencies.ts`. */
    currencyDefault: z.string().refine(isCurrencyCode, {
      error: "must be a currency code configured in src/config/currencies.ts",
    }),
    numberingSystem: z
      .string()
      .regex(
        /^[a-z]{4,8}$/,
        "must be a CLDR numbering-system key such as `latn`",
      ),
    /** Every hreflang value served on this locale's URLs (`plan/02` §3), including `x-default`. */
    hreflangAliases: z.array(HreflangSchema).min(1),
    pathSegments: PathSegmentsSchema,
  })
  .strict();

export type LocaleConfig = z.infer<typeof LocaleConfigSchema>;

/**
 * Registry-level refinements of spec 003 §5.3, each reported on the offending field so the
 * message names what to fix (AC-1): unique codes, exactly one `x-default`, hreflang aliases
 * claimed by one locale only, every `fallbackCode` resolvable and acyclic terminating at the
 * x-default locale, and path segments unique within a locale.
 */
export const LocaleRegistrySchema = z
  .array(LocaleConfigSchema)
  .min(1)
  .superRefine((locales, ctx) => {
    const codes = new Set<string>();
    locales.forEach((locale, index) => {
      if (codes.has(locale.code)) {
        ctx.addIssue({
          code: "custom",
          path: [index, "code"],
          message: `duplicate locale code \`${locale.code}\``,
        });
      }
      codes.add(locale.code);
    });

    // Exactly one locale declares `x-default`, and it is the fallback-chain terminus.
    const xDefaults = locales.filter((locale) =>
      locale.hreflangAliases.includes(X_DEFAULT),
    );
    if (xDefaults.length !== 1) {
      ctx.addIssue({
        code: "custom",
        path: ["hreflangAliases"],
        message: `exactly one locale must declare the \`${X_DEFAULT}\` hreflang alias, found ${String(xDefaults.length)}`,
      });
    }
    const xDefault = xDefaults[0];
    if (xDefault !== undefined && !xDefault.isLaunch) {
      ctx.addIssue({
        code: "custom",
        path: [locales.indexOf(xDefault), "isLaunch"],
        message: `the \`${X_DEFAULT}\` locale \`${xDefault.code}\` must be a launch locale`,
      });
    }

    // An hreflang value may be served by one locale only, or two URLs would claim the same tag.
    const aliasOwner = new Map<string, string>();
    locales.forEach((locale, index) => {
      for (const alias of locale.hreflangAliases) {
        const key = alias.toLowerCase();
        const owner = aliasOwner.get(key);
        if (owner !== undefined) {
          ctx.addIssue({
            code: "custom",
            path: [index, "hreflangAliases"],
            message: `hreflang alias \`${alias}\` is already served by locale \`${owner}\``,
          });
        }
        aliasOwner.set(key, locale.code);
      }
    });

    // Fallback chains resolve, do not cycle and terminate at the x-default locale.
    locales.forEach((locale, index) => {
      if (locale.fallbackCode === null) {
        if (xDefault !== undefined && locale.code !== xDefault.code) {
          ctx.addIssue({
            code: "custom",
            path: [index, "fallbackCode"],
            message: `only the \`${X_DEFAULT}\` locale \`${xDefault.code}\` may have a null fallbackCode`,
          });
        }
        return;
      }
      const seen = new Set<string>([locale.code]);
      let current: LocaleConfig | undefined = locale;
      while (current?.fallbackCode != null) {
        const next: string = current.fallbackCode;
        if (seen.has(next)) {
          ctx.addIssue({
            code: "custom",
            path: [index, "fallbackCode"],
            message: `fallbackCode chain from \`${locale.code}\` cycles at \`${next}\` instead of terminating at the default locale`,
          });
          return;
        }
        seen.add(next);
        current = locales.find((candidate) => candidate.code === next);
        if (current === undefined) {
          ctx.addIssue({
            code: "custom",
            path: [index, "fallbackCode"],
            message: `fallbackCode \`${next}\` of locale \`${locale.code}\` resolves to no configured locale`,
          });
          return;
        }
      }
      if (
        xDefault !== undefined &&
        current !== undefined &&
        current.code !== xDefault.code
      ) {
        ctx.addIssue({
          code: "custom",
          path: [index, "fallbackCode"],
          message: `fallbackCode chain from \`${locale.code}\` terminates at \`${current.code}\`, not at the default locale \`${xDefault.code}\``,
        });
      }
    });

    // Path segments are unique within a locale: two page types cannot share one URL segment.
    locales.forEach((locale, index) => {
      const owner = new Map<string, PathSegmentKey>();
      for (const key of PATH_SEGMENT_KEYS) {
        const segment = locale.pathSegments[key];
        const existing = owner.get(segment);
        if (existing !== undefined) {
          ctx.addIssue({
            code: "custom",
            path: [index, "pathSegments", key],
            message: `path segment \`${segment}\` is already used by \`${existing}\` in locale \`${locale.code}\``,
          });
        }
        owner.set(segment, key);
      }
    });
  });

/**
 * The four launch locales. `pathSegments` values are `plan/02` §4.1 verbatim; `en` uses the
 * English column, identical to `en-gb`, because the table's English examples are the `en` forms.
 * `hreflangAliases` are `plan/02` §3's "hreflang values served on the same URL" column.
 */
const locales = [
  {
    code: "en",
    bcp47: "en",
    name: "English",
    nativeName: "English",
    dir: "ltr",
    isLaunch: true,
    fallbackCode: null,
    currencyDefault: "EUR",
    numberingSystem: "latn",
    hreflangAliases: ["en", X_DEFAULT, "en-IE", "en-NL", "en-150"],
    pathSegments: {
      destinations: "send-flowers-to",
      shopCategory: "flowers",
      occasions: "occasions",
      product: "product",
      blog: "blog",
      forFlorists: "for-florists",
      legal: "legal",
    },
  },
  {
    code: "en-gb",
    bcp47: "en-GB",
    name: "English (United Kingdom)",
    nativeName: "English (UK)",
    dir: "ltr",
    isLaunch: true,
    fallbackCode: "en",
    currencyDefault: "GBP",
    numberingSystem: "latn",
    hreflangAliases: ["en-GB"],
    pathSegments: {
      destinations: "send-flowers-to",
      shopCategory: "flowers",
      occasions: "occasions",
      product: "product",
      blog: "blog",
      forFlorists: "for-florists",
      legal: "legal",
    },
  },
  {
    code: "de",
    bcp47: "de",
    name: "German",
    nativeName: "Deutsch",
    dir: "ltr",
    isLaunch: true,
    fallbackCode: "en",
    currencyDefault: "EUR",
    numberingSystem: "latn",
    hreflangAliases: ["de", "de-DE", "de-AT"],
    pathSegments: {
      destinations: "blumen-verschicken",
      shopCategory: "blumen",
      occasions: "anlaesse",
      product: "produkt",
      blog: "blog",
      forFlorists: "fuer-floristen",
      legal: "rechtliches",
    },
  },
  {
    code: "pl",
    bcp47: "pl",
    name: "Polish",
    nativeName: "Polski",
    dir: "ltr",
    isLaunch: true,
    fallbackCode: "en",
    currencyDefault: "PLN",
    numberingSystem: "latn",
    hreflangAliases: ["pl", "pl-PL"],
    pathSegments: {
      destinations: "wyslij-kwiaty",
      shopCategory: "kwiaty",
      occasions: "okazje",
      product: "produkt",
      blog: "blog",
      forFlorists: "dla-kwiaciarni",
      legal: "regulamin",
    },
  },
] as const satisfies readonly LocaleConfig[];

/** Parsed at module load: a malformed registry throws on first import, never at request time. */
export const LOCALES: readonly LocaleConfig[] =
  LocaleRegistrySchema.parse(locales);

/** The closed set of configured prefixes, as a literal union. */
export type LocaleCode = (typeof locales)[number]["code"];

const byCode = new Map<string, LocaleConfig>(
  LOCALES.map((locale) => [locale.code, locale]),
);

/** Look a locale up by code. Throws on an unknown code: the locale set is closed data. */
export function localeConfig(code: LocaleCode): LocaleConfig {
  const locale = byCode.get(code);
  if (locale === undefined) {
    throw new Error(`unknown locale code: ${code}`);
  }
  return locale;
}

/** True when the string is one of the configured locale codes (boundary parsing helper). */
export function isLocaleCode(code: string): code is LocaleCode {
  return byCode.has(code);
}

/**
 * The locale serving `x-default` (`plan/02` §3: `x-default` points to `/en`). Also the
 * fallback-chain terminus, which the registry refinements guarantee.
 */
export const xDefaultLocale: LocaleCode = (() => {
  const locale = LOCALES.find((candidate) =>
    candidate.hreflangAliases.includes(X_DEFAULT),
  );
  if (locale === undefined) {
    throw new Error(`no locale declares the ${X_DEFAULT} hreflang alias`);
  }
  return locale.code as LocaleCode;
})();

/** The default locale: the same locale, named for the callers that mean "the source language". */
export const defaultLocale: LocaleCode = xDefaultLocale;

/**
 * Locales whose URLs exist today. Phase 0's go-live switch (spec 003 §12 / §13 Q8) — see the
 * module comment; pseudo-locales are never members (TASK-042).
 */
export const launchLocales: readonly LocaleCode[] = LOCALES.filter(
  (locale) => locale.isLaunch,
).map((locale) => locale.code as LocaleCode);

/** Spec 002 §5.1 `locale` columns, in declaration order. Pinned by a unit test (AC-4). */
export const LOCALE_ROW_COLUMNS = [
  "code",
  "bcp47",
  "name",
  "is_launch",
  "rtl",
  "fallback_code",
] as const;

export interface LocaleRow {
  code: string;
  bcp47: string;
  name: string;
  is_launch: boolean;
  rtl: boolean;
  fallback_code: string | null;
}

/**
 * Project a locale onto spec 002 §5.1's `locale` row. TASK-015's seed reads this rather than
 * restating the locale set, so the two cannot drift (AC-4). `dir` becomes the `rtl` boolean the
 * column stores.
 */
export function toLocaleRow(locale: LocaleConfig): LocaleRow {
  return {
    code: locale.code,
    bcp47: locale.bcp47,
    name: locale.name,
    is_launch: locale.isLaunch,
    rtl: locale.dir === "rtl",
    fallback_code: locale.fallbackCode,
  };
}
