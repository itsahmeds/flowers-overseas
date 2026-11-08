/**
 * The finance range (spec 030b §2.5, §5.2 "Schemas"; AC-20, AC-24; TASK-440).
 *
 * `FinanceRangeSchema { from, to, basis, mode, country?, partner? }`, parsed from the query
 * string: dates, codes and modes only, never personal data. `from ≤ to` and `to − from <
 * maxRangeDays`. No `from` and no `to` means the last `defaultRangeDays` days ending today in the
 * viewer's zone. A refusal names its field, so the page renders the field error and runs no
 * finance query.
 */
import { z } from "zod";

import { FINANCE_CONFIG, type FinanceConfig } from "@/config/finance";
import { instantToWallClock } from "@/modules/i18n";

import { addDays } from "./margin";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/u;

/** A real calendar day as `YYYY-MM-DD` (`2026-02-30` is refused). */
export function isCalendarDay(value: string): boolean {
  if (!ISO_DAY.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

const CalendarDay = z.string().refine(isCalendarDay, { error: "not_a_date" });

/** Whole days from `from` to `to`, `to` included (`2026-10-25` to itself is 1). */
export function daysInRange(from: string, to: string): number {
  return (
    Math.round(
      (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
        86_400_000,
    ) + 1
  );
}

export const financeBases = ["paid", "delivery"] as const;
export const financeModes = ["live", "test"] as const;
export const financeFigureFilters = [
  "all",
  "final",
  "provisional",
  "rate_missing",
] as const;

function rangeSchema(config: FinanceConfig) {
  return z
    .object({
      from: CalendarDay,
      to: CalendarDay,
      basis: z.enum(financeBases),
      mode: z.enum(financeModes),
      country: z
        .string()
        .regex(/^[A-Z]{2}$/u)
        .optional(),
      partner: z
        .string()
        .regex(/^[a-z0-9][a-z0-9-]{0,62}$/u)
        .optional(),
    })
    .strict()
    .superRefine((range, ctx) => {
      if (!isCalendarDay(range.from) || !isCalendarDay(range.to)) return;
      if (range.from > range.to) {
        ctx.addIssue({
          code: "custom",
          path: ["from"],
          message: "from_after_to",
        });
      } else if (daysInRange(range.from, range.to) > config.maxRangeDays) {
        ctx.addIssue({ code: "custom", path: ["from"], message: "too_long" });
      }
    });
}

export const FinanceRangeSchema = rangeSchema(FINANCE_CONFIG);
export type FinanceRange = z.infer<typeof FinanceRangeSchema>;

export const financeExportKinds = ["orders", "florists", "countries"] as const;
export type FinanceExportKind = (typeof financeExportKinds)[number];

/** The range plus the kind of table the CSV carries. */
export const FinanceExportQuerySchema = z.object({
  range: FinanceRangeSchema,
  kind: z.enum(financeExportKinds),
});
export type FinanceExportQuery = z.infer<typeof FinanceExportQuerySchema>;

/** The error a refused field shows. */
export type FinanceRangeError = "from_after_to" | "too_long" | "not_a_date";

export type FinanceRangeResult =
  | { readonly ok: true; readonly range: FinanceRange }
  | {
      readonly ok: false;
      /** What the form shows back, as typed. */
      readonly entered: { readonly from: string; readonly to: string };
      readonly errors: Partial<Record<"from" | "to", FinanceRangeError>>;
    };

/** Today's calendar day in `zone`. */
export function todayIn(zone: string, now: Date): string {
  return instantToWallClock(now, zone).slice(0, 10);
}

type Query = Readonly<Record<string, string | readonly string[] | undefined>>;

function one(query: Query, key: string): string | undefined {
  const value = query[key];
  const text = typeof value === "string" ? value : value?.[0];
  return text === undefined || text.trim() === "" ? undefined : text.trim();
}

/**
 * Parses the query string into a range. A missing `to` is today in the viewer's zone and a
 * missing `from` is `defaultRangeDays` days ending at `to`.
 */
export function parseFinanceRange(
  query: Query,
  zone: string,
  now: Date,
  config: FinanceConfig = FINANCE_CONFIG,
): FinanceRangeResult {
  const today = todayIn(zone, now);
  const to = one(query, "to") ?? today;
  const from =
    one(query, "from") ??
    (isCalendarDay(to) ? addDays(to, -(config.defaultRangeDays - 1)) : today);
  const country = one(query, "country");
  const partner = one(query, "partner");
  const input = {
    from,
    to,
    basis: one(query, "basis") === "delivery" ? "delivery" : "paid",
    mode: one(query, "mode") === "test" ? "test" : "live",
    ...(country === undefined ? {} : { country: country.toUpperCase() }),
    ...(partner === undefined ? {} : { partner }),
  };
  const parsed = rangeSchema(config).safeParse(input);
  if (parsed.success) return { ok: true, range: parsed.data };
  const errors: Partial<Record<"from" | "to", FinanceRangeError>> = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (field !== "from" && field !== "to") continue;
    if (errors[field] !== undefined) continue;
    errors[field] =
      issue.message === "from_after_to" || issue.message === "too_long"
        ? issue.message
        : "not_a_date";
  }
  if (errors.from === undefined && errors.to === undefined) {
    // A malformed filter (country, florist) is dropped rather than refused.
    return parseFinanceRange(
      { from, to, basis: input.basis, mode: input.mode },
      zone,
      now,
      config,
    );
  }
  return { ok: false, entered: { from, to }, errors };
}

/** The query string of a range (for links between the finance pages and the CSV). */
export function rangeQuery(
  range: FinanceRange,
  extra: Readonly<Record<string, string | undefined>> = {},
): string {
  const params = new URLSearchParams({
    from: range.from,
    to: range.to,
    basis: range.basis,
    mode: range.mode,
  });
  if (range.country !== undefined) params.set("country", range.country);
  if (range.partner !== undefined) params.set("partner", range.partner);
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined) params.set(key, value);
  }
  return params.toString();
}
