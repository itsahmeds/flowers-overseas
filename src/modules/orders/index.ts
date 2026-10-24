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
  AdminOrderAssignmentSchema,
  AdminOrderDetailSchema,
  AdminOrderEventSchema,
  AdminOrderLineSchema,
  AdminOrderListItemSchema,
  AdminOrderPaymentSchema,
  BUYER_STATUSES,
  countOrdersForAdmin,
  listOrdersForAdmin,
  listOrdersForPartner,
  ORDER_QUEUE_PAGE_SIZE,
  ORDER_READ_ACTIONS,
  orderDetail,
  OrderListItemSchema,
  orderQueueFilterOptions,
  OrderQueueFilterOptionsSchema,
  OrderQueueFilterSchema,
  orderQueueHead,
  OrderQueueHeadSchema,
  orderQueueHeadTag,
  selectAdminOrderCount,
  selectAdminOrders,
  selectOrderDetail,
  selectOrderQueueFilterOptions,
  selectOrderQueueHead,
  selectPartnerOrders,
} from "./queries";
export type {
  AdminOrderAssignment,
  AdminOrderDetail,
  AdminOrderEvent,
  AdminOrderLine,
  AdminOrderListItem,
  AdminOrderPayment,
  AdminReadOptions,
  ListOptions,
  OrderDetailOptions,
  OrderListItem,
  OrderQueueFilter,
  OrderQueueFilterOptions,
  OrderQueueHead,
} from "./queries";
// Spec 018 §5.2 (TASK-337): the tracking token, its resolver and its rotation.
export {
  RotationChannelSchema,
  rotateTrackingToken,
  tracking,
  TRACKING_FAILURE,
  TRACKING_LINK_DAYS,
  TrackingToken,
} from "./tracking";
export type {
  RotationChannel,
  TrackingOptions,
  TrackingResolution,
} from "./tracking";
