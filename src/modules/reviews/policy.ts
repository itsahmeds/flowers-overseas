/**
 * The review policy's path (spec 022a §2 "Display", §6 "URLs"; TASK-370, TASK-373): a leaf under
 * the `legal` segment, read from `REVIEW_POLICY_LEAVES`, the one list of its three slugs.
 */
import { REVIEW_POLICY_LEAVES } from "@/config/reviews";
import { localePath } from "@/modules/i18n";

/** The policy's leaf slug in `locale`: `de` and `pl` have their own, every other locale English. */
export function reviewPolicyLeaf(locale: string): string {
  if (locale === "de") return REVIEW_POLICY_LEAVES.de;
  if (locale === "pl") return REVIEW_POLICY_LEAVES.pl;
  return REVIEW_POLICY_LEAVES.en;
}

/** `/{locale}/{legal}/{leaf}`. */
export function reviewPolicyPath(locale: string): string {
  return localePath(locale, "legal", reviewPolicyLeaf(locale));
}
