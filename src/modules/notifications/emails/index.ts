/**
 * The email layout, its parts, the florist templates V1 to V5 and the founder's A1 and W (spec
 * 016 §5.3; TASK-332).
 *
 * Deliberately **not** re-exported by the module barrel: pages import the barrel (through the
 * `orders` outbox routes), and the email copy must reach no page (`src/modules/i18n/review-scope.ts`
 * counts it as email-only). The job worker, `src/jobs/handlers.ts`, imports this entry directly
 * and registers the templates.
 */
export {
  type Attributes,
  type Child,
  el,
  escapeHtml,
  fragment,
  type SafeHtml,
  text,
} from "./html";
export {
  type Block,
  type EmailAudience,
  type EmailDocumentInput,
  type EmailFrame,
  type Fact,
  type FooterLine,
  answerBy,
  attemptsTable,
  box,
  button,
  code,
  emailDocument,
  eyebrow,
  facts,
  heading,
  note,
  numeric,
  paragraph,
  pasteBlock,
  payoutRow,
  productName,
  strong,
} from "./layout";
export { EMAIL_COLOURS, EMAIL_FONTS, EMAIL_MEASURES } from "./theme";
export {
  type EmailTranslator,
  buyerFooterText,
  buyerFrame,
  emailTranslator,
  floristFooterText,
  floristFrame,
} from "./copy";
export {
  FLORIST_TEMPLATES,
  type FloristMessageFacts,
  FloristMessageFactsSchema,
  type FloristRenderContext,
  type FloristTemplate,
  floristDeadline,
  floristLanguageOf,
  renderFloristEmail,
  whatsappFloristText,
} from "./florist";
export { FloristFactsMissing, loadFloristMessageFacts } from "./facts";
export {
  registerFloristEmailTemplates,
  renderFloristNotification,
} from "./register";
export {
  type AlertOffer,
  type NoPartnerAlertFacts,
  NoPartnerAlertFactsSchema,
  type OpsCopy,
  type PrepaidPayoutFacts,
  PrepaidPayoutFactsSchema,
  type WhatsappCopyContext,
  loadNoPartnerAlertFacts,
  loadPrepaidPayoutFacts,
  registerOpsEmailTemplates,
  renderNoPartnerAlert,
  renderPrepaidPayoutReady,
  renderWhatsappCopy,
} from "./ops";
// Spec 018 §5.2 (TASK-339): T16, the tracking lookup's answer.
export {
  type RenderedTrackingLinkEmail,
  type TrackingLinkEmailInput,
  renderTrackingLinkEmail,
} from "./tracking-link";
