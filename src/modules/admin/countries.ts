/**
 * Countries in admin: the list, the read-only country page, the go-live preflight, the status
 * flip and the two go-live fiscal fields (spec 012b §2.8, §5.2, §5.4; AC-25, AC-39 preflight
 * half, §14 A-orchestrator-2026-10-20a; TASK-300).
 *
 * The rules are `@/modules/geo`'s (`go-live.ts`: the schemas, the reasons, the status graph);
 * this file gathers the facts from the database and runs the two commands, each in **one admin
 * transaction** carrying its audit action, so spec 012's `audit_row_change()` writes the audit
 * row and `status_flip_guard()` admits the status change (it refuses any write outside the admin
 * context). It lives in the admin module rather than in `src/modules/geo` because the
 * saleable-products count reads the catalogue's floor and the catalogue module imports geo.
 *
 *  - `goLivePreflight(iso2)`: read-only, any status; one reason per unmet condition.
 *  - `setCountryStatus`: `demo → live` only with the typed ISO code and an empty preflight (re-run
 *    inside the same locked transaction); `live → demo`, `demo ↔ disabled`; `live → disabled`
 *    refused. After the commit: `invalidate()` once with the §5.4 flip set, then a publish
 *    request exactly when the existence diff is not empty. `first_live_at` is set once by
 *    `0044`'s trigger, never here.
 *  - `setGoLiveFiscalFields`: `vat_rate_bp` and `supply_model`, each only while null, with the
 *    `country.status` permission and the accountant's answer as the audit reason; writes no other
 *    column; `invalidate()` once with the country facts set.
 *
 * Every write takes the caller's roles and refuses without `country.status` before opening a
 * transaction, so a refusal changes nothing (the page's action calls `requirePermission` first
 * as well). The runner, the cache and the publish request are parameters so the integration suite
 * drives the commands against a scratch database.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { countryStatuses } from "@/config/countries";
import { isSanctionedDestination } from "@/config/sanctions";
import { applyCommand, commandOutcome } from "@/lib/command-tags";
import type { DbActor, DbTransaction } from "@/lib/db";
import { existenceDiff, productCountFloor } from "@/modules/catalog";
import {
  CountryStatusFlipSchema,
  GoLiveFiscalFieldsSchema,
  type PreflightReason,
  type PreflightResult,
  confirmsCode,
  evaluatePreflight,
  flipRefusal,
  listCorridorContent,
} from "@/modules/geo";

import { type AdminRole, can } from "./permissions";
import { type AdminRunner, adminRunner } from "./users";

/** The audit actions (lowercase and dotted, `audit_log_action_check`). */
export const COUNTRY_ACTIONS = Object.freeze({
  list: "countries.list",
  read: "countries.read",
  status: "country.status_changed",
  fiscal: "country.fiscal.set",
} as const);

const Iso2Schema = z.string().regex(/^[A-Z]{2}$/u);

/* -------------------------------------------------------------------------- */
/* Facts                                                                      */
/* -------------------------------------------------------------------------- */

/** One country row with the counts the list and the preflight read. */
const CountryFactsRowSchema = z.object({
  id: z.uuid(),
  iso2: Iso2Schema,
  status: z.enum(countryStatuses),
  vat_rate_bp: z.number().int().nullable(),
  supply_model: z.string().nullable(),
  iana_zone: z.string(),
  same_day_cutoff_local: z.string().nullable(),
  delivery_days: z.array(z.string()),
  sunday_delivery: z.enum(["none", "peak", "always"]),
  guide_published: z.boolean(),
  first_live_at: z.coerce.date().nullable(),
  real_florists: z.coerce.number().int(),
  priced_products: z.coerce.number().int(),
  saleable_products: z.coerce.number().int(),
});
type CountryFactsRow = z.infer<typeof CountryFactsRowSchema>;

/*
 * "Open price": a base row (no surcharge) whose window holds the country's own calendar day.
 * "Can be bought" (§2.8, AC-39): `active`, an open price, an approved primary photo, and listed
 * by `saleable_offer` (an `active`, never `demo`, florist with a mapping and coverage there).
 */
