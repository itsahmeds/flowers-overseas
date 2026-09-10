/**
 * Message catalogues and the per-route namespace subset (spec 003 §2 "Messages", §5.2, §6 "CWV
 * budget impact"; TASK-034).
 *
 * `MessageSource` is the second half of the no-database seam: today `repoMessageSource` answers
 * from `messages/*.json` and `messages/*.meta.json`, and spec 012's translation queue overlays a
 * database catalogue behind the same interface without touching a caller (AC-5). `meta()` is the
 * review half — `MessageMetaSchema` in `schemas.ts` names the same fields as spec 002 §5.1's
 * `message_catalog` review columns (AC-4), so 012 mirrors the manifest rather than translating
 * it.
 *
 * Two contracts worth stating:
 *
 *  - **Fallback-chain merge at load time.** `de` resolves as `en` overlaid with `de`, per the
 *    `fallbackCode` chain in `src/config/locales.ts`. A locale with no catalogue file at all is
 *    therefore a working (English, unreviewed) locale rather than a crash — which is what makes
 *    "a new locale is data" true (AC-31); `de` and `pl` ship echoed, unreviewed drafts from
 *    `pnpm i18n:draft` (§13 Q7, Q10), so the fallback is what a fifth locale relies on.
 *  - **Only the requested namespaces are returned.** `loadMessages()` never hands back the whole
 *    catalogue: a caller asks for the namespaces its route renders, which is what keeps a
 *    document's copy attributable and what spec 012 will serve per namespace from Postgres.
 *    Before TASK-085 the subset was also what reached the client provider and what the §6 / AC-27
 *    payload budget measured; there is no client provider any more (spec 004 §14 A1 addendum), so
 *    the payload is zero and `pnpm budget:client-js` measures that from the built chunks.
 *
 * Catalogues are **statically imported**, not read with `fs`: a computed `readFileSync` path is
 * invisible to Next's build tracing, so the file would be missing from a deployed bundle. Adding a
 * locale catalogue is one line in `CATALOGUES` plus one in `META`.
 *
 * **This module is server-side only, and that is a measured constraint rather than a preference**
 * (TASK-085). Those four static imports are 50 KB of JSON, and Turbopack tree-shakes a JSON
 * import only below a size threshold: one `"use client"` module reaching this file — directly or
 * through the `@/modules/i18n` barrel, which re-exports `loadMessages` — puts whole catalogues in
 * the initial script set of every page that mounts it. That is exactly what
 * `src/modules/i18n/error-document.ts` did with `messages/en.json` until TASK-085, at 4 751 B
 * Brotli on **every** document (spec 004 §14 A1 addendum). `import "server-only"` is not the guard
 * here: the package exists only inside Next's bundler, while this module is imported in plain Node
 * by `scripts/i18n-check.ts`, `scripts/i18n-draft.ts`, `scripts/client-js-budget.ts` and fourteen
 * unit tests, all of which it would break. `tests/unit/client-message-graph.test.ts` is the guard
 * instead, and it is the stronger one: it walks the import graph of every client entry point and
 * fails on this file, on the barrel, on `next-intl`'s client hooks **and** on a direct
 * `messages/*.json` import, which a `server-only` poison in this file could not see.
 */
import { generatePseudoCatalogues } from "./pseudo.ts";
import { getLocaleRegistry } from "./registry.ts";
import {
  type MessageMetaManifest,
  MessageMetaManifestSchema,
  MessagesSchema,
} from "./schemas.ts";

import de from "../../../messages/de.json" with { type: "json" };
import deMeta from "../../../messages/de.meta.json" with { type: "json" };
import enGb from "../../../messages/en-gb.json" with { type: "json" };
import enGbMeta from "../../../messages/en-gb.meta.json" with { type: "json" };
import en from "../../../messages/en.json" with { type: "json" };
import enMeta from "../../../messages/en.meta.json" with { type: "json" };
import pl from "../../../messages/pl.json" with { type: "json" };
import plMeta from "../../../messages/pl.meta.json" with { type: "json" };

/** The shape of the English source of truth; `global.d.ts` makes it next-intl's `Messages`. */
export type Messages = typeof en;

/** Top-level namespace of a catalogue (`meta`, `chooser`, `banner`, `errors`, `a11y`, `common`). */
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
  /**
   * The review manifest for exactly this locale, or `undefined` when it ships none — keyed by
   * the flattened message path, per `MessageMetaSchema` (spec 003 §2 "Messages", AC-4). This is
   * what `unreviewedShare`/`isLocaleIndexable` (TASK-039) read, and what spec 012 mirrors into
   * `message_catalog`; it is **not** merged along the fallback chain, because "how much of this
   * locale is reviewed" is a question about the locale's own file, not about English.
   */
  meta(locale: string): MessageMetaManifest | undefined;
}

