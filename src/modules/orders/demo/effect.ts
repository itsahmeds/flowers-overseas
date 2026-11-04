/**
 * What happens after a florist answers: the `AcceptedOrderEffect` seam (spec 011 §2 "What happens
 * after accept is a seam", §5.2; TASK-214 builds the seam, TASK-215's commands call it).
 *
 *  - `demoOrderEffect`: an order whose `order.mode` is `demo`, outside `production` (spec 013
 *    §12: `demoOrderEffect` keeps `demo` orders only). After an accept it walks the arrows `plan/11` §2 draws after acceptance, `order.captured`
 *    then `order.in_production`, by `system:demo`, so the florist sees "being made"; after a
 *    decline it records the exhausted arrow, `order.no_partner_available`. Every write is
 *    spec 010's `transition`; payloads carry `demo: true`.
 *  - `unconfiguredOrderEffect`: a `demo` order in `production`, where no demo write may happen:
 *    one `warn` with the order id and nothing else.
 *  - **Spec 013's `paymentAcceptedOrderEffect`** (its §5.2 and §12 request on spec 011;
 *    TASK-259): the accept half for a `test` or `live` order, in every environment. It writes
 *    nothing; it asks the outbox dispatcher to deliver the order's `assignment.accepted` row now,
 *    whose `payments` handler writes row 14 (and row 16 past the production-start instant).
 *  - `acceptedOrderEffectFor(mode, environment)` picks one. Nothing here reads `source`, which
 *    spec 002 keeps for telling seed rows from real ones.
 *  - **Spec 016's `afterDecline`** (its §12 request on spec 011; TASK-328): for a `test` or
 *    `live` order the decline half is always the router's (`routingDeclineEffect`: the next
 *    offer through `order.route`), in every environment; the accept half stays what the mode
 *    had. So a `test` decline never records the demo's `order.no_partner_available`, and the
 *    demo effect serves `demo` orders' declines only.
 */
import { appEnvironment } from "@/lib/env.schema";
import { logger } from "@/lib/logger";
// Not the reverse: `payments` imports the `orders` barrel, which never loads `./demo`.
import {
  paymentAcceptedOrderEffect,
  type PaymentAcceptEffect,
} from "@/modules/payments";

import {
  routingDeclineEffect,
  type RoutingDeclineEffect,
} from "../routing/effect";
import { ActorSchema } from "../service/actor";
import type { OrderMode } from "../service/events";
import type { OrderExecutor } from "../service/executor";
import { transition } from "../service/transition";

/** The actor of every demo write (§5.2: `system:demo`). */
export const DEMO_EFFECT_ACTOR = ActorSchema.parse("system:demo");

export interface EffectContext {
  readonly orderId: string;
  readonly mode: OrderMode;
  /** The command's transaction: the effect's writes commit with the answer, or not at all. */
  readonly executor?: OrderExecutor;
}

export interface AcceptedOrderEffect {
  afterAccept(context: EffectContext): Promise<void>;
  afterDecline(context: EffectContext): Promise<void>;
}

export interface DemoEffectDeps {
  readonly transition?: typeof transition;
}

/** The demo effect over `deps.transition` (spec 010's `transition` by default). */
export function createDemoOrderEffect(
  deps: DemoEffectDeps = {},
): AcceptedOrderEffect {
  const move = deps.transition ?? transition;
  const options = (context: EffectContext) =>
    context.executor === undefined ? {} : { executor: context.executor };
  return {
    async afterAccept(context) {
      const payload = { mode: context.mode, demo: true as const };
      await move(
        context.orderId,
        "order.captured",
        DEMO_EFFECT_ACTOR,
        payload,
        options(context),
      );
      await move(
        context.orderId,
        "order.in_production",
        DEMO_EFFECT_ACTOR,
        payload,
        options(context),
      );
    },
    async afterDecline(context) {
      await move(
        context.orderId,
        "order.no_partner_available",
        DEMO_EFFECT_ACTOR,
        { mode: context.mode, demo: true as const },
        options(context),
      );
    },
  };
}

export const demoOrderEffect: AcceptedOrderEffect = createDemoOrderEffect();

/** A `live` order with no real effect registered: say so, change nothing. */
export const unconfiguredOrderEffect: AcceptedOrderEffect = {
  afterAccept(context) {
    logger.warn(
      { order_id: context.orderId, mode: context.mode, step: "accept" },
      "orders.effect_unconfigured",
    );
    return Promise.resolve();
  },
  afterDecline(context) {
    logger.warn(
      { order_id: context.orderId, mode: context.mode, step: "decline" },
      "orders.effect_unconfigured",
    );
    return Promise.resolve();
  },
};

/**
 * The effect for an order of `mode` in `environment`. A `demo` order: the demo effect outside
 * production, the unconfigured one in it, both halves. A `test` or `live` order: spec 013's
 * `paymentAcceptedOrderEffect` for the accept half (never the demo effect, spec 013 AC-13) and
 * spec 016's router for the decline half, in every environment.
 */
export function acceptedOrderEffectFor(
  mode: OrderMode,
  environment: string = appEnvironment(process.env),
  effects: {
    readonly demo?: AcceptedOrderEffect;
    readonly unconfigured?: AcceptedOrderEffect;
    readonly routed?: RoutingDeclineEffect;
    readonly paid?: PaymentAcceptEffect;
  } = {},
): AcceptedOrderEffect {
  if (mode === "demo") {
    return environment !== "production"
      ? (effects.demo ?? demoOrderEffect)
      : (effects.unconfigured ?? unconfiguredOrderEffect);
  }
  const paid = effects.paid ?? paymentAcceptedOrderEffect;
  const routed = effects.routed ?? routingDeclineEffect;
  return {
    afterAccept: (context) => paid.afterAccept(context),
    afterDecline: (context) => routed.afterDecline(context),
  };
}
