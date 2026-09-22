/**
 * Translation review gate (spec 003 §2 "Messages", §5.2, §5.3, §6 "Thin/duplicate-content risk",
 * §7 "Translation review plan and `noindex` gating", AC-24; TASK-039).
 *
 * Three pure, synchronous functions over the review manifests, and one rule each:
 *
 *  - `unreviewedShare(locale)` — how much of the copy a visitor to `/{locale}` would read is not
 *    reviewed in that language, as a fraction in `[0, 1]`.
 *  - `localeBetaTag(locale)` — `plan/03` §6's 5 % rule: above the threshold the locale is marked
 *    "beta" in the switcher, because the buyer deserves to know the page is machine-drafted.
 *  - `isLocaleIndexable(locale)` — the hard gate of `plan/03` §6.4 and `plan/02` §12: `isLaunch`
 *    **and** an unreviewed share at or below the same 5 % threshold. Spec 007 consumes it for
 *    robots meta, hreflang membership (`alternates.ts` already does) and sitemap membership, so
 *    an English page served at `/de/` — textbook duplicate thin content — cannot be indexed.
 *
 * Everything here is synchronous and side-effect-free by contract (§5.3), so `generateMetadata`,
 * `generateStaticParams` and the sitemap builder all get the same answer for the same input.
 *
 * ## What counts as reviewed (the definition AC-24 measures)
 *
 * The share is computed over the **resolved** catalogue — the keys the locale actually renders
 * after the `fallbackCode` chain is merged — because that is what a visitor reads. For each key,
 * the nearest locale in the chain that provides it is the one whose manifest is consulted, and
 * the key counts as reviewed only when **both** hold:
 *
 *  1. that manifest says `reviewed: true` for the key; and
 *  2. the providing locale speaks the same language as the locale under test (same primary
 *     subtag: `en-gb` ← `en` qualifies, `de` ← `en` does not).
 *
 * Rule 2 is what makes the answers honest in both directions. `en-gb` is a thin override (§13 Q5)
 * whose 24 inherited keys are reviewed British-readable English, so its share is 0 and it is
 * indexable. A fifth locale with no catalogue at all (AC-31) renders English through the same
 * fallback, which is *not* reviewed Fifth-Language copy, so its share is 1 and it is neither
 * indexable nor unmarked — no special case, no "missing catalogue" branch, the same rule.
 *
 * A locale that is not in the registry, or whose resolved catalogue is empty, scores 1: nothing
 * about it has been reviewed, and the gate must fail closed.
 *
 * `en` is not special-cased either. It scores 0 because `messages/en.meta.json` says every key is
 * human-authored and reviewed; if a hand-edit ever set `reviewed: false` on an `en` key, the
 * source locale would honestly stop being indexable rather than exempting itself.
 *
 * ## Memoisation
 *
 * The share is memoised per locale for the life of the process: the manifests are immutable repo
 * data in Phase 0, and the gate is called once per page per build. `resetReviewCache()` is the
 * test hook — module-internal, **not** exported from `index.ts` (AC-3), like `withLocaleRegistry`
 * and `withMessageSource`, which it exists to cooperate with: a test that injects a fake registry
 * or a fixture manifest resets the cache inside the injected scope.
 */
import {
  fallbackChain,
  getMessageSource,
  resolveCatalogue,
} from "./messages.ts";
import { getLocaleRegistry } from "./registry.ts";

/**
 * `plan/03` §6's threshold: at or below 5 % unreviewed a locale is indexable and unmarked, above
 * it the locale is "beta" and `noindex`. One constant, so the two functions cannot disagree.
 */
export const UNREVIEWED_SHARE_THRESHOLD = 0.05;

/** Primary language subtag of a locale code, by string: `en-gb` -> `en`. No `Intl` needed. */
function primaryLanguage(code: string): string {
  return (code.split("-")[0] ?? code).toLowerCase();
}

/** Leaf keys of a merged catalogue, flattened to the dot paths the manifests are keyed by. */
function flattenKeys(tree: Record<string, unknown>, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      keys.push(...flattenKeys(value as Record<string, unknown>, path));
    } else {
      keys.push(path);
    }
  }
  return keys;
}

/** Does `catalogue` define this dot path itself? */
function provides(
  catalogue: Readonly<Record<string, unknown>> | undefined,
  key: string,
): boolean {
  if (catalogue === undefined) return false;
  let value: unknown = catalogue;
  for (const segment of key.split(".")) {
    if (typeof value !== "object" || value === null) return false;
    value = (value as Record<string, unknown>)[segment];
  }
  return typeof value === "string";
}

