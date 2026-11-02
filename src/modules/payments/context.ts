/**
 * What every payments write shares (spec 013 §5.2; TASK-257, TASK-258): the actor money rows are
 * written by, and the shape of the transaction a lifecycle step runs in. Its own file so the
 * lifecycle, the refund path and the production start import it without importing each other.
 */
import type { OrderExecutor } from "@/modules/orders";

/** Every lifecycle and refund write is by this actor (A6.2: money rows are `system` only). */
export const PAYMENTS_ACTOR = "system:payments";

/** Runs `fn` in one transaction and commits it (or rolls it back on a throw). */
export type PaymentTransaction = <T>(
  fn: (executor: OrderExecutor) => Promise<T>,
) => Promise<T>;
