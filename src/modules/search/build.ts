/**
 * `buildIndex`: the in-process search index, built from a `SearchSource` (spec 045 §2.3, §2.9,
 * §5.2; TASK-401).
 *
 * One document per (product, locale) for every product a destination's shop lists, in every
 * launch locale, with the fields §2.3 names: the name and the facet labels in the request locale,
 * the same labels in the other launch languages (the alt field, so "róże" typed on `/en` still
 * finds roses), the description, and the SKU for exact matches. Each field keeps its tokens and
 * their stems in its own language, so a Polish label is stemmed as Polish whichever page it is
 * searched from. The margin bands load with the index (§2.9) and stay inside it.
 *
 * The source is asked once per (locale, destination); everything after that is pure.
 */
import type { LocaleCode } from "@/config/locales";

import { normaliseForSearch, searchLanguage, stem, tokenise } from "./text";
import type {
  DestinationIndex,
  IndexedDocument,
  IndexedField,
  IndexedHub,
  LocaleIndex,
  SearchDestination,
  SearchHub,
  SearchIndex,
  SearchLabel,
  SearchProduct,
  SearchSource,
} from "./types";

/**
 * One build's field cache. A product's fields in one locale are the same in every destination
 * (only its saleability, curation position and band differ), so each is tokenised and stemmed once
 * per build, not once per destination.
 */
export type FieldCache = Map<string, IndexedField>;

/** A field from one or more texts in one locale: their tokens (no cap) and the tokens' stems. */
export function indexField(
  texts: readonly string[],
  locale: string,
  cache?: FieldCache,
): IndexedField {
  const key = `${locale}\u0001${texts.join("\u0000")}`;
  const cached = cache?.get(key);
  if (cached !== undefined) return cached;
  const field = buildField(texts, locale);
  cache?.set(key, field);
  return field;
}

function buildField(texts: readonly string[], locale: string): IndexedField {
  const tokens: string[] = [];
  for (const text of texts) {
    tokens.push(...tokenise(normaliseForSearch(text), locale, Infinity));
  }
  return {
    language: searchLanguage(locale),
    tokens,
    tokenSet: new Set(tokens),
    stemSet: new Set(tokens.map((token) => stem(token, locale))),
  };
}

/** The alt field: the other launch languages' labels, one field per language. */
function altFields(
  labels: readonly SearchLabel[],
  requestLocale: LocaleCode,
  cache: FieldCache,
): IndexedField[] {
  const byLanguage = new Map<string, { locale: string; texts: string[] }>();
  const own = searchLanguage(requestLocale);
  for (const label of labels) {
    const language = searchLanguage(label.locale);
    if (language === own) continue;
    const group = byLanguage.get(language) ?? {
      locale: label.locale,
      texts: [],
    };
    group.texts.push(label.text);
    byLanguage.set(language, group);
  }
  return [...byLanguage.values()].map((group) =>
    indexField(group.texts, group.locale, cache),
  );
}

function toDocument(
  product: SearchProduct,
  locale: LocaleCode,
  bands: ReadonlyMap<string, number>,
  cache: FieldCache,
): IndexedDocument {
  const name = indexField([product.name], locale, cache);
  return {
    sku: product.sku,
    nameKey: name.tokens.join(" "),
    skuKey: normaliseForSearch(product.sku),
    name,
    facets: indexField(product.facetLabels, locale, cache),
    alt: altFields(product.altLabels, locale, cache),
    description: indexField([product.description], locale, cache),
    hasPhoto: product.hasPhoto,
    curationIndex: product.curationIndex,
    saleable: product.saleable,
    marginBand: bands.get(product.sku) ?? 0,
  };
}

const WORD_SPLIT = /[^\p{L}\p{N}]+/u;

/** Each word of `text` whose normalised form is one token, mapped to its lower-cased surface form. */
function displayForms(
  text: string,
  locale: LocaleCode,
  into: Map<string, string>,
): void {
  for (const word of text.split(WORD_SPLIT)) {
    const normalised = normaliseForSearch(word);
    if (normalised === "" || normalised.includes(" ")) continue;
    if (!into.has(normalised)) {
      into.set(normalised, word.toLocaleLowerCase(locale));
    }
  }
}

function destinationIndex(
  iso2: string,
  locale: LocaleCode,
  products: readonly SearchProduct[],
  hubs: readonly SearchHub[],
  bands: ReadonlyMap<string, number>,
  cache: FieldCache,
): DestinationIndex {
  const documents = products.map((product) =>
    toDocument(product, locale, bands, cache),
  );

  const vocabulary = new Map<string, number>();
  const suggestionCounts = new Map<string, number>();
  const display = new Map<string, string>();
  documents.forEach((document, index) => {
    const terms = new Set<string>();
    for (const field of [
      document.name,
      document.facets,
      document.description,
      ...document.alt,
    ]) {
      for (const token of field.tokenSet) terms.add(token);
      for (const stemmed of field.stemSet) terms.add(stemmed);
    }
    for (const term of terms)
      vocabulary.set(term, (vocabulary.get(term) ?? 0) + 1);

    const offered = new Set([
      ...document.name.tokenSet,
      ...document.facets.tokenSet,
    ]);
    for (const term of offered) {
      suggestionCounts.set(term, (suggestionCounts.get(term) ?? 0) + 1);
    }
    const product = products[index];
    if (product !== undefined) {
      displayForms(product.name, locale, display);
      for (const label of product.facetLabels) {
        displayForms(label, locale, display);
      }
    }
  });

  const suggestions = new Map<
    string,
    { readonly documents: number; readonly display: string }
  >();
  for (const [term, count] of suggestionCounts) {
    suggestions.set(term, {
      documents: count,
      display: display.get(term) ?? term,
    });
  }

  const indexedHubs: IndexedHub[] = hubs.map((hub) => ({
    hub,
    fields: hub.labels.map((label) =>
      indexField([label.text], label.locale, cache),
    ),
  }));

  return { iso2, documents, vocabulary, suggestions, hubs: indexedHubs };
}

/**
 * Build the whole index: every launch locale, every destination with a shop there. Destinations
 * without a shop stay in `destinations` (their words still name them, their corridor page is still
 * a link) but carry no documents.
 */
export async function buildIndex(source: SearchSource): Promise<SearchIndex> {
  const bandCache = new Map<string, ReadonlyMap<string, number>>();
  const fieldCache: FieldCache = new Map();
  const locales = new Map<LocaleCode, LocaleIndex>();
  let documents = 0;

  for (const locale of source.locales()) {
    const destinations = new Map<string, SearchDestination>();
    const shops = new Map<string, DestinationIndex>();
    for (const destination of await source.destinations(locale)) {
      destinations.set(destination.iso2, destination);
      if (destination.shopHref === undefined) continue;
      const products = await source.products(locale, destination.iso2);
      if (products.length === 0) continue;
      let bands = bandCache.get(destination.iso2);
      if (bands === undefined) {
        bands = await source.rankBands(destination.iso2);
        bandCache.set(destination.iso2, bands);
      }
      const hubs = await source.hubs(locale, destination.iso2);
      const index = destinationIndex(
        destination.iso2,
        locale,
        products,
        hubs,
        bands,
        fieldCache,
      );
      shops.set(destination.iso2, index);
      documents += index.documents.length;
    }
    locales.set(locale, { locale, destinations, shops });
  }

  return { locales, documents };
}
