/**
 * The catalogue commands and reads of the product editor (spec 012b §2.5, §2.6, §5.2; AC-15 to
 * AC-21; TASK-297, TASK-298).
 *
 * Every command runs in **one admin transaction** carrying its audit action and, when a soft rule
 * or the margin rule was overridden, the reason (`app.audit_reason`), so `0044`'s audit trigger
 * writes it on the audit row of every row the command changed. A command parses its input first
 * (zod), validates with the shared rules (`@/modules/catalog`'s `validate/`, the ids
 * `catalogue:check` and `seed:check` print), locks the product row and compares the form's
 * `updatedAt` (a save against a newer row is `conflict` and changes nothing), writes, moves the
 * product's `updated_at` on, and returns `{ result, tags }` for `applyCommand()` (§5.4).
 *
 * A florist bouquet is a product saved with a **supplier florist**: the product (or its sizes)
 * and that florist's `partner_catalog_mapping` rows are written through spec 012's `saveMapping`
 * **inside the same transaction** (its runner is handed this one), so a refused mapping rolls the
 * product back too (AC-17).
 *
 * Prices are typed as text (`parseMinorInput`) and stored as integers. Once a product has been
 * active (`first_active_at`), a change supersedes: the open row gets `active_to` = today in the
 * country's zone and a new open row starts today; `retail_minor` is never updated (AC-19). Before
 * that, `replaceDraftPrice` deletes and re-enters freely.
 */
import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";

import {
  colours,
  flowerTypes,
  priceTiers,
  productTypes,
  styles,
  substitutionClasses,
} from "@/config/catalogue/schemas";
import { type CurrencyCode, isCurrencyCode } from "@/config/currencies";
import { isLocaleCode, launchLocales } from "@/config/locales";
import { invalidate as invalidateCache } from "@/lib/cache";
import {
  type AdminCommand,
  applyCommand,
  commandOutcome,
} from "@/lib/command-tags";
import type { AdminContextInput, DbTransaction } from "@/lib/db";
import {
  type DatedRates,
  type MarginView,
  type MarginVerdict,
  type PricePreview,
  type Violation,
  PriceChangeSchema,
  ProductDelistSchema,
  copyViolations,
  hardViolations,
  marginVerdict,
  marginView,
  parseMinorInput,
  pricePreview,
  priceViolations,
  slugUniqueViolations,
  slugViolations,
  softViolations,
  suggestedPrice,
  tierViolations,
  violation,
} from "@/modules/catalog";
import { saveMapping } from "@/modules/partners";

import {
  countryPrice,
  product,
  productTier,
  productTranslation,
} from "../../../db/schema/catalog";
import { country } from "../../../db/schema/geo";
import { fulfillmentPartner } from "../../../db/schema/partners";

import { type AdminRunner, adminRunner } from "./users";

/* -------------------------------------------------------------------------- */
/* actions, actors, results                                                   */
/* -------------------------------------------------------------------------- */

/** The audit actions (lowercase and dotted, `audit_log_action_check`). */
export const CATALOGUE_ACTIONS = Object.freeze({
  list: "catalogue.list",
  view: "catalogue.view",
  create: "catalogue.product_create",
  update: "catalogue.product_update",
  tiers: "catalogue.tiers_save",
  copy: "catalogue.copy_save",
  status: "catalogue.status_change",
  delist: "catalogue.country_remove",
  price: "catalogue.price_supersede",
  draftPrice: "catalogue.price_replace",
} as const);

export interface CatalogueActor {
  readonly userId?: string;
  readonly requestId?: string;
  readonly roles: readonly string[];
}

export type CatalogueRefusalReason =
  | "invalid"
  | "rules"
  | "reason_required"
  | "conflict"
  | "not_found"
  | "duplicate_sku"
  | "forbidden_locale"
  | "exposed"
  | "preconditions"
  | "same_day"
  | "not_draft"
  | "below_payout"
  | "supplier"
  | "mapping_failed"
  | "no_vat_rate"
  | "transition";

export interface CatalogueRefusal {
  readonly ok: false;
  readonly reason: CatalogueRefusalReason;
  readonly violations: readonly Violation[];
  /** For `preconditions`: the unmet ones. */
  readonly unmet?: readonly ActivationCondition[];
}

export type CatalogueResult<T> =
  { readonly ok: true; readonly value: T } | CatalogueRefusal;

export interface CatalogueDeps {
  readonly run: AdminRunner;
  readonly invalidate: (tags: readonly string[]) => Promise<unknown>;
  /** The clock "today in the country's zone" is read from (tests pin it). */
  readonly now: () => Date;
}

const defaultDeps: CatalogueDeps = {
  run: adminRunner,
  invalidate: (tags) => invalidateCache([...tags]),
  now: () => new Date(),
};

class Refused extends Error {
  readonly refusal: CatalogueRefusal;
  constructor(refusal: CatalogueRefusal) {
    super(refusal.reason);
    this.refusal = refusal;
  }
}

function refuse(
  reason: CatalogueRefusalReason,
  violations: readonly Violation[] = [],
  unmet?: readonly ActivationCondition[],
): never {
  throw new Refused({
    ok: false,
    reason,
    violations,
    ...(unmet === undefined ? {} : { unmet }),
  });
}

function context(
  actor: CatalogueActor,
  action: string,
  reason?: string,
): AdminContextInput {
  return {
    ...(actor.userId === undefined ? {} : { userId: actor.userId }),
    ...(actor.requestId === undefined ? {} : { requestId: actor.requestId }),
    action,
    ...(reason === undefined ? {} : { reason }),
  };
}

/** Runs `fn` in one admin transaction, then invalidates its tags once (`applyCommand`). */
async function command<T>(
  actor: CatalogueActor,
  action: string,
  reason: string | undefined,
  deps: Partial<CatalogueDeps>,
  fn: (
    db: DbTransaction,
    all: CatalogueDeps,
  ) => Promise<{ value: T; command: AdminCommand }>,
): Promise<CatalogueResult<T>> {
  const all = { ...defaultDeps, ...deps };
  try {
    const done = await all.run(context(actor, action, reason), (db) =>
      fn(db, all),
    );
    const value = await applyCommand(
      commandOutcome(done.value, done.command),
      all.invalidate,
    );
    return { ok: true, value };
  } catch (error) {
    if (error instanceof Refused) return error.refusal;
    throw error;
  }
}

/* -------------------------------------------------------------------------- */
/* schemas                                                                    */
/* -------------------------------------------------------------------------- */

