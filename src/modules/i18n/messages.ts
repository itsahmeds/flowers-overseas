/**
 * Message catalogues and the per-route namespace subset (spec 003 §2 "Messages", §5.2, §6 "CWV
 * budget impact"; TASK-034).
 *
 * `MessageSource` is the second half of the no-database seam: today `repoMessageSource` answers
 * from `messages/*.json`, and spec 012's translation queue overlays a database catalogue behind
 * the same interface without touching a caller (AC-5). Its `meta()` half — the
 * `messages/*.meta.json` review manifests and `MessageMetaSchema` — is owned by TASK-038, which
 * adds it here next to `catalogue()`.
 *
 * Two contracts worth stating:
 *
 *  - **Fallback-chain merge at load time.** `de` resolves as `en` overlaid with `de`, per the
 *    `fallbackCode` chain in `src/config/locales.ts`. A locale with no catalogue file at all is
 *    therefore a working (English, unreviewed) locale rather than a crash — which is what makes
 *    "a new locale is data" true (AC-31) and what keeps `de`/`pl` renderable before TASK-038
 *    writes their drafts.
 *  - **Only the requested namespaces are returned.** `loadMessages()` never hands back the whole
 *    catalogue: the subset it returns is what reaches the client provider, so the serialised
 *    payload stays inside the §6 / AC-27 budget as the catalogue grows.
 *
 * Catalogues are **statically imported**, not read with `fs`: a computed `readFileSync` path is
 * invisible to Next's build tracing, so the file would be missing from a deployed bundle. Adding a
 * locale catalogue is one line in `CATALOGUES` (TASK-038 adds `en-gb`, `de`, `pl`).
 */
import { getLocaleRegistry } from "./registry.ts";

import en from "../../../messages/en.json" with { type: "json" };

/** The shape of the English source of truth; `global.d.ts` makes it next-intl's `Messages`. */
export type Messages = typeof en;

/** Top-level namespace of a catalogue (`meta`, `errors`, `a11y`, `common` in Phase 0). */
export type MessageNamespace = keyof Messages;

export const MESSAGE_NAMESPACES = Object.keys(
  en,
) as readonly MessageNamespace[];

/** A namespaced, ICU-valued catalogue as it is authored on disk. */
export type MessageCatalogue = Readonly<Record<string, unknown>>;

/**
 * Where catalogues come from. One method today (see the header); every implementation is
 * synchronous and pure so `generateStaticParams`/`generateMetadata` can call it during the build.
 */
export interface MessageSource {
  /** The authored catalogue for exactly this locale, or `undefined` when it ships none. */
  catalogue(locale: string): MessageCatalogue | undefined;
}

/** Catalogue files shipped in `messages/`. TASK-038 adds `en-gb`, `de` and `pl`. */
const CATALOGUES: Readonly<Record<string, MessageCatalogue>> = { en };

export const repoMessageSource: MessageSource = {
  catalogue: (locale) => CATALOGUES[locale],
};

let source: MessageSource = repoMessageSource;

/** Module-internal, like `withLocaleRegistry`: not exported from `index.ts` (AC-3). */
export function getMessageSource(): MessageSource {
  return source;
}

export async function withMessageSource<T>(
  provider: MessageSource,
  body: () => T | Promise<T>,
): Promise<T> {
  const previous = source;
  source = provider;
  try {
    return await body();
  } finally {
    source = previous;
  }
}

/**
 * `[locale, …fallbacks]`, nearest first, following `fallbackCode` until it ends. Unknown codes
 * resolve to the empty chain, so an unknown locale gets the default locale's catalogue via
 * `resolveCatalogue`'s tail.
 */
export function fallbackChain(locale: string): readonly string[] {
  const registry = getLocaleRegistry();
  const chain: string[] = [];
  let current = registry.get(locale);
  while (current !== undefined && !chain.includes(current.code)) {
    chain.push(current.code);
    current =
      current.fallbackCode === null
        ? undefined
        : registry.get(current.fallbackCode);
  }
  return chain;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Overlay `overrides` onto `base`, key by key, at any depth (the `en-gb` thin-override rule). */
function mergeDeep(
  base: Record<string, unknown>,
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    const existing = out[key];
    out[key] =
      isRecord(existing) && isRecord(value)
        ? mergeDeep(existing, value)
        : value;
  }
  return out;
}

/**
 * The merged catalogue for a locale: the fallback chain applied furthest-first, so the nearest
 * locale wins. Missing catalogues contribute nothing rather than failing.
 */
export function resolveCatalogue(locale: string): Record<string, unknown> {
  const messageSource = getMessageSource();
  const chain = fallbackChain(locale);
  let merged: Record<string, unknown> = {};
  for (const code of [...chain].reverse()) {
    const catalogue = messageSource.catalogue(code);
    if (catalogue !== undefined) {
      merged = mergeDeep(merged, catalogue as Record<string, unknown>);
    }
  }
  return merged;
}

/** Route kinds that need a different namespace subset (§6 "CWV budget impact"). */
export const ROUTE_KINDS = ["localeHome", "localeDocument", "chooser"] as const;
export type RouteKind = (typeof ROUTE_KINDS)[number];

/**
 * The namespaces a route kind may use. `localeDocument` is the set handed to the client provider
 * under `[locale]` (the error boundary needs `errors`); `chooser` is the `/` document, which gets
 * `meta` only and no client provider at all (AC-27's "`/` ships zero application JS").
 */
const ROUTE_NAMESPACES: Readonly<
  Record<RouteKind, readonly MessageNamespace[]>
> = {
  localeHome: ["meta", "a11y"],
  localeDocument: ["meta", "errors", "a11y", "common"],
  chooser: ["meta"],
};

export function namespacesFor(
  routeKind: RouteKind,
): readonly MessageNamespace[] {
  return ROUTE_NAMESPACES[routeKind];
}

/**
 * The merged catalogue restricted to `namespaces`. A namespace absent from every catalogue in the
 * chain is omitted rather than faked, so a missing key surfaces as next-intl's fallback and
 * `i18n:check` (TASK-040) is what fails the build.
 */
export function loadMessages<N extends MessageNamespace>(
  locale: string,
  namespaces: readonly N[],
): Pick<Messages, N> {
  const catalogue = resolveCatalogue(locale);
  const subset: Record<string, unknown> = {};
  for (const namespace of namespaces) {
    const value = catalogue[namespace];
    if (value !== undefined) subset[namespace] = value;
  }
  return subset as Pick<Messages, N>;
}
