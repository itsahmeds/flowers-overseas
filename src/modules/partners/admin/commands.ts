/**
 * The partner commands admin composes (spec 012 §2.5, §5.2 the `src/modules/partners` row; AC-15,
 * AC-16; TASK-221): `createPartner`, `updatePartner`, `recordTerms`, `saveCoverage`,
 * `saveBlackout`, `saveMapping`, `partnerStatusPreflight` and `setPartnerStatus`.
 *
 * Every command runs in **one admin transaction** carrying its audit action, so `0016`'s
 * `audit_row_change()` writes the audit row of every row it changes, and the status change also
 * passes `0016`'s `status_flip_guard()`. Each edit of an existing partner:
 *
 *  1. parses its form (`schemas.ts`; a refusal changes nothing and names the field);
 *  2. locks the partner row `FOR UPDATE` and compares its `updated_at` with the one the form was
 *     rendered from: a save against a newer row is `conflict` and changes nothing (§5.2
 *     "Concurrency");
 *  3. writes, and moves the partner's `updated_at` on, so a second form opened before this save
 *     is a conflict too. One version per partner page: the profile, terms, zones, days off and
 *     products of one florist are one record.
 *
 * Status is a data flip here and nowhere else (`CLAUDE.md`: "Country/partner go-live is a data
 * flip in admin"): `setPartnerStatus` follows only the §2.5 graph, and `→ active` re-runs the
 * preflight inside the same locked transaction, so a zone removed in another tab between the page
 * and the click still refuses the flip.
 *
 * The runner is a parameter (`src/modules/admin/users.ts`' shape) so the integration suite runs
 * the commands against a scratch database; the application passes nothing and gets
 * `withAdminContext`, imported at the first call (as spec 011's application queries do), so this
 * barrel adds no database import to a public page's graph.
 */
import { and, count, eq, sql } from "drizzle-orm";

import type { AdminContextInput, DbActor, DbTransaction } from "@/lib/db";

import { product, productTier } from "../../../../db/schema/catalog";
import {
  city,
  country,
  currency,
  postcodeZone,
} from "../../../../db/schema/geo";
import {
  fulfillmentPartner,
  partnerBlackout,
  partnerCatalogMapping,
  partnerCoverage,
} from "../../../../db/schema/partners";
import {
  type ActivationCondition,
  type PartnerFieldErrors,
  type PartnerProfile,
  type PartnerReference,
  type PartnerStatus,
  type PreflightResult,
  PartnerStatusChangeSchema,
  PartnerVersionSchema,
  activationPreflight,
  isPartnerStatusEdge,
  parseBlackout,
  parseCoverage,
  parseMapping,
  parsePartnerCode,
  parsePartnerProfile,
  parseTerms,
  unmetConditions,
} from "./schemas";

/** Runs `fn` in one admin transaction carrying `context.action`. */
export type PartnerAdminRunner = <T>(
  context: AdminContextInput,
  fn: (db: DbTransaction) => Promise<T>,
) => Promise<T>;

export const partnerAdminRunner: PartnerAdminRunner = async (context, fn) => {
  const { withAdminContext } = await import("@/lib/db");
  return withAdminContext(context, fn);
};

/** The audit actions of the partner commands (lowercase and dotted, `audit_log_action_check`). */
export const PARTNER_ACTIONS = Object.freeze({
  list: "partners.list",
  read: "partners.read",
  create: "partner.create",
  update: "partner.update",
  terms: "partner.terms",
  coverageAdd: "partner.coverage.add",
  coverageRemove: "partner.coverage.remove",
  blackoutAdd: "partner.blackout.add",
  blackoutRemove: "partner.blackout.remove",
  mappingSave: "partner.mapping.save",
  mappingRemove: "partner.mapping.remove",
  status: (to: PartnerStatus) => `partner.status.${to}` as const,
});

/** Why a command changed nothing. `invalid` carries the refusal per field. */
export type PartnerRefusal =
  | {
      readonly ok: false;
      readonly reason: "invalid";
      readonly errors: PartnerFieldErrors;
    }
  | {
      readonly ok: false;
      readonly reason:
        | "conflict"
        | "not_found"
        | "code_taken"
        | "duplicate"
        | "country_has_zones"
        | "currency_has_mappings"
        | "currency_mismatch"
        | "outside_country"
        | "illegal_edge";
    }
  | {
      readonly ok: false;
      readonly reason: "preflight";
      readonly unmet: readonly ActivationCondition[];
    };

