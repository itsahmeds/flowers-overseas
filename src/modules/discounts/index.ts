/** Public barrel for `discounts` (discount codes: normalising, evaluation, allocation, issuing, counting uses, finance read models). Owned by: spec 047. */

/**
 * Spec 047 §5.2 (TASK-445): the only import path into the discounts module. Server only: the
 * database functions and `node:crypto` live behind it, so a `"use client"` file never imports it.
 *
 * The florist's pay never reads a discount: nothing under `src/modules/partners`, the routing
 * code or the payouts code imports this barrel, `order_discount` or `discount_minor` (AC-19,
 * `tests/unit/discounts-source-scan.test.ts`). No cached page imports it either (AC-21).
 */
export { allocateDiscount, discountAmount, toBaseMinor } from "./allocate";
export type {
  AllocatedLine,
  AppliedCodeTerms,
  Money,
  PricedLine,
} from "./allocate";
export type { DiscountConnection, DiscountDb } from "./db";
export { evaluateCode } from "./evaluate";
export type {
  DiscountCounts,
  EvaluableCode,
  EvaluableCurrency,
  Evaluation,
  EvaluationContext,
  PurchaseLine,
} from "./evaluate";
export { codeStats, codeStatsMany, discountFinanceRows } from "./finance";
export type { CodeStats } from "./finance";
export {
  DiscountCodeTakenError,
  fieldIssues,
  insertScopeRows,
  isCodeTaken,
  issueCode,
} from "./issue";
export type { DiscountFieldIssue, IssueActor, IssueResult } from "./issue";
export { emailKey, generateCode, normaliseCode } from "./normalise";
export {
  countUses,
  loadCode,
  lockAndCount,
  lookupTypedCode,
  NON_COUNTING_STATUSES,
} from "./redeem";
export type { LoadedCode } from "./redeem";
export {
  ApplyDiscountSchema,
  DISCOUNT_FIELD_ERRORS,
  DISCOUNT_KINDS,
  DISCOUNT_MODES,
  DISCOUNT_REFUSAL_REASONS,
  DISCOUNT_SOURCES,
  DISCOUNT_STORED_STATUSES,
  DiscountCodeInputSchema,
  DiscountCurrencyInputSchema,
  DiscountFinanceFilterSchema,
  DiscountFinanceRowSchema,
  IssueCodeInputSchema,
  OrderDiscountSchema,
  RemoveDiscountSchema,
} from "./schemas";
export type {
  DiscountCodeInput,
  DiscountCurrencyInput,
  DiscountFieldError,
  DiscountFinanceFilter,
  DiscountFinanceRow,
  DiscountKind,
  DiscountMode,
  DiscountRefusalReason,
  DiscountSource,
  DiscountStoredStatus,
  IssueCodeInput,
  OrderDiscount,
} from "./schemas";
