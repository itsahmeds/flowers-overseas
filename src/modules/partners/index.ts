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
