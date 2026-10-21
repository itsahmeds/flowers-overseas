/** Public barrel for `orders` (state machine, order service, assignment/routing rules). Owned by: spec 015 (+ spec 016 routing). */
// The shared engine and its read projections are spec 010's (ruling R1, TASK-202); specs 011,
// 012, 015 and 016 extend them.
export * from "./service";
// Spec 013 §5.2 (TASK-254): this module's outbox routes and the dispatcher that delivers them.
export {
  OUTBOX_TARGET_NAMES,
  PAYMENT_OUTBOX_ROUTES,
  PAYMENTS_TARGET,
  paymentOutboxTargets,
  ROUTING_TARGET,
} from "./outbox/routes";
export type { ModeOutboxRoutes, OutboxTargetName } from "./outbox/routes";
export {
  dispatchOutbox,
  isOutboxHandlerRegistered,
  notConfiguredHandler,
  OUTBOX_BATCH_SIZE,
  OUTBOX_MAX_ATTEMPTS,
  OUTBOX_RETRY_BASE_SECONDS,
  OUTBOX_RETRY_CAP_SECONDS,
  OutboxTargetNotConfigured,
  outboxHandlers,
  registerOutboxHandler,
} from "./outbox/dispatcher";
export type {
  AlertRaiser,
  DeliveryTransaction,
  DispatchCounts,
  DispatchOptions,
  HandlerRegistry,
  OutboxDeliveryEvent,
  OutboxHandler,
  OutboxHandlerContext,
} from "./outbox/dispatcher";
export {
  AdminOrderListItemSchema,
  BUYER_STATUSES,
  listOrdersForAdmin,
  listOrdersForPartner,
  ORDER_QUEUE_PAGE_SIZE,
  OrderListItemSchema,
  OrderQueueFilterSchema,
  selectAdminOrders,
  selectPartnerOrders,
} from "./queries";
export type {
  AdminOrderListItem,
  ListOptions,
  OrderListItem,
  OrderQueueFilter,
} from "./queries";
