/**
 * Locale registry provider (spec 003 §2 "the no-database seam", §5.2, AC-3, AC-5; TASK-034).
 *
 * One interface, one Phase 0 implementation, one accessor:
 *
 *  - `LocaleRegistryProvider` is what the rest of the i18n module asks for a locale.
 *  - `staticLocaleRegistry` answers from `src/config/locales.ts` — no database, no I/O, no async
 *    (`pnpm check:no-db`, AC-2).
 *  - `getLocaleRegistry()` is the composition root. It is the *only* thing outside this file that
 *    names a provider, which is what makes spec 002's `dbLocaleRegistry` and spec 012's admin
 *    overlay a change to this file and nothing else (AC-5, §12).
 *
 * `withLocaleRegistry()` is the injection hook the AC-5 seam test uses. It is deliberately **not
 * exported from `index.ts`** (AC-3 pins the barrel's export list): a caller that could swap the
 * registry at runtime would turn the seam into global mutable configuration, which is exactly what
 * AC-3's "no config object with a setter" forbids. Tests reach it through the module path, so the
 * fake registry of AC-5 lives inside `src/modules/i18n/` and changes no file outside it.
 */
import {
  type LocaleCode,
  type LocaleConfig,
  LOCALES,
  defaultLocale,
  xDefaultLocale,
} from "../../config/locales.ts";

/**
 * The locale set as the application sees it. `list()` is ordered as the source orders it (config
 * declaration order in Phase 0, `ORDER BY` in spec 002) and `get()` answers `undefined` for an
 * unknown code rather than throwing, because unknown codes arrive from URLs (AC-8) and a 404 is
 * the answer, not an exception.
 */
export interface LocaleRegistryProvider {
  list(): readonly LocaleConfig[];
  get(code: string): LocaleConfig | undefined;
}

function indexOf(
  locales: readonly LocaleConfig[],
): ReadonlyMap<string, LocaleConfig> {
  return new Map(locales.map((locale) => [locale.code, locale]));
}

/** The Phase 0 provider: `src/config/locales.ts`, already zod-parsed at its module load (AC-1). */
export const staticLocaleRegistry: LocaleRegistryProvider = (() => {
  const byCode = indexOf(LOCALES);
  return {
    list: () => LOCALES,
    get: (code) => byCode.get(code),
  };
})();

let active: LocaleRegistryProvider = staticLocaleRegistry;

/** The provider every function in this module reads. Callers outside never see the object. */
export function getLocaleRegistry(): LocaleRegistryProvider {
  return active;
}

/**
 * Run `body` with `provider` in place of the active registry, then restore. Module-internal (see
 * the header): imported by `src/modules/i18n/**` and by the AC-5 seam test only.
 */
export async function withLocaleRegistry<T>(
  provider: LocaleRegistryProvider,
  body: () => T | Promise<T>,
): Promise<T> {
  const previous = active;
  active = provider;
  try {
    return await body();
  } finally {
    active = previous;
  }
}

/** Build a provider from an arbitrary locale set — the shape the AC-5 fake and spec 002 share. */
export function localeRegistryOf(
  locales: readonly LocaleConfig[],
): LocaleRegistryProvider {
  const byCode = indexOf(locales);
  return {
    list: () => locales,
    get: (code) => byCode.get(code),
  };
}

/**
 * The locale a non-localised document (the chooser, an unknown-locale 404) declares: the
 * `x-default` locale, resolved through the registry so a hydrated registry moves it too (AC-8).
 */
export function documentFallbackLocale(): LocaleConfig {
  const registry = getLocaleRegistry();
  const locale = registry.get(xDefaultLocale) ?? registry.get(defaultLocale);
  if (locale === undefined) {
    const first = registry.list()[0];
    if (first === undefined) throw new Error("locale registry is empty");
    return first;
  }
  return locale;
}

export type { LocaleCode, LocaleConfig };