const Version = z.iso.datetime({ offset: true });
const Sku = z.string().regex(/^FO-(?:BQ|AR|PT|FN|GS)-\d{3}$/u);
const Reason = z.string().trim().min(3).max(500);
const PayoutText = z.string().trim().min(1).max(32);

/** A supplier florist and its price per size, typed as text in its payout currency. */
const SupplierSchema = z
  .object({
    partnerId: z.uuid(),
    payouts: z
      .array(
        z
          .object({
            tierKey: z
              .string()
              .regex(/^[a-z0-9_]{1,40}$/u)
              .nullable(),
            payoutText: PayoutText,
          })
          .strict(),
      )
      .max(12),
  })
  .strict();

/** `createProduct` / `updateProduct`: the details tab (§2.5). */
export const ProductEditSchema = z
  .object({
    productId: z.uuid().optional(),
    updatedAt: Version.optional(),
    sku: Sku,
    productType: z.enum(productTypes),
    primaryFlower: z.enum(flowerTypes),
    colourPrimary: z.enum(colours),
    style: z.enum(styles),
    priceTier: z.enum(priceTiers),
    substitutionClass: z.enum(substitutionClasses),
    vaseIncluded: z.boolean(),
    stemCount: z.number().int().positive().max(999).nullable(),
    freshnessDays: z.number().int().min(1).max(60),
    partnerOnly: z.boolean(),
    supplier: SupplierSchema.optional(),
  })
  .strict();
export type ProductEdit = z.infer<typeof ProductEditSchema>;

const TIER_KEY = /^(?:stems_\d{1,3}|size_[sml]|single)$/u;

/** `saveTier`: the product's whole size set, replaced in one save (§2.5 "sizes"). */
export const TierEditSchema = z
  .object({
    productId: z.uuid(),
    updatedAt: Version,
    tiers: z
      .array(
        z
          .object({
            tierKey: z.string().regex(TIER_KEY),
            stems: z.number().int().positive().max(999).nullable(),
            sort: z.number().int().min(0).max(99),
            isDefault: z.boolean(),
          })
          .strict(),
      )
      .max(8),
    supplier: SupplierSchema.optional(),
  })
  .strict();

/** `saveCopy`: one locale's name, slug, description and search fields (§2.5 "copy"). */
export const ProductCopyEditSchema = z
  .object({
    productId: z.uuid(),
    updatedAt: Version,
    locale: z.string().refine(isLocaleCode),
    name: z.string().trim().min(1).max(120),
    slug: z.string().trim().max(120),
    description: z.string().trim().max(4000),
    seoTitle: z.string().trim().max(200),
    seoDescription: z.string().trim().max(400),
    overrideReason: Reason.optional(),
  })
  .strict();

/** `setProductStatus` (§2.5 "status"). */
export const ProductStatusChangeSchema = z
  .object({
    productId: z.uuid(),
    updatedAt: Version,
    status: z.enum(["active", "retired"]),
  })
  .strict();

/* -------------------------------------------------------------------------- */
/* shared reads inside a transaction                                          */
/* -------------------------------------------------------------------------- */

interface LockedProduct {
  readonly id: string;
  readonly sku: string;
  readonly status: string;
  readonly source: string;
  readonly firstActiveAt: Date | null;
  readonly updatedAt: Date;
}

async function lockProduct(
  db: DbTransaction,
  productId: string,
  updatedAt: string | undefined,
): Promise<LockedProduct> {
  const [row] = await db
    .select({
      id: product.id,
      sku: product.sku,
      status: product.status,
      source: product.source,
      firstActiveAt: product.firstActiveAt,
      updatedAt: product.updatedAt,
    })
    .from(product)
    .where(eq(product.id, productId))
    .for("update");
  if (row === undefined) refuse("not_found");
  if (
    updatedAt !== undefined &&
    row.updatedAt.getTime() !== new Date(updatedAt).getTime()
  ) {
    refuse("conflict");
  }
  return row;
}

async function bumpProduct(
  db: DbTransaction,
  productId: string,
): Promise<void> {
  await db
    .update(product)
    .set({ updatedAt: sql`clock_timestamp()` })
    .where(eq(product.id, productId));
}

/** Is the placeholder window open? The global row, else the flag's default. */
async function placeholderWindowOpen(db: DbTransaction): Promise<boolean> {
  const rows = await db.execute<{ open: boolean }>(sql`
    SELECT COALESCE(
      (SELECT enabled FROM feature_flag_scope
        WHERE flag_key = 'catalogue.placeholder_window' AND scope = 'global' LIMIT 1),
      (SELECT enabled_default FROM feature_flag WHERE key = 'catalogue.placeholder_window'),
      false) AS open`);
  return rows[0]?.open === true;
}

/**
 * `isExposed` (§2.5): priced, now or in the past, in a country whose `first_live_at` is set,
 * **and** the placeholder window is closed or the product is real.
 */
export async function isExposedIn(
  db: DbTransaction,
  productId: string,
): Promise<boolean> {
  const rows = await db.execute<{ priced: boolean; source: string }>(sql`
    SELECT EXISTS (
             SELECT 1 FROM country_price cp JOIN country c ON c.id = cp.country_id
              WHERE cp.product_id = ${productId} AND c.first_live_at IS NOT NULL
           ) AS priced,
           (SELECT source FROM product WHERE id = ${productId}) AS source`);
  const row = rows[0];
  if (row === undefined || !row.priced) return false;
  if (row.source === "real") return true;
  return !(await placeholderWindowOpen(db));
}

/** Legal names and city labels of every non-demo florist (AC-17's copy rule). */
async function floristTerms(db: DbTransaction): Promise<string[]> {
  const rows = await db
    .select({
      legalName: fulfillmentPartner.legalName,
      cityLabel: fulfillmentPartner.cityLabel,
    })
    .from(fulfillmentPartner)
    .where(ne(fulfillmentPartner.status, "demo"));
  return rows.flatMap((row) => [row.legalName, row.cityLabel]);
}

/** The destinations a product is priced in now: the tags of a copy or size change. */
async function pricedIn(
  db: DbTransaction,
  productId: string,
): Promise<string[]> {
  const rows = await db.execute<{ iso2: string }>(sql`
    SELECT DISTINCT c.iso2 FROM country_price cp JOIN country c ON c.id = cp.country_id
     WHERE cp.product_id = ${productId} AND cp.active_to IS NULL ORDER BY 1`);
  return rows.map((row) => row.iso2);
}