export type PartnerCommandResult =
  { readonly ok: true; readonly code: string } | PartnerRefusal;

const invalid = (errors: PartnerFieldErrors): PartnerRefusal => ({
  ok: false,
  reason: "invalid",
  errors,
});

/* -------------------------------------------------------------------------- */
/* shared reads                                                               */
/* -------------------------------------------------------------------------- */

/** Every `currency` and `country` row, the reference a form is judged against (AC-15). */
export async function partnerReference(
  db: DbTransaction,
): Promise<
  PartnerReference & { readonly countryIds: ReadonlyMap<string, string> }
> {
  const currencies = await db.select({ code: currency.code }).from(currency);
  const countries = await db
    .select({ id: country.id, iso2: country.iso2 })
    .from(country);
  return {
    currencies: new Set(currencies.map((row) => row.code)),
    countries: new Set(countries.map((row) => row.iso2)),
    countryIds: new Map(countries.map((row) => [row.iso2, row.id])),
  };
}

interface LockedPartner {
  readonly id: string;
  readonly code: string;
  readonly status: string;
  readonly countryId: string;
  readonly payoutCurrencyCode: string;
}

/**
 * Locks the partner row and checks the version the form carried; the row, or the refusal. A
 * malformed id or version is `invalid`.
 */
async function lockPartner(
  db: DbTransaction,
  input: unknown,
): Promise<LockedPartner | PartnerRefusal> {
  const version = PartnerVersionSchema.safeParse(input);
  if (!version.success) return invalid({ partnerId: "target" });
  const [row] = await db
    .select({
      id: fulfillmentPartner.id,
      code: fulfillmentPartner.code,
      status: fulfillmentPartner.status,
      countryId: fulfillmentPartner.countryId,
      payoutCurrencyCode: fulfillmentPartner.payoutCurrencyCode,
      updatedAt: fulfillmentPartner.updatedAt,
    })
    .from(fulfillmentPartner)
    .where(eq(fulfillmentPartner.id, version.data.partnerId))
    .for("update");
  if (row === undefined) return { ok: false, reason: "not_found" };
  if (row.updatedAt.getTime() !== new Date(version.data.updatedAt).getTime()) {
    return { ok: false, reason: "conflict" };
  }
  return row;
}

function isRefusal(
  value: LockedPartner | PartnerRefusal,
): value is PartnerRefusal {
  return "ok" in value;
}

/** Moves the partner's version on, so a form opened before this save is a conflict. */
async function bumpVersion(
  db: DbTransaction,
  partnerId: string,
): Promise<void> {
  await db
    .update(fulfillmentPartner)
    .set({ updatedAt: sql`now()` })
    .where(eq(fulfillmentPartner.id, partnerId));
}

/** The values a profile writes. */
function profileColumns(
  profile: PartnerProfile,
  countryId: string,
): {
  legalName: string;
  cityLabel: string;
  countryId: string;
  notificationChannel: string;
  contactEmail: string;
  contactPhone: string | null;
  payoutCurrencyCode: string;
  capacityPerDay: number;
} {
  return {
    legalName: profile.legalName,
    cityLabel: profile.cityLabel,
    countryId,
    notificationChannel: profile.notificationChannel,
    contactEmail: profile.contactEmail,
    contactPhone: profile.contactPhone,
    payoutCurrencyCode: profile.payoutCurrency,
    capacityPerDay: profile.capacityPerDay,
  };
}

/* -------------------------------------------------------------------------- */
/* create and update                                                          */
/* -------------------------------------------------------------------------- */

/**
 * `createPartner`: a new partner in `onboarding` (never `demo`, which is seed-only, and never
 * `active`, which only `setPartnerStatus` reaches). `input` is the profile form plus `code`.
 */
export async function createPartner(
  actor: DbActor,
  input: unknown,
  run: PartnerAdminRunner = partnerAdminRunner,
): Promise<PartnerCommandResult> {
  return run({ ...actor, action: PARTNER_ACTIONS.create }, async (db) => {
    const reference = await partnerReference(db);
    const profile = parsePartnerProfile(input, reference);
    const code =
      typeof input === "object" && input !== null && "code" in input
        ? parsePartnerCode(input.code)
        : undefined;
    if (!profile.ok || code === undefined) {
      return invalid({
        ...(profile.ok ? {} : profile.errors),
        ...(code === undefined ? { code: "code" as const } : {}),
      });
    }
    const countryId = reference.countryIds.get(profile.value.countryIso2);
    if (countryId === undefined) return invalid({ countryIso2: "country" });
    const inserted = await db
      .insert(fulfillmentPartner)
      .values({
        code,
        status: "onboarding",
        ...profileColumns(profile.value, countryId),
      })
      .onConflictDoNothing({ target: fulfillmentPartner.code })
      .returning({ code: fulfillmentPartner.code });
    return inserted.length === 1
      ? { ok: true as const, code }
      : { ok: false as const, reason: "code_taken" as const };
  });
}