const FACTS_SELECT = sql`
  SELECT c.id, c.iso2, c.status, c.vat_rate_bp, c.supply_model, c.iana_zone,
         to_char(c.same_day_cutoff_local, 'HH24:MI') AS same_day_cutoff_local,
         c.delivery_days, c.sunday_delivery, c.guide_published, c.first_live_at,
         (SELECT count(DISTINCT fp.id)
            FROM public.fulfillment_partner fp
            JOIN public.partner_coverage pc ON pc.partner_id = fp.id
            LEFT JOIN public.postcode_zone z ON z.id = pc.postcode_zone_id
            JOIN public.city ci ON ci.id = coalesce(pc.city_id, z.city_id)
           WHERE fp.status = 'active' AND ci.country_id = c.id) AS real_florists,
         (SELECT count(DISTINCT p.id)
            FROM public.product p
           WHERE p.status <> 'retired'
             AND EXISTS (SELECT 1 FROM public.country_price cp
                          WHERE cp.product_id = p.id AND cp.country_id = c.id
                            AND cp.surcharge_kind IS NULL
                            AND cp.active_from <= (now() AT TIME ZONE c.iana_zone)::date
                            AND (cp.active_to IS NULL
                                 OR cp.active_to > (now() AT TIME ZONE c.iana_zone)::date))
         ) AS priced_products,
         (SELECT count(DISTINCT p.id)
            FROM public.product p
           WHERE p.status = 'active'
             AND EXISTS (SELECT 1 FROM public.country_price cp
                          WHERE cp.product_id = p.id AND cp.country_id = c.id
                            AND cp.surcharge_kind IS NULL
                            AND cp.active_from <= (now() AT TIME ZONE c.iana_zone)::date
                            AND (cp.active_to IS NULL
                                 OR cp.active_to > (now() AT TIME ZONE c.iana_zone)::date))
             AND EXISTS (SELECT 1 FROM public.product_media pm
                           JOIN public.media_asset ma ON ma.id = pm.media_asset_id
                          WHERE pm.product_id = p.id AND pm.is_primary
                            AND ma.review_state = 'approved')
             AND EXISTS (SELECT 1 FROM public.saleable_offer so
                          WHERE so.product_id = p.id AND so.country_id = c.id)
         ) AS saleable_products
  FROM public.country c`;

async function readFacts(
  db: DbTransaction,
  iso2?: string,
  lock = false,
): Promise<CountryFactsRow[]> {
  const where = iso2 === undefined ? sql`` : sql` WHERE c.iso2 = ${iso2}`;
  const order = iso2 === undefined ? sql` ORDER BY c.iso2` : sql``;
  const forUpdate = lock ? sql` FOR UPDATE OF c` : sql``;
  const rows = await db.execute(
    sql`${FACTS_SELECT}${where}${order}${forUpdate}`,
  );
  return rows.map((row) => CountryFactsRowSchema.parse(row));
}

/** Whether `iso2` has a reviewed `en` corridor text in its live state (the repository corpus). */
export function corridorReviewedInEnglish(iso2: string): boolean {
  return listCorridorContent().some(
    (content) =>
      content.iso2 === iso2 &&
      content.locale === "en" &&
      content.state === "live" &&
      content.reviewed,
  );
}

/** The two facts the preflight reads outside the database; parameters so a test can set them. */
export interface PreflightSources {
  readonly corridorReviewed: (iso2: string) => boolean;
  readonly sanctioned: (iso2: string) => boolean;
}

export const defaultPreflightSources: PreflightSources = {
  corridorReviewed: corridorReviewedInEnglish,
  sanctioned: isSanctionedDestination,
};

function preflightOf(
  row: CountryFactsRow,
  sources: PreflightSources,
): PreflightResult {
  return evaluatePreflight({
    iso2: row.iso2,
    operationsComplete:
      row.same_day_cutoff_local !== null && row.delivery_days.length > 0,
    vatRateBp: row.vat_rate_bp,
    supplyModel: row.supply_model,
    realFlorists: row.real_florists,
    saleableProducts: row.saleable_products,
    productFloor: productCountFloor(),
    corridorReviewed: sources.corridorReviewed(row.iso2),
    sanctioned: sources.sanctioned(row.iso2),
  });
}

/** `goLivePreflight(iso2)` (§5.2): read-only, any status. `undefined` for an unknown code. */
export async function goLivePreflight(
  actor: DbActor,
  iso2: string,
  run: AdminRunner = adminRunner,
  sources: PreflightSources = defaultPreflightSources,
): Promise<PreflightResult | undefined> {
  const code = Iso2Schema.safeParse(iso2);
  if (!code.success) return undefined;
  return run({ ...actor, action: COUNTRY_ACTIONS.read }, async (db) => {
    const [row] = await readFacts(db, code.data);
    return row === undefined ? undefined : preflightOf(row, sources);
  });
}

