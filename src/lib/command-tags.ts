/**
 * The cache tags each admin command dirties (spec 012b §5.4's table, AC-9; TASK-296).
 *
 * "The command, not the page, knows what it dirtied": every admin catalogue, price, photo, review
 * and country command returns `{ result, tags }`, its tags built here from its row of the table,
 * and `applyCommand()` calls `invalidate()` **once** with exactly them (none when the command
 * changed the URL set: that waits for a publish). `tests/unit/command-tags.test.ts` is the one
 * table-driven test of the §5.4 table; TASK-297 to TASK-300 each add their commands' rows to it.
 *
 * The tag names are spelled by their one builder each: spec 005's `cacheTagsFor()` for
 * `product:` / `catalog:` / `country:`, `./cache.ts` for `corridor:`, `hub:`, `home:` and
 * `sitemap`.
 */
import { z } from "zod";

import { CacheEntitySchema, cacheTagsFor } from "@/modules/catalog";
import { routableLocaleCodes } from "@/modules/i18n";

import {
  SITEMAP_CACHE_TAG,
  corridorCacheTag,
  homeCacheTag,
  hubCacheTag,
} from "./cache";

const Sku = z.string().regex(/^FO-[A-Z]{2}-\d{3}$/u);
const Iso2 = z.string().regex(/^[A-Z]{2}$/u);

/** One row of §5.4 per variant, named after the command, not the row it writes. */
export const AdminCommandSchema = z.discriminatedUnion("kind", [
  /** A price change (supersede, or a draft price replaced). */
  z.strictObject({ kind: z.literal("price"), sku: Sku, iso2: Iso2 }),
  /** A copy, size or photo change of an existing product, or a review decision on its copy or photos. */
  z.strictObject({
    kind: z.enum(["copy", "size", "photo", "review"]),
    sku: Sku,
    /** Every destination the product is priced in. */
    pricedIn: z.array(Iso2),
  }),
  /** Country operations or corridor flags (slice B), or the go-live fiscal fields (slice A). */
  z.strictObject({ kind: z.literal("countryFacts"), iso2: Iso2 }),
  /** A country status flip. */
  z.strictObject({ kind: z.literal("countryStatus"), iso2: Iso2 }),
  /** A new product, a removal from a country, a retirement: the URL set changes, so none until publish. */
  z.strictObject({ kind: z.literal("structural") }),
  /** A publish run verified. */
  z.strictObject({ kind: z.literal("publishVerified") }),
  /** A florist status, mapping or coverage change: the offers it made saleable or unsaleable. */
  z.strictObject({
    kind: z.literal("saleability"),
    changed: z.array(z.strictObject({ sku: Sku, iso2: Iso2 })),
  }),
]);
export type AdminCommand = z.infer<typeof AdminCommandSchema>;

function tagsOf(entity: unknown): readonly string[] {
  return cacheTagsFor(CacheEntitySchema.parse(entity));
}

/** The §5.4 tag set of one command: de-duplicated and sorted. */
export function commandTags(command: AdminCommand): readonly string[] {
  const parsed = AdminCommandSchema.parse(command);
  const tags = ((): readonly string[] => {
    switch (parsed.kind) {
      case "price":
        return tagsOf({
          kind: "price",
          productId: parsed.sku,
          countryIso: parsed.iso2,
        });
      case "copy":
      case "size":
      case "photo":
      case "review":
        return [
          ...tagsOf({ kind: "product", productId: parsed.sku }),
          ...parsed.pricedIn.flatMap((iso2) =>
            tagsOf({ kind: "catalog", countryIso: iso2 }),
          ),
          SITEMAP_CACHE_TAG,
        ];
      case "countryFacts":
        // `cacheTagsFor` of a country is `catalog:{iso2}` and `country:{iso2}`.
        return [
          ...tagsOf({ kind: "country", countryIso: parsed.iso2 }),
          corridorCacheTag(parsed.iso2),
        ];
      case "countryStatus":
        return [
          ...tagsOf({ kind: "country", countryIso: parsed.iso2 }),
          corridorCacheTag(parsed.iso2),
          ...routableLocaleCodes().flatMap((locale) => [
            hubCacheTag(locale),
            homeCacheTag(locale),
          ]),
          SITEMAP_CACHE_TAG,
        ];
      case "structural":
        return [];
      case "publishVerified":
        return [SITEMAP_CACHE_TAG];
      case "saleability":
        return parsed.changed.flatMap((offer) =>
          tagsOf({
            kind: "price",
            productId: offer.sku,
            countryIso: offer.iso2,
          }),
        );
    }
  })();
  return [...new Set(tags)].sort();
}

/** The union of several commands' tag sets: a deployment's boot (F1), a bulk import's apply. */
export function unionTags(
  commands: readonly AdminCommand[],
): readonly string[] {
  return [...new Set(commands.flatMap(commandTags))].sort();
}

/** What every admin command returns (spec 012b §5.2). */
export interface CommandOutcome<T> {
  readonly result: T;
  readonly tags: readonly string[];
}

/** `{ result, tags }` for `command`. */
export function commandOutcome<T>(
  result: T,
  command: AdminCommand,
): CommandOutcome<T> {
  return { result, tags: commandTags(command) };
}

/**
 * Make a saved command visible: `invalidate()` once with exactly its tags, and not at all when it
 * has none. Called after the command's transaction committed.
 */
export async function applyCommand<T>(
  outcome: CommandOutcome<T>,
  invalidate: (tags: readonly string[]) => Promise<unknown>,
): Promise<T> {
  if (outcome.tags.length > 0) await invalidate(outcome.tags);
  return outcome.result;
}