/**
 * `updatePartner` (`PartnerEditSchema`): the profile. A change of country is refused while the
 * partner has zones (they are in the old country), and a change of payout currency while it has
 * products (their payouts are in the old currency): remove those first.
 */
export async function updatePartner(
  actor: DbActor,
  input: unknown,
  run: PartnerAdminRunner = partnerAdminRunner,
): Promise<PartnerCommandResult> {
  return run({ ...actor, action: PARTNER_ACTIONS.update }, async (db) => {
    const reference = await partnerReference(db);
    const profile = parsePartnerProfile(input, reference);
    if (!profile.ok) return invalid(profile.errors);
    const locked = await lockPartner(db, input);
    if (isRefusal(locked)) return locked;
    const countryId = reference.countryIds.get(profile.value.countryIso2);
    if (countryId === undefined) return invalid({ countryIso2: "country" });
    if (countryId !== locked.countryId) {
      const [zones] = await db
        .select({ n: count() })
        .from(partnerCoverage)
        .where(eq(partnerCoverage.partnerId, locked.id));
      if ((zones?.n ?? 0) > 0)
        return { ok: false, reason: "country_has_zones" };
    }
    if (profile.value.payoutCurrency !== locked.payoutCurrencyCode) {
      const [mapped] = await db
        .select({ n: count() })
        .from(partnerCatalogMapping)
        .where(eq(partnerCatalogMapping.partnerId, locked.id));
      if ((mapped?.n ?? 0) > 0) {
        return { ok: false, reason: "currency_has_mappings" };
      }
    }
    await db
      .update(fulfillmentPartner)
      .set({
        ...profileColumns(profile.value, countryId),
        updatedAt: sql`now()`,
      })
      .where(eq(fulfillmentPartner.id, locked.id));
    return { ok: true, code: locked.code };
  });
}

/* -------------------------------------------------------------------------- */
/* terms, coverage, blackouts, mapping                                        */
/* -------------------------------------------------------------------------- */

/** `recordTerms`: the day the agreement was signed and its version (§2.5 "terms"). */
export async function recordTerms(
  actor: DbActor,
  input: unknown,
  now: Date = new Date(),
  run: PartnerAdminRunner = partnerAdminRunner,
): Promise<PartnerCommandResult> {
  const terms = parseTerms(input, now);
  if (!terms.ok) return invalid(terms.errors);
  return run({ ...actor, action: PARTNER_ACTIONS.terms }, async (db) => {
    const locked = await lockPartner(db, input);
    if (isRefusal(locked)) return locked;
    await db
      .update(fulfillmentPartner)
      .set({
        termsSignedAt: terms.value.signedOn,
        termsVersion: terms.value.version,
        updatedAt: sql`now()`,
      })
      .where(eq(fulfillmentPartner.id, locked.id));
    return { ok: true, code: locked.code };
  });
}

/**
 * `saveCoverage` (`CoverageEditSchema`): add a city or a postcode zone of the partner's own
 * country, or remove one row. A zone row names its city too, so the list reads "Kraków · 30-".
 */