/* -------------------------------------------------------------------------- */
/* Reads for the two pages                                                    */
/* -------------------------------------------------------------------------- */

/** One row of `/admin/countries`. */
export interface CountryListRow {
  readonly iso2: string;
  readonly status: (typeof countryStatuses)[number];
  readonly firstLiveAt: Date | null;
  readonly guidePublished: boolean;
  readonly realFlorists: number;
  readonly pricedProducts: number;
  readonly saleableProducts: number;
  readonly preflight: PreflightResult;
}

function listRowOf(
  row: CountryFactsRow,
  sources: PreflightSources,
): CountryListRow {
  return {
    iso2: row.iso2,
    status: row.status,
    firstLiveAt: row.first_live_at,
    guidePublished: row.guide_published,
    realFlorists: row.real_florists,
    pricedProducts: row.priced_products,
    saleableProducts: row.saleable_products,
    preflight: preflightOf(row, sources),
  };
}

export async function listCountries(
  actor: DbActor,
  run: AdminRunner = adminRunner,
  sources: PreflightSources = defaultPreflightSources,
): Promise<readonly CountryListRow[]> {
  return run({ ...actor, action: COUNTRY_ACTIONS.list }, async (db) =>
    (await readFacts(db)).map((row) => listRowOf(row, sources)),
  );
}

/** A florist on the country page: its coverage or its home is in the country. */
export interface CountryFlorist {
  readonly code: string;
  readonly legalName: string;
  readonly cityLabel: string;
  readonly status: z.infer<typeof FloristRowSchema>["status"];
  readonly products: number;
}

const FloristRowSchema = z.object({
  code: z.string(),
  legal_name: z.string(),
  city_label: z.string(),
  status: z.enum(["demo", "onboarding", "active", "paused", "offboarded"]),
  products: z.coerce.number().int(),
});

/** Everything `/admin/countries/[iso2]` shows. */
export interface CountryDetailView extends CountryListRow {
  readonly vatRateBp: number | null;
  readonly supplyModel: string | null;
  readonly ianaZone: string;
  readonly sameDayCutoffLocal: string | null;
  readonly deliveryDays: readonly number[];
  readonly sundayDelivery: CountryFactsRow["sunday_delivery"];
  readonly florists: readonly CountryFlorist[];
}

export async function countryDetail(
  actor: DbActor,
  iso2: string,
  run: AdminRunner = adminRunner,
  sources: PreflightSources = defaultPreflightSources,
): Promise<CountryDetailView | undefined> {
  const code = Iso2Schema.safeParse(iso2);
  if (!code.success) return undefined;
  return run({ ...actor, action: COUNTRY_ACTIONS.read }, async (db) => {
    const [row] = await readFacts(db, code.data);
    if (row === undefined) return undefined;
    const florists = await db.execute(sql`
      SELECT fp.code, fp.legal_name, fp.city_label, fp.status,
             (SELECT count(DISTINCT m.product_id) FROM public.partner_catalog_mapping m
               WHERE m.partner_id = fp.id AND m.can_fulfil) AS products
        FROM public.fulfillment_partner fp
       WHERE fp.country_id = ${row.id}
          OR EXISTS (SELECT 1 FROM public.partner_coverage pc
                       LEFT JOIN public.postcode_zone z ON z.id = pc.postcode_zone_id
                       JOIN public.city ci ON ci.id = coalesce(pc.city_id, z.city_id)
                      WHERE pc.partner_id = fp.id AND ci.country_id = ${row.id})
       ORDER BY (fp.status = 'demo'), fp.legal_name, fp.code`);
    return {
      ...listRowOf(row, sources),
      vatRateBp: row.vat_rate_bp,
      supplyModel: row.supply_model,
      ianaZone: row.iana_zone,
      sameDayCutoffLocal: row.same_day_cutoff_local,
      deliveryDays: row.delivery_days.map(Number),
      sundayDelivery: row.sunday_delivery,
      florists: florists.map((florist) => {
        const parsed = FloristRowSchema.parse(florist);
        return {
          code: parsed.code,
          legalName: parsed.legal_name,
          cityLabel: parsed.city_label,
          status: parsed.status,
          products: parsed.products,
        };
      }),
    };
  });
}

/* -------------------------------------------------------------------------- */
/* setCountryStatus                                                           */
/* -------------------------------------------------------------------------- */

/** What became of the publish a flip asks for. */
export type FlipPublish =
  | { readonly kind: "requested" }
  | { readonly kind: "notNeeded" }
  | { readonly kind: "notStarted"; readonly code: string };

