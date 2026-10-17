/**
 * The engine's typed refusals (spec 010 §5.2 `orderService`, §14 A1.5, A1.7; TASK-202).
 *
 * A refusal is thrown, so the caller's transaction unwinds, and it is always raised **before**
 * the engine has written anything or touched either setting (A1.2): a caller may catch one and
 * keep using its transaction. The message carries the code, the order id, the event and the
 * actor's class only, never a name, a phone, an address or a payload value (spec 010 §8).
 *
 * The codes the database raises with the same names (`ORDER_TRANSITION_ILLEGAL` from `0008`'s
 * status trigger, `ORDER_INSERT_OUTSIDE_SERVICE`, `ASSIGNMENT_MODE_MISMATCH`) reach a caller as
 * the driver's `PostgresError`, never as this class: the engine checks first, the trigger is the
 * second line.
 */
export const ORDER_ERROR_CODES = [
  /** The actor failed `ActorSchema` (A1.5: checked first). */
  "ORDER_ACTOR_INVALID",
  /** The event is not in the catalogue, or no versioned schema is registered for it yet. */
  "ORDER_EVENT_UNREGISTERED",
  /** The payload failed the event's schema, or names a mode other than the order's. */
  "ORDER_PAYLOAD_INVALID",
  /** `place`'s input failed `PlaceOrderInputSchema`. */
  "ORDER_INPUT_INVALID",
  /** No order has this id (A1.5: after the actor and payload). */
  "ORDER_NOT_FOUND",
  /** No `order_transition` row for `(current status, event)` (AC-22). */
  "ORDER_TRANSITION_ILLEGAL",
  /** The row exists and the actor's class is not in its `allowed_actors` (A1.5, AC-44). */
  "ORDER_ACTOR_NOT_ALLOWED",
  /** `appendEvent` was given an event that has a row in `order_transition` (A1.4, AC-43). */
  "ORDER_EVENT_NEEDS_TRANSITION",
  /** `appendEvent` was given an event only `place` writes (`order.placed`). */
  "ORDER_EVENT_PLACE_ONLY",
  /** `demoRoute` was given a `live` order (§5.2). */
  "DEMO_ROUTE_LIVE_ORDER",
  /** `demoRoute` found no demo florist for the order's country (§2). */
  "DEMO_ROUTE_NO_PARTNER",
  /** `demoRoute`'s named partner is unknown or is not a `demo` florist (§2). */
  "DEMO_ROUTE_PARTNER_INVALID",
] as const;

export type OrderErrorCode = (typeof ORDER_ERROR_CODES)[number];

/** What a log line or a test may read about a refusal. No PII by construction. */
export interface OrderErrorDetail {
  readonly orderId?: string;
  readonly event?: string;
  readonly actorClass?: string;
}

export class OrderEngineError extends Error {
  readonly code: OrderErrorCode;
  readonly detail: OrderErrorDetail;

  constructor(code: OrderErrorCode, detail: OrderErrorDetail = {}) {
    const parts = [
      detail.orderId === undefined ? undefined : `order ${detail.orderId}`,
      detail.event === undefined ? undefined : `event ${detail.event}`,
      detail.actorClass === undefined
        ? undefined
        : `actor class ${detail.actorClass}`,
    ].filter((part) => part !== undefined);
    super(parts.length === 0 ? code : `${code}: ${parts.join(", ")}`);
    this.name = "OrderEngineError";
    this.code = code;
    this.detail = detail;
  }
}

/** True when `error` is the engine's refusal with `code` (or any code, when omitted). */
export function isOrderEngineError(
  error: unknown,
  code?: OrderErrorCode,
): error is OrderEngineError {
  return (
    error instanceof OrderEngineError &&
    (code === undefined || error.code === code)
  );
}