export async function saveCoverage(
  actor: DbActor,
  input: unknown,
  run: PartnerAdminRunner = partnerAdminRunner,
): Promise<PartnerCommandResult> {
  const edit = parseCoverage(input);
  if (!edit.ok) return invalid(edit.errors);
  const action =
    edit.value.op === "add"
      ? PARTNER_ACTIONS.coverageAdd
      : PARTNER_ACTIONS.coverageRemove;
  return run({ ...actor, action }, async (db) => {
    const locked = await lockPartner(db, input);
    if (isRefusal(locked)) return locked;
    const value = edit.value;
    if (value.op === "remove") {
      const removed = await db
        .delete(partnerCoverage)
        .where(
          and(
            eq(partnerCoverage.id, value.coverageId),
            eq(partnerCoverage.partnerId, locked.id),
          ),
        )
        .returning({ id: partnerCoverage.id });
      if (removed.length !== 1) return { ok: false, reason: "not_found" };
    } else {
      let cityId: string | undefined;
      let zoneId: string | null = null;
      if (value.target.kind === "city") {
        const [row] = await db
          .select({ id: city.id })
          .from(city)
          .where(
            and(
              eq(city.id, value.target.id),
              eq(city.countryId, locked.countryId),
            ),
          );
        cityId = row?.id;
      } else {
        const [row] = await db
          .select({ id: postcodeZone.id, cityId: postcodeZone.cityId })
          .from(postcodeZone)
          .where(
            and(
              eq(postcodeZone.id, value.target.id),
              eq(postcodeZone.countryId, locked.countryId),
            ),
          );
        cityId = row?.cityId;
        zoneId = row?.id ?? null;
      }
      if (cityId === undefined) return { ok: false, reason: "outside_country" };
      const inserted = await db
        .insert(partnerCoverage)
        .values({
          partnerId: locked.id,
          cityId,
          postcodeZoneId: zoneId,
          capacityPerDay: value.capacityPerDay,
        })
        .onConflictDoNothing()
        .returning({ id: partnerCoverage.id });
      if (inserted.length !== 1) return { ok: false, reason: "duplicate" };
    }
    await bumpVersion(db, locked.id);
    return { ok: true, code: locked.code };
  });
}

/** `saveBlackout` (`BlackoutEditSchema`): add a day off, or remove one. */
export async function saveBlackout(
  actor: DbActor,
  input: unknown,
  now: Date = new Date(),
  run: PartnerAdminRunner = partnerAdminRunner,
): Promise<PartnerCommandResult> {
  const edit = parseBlackout(input, now);
  if (!edit.ok) return invalid(edit.errors);
  const action =
    edit.value.op === "add"
      ? PARTNER_ACTIONS.blackoutAdd
      : PARTNER_ACTIONS.blackoutRemove;
  return run({ ...actor, action }, async (db) => {
    const locked = await lockPartner(db, input);
    if (isRefusal(locked)) return locked;
    const value = edit.value;
    if (value.op === "remove") {
      const removed = await db
        .delete(partnerBlackout)
        .where(
          and(
            eq(partnerBlackout.partnerId, locked.id),
            eq(partnerBlackout.date, value.date),
          ),
        )
        .returning({ date: partnerBlackout.date });
      if (removed.length !== 1) return { ok: false, reason: "not_found" };
    } else {
      const inserted = await db
        .insert(partnerBlackout)
        .values({
          partnerId: locked.id,
          date: value.date,
          reason: value.reason,
        })
        .onConflictDoNothing()
        .returning({ date: partnerBlackout.date });
      if (inserted.length !== 1) return { ok: false, reason: "duplicate" };
    }
    await bumpVersion(db, locked.id);
    return { ok: true, code: locked.code };
  });
}

/**
 * `saveMapping` (`CatalogMappingEditSchema`): one product and size the partner makes, with its
 * payout in whole minor units of the partner's payout currency, or remove one row. Saving a
 * product and size the partner already has replaces its row (one row per product and size,
 * `partner_catalog_mapping_partner_product_tier_idx`).
 */
export async function saveMapping(
  actor: DbActor,
  input: unknown,
  run: PartnerAdminRunner = partnerAdminRunner,
): Promise<PartnerCommandResult> {
  return run(
    {
      ...actor,
      action:
        typeof input === "object" &&
        input !== null &&
        "op" in input &&
        input.op === "remove"
          ? PARTNER_ACTIONS.mappingRemove
          : PARTNER_ACTIONS.mappingSave,
    },
    async (db) => {
      const reference = await partnerReference(db);
      const edit = parseMapping(input, reference.currencies);
      if (!edit.ok) return invalid(edit.errors);
      const locked = await lockPartner(db, input);
      if (isRefusal(locked)) return locked;
      const value = edit.value;
      if (value.op === "remove") {
        const removed = await db
          .delete(partnerCatalogMapping)
          .where(
            and(
              eq(partnerCatalogMapping.id, value.mappingId),
              eq(partnerCatalogMapping.partnerId, locked.id),
            ),
          )
          .returning({ id: partnerCatalogMapping.id });
        if (removed.length !== 1) return { ok: false, reason: "not_found" };
      } else {
        if (value.currency !== locked.payoutCurrencyCode) {
          return { ok: false, reason: "currency_mismatch" };
        }
        const [known] = await db
          .select({ id: product.id })
          .from(product)
          .where(eq(product.id, value.productId));
        if (known === undefined) return invalid({ product: "product" });
        if (value.tierKey !== null) {
          const [tier] = await db
            .select({ key: productTier.tierKey })
            .from(productTier)
            .where(
              and(
                eq(productTier.productId, value.productId),
                eq(productTier.tierKey, value.tierKey),
              ),
            );
          if (tier === undefined) return invalid({ product: "product" });
        }
        await db
          .insert(partnerCatalogMapping)
          .values({
            partnerId: locked.id,
            productId: value.productId,
            tierKey: value.tierKey,
            canFulfil: value.canFulfil,
            partnerPayoutMinor: BigInt(value.payoutMinor),
            currencyCode: value.currency,
          })
          .onConflictDoUpdate({
            target: [
              partnerCatalogMapping.partnerId,
              partnerCatalogMapping.productId,
              partnerCatalogMapping.tierKey,
            ],
            set: {
              canFulfil: value.canFulfil,
              partnerPayoutMinor: BigInt(value.payoutMinor),
              currencyCode: value.currency,
            },
          });
      }
      await bumpVersion(db, locked.id);
      return { ok: true, code: locked.code };
    },
  );
}

