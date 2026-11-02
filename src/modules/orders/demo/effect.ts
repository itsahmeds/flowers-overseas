/**
 * What happens after a florist answers: the `AcceptedOrderEffect` seam (spec 011 §2 "What happens
 * after accept is a seam", §5.2; TASK-214 builds the seam, TASK-215's commands call it).
 *
 *  - `demoOrderEffect`: an order whose `order.mode` is `demo` or `test`, outside `production`.
 *    After an accept it walks the arrows `plan/11` §2 draws after acceptance, `order.captured`
 *    then `order.in_production`, by `system:demo`, so the florist sees "being made"; after a
 *    decline it records the exhausted arrow, `order.no_partner_available`. Every write is
 *    spec 010's `transition`; payloads carry `demo: true`.
 *  - `unconfiguredOrderEffect`: a `live` order with no real effect registered (Phase 0): one
 *    `warn` with the order id and nothing else.
 *  - `acceptedOrderEffectFor(mode, environment)` picks one. Nothing here reads `source`, which
 *    spec 002 keeps for telling seed rows from real ones. Specs 013/015 replace the `test` and
 *    `live` choices without a change to the commands.
 */
import { appEnvironment } from "@/lib/env.schema";
import { logger } from "@/lib/logger";

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
 * The effect for an order of `mode` in `environment`: the demo effect for a `demo` or `test`
 * order outside production, the unconfigured one otherwise (a `live` order, or anything in
 * production, where no demo write may happen).
 */
export function acceptedOrderEffectFor(
  mode: OrderMode,
  environment: string = appEnvironment(process.env),
  effects: {
    readonly demo?: AcceptedOrderEffect;
    readonly unconfigured?: AcceptedOrderEffect;
  } = {},
): AcceptedOrderEffect {
  const demo = effects.demo ?? demoOrderEffect;
  const unconfigured = effects.unconfigured ?? unconfiguredOrderEffect;
  if (environment === "production") return unconfigured;
  return mode === "demo" || mode === "test" ? demo : unconfigured;
}
