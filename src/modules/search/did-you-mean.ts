/**
 * `didYouMean`: the nearest catalogue words for a query that found nothing (spec 045 §2.7, §14
 * A-orchestrator-2026-10-24 item 2; TASK-401). Its rendered button is AC-37, TASK-402's.
 *
 * It fires **only when the query returns zero results after typo tolerance**. Each query token
 * that matched no field is replaced by the nearest candidate (the tokens of names and request-
 * locale facet labels in the destination's listing set) within one step wider than §2.3's typo
 * matching: 1 for 3 letters, 2 for 4 to 7, 3 for 8 or more, none under 3. Ties go to the smaller
 * distance, then the term more documents carry, then `Intl.Collator(locale)`. The suggestion is
 * offered only when the substituted query returns at least one result; otherwise `null`.
 */
import type { LocaleCode } from "@/config/locales";
import { SEARCH_CONFIG, type SearchConfig } from "@/config/search";
import { collator } from "@/modules/i18n";

import { matchDocuments, unmatchedTokens } from "./match";
import { damerauLevenshtein, sharesTypoPrefix, typoAllowance } from "./text";
import type { DestinationIndex } from "./types";

interface Candidate {
  readonly term: string;
  readonly distance: number;
  readonly documents: number;
  readonly display: string;
}

function nearest(
  index: DestinationIndex,
  token: string,
  locale: LocaleCode,
  config: SearchConfig,
): Candidate | undefined {
  const allowance = typoAllowance(token, config, true);
  if (allowance === 0) return undefined;
  const compare = collator(locale);
  let best: Candidate | undefined;
  for (const [term, entry] of index.suggestions) {
    if (!sharesTypoPrefix(token, term, config)) continue;
    const distance = damerauLevenshtein(token, term, allowance);
    if (distance > allowance || distance === 0) continue;
    const candidate: Candidate = {
      term,
      distance,
      documents: entry.documents,
      display: entry.display,
    };
    if (
      best === undefined ||
      candidate.distance < best.distance ||
      (candidate.distance === best.distance &&
        (candidate.documents > best.documents ||
          (candidate.documents === best.documents &&
            compare.compare(candidate.term, best.term) < 0)))
    ) {
      best = candidate;
    }
  }
  return best;
}

export function didYouMean(
  index: DestinationIndex,
  tokens: readonly string[],
  locale: LocaleCode,
  config: SearchConfig = SEARCH_CONFIG,
): string | null {
  if (tokens.length === 0) return null;
  if (matchDocuments(index, tokens, config).length > 0) return null;

  const unmatched = unmatchedTokens(index, tokens, config);
  if (unmatched.size === 0) return null;

  const substituted: string[] = [];
  const shown: string[] = [];
  for (const token of tokens) {
    if (!unmatched.has(token)) {
      substituted.push(token);
      shown.push(token);
      continue;
    }
    const candidate = nearest(index, token, locale, config);
    if (candidate === undefined) return null;
    substituted.push(candidate.term);
    shown.push(candidate.display);
  }

  return matchDocuments(index, substituted, config).length > 0
    ? shown.join(" ")
    : null;
}
