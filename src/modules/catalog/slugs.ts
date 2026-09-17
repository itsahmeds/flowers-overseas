/**
 * Slugs: the two-way map between a catalogue key and the URL segment that stands for it in a
 * locale (spec 008 §5.1 amendment 1 to spec 005 §5.2, §2, AC-4, T-04; TASK-105).
 *
 * Spec 005 shipped the taxonomy and spec 006 shipped the copy that carries every slug, and
 * neither exposes a slug→key resolver: a route cannot be built without one, and
 * `generateStaticParams`, the sitemap builder, the link renderers and the 404 matrix must all get
 * the *same* answer about the same URL. That is this file, and nothing else is in it — no page
 * decision, no count, no threshold. Six rules shape it, each of them a spec rule rather than a
 * preference:
 *
 *  - **A slug is authored content, never a translation artefact** (`plan/02` §12; spec 003 §6;
 *    spec 008 §14 "Slugs and intros are content, not chrome"). A copy row whose
 *    `translationStatus` is `machine` therefore carries **no slug at all** as far as routing is
 *    concerned, and `hasSlug()` answers `false` for it. That is the whole mechanism behind spec
 *    008 §13 Q10's ruling: the founder authors the ~31 `de`/`pl` category and occasion slugs
 *    (TASK-106) and those pages come into existence as *data*, with no edit here and none under
 *    `src/app/`. Until then a German category page does not exist — the honest answer, and the
 *    one that keeps `/de/blumen/roses` from ever being served.
 *  - **A locale inherits a slug only when the inherited URL is not a foreign-language URL.**
 *    `en-gb` ships as "a thin override only where British wording differs" (spec 006 §2), so it
 *    inherits `en`'s slugs and overrides the handful it authors itself; `de` and `pl` inherit
 *    nothing, because `/de/blumen/roses` is exactly the half-translated page `plan/02` §12 exists
 *    to prevent. The test for "same language" is the primary subtag of the locale code against its
 *    `fallbackCode`'s. A **pseudo-locale** (`en-XA`, `ar-XB`) always inherits: it is never shown
 *    to a buyer, never indexable and already mirrors `en`'s `pathSegments`, and the visual and
 *    axe suites need its pages to exist (spec 008 AC-26).
 *  - **A product slug is shared, not translated** (spec 009 §13 Q1, resolved 2026-09-16): one
 *    authored ASCII slug per product, from the dataset's one authored locale, used by all four
 *    launch locales, with a per-locale override honoured the moment a translation authors one
 *    (`en-gb` already authors two). A bouquet name is a proper noun that must not be translated;
 *    a category name is a common noun that must be. Spec 009's TASK-121 adds the route plumbing
 *    on top of this and changes nothing here.
 *  - **`undefined` is the answer, not an exception.** `slugFor()` returns `undefined` for a key
 *    with no authored slug because "no slug" is a routine, load-bearing state (it is what makes a
 *    page not exist), not a programming error — unlike `countrySlug()`, whose registry guarantees
 *    one slug per launch locale and throws.
 *  - **Pure and synchronous** (spec 008 §5.2's contract for the existence seam): the copy files
 *    are a build-time `import`, exactly as `src/modules/ui/media/manifest.ts` imports the media
 *    manifest, so resolving a slug costs zero queries, zero fetches and no `fs` call, and
 *    `pnpm check:no-db` stays green over the module. The JSON is typed through the narrow
 *    interface below rather than parsed by zod at import time — the same trade the media manifest
 *    documents — and `tests/unit/catalog-slugs.test.ts` parses those same twelve files against
 *    spec 006's `SeedCopyRegistrySchema`, which is the gate that keeps the typing honest.
 *  - **Zod at the call boundary, not in the data path.** The three arguments a caller passes are
 *    parsed (`SlugKindSchema`, `LocaleCodeSchema`, the key and the slug), because a route handler
 *    is where an unvalidated string arrives.
 *
 * Two duplicate-slug rules live elsewhere on purpose: a slug colliding with another slug in the
 * *same* namespace is refused here (it would make one URL mean two things); a slug colliding
 * across namespaces, with a `PATH_SEGMENT_KEYS` value or with a country slug is `seed:check`'s
 * (spec 008 AC-2, TASK-106) and the collision matrix of `tests/unit/catalog-slugs.test.ts`
 * (AC-4).
 */
