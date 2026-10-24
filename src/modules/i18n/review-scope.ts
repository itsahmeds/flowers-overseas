/**
 * The scope registry of the unreviewed share (spec 003 §14 A17, AC-40 to AC-44; TASK-224).
 *
 * `unreviewedShare()` (`review.ts`) measures what a crawler can read. A key that renders only on
 * a page that is never indexed (checkout, order confirmation, the florist portal, admin, the
 * demo and development pages) or on no page at all (an email body) is **not counted**: it is in
 * neither the numerator nor the denominator. This file is the one list of those keys.
 *
 * ## Counted by default
 *
 * A key that no entry matches **counts**. A new namespace, a typo in `match` or a forgotten entry
 * therefore pushes the share up, toward `noindex`; no mistake in this list can push unreviewed
 * copy toward the index. There is no list of indexable namespaces to keep in step.
 *
 * ## An entry
 *
 *  - `match`: a top-level namespace (`checkout`) or a dot prefix ending in `.*`
 *    (`meta.checkout.*`), the shape `content/i18n/draft-policy.json` uses;
 *  - `surface`: one of `SCOPE_SURFACES`;
 *  - `paths`: the source globs (relative to the repo root, `**` and `*` only) that alone may
 *    reach the matched keys. `pnpm i18n:check` check 11 refuses a matched key read from a file
 *    outside them, a glob that matches a shared file, and a file under them that an indexable
 *    page imports, directly or through other files.
 *
 * The registry is parsed by zod at module load: a malformed entry stops the process, it is never
 * silently skipped. Entries are added by the task that adds the keys, in the same PR (A17 clause
 * 7); an entry whose `match` reaches no `en` key is a check 11 error, so it cannot be declared
 * ahead of its keys.
 *
 * Not counted is **not exempt**: price-display, legal and every buyer-facing string still needs
 * the founder's approval before it ships (A17 clause 5); `pnpm i18n:check --summary` lists the
 * unapproved ones. Module-internal: the barrel exports nothing from here (AC-3).
 */
import { z } from "zod";

/** The closed set of surfaces whose own keys are not counted (A17 clause 1). */
export const SCOPE_SURFACES = [
  "checkout",
  "orderConfirmation",
  "orderTracking",
  "florist",
  "admin",
  "demo",
  "dev",
  "email",
] as const;

export type ScopeSurface = (typeof SCOPE_SURFACES)[number];

/**
 * The surfaces a buyer reads. Their keys are not counted, and still need the founder's exact-text
 * approval (A17 clause 5); the summary lists the ones still `reviewed: false` (AC-43).
 */
export const BUYER_FACING_SURFACES: readonly ScopeSurface[] = [
  "checkout",
  "orderConfirmation",
  "orderTracking",
  "email",
];

const SEGMENT = "[A-Za-z][A-Za-z0-9]*";
const NAMESPACE = ["^", SEGMENT, "$"].join("");
const DOT_PREFIX = ["^", SEGMENT, "(?:\\.", SEGMENT, ")*\\.\\*", "$"].join("");
/** `checkout`, or `meta.checkout.*` (one or more segments then `.*`). */
export const SCOPE_MATCH_PATTERN = new RegExp(`${NAMESPACE}|${DOT_PREFIX}`);

export const ScopeEntrySchema = z
  .object({
    match: z.string().regex(SCOPE_MATCH_PATTERN),
    surface: z.enum(SCOPE_SURFACES),
    paths: z.array(z.string().min(1)).min(1),
  })
  .strict();

export type ScopeEntry = z.infer<typeof ScopeEntrySchema>;

const ScopeSchema = z.array(ScopeEntrySchema);

/**
 * Spec 010 checkout copy (TASK-201). The components take it as props; only the checkout route,
 * the checkout module and the gallery resolve it. `checkout.address.*` is left out on purpose:
 * `src/modules/i18n/address.ts` reads the address-format labels, and every page type renders
 * that module, so those keys count.
 */
