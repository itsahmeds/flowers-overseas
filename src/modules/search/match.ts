/**
 * `matchDocuments`: which documents a query matches, at which tier and relevance band (spec 045
 * §2.3; TASK-401). Pure over the index.
 *
 * Per query token and field, the first way that matches, in §2.3's order: **exact**; **stem** (the
 * token stemmed in the field's own language, so "róże" on `/en` meets the Polish label's stem);
 * **prefix** (the last query token only, from 3 letters); **typo** (Damerau-Levenshtein 1 for 4 to
 * 7 letters, 2 from 8, never under 4, against the index vocabulary of tokens and stems).
 *
 * The tier of a document (higher is better): **5** the whole query is the name, or the SKU;
 * **4** every token matches the name or the facets (request or alt language), none by typo;
 * **3** every token matches some field, none by typo; **2** every token matches some field, at
 * least one only by typo; **1** three or more tokens and at least half of them (rounded up) match;
 * otherwise no result. The relevance band inside a tier: **2** at least half the tokens (rounded
 * up) hit the name, **1** at least one token hits the name or a request-locale facet, **0**
 * otherwise.
 */
import { SEARCH_CONFIG, type SearchConfig } from "@/config/search";

import {
  damerauLevenshtein,
  sharesTypoPrefix,
  stem,
  typoAllowance,
} from "./text";
import type {
  DestinationIndex,
  IndexedDocument,
  IndexedField,
  IndexedHub,
} from "./types";

export type MatchKind = "exact" | "stem" | "prefix" | "typo";

export interface Match {
  readonly sku: string;
  readonly tier: 1 | 2 | 3 | 4 | 5;
  readonly band: 0 | 1 | 2;
  readonly document: IndexedDocument;
}

/** What one query token brings to the scan: whether it may prefix-match, and its typo targets. */
export interface TokenPlan {
  readonly token: string;
  readonly prefix: boolean;
  readonly typoTerms: ReadonlySet<string>;
  readonly stems: Map<string, string>;
}

/** Plan each token once per query: the typo scan over the vocabulary is the costly part. */
export function planTokens(
  tokens: readonly string[],
  vocabulary: Iterable<string>,
  config: SearchConfig = SEARCH_CONFIG,
): TokenPlan[] {
  const terms = [...vocabulary];
  return tokens.map((token, index) => {
    const allowance = typoAllowance(token, config);
    const typoTerms = new Set<string>();
    if (allowance > 0) {
      for (const term of terms) {
        if (term === token || !sharesTypoPrefix(token, term, config)) continue;
        if (damerauLevenshtein(token, term, allowance) <= allowance) {
          typoTerms.add(term);
        }
      }
    }
    return {
      token,
      prefix:
        index === tokens.length - 1 && token.length >= config.prefixMinLetters,
      typoTerms,
      stems: new Map<string, string>(),
    };
  });
}

function stemOf(plan: TokenPlan, language: string): string {
  const cached = plan.stems.get(language);
  if (cached !== undefined) return cached;
  const stemmed = stem(plan.token, language);
  plan.stems.set(language, stemmed);
  return stemmed;
}

/** How `plan`'s token matches `field`, or `undefined`. */
export function fieldMatch(
  field: IndexedField,
  plan: TokenPlan,
): MatchKind | undefined {
  if (field.tokenSet.has(plan.token)) return "exact";
  if (field.stemSet.has(stemOf(plan, field.language))) return "stem";
  if (plan.prefix && field.tokens.some((word) => word.startsWith(plan.token))) {
    return "prefix";
  }
  for (const term of plan.typoTerms) {
    if (field.tokenSet.has(term) || field.stemSet.has(term)) return "typo";
  }
  return undefined;
}

const firm = (kind: MatchKind | undefined): boolean =>
  kind !== undefined && kind !== "typo";

function halfUp(count: number): number {
  return Math.ceil(count / 2);
}

