/**
 * The shared order engine (ADR-0009; spec 010 §2 "Placing the order", §5.2; ruling R1; TASK-202).
 *
 * The only code allowed to create an order or change its status (lint: `fo/no-direct-order-status-
 * write` exempts this folder alone; database: `0008`'s triggers). Specs 011 and 012 call it;
 * specs 015 and 020 extend it, never replace it.
 */
import { appendEvent } from "./append-event";
import { demoRoute } from "./demo-router";
import { place } from "./place";
import { placePurchase } from "./purchase";
import { transition } from "./transition";

export const orderService = {
  place,
  placePurchase,
  transition,
  appendEvent,
  demoRoute,
};

export {
  ActorSchema,
  ACTOR_CLASSES,
  actorClass,
  BUYER_ACTOR,
  DEMO_GUARD_ACTOR,
  DEMO_ROUTER_ACTOR,
} from "./actor";
export type { Actor, ActorClass } from "./actor";
export { appendEvent } from "./append-event";
export type { AppendEventResult } from "./append-event";
export { ANSWER_WINDOW_MINUTES, demoRoute } from "./demo-router";
export type { DemoRouteOptions, DemoRouteResult } from "./demo-router";
export {
  isOrderEngineError,
  ORDER_ERROR_CODES,
  OrderEngineError,
} from "./errors";
export type { OrderErrorCode } from "./errors";
export {
  AssignmentOfferedV1,
  eventSchema,
  ORDER_EVENT_TYPES,
  ORDER_MODES,
  OrderAuthorisedV1,
  OrderEventTypeSchema,
  OrderModeSchema,
  OrderPlacedV1,
  OrderRoutedV1,
  PLACE_ONLY_EVENTS,
  registerEventSchema,
  registeredEventTypes,
  STATUS_PRESERVING_ACTORS,
  STATUS_PRESERVING_EVENTS,
  TRANSITION_EVENTS,
} from "./events";
export type {
  EventPayloadSchema,
  OrderEventType,
  OrderMode,
  TransitionEventType,
} from "./events";
export type {
  EngineConnection,
  OrderExecutor,
  RawRow,
  SqlRunner,
} from "./executor";
// Spec 013 (TASK-350): the payments read helpers run in the caller's transaction or their own.
export { withExecutor } from "./executor";
export {
  OUTBOX_AUDIENCES,
  OUTBOX_ROUTES,
  outboxTargets,
  OutboxTargetSchema,
  resolveOutboxTargets,
  withoutPeopleUnlessLive,
} from "./outbox";
export type {
  OutboxRoutes,
  OutboxTarget,
  OutboxTargetResolver,
} from "./outbox";
export {
  BuyerSnapshotSchema,
  ORDER_REFERENCE_ATTEMPTS,
  OrderLineInputSchema,
  place,
  PlaceOrderInputSchema,
  RecipientSnapshotSchema,
  VatSplitSchema,
} from "./place";
export type { PlaceOptions, PlaceOrderInput, PlaceResult } from "./place";
export {
  PlacePurchaseInputSchema,
  placePurchase,
  placePurchaseWith,
} from "./purchase";
export type {
  PlacePurchaseInput,
  PlacePurchaseOptions,
  PlacePurchaseResult,
} from "./purchase";
export { ORDER_REFERENCE_PATTERN, orderReference } from "./reference";
export { transition } from "./transition";
export type { EngineOptions, TransitionResult } from "./transition";
