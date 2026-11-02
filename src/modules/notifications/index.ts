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