import categoriesDe from "../../../seed/data/copy/de/categories.json" with { type: "json" };
import occasionsDe from "../../../seed/data/copy/de/occasions.json" with { type: "json" };
import productsDe from "../../../seed/data/copy/de/products.json" with { type: "json" };
import categoriesEnGb from "../../../seed/data/copy/en-gb/categories.json" with { type: "json" };
import occasionsEnGb from "../../../seed/data/copy/en-gb/occasions.json" with { type: "json" };
import productsEnGb from "../../../seed/data/copy/en-gb/products.json" with { type: "json" };
import categoriesEn from "../../../seed/data/copy/en/categories.json" with { type: "json" };
import occasionsEn from "../../../seed/data/copy/en/occasions.json" with { type: "json" };
import productsEn from "../../../seed/data/copy/en/products.json" with { type: "json" };
import categoriesPl from "../../../seed/data/copy/pl/categories.json" with { type: "json" };
import occasionsPl from "../../../seed/data/copy/pl/occasions.json" with { type: "json" };
import productsPl from "../../../seed/data/copy/pl/products.json" with { type: "json" };

import { CATALOGUE_LOCALE } from "@/config/catalogue/schemas";
import { type LocaleCode, isLocaleCode, localeConfig } from "@/config/locales";

import {
  CatalogueSlugSchema,
  EntityKeySchema,
  LocaleCodeSchema,
  SlugKindSchema,
} from "./schemas";
import type { SlugKind } from "./types";

/* -------------------------------------------------------------------------- */
/* The copy corpus as a build-time import (spec 006 `copy/{locale}/*.json`).   */
/* -------------------------------------------------------------------------- */

/**
 * The four fields of a copy row that routing reads. Everything else the row carries — the name,
 * the description, the SEO pair, the review trail — belongs to the page and to `seed:check`, and
 * naming it here would invite this file to answer a question that is not about a URL.
 */
interface CopySlugRow {
  readonly key: string;
  readonly slug: string;
  readonly translationStatus: string;
}

interface CopySlugFile {
  readonly locale: string;
  readonly rows: readonly CopySlugRow[];
}

/**
 * `product_translation.translation_status === 'human'` is the authored state: "a reviewer flips
 * `translationStatus` to `human`" (`seed/schema/copy.ts`, `plan/03` §6 gate 4). A `machine` row is
 * a draft, and a draft is not a URL.
 */
const AUTHORED_TRANSLATION_STATUS = "human";

/**
 * The twelve committed copy files, keyed by kind and locale. The casts are the "typed build-time
 * import" of spec 008 §5.2 and of `src/modules/ui/media/manifest.ts`: TypeScript widens every
 * JSON string, and re-narrowing here without a runtime parse is what keeps zod out of the render
 * path of every listing page.
 */
const COPY_FILES: Readonly<Record<SlugKind, readonly CopySlugFile[]>> = {
  category: [categoriesEn, categoriesEnGb, categoriesDe, categoriesPl],
  occasion: [occasionsEn, occasionsEnGb, occasionsDe, occasionsPl],
  product: [productsEn, productsEnGb, productsDe, productsPl],
} as unknown as Readonly<Record<SlugKind, readonly CopySlugFile[]>>;

/** The authored (key → slug) rows of one kind in one locale, machine drafts excluded. */
function authoredRows(
  kind: SlugKind,
  locale: string,
): ReadonlyMap<string, string> {
  const authored = new Map<string, string>();
  for (const file of COPY_FILES[kind]) {
    if (file.locale !== locale) continue;
    for (const row of file.rows) {
      if (row.translationStatus !== AUTHORED_TRANSLATION_STATUS) continue;
      authored.set(row.key, row.slug);
    }
  }
  return authored;
}

/* -------------------------------------------------------------------------- */
/* Inheritance (spec 006 §2's `en-gb` override layer; spec 009 §13 Q1).       */
/* -------------------------------------------------------------------------- */

/** The primary language subtag of a locale code: `en-gb` → `en`, `ar-XB` → `ar`. */
function primaryLanguage(code: string): string {
  return (code.split("-")[0] ?? code).toLowerCase();
}

/**
 * The locale a locale inherits its category and occasion slugs from, or `undefined` when it
 * inherits none. Two cases inherit and everything else does not:
 *
 *  - a locale whose `fallbackCode` is in the **same language** (`en-gb` → `en`), which is spec
 *    006 §2's "`en-gb` ships as a thin override only where British wording differs";
 *  - a **non-launch** locale — the pseudo-locales, which have no buyer, no crawler and no
 *    authored copy of their own, and whose `pathSegments` already mirror `en`.
 *
 * `de` and `pl` fall through both and therefore have exactly the slugs their own copy authors.
 */
