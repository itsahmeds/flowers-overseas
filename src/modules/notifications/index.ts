/** Public barrel for `notifications` (email + WhatsApp senders, templates, outbox consumer). Owned by: spec 017. */
export {
  CAPTURE_LIMIT,
  type CapturedMail,
  type CapturingMailer,
  type IdempotencyErrorCode,
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
  deliverNotifications,
  notificationsOutboxHandler,
  registerNotificationsOutbox,
  sendJobNotifications,
  sendOpsJobNotification,
} from "./pipeline";
export type {
  NotificationDeps,
  NotificationJobInput,
  NotificationRequest,
  OpsJobNotificationInput,
} from "./pipeline";
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