/**
 * The supplier florist's mapping rows, through spec 012's `saveMapping` with **this**
 * transaction as its runner: a refusal throws, so the product rolls back with it (AC-17).
 */
async function writeSupplier(
  db: DbTransaction,
  actor: CatalogueActor,
  productId: string,
  supplier: z.infer<typeof SupplierSchema>,
): Promise<void> {
  const [partner] = await db
    .select({
      status: fulfillmentPartner.status,
      currency: fulfillmentPartner.payoutCurrencyCode,
    })
    .from(fulfillmentPartner)
    .where(eq(fulfillmentPartner.id, supplier.partnerId));
  if (
    partner === undefined ||
    !(partner.status === "active" || partner.status === "onboarding")
  ) {
    refuse("supplier");
  }
  const currency = partner.currency;
  if (!isCurrencyCode(currency)) refuse("supplier");
  for (const [index, payout] of supplier.payouts.entries()) {
    const parsed = parseMinorInput(payout.payoutText, currency);
    if (!parsed.ok || parsed.amountMinor <= 0) {
      refuse("invalid", [
        violation("price.integer_minor", `payouts.${String(index)}`),
      ]);
    }
    const [version] = await db
      .select({ updatedAt: fulfillmentPartner.updatedAt })
      .from(fulfillmentPartner)
      .where(eq(fulfillmentPartner.id, supplier.partnerId));
    const saved = await saveMapping(
      actor.userId === undefined ? {} : { userId: actor.userId },
      {
        partnerId: supplier.partnerId,
        updatedAt: version?.updatedAt.toISOString(),
        product: productId,
        size: payout.tierKey ?? "",
        canFulfil: "yes",
        payoutMinor: String(parsed.amountMinor),
        currency,
      },
      (_context, fn) => fn(db),
    );
    if (!saved.ok) refuse("mapping_failed");
  }
}

/* -------------------------------------------------------------------------- */
/* products                                                                   */
/* -------------------------------------------------------------------------- */

/** `createProduct` / `updateProduct` (`ProductEditSchema`). A new product is a draft. */
export async function saveProduct(
  actor: CatalogueActor,
  input: unknown,
  deps: Partial<CatalogueDeps> = {},
): Promise<CatalogueResult<{ productId: string; sku: string }>> {
  const parsed = ProductEditSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid", violations: [] };
  const edit = parsed.data;
  const creating = edit.productId === undefined;
  return command(
    actor,
    creating ? CATALOGUE_ACTIONS.create : CATALOGUE_ACTIONS.update,
    undefined,
    deps,
    async (db) => {
      const values = {
        productType: edit.productType,
        primaryFlower: edit.primaryFlower,
        colourPrimary: edit.colourPrimary,
        style: edit.style,
        priceTier: edit.priceTier,
        substitutionClass: edit.substitutionClass,
        vaseIncluded: edit.vaseIncluded,
        stemCount: edit.stemCount,
        freshnessDays: edit.freshnessDays,
        partnerOnly: edit.partnerOnly,
      };
      let productId: string;
      let sku = edit.sku;
      if (edit.productId === undefined) {
        const inserted = await db
          .insert(product)
          .values({ ...values, sku: edit.sku, status: "draft", source: "real" })
          .onConflictDoNothing()
          .returning({ id: product.id });
        const row = inserted[0];
        if (row === undefined) refuse("duplicate_sku");
        productId = row.id;
      } else {
        const locked = await lockProduct(db, edit.productId, edit.updatedAt);
        productId = locked.id;
        sku = locked.sku;
        await db
          .update(product)
          .set({ ...values, updatedAt: sql`clock_timestamp()` })
          .where(eq(product.id, productId));
      }
      if (edit.supplier !== undefined) {
        await writeSupplier(db, actor, productId, edit.supplier);
      }
      const priced = creating ? [] : await pricedIn(db, productId);
      return {
        value: { productId, sku },
        command:
          priced.length === 0
            ? { kind: "structural" }
            : { kind: "size", sku, pricedIn: priced },
      };
    },
  );
}

function labelKeyFor(tierKey: string): string {
  if (tierKey.startsWith("stems_")) return "catalog.tier.stems";
  if (tierKey === "single") return "catalog.tier.single";
  return `catalog.tier.size.${tierKey.slice("size_".length)}`;
}

/** `saveTier` (`TierEditSchema`): the size set, with the supplier florist's prices per size. */
export async function saveTiers(
  actor: CatalogueActor,
  input: unknown,
  deps: Partial<CatalogueDeps> = {},
): Promise<CatalogueResult<{ productId: string }>> {
  const parsed = TierEditSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid", violations: [] };
  const edit = parsed.data;
  const broken = tierViolations(edit.tiers);
  if (broken.length > 0)
    return { ok: false, reason: "rules", violations: broken };
  if (
    new Set(edit.tiers.map((tier) => tier.tierKey)).size !== edit.tiers.length
  ) {
    return {
      ok: false,
      reason: "rules",
      violations: [violation("tier.stem_key", "tiers")],
    };
  }
  return command(
    actor,
    CATALOGUE_ACTIONS.tiers,
    undefined,
    deps,
    async (db) => {
      const locked = await lockProduct(db, edit.productId, edit.updatedAt);
      const existing = await db
        .select({ tierKey: productTier.tierKey })
        .from(productTier)
        .where(eq(productTier.productId, locked.id));
      const keep = new Set(edit.tiers.map((tier) => tier.tierKey));
      const dropped = existing.filter((row) => !keep.has(row.tierKey));
      if (dropped.length > 0 && (await isExposedIn(db, locked.id)))
        refuse("exposed");
      // One default per product (a partial unique index): clear it first, then write the set.
      await db
        .update(productTier)
        .set({ isDefault: false })
        .where(eq(productTier.productId, locked.id));
      for (const row of dropped) {
        await db
          .delete(productTier)
          .where(
            and(
              eq(productTier.productId, locked.id),
              eq(productTier.tierKey, row.tierKey),
            ),
          );
      }
      for (const tier of [...edit.tiers].sort(
        (a, b) => Number(a.isDefault) - Number(b.isDefault),
      )) {
        await db
          .insert(productTier)
          .values({
            productId: locked.id,
            tierKey: tier.tierKey,
            labelKey: labelKeyFor(tier.tierKey),
            stems: tier.stems,
            sort: tier.sort,
            isDefault: tier.isDefault,
          })
          .onConflictDoUpdate({
            target: [productTier.productId, productTier.tierKey],
            set: {
              labelKey: labelKeyFor(tier.tierKey),
              stems: tier.stems,
              sort: tier.sort,
              isDefault: tier.isDefault,
            },
          });
      }
      if (edit.supplier !== undefined) {
        await writeSupplier(db, actor, locked.id, edit.supplier);
      }
      await bumpProduct(db, locked.id);
      const priced = await pricedIn(db, locked.id);
      return {
        value: { productId: locked.id },
        command:
          priced.length === 0
            ? { kind: "structural" }
            : { kind: "size", sku: locked.sku, pricedIn: priced },
      };
    },
  );
}

