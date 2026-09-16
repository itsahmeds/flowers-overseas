/**
 * The active-partners seam (spec 007 §2 "The page, in its two states", §13 Q3, AC-8; TASK-091).
 *
 * `src/config/countries.ts` labels Poland `status: "live"` because the founder-approved homepage
 * prints a "Delivering now" chip for it. That label is a *design* fact; whether a florist in
 * Poland is taking our orders is an *operational* one, and no florist has been signed. §13 Q3's
 * accepted default is this seam: the corridor's live state is gated on a provider that answers
 * `false` for every destination in Phase 0, so the registry's label cannot make a page print a
 * cutoff nobody agreed to.
 *
 * The shape is the one `content/provider.ts` already uses, for the same reasons:
 *
 *  - the provider object is **not** exported from `src/modules/geo/index.ts` — a caller able to
 *    name `staticNoPartnersProvider` could swap it at runtime, and what it decides is whether the
 *    site claims to deliver somewhere;
 *  - `withActivePartnersProvider()` is module-internal, and it is how AC-8's live-state half is
 *    tested today: the same route, the same template, a fixture provider (spec 007 §5.3's "the
 *    artboards draw both");
 *  - spec 011's real implementation (partner rows, coverage, an admin flip) replaces the body of
 *    `getActivePartnersProvider()` and nothing else — "country go-live is a data flip, never a
 *    code change" (`CLAUDE.md`).
 */

/** A source of truth for "is anybody taking our orders in this country today?". */
export interface ActivePartnersProvider {
  /** ISO 3166-1 alpha-2 of the destination. `false` is always a safe answer. */
  hasActivePartners(iso2: string): boolean;
}

/**
 * Phase 0: nobody, anywhere. Not a stub — it is the true answer until spec 011 signs a florist,
 * and it is what keeps every corridor page in the guide state (§13 Q3).
 */
export const staticNoPartnersProvider: ActivePartnersProvider = {
  hasActivePartners: () => false,
};

let active: ActivePartnersProvider = staticNoPartnersProvider;

/** The composition root. The only function outside this file that names a provider. */
export function getActivePartnersProvider(): ActivePartnersProvider {
  return active;
}

/** The one predicate the rest of the module asks. */
export function hasActivePartners(iso2: string): boolean {
  return getActivePartnersProvider().hasActivePartners(iso2);
}

/**
 * Run `body` with `provider` in place of the active one, then restore. Module-internal (see the
 * header): imported by `src/modules/geo/**` and by the AC-8 live-state tests only.
 */
export async function withActivePartnersProvider<T>(
  provider: ActivePartnersProvider,
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
