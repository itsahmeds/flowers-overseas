/**
 * The admin discount codes commands and reads (spec 047 §2 "Codes, made in admin", §5.2 "Server
 * actions", §5.3; AC-2 form half, AC-3 to AC-6; TASK-446).
 *
 * The pages under `src/app/admin/(signed-in)/discounts/` are thin: each action calls
 * `requirePermission` first (`discounts.write` for create, update and disable, `discounts.read`
 * for the list, the detail and the cost preview), then one function here, which runs in one
 * admin-context transaction (`withAdminContext`) carrying its audit action, so spec 012's trigger
 * writes exactly one `audit_log` row per changed row (`discount.create`, `discount.update`,
 * `discount.disable`). Nothing is written when nothing changed.
 *
 *  - `createDiscountCode` calls `issueCode` with `source: 'admin'`, the only source a screen passes
 *    (AC-30).
 *  - `updateDiscountCode` refuses, field by field, any change to the code text, the kind, the
 *    percent or a currency's amount once the code has one counted live use (AC-4: the offer is
 *    frozen; caps, dates, status, label, note, minimums and scope stay editable).
 *  - `listDiscountCodes` computes each code's status from data (scheduled, active, ended, used
 *    up, disabled), with live uses and the discount given per currency (`codeStatsMany`, AC-5).
 *  - `discountCostPreview` gives, per bouquet and destination in scope, the price, discount, VAT,
 *    highest mapped florist pay and margin after discount, and the bouquets whose price was lower
 *    in the last 30 days (AC-6). Spec 012b's `marginView` is not on main, so the arithmetic is
 *    `costPreviewRow` (`modules/discounts`), the order's own VAT rule.
 *  - `discountInputFromForm` turns the form's text fields into `DiscountCodeInputSchema`'s input:
 *    amounts through `parseMinorUnits` (digit strings, no float), a percent to basis points by
 *    digit shifting, dates entered in a zone (Europe/London by default) to UTC instants.
 *
 * No code string is logged; the URL carries the code's id only.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import {
  type CurrencyCode,
  CURRENCY_CODES,
  isCurrencyCode,
} from "@/config/currencies";
import { type CountryIso2, isCountryIso2 } from "@/config/countries";
import { DISCOUNT_DEFAULT_TIME_ZONE } from "@/config/discounts";
import type { DbActor, DbTransaction } from "@/lib/db";
import { lowestPriceInLast30Days, tierPrices } from "@/modules/catalog";
import {
  type CodeStats,
  codeStatsMany,
  costPreviewRow,
  countUses,
  DiscountCodeInputSchema,
  type DiscountConnection,
  DiscountCodeTakenError,
  type DiscountFieldError,
  type DiscountFieldIssue,
  type DiscountKind,
  fieldIssues,
  insertScopeRows,
  isCodeTaken,
  issueCode,
  type LoadedCode,
  loadCode,
  type Money,
  normaliseCode,
} from "@/modules/discounts";
import { wallClockToInstant } from "@/modules/i18n";

import { minorUnitsText, parseMinorUnits } from "./order-actions/money";
import { type AdminRunner, adminRunner } from "./users";

/** The audit actions of the discounts commands (spec 047 §2). */
export const DISCOUNT_ACTIONS = Object.freeze({
  read: "discounts.read",
  create: "discount.create",
  update: "discount.update",
  disable: "discount.disable",
} as const);

/** The status chip of a code, computed from its data (§5.3). */
export const DISCOUNT_COMPUTED_STATUSES = [
  "scheduled",
  "active",
  "ended",
  "used_up",
  "disabled",
] as const;
export type DiscountComputedStatus =
  (typeof DISCOUNT_COMPUTED_STATUSES)[number];

/** The list filter (`?status=`). */
export const DiscountListFilterSchema = z.object({
  status: z.enum(DISCOUNT_COMPUTED_STATUSES).optional().catch(undefined),
});
export type DiscountListFilter = z.infer<typeof DiscountListFilterSchema>;