/** `saveCopy` (`ProductCopyEditSchema`): one locale's text, in the user's reviewer locales. */
export async function saveCopy(
  actor: CatalogueActor,
  input: unknown,
  deps: Partial<CatalogueDeps> = {},
): Promise<CatalogueResult<{ productId: string }>> {
  const parsed = ProductCopyEditSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid", violations: [] };
  const edit = parsed.data;
  return command(
    actor,
    CATALOGUE_ACTIONS.copy,
    edit.overrideReason,
    deps,
    async (db) => {
      if (!actor.roles.includes("admin")) {
        const granted = await db.execute<{ one: number }>(sql`
          SELECT 1 AS one FROM reviewer_locale
           WHERE user_id = ${actor.userId ?? null} AND locale_code = ${edit.locale}`);
        if (granted.length === 0) refuse("forbidden_locale");
      }
      const locked = await lockProduct(db, edit.productId, edit.updatedAt);
      const taken = await db
        .select({ slug: productTranslation.slug })
        .from(productTranslation)
        .where(
          and(
            eq(productTranslation.localeCode, edit.locale),
            ne(productTranslation.productId, locked.id),
          ),
        );
      const violations = [
        ...slugViolations(edit.slug),
        ...slugUniqueViolations(
          edit.slug,
          new Set(taken.map((row) => row.slug)),
        ),
        ...copyViolations(
          {
            name: edit.name,
            description: edit.description,
            seoTitle: edit.seoTitle,
            seoDescription: edit.seoDescription,
          },
          { floristTerms: await floristTerms(db) },
        ),
      ];
      if (hardViolations(violations).length > 0) {
        refuse("rules", hardViolations(violations));
      }
      if (
        softViolations(violations).length > 0 &&
        edit.overrideReason === undefined
      ) {
        refuse("reason_required", softViolations(violations));
      }
      const [current] = await db
        .select({ slug: productTranslation.slug })
        .from(productTranslation)
        .where(
          and(
            eq(productTranslation.productId, locked.id),
            eq(productTranslation.localeCode, edit.locale),
          ),
        );
      if (
        current !== undefined &&
        current.slug !== edit.slug &&
        (await isExposedIn(db, locked.id))
      ) {
        refuse("exposed", [violation("slug.shape", "slug")]);
      }
      const text = {
        name: edit.name,
        slug: edit.slug,
        descriptionMd: edit.description === "" ? null : edit.description,
        seoTitle: edit.seoTitle === "" ? null : edit.seoTitle,
        seoDescription: edit.seoDescription === "" ? null : edit.seoDescription,
        translationStatus: "human",
      };
      await db
        .insert(productTranslation)
        .values({ productId: locked.id, localeCode: edit.locale, ...text })
        .onConflictDoUpdate({
          target: [productTranslation.productId, productTranslation.localeCode],
          set: text,
        });
      await bumpProduct(db, locked.id);
      const priced = await pricedIn(db, locked.id);
      return {
        value: { productId: locked.id },
        command:
          priced.length === 0
            ? { kind: "structural" }
            : { kind: "copy", sku: locked.sku, pricedIn: priced },
      };
    },
  );
}

/** One `draft → active` precondition of §2.5. */
export type ActivationCondition =
  "en_copy" | "sizes" | "primary_photo" | "price";

/** The unmet `draft → active` preconditions of a product, in §2.5's order. */
export async function activationUnmet(
  db: DbTransaction,
  productId: string,
): Promise<ActivationCondition[]> {
  const rows = await db.execute<{
    en: boolean;
    tiers: number;
    defaults: number;
    photo: boolean;
    price: boolean;
  }>(sql`
    SELECT
      EXISTS (SELECT 1 FROM product_translation t WHERE t.product_id = ${productId}
               AND t.locale_code = 'en' AND btrim(t.name) <> '' AND btrim(t.slug) <> ''
               AND btrim(coalesce(t.description_md, '')) <> '') AS en,
      (SELECT count(*)::int FROM product_tier WHERE product_id = ${productId}) AS tiers,
      (SELECT count(*)::int FROM product_tier WHERE product_id = ${productId} AND is_default) AS defaults,
      EXISTS (SELECT 1 FROM product_media pm JOIN media_asset a ON a.id = pm.media_asset_id
               WHERE pm.product_id = ${productId} AND pm.is_primary
                 AND a.review_state = 'approved') AS photo,
      EXISTS (SELECT 1 FROM country_price WHERE product_id = ${productId}
               AND active_to IS NULL AND surcharge_kind IS NULL) AS price`);
  const row = rows[0];
  const unmet: ActivationCondition[] = [];
  if (row?.en !== true) unmet.push("en_copy");
  if (row === undefined || row.tiers < 1 || row.defaults !== 1)
    unmet.push("sizes");
  if (row?.photo !== true) unmet.push("primary_photo");
  if (row?.price !== true) unmet.push("price");
  return unmet;
}

/** `setProductStatus` (`ProductStatusChangeSchema`): `draft → active`, `→ retired`. */
export async function setProductStatus(
  actor: CatalogueActor,
  input: unknown,
  deps: Partial<CatalogueDeps> = {},
): Promise<CatalogueResult<{ productId: string; status: string }>> {
  const parsed = ProductStatusChangeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid", violations: [] };
  const change = parsed.data;
  return command(
    actor,
    CATALOGUE_ACTIONS.status,
    undefined,
    deps,
    async (db) => {
      const locked = await lockProduct(db, change.productId, change.updatedAt);
      if (change.status === "active") {
        if (locked.status !== "draft") refuse("transition");
        const unmet = await activationUnmet(db, locked.id);
        if (unmet.length > 0) refuse("preconditions", [], unmet);
        await db
          .update(product)
          .set({ status: "active", updatedAt: sql`clock_timestamp()` })
          .where(eq(product.id, locked.id));
      } else {
        if (locked.status === "retired") refuse("transition");
        if (await isExposedIn(db, locked.id)) refuse("exposed");
        await db
          .update(product)
          .set({
            status: "retired",
            retiredAt: sql`now()`,
            updatedAt: sql`clock_timestamp()`,
          })
          .where(eq(product.id, locked.id));
      }
      return {
        value: { productId: locked.id, status: change.status },
        command: { kind: "structural" },
      };
    },
  );
}

