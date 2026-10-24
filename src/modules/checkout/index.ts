/** Public barrel for `checkout` (the checkout: mode, steps, schemas, address forms, phones). Owned by: spec 010. */

/**
 * Checkout's import path (spec 010; TASK-200).
 *
 * TASK-200 ships the database-free core: the one decision of what a checkout may do
 * (`checkoutMode`, `legalReadiness`, `checkoutEntryFor`), the boundary schemas of the start route
 * and the three steps, the recipient form model, phone parsing and the checkout's one currency.
 * TASK-203 adds drafts (`draft.ts`), the `fo_checkout` cookie, pricing over the quote
 * (`pricing.ts`), the start route's contract (`start.ts`) and the step actions (`steps.ts`,
 * `actions.ts`); placement and the payment-step seam arrive with TASK-205, behind this same barrel.
 *
 * `CHECKOUT_FLAG_KEYS` and `stripeKeyKind()` are deliberately **not** exported (spec 010 AC-1,
 * `/break 201` hole 1): they are the inputs of the mode decision, and a file that could import
 * them could decide a mode outside `mode.ts`. TASK-203 wires the flag and key reads inside
 * `mode.ts`; `tests/unit/checkout-mode.test.ts` fails on any other file that names them.
 */
export {
  CheckoutModeInputsSchema,
  PHASE_0_LEGAL_SOURCES,
  addressFormatKinds,
  checkoutEntries,
  checkoutEntryFor,
  checkoutMode,
  checkoutModes,
  legalDocumentKinds,
  legalReadiness,
  legalReadinessReport,
  legalReadinessTerms,
  legalRegimeFor,
  legalRegimes,
  stripeKeyKinds,
  type AddressFormatKind,
  type CheckoutDeployment,
  type CheckoutEntry,
  type CheckoutMode,
  type CheckoutModeInputs,
  type LegalDocumentKind,
  type LegalDocumentStatus,
  type LegalReadinessSources,
  type LegalReadinessTerm,
  type LegalRegime,
  type StripeKeyKind,
} from "./mode";
export {
  CHECKOUT_ERROR_KEYS,
  CardAndBuyerStepSchema,
  CardStepSchema,
  CheckoutStartSchema,
  LinePositionSchema,
  PHONE_NON_LOCAL_KEY,
  RecipientStepSchema,
  ReviewStepSchema,
  type CheckoutStart,
  type RecipientStep,
  type ReviewStep,
} from "./schemas";
export {
  addressFormModel,
  type AddressFieldModel,
  type AddressFormModel,
  type AddressFormStatus,
  type AddressInputMode,
} from "./address";
export {
  parseBuyerPhone,
  parseRecipientPhone,
  phoneRejections,
  type ParsedPhone,
  type PhoneRejection,
  type PhoneResult,
} from "./phone";
export { checkoutCurrency } from "./currency";

// TASK-203: drafts, the start route, the step actions, quote issue and verification; TASK-348:
// the basket (lines, append, remove, the line actions, `fo_basket`, the re-derivation).
export {
  type CheckoutFlagReader,
  type CheckoutModeRequest,
  currentCheckoutMode,
} from "./mode";
export {
  BASKET_COOKIE_ATTRIBUTES,
  BASKET_COOKIE_NAME,
  BASKET_COOKIE_VALUE_PATTERN,
  CHECKOUT_COOKIE_ATTRIBUTES,
  CHECKOUT_COOKIE_MAX_AGE_SECONDS,
  CHECKOUT_COOKIE_NAME,
  basketCookieHeader,
  checkoutCookieHeader,
  draftTokenFromCookieHeader,
  draftTokenHash,
  isDraftToken,
} from "./cookie";
export {
  CreateDraftInputSchema,
  DraftBuyerSchema,
  DraftCardSchema,
  DraftPatchSchema,
  DraftRecipientSchema,
  LinePatchSchema,
  NewLineSchema,
  appendLine,
  clearPendingNotice,
  createDraft,
  draftExpiryAt,
  draftModes,
  expireDrafts,
  loadDraft,
  pendingNotices,
  removeLine,
  saveDraft,
  saveLine,
  withDraftConnection,
  type AppendResult,
  type BasketLine,
  type CreateDraftInput,
  type Draft,
  type DraftBuyer,
  type DraftCard,
  type DraftConnection,
  type DraftLookup,
  type DraftMode,
  type DraftPatch,
  type DraftRecipient,
  type LinePatch,
  type LineStepsCompleted,
  type NewLine,
  type PendingNotice,
} from "./draft";
export {
  ADDON_TIER_PREFIX,
  BasketCurrencyUnavailable,
  deriveLineQuote,
  deriveQuote,
  linePriceChange,
  lineTotals,
  pricingLocalesFor,
  selectionOf,
  verifyLineQuote,
  type DraftLine,
  type DraftTotals,
  type LineSelection,
  type NoticeAmount,
  type PriceNotice,
  type QuoteCheck,
  type QuoteSelection,
} from "./pricing";
export {
  assessBasket,
  assessLine,
  unavailableReasons,
  type AssessOptions,
  type AssessedLine,
  type BasketAssessment,
  type LineAvailability,
  type UnavailableReason,
} from "./basket";
export { lineDateStatus, nextDeliveryDate, type LineDateStatus } from "./dates";
export {
  isSameOrigin,
  methodNotAllowed as checkoutMethodNotAllowed,
  startCheckout,
  type StartDependencies,
} from "./start";
export {
  SelectionUpdateSchema,
  UpdateLineSchema,
  UseNextDateSchema,
  basketPath,
  firstIncompleteScreen,
  formValues,
  runCardAndBuyerStep,
  runRecipientStep,
  runRemoveLine,
  runUpdateLine,
  runUpdateSelection,
  runUseNextDate,
  stepPath,
  type FieldIssue,
  type SelectionUpdate,
  type StepContext,
  type StepOutcome,
  type StepState,
} from "./steps";
export {
  removeLineAction,
  saveCardAndBuyerStep,
  saveRecipientStep,
  updateLineAction,
  updateSelection,
  useNextDateAction,
} from "./actions";
