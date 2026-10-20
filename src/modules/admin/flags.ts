/**
 * The flags page's commands (spec 012 §2.4, §5.2 `FlagToggleSchema`, §5.4 "Invalidation", §11,
 * AC-14 page half; TASK-220).
 *
 *  - `listFlags` reads `feature_flag` and `feature_flag_scope` in one admin-context transaction and
 *    splits them by the registry (`src/config/feature-flags.ts`): each registered key with one
 *    value per scope it takes (every configured destination for a country-scoped key, `*` for a
 *    global one), resolved as `isEnabled` resolves it; and every key the database holds that the
 *    registry does not name, as an **orphan**, with no control.
 *  - `toggleFlag` sets one registered key at one scope. It refuses, writing nothing: a form that
 *    does not parse; a key the registry does not name (unknown or orphaned); a high-risk key for
 *    anyone without the `admin` role or without the key typed exactly; a scope row newer than the
 *    form (§5.2 "Concurrency"); a registered key with no `feature_flag` row. The write is an
 *    upsert of the `(key, kind, ref)` scope row inside `withAdminContext` with the action
 *    `flags.toggle`, so the database's audit trigger records it (TASK-218). After the commit, the
 *    tags the registry says the toggle dirties (`dirtiedTags`, spec 005's builder) go to
 *    `invalidate()` once: `catalog:{iso2}` for `checkout.open` on a country, nothing for the
 *    demo guard. A toggle that changes nothing writes nothing and invalidates nothing.
 *
 * `isEnabled` reads the new value within its 60 s cache window (TASK-219).
 */
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { featureFlag, featureFlagScope } from "../../../db/schema/ops";
import { COUNTRIES, isCountryIso2 } from "@/config/countries";
import {
  FEATURE_FLAGS,
  type FeatureFlagDefinition,
  type FlagKey,
  type FlagRiskLevel,
  type FlagScope,
  type FlagScopeKind,
  FlagToggleSchema,
  flagDefinition,
  flagScopeKinds,
  isRegisteredFlagKey,
} from "@/config/feature-flags";
import { invalidate } from "@/lib/cache";
import type { DbActor, DbTransaction } from "@/lib/db";
import { dirtiedTags } from "@/lib/flags";
import { type Logger, logger as processLogger } from "@/lib/logger";

import { type AdminRunner, adminRunner } from "./users";

/** The audit actions of the flags page (spec 012 §2.3). */
export const FLAG_ACTIONS = Object.freeze({
  list: "flags.list",
  toggle: "flags.toggle",
} as const);

/** The version a form carries for a scope that has no row yet. */
export const NO_SCOPE_ROW = "none";

/**
 * The toggle form as posted: strings only. `enabled` is the value asked for; `version` is the scope
 * row's `updated_at` when the page was drawn (or `none`); `confirmKey` is the typed key of a
 * high-risk flag.
 */
export const FlagToggleFormSchema = z
  .object({
    key: z.string().max(120),
    scopeKind: z.enum(flagScopeKinds),
    scopeRef: z.string().max(40),
    enabled: z.enum(["on", "off"]),
    version: z.union([
      z.literal(NO_SCOPE_ROW),
      z.iso.datetime({ offset: true }),
    ]),
    confirmKey: z.string().max(120).optional(),
  })
  .strict();
export type FlagToggleForm = z.infer<typeof FlagToggleFormSchema>;

/** Who is toggling: the audit actor and the roles the high-risk rule reads. */
export interface FlagActor extends DbActor {
  readonly roles: readonly string[];
}

export type FlagToggleRefusal =
  | "invalid"
  | "unregistered"
  | "forbidden"
  | "mismatch"
  | "conflict"
  | "not_seeded";

export type FlagToggleResult =
  | {
      readonly ok: true;
      readonly key: FlagKey;
      readonly scope: FlagScope;
      readonly enabled: boolean;
      readonly changed: boolean;
    }
  | { readonly ok: false; readonly reason: FlagToggleRefusal };

