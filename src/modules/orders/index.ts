/** Public barrel for `orders` (state machine, order service, assignment/routing rules). Owned by: spec 015 (+ spec 016 routing). */
// The shared engine and its read projections are spec 010's (ruling R1, TASK-202); specs 011,
// 012, 015 and 016 extend them.
export * from "./service";
// Spec 013 §5.2 (TASK-254): this module's outbox routes and the dispatcher that delivers them.
export {
  ANALYTICS_OUTBOX_ROUTES,
  ANALYTICS_TARGET,
  analyticsOutboxTargets,
  INVOICE_OUTBOX_ROUTES,
  INVOICES_TARGET,
  invoiceOutboxTargets,
  NOTIFICATION_OUTBOX_ROUTES,
  NOTIFICATIONS_BUYER_TARGET,
  NOTIFICATIONS_TARGET,
  notificationOutboxTargets,
  OUTBOX_TARGET_NAMES,
  PAYMENT_OUTBOX_ROUTES,
  PAYMENTS_TARGET,
  paymentOutboxTargets,
  PAYOUT_OUTBOX_ROUTES,
  PAYOUTS_TARGET,
  payoutOutboxTargets,
  ROUTING_OUTBOX_ROUTES,
  ROUTING_TARGET,
  routingOutboxTargets,
} from "./outbox/routes";
export type { ModeOutboxRoutes, OutboxTargetName } from "./outbox/routes";
export {
  dispatchOutbox,
  heldOutboxTargets,
  isOutboxHandlerRegistered,
  notConfiguredHandler,
  OUTBOX_BATCH_SIZE,
  OUTBOX_MAX_ATTEMPTS,
  OUTBOX_RETRY_BASE_SECONDS,
  OUTBOX_RETRY_CAP_SECONDS,
  OutboxTargetNotConfigured,
  outboxHandlers,
  outboxRetryDueAt,
  registerOutboxHandler,
  registerOutboxHold,
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
// Spec 016 §5.2 (TASK-327): the routing rules, pure.
export * from "./routing";
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
// Spec 018 §5.2 (TASK-339): the tracking lookup (`/{locale}/track`), its limit and T16's facts.
export {
  lookupTracking,
  TRACKING_LOOKUP_LIMIT,
  TRACKING_LOOKUP_SCOPE,
  TrackingLookupInputSchema,
} from "./tracking-lookup";
export type {
  TrackingLinkMail,
  TrackingLookupDeps,
  TrackingLookupInput,
  TrackingLookupOutcome,
} from "./tracking-lookup";
// Spec 047 §5.2 (TASK-445): what the buyer paid per line, price minus its share of a discount.
export { linePaidAmounts } from "./line-paid-amounts";
export type { LinePaidAmount } from "./line-paid-amounts";
// Spec 018 §5.2 (TASK-339): the buyer's refund lines' shape and their one formatter.
// `buyerRefundLines` itself reads spec 013's `succeededRefunds`, so it is imported from
// `./buyer-refund-lines` directly and stays out of this barrel (see that file).
export {
  BuyerRefundLineSchema,
  refundLineValues,
  toBuyerRefundLines,
} from "./refund-lines";
export type {
  BuyerRefundLine,
  RefundLinesSource,
  SucceededRefundRow,
} from "./refund-lines";
// Spec 018 §5.2 (TASK-338): the buyer's tracking view model and its photo's location.
export {
  BUYER_STEPS,
  BuyerStepSchema,
  buyerStep,
  foldTimeline,
  getTrackingView,
  PhotoStateSchema,
  TIMELINE_STEPS,
  TimelineSchema,
  TimelineStepSchema,
  TRACKING_VIEW_KEYS,
  trackingPhotoLocation,
  TrackingViewSchema,
  CancelledBySchema,
  cancelledByOf,
} from "./tracking-view";
export type {
  CancelledBy,
  BuyerStep,
  PhotoState,
  ProjectedEvent,
  Timeline,
  TimelineStep,
  TimelineStepKey,
  TrackingView,
  TrackingViewOptions,
} from "./tracking-view";
// Spec 018 §5.2 (TASK-340): the post-purchase block spec 013's confirmation states mount. The
// buyer's cancel (`cancelOrderAsBuyer`) calls spec 013's `cancelOrder`, so it is imported from
// `./buyer-cancel` directly and stays out of this barrel, as `buyerRefundLines` does.
export {
  ConfirmationBlockSchema,
  getConfirmationBlock,
  isCancellable,
  maskEmail,
  POST_PURCHASE_STEPS,
  PostPurchaseStepKeySchema,
  PostPurchaseStepSchema,
  postPurchaseSteps,
} from "./confirmation-block";
export type {
  ConfirmationBlock,
  ConfirmationBlockOptions,
  PostPurchaseStep,
  PostPurchaseStepKey,
} from "./confirmation-block";
// Spec 011 §5.2 (TASK-214): the florist inbox's read models under partner context. The test
// order and the after-answer seam live in `./demo` and are imported from there by the florist
// routes only: `placeDemoOrder` reads spec 010's sample people (`src/config/checkout-samples.ts`),
// and re-exporting it here would put that scoped config in the import graph of every page that
// imports this barrel (spec 003 §14 A17, `i18n:check`).
export * from "./florist";
