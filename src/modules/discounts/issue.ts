/**
 * `issueCode`: the one insert path into `discount_code` (spec 047 §2 "The referral hook", §5.2;
 * AC-2 database half, AC-30; TASK-445).
 *
 * The admin action `createDiscountCode` calls it inside `withAdminContext({ action:
 * 'discount.create' })`, so spec 012's trigger audits the code row and each of its currency,
 * country and product rows. A later referral feature would call it with `source: 'referral'` and
 * an `issuerRef`; no screen passes anything but `'admin'`. A source scan pins that nothing else
 * inserts into `discount_code` (`tests/unit/discounts-source-scan.test.ts`).
 *
 * It parses its input with `IssueCodeInputSchema` (every cross-field rule on its own field), looks
 * the normalised code up first so a duplicate is a field error rather than an aborted
 * transaction, and leaves the unique constraint as the backstop for a race: a concurrent
 * duplicate surfaces as `DiscountCodeTakenError`, which the action maps to the same field error.
 */
import { sql } from "drizzle-orm";

import { DISCOUNT_DEFAULT_MAX_PER_EMAIL } from "@/config/discounts";

import { type DiscountConnection, rowsOf } from "./db";
import { normaliseCode } from "./normalise";
import {
  type DiscountFieldError,
  type IssueCodeInput,
  IssueCodeInputSchema,
} from "./schemas";

/** Who issues the code: the signed-in admin, or none for a later system issuer. */
export interface IssueActor {
  readonly userId: string | null;
}

/** One field's refusal: the field path (`currencies.0.amountOffMinor`) and its error key. */
export interface DiscountFieldIssue {
  readonly field: string;
  readonly error: DiscountFieldError;
}

export type IssueResult =
  | { readonly ok: true; readonly id: string; readonly codeNormalised: string }
  | { readonly ok: false; readonly issues: readonly DiscountFieldIssue[] };

/** A concurrent insert took the normalised code between the look-up and the insert. */
export class DiscountCodeTakenError extends Error {
  readonly field = "code";
  readonly error: DiscountFieldError = "codeTaken";
  constructor() {
    super("DISCOUNT_CODE_TAKEN");
    this.name = "DiscountCodeTakenError";
  }
}

/** Zod issues as field issues, one per field, first error wins. */
export function fieldIssues(
  issues: readonly {
    readonly path: readonly PropertyKey[];
    readonly message: string;
  }[],
): DiscountFieldIssue[] {
  const seen = new Set<string>();
  const out: DiscountFieldIssue[] = [];
  for (const issue of issues) {
    const field = issue.path.map(String).join(".") || "form";
    if (seen.has(field)) continue;
    seen.add(field);
    out.push({ field, error: issue.message as DiscountFieldError });
  }
  return out;
}

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (
    let depth = 0;
    depth < 4 && current !== null && typeof current === "object";
    depth += 1
  ) {
    const record = current as {
      code?: unknown;
      constraint_name?: unknown;
      cause?: unknown;
    };
    if (
      record.code === "23505" &&
      record.constraint_name === "discount_code_code_normalised_key"
    ) {
      return true;
    }
    current = record.cause;
  }
  return false;
}

/** True when another code already holds `codeNormalised` (other than `exceptId`). */
export async function isCodeTaken(
  codeNormalised: string,
  connection: DiscountConnection,
  exceptId?: string,
): Promise<boolean> {
  const rows = await rowsOf(
    connection,
    sql`SELECT 1 FROM public.discount_code WHERE code_normalised = ${codeNormalised}
        AND (${exceptId ?? null}::uuid IS NULL OR id <> ${exceptId ?? null}::uuid)`,
  );
  return rows.length > 0;
}

/** Inserts a code's currency, country and product rows. */
export async function insertScopeRows(
  id: string,
  input: Pick<IssueCodeInput, "currencies" | "countryIds" | "productIds">,
  connection: DiscountConnection,
): Promise<void> {
  for (const row of input.currencies) {
    await connection.db.execute(
      sql`INSERT INTO public.discount_code_currency
            (discount_code_id, currency_code, amount_off_minor, min_order_minor)
          VALUES (${id}, ${row.currency}, ${row.amountOffMinor ?? null}, ${row.minOrderMinor})`,
    );
  }
  for (const countryId of new Set(input.countryIds)) {
    await connection.db.execute(
      sql`INSERT INTO public.discount_code_country (discount_code_id, country_id)
          VALUES (${id}, ${countryId})`,
    );
  }
  for (const productId of new Set(input.productIds)) {
    await connection.db.execute(
      sql`INSERT INTO public.discount_code_product (discount_code_id, product_id)
          VALUES (${id}, ${productId})`,
    );
  }
}

/** Creates a code and its scope rows in the caller's transaction. */
export async function issueCode(
  input: unknown,
  actor: IssueActor,
  connection: DiscountConnection,
): Promise<IssueResult> {
  const parsed = IssueCodeInputSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, issues: fieldIssues(parsed.error.issues) };
  const value = parsed.data;
  const codeNormalised = normaliseCode(value.code);
  if (codeNormalised === null) {
    return { ok: false, issues: [{ field: "code", error: "codeShape" }] };
  }
  if (await isCodeTaken(codeNormalised, connection)) {
    return { ok: false, issues: [{ field: "code", error: "codeTaken" }] };
  }
  try {
    const rows = await rowsOf(
      connection,
      sql`INSERT INTO public.discount_code
            (code, code_normalised, campaign_label, kind, percent_bp, starts_at, ends_at,
             max_redemptions, max_per_email, source, issuer_ref, note, created_by)
          VALUES (${value.code.trim()}, ${codeNormalised}, ${value.campaignLabel}, ${value.kind},
                  ${value.kind === "percent" ? (value.percentBp ?? null) : null},
                  ${value.startsAt}::timestamptz, ${value.endsAt ?? null}::timestamptz,
                  ${value.maxRedemptions ?? null},
                  ${value.maxPerEmail === undefined ? DISCOUNT_DEFAULT_MAX_PER_EMAIL : value.maxPerEmail},
                  ${value.source}, ${value.issuerRef ?? null},
                  ${value.note === undefined || value.note === "" ? null : value.note},
                  ${actor.userId})
          RETURNING id`,
    );
    const id = String(rows[0]?.["id"] ?? "");
    await insertScopeRows(id, value, connection);
    return { ok: true, id, codeNormalised };
  } catch (error) {
    if (isUniqueViolation(error)) throw new DiscountCodeTakenError();
    throw error;
  }
}