/** One value of a registered key: a scope, what `isEnabled` answers for it, and its version. */
export interface FlagValueView {
  readonly scope: FlagScope;
  readonly enabled: boolean;
  /** The scope row's `updated_at` (ISO), or `none` where the value is the flag's default. */
  readonly version: string;
}

export interface RegisteredFlagView {
  readonly key: FlagKey;
  readonly risk: FlagRiskLevel;
  readonly scopeKinds: readonly FlagScopeKind[];
  /** False when the database has no `feature_flag` row for the key: shown, never toggled. */
  readonly seeded: boolean;
  readonly values: readonly FlagValueView[];
}

export interface OrphanFlagView {
  readonly key: string;
  /** The row's `enabled_default`. */
  readonly enabled: boolean;
  /** The kinds of its scope rows, in registry order; `global` when it has none. */
  readonly scopeKinds: readonly FlagScopeKind[];
}

export interface FlagsView {
  readonly registered: readonly RegisteredFlagView[];
  readonly orphans: readonly OrphanFlagView[];
}

interface ScopeRow {
  readonly flagKey: string;
  readonly scope: string;
  readonly scopeRef: string;
  readonly enabled: boolean;
  readonly updatedAt: Date;
}

/** The scopes a registered key is drawn with: every destination, `*`, or the rows that exist. */
function scopesFor(
  flag: FeatureFlagDefinition,
  rows: readonly ScopeRow[],
): FlagScope[] {
  return flag.scopeKinds.flatMap((kind): FlagScope[] => {
    switch (kind) {
      case "country":
        return COUNTRIES.map((country) => ({ kind, ref: country.iso2 }));
      case "global":
        return [{ kind, ref: "*" }];
      default:
        return rows
          .filter((row) => row.flagKey === flag.key && row.scope === kind)
          .map((row) => ({ kind, ref: row.scopeRef }));
    }
  });
}

export async function listFlags(
  actor: DbActor,
  run: AdminRunner = adminRunner,
): Promise<FlagsView> {
  return run({ ...actor, action: FLAG_ACTIONS.list }, async (db) => {
    const flags = await db
      .select({
        key: featureFlag.key,
        enabledDefault: featureFlag.enabledDefault,
      })
      .from(featureFlag)
      .orderBy(featureFlag.key);
    const scopes: ScopeRow[] = await db
      .select({
        flagKey: featureFlagScope.flagKey,
        scope: featureFlagScope.scope,
        scopeRef: featureFlagScope.scopeRef,
        enabled: featureFlagScope.enabled,
        updatedAt: featureFlagScope.updatedAt,
      })
      .from(featureFlagScope);

    const registered = FEATURE_FLAGS.map((flag): RegisteredFlagView => {
      const row = flags.find((entry) => entry.key === flag.key);
      const values = scopesFor(flag, scopes).map((scope): FlagValueView => {
        const scoped = scopes.find(
          (entry) =>
            entry.flagKey === flag.key &&
            entry.scope === scope.kind &&
            entry.scopeRef === scope.ref,
        );
        return {
          scope,
          enabled: scoped?.enabled ?? row?.enabledDefault ?? false,
          version: scoped?.updatedAt.toISOString() ?? NO_SCOPE_ROW,
        };
      });
      return {
        key: flag.key as FlagKey,
        risk: flag.risk,
        scopeKinds: flag.scopeKinds,
        seeded: row !== undefined,
        values,
      };
    });

    const orphans = flags
      .filter((flag) => !isRegisteredFlagKey(flag.key))
      .map((flag): OrphanFlagView => {
        const kinds = flagScopeKinds.filter((kind) =>
          scopes.some((row) => row.flagKey === flag.key && row.scope === kind),
        );
        return {
          key: flag.key,
          enabled: flag.enabledDefault,
          scopeKinds: kinds.length === 0 ? ["global"] : kinds,
        };
      });

    return { registered, orphans };
  });
}

/** What `toggleFlag` calls besides the database; tests replace each. */
export interface FlagToggleDeps {
  readonly run: AdminRunner;
  readonly invalidate: (tags: readonly string[]) => Promise<unknown>;
  readonly log: Logger;
}

const defaultToggleDeps: FlagToggleDeps = {
  run: adminRunner,
  invalidate: (tags) => invalidate(tags),
  log: processLogger,
};

