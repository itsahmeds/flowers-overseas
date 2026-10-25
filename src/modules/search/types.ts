/**
 * The search engine's input and its internal index shapes (spec 045 §5.2 "`SearchSource`";
 * TASK-401).
 *
 * `SearchSource` is the engine's only input: the static catalogue now, the database providers
 * after spec 012b's cutover, through the same catalogue read API either way (§2.9). Nothing the
 * source hands over reaches a browser as it is: the margin band lives only in `SearchProduct` and
 * the index, and `SearchResultViewSchema` has no field that could carry it (§2.5 "Never shown").
 */
import type { LocaleCode } from "@/config/locales";
import type { ProductCardView } from "@/modules/ui";

/** A label or name in one launch locale. */
export interface SearchLabel {
  readonly locale: LocaleCode;
  readonly text: string;
}

/** One product of a destination's listing set, in one request locale (§2.3 "What is searched"). */
export interface SearchProduct {
  readonly sku: string;
  /** The name the product page shows in the request locale. */
  readonly name: string;
  /** Flower types, colours, occasions, product type and categories, in the request locale. */
  readonly facetLabels: readonly string[];
  /** The same labels in the other launch languages: the alt field (§2.3). */
  readonly altLabels: readonly SearchLabel[];
  /** The description in the request locale. */
  readonly description: string;
  /** An approved primary photograph renders on the card (spec 043 §2 F). */
  readonly hasPhoto: boolean;
  /** Position in spec 005's curation order for this destination and locale (0 first). */
  readonly curationIndex: number;
  /** `availability()` calls it saleable in the destination. */
  readonly saleable: boolean;
}

/** An occasion or category page a query can link to from the Pages block (§2.3 "Pages"). */
export interface SearchHub {
  readonly kind: "occasion" | "category";
  readonly key: string;
  /** The label in the request locale: what the link reads and what the collator sorts. */
  readonly label: string;
  /** The label in every launch locale, the request locale included. */
  readonly labels: readonly SearchLabel[];
  /** The destination's country page when it exists, else the hub; only pages that answer 200. */
  readonly href: string;
}

/** A destination as search knows it, in one request locale. */
export interface SearchDestination {
  readonly iso2: string;
  /** Its names in every launch locale and its URL slugs: the words that name it (§2.4 item 1). */
  readonly words: readonly string[];
  /** Its shop root in the request locale, when the shop exists there. */
  readonly shopHref: string | undefined;
  /** Its corridor page in the request locale, when that exists (the link without a shop). */
  readonly corridorHref: string | undefined;
}

export interface SearchSource {
  /** The locales the index covers: the launch locales. */
  locales(): readonly LocaleCode[];
  destinations(locale: LocaleCode): Promise<readonly SearchDestination[]>;
  products(locale: LocaleCode, iso2: string): Promise<readonly SearchProduct[]>;
  hubs(locale: LocaleCode, iso2: string): Promise<readonly SearchHub[]>;
  /** Margin band 0 to 4 per SKU (§2.5); absent means 0. */
  rankBands(iso2: string): Promise<ReadonlyMap<string, number>>;
  /** Spec 008's cards for these SKUs in this order, with the destination's all-in price. */
  cards(
    locale: LocaleCode,
    iso2: string,
    skus: readonly string[],
  ): Promise<readonly ProductCardView[]>;
}

/* -------------------------------------------------------------------------- */
/* The index (built by `buildIndex`, read by `matchDocuments`).                */
/* -------------------------------------------------------------------------- */

/** One searchable field: its tokens and their stems in the field's language. */
export interface IndexedField {
  readonly language: string;
  readonly tokens: readonly string[];
  readonly tokenSet: ReadonlySet<string>;
  readonly stemSet: ReadonlySet<string>;
}

export interface IndexedDocument {
  readonly sku: string;
  /** The name's tokens joined: tier 5's whole-query comparison. */
  readonly nameKey: string;
  /** The normalised SKU (`fo bq 001`): tier 5's exact SKU match. */
  readonly skuKey: string;
  readonly name: IndexedField;
  readonly facets: IndexedField;
  /** One field per other launch language. */
  readonly alt: readonly IndexedField[];
  readonly description: IndexedField;
  readonly hasPhoto: boolean;
  readonly curationIndex: number;
  readonly saleable: boolean;
  readonly marginBand: number;
}

export interface IndexedHub {
  readonly hub: SearchHub;
  readonly fields: readonly IndexedField[];
}

/** One destination's documents in one locale. */
export interface DestinationIndex {
  readonly iso2: string;
  readonly documents: readonly IndexedDocument[];
  /** Every token and stem of every field, with the number of documents carrying it: typo targets. */
  readonly vocabulary: ReadonlyMap<string, number>;
  /**
   * Tokens of names and request-locale facet labels, with their document count and a display
   * form: "Did you mean"'s candidates (§14 A-orchestrator-2026-10-24 item 2).
   */
  readonly suggestions: ReadonlyMap<
    string,
    { readonly documents: number; readonly display: string }
  >;
  readonly hubs: readonly IndexedHub[];
}

export interface LocaleIndex {
  readonly locale: LocaleCode;
  readonly destinations: ReadonlyMap<string, SearchDestination>;
  /** Destinations with a shop in this locale, indexed. */
  readonly shops: ReadonlyMap<string, DestinationIndex>;
}

export interface SearchIndex {
  readonly locales: ReadonlyMap<LocaleCode, LocaleIndex>;
  /** Documents across every locale and destination (`/api/health`'s `searchIndexDocuments`). */
  readonly documents: number;
}
