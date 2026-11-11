/**
 * The catalogue's rules with their stable ids (spec 012b §2.5 "Validators are shared with the
 * gates", AC-15; TASK-297).
 *
 * One id per rule, read by the admin save, `pnpm catalogue:check` and `pnpm seed:check`, so a
 * refusal in the product editor and a red line in CI name the same rule. A hard rule refuses the
 * save; a soft rule saves only with an override reason, which lands on the audit row.
 */

export const HARD_RULES = [
  "slug.shape",
  "slug.unique",
  "tier.none",
  "tier.default_one",
  "tier.stem_count_odd",
  "tier.stem_count_thirteen",
  "tier.stem_key",
  "price.integer_minor",
  "price.currency",
  "price.one_open",
  "copy.banned_word",
  "copy.florist_name",
  "copy.price_literal",
  "copy.seo_title_length",
  "copy.seo_description_length",
  "copy.contact",
  "copy.competitor",
] as const;

export const SOFT_RULES = [
  "copy.description_words",
  "price.band",
  "price.rounding",
] as const;

export type HardRuleId = (typeof HARD_RULES)[number];
export type SoftRuleId = (typeof SOFT_RULES)[number];
export type RuleId = HardRuleId | SoftRuleId;

export const RULE_IDS: readonly RuleId[] = [...HARD_RULES, ...SOFT_RULES];

/** One broken rule: which, on which form field, and whether a reason can override it. */
export interface Violation {
  readonly rule: RuleId;
  /** The form field the message sits beside (`slug`, `tiers.2.stems`, `amount`). */
  readonly field: string;
  readonly severity: "hard" | "soft";
}

export function isHardRule(rule: RuleId): rule is HardRuleId {
  return (HARD_RULES as readonly string[]).includes(rule);
}

export function violation(rule: RuleId, field: string): Violation {
  return { rule, field, severity: isHardRule(rule) ? "hard" : "soft" };
}

/** The hard violations: any one refuses the save. */
export function hardViolations(
  violations: readonly Violation[],
): readonly Violation[] {
  return violations.filter((item) => item.severity === "hard");
}

/** The soft violations: the save needs an override reason. */
export function softViolations(
  violations: readonly Violation[],
): readonly Violation[] {
  return violations.filter((item) => item.severity === "soft");
}
