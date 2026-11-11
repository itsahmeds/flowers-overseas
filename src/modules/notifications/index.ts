/** Public barrel for `notifications` (email + WhatsApp senders, templates, outbox consumer). Owned by: spec 017. */
export {
  CAPTURE_LIMIT,
  type CapturedMail,
  type CapturingMailer,
  type IdempotencyErrorCode,
  MAX_ATTACHMENTS,
  type MailAttachment,
  MailAttachmentSchema,
  type MailMessage,
  MailMessageSchema,
  type MailTag,
  type Mailer,
  MailerError,
  RESEND_ENDPOINT,
  capturingMailer,
  getMailer,
  idempotencyErrorCodes,
  mailTags,
  mailerFor,
  resendMailer,
} from "./mailer";
export { MailCaptureQuerySchema, mailCaptureResponse } from "./mail-capture";
export {
  AFTER_DELIVERY_STATUSES,
  NOTIFICATION_AUDIENCES,
  NOTIFICATION_JOBS,
  NOTIFICATION_RULES,
  NOTIFICATION_TEMPLATE_KEYS,
  WITHDRAWAL_EVENTS,
  notificationsFor,
} from "./rules";
export type {
  FromCondition,
  NotificationAudience,
  NotificationJob,
  NotificationMode,
  NotificationRule,
  NotificationTemplateKey,
  NotificationTrigger,
} from "./rules";
export {
  NOTIFICATIONS_FLAG,
  NotificationJobInputSchema,
  NotificationRecipientMissing,
  NotificationsHeld,
  OpsJobNotificationInputSchema,
  PayoutStatementNotificationInputSchema,
  ReviewInviteNotificationInputSchema,
  deliverNotifications,
  notificationsOutboxHandler,
  registerNotificationsOutbox,
  sendJobNotifications,
  sendOpsJobNotification,
  sendPayoutStatementNotification,
  sendReviewInviteNotification,
} from "./pipeline";
export type {
  NotificationDeps,
  NotificationJobInput,
  NotificationRequest,
  OpsJobNotificationInput,
  PayoutStatementNotificationInput,
  ReviewInviteNotificationInput,
} from "./pipeline";
export {
  RESEND_CAUSES,
  RESEND_CONDITIONS,
  RESEND_LIMIT,
  RESEND_RULES,
  RESEND_WINDOW_HOURS,
  ResendNotificationInputSchema,
  originalContext,
  pgBossResendScheduler,
  resendDecision,
  resendNotification,
  resendableDeliveries,
  runResendNotificationJob,
} from "./resend";
export type {
  OriginalContext,
  ResendAssignmentFacts,
  ResendCause,
  ResendCondition,
  ResendFacts,
  ResendJobDeps,
  ResendJobOutcome,
  ResendListOptions,
  ResendNotificationDeps,
  ResendNotificationInput,
  ResendNotificationResult,
  ResendRule,
  ResendScheduler,
  ResendVerdict,
  ResendableDelivery,
} from "./resend";
export {
  NotificationTemplateMissing,
  notificationTemplate,
  registerNotificationTemplate,
} from "./templates";
export type {
  NotificationRenderInput,
  NotificationRenderer,
  RenderedNotification,
} from "./templates";
export {
  FINAL_DELIVERY_STATUSES,
  FLORIST_BOUNCE_ALERT,
  RESEND_IGNORED_EVENTS,
  RESEND_STATUS_EVENTS,
  RESEND_STATUS_RANK,
  RESEND_WEBHOOK_MAX_ATTEMPTS,
  RESEND_WEBHOOK_MAX_BYTES,
  RESEND_WEBHOOK_TOLERANCE_SECONDS,
  ResendEnvelopeSchema,
  ResendStatusEventSchema,
  ResendWebhookFailed,
  ingestResendWebhook,
  precedenceOf,
  processResendWebhook,
  runResendWebhookJob,
  svixSignature,
  verifySvixSignature,
} from "./resend-webhook";
export type {
  DeliveryStatus,
  ResendIgnoreReason,
  ResendIngestDeps,
  ResendProcessDeps,
  ResendProcessOutcome,
  ResendRejection,
  ResendTransaction,
  SvixHeaders,
} from "./resend-webhook";
// Spec 034's R1, the basket reminder (§5.2 "Rendering contract of R1"; TASK-450): its types only.
// The renderer and its schemas are exported by `./emails` with the other email templates, never by
// this barrel, which pages reach (TASK-521).
export type {
  BasketReminderEmailProps,
  ReminderEmailLine,
  RenderedBasketReminderEmail,
} from "./emails/basket-reminder";