/* -------------------------------------------------------------------------- */
/* status                                                                     */
/* -------------------------------------------------------------------------- */

/** What `partnerStatusPreflight` reads, in `db`, of one partner. */
async function preflightIn(
  db: DbTransaction,
  partnerId: string,
): Promise<PreflightResult | undefined> {
  const [row] = await db
    .select({
      termsSignedAt: fulfillmentPartner.termsSignedAt,
      termsVersion: fulfillmentPartner.termsVersion,
      notificationChannel: fulfillmentPartner.notificationChannel,
      contactEmail: fulfillmentPartner.contactEmail,
      contactPhone: fulfillmentPartner.contactPhone,
      coverageRows: sql<number>`(SELECT count(*)::int FROM public.partner_coverage c WHERE c.partner_id = ${fulfillmentPartner.id})`,
      fulfillableMappings: sql<number>`(SELECT count(*)::int FROM public.partner_catalog_mapping m WHERE m.partner_id = ${fulfillmentPartner.id} AND m.can_fulfil AND m.partner_payout_minor > 0)`,
    })
    .from(fulfillmentPartner)
    .where(eq(fulfillmentPartner.id, partnerId));
  if (row === undefined) return undefined;
  return activationPreflight({
    ...row,
    coverageRows: Number(row.coverageRows),
    fulfillableMappings: Number(row.fulfillableMappings),
  });
}

/**
 * `partnerStatusPreflight`: each condition of `→ active` for one partner, met or not; `undefined`
 * for an unknown id. The page shows "Make active" only when every one is met (decision 6).
 */
export async function partnerStatusPreflight(
  actor: DbActor,
  partnerId: string,
  run: PartnerAdminRunner = partnerAdminRunner,
): Promise<PreflightResult | undefined> {
  return run({ ...actor, action: PARTNER_ACTIONS.read }, (db) =>
    preflightIn(db, partnerId),
  );
}

/**
 * `setPartnerStatus` (`PartnerStatusChangeSchema`): one edge of the §2.5 graph, and for `→ active`
 * only when the preflight, read again under the row lock, passes. A demo partner can only be
 * offboarded (the graph says so); nothing moves into `demo` or `onboarding`.
 */
export async function setPartnerStatus(
  actor: DbActor,
  input: unknown,
  run: PartnerAdminRunner = partnerAdminRunner,
): Promise<PartnerCommandResult> {
  const change = PartnerStatusChangeSchema.safeParse(input);
  if (!change.success) return invalid({ to: "target" });
  const { to } = change.data;
  return run({ ...actor, action: PARTNER_ACTIONS.status(to) }, async (db) => {
    const locked = await lockPartner(db, change.data);
    if (isRefusal(locked)) return locked;
    if (!isPartnerStatusEdge(locked.status, to)) {
      return { ok: false, reason: "illegal_edge" };
    }
    if (to === "active") {
      const preflight = await preflightIn(db, locked.id);
      if (preflight === undefined) return { ok: false, reason: "not_found" };
      const unmet = unmetConditions(preflight);
      if (unmet.length > 0) return { ok: false, reason: "preflight", unmet };
    }
    await db
      .update(fulfillmentPartner)
      .set({ status: to, updatedAt: sql`now()` })
      .where(eq(fulfillmentPartner.id, locked.id));
    return { ok: true, code: locked.code };
  });
}