const CHECKOUT_PATHS = [
  "src/app/[locale]/(checkout)/**",
  // The start route (TASK-203): a POST handler that answers 303 or an error status and renders
  // nothing, so no checkout key can reach an indexable page through it.
  "src/app/api/checkout/**",
  "src/app/(dev)/dev/components/**",
  "src/modules/checkout/**",
  "src/config/checkout.ts",
];
/**
 * Spec 013 payment copy (TASK-255): the checkout's own paths plus the payments module, which maps
 * a decline code to its key. No indexable page imports `src/modules/payments/`.
 */
const PAYMENTS_PATHS = [...CHECKOUT_PATHS, "src/modules/payments/**"];
const CHECKOUT_SUBTREES = [
  "action",
  // The basket page and its date-gone notice (spec 010 §14 A-founder-2026-10-22; TASK-349): only
  // `/{locale}/basket`, a `no-store` `noindex` page under `(checkout)`, renders them. TASK-204:
  // the checkout page's add-ons, basket notice, closed and expired states, date notice, review
  // list and step titles render on `/{locale}/checkout` only.
  "addons",
  "basket",
  "buyer",
  "card",
  "closed",
  "date",
  "demo",
  "error",
  "expired",
  "field",
  "placeKind",
  "price",
  "privacy",
  "progress",
  "recipient",
  "review",
  "step",
  "summary",
];

/**
 * Keys that no page an indexer reads can show. Add the entry in the PR that adds the keys.
 */
const RAW_NON_INDEXABLE_SCOPE: readonly unknown[] = [
  ...CHECKOUT_SUBTREES.map((subtree) => ({
    match: `checkout.${subtree}.*`,
    surface: "checkout",
    paths: CHECKOUT_PATHS,
  })),
  {
    match: "confirmation",
    surface: "orderConfirmation",
    paths: CHECKOUT_PATHS,
  },
  // Spec 013 §7 (TASK-255): the pay step's errors and labels render on step 3 only, and the
  // payment lines of the confirmation states on the confirmation page only; both are `no-store`,
  // `noindex` checkout routes. `src/modules/payments/**` names the keys (`declineMessageKey`).
  {
    match: "payments.error.*",
    surface: "checkout",
    paths: PAYMENTS_PATHS,
  },
  {
    match: "payments.step.*",
    surface: "checkout",
    paths: PAYMENTS_PATHS,
  },
  {
    match: "payments.confirmation.*",
    surface: "orderConfirmation",
    paths: PAYMENTS_PATHS,
  },
];

export const NON_INDEXABLE_SCOPE: readonly ScopeEntry[] = Object.freeze(
  ScopeSchema.parse(RAW_NON_INDEXABLE_SCOPE),
);

let scope: readonly ScopeEntry[] = NON_INDEXABLE_SCOPE;

/** The registry in force: the committed list, or the one `withReviewScope` injected. */
export function getReviewScope(): readonly ScopeEntry[] {
  return scope;
}

/**
 * Run `body` with `entries` as the registry (zod-parsed, so a fixture cannot be malformed). The
 * share cache in `review.ts` is keyed by the registry in force, so it never answers across a
 * swap. Module-internal test hook, like `withMessageSource`.
 */
export async function withReviewScope<T>(
  entries: readonly unknown[],
  body: () => T | Promise<T>,
): Promise<T> {
  const previous = scope;
  scope = Object.freeze(ScopeSchema.parse(entries));
  try {
    return await body();
  } finally {
    scope = previous;
  }
}

/** Does `match` reach the dot-path `key`? A namespace matches itself and its subtree. */
export function matchReaches(match: string, key: string): boolean {
  if (match.endsWith(".*")) return key.startsWith(match.slice(0, -1));
  return key === match || key.startsWith(`${match}.`);
}

/**
 * The first entry that matches `key`, or `undefined` when the key counts. Registry order does
 * not matter for counting, only for which entry a check names.
 */
export function scopeEntryFor(
  key: string,
  entries: readonly ScopeEntry[] = scope,
): ScopeEntry | undefined {
  return entries.find((entry) => matchReaches(entry.match, key));
}

/** A key is counted unless an entry classifies it as non-indexable (A17 clause 1). */
export function isCounted(key: string): boolean {
  return scopeEntryFor(key) === undefined;
}