function inheritsSlugsFrom(locale: LocaleCode): LocaleCode | undefined {
  const config = localeConfig(locale);
  const fallback = config.fallbackCode;
  if (fallback === null || !isLocaleCode(fallback)) return undefined;
  if (!config.isLaunch) return fallback;
  return primaryLanguage(fallback) === primaryLanguage(config.code)
    ? fallback
    : undefined;
}

/* -------------------------------------------------------------------------- */
/* The index.                                                                 */
/* -------------------------------------------------------------------------- */

interface SlugIndex {
  readonly byKey: ReadonlyMap<string, string>;
  readonly bySlug: ReadonlyMap<string, string>;
}

/**
 * Memoised per (kind, locale). The corpus is a build-time import and therefore immutable for the
 * life of the process — unlike the prices `read.ts` deliberately refuses to memoise, which an
 * admin edit must be able to change. A derived index of immutable data is not a stale cache.
 */
const indexes = new Map<string, SlugIndex>();

/** The effective (key → slug) map: what this locale inherits, overlaid by what it authors. */
function effectiveKeyMap(
  kind: SlugKind,
  locale: LocaleCode,
  seen: readonly string[] = [],
): ReadonlyMap<string, string> {
  const inheritedFrom =
    kind === "product"
      ? // A product slug is shared by every locale from the dataset's one authored locale
        // (spec 009 §13 Q1), never inherited along the message fallback chain.
        locale === CATALOGUE_LOCALE
        ? undefined
        : (CATALOGUE_LOCALE as LocaleCode)
      : inheritsSlugsFrom(locale);

  const effective = new Map<string, string>();
  if (inheritedFrom !== undefined && !seen.includes(inheritedFrom)) {
    for (const [key, slug] of effectiveKeyMap(kind, inheritedFrom, [
      ...seen,
      locale,
    ])) {
      effective.set(key, slug);
    }
  }
  for (const [key, slug] of authoredRows(kind, locale)) {
    effective.set(key, slug);
  }
  return effective;
}

function slugIndex(kind: SlugKind, locale: LocaleCode): SlugIndex {
  const cacheKey = `${kind}:${locale}`;
  const cached = indexes.get(cacheKey);
  if (cached !== undefined) return cached;

  const byKey = effectiveKeyMap(kind, locale);
  const bySlug = new Map<string, string>();
  for (const [key, slug] of byKey) {
    const owner = bySlug.get(slug);
    if (owner !== undefined) {
      throw new Error(
        `slug \`${slug}\` is claimed by both \`${owner}\` and \`${key}\` (${kind}, ${locale}): one URL cannot mean two things (plan/02 §4)`,
      );
    }
    bySlug.set(slug, key);
  }

  const index: SlugIndex = { byKey, bySlug };
  indexes.set(cacheKey, index);
  return index;
}

/* -------------------------------------------------------------------------- */
/* The three functions (spec 008 §5.1 amendment 1).                           */
/* -------------------------------------------------------------------------- */

/**
 * The URL segment that stands for a catalogue key in a locale, or `undefined` when the locale has
 * no authored slug for it — which is spec 008 §2's existence rule, not an error.
 */
export function slugFor(
  kind: SlugKind,
  key: string,
  locale: LocaleCode,
): string | undefined {
  const parsedKind = SlugKindSchema.parse(kind);
  const parsedKey = EntityKeySchema.parse(key);
  const parsedLocale = LocaleCodeSchema.parse(locale);
  return slugIndex(parsedKind, parsedLocale).byKey.get(parsedKey);
}

/**
 * The catalogue key a URL segment stands for in a locale, or `undefined` when that locale has no
 * page under it — the `notFound()` condition of spec 008 AC-1. Matched exactly: an uppercase or
 * otherwise non-canonical variant resolves to nothing rather than being case-folded into a
 * duplicate URL (spec 003 §6 "Canonical", ADR-0006: never a redirect, never a rewrite).
 */
export function resolveSlug(
  locale: LocaleCode,
  kind: SlugKind,
  slug: string,
): string | undefined {
  const parsedLocale = LocaleCodeSchema.parse(locale);
  const parsedKind = SlugKindSchema.parse(kind);
  const parsed = CatalogueSlugSchema.safeParse(slug);
  if (!parsed.success) return undefined;
  return slugIndex(parsedKind, parsedLocale).bySlug.get(parsed.data);
}

/**
 * Whether this entity has a URL in this locale at all. The one predicate spec 008 §2's six
 * existence rules read ("**and** an authored slug"), so the route, the sitemap row, the hreflang
 * alternate and the link renderer cannot disagree about whether a page exists.
 */
export function hasSlug(
  kind: SlugKind,
  key: string,
  locale: LocaleCode,
): boolean {
  return slugFor(kind, key, locale) !== undefined;
}