/* -------------------------------------------------------------------------- */
/* prices                                                                     */
/* -------------------------------------------------------------------------- */

interface PriceContext {
  readonly countryId: string;
  readonly iso2: string;
  readonly currency: CurrencyCode;
  readonly today: string;
  readonly vatRateBp: number;
  readonly open: {
    readonly id: string;
    readonly retailMinor: number;
    readonly activeFrom: string;
  } | null;
  readonly lowestMinor: number | null;
}

/** The country, today in its zone, its VAT rate, the open row and the 30-day lowest. */
async function priceContext(
  db: DbTransaction,
  productId: string,
  iso2: string,
  tierKey: string,
  now: Date,
  lock: boolean,
): Promise<PriceContext> {
  const countries = await db.execute<{
    id: string;
    currency: string;
    today: string;
  }>(sql`
    SELECT id, currency_code AS currency,
           to_char((${now.toISOString()}::timestamptz AT TIME ZONE iana_zone)::date, 'YYYY-MM-DD') AS today
      FROM country WHERE iso2 = ${iso2}`);
  const target = countries[0];
  if (target === undefined || !isCurrencyCode(target.currency))
    refuse("not_found");
  const openRows = await db.execute<{
    id: string;
    retailMinor: number;
    from: string;
  }>(sql`
    SELECT id, retail_minor::int AS "retailMinor", to_char(active_from, 'YYYY-MM-DD') AS from
      FROM country_price
     WHERE product_id = ${productId} AND country_id = ${target.id}
       AND tier_key = ${tierKey} AND surcharge_kind IS NULL AND active_to IS NULL
     ${lock ? sql`FOR UPDATE` : sql``}`);
  const open = openRows[0];
  const vat = await db.execute<{ bp: number }>(sql`
    SELECT vat_rate_bp AS bp FROM country_price
     WHERE country_id = ${target.id} AND surcharge_kind IS NULL
     ORDER BY (product_id = ${productId}) DESC, active_from DESC LIMIT 1`);
  const lowest = await db.execute<{ lowestMinor: number | null }>(sql`
    SELECT min(retail_minor)::int AS "lowestMinor" FROM country_price
     WHERE product_id = ${productId} AND country_id = ${target.id}
       AND tier_key = ${tierKey} AND surcharge_kind IS NULL
       AND active_from <= ${target.today}::date
       AND (active_to IS NULL OR active_to > ${target.today}::date - 30)`);
  const vatRow = vat[0];
  if (vatRow === undefined) refuse("no_vat_rate");
  const lowestMinor = lowest[0]?.lowestMinor ?? null;
  return {
    countryId: target.id,
    iso2,
    currency: target.currency,
    today: target.today,
    vatRateBp: vatRow.bp,
    open:
      open === undefined
        ? null
        : {
            id: open.id,
            retailMinor: open.retailMinor,
            activeFrom: open.from,
          },
    lowestMinor,
  };
}

/** The dated EUR mid rates in force on `today` (spec 005's `fx_rate`). */
async function ratesOn(db: DbTransaction, today: string): Promise<DatedRates> {
  const rows = await db.execute<{
    quote: string;
    ppm: string;
    asOf: string;
  }>(sql`
    SELECT quote_code AS quote, rate_ppm::text AS ppm, to_char(as_of, 'YYYY-MM-DD') AS "asOf"
      FROM fx_rate
     WHERE base_code = 'EUR'
       AND as_of = (SELECT max(as_of) FROM fx_rate WHERE base_code = 'EUR' AND as_of <= ${today}::date)`);
  const ratePpm: Partial<Record<CurrencyCode, number>> = {};
  for (const row of rows) {
    if (isCurrencyCode(row.quote))
      ratePpm[row.quote] = Number.parseInt(row.ppm, 10);
  }
  return { base: "EUR", asOf: rows[0]?.asOf ?? today, ratePpm };
}

/** Active and onboarding florists mapped to (product, size), with their payouts. */
async function payoutsFor(
  db: DbTransaction,
  productId: string,
  tierKey: string,
): Promise<
  { partnerCode: string; amountMinor: number; currency: CurrencyCode }[]
> {
  const rows = await db.execute<{
    code: string;
    payoutMinor: number;
    currency: string;
  }>(sql`
    SELECT fp.code, m.partner_payout_minor::int AS "payoutMinor", m.currency_code AS currency
      FROM partner_catalog_mapping m JOIN fulfillment_partner fp ON fp.id = m.partner_id
     WHERE m.product_id = ${productId} AND (m.tier_key = ${tierKey} OR m.tier_key IS NULL)
       AND m.can_fulfil AND fp.status IN ('active', 'onboarding')
     ORDER BY fp.code`);
  return rows.flatMap((row) =>
    isCurrencyCode(row.currency)
      ? [
          {
            partnerCode: row.code,
            amountMinor: row.payoutMinor,
            currency: row.currency,
          },
        ]
      : [],
  );
}

export interface PriceCheck {
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
  readonly preview: PricePreview;
  readonly margin: MarginView;
  readonly verdict: MarginVerdict;
  readonly suggestedMinor: number | null;
  readonly violations: readonly Violation[];
  readonly sameDay: boolean;
  readonly today: string;
}

