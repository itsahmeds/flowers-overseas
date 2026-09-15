/**
 * The corridor content provider seam (spec 007 §2 "The content model", §5.2, AC-4; TASK-087).
 *
 * One interface, one Phase 0 implementation, one accessor — spec 003's registry seam
 * (`src/modules/i18n/registry.ts`) and spec 005's provider seam applied to corridor copy:
 *
 *  - `CountryContentProvider` is what the rest of the module asks for a country's copy;
 *  - `staticCountryContentProvider` answers from the committed files under `content/corridors/`,
 *    parsed once at module load — no database, no network, no request-time I/O;
 *  - `getCountryContentProvider()` is the composition root. It is the only thing outside this file
 *    that names a provider, which is what makes spec 002/012's `dbCountryContentProvider` a change
 *    to this function body and to nothing else (AC-4, §12).
 *
 * `withCountryContentProvider()` is the injection hook the AC-4 seam test uses, and it is
 * deliberately **not exported from `index.ts`**: a caller that could swap the corpus at runtime
 * would turn the seam into global mutable configuration. The fake provider therefore lives inside
 * `src/modules/geo/`, and swapping it changes the rendered view model with zero changes outside
 * this module — which is exactly the claim T-05 measures.
 *
 * **A malformed committed file throws at module load**, naming the file and the field (AC-1). A
 * provider that silently dropped an unparseable guide would turn a content fault into a missing
 * page, and a missing page is indistinguishable from a country we chose not to publish.
 */
import { readCorridorCorpus, type CorridorSourceFile } from "./corpus.ts";
import {
  corridorContentPath,
  formatContentIssues,
  parseCorridorContent,
} from "./parse.ts";
import type { CorridorState, CountryLocaleContent } from "./schemas.ts";

/**
 * A corridor content source. It hands over authored records and resolves nothing: which state a
 * country is in, whether a page exists and whether it is indexable are the module's own decisions
 * (spec 007 §2), so the static and the database implementations cannot disagree about a page.
 */
export interface CountryContentProvider {
  /** Every authored record, in a stable order. */
  list(): readonly CountryLocaleContent[];
  /** One record, or `undefined` when that (country, locale, state) has not been authored. */
  get(
    iso2: string,
    locale: string,
    state: CorridorState,
  ): CountryLocaleContent | undefined;
}

function keyOf(iso2: string, locale: string, state: string): string {
  return `${locale}/${iso2}/${state}`;
}

/**
 * Build a provider from a set of raw files — the shape the static provider, the AC-4 fake and
 * spec 002's database implementation all share.
 *
 * Throws on the first file that does not parse, naming file and field, so a build stops on a
 * half-authored guide rather than shipping one.
 */
export function countryContentProviderOf(
  files: readonly CorridorSourceFile[],
): CountryContentProvider {
  const records: CountryLocaleContent[] = [];
  for (const file of files) {
    const result = parseCorridorContent(file.path, file.source);
    if (!result.ok) {
      throw new Error(
        `corridor content is invalid:\n${formatContentIssues(result.issues)}`,
      );
    }
    records.push(result.content);
  }
  const byKey = new Map(
    records.map((record) => [
      keyOf(record.iso2, record.locale, record.state),
      record,
    ]),
  );
  return {
    list: () => records,
    get: (iso2, locale, state) => byKey.get(keyOf(iso2, locale, state)),
  };
}

/** The Phase 0 provider: the committed corpus, parsed at module load. */
export const staticCountryContentProvider: CountryContentProvider =
  countryContentProviderOf(readCorridorCorpus());

let active: CountryContentProvider = staticCountryContentProvider;

/** The provider every function in this module reads. Callers outside never see the object. */
export function getCountryContentProvider(): CountryContentProvider {
  return active;
}

/**
 * Run `body` with `provider` in place of the active one, then restore. Module-internal (see the
 * header): imported by `src/modules/geo/**` and by the AC-4 seam test only.
 */
export async function withCountryContentProvider<T>(
  provider: CountryContentProvider,
  body: () => T | Promise<T>,
): Promise<T> {
  const previous = active;
  active = provider;
  try {
    return await body();
  } finally {
    active = previous;
  }
}

/** The repo-relative path a record was authored at. One builder, shared with the gate. */
export function pathOf(content: CountryLocaleContent): string {
  return corridorContentPath(content);
}
