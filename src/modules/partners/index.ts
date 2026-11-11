/** Public barrel for `partners` (fulfilment partners, coverage, payouts). Owned by: spec 011 (application), spec 026/027 (portal). */
// Spec 011 (TASK-210): the florist inbox's view shapes and its presentational components, the
// exports TASK-214's inbox pages import and the walkthrough renders (AC-3's import identity), and
// the two public florists pages. The application page and its sent page are deliberately **not**
// exported: their keys render only on `noindex` pages, and an export here would put them in the
// import graph of every indexable page that imports this barrel (spec 003 §14 A17, check 11).
export {
  FLORIST_LIST_GROUPS,
  FLORIST_LOCALES,
  FLORIST_ORDER_STAGES,
  FloristAssignmentListItemSchema,
  FloristOrderViewSchema,
  FloristRecipientSchema,
  listGroupOf,
  listItemOf,
} from "./inbox/view.ts";
export type {
  FloristAssignmentListItem,
  FloristListGroup,
  FloristLocale,
  FloristOrderStage,
  FloristOrderView,
  FloristRecipient,
} from "./inbox/view.ts";
export {
  EXAMPLE_ASSIGNMENT_ID,
  exampleFloristOrderView,
} from "./ui/inbox/example.ts";
export type { ExampleStage } from "./ui/inbox/example.ts";
export { InboxList } from "./ui/inbox/InboxList.tsx";
export type {
  InboxListEntry,
  InboxListGroup,
  InboxListProps,
} from "./ui/inbox/InboxList.tsx";
export { OrderScreen } from "./ui/inbox/OrderScreen.tsx";
export type { OrderScreenProps } from "./ui/inbox/OrderScreen.tsx";
// TASK-214: the inbox list's refresh island and the timer rule its fake-timer test drives.
export { InboxRefresh } from "./ui/inbox/InboxRefresh.tsx";
export type { InboxRefreshProps } from "./ui/inbox/InboxRefresh.tsx";
export { startInboxRefresh } from "./ui/inbox/refresh-timer.ts";
export type {
  InboxRefreshHandle,
  InboxRefreshOptions,
} from "./ui/inbox/refresh-timer.ts";
// TASK-215: the order page's actions, notices and the florist's own photo.
export {
  DeclineReasons,
  DeclineStep,
  DeliveredPhoto,
  InboxDock,
  InboxNotice,
} from "./ui/inbox/OrderActions.tsx";
export type { DeclineReasonOption } from "./ui/inbox/OrderActions.tsx";
export { PhotoField } from "./ui/inbox/PhotoField.tsx";
export type { PhotoFieldProps } from "./ui/inbox/PhotoField.tsx";
export { PhotoStep } from "./ui/inbox/PhotoStep.tsx";
export type { PhotoStepProps } from "./ui/inbox/PhotoStep.tsx";
export {
  AnswerBy,
  CardMessage,
  InboxFrame,
  OrderFacts,
  PayoutLine,
  RecipientBlock,
} from "./ui/inbox/parts.tsx";
export type { InboxFrameProps } from "./ui/inbox/parts.tsx";
export { payoutExampleView } from "./public/payout.ts";
export type { PayoutExampleView, RetailResolver } from "./public/payout.ts";
export { floristsLandingView, walkthroughView } from "./public/views.ts";
export { FloristsLanding } from "./ui/public/FloristsLanding.tsx";
export type { FloristsLandingView } from "./ui/public/FloristsLanding.tsx";
export { FloristsWalkthrough } from "./ui/public/FloristsWalkthrough.tsx";
export type { WalkthroughView } from "./ui/public/FloristsWalkthrough.tsx";
// Spec 011 §5.2 (TASK-213): the admin queries over florist applications, for spec 012's admin
// pages, which define none of their own. The form's own files (schema, action seams, island) stay
// unexported: only the apply route reaches them.
export {
  APPLICATION_ACTIONS,
  FLORIST_APPLICATION_STATUSES,
  FloristApplicationRowSchema,
  FloristApplicationStatusSchema,
  listFloristApplications,
  setFloristApplicationStatus,
} from "./application/admin.ts";
export type {
  ApplicationAdminRunner,
  FloristApplicationRow,
  FloristApplicationStatus,
  SetApplicationStatusResult,
} from "./application/admin.ts";
// Spec 012 §2.5, §5.2 (TASK-221): the partner commands admin composes, the status graph and its
// preconditions, and applications moved through spec 011's two queries above. Server only; no
// public page renders any of it.
export {
  ACTIVATION_CONDITIONS,
  APPLICATION_STATUS_EDGES,
  ApplicationContactSchema,
  ApplicationConvertSchema,
  ApplicationRejectSchema,
  PARTNER_STATUS_EDGES,
  PartnerEditFormSchema,
  PartnerStatusChangeSchema,
  PartnerVersionSchema,
  activationPreflight,
  isApplicationEdge,
  isPartnerStatusEdge,
  parseBlackout,
  parseCoverage,
  parseMapping,
  parsePartnerCode,
  parsePartnerProfile,
  parseTerms,
  partnerCallingCode,
  partnerFieldErrors,
  partnerPhoneE164,
  payoutMinorUnits,
  unmetConditions,
} from "./admin/schemas.ts";
export type {
  ActivationCondition,
  PartnerFieldError,
  PartnerFieldErrors,
  PartnerStatus,
  PreflightResult,
} from "./admin/schemas.ts";
export {
  PARTNER_ACTIONS,
  createPartner,
  partnerAdminRunner,
  partnerStatusPreflight,
  recordTerms,
  saveBlackout,
  saveCoverage,
  saveMapping,
  setPartnerStatus,
  updatePartner,
} from "./admin/commands.ts";
export type {
  PartnerAdminRunner,
  PartnerCommandResult,
  PartnerRefusal,
} from "./admin/commands.ts";
export {
  APPLICATION_CONVERT_ACTION,
  applicationById,
  convertApplication,
  listApplications,
  markApplicationContacted,
  rejectApplication,
} from "./admin/applications.ts";
export type { ApplicationCommandResult } from "./admin/applications.ts";
export {
  PartnerListFilterSchema,
  listPartners,
  partnerCodeById,
  partnerDetail,
  partnerFormOptions,
  partnerHead,
} from "./admin/queries.ts";
export type {
  PartnerDetail,
  PartnerHead,
  PartnerList,
  PartnerListFilter,
  PartnerListItem,
} from "./admin/queries.ts";
// Spec 026a §5.2 (TASK-355): florist access in admin. The partner's contact email is the one
// sign-in address (`syncPartnerOwnerMember`, run by the commands above), its starting language,
// and the admin block's "first signed in" fact. Server only.
export {
  FLORIST_COUNTRY_LANGUAGES,
  FloristSignInEmailSchema,
  floristLanguageFor,
} from "./access/language.ts";
export {
  PARTNER_MEMBER_ACTIONS,
  SyncOwnerResultSchema,
  syncPartnerOwnerMember,
} from "./access/sync.ts";
export type { SyncOwnerResult } from "./access/sync.ts";
export { recordFirstFloristSignIn } from "./access/first-sign-in.ts";
export {
  FloristSignInStatusSchema,
  floristSignInStatus,
} from "./access/status.ts";
export type { FloristSignInStatus } from "./access/status.ts";
// Spec 030a (TASK-363): the payout terms command and the pure money rule. The outbox handler and
// F1's job are the worker's (`./payouts/index.ts`), not exported here.
export {
  PAYOUT_ERROR_CODES,
  PayoutError,
  payoutForOrder,
} from "./payouts/amount.ts";
export type {
  OrderPayout,
  PayoutErrorCode,
  PayoutOrderLine,
} from "./payouts/amount.ts";
export {
  PAYOUT_TERMS_ACTION,
  PayoutTermsEditSchema,
  parsePayoutTerms,
  payoutTermsFieldErrors,
  savePayoutTerms,
} from "./payouts/terms.ts";
export type {
  PayoutCadence,
  PayoutTerms,
  PayoutTermsFieldError,
  PayoutTermsFieldErrors,
  PayoutTermsResult,
} from "./payouts/terms.ts";
// Spec 022a §2, §5.2 (TASK-372): the florist's 90-day rating and acceptance rate.
export {
  RATING_LOW_BP,
  acceptanceRateBp,
  partnerRatingBp,
  refreshPartnerRatings,
} from "./rating";
export type { OfferInput, RatingInput, RatingRefresh } from "./rating";