/** Everything the price confirmation shows, and what the save would refuse. Reads only. */
async function checkPrice(
  db: DbTransaction,
  change: z.infer<typeof PriceChangeSchema>,
  now: Date,
  lock: boolean,
): Promise<{ check: PriceCheck; context: PriceContext }> {
  const ctx = await priceContext(
    db,
    change.productId,
    change.countryIso2,
    change.tierKey,
    now,
    lock,
  );
  const parsed = parseMinorInput(change.amountText, ctx.currency);
  if (!parsed.ok)
    refuse("invalid", [violation("price.integer_minor", "amount")]);
  const [bandRow] = await db
    .select({ priceTier: product.priceTier, productType: product.productType })
    .from(product)
    .where(eq(product.id, change.productId));
  if (bandRow === undefined) refuse("not_found");
  const violations = priceViolations({
    amountMinor: parsed.amountMinor,
    currency: ctx.currency,
    countryCurrency: ctx.currency,
  });
  const margin = marginView({
    grossMinor: parsed.amountMinor,
    currency: ctx.currency,
    vatRateBp: ctx.vatRateBp,
    payouts: await payoutsFor(db, change.productId, change.tierKey),
    rates: await ratesOn(db, ctx.today),
  });
  return {
    context: ctx,
    check: {
      amountMinor: parsed.amountMinor,
      currency: ctx.currency,
      preview: pricePreview({
        currency: ctx.currency,
        oldMinor: ctx.open?.retailMinor ?? null,
        newMinor: parsed.amountMinor,
        lowestMinor: ctx.lowestMinor,
      }),
      margin,
      verdict: marginVerdict(margin),
      suggestedMinor:
        margin.highestPayoutMinor === null
          ? null
          : suggestedPrice(
              margin.highestPayoutMinor,
              ctx.currency,
              ctx.vatRateBp,
            ),
      violations,
      sameDay: ctx.open?.activeFrom === ctx.today,
      today: ctx.today,
    },
  };
}

/** The confirmation's numbers for a typed price (no write). */
export async function previewPriceChange(
  actor: CatalogueActor,
  input: unknown,
  deps: Partial<CatalogueDeps> = {},
): Promise<CatalogueResult<PriceCheck>> {
  const parsed = PriceChangeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid", violations: [] };
  const all = { ...defaultDeps, ...deps };
  try {
    const { check } = await all.run(
      context(actor, CATALOGUE_ACTIONS.view),
      (db) => checkPrice(db, parsed.data, all.now(), false),
    );
    return { ok: true, value: check };
  } catch (error) {
    if (error instanceof Refused) return error.refusal;
    throw error;
  }
}

/** Refuses on a hard rule or a loss; asks for a reason on a soft rule or a high payout share. */
function judge(check: PriceCheck, reason: string | undefined): void {
  if (hardViolations(check.violations).length > 0) {
    refuse("rules", hardViolations(check.violations));
  }
  if (check.verdict === "below_payout") refuse("below_payout");
  const needsReason =
    softViolations(check.violations).length > 0 ||
    check.verdict === "share_high";
  if (needsReason && reason === undefined) {
    refuse("reason_required", softViolations(check.violations));
  }
}

async function insertOpenRow(
  db: DbTransaction,
  productId: string,
  tierKey: string,
  ctx: PriceContext,
  amountMinor: number,
): Promise<void> {
  await db.insert(countryPrice).values({
    productId,
    countryId: ctx.countryId,
    tierKey,
    retailMinor: BigInt(amountMinor),
    currencyCode: ctx.currency,
    vatRateBp: ctx.vatRateBp,
    surchargeKind: null,
    activeFrom: ctx.today,
    activeTo: null,
    source: "real",
  });
}

/**
 * `supersedePrice` (`PriceChangeSchema`): closes the open row today in the country's zone and
 * opens a new one; never updates `retail_minor`. A second change of the same key on the same day
 * is refused (spec 002's `active_to > active_from` makes it a database fact too).
 */
export async function supersedePrice(
  actor: CatalogueActor,
  input: unknown,
  deps: Partial<CatalogueDeps> = {},
): Promise<CatalogueResult<{ amountMinor: number; activeFrom: string }>> {
  const parsed = PriceChangeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid", violations: [] };
  const change = parsed.data;
  return command(
    actor,
    CATALOGUE_ACTIONS.price,
    change.overrideReason,
    deps,
    async (db, all) => {
      const locked = await lockProduct(db, change.productId, undefined);
      const { check, context: ctx } = await checkPrice(
        db,
        change,
        all.now(),
        true,
      );
      judge(check, change.overrideReason);
      if (ctx.open !== null) {
        if (check.sameDay) refuse("same_day");
        await db
          .update(countryPrice)
          .set({ activeTo: ctx.today })
          .where(
            and(
              eq(countryPrice.id, ctx.open.id),
              isNull(countryPrice.activeTo),
            ),
          );
      }
      await insertOpenRow(
        db,
        locked.id,
        change.tierKey,
        ctx,
        check.amountMinor,
      );
      await bumpProduct(db, locked.id);
      return {
        value: { amountMinor: check.amountMinor, activeFrom: ctx.today },
        command: { kind: "price", sku: locked.sku, iso2: ctx.iso2 },
      };
    },
  );
}

/**
 * `replaceDraftPrice` (`DraftPriceReplaceSchema`): for a product never made active, the open row
 * of the key is deleted and re-entered, any number of times a day. Refused once `first_active_at`
 * is set (the database refuses the `DELETE` then too).
 */
export async function replaceDraftPrice(
  actor: CatalogueActor,
  input: unknown,
  deps: Partial<CatalogueDeps> = {},
): Promise<CatalogueResult<{ amountMinor: number }>> {
  const parsed = PriceChangeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid", violations: [] };
  const change = parsed.data;
  return command(
    actor,
    CATALOGUE_ACTIONS.draftPrice,
    change.overrideReason,
    deps,
    async (db, all) => {
      const locked = await lockProduct(db, change.productId, undefined);
      if (locked.firstActiveAt !== null) refuse("not_draft");
      const { check, context: ctx } = await checkPrice(
        db,
        change,
        all.now(),
        true,
      );
      judge(check, change.overrideReason);
      if (ctx.open !== null) {
        await db.delete(countryPrice).where(eq(countryPrice.id, ctx.open.id));
      }
      await insertOpenRow(
        db,
        locked.id,
        change.tierKey,
        ctx,
        check.amountMinor,
      );
      await bumpProduct(db, locked.id);
      return {
        value: { amountMinor: check.amountMinor },
        command: { kind: "price", sku: locked.sku, iso2: ctx.iso2 },
      };
    },
  );
}

/**
 * `removeFromCountry` (`ProductDelistSchema`): closes every open price of the product in the
 * country with no successor. Refused for an exposed product (AC-16); a never-active product's
 * rows are deleted instead, and a row opened today on an active product cannot close today.
 */
