/**
 * @purpose The risk pages' shared pieces: signal labels, deadlines, outcomes, money and times
 * @spec 021
 *
 * Every word from `admin.risk.*` (English only, spec 012 §2.2). Times through `formatDate` in the
 * viewer's zone (the destination's for the deadline's local line); money through `formatMoney`
 * from minor units. No recipient field and no buyer contact is ever read here (AC-19).
 */
import { adminT } from "@/modules/admin";
import { formatDate, formatMoney } from "@/modules/i18n";
import { ADMIN_DECISION_REASONS, type ReviewView } from "@/modules/risk";
import { isCurrencyCode } from "@/config/currencies";
import { RISK_SIGNALS, type RiskSignalId } from "@/config/risk";
export { deliveryDay, ModeChip } from "../orders/view";
import type {
  DeadlineTone,
  RiskSignalRow,
  RiskTag,
} from "@/modules/ui/admin/RiskReview";

const MINUTE_MS = 60_000;
const DUE_SOON_MS = 60 * MINUTE_MS;

export const signalLabel = (id: RiskSignalId): string =>
  adminT(`admin.risk.signal.${id}.label`);

/** Always-hold and decisive signals are drawn on butter, as the board does. */
export const signalHolds = (id: RiskSignalId): boolean =>
  RISK_SIGNALS[id].kind !== "points";

export function signalTags(signals: ReviewView["signals"]): RiskTag[] {
  return signals.map((signal) => ({
    key: signal.id,
    label: signalLabel(signal.id),
    hold: signalHolds(signal.id),
  }));
}

export function signalRows(signals: ReviewView["signals"]): RiskSignalRow[] {
  return signals.map((signal) => {
    const effect = RISK_SIGNALS[signal.id].kind;
    return {
      key: signal.id,
      label: signalLabel(signal.id),
      code: signal.id,
      points:
        effect === "points"
          ? `+${String(signal.points)}`
          : effect === "hold"
            ? adminT("admin.risk.points.hold")
            : adminT("admin.risk.points.cancel"),
      why: adminT(`admin.risk.signal.${signal.id}.why`),
      hold: effect !== "points",
    };
  });
}

/** "8 Oct, 07:13" in `zone`. */
export const at = (date: Date, zone: string): string =>
  formatDate(date, "en", "dayMonthTime", zone);

/** The time left before `deadline` at `now`, and its tone. */
export function timeLeft(
  deadline: Date | null,
  now: Date,
): { readonly text: string; readonly tone: DeadlineTone } {
  if (deadline === null) {
    return { text: adminT("admin.risk.left.none"), tone: "none" };
  }
  const left = deadline.getTime() - now.getTime();
  if (left <= 0) {
    return { text: adminT("admin.risk.left.passed"), tone: "now" };
  }
  const total = Math.floor(left / MINUTE_MS);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  const text =
    hours === 0
      ? adminT("admin.risk.left.minutes", { minutes: String(minutes) })
      : adminT("admin.risk.left.hours", {
          hours: String(hours),
          minutes: String(minutes),
        });
  return { text, tone: left <= DUE_SOON_MS ? "soon" : "plain" };
}

/** Integer minor units in the order's currency, by `formatMoney`. */
export function money(amountMinor: number, currency: string): string {
  if (!isCurrencyCode(currency)) {
    throw new Error(
      `an order currency the application does not configure: ${currency}`,
    );
  }
  return formatMoney({ amountMinor, currency }, "en");
}

/** Who decided: a person's display name, or "automatic" for the system. */
export function decidedBy(review: ReviewView): string {
  if (review.decidedBy?.startsWith("admin:") === true) {
    return review.decidedByName ?? review.decidedBy;
  }
  return adminT("admin.risk.automatic");
}

export const outcomeLabel = (status: ReviewView["status"]): string =>
  adminT(`admin.risk.outcome.${status}`);

const REASONS = [
  ...ADMIN_DECISION_REASONS,
  "deadline_default",
  "superseded",
] as const;

export function reasonLabel(reason: string | null): string {
  const known = REASONS.find((value) => value === reason);
  return known === undefined ? "" : adminT(`admin.risk.reason.${known}`);
}
