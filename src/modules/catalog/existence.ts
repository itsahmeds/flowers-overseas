/**
 * Existence now, and what a publish would change (spec 012b §2.3, §5.2 "`existence.ts`", AC-5,
 * AC-6; TASK-295).
 *
 *  - `existsNow(path)`: the database says so AND the running manifest has it. The structural
 *    predicates (`productPageExists`, `listingExists`, `corridorPageExists`) already compose the
 *    manifest (`@/lib/existence`'s `manifestAdmits`), and the resolver asks them, so this is the
 *    resolver's answer with the manifest asked once more for the pages no predicate covers.
 *  - `databaseUrlSet()`: the structural URLs the database says exist now, with the manifest half
 *    off: the URL set the next build would emit for the product, listing and corridor families.
 *  - `existenceDiff(manifest)`: per locale, the URLs the database would add and remove against the
 *    running manifest, and the hash the next build will report. Only the structural families move
 *    between two builds of one commit (the info pages, the hubs, the homes are code), so the next
 *    set is the running one minus the removed plus the added.
 */
import {
  type ExistenceManifest,
  databaseOnly,
  existenceHashOf,
  manifestAdmits,
} from "@/lib/existence";
import { listCorridorPages } from "@/modules/geo";
import { localePath, parseLocaleFromPath } from "@/modules/i18n";

import { listingPages } from "./listing";
import { listProductPages } from "./product";
import { resolveLocalePath } from "./routes";

/** Whether `path` is a page now: the resolver's answer AND the running manifest. */
export async function existsNow(path: string): Promise<boolean> {
  if (!manifestAdmits(path)) return false;
  const { locale, rest } = parseLocaleFromPath(path);
  if (locale === undefined) return false;
  const segments = rest.split("/").filter(Boolean);
  if (segments.length === 0) return true;
  return (await resolveLocalePath(locale, segments)).kind !== "notFound";
}

/** The structural URLs the database says exist now, manifest aside. */
export async function databaseUrlSet(): Promise<ReadonlySet<string>> {
  return databaseOnly(async () => {
    const urls = new Set<string>();
    for (const page of await listProductPages()) urls.add(page.path);
    for (const page of await listingPages()) urls.add(page.path);
    for (const page of listCorridorPages()) {
      urls.add(localePath(page.locale, "destinations", page.slug));
    }
    return urls;
  });
}

/**
 * Whether `path` is of a structural family (a product page, a listing, a corridor page): the
 * pages whose existence is data. Read from the locale's own segments, as the resolver reads them.
 */
export function isStructuralPath(path: string): boolean {
  const { locale, rest } = parseLocaleFromPath(path);
  if (locale === undefined) return false;
  const segments = rest.split("/").filter(Boolean);
  const own = (
    pageType: "destinations" | "shopCategory" | "occasions" | "product",
  ) => localePath(locale, pageType).split("/").filter(Boolean).at(-1);
  if (segments.length === 2 && segments[0] === own("destinations")) return true;
  if (
    segments.some(
      (segment) =>
        segment === own("shopCategory") || segment === own("occasions"),
    )
  ) {
    return true;
  }
  return segments.length === 3 && segments[1] === own("product");
}

/** One locale's half of the diff. */
export interface LocaleDiff {
  readonly locale: string;
  readonly added: readonly string[];
  readonly removed: readonly string[];
}

/** What a publish would change (AC-6). */
export interface ExistenceDiff {
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly byLocale: readonly LocaleDiff[];
  /** The `existenceHash` the next build will report. */
  readonly expectedHash: string;
}

/** The diff of `next` (the database's structural set) against `manifest`. Pure. */
export function diffAgainst(
  manifest: Pick<ExistenceManifest, "urls">,
  next: ReadonlySet<string>,
): ExistenceDiff {
  const running = new Set(manifest.urls);
  const added = [...next].filter((url) => !running.has(url)).sort();
  const removed = manifest.urls
    .filter((url) => isStructuralPath(url) && !next.has(url))
    .sort();
  const removedSet = new Set(removed);
  const after = [
    ...manifest.urls.filter((url) => !removedSet.has(url)),
    ...added,
  ];
  const locales = [
    ...new Set(
      [...added, ...removed]
        .map((url) => parseLocaleFromPath(url).locale)
        .filter((locale): locale is string => locale !== undefined),
    ),
  ].sort();
  return {
    added,
    removed,
    byLocale: locales.map((locale) => ({
      locale,
      added: added.filter((url) => parseLocaleFromPath(url).locale === locale),
      removed: removed.filter(
        (url) => parseLocaleFromPath(url).locale === locale,
      ),
    })),
    expectedHash: existenceHashOf(after),
  };
}

/** The diff of the database now against the running manifest. */
export async function existenceDiff(
  manifest: Pick<ExistenceManifest, "urls">,
): Promise<ExistenceDiff> {
  return diffAgainst(manifest, await databaseUrlSet());
}