export async function removeFromCountry(
  actor: CatalogueActor,
  input: unknown,
  deps: Partial<CatalogueDeps> = {},
): Promise<CatalogueResult<{ closed: number }>> {
  const parsed = ProductDelistSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid", violations: [] };
  const change = parsed.data;
  return command(
    actor,
    CATALOGUE_ACTIONS.delist,
    undefined,
    deps,
    async (db, all) => {
      const locked = await lockProduct(db, change.productId, undefined);
      if (await isExposedIn(db, locked.id)) refuse("exposed");
      const [target] = await db
        .select({ id: country.id })
        .from(country)
        .where(eq(country.iso2, change.countryIso2));
      if (target === undefined) refuse("not_found");
      const ctx = await priceContext(
        db,
        locked.id,
        change.countryIso2,
        "",
        all.now(),
        false,
      );
      const open = await db
        .select({ id: countryPrice.id, activeFrom: countryPrice.activeFrom })
        .from(countryPrice)
        .where(
          and(
            eq(countryPrice.productId, locked.id),
            eq(countryPrice.countryId, target.id),
            isNull(countryPrice.activeTo),
          ),
        )
        .for("update");
      for (const row of open) {
        if (locked.firstActiveAt === null) {
          await db.delete(countryPrice).where(eq(countryPrice.id, row.id));
        } else if (row.activeFrom === ctx.today) {
          refuse("same_day");
        } else {
          await db
            .update(countryPrice)
            .set({ activeTo: ctx.today })
            .where(eq(countryPrice.id, row.id));
        }
      }
      await bumpProduct(db, locked.id);
      return {
        value: { closed: open.length },
        command: { kind: "structural" },
      };
    },
  );
}

/* -------------------------------------------------------------------------- */
/* reads                                                                      */
/* -------------------------------------------------------------------------- */

export interface CatalogueListRow {
  readonly id: string;
  readonly sku: string;
  readonly name: string | null;
  readonly productType: (typeof productTypes)[number];
  readonly status: "draft" | "active" | "retired";
  readonly source: string;
  readonly pricedIn: number;
  readonly florists: readonly string[];
  readonly copyLocales: readonly string[];
}

export const CatalogueListFilterSchema = z
  .object({
    status: z.enum(["draft", "active", "retired"]).optional().catch(undefined),
    type: z.enum(productTypes).optional().catch(undefined),
    source: z.enum(["seed", "real"]).optional().catch(undefined),
  })
  .catch({});
export type CatalogueListFilter = z.infer<typeof CatalogueListFilterSchema>;

/** `/admin/catalogue/products`: every product, newest first, with the filters applied. */
export async function catalogueList(
  actor: CatalogueActor,
  filter: CatalogueListFilter,
  run: AdminRunner = adminRunner,
): Promise<readonly CatalogueListRow[]> {
  return run(context(actor, CATALOGUE_ACTIONS.list), async (db) => {
    const rows = await db.execute<{
      id: string;
      sku: string;
      name: string | null;
      type: string;
      status: string;
      source: string;
      priced: number;
      florists: string[] | null;
      locales: string[] | null;
    }>(sql`
      SELECT p.id, p.sku, t.name, p.product_type AS type, p.status, p.source,
             (SELECT count(DISTINCT country_id)::int FROM country_price cp
               WHERE cp.product_id = p.id AND cp.active_to IS NULL) AS priced,
             (SELECT array_agg(DISTINCT fp.code ORDER BY fp.code) FROM partner_catalog_mapping m
               JOIN fulfillment_partner fp ON fp.id = m.partner_id
              WHERE m.product_id = p.id AND fp.status <> 'demo') AS florists,
             (SELECT array_agg(locale_code ORDER BY locale_code) FROM product_translation
               WHERE product_id = p.id) AS locales
        FROM product p
        LEFT JOIN product_translation t ON t.product_id = p.id AND t.locale_code = 'en'
       WHERE (${filter.status ?? null}::text IS NULL OR p.status = ${filter.status ?? null})
         AND (${filter.type ?? null}::text IS NULL OR p.product_type = ${filter.type ?? null})
         AND (${filter.source ?? null}::text IS NULL OR p.source = ${filter.source ?? null})
       ORDER BY p.created_at DESC, p.sku`);
    return rows.map((row) => ({
      id: row.id,
      sku: row.sku,
      name: row.name,
      productType: z.enum(productTypes).parse(row.type),
      status: z.enum(["draft", "active", "retired"]).parse(row.status),
      source: row.source,
      pricedIn: row.priced,
      florists: row.florists ?? [],
      copyLocales: row.locales ?? [],
    }));
  });
}

export interface EditorTier {
  readonly tierKey: string;
  readonly stems: number | null;
  readonly sort: number;
  readonly isDefault: boolean;
}

export interface EditorCopy {
  readonly locale: string;
  readonly name: string;
  readonly slug: string;
  readonly description: string;
  readonly seoTitle: string;
  readonly seoDescription: string;
  readonly reviewed: boolean;
}

export interface EditorPrice {
  readonly iso2: string;
  readonly currency: string;
  readonly countryStatus: string;
  readonly tierKey: string;
  readonly retailMinor: number;
  readonly activeFrom: string;
}

export interface EditorMapping {
  readonly partnerId: string;
  readonly code: string;
  readonly tierKey: string | null;
  readonly payoutMinor: number;
  readonly currency: string;
}

export interface ProductEditorView {
  readonly id: string;
  readonly sku: string;
  readonly details: Omit<
    ProductEdit,
    "productId" | "updatedAt" | "sku" | "supplier"
  >;
  readonly status: string;
  readonly source: string;
  readonly firstActiveAt: Date | null;
  readonly updatedAt: Date;
  readonly tiers: readonly EditorTier[];
  readonly copy: readonly EditorCopy[];
  readonly prices: readonly EditorPrice[];
  readonly mappings: readonly EditorMapping[];
  readonly exposed: boolean;
  readonly windowOpen: boolean;
  readonly unmet: readonly ActivationCondition[];
  readonly countries: readonly {
    iso2: string;
    currency: string;
    status: string;
  }[];
  readonly florists: readonly {
    id: string;
    code: string;
    status: string;
    currency: string;
  }[];
  readonly reviewerLocales: readonly string[];
}