/** A code's computed status: disabled, then used up, ended, scheduled, else active. */
export function computedDiscountStatus(
  code: {
    readonly status: "active" | "disabled";
    readonly startsAt: Date;
    readonly endsAt: Date | null;
    readonly maxRedemptions: number | null;
  },
  liveUses: number,
  now: Date,
): DiscountComputedStatus {
  if (code.status === "disabled") return "disabled";
  if (code.maxRedemptions !== null && liveUses >= code.maxRedemptions)
    return "used_up";
  if (code.endsAt !== null && now.getTime() >= code.endsAt.getTime())
    return "ended";
  if (now.getTime() < code.startsAt.getTime()) return "scheduled";
  return "active";
}

function connectionOf(db: DbTransaction): DiscountConnection {
  return { db };
}

async function rows(
  db: DbTransaction,
  query: ReturnType<typeof sql>,
): Promise<readonly Readonly<Record<string, unknown>>[]> {
  const result: unknown = await db.execute(query);
  return result as readonly Readonly<Record<string, unknown>>[];
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

/** One row of `/admin/discounts`. */
export interface DiscountListRow {
  readonly id: string;
  readonly code: string;
  readonly campaignLabel: string;
  readonly kind: DiscountKind;
  readonly percentBp: number | null;
  /** The fixed amounts, in currency order. */
  readonly amounts: readonly Money[];
  readonly startsAt: Date;
  readonly endsAt: Date | null;
  readonly maxRedemptions: number | null;
  readonly status: DiscountComputedStatus;
  readonly stats: CodeStats;
}

const ListSqlRowSchema = z.object({
  id: z.string(),
  code_normalised: z.string(),
  campaign_label: z.string(),
  kind: z.enum(["percent", "fixed"]),
  percent_bp: z.coerce.number().int().nullable(),
  starts_at: z.coerce.date(),
  ends_at: z.coerce.date().nullable(),
  max_redemptions: z.coerce.number().int().nullable(),
  status: z.enum(["active", "disabled"]),
});

const AmountSqlRowSchema = z.object({
  discount_code_id: z.string(),
  currency_code: z.string(),
  amount_off_minor: z.coerce.number().int().nullable(),
});

/** Sorts currencies in the registry's order (`src/config/currencies.ts`), unknown codes last. */
function currencyRank(code: string): number {
  const index = (CURRENCY_CODES as readonly string[]).indexOf(code);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

/** Every code, newest first, with its computed status and live figures. */
export async function listDiscountCodes(
  actor: DbActor,
  filter: DiscountListFilter = {},
  run: AdminRunner = adminRunner,
  now: Date = new Date(),
): Promise<DiscountListRow[]> {
  return run({ ...actor, action: DISCOUNT_ACTIONS.read }, async (db) => {
    const codes = (
      await rows(
        db,
        sql`SELECT id, code_normalised, campaign_label, kind, percent_bp, starts_at, ends_at,
                   max_redemptions, status
              FROM public.discount_code ORDER BY created_at DESC, id`,
      )
    ).map((row) => ListSqlRowSchema.parse(row));
    const amounts = (
      await rows(
        db,
        sql`SELECT discount_code_id, currency_code, amount_off_minor
              FROM public.discount_code_currency WHERE amount_off_minor IS NOT NULL`,
      )
    ).map((row) => AmountSqlRowSchema.parse(row));
    const stats = await codeStatsMany(
      codes.map((code) => code.id),
      connectionOf(db),
    );
    const list = codes.map((code) => {
      const codeStats = stats.get(code.id) ?? {
        liveUses: 0,
        discountByCurrency: [],
      };
      return {
        id: code.id,
        code: code.code_normalised,
        campaignLabel: code.campaign_label,
        kind: code.kind,
        percentBp: code.percent_bp,
        amounts: amounts
          .filter(
            (row) =>
              row.discount_code_id === code.id && row.amount_off_minor !== null,
          )
          .map((row) => ({
            amountMinor: row.amount_off_minor ?? 0,
            currency: row.currency_code,
          }))
          .sort((a, b) => currencyRank(a.currency) - currencyRank(b.currency)),
        startsAt: code.starts_at,
        endsAt: code.ends_at,
        maxRedemptions: code.max_redemptions,
        status: computedDiscountStatus(
          {
            status: code.status,
            startsAt: code.starts_at,
            endsAt: code.ends_at,
            maxRedemptions: code.max_redemptions,
          },
          codeStats.liveUses,
          now,
        ),
        stats: {
          ...codeStats,
          discountByCurrency: [...codeStats.discountByCurrency].sort(
            (a, b) => currencyRank(a.currency) - currencyRank(b.currency),
          ),
        },
      };
    });
    return filter.status === undefined
      ? list
      : list.filter((row) => row.status === filter.status);
  });
}

/** One code as its page shows it. */
export interface DiscountDetail {
  readonly loaded: LoadedCode;
  readonly code: string;
  readonly note: string | null;
  readonly stats: CodeStats;
  readonly status: DiscountComputedStatus;
  /** True once one live use counts: the offer can no longer change (AC-4). */
  readonly frozen: boolean;
  readonly createdAt: Date;
  readonly createdBy: string | null;
  readonly updatedAt: Date;
  readonly lastChangeBy: string | null;
}

const DetailSqlRowSchema = z.object({
  code: z.string(),
  note: z.string().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
  created_by_name: z.string().nullable(),
  last_change_by: z.string().nullable(),
});

/** One code with its scope and figures, or null. */
export async function getDiscountCode(
  actor: DbActor,
  id: string,
  run: AdminRunner = adminRunner,
  now: Date = new Date(),
): Promise<DiscountDetail | null> {
  if (!z.uuid().safeParse(id).success) return null;
  return run({ ...actor, action: DISCOUNT_ACTIONS.read }, async (db) => {
    const loaded = await loadCode({ id }, connectionOf(db));
    if (loaded === null) return null;
    const [raw] = await rows(
      db,
      sql`SELECT c.code, c.note, c.created_at, c.updated_at,
                 creator.display_name AS created_by_name,
                 (SELECT p.display_name FROM public.audit_log a
                    JOIN public.admin_profile p ON p.user_id = a.actor_user_id
                   WHERE starts_with(a.entity_table, 'discount_code')
                     AND starts_with(a.entity_id, ${id})
                   ORDER BY a.at DESC LIMIT 1) AS last_change_by
            FROM public.discount_code c
            LEFT JOIN public.admin_profile creator ON creator.user_id = c.created_by
           WHERE c.id = ${id}::uuid`,
    );
    const detail = DetailSqlRowSchema.parse(raw);
    const stats = (await codeStatsMany([id], connectionOf(db))).get(id) ?? {
      liveUses: 0,
      discountByCurrency: [],
    };
    return {
      loaded,
      code: detail.code,
      note: detail.note,
      stats,
      status: computedDiscountStatus(loaded.code, stats.liveUses, now),
      frozen: stats.liveUses > 0,
      createdAt: detail.created_at,
      createdBy: detail.created_by_name,
      updatedAt: detail.updated_at,
      lastChangeBy: detail.last_change_by,
    };
  });
}

/** What the form offers: destinations, bouquets and currencies, all read from the database. */
export interface DiscountFormOptions {
  readonly countries: readonly { readonly id: string; readonly iso2: string }[];
  readonly products: readonly { readonly id: string; readonly name: string }[];
  readonly currencies: readonly CurrencyCode[];
  /** Europe/London first, then every destination's zone (data, never code). */
  readonly zones: readonly string[];
}

/** The form's choices. Countries and bouquets are rows, never code (a new one is data). */
export async function discountFormOptions(
  actor: DbActor,
  run: AdminRunner = adminRunner,
): Promise<DiscountFormOptions> {
  return run({ ...actor, action: DISCOUNT_ACTIONS.read }, async (db) => {
    const countries = (
      await rows(db, sql`SELECT id, iso2 FROM public.country ORDER BY iso2`)
    ).map((row) => ({ id: String(row["id"]), iso2: String(row["iso2"]) }));
    const products = (
      await rows(
        db,
        sql`SELECT p.id, coalesce(t.name, p.sku) AS name
              FROM public.product p
              LEFT JOIN public.product_translation t
                ON t.product_id = p.id AND t.locale_code = 'en'
             ORDER BY 2, p.id`,
      )
    ).map((row) => ({ id: String(row["id"]), name: String(row["name"]) }));
    const currencies = (await rows(db, sql`SELECT code FROM public.currency`))
      .map((row) => String(row["code"]))
      .filter((code): code is CurrencyCode => isCurrencyCode(code))
      .sort((a, b) => currencyRank(a) - currencyRank(b));
    const zones = (
      await rows(
        db,
        sql`SELECT DISTINCT iana_zone FROM public.country ORDER BY iana_zone`,
      )
    ).map((row) => String(row["iana_zone"]));
    return {
      countries,
      products,
      currencies,
      zones: [
        DISCOUNT_DEFAULT_TIME_ZONE,
        ...zones.filter((zone) => zone !== DISCOUNT_DEFAULT_TIME_ZONE),
      ],
    };
  });
}

/* -------------------------------------------------------------------------- */
/* The form                                                                   */
/* -------------------------------------------------------------------------- */

/** The form's text fields, as `FormData` gives them (multi-selects as arrays). */
export type DiscountFormFields = Readonly<
  Record<string, string | readonly string[]>
>;

function one(fields: DiscountFormFields, name: string): string {
  const value = fields[name];
  return (typeof value === "string" ? value : (value?.[0] ?? "")).trim();
}

function many(fields: DiscountFormFields, name: string): string[] {
  const value = fields[name];
  if (value === undefined) return [];
  return (typeof value === "string" ? [value] : [...value]).filter(
    (entry) => entry !== "",
  );
}

const PERCENT_TEXT = /^(\d{1,2})(?:[.,](\d{1,2}))?$/u;

/** "10" or "12.5" to basis points by digit shifting; -1 when it is not a percent. */
export function percentTextToBp(text: string): number {
  const match = PERCENT_TEXT.exec(text.replace(/\s*%\s*$/u, ""));
  if (match === null) return -1;
  return Number(`${match[1] ?? "0"}${(match[2] ?? "").padEnd(2, "0")}`);
}

/** Basis points as the form's percent text: 1000 is "10", 1250 is "12.5". */
export function bpToPercentText(bp: number): string {
  const digits = String(bp).padStart(3, "0");
  const whole = digits.slice(0, -2);
  const fraction = digits.slice(-2).replace(/0+$/u, "");
  return fraction === "" ? whole : `${whole}.${fraction}`;
}

/** An amount typed in major units to minor units; null when empty, -1 when not an amount. */
function amountTextToMinor(
  text: string,
  currency: CurrencyCode,
): number | null {
  if (text === "") return null;
  if (/^0+(?:[.,]0+)?$/u.test(text)) return 0;
  const parsed = parseMinorUnits(text, currency);
  return parsed.ok && parsed.amountMinor <= BigInt(Number.MAX_SAFE_INTEGER)
    ? safeInteger(parsed.amountMinor)
    : -1;
}

/** A `bigint` already checked to fit, as a number (integer to integer, no text involved). */
function safeInteger(value: bigint): number {
  return Number(value);
}

/** Minor units as the form's amount text ("5.00"). */
export function minorToAmountText(
  amountMinor: number,
  currency: CurrencyCode,
): string {
  return minorUnitsText(BigInt(amountMinor), currency);
}

function capText(text: string): number | null {
  if (text === "") return null;
  return /^\d{1,9}$/u.test(text) ? Number(text) : -1;
}

/** Where a form field's error shows: the schema's path as the form's field name. */
function formField(path: string, currencies: readonly CurrencyCode[]): string {
  const match =
    /^currencies\.(\d+)\.(amountOffMinor|minOrderMinor|currency)$/u.exec(path);
  if (match !== null) {
    const currency = currencies[Number(match[1])] ?? "";
    return match[2] === "minOrderMinor"
      ? `min_${currency}`
      : `amount_${currency}`;
  }
  if (path === "percentBp") return "percent";
  if (path.startsWith("countryIds")) return "countryIds";
  if (path.startsWith("productIds")) return "productIds";
  return path;
}

/** The form's fields as `DiscountCodeInputSchema`'s input, plus the currency order used. */
export function discountInputFromForm(
  fields: DiscountFormFields,
  currencies: readonly CurrencyCode[],
): {
  readonly input: Record<string, unknown>;
  readonly currencies: CurrencyCode[];
} {
  const zone = one(fields, "zone") || DISCOUNT_DEFAULT_TIME_ZONE;
  const kind = one(fields, "kind");
  const rowsOut: Record<string, unknown>[] = [];
  const used: CurrencyCode[] = [];
  for (const currency of currencies) {
    const amountText = one(fields, `amount_${currency}`);
    const minText = one(fields, `min_${currency}`);
    if (amountText === "" && minText === "") continue;
    const amount =
      kind === "fixed" ? amountTextToMinor(amountText, currency) : null;
    const minimum = amountTextToMinor(minText, currency);
    rowsOut.push({
      currency,
      ...(amount === null ? {} : { amountOffMinor: amount }),
      minOrderMinor: minimum ?? 0,
    });
    used.push(currency);
  }
  const instant = (name: string): string | undefined => {
    const text = one(fields, name);
    if (text === "") return undefined;
    let at: Date | null = null;
    try {
      at = wallClockToInstant(text, zone);
    } catch {
      at = null;
    }
    return at === null ? "invalid" : at.toISOString();
  };
  const startsAt = instant("startsAt");
  const endsAt = instant("endsAt");
  const note = one(fields, "note");
  return {
    input: {
      code: one(fields, "code"),
      campaignLabel: one(fields, "campaignLabel"),
      kind,
      ...(kind === "percent"
        ? { percentBp: percentTextToBp(one(fields, "percent")) }
        : {}),
      currencies: rowsOut,
      startsAt: startsAt ?? "",
      ...(endsAt === undefined ? {} : { endsAt }),
      maxRedemptions: capText(one(fields, "maxRedemptions")),
      maxPerEmail: capText(one(fields, "maxPerEmail")),
      countryIds: many(fields, "countryIds"),
      productIds: many(fields, "productIds"),
      ...(note === "" ? {} : { note }),
    },
    currencies: used,
  };
}

/** A command's outcome: saved (with the code's id), or each refused field's error key. */
export type DiscountCommandResult =
  | { readonly ok: true; readonly id: string }
  | {
      readonly ok: false;
      readonly reason: "invalid" | "not_found";
      readonly errors: Readonly<Record<string, DiscountFieldError>>;
    };

function invalid(
  issues: readonly DiscountFieldIssue[],
  currencies: readonly CurrencyCode[],
): DiscountCommandResult {
  const errors: Record<string, DiscountFieldError> = {};
  for (const issue of issues) {
    const field = formField(issue.field, currencies);
    errors[field] ??= issue.error;
  }
  return { ok: false, reason: "invalid", errors };
}

/* -------------------------------------------------------------------------- */
/* Commands                                                                   */
/* -------------------------------------------------------------------------- */

/** Creates a code from the form, through `issueCode` (AC-30). */
export async function createDiscountCode(
  actor: DbActor,
  fields: DiscountFormFields,
  currencies: readonly CurrencyCode[],
  run: AdminRunner = adminRunner,
): Promise<DiscountCommandResult> {
  const { input, currencies: used } = discountInputFromForm(fields, currencies);
  try {
    const result = await run(
      { ...actor, action: DISCOUNT_ACTIONS.create },
      (db) =>
        issueCode(
          { ...input, source: "admin" },
          { userId: actor.userId ?? null },
          connectionOf(db),
        ),
    );
    return result.ok
      ? { ok: true, id: result.id }
      : invalid(result.issues, used);
  } catch (error) {
    if (error instanceof DiscountCodeTakenError) {
      return invalid([{ field: "code", error: "codeTaken" }], used);
    }
    throw error;
  }
}

const ScopeSqlRowSchema = z.object({
  currency_code: z.string(),
  amount_off_minor: z.coerce.number().int().nullable(),
  min_order_minor: z.coerce.number().int(),
});

/** Saves a code's edits; refuses offer changes after its first counted live use (AC-4). */
export async function updateDiscountCode(
  actor: DbActor,
  id: string,
  fields: DiscountFormFields,
  currencies: readonly CurrencyCode[],
  run: AdminRunner = adminRunner,
): Promise<DiscountCommandResult> {
  if (!z.uuid().safeParse(id).success)
    return { ok: false, reason: "not_found", errors: {} };
  const { input, currencies: used } = discountInputFromForm(fields, currencies);
  const parsed = DiscountCodeInputSchema.safeParse(input);
  if (!parsed.success) return invalid(fieldIssues(parsed.error.issues), used);
  const value = parsed.data;
  const normalised = normaliseCode(value.code) ?? "";
  return run({ ...actor, action: DISCOUNT_ACTIONS.update }, async (db) => {
    const connection = connectionOf(db);
    const current = await loadCode({ id }, connection);
    if (current === null)
      return { ok: false, reason: "not_found", errors: {} } as const;
    const existing = (
      await rows(
        db,
        sql`SELECT currency_code, amount_off_minor, min_order_minor
              FROM public.discount_code_currency WHERE discount_code_id = ${id}::uuid`,
      )
    ).map((row) => ScopeSqlRowSchema.parse(row));

    const frozen = (await countUses(id, "live", null, connection)).uses > 0;
    if (frozen) {
      const issues: DiscountFieldIssue[] = [];
      if (normalised !== current.code.codeNormalised)
        issues.push({ field: "code", error: "offerFrozen" });
      if (value.kind !== current.code.kind)
        issues.push({ field: "kind", error: "offerFrozen" });
      if (
        (value.kind === "percent" ? (value.percentBp ?? null) : null) !==
        current.code.percentBp
      ) {
        issues.push({ field: "percentBp", error: "offerFrozen" });
      }
      const before = new Map<string, number | null>(
        existing.map((row) => [row.currency_code, row.amount_off_minor]),
      );
      const after = new Map<string, number | null>(
        value.currencies.map((row) => [
          row.currency,
          row.amountOffMinor ?? null,
        ]),
      );
      for (const currency of new Set([...before.keys(), ...after.keys()])) {
        if ((before.get(currency) ?? null) !== (after.get(currency) ?? null)) {
          const index = value.currencies.findIndex(
            (row) => row.currency === currency,
          );
          issues.push({
            field:
              index === -1
                ? "currencies"
                : `currencies.${String(index)}.amountOffMinor`,
            error: "offerFrozen",
          });
        }
      }
      if (issues.length > 0) return invalid(issues, used);
    }
    if (await isCodeTaken(normalised, connection, id)) {
      return invalid([{ field: "code", error: "codeTaken" }], used);
    }

    const percentBp =
      value.kind === "percent" ? (value.percentBp ?? null) : null;
    const maxPerEmail = value.maxPerEmail === undefined ? 1 : value.maxPerEmail;
    const note =
      value.note === undefined || value.note === "" ? null : value.note;
    await db.execute(
      sql`UPDATE public.discount_code
             SET code = ${value.code.trim()}, code_normalised = ${normalised},
                 campaign_label = ${value.campaignLabel}, kind = ${value.kind},
                 percent_bp = ${percentBp}, starts_at = ${value.startsAt}::timestamptz,
                 ends_at = ${value.endsAt ?? null}::timestamptz,
                 max_redemptions = ${value.maxRedemptions ?? null},
                 max_per_email = ${maxPerEmail}, note = ${note}
           WHERE id = ${id}::uuid
             AND (code, code_normalised, campaign_label, kind, percent_bp, starts_at, ends_at,
                  max_redemptions, max_per_email, note)
                 IS DISTINCT FROM
                 (${value.code.trim()}, ${normalised}, ${value.campaignLabel}, ${value.kind},
                  ${percentBp}::integer, ${value.startsAt}::timestamptz,
                  ${value.endsAt ?? null}::timestamptz, ${value.maxRedemptions ?? null}::integer,
                  ${maxPerEmail}::integer, ${note}::text)`,
    );

    const before = new Map(existing.map((row) => [row.currency_code, row]));
    const keep = new Set(value.currencies.map((row) => row.currency));
    for (const row of existing) {
      if (!keep.has(row.currency_code as CurrencyCode)) {
        await db.execute(
          sql`DELETE FROM public.discount_code_currency
               WHERE discount_code_id = ${id}::uuid AND currency_code = ${row.currency_code}`,
        );
      }
    }
    const added: typeof value.currencies = [];
    for (const row of value.currencies) {
      const old = before.get(row.currency);
      if (old === undefined) {
        added.push(row);
      } else if (
        old.amount_off_minor !== (row.amountOffMinor ?? null) ||
        old.min_order_minor !== row.minOrderMinor
      ) {
        await db.execute(
          sql`UPDATE public.discount_code_currency
                 SET amount_off_minor = ${row.amountOffMinor ?? null},
                     min_order_minor = ${row.minOrderMinor}
               WHERE discount_code_id = ${id}::uuid AND currency_code = ${row.currency}`,
        );
      }
    }
    const countries = new Set(value.countryIds);
    const products = new Set(value.productIds);
    for (const countryId of current.countryIds) {
      if (!countries.has(countryId)) {
        await db.execute(
          sql`DELETE FROM public.discount_code_country
               WHERE discount_code_id = ${id}::uuid AND country_id = ${countryId}::uuid`,
        );
      }
    }
    for (const productId of current.productIds) {
      if (!products.has(productId)) {
        await db.execute(
          sql`DELETE FROM public.discount_code_product
               WHERE discount_code_id = ${id}::uuid AND product_id = ${productId}::uuid`,
        );
      }
    }
    await insertScopeRows(
      id,
      {
        currencies: added,
        countryIds: value.countryIds.filter(
          (entry) => !current.countryIds.includes(entry),
        ),
        productIds: value.productIds.filter(
          (entry) => !current.productIds.includes(entry),
        ),
      },
      connection,
    );
    return { ok: true, id } as const;
  });
}

/** Turns a code off at once (`discount.disable`), or back on (`discount.update`). */
export async function setDiscountCodeStatus(
  actor: DbActor,
  id: string,
  status: "active" | "disabled",
  run: AdminRunner = adminRunner,
): Promise<DiscountCommandResult> {
  if (!z.uuid().safeParse(id).success)
    return { ok: false, reason: "not_found", errors: {} };
  const action =
    status === "disabled" ? DISCOUNT_ACTIONS.disable : DISCOUNT_ACTIONS.update;
  return run({ ...actor, action }, async (db) => {
    const found = await rows(
      db,
      sql`SELECT 1 FROM public.discount_code WHERE id = ${id}::uuid`,
    );
    if (found.length === 0)
      return { ok: false, reason: "not_found", errors: {} } as const;
    await db.execute(
      sql`UPDATE public.discount_code SET status = ${status}
           WHERE id = ${id}::uuid AND status <> ${status}`,
    );
    return { ok: true, id } as const;
  });
}

/** `setDiscountCodeStatus(…, 'disabled')`, the action spec 047 names. */
export function disableDiscountCode(
  actor: DbActor,
  id: string,
  run: AdminRunner = adminRunner,
): Promise<DiscountCommandResult> {
  return setDiscountCodeStatus(actor, id, "disabled", run);
}

/* -------------------------------------------------------------------------- */
/* Cost preview (AC-6)                                                        */
/* -------------------------------------------------------------------------- */

/** One preview row: the bouquet, the destination and the figures, in the price's currency. */
export interface DiscountPreviewRow {
  readonly productId: string;
  readonly productName: string;
  readonly stems: number | null;
  readonly countryIso: string;
  readonly currency: string;
  readonly vatRateBp: number;
  readonly priceMinor: number;
  readonly discountMinor: number;
  readonly vatMinor: number;
  readonly highestPayoutMinor: number | null;
  readonly marginMinor: number | null;
  readonly belowCost: boolean;
}

/** A bouquet whose price was lower in the last 30 days than today (§8, Omnibus Art. 6a). */
export interface ReductionClaimWarning {
  readonly productName: string;
  readonly countryIso: string;
  readonly lowest: Money;
  readonly today: Money;
}

export interface DiscountCostPreview {
  readonly rows: readonly DiscountPreviewRow[];
  readonly reductionClaims: readonly ReductionClaimWarning[];
  /** True when the scope had more pairs than the preview shows. */
  readonly truncated: boolean;
}

/** At most this many bouquet and destination pairs are previewed at once. */
export const DISCOUNT_PREVIEW_MAX_ROWS = 300;

const PayoutSqlRowSchema = z.object({
  product_id: z.string(),
  country_id: z.string(),
  tier_key: z.string().nullable(),
  currency_code: z.string(),
  payout_minor: z.coerce.number().int(),
});

/** The preview of the offer on the form, for every bouquet and destination in its scope. */
export async function discountCostPreview(
  actor: DbActor,
  fields: DiscountFormFields,
  currencies: readonly CurrencyCode[],
  run: AdminRunner = adminRunner,
  today: string = new Date().toISOString().slice(0, 10),
): Promise<DiscountCostPreview> {
  const { input } = discountInputFromForm(fields, currencies);
  const kind: DiscountKind = input["kind"] === "fixed" ? "fixed" : "percent";
  const percentBp =
    typeof input["percentBp"] === "number" ? input["percentBp"] : -1;
  const terms = {
    kind,
    percentBp:
      kind === "percent" && percentBp >= 1 && percentBp <= 10_000
        ? percentBp
        : 0,
    currencies: (
      (input["currencies"] ?? []) as {
        currency: string;
        amountOffMinor?: number;
      }[]
    ).map((row) => ({
      currency: row.currency,
      amountOffMinor:
        row.amountOffMinor !== undefined && row.amountOffMinor > 0
          ? row.amountOffMinor
          : null,
    })),
  };
  const countryIds = (input["countryIds"] ?? []) as string[];
  const productIds = (input["productIds"] ?? []) as string[];
  const uuid = (value: string) => z.uuid().safeParse(value).success;

  const scope = await run(
    { ...actor, action: DISCOUNT_ACTIONS.read },
    async (db) => {
      const countries = (
        await rows(
          db,
          sql`SELECT id, iso2 FROM public.country
             WHERE ${countryIds.filter(uuid).length === 0}
                OR id = ANY(${`{${countryIds.filter(uuid).join(",")}}`}::uuid[])
             ORDER BY iso2`,
        )
      ).map((row) => ({ id: String(row["id"]), iso2: String(row["iso2"]) }));
      const products = (
        await rows(
          db,
          sql`SELECT p.id, p.sku, coalesce(t.name, p.sku) AS name
              FROM public.product p
              LEFT JOIN public.product_translation t
                ON t.product_id = p.id AND t.locale_code = 'en'
             WHERE ${productIds.filter(uuid).length === 0}
                OR p.id = ANY(${`{${productIds.filter(uuid).join(",")}}`}::uuid[])
             ORDER BY 3, p.id`,
        )
      ).map((row) => ({
        id: String(row["id"]),
        sku: String(row["sku"]),
        name: String(row["name"]),
      }));
      const payouts = (
        await rows(
          db,
          sql`SELECT m.product_id, fp.country_id, m.tier_key, m.currency_code,
                   max(m.partner_payout_minor) AS payout_minor
              FROM public.partner_catalog_mapping m
              JOIN public.fulfillment_partner fp ON fp.id = m.partner_id
             WHERE m.can_fulfil AND fp.status <> 'offboarded'
             GROUP BY m.product_id, fp.country_id, m.tier_key, m.currency_code`,
        )
      ).map((row) => PayoutSqlRowSchema.parse(row));
      return { countries, products, payouts };
    },
  );

  const out: DiscountPreviewRow[] = [];
  const claims: ReductionClaimWarning[] = [];
  let truncated = false;
  for (const product of scope.products) {
    for (const country of scope.countries) {
      if (!isCountryIso2(country.iso2)) continue;
      if (out.length >= DISCOUNT_PREVIEW_MAX_ROWS) {
        truncated = true;
        break;
      }
      const iso = country.iso2 as CountryIso2;
      let tier;
      try {
        tier = (
          await tierPrices({ productId: product.sku, countryIso: iso })
        ).find((entry) => entry.isDefault);
      } catch {
        tier = undefined;
      }
      if (tier === undefined) continue;
      const price = tier.price;
      const mapped = scope.payouts.filter(
        (row) =>
          row.product_id === product.id &&
          row.country_id === country.id &&
          (row.tier_key === null || row.tier_key === tier.tierKey) &&
          row.currency_code === price.currency,
      );
      const highest =
        mapped.length === 0
          ? null
          : Math.max(...mapped.map((row) => row.payout_minor));
      const figures = costPreviewRow({
        priceMinor: price.amountMinor,
        currency: price.currency,
        vatRateBp: price.vatRateBp,
        highestPayoutMinor: highest,
        payoutCurrency: highest === null ? null : price.currency,
        terms,
      });
      out.push({
        productId: product.id,
        productName: product.name,
        stems: null,
        countryIso: country.iso2,
        currency: price.currency,
        vatRateBp: price.vatRateBp,
        ...figures,
      });
      try {
        const lowest = await lowestPriceInLast30Days(
          product.sku,
          tier.tierKey,
          iso,
          today,
        );
        if (lowest.amountMinor < price.amountMinor) {
          claims.push({
            productName: product.name,
            countryIso: country.iso2,
            lowest: {
              amountMinor: lowest.amountMinor,
              currency: lowest.currency,
            },
            today: { amountMinor: price.amountMinor, currency: price.currency },
          });
        }
      } catch {
        // No price row in the window is a data error the catalogue gate reports, not a claim.
      }
    }
    if (truncated) break;
  }
  return { rows: out, reductionClaims: claims, truncated };
}
