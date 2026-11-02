// Spec 011 §2 "The demo", §5.2 (TASK-214): the test order and the after-answer seam.
export {
  DEMO_ACTOR,
  DEMO_ORDER_REFUSALS,
  DemoOrderInputSchema,
  DemoOrderRefused,
  demoRefusedIn,
  placeDemoOrder,
} from "./place-demo-order";
export type {
  DemoEngine,
  DemoOrderInput,
  DemoOrderRefusal,
  DemoOrderResult,
  PlaceDemoOrderOptions,
} from "./place-demo-order";
export {
  acceptedOrderEffectFor,
  createDemoOrderEffect,
  DEMO_EFFECT_ACTOR,
  demoOrderEffect,
  unconfiguredOrderEffect,
} from "./effect";
export type {
  AcceptedOrderEffect,
  DemoEffectDeps,
  EffectContext,
} from "./effect";
