/**
 * The committed catalogue copy, as a build-time corpus (spec 006 §2.2 `seed/data/copy/{locale}/`;
 * spec 008 §2 "Exists iff … an authored slug **and** an authored intro in that locale", §5.1,
 * §6; TASK-107).
 *
 * `slugs.ts` (TASK-105) needed three fields of these rows — key, slug and `translationStatus` —
 * and imported the twelve files for them. Spec 008's existence and indexability rules need two
 * more: the **name** a listing prints (`plan/02` §12: authored content, never machine-drafted
 * chrome) and the **intro** with its `reviewed` flag, which is the `reviewed` term of spec 007's
 * `indexability()` for a hub. Rather than import the corpus a second time, the corpus moved here
 * and both readers ask this file: two import lists over the same twelve files is the drift that
 * makes one reader see a row the other does not.
 *
 * Nothing is decided here. This module answers "what did the founder author for this entity in
 * this locale", and the rules that read the answer — does the page exist, may it be indexed, what
 * does the card say — live in `listing.ts` and in `src/modules/seo`.
 *
 * **Inheritance mirrors `slugs.ts`'s**, because a name and a URL must come from the same place: a
 * locale whose `fallbackCode` is the same language inherits (`en-gb` → `en`), a pseudo-locale
 * inherits (it is never shown to a buyer and its pages exist only for the visual and axe suites),
 * and `de`/`pl` inherit nothing — a German page showing an English category name is the
 * half-translated page `plan/02` §12 exists to prevent. Unlike a slug, a **machine-drafted row is
 * still a name**: an unreviewed `de` translation renders and is `noindex` (spec 008 §6, §7), while
 * an unreviewed slug is no URL at all.
 *
 * Typed through a narrow interface rather than parsed by zod at import time — the trade
 * `src/modules/ui/media/manifest.ts` and `slugs.ts` both document, and the same gate keeps it
 * honest: `tests/unit/catalog-slugs.test.ts` parses these twelve files against spec 006's
 * `SeedCopyRegistrySchema`.
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

import type { SlugKind } from "./types";

/**
 * The fields of a copy row the routing and listing surfaces read. The SEO pair and the review
 * trail belong to the page and to `seed:check`; naming them here would invite this file to answer
 * a question that is not about what a listing prints.
 */
export interface CopyRow {
  readonly key: string;
  readonly name: string;
  readonly slug: string;
  /** The authored prose: a hub's intro (spec 008 §2) and a card's description source. */
  readonly descriptionMd: string;
  /** `human` is the authored state; `machine` is an `pnpm i18n:draft` draft (`plan/03` §6). */
  readonly translationStatus: string;
  /** The content record's own sign-off (`plan/02` §12) — the `reviewed` term of `indexability()`. */
  readonly reviewed: boolean;
}

export interface CopyFile {
  readonly locale: string;
  readonly rows: readonly CopyRow[];
}

/** `product_translation.translation_status === 'human'`: a draft is not a URL (`slugs.ts`). */
export const AUTHORED_TRANSLATION_STATUS = "human";

/**
 * The twelve committed copy files by kind and locale. The cast is the "typed build-time import"
 * of spec 008 §5.2: TypeScript widens every JSON string, and re-narrowing here without a runtime
 * parse is what keeps zod out of the render path of every listing page.
 */
export const COPY_FILES: Readonly<Record<SlugKind, readonly CopyFile[]>> = {
  category: [categoriesEn, categoriesEnGb, categoriesDe, categoriesPl],
  occasion: [occasionsEn, occasionsEnGb, occasionsDe, occasionsPl],
  product: [productsEn, productsEnGb, productsDe, productsPl],
} as unknown as Readonly<Record<SlugKind, readonly CopyFile[]>>;

/** The primary language subtag of a locale code: `en-gb` → `en`, `ar-XB` → `ar`. */
function primaryLanguage(code: string): string {
  return (code.split("-")[0] ?? code).toLowerCase();
}

/**
 * The locale a locale inherits copy from, or `undefined`. Shared by the slug map and by this
 * corpus reader on purpose: a page whose name came from `en` and whose URL came from `de` would
 * be a page no rule in spec 008 describes.
 */
export function inheritsCopyFrom(
  kind: SlugKind,
  locale: LocaleCode,
): LocaleCode | undefined {
  if (kind === "product") {
    // A product slug and name are shared from the dataset's one authored locale (spec 009 §13
    // Q1), never inherited along the message fallback chain.
    return locale === CATALOGUE_LOCALE
      ? undefined
      : (CATALOGUE_LOCALE as LocaleCode);
  }
  const config = localeConfig(locale);
  const fallback = config.fallbackCode;
  if (fallback === null || !isLocaleCode(fallback)) return undefined;
  if (!config.isLaunch) return fallback;
  return primaryLanguage(fallback) === primaryLanguage(config.code)
    ? fallback
    : undefined;
}

/** The rows one locale authored itself, by key. Machine drafts included: a draft is still a name. */
function authoredRows(
  kind: SlugKind,
  locale: string,
): ReadonlyMap<string, CopyRow> {
  const rows = new Map<string, CopyRow>();
  for (const file of COPY_FILES[kind]) {
    if (file.locale !== locale) continue;
    for (const row of file.rows) rows.set(row.key, row);
  }
  return rows;
}

const indexes = new Map<string, ReadonlyMap<string, CopyRow>>();

/**
 * The effective (key → row) map for a locale: what it inherits, overlaid by what it authors.
 * Memoised, because the corpus is a build-time import and therefore immutable for the life of the
 * process — a derived index of immutable data is not a stale cache (`slugs.ts`).
 */
function copyIndex(
  kind: SlugKind,
  locale: LocaleCode,
  seen: readonly string[] = [],
): ReadonlyMap<string, CopyRow> {
  const cacheKey = `${kind}:${locale}`;
  const cached = indexes.get(cacheKey);
  if (cached !== undefined) return cached;

  const effective = new Map<string, CopyRow>();
  const inheritedFrom = inheritsCopyFrom(kind, locale);
  if (inheritedFrom !== undefined && !seen.includes(inheritedFrom)) {
    for (const [key, row] of copyIndex(kind, inheritedFrom, [
      ...seen,
      locale,
    ])) {
      effective.set(key, row);
    }
  }
  for (const [key, row] of authoredRows(kind, locale)) effective.set(key, row);

  indexes.set(cacheKey, effective);
  return effective;
}

/**
 * What this locale says about this entity, or `undefined` when neither it nor the locale it
 * inherits from has a row — which is one of spec 008 §2's existence conditions, not an error.
 */
export function copyRow(
  kind: SlugKind,
  key: string,
  locale: LocaleCode,
): CopyRow | undefined {
  return copyIndex(kind, locale).get(key);
}

/** Every entity of a kind this locale has copy for, in the corpus's own order. */
export function copyRows(
  kind: SlugKind,
  locale: LocaleCode,
): readonly CopyRow[] {
  return [...copyIndex(kind, locale).values()];
}
