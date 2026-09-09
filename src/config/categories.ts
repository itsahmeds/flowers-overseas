/**
 * Category-row registry (spec 004 §2 "Everything data-gated is config", §5.1; TASK-047).
 *
 * The ten entries of the founder-approved commerce header's category row, verbatim from
 * `docs/design/homepage-v1/homepage-desktop.dc.html`: Best sellers · Birthday · Sympathy ·
 * Occasions · Bouquets · Roses · Plants · Add-ons · Same-day delivery · Destinations. The mobile
 * artboard draws a scrollable subset of six, which is `showOnMobile` here rather than a second
 * list somebody keeps in sync.
 *
 * **Every row is `published: false` in Phase 0**, because no category, occasion or destinations
 * page exists: 004 knows nothing about products (§3). So `SiteHeader` (TASK-048) renders the row
 * as non-link text — the design's own rule for an unavailable target — and when 008 publishes the
 * pages the same row becomes navigation with no template edit (`plan/09`'s "a new country is
 * data", applied to the nav; spec 004 AC-14 forbids linking an unpublished target).
 *
 * `isCategoryPublished(id)` is the only consumer path for the flag (spec 004 §5.1: one predicate
 * per flag). `owningSpec` records who flips it: `005` the add-ons catalogue, `007` the
 * destinations hub, `008` the category and occasion pages, `009` the cutoff logic behind
 * same-day delivery.
 *
 * No database is read here and none may be (`pnpm check:no-db`, spec 004 AC-2), and no label is a
 * literal: `labelKey` points at `nav.category.*` in the catalogues.
 */
import { z } from "zod";

/** A dotted `nav.*` message key. */
const MessageKeySchema = z
  .string()
  .regex(
    /^nav\.[a-zA-Z0-9]+(?:\.[a-zA-Z0-9]+)*$/,
    "must be a dotted `nav.*` message key",
  );

/** The spec that publishes the page behind a category row entry. */
const OwningSpecSchema = z
  .string()
  .regex(/^0\d{2}$/, "must be a three-digit spec id such as `008`");

export const CategoryConfigSchema = z
  .object({
    id: z
      .string()
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        "must be a lowercase, hyphen-separated category id",
      ),
    labelKey: MessageKeySchema,
    /** Shorter label for the mobile row (`Same-day` where desktop says `Same-day delivery`). */
    shortLabelKey: MessageKeySchema.optional(),
    /** May the entry be rendered as a link? `false` → text (spec 004 AC-14). */
    published: z.boolean(),
    owningSpec: OwningSpecSchema,
    /** Present in the mobile artboard's scrollable row. */
    showOnMobile: z.boolean(),
    /**
     * The canvas prints exactly one entry in `--color-accent` (Same-day delivery). Emphasis is
     * data so the header template carries no per-label branch.
     */
    accent: z.boolean().default(false),
  })
  .strict();

/** A row as the schema parses it (`id` is any shape-valid id). */
export type ParsedCategoryConfig = z.infer<typeof CategoryConfigSchema>;

/**
 * A row as the application reads it: `id` narrowed to the configured set, so iterating
 * `CATEGORIES` and calling `isCategoryPublished(category.id)` needs no cast.
 */
export type CategoryConfig = Omit<ParsedCategoryConfig, "id"> & {
  id: CategoryId;
};

export const CategoryRegistrySchema = z
  .array(CategoryConfigSchema)
  .min(1)
  .superRefine((categories, ctx) => {
    const seen = new Set<string>();
    categories.forEach((category, index) => {
      if (seen.has(category.id)) {
        ctx.addIssue({
          code: "custom",
          path: [index, "id"],
          message: `duplicate category id \`${category.id}\``,
        });
      }
      seen.add(category.id);
    });
    const accented = categories.filter((category) => category.accent);
    if (accented.length > 1) {
      ctx.addIssue({
        code: "custom",
        path: ["accent"],
        message: `at most one category row entry may carry the accent colour, found ${String(accented.length)} (${accented.map((category) => category.id).join(", ")})`,
      });
    }
  });

/** The nav landmark's accessible name — the canvas's `<nav aria-label="Categories">`. */
export const CATEGORY_NAV_LABEL_KEY = "nav.categories.label";

/** The category row, in the canvas's order. */
const categories = [
  {
    id: "best-sellers",
    labelKey: "nav.category.bestSellers",
    published: false,
    owningSpec: "008",
    showOnMobile: true,
    accent: false,
  },
  {
    id: "birthday",
    labelKey: "nav.category.birthday",
    published: false,
    owningSpec: "008",
    showOnMobile: false,
    accent: false,
  },
  {
    id: "sympathy",
    labelKey: "nav.category.sympathy",
    published: false,
    owningSpec: "008",
    showOnMobile: false,
    accent: false,
  },
  {
    id: "occasions",
    labelKey: "nav.category.occasions",
    published: false,
    owningSpec: "008",
    showOnMobile: true,
    accent: false,
  },
  {
    id: "bouquets",
    labelKey: "nav.category.bouquets",
    published: false,
    owningSpec: "008",
    showOnMobile: true,
    accent: false,
  },
  {
    id: "roses",
    labelKey: "nav.category.roses",
    published: false,
    owningSpec: "008",
    showOnMobile: true,
    accent: false,
  },
  {
    id: "plants",
    labelKey: "nav.category.plants",
    published: false,
    owningSpec: "008",
    showOnMobile: true,
    accent: false,
  },
  {
    id: "add-ons",
    labelKey: "nav.category.addOns",
    published: false,
    owningSpec: "005",
    showOnMobile: false,
    accent: false,
  },
  {
    id: "same-day-delivery",
    labelKey: "nav.category.sameDayDelivery",
    shortLabelKey: "nav.category.sameDayShort",
    published: false,
    owningSpec: "009",
    showOnMobile: true,
    accent: true,
  },
  {
    id: "destinations",
    labelKey: "nav.category.destinations",
    published: false,
    owningSpec: "007",
    showOnMobile: false,
    accent: false,
  },
] as const;

/** Parsed at module load: a malformed registry throws on first import, never at request time. */
export const CATEGORIES = CategoryRegistrySchema.parse(
  categories,
) as readonly CategoryConfig[];

/** The closed set of category ids, as a literal union: an unknown id is a type error. */
export type CategoryId = (typeof categories)[number]["id"];

const byId = new Map<string, CategoryConfig>(
  CATEGORIES.map((category) => [category.id, category]),
);

/** Look a category up by id. Throws on an unknown id: the row is closed data. */
export function categoryConfig(id: CategoryId): CategoryConfig {
  const category = byId.get(id);
  if (category === undefined) {
    throw new Error(`unknown category id: ${id}`);
  }
  return category;
}

/** True when the string is one of the configured category ids (boundary parsing helper). */
export function isCategoryId(id: string): id is CategoryId {
  return byId.has(id);
}

/** **The** predicate over a category row entry's `published` flag (spec 004 §5.1). */
export function isCategoryPublished(id: CategoryId): boolean {
  return categoryConfig(id).published;
}

/** The mobile artboard's scrollable subset, in the same order. */
export const mobileCategories: readonly CategoryConfig[] = CATEGORIES.filter(
  (category) => category.showOnMobile,
);