type WriteOutcome =
  | { readonly kind: "saved"; readonly changed: boolean }
  | { readonly kind: "conflict" }
  | { readonly kind: "not_seeded" };

async function writeToggle(
  db: DbTransaction,
  key: FlagKey,
  scope: FlagScope,
  enabled: boolean,
  version: string,
): Promise<WriteOutcome> {
  const [flag] = await db
    .select({ enabledDefault: featureFlag.enabledDefault })
    .from(featureFlag)
    .where(eq(featureFlag.key, key))
    .for("update");
  if (flag === undefined) return { kind: "not_seeded" };

  const [row] = await db
    .select({
      id: featureFlagScope.id,
      enabled: featureFlagScope.enabled,
      updatedAt: featureFlagScope.updatedAt,
    })
    .from(featureFlagScope)
    .where(
      and(
        eq(featureFlagScope.flagKey, key),
        eq(featureFlagScope.scope, scope.kind),
        eq(featureFlagScope.scopeRef, scope.ref),
      ),
    )
    .for("update");
  const current = row?.updatedAt.toISOString() ?? NO_SCOPE_ROW;
  if (current !== version) return { kind: "conflict" };

  const value = row?.enabled ?? flag.enabledDefault;
  if (value === enabled) return { kind: "saved", changed: false };

  if (row === undefined) {
    await db.insert(featureFlagScope).values({
      flagKey: key,
      scope: scope.kind,
      scopeRef: scope.ref,
      enabled,
    });
  } else {
    await db
      .update(featureFlagScope)
      .set({ enabled })
      .where(eq(featureFlagScope.id, row.id));
  }
  return { kind: "saved", changed: true };
}

export async function toggleFlag(
  actor: FlagActor,
  input: unknown,
  overrides: Partial<FlagToggleDeps> = {},
): Promise<FlagToggleResult> {
  const deps = { ...defaultToggleDeps, ...overrides };
  const form = FlagToggleFormSchema.safeParse(input);
  if (!form.success) return { ok: false, reason: "invalid" };
  const { key, scopeKind, scopeRef, enabled, version, confirmKey } = form.data;

  // An unknown key and an orphaned one (in the database, not in the registry) alike.
  if (!isRegisteredFlagKey(key)) return { ok: false, reason: "unregistered" };
  const toggle = FlagToggleSchema.safeParse({
    key,
    scope: { kind: scopeKind, ref: scopeRef },
    enabled: enabled === "on",
  });
  if (!toggle.success) return { ok: false, reason: "invalid" };
  const scope = toggle.data.scope;
  if (scope.kind === "country" && !isCountryIso2(scope.ref)) {
    return { ok: false, reason: "invalid" };
  }

  const flag = flagDefinition(key);
  if (flag.risk === "high") {
    if (!actor.roles.includes("admin"))
      return { ok: false, reason: "forbidden" };
    if (confirmKey !== key) return { ok: false, reason: "mismatch" };
  }

  const outcome = await deps.run(
    {
      ...(actor.userId === undefined ? {} : { userId: actor.userId }),
      ...(actor.requestId === undefined ? {} : { requestId: actor.requestId }),
      action: FLAG_ACTIONS.toggle,
    },
    (db) => writeToggle(db, key, scope, toggle.data.enabled, version),
  );
  if (outcome.kind === "conflict") return { ok: false, reason: "conflict" };
  if (outcome.kind === "not_seeded") return { ok: false, reason: "not_seeded" };

  if (outcome.changed) {
    deps.log.info(
      {
        event: "admin.flag.toggled",
        key,
        scope: `${scope.kind}:${scope.ref}`,
        ...(actor.requestId === undefined
          ? {}
          : { request_id: actor.requestId }),
      },
      "flag toggled",
    );
    const tags = dirtiedTags(key, scope.kind === "global" ? undefined : scope);
    if (tags.length > 0) await deps.invalidate(tags);
  }
  return {
    ok: true,
    key,
    scope,
    enabled: toggle.data.enabled,
    changed: outcome.changed,
  };
}
