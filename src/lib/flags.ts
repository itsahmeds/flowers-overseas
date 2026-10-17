/**
 * The feature-flag reader (spec 012 §2.4, §5.2, AC-14 reader half; spec 002 §12; decisions log
 * 2026-10-05 ruling R5; TASK-219).
 *
 * `isEnabled(key, scope?)` answers from `feature_flag` and `feature_flag_scope`, never from env.
 * It reads one snapshot of both tables for the registered keys under a system context, and keeps
 * it in process for 60 s: a toggle in admin is therefore seen by every reader of this process
 * within 60 s, and a page of reads costs one query a minute. Read only; the write path is the
 * flags page (TASK-220).
 *
 * Resolution, for a registered key:
 *  1. the key must be registered (`src/config/feature-flags.ts`), else `UnregisteredFlagError`;
 *  2. the scope must be of a kind the key takes; no scope means the global value and is allowed
 *     only for a key that takes `global`, else `FlagScopeError`;
 *  3. the scope row `(key, kind, ref)` if one exists; for a global read, the `(key, global, *)`
 *     row if one exists;
 *  4. otherwise the flag's `enabled_default`;
 *  5. a registered key with no `feature_flag` row at all is `FlagNotSeededError`: the reader does
 *     not guess, because the safe guess differs per flag (the demo guard's safe value is *on*).
 *
 * A failed load is not cached: the next read tries again. Concurrent reads share one load.
 */
import { inArray } from "drizzle-orm";
import { z } from "zod";

import {
  type FeatureFlagDefinition,
  FEATURE_FLAGS,
  type FlagKey,
  type FlagScope,
  FlagScopeSchema,
  UnregisteredFlagError,
  isRegisteredFlagKey,
} from "@/config/feature-flags";

import { featureFlag, featureFlagScope } from "../../db/schema/ops";
import { type DbTransaction, withSystemContext } from "./db";

export { UnregisteredFlagError };
export type { FlagKey, FlagScope };

/** How long a snapshot is served before the next read reloads it (spec 012 §2.4). */
export const FLAG_CACHE_TTL_MS = 60_000;

/** The rows a snapshot holds, validated at the database boundary. */
export const FlagSnapshotSchema = z.object({
  flags: z.array(
    z.object({ key: z.string(), enabledDefault: z.boolean() }).strict(),
  ),
  scopes: z.array(
    z
      .object({
        flagKey: z.string(),
        scope: z.string(),
        scopeRef: z.string(),
        enabled: z.boolean(),
      })
      .strict(),
  ),
});
export type FlagSnapshot = z.infer<typeof FlagSnapshotSchema>;

/** A scope the key does not take, a malformed scope, or no scope where the key has no global value. */
export class FlagScopeError extends Error {
  constructor(key: string, detail: string) {
    super(`feature flag "${key}": ${detail}`);
    this.name = "FlagScopeError";
  }
}

/** A registered key with no `feature_flag` row: the database was not seeded for it. */
export class FlagNotSeededError extends Error {
  constructor(key: string) {
    super(`feature flag "${key}" is registered but has no feature_flag row`);
    this.name = "FlagNotSeededError";
  }
}

/**
 * The snapshot query: the registered keys' `feature_flag` rows and their scope rows, read in the
 * transaction `db` is bound to. Exported for the integration test, which runs it on a migrated
 * scratch database under the same role and session variables.
 */
export async function loadFlagSnapshot(
  db: DbTransaction,
): Promise<FlagSnapshot> {
  const keys = FEATURE_FLAGS.map((flag) => flag.key);
  const flags = await db
    .select({
      key: featureFlag.key,
      enabledDefault: featureFlag.enabledDefault,
    })
    .from(featureFlag)
    .where(inArray(featureFlag.key, keys));
  const scopes = await db
    .select({
      flagKey: featureFlagScope.flagKey,
      scope: featureFlagScope.scope,
      scopeRef: featureFlagScope.scopeRef,
      enabled: featureFlagScope.enabled,
    })
    .from(featureFlagScope)
    .where(inArray(featureFlagScope.flagKey, keys));
  return FlagSnapshotSchema.parse({ flags, scopes });
}