/** One document against the planned query, or `undefined` when it is not a result. */
export function matchDocument(
  document: IndexedDocument,
  plans: readonly TokenPlan[],
  queryKey: string,
): Match | undefined {
  const count = plans.length;
  if (count === 0) return undefined;

  let firmNameOrFacets = 0;
  let firmAny = 0;
  let matched = 0;
  let nameHits = 0;
  let nameOrFacetHits = 0;

  for (const plan of plans) {
    let name = fieldMatch(document.name, plan);
    let facets = fieldMatch(document.facets, plan);
    let alt = document.alt.map((field) => fieldMatch(field, plan));
    let description = fieldMatch(document.description, plan);
    // "In this order" (§2.3): a typo is the fallback for a token nothing better matches in this
    // document. Where the token matches some field firmly, its typo hits elsewhere are dropped,
    // so a near-miss cannot lift the relevance band of a document the word already found
    // (`róże` meets the name "Rose…" only by typo; it must rank as `róża` does, AC-6).
    if ([name, facets, description, ...alt].some(firm)) {
      const keepFirm = (kind: MatchKind | undefined): MatchKind | undefined =>
        firm(kind) ? kind : undefined;
      name = keepFirm(name);
      facets = keepFirm(facets);
      description = keepFirm(description);
      alt = alt.map(keepFirm);
    }

    const nameOrFacetsFirm = firm(name) || firm(facets) || alt.some(firm);
    const anyFirm = nameOrFacetsFirm || firm(description);
    const any =
      anyFirm ||
      name !== undefined ||
      facets !== undefined ||
      description !== undefined ||
      alt.some((kind) => kind !== undefined);

    if (nameOrFacetsFirm) firmNameOrFacets += 1;
    if (anyFirm) firmAny += 1;
    if (any) matched += 1;
    if (name !== undefined) nameHits += 1;
    if (name !== undefined || facets !== undefined) nameOrFacetHits += 1;
  }

  let tier: Match["tier"] | undefined;
  if (queryKey === document.nameKey || queryKey === document.skuKey) tier = 5;
  else if (firmNameOrFacets === count) tier = 4;
  else if (firmAny === count) tier = 3;
  else if (matched === count) tier = 2;
  else if (count >= 3 && matched >= halfUp(count)) tier = 1;
  if (tier === undefined) return undefined;

  const band: Match["band"] =
    nameHits >= halfUp(count) ? 2 : nameOrFacetHits > 0 ? 1 : 0;
  return { sku: document.sku, tier, band, document };
}

/** Every document of a destination the query matches, in index order (unranked). */
export function matchDocuments(
  index: DestinationIndex,
  tokens: readonly string[],
  config: SearchConfig = SEARCH_CONFIG,
): Match[] {
  if (tokens.length === 0) return [];
  const plans = planTokens(tokens, index.vocabulary.keys(), config);
  const queryKey = tokens.join(" ");
  const matches: Match[] = [];
  for (const document of index.documents) {
    const match = matchDocument(document, plans, queryKey);
    if (match !== undefined) matches.push(match);
  }
  return matches;
}

/**
 * The tokens no field of any document matches, by any kind including typo: the ones "Did you
 * mean" may replace (§14 A-orchestrator-2026-10-24 item 2).
 */
export function unmatchedTokens(
  index: DestinationIndex,
  tokens: readonly string[],
  config: SearchConfig = SEARCH_CONFIG,
): Set<string> {
  const plans = planTokens(tokens, index.vocabulary.keys(), config);
  const unmatched = new Set<string>();
  for (const plan of plans) {
    const found = index.documents.some((document) =>
      [
        document.name,
        document.facets,
        document.description,
        ...document.alt,
      ].some((field) => fieldMatch(field, plan) !== undefined),
    );
    if (!found) unmatched.add(plan.token);
  }
  return unmatched;
}

/**
 * The occasion and category pages every token names (§2.3 "Pages"): each token matches the
 * page's label in some launch locale at tier 3 or better (exact, stem or the last token's prefix;
 * never by typo). Unordered; the engine orders and caps them.
 */
export function matchHubs(
  hubs: readonly IndexedHub[],
  tokens: readonly string[],
  config: SearchConfig = SEARCH_CONFIG,
): IndexedHub[] {
  if (tokens.length === 0) return [];
  const plans = planTokens(tokens, [], config);
  return hubs.filter((hub) =>
    plans.every((plan) =>
      hub.fields.some((field) => firm(fieldMatch(field, plan))),
    ),
  );
}