export type CountryStatusResult =
  | {
      readonly ok: true;
      readonly iso2: string;
      readonly status: (typeof countryStatuses)[number];
      readonly firstLiveAt: Date | null;
      readonly publish: FlipPublish;
    }
  | {
      readonly ok: false;
      readonly reason:
        | "forbidden"
        | "invalid"
        | "notFound"
        | "conflict"
        | "unchanged"
        | "liveToDisabled"
        | "disabledToLive"
        | "mismatch"
        | "preflight";
      readonly reasons?: readonly PreflightReason[];
    };

export interface CountryCommandActor extends DbActor {
  readonly roles: readonly AdminRole[];
}

export interface CountryStatusDeps {
  readonly run: AdminRunner;
  readonly invalidate: (tags: readonly string[]) => Promise<unknown>;
  /** Whether the database's structural URL set now differs from the running build's. */
  readonly existenceChanged: () => Promise<boolean>;
  /** Ask for one publish; `undefined` when asked, else the refusal's code. */
  readonly requestPublish: (reason: string) => Promise<string | undefined>;
  readonly sources: PreflightSources;
}

/** The audit reason of each move: fixed text, never personal data. */
function flipReason(iso2: string, to: string): string {
  return `${iso2} set to ${to} on /admin/countries`;
}

/** The application's dependencies: the cache, the running manifest and the publish runtime. */
export async function defaultCountryStatusDeps(
  actor: CountryCommandActor,
): Promise<CountryStatusDeps> {
  const [{ invalidate }, { runningManifest }, publish] = await Promise.all([
    import("@/lib/cache"),
    import("@/lib/existence"),
    import("@/lib/publish-runtime"),
  ]);
  const { PublishError } = await import("@/lib/publish");
  return {
    run: adminRunner,
    invalidate,
    existenceChanged: async () => {
      const manifest = runningManifest();
      // Without a manifest (development) there is no running URL set to compare with.
      if (manifest === null) return false;
      const diff = await existenceDiff({ urls: manifest.urls });
      return diff.added.length + diff.removed.length > 0;
    },
    requestPublish: async (reason) => {
      if (actor.userId === undefined) return "PUBLISH_NO_ACTOR";
      try {
        await publish.requestPublishFromAdmin({
          reason,
          userId: actor.userId,
          enqueue: (runId, addedUrls) =>
            publish.enqueuePublishJob(
              runId,
              addedUrls,
              actor.requestId ?? runId,
            ),
        });
        return undefined;
      } catch (error) {
        if (error instanceof PublishError) return error.code;
        throw error;
      }
    },
    sources: defaultPreflightSources,
  };
}

/**
 * The flip (§2.8, AC-25). `input` is the form: `CountryStatusFlipSchema`. Nothing is written on
 * a refusal; the status changes only inside the admin transaction, where `status_flip_guard()`
 * admits it and `0044`'s trigger sets `first_live_at` on the first `live`.
 */
export async function setCountryStatus(
  actor: CountryCommandActor,
  input: unknown,
  deps: CountryStatusDeps,
): Promise<CountryStatusResult> {
  if (!can(actor.roles, "country.status")) {
    return { ok: false, reason: "forbidden" };
  }
  const parsed = CountryStatusFlipSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const flip = parsed.data;
  const reason = flipReason(flip.iso2, flip.to);

  const outcome = await deps.run(
    { ...actor, action: COUNTRY_ACTIONS.status, reason },
    async (db): Promise<CountryStatusResult> => {
      const [row] = await readFacts(db, flip.iso2, true);
      if (row === undefined) return { ok: false, reason: "notFound" };
      if (row.status !== flip.from) return { ok: false, reason: "conflict" };
      const refusal = flipRefusal(flip.from, flip.to);
      if (refusal !== undefined) return { ok: false, reason: refusal };
      if (flip.to === "live") {
        if (!confirmsCode(flip.iso2, flip.confirmCode)) {
          return { ok: false, reason: "mismatch" };
        }
        const preflight = preflightOf(row, deps.sources);
        if (preflight.reasons.length > 0) {
          return {
            ok: false,
            reason: "preflight",
            reasons: preflight.reasons,
          };
        }
      }
      const updated = await db.execute(sql`
        UPDATE public.country SET status = ${flip.to}
         WHERE id = ${row.id}
        RETURNING first_live_at`);
      const firstLiveAt = z
        .object({ first_live_at: z.coerce.date().nullable() })
        .parse(updated[0]).first_live_at;
      return {
        ok: true,
        iso2: row.iso2,
        status: flip.to,
        firstLiveAt,
        publish: { kind: "notNeeded" },
      };
    },
  );
  if (!outcome.ok) return outcome;

  // After the commit: the §5.4 flip set, once. Its `country:{iso2}` tag re-reads the served
  // registry before any page regenerates (`src/modules/geo/db/runtime.ts`), so the existence diff
  // below already sees the new status.
  await applyCommand(
    commandOutcome(null, { kind: "countryStatus", iso2: outcome.iso2 }),
    deps.invalidate,
  );
  if (!(await deps.existenceChanged())) return outcome;
  const refused = await deps.requestPublish(reason);
  return {
    ...outcome,
    publish:
      refused === undefined
        ? { kind: "requested" }
        : { kind: "notStarted", code: refused },
  };
}