/** The production loader: one system-context transaction per load. */
function loadFromDatabase(): Promise<FlagSnapshot> {
  return withSystemContext("flags.read", loadFlagSnapshot);
}

export interface FlagReaderOptions {
  /** Reads a fresh snapshot. Default: the database, under a system context. */
  readonly load?: () => Promise<FlagSnapshot>;
  /** The clock, in epoch milliseconds. Default: `Date.now`. */
  readonly now?: () => number;
  /** How long a snapshot is served. Default: `FLAG_CACHE_TTL_MS`. */
  readonly ttlMs?: number;
}

export interface FlagReader {
  isEnabled(key: FlagKey, scope?: FlagScope): Promise<boolean>;
  /** Drops the cached snapshot, so the next read loads. */
  clear(): void;
}

/** Validates the key and the scope against the registry, before anything is read. */
function checkRequest(
  key: string,
  scope: FlagScope | undefined,
): { flag: FeatureFlagDefinition; scope: FlagScope } {
  if (!isRegisteredFlagKey(key)) throw new UnregisteredFlagError(key);
  const flag = FEATURE_FLAGS.find((entry) => entry.key === key);
  if (flag === undefined) throw new UnregisteredFlagError(key);
  if (scope === undefined) {
    if (!flag.scopeKinds.includes("global")) {
      throw new FlagScopeError(
        key,
        `takes a scope of kind ${flag.scopeKinds.join(" or ")}`,
      );
    }
    return { flag, scope: { kind: "global", ref: "*" } };
  }
  const parsed = FlagScopeSchema.safeParse(scope);
  if (!parsed.success) throw new FlagScopeError(key, "malformed scope");
  if (!flag.scopeKinds.includes(parsed.data.kind)) {
    throw new FlagScopeError(
      key,
      `does not take scope kind ${parsed.data.kind}`,
    );
  }
  return { flag, scope: parsed.data };
}

function resolve(
  snapshot: FlagSnapshot,
  key: string,
  scope: FlagScope,
): boolean {
  const row = snapshot.flags.find((flag) => flag.key === key);
  if (row === undefined) throw new FlagNotSeededError(key);
  const scoped = snapshot.scopes.find(
    (entry) =>
      entry.flagKey === key &&
      entry.scope === scope.kind &&
      entry.scopeRef === scope.ref,
  );
  return scoped?.enabled ?? row.enabledDefault;
}

/** A reader with its own cache. Tests build one with a fake loader and a fake clock. */
export function createFlagReader(options: FlagReaderOptions = {}): FlagReader {
  const load = options.load ?? loadFromDatabase;
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? FLAG_CACHE_TTL_MS;
  let cached: { snapshot: FlagSnapshot; loadedAt: number } | undefined;
  let inFlight: Promise<FlagSnapshot> | undefined;

  async function current(): Promise<FlagSnapshot> {
    if (cached !== undefined && now() - cached.loadedAt < ttlMs) {
      return cached.snapshot;
    }
    inFlight ??= (async () => {
      try {
        const snapshot = FlagSnapshotSchema.parse(await load());
        cached = { snapshot, loadedAt: now() };
        return snapshot;
      } finally {
        inFlight = undefined;
      }
    })();
    return inFlight;
  }

  return {
    async isEnabled(key, scope) {
      const request = checkRequest(key, scope);
      return resolve(await current(), request.flag.key, request.scope);
    },
    clear() {
      cached = undefined;
    },
  };
}

/** The process-wide reader. */
const reader = createFlagReader();

/**
 * Whether the registered flag `key` is on, for `scope` (a country for a country-scoped flag; nothing
 * for a global flag). Served from a cache at most 60 s old.
 */
export function isEnabled(key: FlagKey, scope?: FlagScope): Promise<boolean> {
  return reader.isEnabled(key, scope);
}