function computeUnreviewedShare(locale: string): number {
  const chain = fallbackChain(locale);
  if (chain.length === 0) return 1;

  const keys = flattenKeys(resolveCatalogue(locale));
  if (keys.length === 0) return 1;

  const language = primaryLanguage(locale);
  const source = getMessageSource();
  // Read each provider's catalogue and manifest once: `meta()` parses the manifest with zod on
  // every call, and the loop below asks about every key in the catalogue.
  const chainData = chain.map((code) => ({
    code,
    catalogue: source.catalogue(code),
    meta: source.meta(code),
  }));
  let unreviewed = 0;

  for (const key of keys) {
    // The nearest locale in the chain that defines the key is the one that renders it.
    const provider = chainData.find((entry) => provides(entry.catalogue, key));
    const reviewed =
      provider !== undefined &&
      primaryLanguage(provider.code) === language &&
      provider.meta?.[key]?.reviewed === true;
    if (!reviewed) unreviewed += 1;
  }

  return unreviewed / keys.length;
}

const cache = new Map<string, number>();

/**
 * The share of the locale's rendered keys that are not reviewed in its language, in `[0, 1]`
 * (see the header for the definition). Memoised; pure; synchronous.
 */
export function unreviewedShare(locale: string): number {
  const cached = cache.get(locale);
  if (cached !== undefined) return cached;
  const share = computeUnreviewedShare(locale);
  cache.set(locale, share);
  return share;
}

/**
 * `plan/03` §6: mark the locale "beta" in the switcher when more than 5 % of what it renders is
 * unreviewed. Deliberately independent of `isLaunch`: a locale that is not live has no switcher
 * entry to mark, and answering "yes, unreviewed" for it is the truthful answer.
 */
export function localeBetaTag(locale: string): boolean {
  return unreviewedShare(locale) > UNREVIEWED_SHARE_THRESHOLD;
}

/**
 * The `noindex` gate (spec 003 §2, §6): a live locale whose copy is reviewed. Pseudo-locales are
 * structurally incapable of passing it — they are never `isLaunch` (§2 "Pseudo-locales", AC-29) —
 * so there is no pseudo-locale list to keep in step here.
 */
export function isLocaleIndexable(locale: string): boolean {
  if (getLocaleRegistry().get(locale)?.isLaunch !== true) return false;
  return unreviewedShare(locale) <= UNREVIEWED_SHARE_THRESHOLD;
}

/**
 * Drop the memoised shares. Module-internal test hook (see the header): a test that swaps the
 * registry or the message source calls it inside the injected scope, and again after it.
 */
export function resetReviewCache(): void {
  cache.clear();
}

/**
 * The newest review date in the locale's own catalogue, as a `YYYY-MM-DD` day, or `undefined`
 * when the locale ships no manifest (spec 007 §2 "Sitemaps", AC-13; TASK-094).
 *
 * Spec 007 fixes a sitemap `<lastmod>` as "the real maximum `updatedAt` across the content file,
 * the country registry entry and the **message catalogue** — never `now`". The catalogue's own
 * dated fact is `reviewedAt` in `messages/{locale}.meta.json`: the day a human last signed off a
 * string the page renders. It lives here rather than in `modules/seo` for the reason the header
 * gives for every other function in this file — `messages/` never leaves the i18n module, so the
 * sitemap builder asks a question instead of reading a path — and it is a *function over the
 * manifests*, not a data export, so AC-3's ban on exported configuration is untouched.
 *
 * The **chain** is read, not just the locale's own file, because a locale renders what it
 * inherits: `en-gb` overrides 24 keys and shows English for the rest, so the day its page last
 * changed is the newer of the two manifests. Manifests are not merged for `unreviewedShare()`
 * (that question is about the locale's own file); this one is about the document a crawler sees.
 *
 * The answer is a **day**, not a timestamp: `<lastmod>` accepts either W3C form, the corridor
 * files carry `updatedAt` as a date, and comparing a date with a date is the only way the maximum
 * of the three sources is a total order rather than a timezone argument.
 */
export function catalogueUpdatedAt(locale: string): string | undefined {
  const source = getMessageSource();
  let newest: string | undefined;
  for (const code of fallbackChain(locale)) {
    const manifest = source.meta(code);
    if (manifest === undefined) continue;
    for (const record of Object.values(manifest)) {
      const day = record.reviewedAt?.slice(0, 10);
      if (day === undefined) continue;
      if (newest === undefined || day > newest) newest = day;
    }
  }
  return newest;
}