/** Catalogue files shipped in `messages/`. A new locale catalogue is one line here (AC-31). */
const CATALOGUES: Readonly<Record<string, MessageCatalogue>> = {
  en,
  "en-gb": enGb,
  de,
  pl,
};

/**
 * Review manifests, one per catalogue file (`i18n:check` asserts the pairing, TASK-040). Held as
 * `unknown` and parsed on read: a JSON import is typed structurally (`source: string`), so the
 * schema is what turns it into a `MessageMetaManifest` — which is exactly the boundary
 * `plan/12` §2 asks for on a file a human may hand-edit.
 */
const META: Readonly<Record<string, unknown>> = {
  en: enMeta,
  "en-gb": enGbMeta,
  de: deMeta,
  pl: plMeta,
};

/**
 * The generated pseudo catalogues (spec 003 §2 "Pseudo-locales", AC-29; TASK-042), derived from
 * `en` by `pseudo.ts` and memoised on first use.
 *
 * They are **derived at runtime, not read from `messages/en-XA.json`**. Those files exist (written
 * by `pnpm i18n:pseudo`, git-ignored) so a human can read a diff and so `pnpm i18n:check` can pin
 * them, but the routes render this function's output, which has three consequences worth the
 * paragraph: a pseudo route cannot serve a stale catalogue, no generator has to run before
 * `next build` on a fresh clone or a preview deployment, and the static-import rule at the top of
 * this file is not bent for a file that is not in the repository.
 */
let pseudoCatalogues: Readonly<Record<string, MessageCatalogue>> | undefined;

/**
 * The generated catalogue for `en-XA` / `ar-XB`, or `undefined` for any other code. Exported from
 * the barrel because spec 004's template review is the caller that wants a pseudo string without
 * a running server; it carries no locale set and no provider (AC-3).
 */
export function pseudoCatalogue(locale: string): MessageCatalogue | undefined {
  pseudoCatalogues ??= generatePseudoCatalogues(en);
  return pseudoCatalogues[locale];
}

export const repoMessageSource: MessageSource = {
  catalogue: (locale) =>
    CATALOGUES[locale] ??
    // Gated by the registry rather than by a second env read: a pseudo-locale is in the registry
    // only when `ENABLE_PSEUDO_LOCALES` is on (`src/config/locales.ts`), so the flag is read in
    // exactly one place and an injected test registry moves the catalogues with it.
    (getLocaleRegistry().get(locale)?.isPseudo === true
      ? pseudoCatalogue(locale)
      : undefined),
  meta: (locale) => {
    const manifest = META[locale];
    return manifest === undefined
      ? undefined
      : MessageMetaManifestSchema.parse(manifest);
  },
};

/**
 * The review manifest for a locale, or `undefined` when it ships none. Module-internal like the
 * providers themselves: callers ask `unreviewedShare()`/`isLocaleIndexable()` (TASK-039).
 */
export function messageMeta(locale: string): MessageMetaManifest | undefined {
  return getMessageSource().meta(locale);
}

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
 * The namespaces a route kind's own document may resolve, and the **upper bound** on what a
 * catalogue payload for it could ever cost (`pnpm budget:client-js`, AC-27).
 *
 * It used to be more than that: `localeDocument` was the subset handed to
 * `NextIntlClientProvider` under `[locale]`, and `banner` was in it because the suggestion
 * island rendered its copy in the browser. TASK-085 removed the provider (spec 004 §13 Q13
 * option (b), §14 A1 addendum): the island and the 500 boundary take their strings as data, so
 * **no subset is serialised into any document for a client provider any more** — every locale
 * document is now what `/` always was. `banner` is therefore gone from this list, and the
 * measured payload is zero on every URL, which `scripts/client-js-budget.ts` asserts against the
 * built chunks rather than inferring from this table.
 *
 * The table stays because the seam is still real: `loadMessages()` takes the namespaces a route
 * needs, spec 012 serves them from Postgres behind `MessageSource`, and a route kind that one day
 * does need a client payload has a declared, budgeted subset instead of the whole catalogue.
 */
const ROUTE_NAMESPACES: Readonly<
  Record<RouteKind, readonly MessageNamespace[]>
> = {
  localeHome: ["meta", "a11y"],
  localeDocument: ["meta", "errors", "a11y", "common"],
  chooser: ["meta", "chooser", "a11y"],
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
  // `plan/12` §2 at the last possible moment: the subset returned here is what a document
  // renders, and it was assembled from repo JSON (and,
  // from spec 012, from database overrides through the same `MessageSource`). Validating the
  // merged result rather than each file catches a malformed override too, and `MessagesSchema`
  // rejects the two shapes that would fail silently at render time: a non-string leaf and an
  // empty string. ICU validity and key completeness stay `pnpm i18n:check`'s job (TASK-040).
  return MessagesSchema.parse(subset) as Pick<Messages, N>;
}
