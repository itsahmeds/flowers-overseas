/**
 * What the risk module's database steps share (spec 021 §5.2; TASK-493): the transaction shape, a
 * clock, the flag reader and the hash key, each injectable for the suites. Nothing is read at
 * import: the env key and the flag reader are resolved on each use.
 */
import { riskHashKey } from "@/lib/env.risk";
import { type OrderExecutor, withExecutor } from "@/modules/orders";

/** Runs `fn` in one transaction and commits it (or rolls it back on a throw). */
export type RiskTransaction = <T>(
  fn: (executor: OrderExecutor) => Promise<T>,
) => Promise<T>;

/** The actor every automatic risk write is by (§5.2). */
export const RISK_ACTOR = "system:risk";

export interface RiskDeps {
  readonly transaction?: RiskTransaction;
  readonly now?: () => Date;
  /** Whether a registered flag is on (`isEnabled` by default; an unseeded flag reads off). */
  readonly flag?: (key: string) => Promise<boolean>;
  /** The 32-byte hash key, or `null` when it is not configured (`riskHashKey()` by default). */
  readonly hashKey?: () => Uint8Array | null;
}

export interface ResolvedRiskDeps {
  readonly transaction: RiskTransaction;
  readonly now: () => Date;
  readonly flag: (key: string) => Promise<boolean>;
  readonly hashKey: () => Uint8Array | null;
}

const systemTransaction: RiskTransaction = (fn) =>
  withExecutor(undefined, "risk", fn);

async function defaultFlag(key: string): Promise<boolean> {
  const { isEnabled } = await import("@/lib/flags");
  try {
    return await isEnabled(key as Parameters<typeof isEnabled>[0]);
  } catch {
    return false;
  }
}

/** Reads `RISK_HASH_KEY` from the process env at call time (never at import). */
function defaultHashKey(): Uint8Array | null {
  const resolved = riskHashKey(process.env);
  return resolved.configured ? resolved.key : null;
}

export function resolveRiskDeps(deps: RiskDeps = {}): ResolvedRiskDeps {
  return {
    transaction: deps.transaction ?? systemTransaction,
    now: deps.now ?? (() => new Date()),
    flag: deps.flag ?? defaultFlag,
    hashKey: deps.hashKey ?? defaultHashKey,
  };
}

/** What an admin read or decision runs under (`withAdminContext`). */
export interface AdminRiskContext {
  readonly userId?: string;
  readonly requestId?: string;
  /** The audit action: `risk.review.<decision>` for a decision, `risk.read` for a read. */
  readonly action: string;
}

/**
 * An admin-context transaction for the review pages (TASK-494): `withAdminContext` with `context`,
 * its handle wrapped for the engine. `@/lib/db` loads on the first call, never at import.
 */
export function adminRiskTransaction(
  context: AdminRiskContext,
): RiskTransaction {
  return async (fn) => {
    const { withAdminContext } = await import("@/lib/db");
    return withAdminContext(
      {
        action: context.action,
        ...(context.userId === undefined ? {} : { userId: context.userId }),
        ...(context.requestId === undefined
          ? {}
          : { requestId: context.requestId }),
      },
      (db) => withExecutor({ db }, "risk.admin", fn),
    );
  };
}
