/**
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
 *    `catalog:{iso2}`, so the product pages' demo button follows within 60 s (spec 010 §5.4).
 *  - `checkout.demo_guard`, global and high-risk: every checkout is a demo while it is on. It
 *    dirties no public page (spec 012 §5.4). High-risk means admin-only, with the key typed to
 *    confirm (TASK-220).
 *
 * Spec 013 adds `payments.stripe` and `payments.mollie` here, high-risk, when it lands.
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
 * The placeholder a dirtied-tag template may carry, per scope kind: a country toggle fills
 * `{iso2}` with the country's code. A template whose placeholder no scope kind of its key can
 * fill is refused by the schema.
 */
const TAG_PLACEHOLDERS: Readonly<Partial<Record<FlagScopeKind, string>>> = {
  country: "{iso2}",
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
    dirties: z.array(z.string().min(1)),
  })
  .strict()
  .superRefine((flag, context) => {
    for (const tag of flag.dirties) {
      for (const placeholder of tag.match(/\{[a-z0-9]+\}/gu) ?? []) {
        const fillable = flag.scopeKinds.some(
          (kind) => TAG_PLACEHOLDERS[kind] === placeholder,
        );
        if (!fillable) {
          context.addIssue({
            code: "custom",
            message: `${flag.key}: no scope kind of this key fills ${placeholder} in ${tag}`,
            path: ["dirties"],
          });
        }
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
    dirties: ["catalog:{iso2}"],
  },
  {
    key: "checkout.demo_guard",
    scopeKinds: ["global"],
    description:
      "Every checkout is a demo while this is on: no card is charged and no florist is paid (spec 010). Admin only; type the key to confirm.",
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

/** The cache tags a toggle of `key` at `scope` dirties, placeholders filled. */
export function dirtiedTags(key: FlagKey, scope?: FlagScope): string[] {
  return flagDefinition(key).dirties.map((tag) => {
    const placeholder =
      scope === undefined ? undefined : TAG_PLACEHOLDERS[scope.kind];
    if (scope === undefined || placeholder === undefined) return tag;
    return tag.replaceAll(placeholder, scope.ref);
  });
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
