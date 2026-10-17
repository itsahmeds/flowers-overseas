/** Public barrel for `notifications` (email + WhatsApp senders, templates, outbox consumer). Owned by: spec 017; the `Mailer` seam by spec 012. */
export {
  CAPTURE_LIMIT,
  type CapturedMail,
  type CapturingMailer,
  type MailMessage,
  MailMessageSchema,
  type MailTag,
  type Mailer,
  MailerError,
  RESEND_ENDPOINT,
  capturingMailer,
  getMailer,
  mailTags,
  mailerFor,
  resendMailer,
} from "./mailer";
export { MailCaptureQuerySchema, mailCaptureResponse } from "./mail-capture";