/** `/admin/catalogue/products/[sku]`: the editor's whole read, in one admin transaction. */
export async function productEditorView(
  actor: CatalogueActor,
  sku: string,
  run: AdminRunner = adminRunner,
): Promise<ProductEditorView | undefined> {
  return run(context(actor, CATALOGUE_ACTIONS.view), async (db) => {
    const [row] = await db.select().from(product).where(eq(product.sku, sku));
    if (row === undefined) return undefined;
    const tiers = await db
      .select({
        tierKey: productTier.tierKey,
        stems: productTier.stems,
        sort: productTier.sort,
        isDefault: productTier.isDefault,
      })
      .from(productTier)
      .where(eq(productTier.productId, row.id))
      .orderBy(asc(productTier.sort), asc(productTier.tierKey));
    const copy = await db
      .select()
      .from(productTranslation)
      .where(eq(productTranslation.productId, row.id));
    const prices = await db.execute<{
      iso2: string;
      currency: string;
      status: string;
      tier: string | null;
      retailMinor: number;
      from: string;
    }>(sql`
      SELECT c.iso2, cp.currency_code AS currency, c.status, cp.tier_key AS tier,
             cp.retail_minor::int AS "retailMinor", to_char(cp.active_from, 'YYYY-MM-DD') AS from
        FROM country_price cp JOIN country c ON c.id = cp.country_id
       WHERE cp.product_id = ${row.id} AND cp.active_to IS NULL AND cp.surcharge_kind IS NULL
       ORDER BY c.iso2, cp.tier_key`);
    const mappings = await db.execute<{
      partnerId: string;
      code: string;
      tier: string | null;
      payoutMinor: number;
      currency: string;
    }>(sql`
      SELECT fp.id AS "partnerId", fp.code, m.tier_key AS tier,
             m.partner_payout_minor::int AS "payoutMinor", m.currency_code AS currency
        FROM partner_catalog_mapping m JOIN fulfillment_partner fp ON fp.id = m.partner_id
       WHERE m.product_id = ${row.id} AND fp.status <> 'demo'
       ORDER BY fp.code, m.tier_key`);
    const countries = await db.execute<{
      iso2: string;
      currency: string;
      status: string;
    }>(sql`
      SELECT iso2, currency_code AS currency, status FROM country
       WHERE status <> 'disabled' ORDER BY iso2`);
    const florists = await db.execute<{
      id: string;
      code: string;
      status: string;
      currency: string;
    }>(sql`
      SELECT id, code, status, payout_currency_code AS currency FROM fulfillment_partner
       WHERE status IN ('active', 'onboarding') ORDER BY code`);
    const reviewer = await db.execute<{ locale: string }>(sql`
      SELECT locale_code AS locale FROM reviewer_locale WHERE user_id = ${actor.userId ?? null}`);
    return {
      id: row.id,
      sku: row.sku,
      details: {
        productType: z.enum(productTypes).parse(row.productType),
        primaryFlower: z.enum(flowerTypes).parse(row.primaryFlower),
        colourPrimary: z.enum(colours).parse(row.colourPrimary),
        style: z.enum(styles).parse(row.style),
        priceTier: z.enum(priceTiers).parse(row.priceTier),
        substitutionClass: z
          .enum(substitutionClasses)
          .parse(row.substitutionClass),
        vaseIncluded: row.vaseIncluded,
        stemCount: row.stemCount,
        freshnessDays: row.freshnessDays,
        partnerOnly: row.partnerOnly,
      },
      status: row.status,
      source: row.source,
      firstActiveAt: row.firstActiveAt,
      updatedAt: row.updatedAt,
      tiers,
      copy: launchLocales.flatMap((locale) => {
        const text = copy.find((item) => item.localeCode === locale);
        return text === undefined
          ? []
          : [
              {
                locale,
                name: text.name,
                slug: text.slug,
                description: text.descriptionMd ?? "",
                seoTitle: text.seoTitle ?? "",
                seoDescription: text.seoDescription ?? "",
                reviewed: text.reviewed,
              },
            ];
      }),
      prices: prices.map((price) => ({
        iso2: price.iso2,
        currency: price.currency,
        countryStatus: price.status,
        tierKey: price.tier ?? "",
        retailMinor: price.retailMinor,
        activeFrom: price.from,
      })),
      mappings: mappings.map((mapping) => ({
        partnerId: mapping.partnerId,
        code: mapping.code,
        tierKey: mapping.tier,
        payoutMinor: mapping.payoutMinor,
        currency: mapping.currency,
      })),
      exposed: await isExposedIn(db, row.id),
      windowOpen: await placeholderWindowOpen(db),
      unmet: row.status === "draft" ? await activationUnmet(db, row.id) : [],
      countries: [...countries],
      florists: [...florists],
      reviewerLocales: reviewer.map((item) => item.locale),
    };
  });
}

/** The margin view of each size in one country, for the margin tab. */
export async function marginTab(
  actor: CatalogueActor,
  productId: string,
  iso2: string,
  deps: Partial<CatalogueDeps> = {},
): Promise<
  readonly {
    tierKey: string;
    margin: MarginView;
    verdict: MarginVerdict;
    suggestedMinor: number | null;
  }[]
> {
  const all = { ...defaultDeps, ...deps };
  return all.run(context(actor, CATALOGUE_ACTIONS.view), async (db) => {
    const tiers = await db
      .select({ tierKey: productTier.tierKey })
      .from(productTier)
      .where(eq(productTier.productId, productId))
      .orderBy(asc(productTier.sort));
    const out = [];
    for (const tier of tiers) {
      try {
        const ctx = await priceContext(
          db,
          productId,
          iso2,
          tier.tierKey,
          all.now(),
          false,
        );
        if (ctx.open === null) continue;
        const view = marginView({
          grossMinor: ctx.open.retailMinor,
          currency: ctx.currency,
          vatRateBp: ctx.vatRateBp,
          payouts: await payoutsFor(db, productId, tier.tierKey),
          rates: await ratesOn(db, ctx.today),
        });
        out.push({
          tierKey: tier.tierKey,
          margin: view,
          verdict: marginVerdict(view),
          suggestedMinor:
            view.highestPayoutMinor === null
              ? null
              : suggestedPrice(
                  view.highestPayoutMinor,
                  ctx.currency,
                  ctx.vatRateBp,
                ),
        });
      } catch (error) {
        if (error instanceof Refused) continue;
        throw error;
      }
    }
    return out;
  });
}

/** The florists a bouquet may come from: onboarding and active, never demo (the supplier picker). */
export async function catalogueSuppliers(
  actor: CatalogueActor,
  run: AdminRunner = adminRunner,
): Promise<readonly { id: string; code: string; currency: string }[]> {
  return run(context(actor, CATALOGUE_ACTIONS.view), async (db) => {
    const rows = await db.execute<{
      id: string;
      code: string;
      currency: string;
    }>(sql`
      SELECT id, code, payout_currency_code AS currency FROM fulfillment_partner
       WHERE status IN ('active', 'onboarding') ORDER BY code`);
    return [...rows];
  });
}
