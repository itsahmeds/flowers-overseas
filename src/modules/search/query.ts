/**
 * `parseQuery`: a raw query into tokens and, when the words name one, a destination (spec 045
 * §2.4 item 1, AC-11; TASK-400).
 *
 * A destination's words are its names in every launch locale and its URL slugs: data from the
 * country registry and the catalogues, handed in by the caller, so nothing here names a country
 * (spec 004 AC-73). Words that name a destination leave the query and set the destination; the
 * first one named wins, and every destination word is consumed, so "flowers to {a country}"
 * searches "flowers". The query's own words beat the `to` parameter, which the engine applies
 * only when this returns no destination (§2.4: words, then `to`, then none).
 *
 * Matching is exact on the normalised words (a multi-word name matches as a run of words), never
 * by stem or typo: a country is a deliberate choice, and a near-miss must not move the buyer's
 * search to another country.
 */
import { SEARCH_CONFIG, type SearchConfig } from "@/config/search";

import { normaliseForSearch, tokenise } from "./text";

/** One destination as `parseQuery` needs it: its code and its words, each a normalised phrase. */
export interface DestinationWords {
  readonly iso2: string;
  /** Normalised phrases (a one-word name, or a run of words for a longer one), as tokens. */
  readonly phrases: readonly (readonly string[])[];
}

export interface ParsedQuery {
  /** The whole query, normalised, before destination words and stop words leave it. */
  readonly normalised: string;
  /** Letters and digits in `normalised`: the "too short" test (§2.7). */
  readonly letters: number;
  /** The search tokens: destination words consumed, stop words dropped, at most `maxTokens`. */
  readonly tokens: readonly string[];
  /** The destination the words named, or `undefined`. */
  readonly destination: string | undefined;
}

function phraseAt(
  words: readonly string[],
  start: number,
  phrase: readonly string[],
): boolean {
  if (phrase.length === 0 || start + phrase.length > words.length) return false;
  return phrase.every((word, offset) => words[start + offset] === word);
}

/** Turn a display name or slug into the phrase `parseQuery` compares against. */
export function destinationPhrase(text: string): string[] {
  return normaliseForSearch(text)
    .split(" ")
    .filter((word) => word !== "");
}

export function parseQuery(
  raw: string,
  locale: string,
  destinations: readonly DestinationWords[],
  config: SearchConfig = SEARCH_CONFIG,
): ParsedQuery {
  const normalised = normaliseForSearch(raw);
  const words = normalised === "" ? [] : normalised.split(" ");
  const letters = words.reduce((sum, word) => sum + word.length, 0);

  let destination: string | undefined;
  const kept: string[] = [];
  for (let index = 0; index < words.length;) {
    let consumed = 0;
    let named: string | undefined;
    for (const candidate of destinations) {
      for (const phrase of candidate.phrases) {
        if (phrase.length > consumed && phraseAt(words, index, phrase)) {
          consumed = phrase.length;
          named = candidate.iso2;
        }
      }
    }
    if (consumed > 0) {
      destination ??= named;
      index += consumed;
      continue;
    }
    kept.push(words[index] ?? "");
    index += 1;
  }

  return {
    normalised,
    letters,
    tokens: tokenise(kept.join(" "), locale, config.maxTokens, config),
    destination,
  };
}
