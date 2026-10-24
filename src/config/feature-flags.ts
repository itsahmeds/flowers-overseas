/**
 * @purpose The feature-flag registry (AC-14)
 * @spec 012
 *
 * The feature-flag registry (spec 012 §2.4, §5.2, AC-14 registry half; decisions log 2026-10-05
 * ruling R5; TASK-219).
 *
 * Flags live in the database (`feature_flag`, `feature_flag_scope`; spec 002 §12), never in env.
 * This file is the list of keys the application **reads and admin may toggle**: each key, the
 * scope kinds it takes, what it does, its risk level, and the cache tags a change dirties. A key
 * the database holds and this file does not name is an orphan: `src/lib/flags.ts` refuses to read
 * it and spec 012's flags page (TASK-220) shows it without a toggle.
 *
 * In v0 it registers exactly the two flags spec 010's checkout reads:
 *
 *  - `checkout.open`, country scope: the demo checkout is open for a destination. A toggle dirties
 *    the destination's `catalog` cache entity (the tag `catalog:{iso2}`, built only by spec 005's
 *    `cacheTagsFor`), so the product pages' demo button follows within 60 s (spec 010 §5.4).
 *  - `checkout.demo_guard`, global and high-risk: every checkout is a demo while it is on. It
 *    dirties no public page (spec 012 §5.4). High-risk means admin-only, with the key typed to
 *    confirm (TASK-220).
 *
 * Spec 013 adds `payments.stripe` and `payments.mollie` here, high-risk, when it lands. Spec 022a
 * adds `reviews.invite` and `reviews.trustpilot`, global and high-risk (TASK-368).
 *
 * No database here (`pnpm check:no-db` scans `src/config`): the reader is `src/lib/flags.ts`.
 */
import { z } from "zod";

/** `feature_flag_scope.scope` (migration `0009`). */
export const flagScopeKinds = [
  "global",
  "country",
  "locale",
  "payment_method",
  "partner",
] as const;
export type FlagScopeKind = (typeof flagScopeKinds)[number];

/** How careful a toggle must be. `high`: admin only, the key typed to confirm (spec 012 §2.4). */
export const flagRiskLevels = ["standard", "high"] as const;
export type FlagRiskLevel = (typeof flagRiskLevels)[number];

/** `feature_flag_key_check` of migration `0009`, so the registry cannot name a key the table refuses. */
const FLAG_KEY_PATTERN = /^[a-z][a-z_]*(?:[.][a-z0-9_-]+)+$/u;

/**
 * `feature_flag_scope_scope_ref_check` of migration `0009`, one rule per kind: `*` for global,
 * ISO 3166-1 alpha-2 upper case for a country, a lower-case locale code, a slug otherwise.
 */
const SCOPE_REF_PATTERNS: Readonly<Record<FlagScopeKind, RegExp>> = {
  global: /^\*$/u,
  country: /^[A-Z]{2}$/u,
  locale: /^[a-z]{2}(?:-[a-z]{2})?$/u,
  payment_method: /^[a-z0-9][a-z0-9_-]*$/u,
  partner: /^[a-z0-9][a-z0-9_-]*$/u,
};

/**
 * The cache entities a toggle may dirty, each named by its `CacheEntity` kind (spec 005
 * `src/modules/catalog/cache.ts`, the only builder of tags) and keyed by the scope kind that
 * fills it: `catalog` takes the toggled country. The tags themselves are built by
 * `dirtiedTags()` in `src/lib/flags.ts`, never spelled here.
 */
export const flagDirtyKinds = ["catalog"] as const;
export type FlagDirtyKind = (typeof flagDirtyKinds)[number];
const DIRTY_SCOPE: Readonly<Record<FlagDirtyKind, FlagScopeKind>> = {
  catalog: "country",
};

/** A scope as a reader names it: `{ kind: "country", ref: "PL" }`. */
export const FlagScopeSchema = z
  .object({ kind: z.enum(flagScopeKinds), ref: z.string() })
  .strict()
  .refine((scope) => SCOPE_REF_PATTERNS[scope.kind].test(scope.ref), {
    message: "the scope reference does not match its kind",
    path: ["ref"],
  });
export type FlagScope = z.infer<typeof FlagScopeSchema>;

