/**
 * `matchDocuments`: which documents a query matches, at which tier and relevance band (spec 045
 * §2.3; TASK-401). Pure over the index.
 *
 * Per query token and field, the first way that matches, in §2.3's order: **exact**; **stem** (the
 * token stemmed in the field's own language, so "róże" on `/en` meets the Polish label's stem);
 * **prefix** (the last query token only, from 3 letters); **typo** (Damerau-Levenshtein 1 for 4 to
 * 7 letters, 2 from 8, never under 4, against the index vocabulary of tokens and stems).
 *
 * A token takes typo matches only when it matches nothing firmly (exact, stem or prefix) in any
 * field of any document of the searched set (§2.3 as amended by §14 A-orchestrator-2026-10-25b;
 * TASK-426): a word the catalogue carries is taken as meant, so German `Rosa` (pink) is not a
 * near-miss of `rose`, nor Polish `różne` (various) of `róża`. Decided once per token per query.
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

const NO_TYPO_TERMS: ReadonlySet<string> = new Set<string>();

function fieldsOf(document: IndexedDocument): readonly IndexedField[] {
  return [
    document.name,
    document.facets,
    document.description,
    ...document.alt,
  ];
}

/**
 * The plans with the typo targets of every token that matches some field of some document firmly
 * removed: a typo counts only for a token that matches nothing firmly in the searched set (§2.3,
 * A-orchestrator-2026-10-25b item 1). One scan per token with typo targets, stopping at the first
 * firm field, so the cost stays per query rather than per document (AC-28).
 */
function typoOnlyWhereUnmatched(
  plans: readonly TokenPlan[],
  documents: readonly IndexedDocument[],
): TokenPlan[] {
  return plans.map((plan) => {
    if (plan.typoTerms.size === 0) return plan;
    const firmOnly: TokenPlan = { ...plan, typoTerms: NO_TYPO_TERMS };
    const firmSomewhere = documents.some((document) =>
      fieldsOf(document).some(
        (field) => fieldMatch(field, firmOnly) !== undefined,
      ),
    );
    return firmSomewhere ? firmOnly : plan;
  });
}

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
    // `plans` went through `typoOnlyWhereUnmatched`: a token with typo targets left matches
    // nothing firmly in any document, so here a typo hit is the token's only kind of hit.
    const name = fieldMatch(document.name, plan);
    const facets = fieldMatch(document.facets, plan);
    const alt = document.alt.map((field) => fieldMatch(field, plan));
    const description = fieldMatch(document.description, plan);

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
  const plans = typoOnlyWhereUnmatched(
    planTokens(tokens, index.vocabulary.keys(), config),
    index.documents,
  );
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
      fieldsOf(document).some((field) => fieldMatch(field, plan) !== undefined),
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
