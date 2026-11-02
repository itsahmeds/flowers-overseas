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