const FeatureFlagDefinitionSchema = z
  .object({
    key: z.string().regex(FLAG_KEY_PATTERN),
    scopeKinds: z.array(z.enum(flagScopeKinds)).min(1),
    description: z.string().trim().min(1),
    risk: z.enum(flagRiskLevels),
    dirties: z.array(z.enum(flagDirtyKinds)),
  })
  .strict()
  .superRefine((flag, context) => {
    for (const kind of flag.dirties) {
      if (!flag.scopeKinds.includes(DIRTY_SCOPE[kind])) {
        context.addIssue({
          code: "custom",
          message: `${flag.key}: dirtying ${kind} needs the ${DIRTY_SCOPE[kind]} scope kind`,
          path: ["dirties"],
        });
      }
    }
  });
export type FeatureFlagDefinition = z.infer<typeof FeatureFlagDefinitionSchema>;

/** The registry: one definition per key, no key twice. */
export const FeatureFlagRegistrySchema = z
  .array(FeatureFlagDefinitionSchema)
  .superRefine((flags, context) => {
    const seen = new Set<string>();
    for (const flag of flags) {
      if (seen.has(flag.key)) {
        context.addIssue({
          code: "custom",
          message: `duplicate flag key ${flag.key}`,
        });
      }
      seen.add(flag.key);
    }
  });

const REGISTRY = [
  {
    key: "checkout.open",
    scopeKinds: ["country"],
    description:
      "The demo checkout is open for a destination country (spec 010 checkoutMode()). A toggle refreshes that country's product pages within 60 s.",
    risk: "standard",
    dirties: ["catalog"],
  },
  {
    key: "checkout.demo_guard",
    scopeKinds: ["global"],
    description:
      "Every checkout is a demo while this is on: no card is charged and no florist is paid (spec 010). Admin only; type the key to confirm.",
    risk: "high",
    dirties: [],
  },
  // Spec 022a §5.1, §12 (migration `0031_reviews_close`, TASK-368): the two review switches,
  // global, off, high-risk. Display follows data, so neither dirties a page.
  {
    key: "reviews.invite",
    scopeKinds: ["global"],
    description:
      "One review email to every delivered live order, 24 hours after the photo (spec 022a). Turn on only after the founder approves the email copy and the review policy. Admin only; type the key to confirm.",
    risk: "high",
    dirties: [],
  },
  {
    key: "reviews.trustpilot",
    scopeKinds: ["global"],
    description:
      "The review email carries Trustpilot's automatic feedback BCC (spec 022a §13 Q2). Turn on only after the Trustpilot DPA is filed and TRUSTPILOT_AFS_ADDRESS is set. Admin only; type the key to confirm.",
    risk: "high",
    dirties: [],
  },
] as const satisfies readonly FeatureFlagDefinition[];

/** Every registered key. */
export type FlagKey = (typeof REGISTRY)[number]["key"];

/** The registry, parsed once at module load: a malformed entry fails the first import. */
export const FEATURE_FLAGS: readonly FeatureFlagDefinition[] = Object.freeze(
  FeatureFlagRegistrySchema.parse(REGISTRY),
);

const BY_KEY: ReadonlyMap<string, FeatureFlagDefinition> = new Map(
  FEATURE_FLAGS.map((flag) => [flag.key, flag]),
);

/** Thrown for a key the registry does not name: it cannot be read or toggled. */
export class UnregisteredFlagError extends Error {
  constructor(key: string) {
    // The key is a code identifier, never personal data; bounded so a hostile string stays short.
    super(`feature flag "${key.slice(0, 80)}" is not registered`);
    this.name = "UnregisteredFlagError";
  }
}

/** Whether `key` is a registered flag key. */
export function isRegisteredFlagKey(key: string): key is FlagKey {
  return BY_KEY.has(key);
}

/** The definition of a registered key; throws `UnregisteredFlagError` for any other string. */
export function flagDefinition(key: FlagKey): FeatureFlagDefinition {
  const flag = BY_KEY.get(key);
  if (flag === undefined) throw new UnregisteredFlagError(String(key));
  return flag;
}

/**
 * A toggle as the flags page submits it (spec 012 §5.2; TASK-220 writes it): a registered key, a
 * scope of a kind that key takes, and the new value. The typed confirmation of a high-risk key is
 * the page's concern and is checked there.
 */
export const FlagToggleSchema = z
  .object({
    key: z.string().refine(isRegisteredFlagKey, "unregistered flag key"),
    scope: FlagScopeSchema,
    enabled: z.boolean(),
  })
  .strict()
  .refine(
    (toggle) =>
      !isRegisteredFlagKey(toggle.key) ||
      flagDefinition(toggle.key).scopeKinds.includes(toggle.scope.kind),
    { message: "this flag does not take that scope kind", path: ["scope"] },
  );
export type FlagToggle = z.infer<typeof FlagToggleSchema>;