/* -------------------------------------------------------------------------- */
/* setGoLiveFiscalFields                                                      */
/* -------------------------------------------------------------------------- */

export type FiscalField = "vatRateBp" | "supplyModel" | "reason";

export type FiscalFieldsResult =
  | { readonly ok: true; readonly iso2: string }
  | { readonly ok: false; readonly reason: "forbidden" | "notFound" }
  | {
      readonly ok: false;
      readonly reason: "invalid";
      readonly fields: readonly FiscalField[];
    }
  | {
      readonly ok: false;
      readonly reason: "FISCAL_FIELD_ALREADY_SET";
      readonly fields: readonly ("vatRateBp" | "supplyModel")[];
    };

export interface FiscalFieldsDeps {
  readonly run: AdminRunner;
  readonly invalidate: (tags: readonly string[]) => Promise<unknown>;
}

function invalidFields(error: z.ZodError): readonly FiscalField[] {
  const fields = new Set<FiscalField>();
  for (const issue of error.issues) {
    const head = issue.path[0];
    if (head === "vatRateBp" || head === "supplyModel" || head === "reason") {
      fields.add(head);
    } else {
      // The "at least one of the two" refinement, or an unknown key: both inputs.
      fields.add("vatRateBp");
      fields.add("supplyModel");
    }
  }
  return [...fields];
}

/**
 * The go-live fiscal fields (§14 A-orchestrator-2026-10-20a). `input` is
 * `GoLiveFiscalFieldsSchema`'s shape. A field whose stored value is not null refuses the whole
 * save with `FISCAL_FIELD_ALREADY_SET`; nothing else of the row is written.
 */
export async function setGoLiveFiscalFields(
  actor: CountryCommandActor,
  input: unknown,
  deps: FiscalFieldsDeps,
): Promise<FiscalFieldsResult> {
  if (!can(actor.roles, "country.status")) {
    return { ok: false, reason: "forbidden" };
  }
  const parsed = GoLiveFiscalFieldsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "invalid",
      fields: invalidFields(parsed.error),
    };
  }
  const fields = parsed.data;
  const result = await deps.run(
    { ...actor, action: COUNTRY_ACTIONS.fiscal, reason: fields.reason },
    async (db): Promise<FiscalFieldsResult> => {
      const [row] = await readFacts(db, fields.iso2, true);
      if (row === undefined) return { ok: false, reason: "notFound" };
      const alreadySet = [
        ...(fields.vatRateBp !== undefined && row.vat_rate_bp !== null
          ? (["vatRateBp"] as const)
          : []),
        ...(fields.supplyModel !== undefined && row.supply_model !== null
          ? (["supplyModel"] as const)
          : []),
      ];
      if (alreadySet.length > 0) {
        return {
          ok: false,
          reason: "FISCAL_FIELD_ALREADY_SET",
          fields: alreadySet,
        };
      }
      const sets = [
        ...(fields.vatRateBp === undefined
          ? []
          : [sql`vat_rate_bp = ${fields.vatRateBp}`]),
        ...(fields.supplyModel === undefined
          ? []
          : [sql`supply_model = ${fields.supplyModel}`]),
      ];
      await db.execute(
        sql`UPDATE public.country SET ${sql.join(sets, sql`, `)} WHERE id = ${row.id}`,
      );
      return { ok: true, iso2: row.iso2 };
    },
  );
  if (!result.ok) return result;
  return applyCommand(
    commandOutcome(result, { kind: "countryFacts", iso2: result.iso2 }),
    deps.invalidate,
  );
}

/** The application's dependencies of the fiscal save. */
export async function defaultFiscalFieldsDeps(): Promise<FiscalFieldsDeps> {
  const { invalidate } = await import("@/lib/cache");
  return { run: adminRunner, invalidate };
}
