/**
 * The audit log, read and recorded (spec 012 §2.3, §5.2 `AuditFilterSchema`, `logAdminRead`,
 * AC-10, AC-11, AC-13; TASK-218).
 *
 * Writes are not here: every admin write is recorded by the database's `audit_row_change()`
 * trigger (`db/migrations/0016_audit_trail.sql`) inside the write's own transaction, from the
 * `action` `withAdminContext` requires. This module holds the three things the application does
 * with the log itself:
 *
 *  - `logAdminRead(context, entity, id)` — records that a person opened an order's recipient data
 *    or an application's contact data (`order.viewed`, `application.viewed`; §13 Q10), through
 *    the migration's `audit_record_view()`, so the actor, channel and request id follow the same
 *    rule as the trigger's. TASK-221 and TASK-222 call it from their detail pages;
 *  - `listAuditEntries` and `auditFilterOptions` — `/admin/audit`'s reads (`audit.read`, admin
 *    only), newest first, filtered by entity, actor, action and date in the viewer's zone;
 *  - `auditDiff(before, after)` — the before/after rows the page draws, where a masked value
 *    (`AUDIT_MASK`, the constant inside the migration's `audit_mask()`) is a `masked` cell the
 *    page renders as "changed" and never as a value.
 */
import { and, asc, desc, eq, gte, lt, sql } from "drizzle-orm";
import { z } from "zod";

import { adminProfile } from "../../../db/schema/admin";
import { auditChannels, auditLog } from "../../../db/schema/ops";
import { AuditActionSchema, type DbActor } from "@/lib/db";

import { type AdminRunner, adminRunner } from "./users";

/** What `audit_mask()` writes in place of a personal value (the migration's constant). */
export const AUDIT_MASK = "[masked]";

/** The tables `audit_row_change()` is attached to (spec 012 §5.1), in the migration's order. */
export const AUDITED_TABLES = [
  "country",
  "fulfillment_partner",
  "partner_coverage",
  "partner_blackout",
  "partner_catalog_mapping",
  "partner_application",
  "feature_flag",
  "feature_flag_scope",
  "user_role",
  "admin_profile",
] as const;

/** The entities a view row names (AC-13): the order, and the application by its table. */
export const VIEWED_ENTITIES = {
  order: "order",
  application: "partner_application",
} as const;
export type ViewedEntity = keyof typeof VIEWED_ENTITIES;

/** Every `entity_table` the log can hold, the entity filter's options. */
export const AUDIT_ENTITIES = [...AUDITED_TABLES, "order"] as const;

/** The audit action of each entity's view. */
export const VIEW_ACTIONS = Object.freeze({
  order: "order.viewed",
  application: "application.viewed",
} as const satisfies Record<ViewedEntity, string>);

/** The audit page reads with this action; no trigger records a read. */
export const AUDIT_READ_ACTION = "audit.list";

/** How many rows one page of the log shows, newest first. */
export const AUDIT_PAGE_SIZE = 100;

const IsoDateSchema = z.iso.date();

/**
 * `/admin/audit`'s query string (spec 012 §5.2 `AuditFilterSchema`). Every field optional; a
 * value that does not parse is dropped rather than refused, so a hand-edited URL shows the
 * unfiltered log instead of an error. `open` is the one row whose before/after is expanded.
 */
export const AuditFilterSchema = z.object({
  entity: z.enum(AUDIT_ENTITIES).optional().catch(undefined),
  actor: z.uuid().optional().catch(undefined),
  action: AuditActionSchema.optional().catch(undefined),
  from: IsoDateSchema.optional().catch(undefined),
  to: IsoDateSchema.optional().catch(undefined),
  open: z.uuid().optional().catch(undefined),
});
export type AuditFilter = z.infer<typeof AuditFilterSchema>;

/** One row of the log as the page reads it. */
export const AuditEntrySchema = z
  .object({
    id: z.uuid(),
    at: z.date(),
    actorUserId: z.uuid().nullable(),
    actorLabel: z.string(),
    channel: z.enum(auditChannels),
    action: z.string(),
    entityTable: z.string(),
    entityId: z.string(),
    reason: z.string().nullable(),
    before: z.record(z.string(), z.unknown()).nullable(),
    after: z.record(z.string(), z.unknown()).nullable(),
  })
  .strict();
export type AuditEntry = z.infer<typeof AuditEntrySchema>;

/** A first value of a query-string parameter, as the page receives it. */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Parses `/admin/audit`'s search parameters; never throws. */
export function parseAuditFilter(
  params: Readonly<Record<string, string | string[] | undefined>>,
): AuditFilter {
  const raw = Object.fromEntries(
    ["entity", "actor", "action", "from", "to", "open"].map((key) => [
      key,
      first(params[key]) || undefined,
    ]),
  );
  return AuditFilterSchema.parse(raw);
}

/**
 * Records that the actor opened an order or an application (AC-13): one `audit_log` row with the
 * viewer, the entity and its id, and no before or after. `id` is the row's uuid.
 */
export async function logAdminRead(
  actor: DbActor,
  entity: ViewedEntity,
  id: string,
  run: AdminRunner = adminRunner,
): Promise<void> {
  const parsedEntity = z.enum(["order", "application"]).parse(entity);
  const entityId = z.uuid().parse(id);
  await run({ ...actor, action: VIEW_ACTIONS[parsedEntity] }, async (db) => {
    await db.execute(
      sql`SELECT public.audit_record_view(${VIEWED_ENTITIES[parsedEntity]}, ${entityId})`,
    );
  });
}

/** The bounds of the date filter: whole days in the viewer's zone, `to` inclusive. */
function dateBounds(filter: AuditFilter, timeZone: string) {
  // The viewer's `admin_profile.time_zone`, bound as a parameter; Postgres refuses a zone it
  // does not know, so the shape check here only keeps free text out.
  const zone = z
    .string()
    .regex(/^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/)
    .parse(timeZone);
  return [
    filter.from === undefined
      ? undefined
      : gte(
          auditLog.at,
          sql`(${filter.from}::date)::timestamp AT TIME ZONE ${zone}`,
        ),
    filter.to === undefined
      ? undefined
      : lt(
          auditLog.at,
          sql`((${filter.to}::date + 1))::timestamp AT TIME ZONE ${zone}`,
        ),
  ];
}

/** The newest `AUDIT_PAGE_SIZE` rows that match `filter`, read under `audit.list`. */
export async function listAuditEntries(
  actor: DbActor,
  filter: AuditFilter,
  timeZone: string,
  run: AdminRunner = adminRunner,
): Promise<AuditEntry[]> {
  const conditions = [
    filter.entity === undefined
      ? undefined
      : eq(auditLog.entityTable, filter.entity),
    filter.actor === undefined
      ? undefined
      : eq(auditLog.actorUserId, filter.actor),
    filter.action === undefined
      ? undefined
      : eq(auditLog.action, filter.action),
    ...dateBounds(filter, timeZone),
  ].filter((condition) => condition !== undefined);
  return run({ ...actor, action: AUDIT_READ_ACTION }, async (db) => {
    const rows = await db
      .select({
        id: auditLog.id,
        at: auditLog.at,
        actorUserId: auditLog.actorUserId,
        actorLabel: auditLog.actorLabel,
        channel: auditLog.channel,
        action: auditLog.action,
        entityTable: auditLog.entityTable,
        entityId: auditLog.entityId,
        reason: auditLog.reason,
        before: auditLog.before,
        after: auditLog.after,
      })
      .from(auditLog)
      .where(conditions.length === 0 ? undefined : and(...conditions))
      .orderBy(desc(auditLog.at), desc(auditLog.id))
      .limit(AUDIT_PAGE_SIZE);
    return rows.map((row) => AuditEntrySchema.parse(row));
  });
}

/** The actor and action filters' options: every admin by name, every action the log holds. */
export interface AuditFilterOptions {
  readonly actors: readonly {
    readonly userId: string;
    readonly name: string;
  }[];
  readonly actions: readonly string[];
}

export async function auditFilterOptions(
  actor: DbActor,
  run: AdminRunner = adminRunner,
): Promise<AuditFilterOptions> {
  return run({ ...actor, action: AUDIT_READ_ACTION }, async (db) => {
    const actors = await db
      .select({ userId: adminProfile.userId, name: adminProfile.displayName })
      .from(adminProfile)
      .orderBy(asc(adminProfile.displayName));
    const actions = await db
      .selectDistinct({ action: auditLog.action })
      .from(auditLog)
      .orderBy(asc(auditLog.action))
      .limit(200);
    return {
      actors,
      actions: actions.map((row) => row.action),
    };
  });
}

/** One side of a diff cell: a value, a masked value, or nothing (the side has no such column). */
export type AuditDiffCell =
  | { readonly kind: "value"; readonly text: string }
  | { readonly kind: "masked" }
  | { readonly kind: "none" };

export interface AuditDiffRow {
  readonly column: string;
  readonly before: AuditDiffCell;
  readonly after: AuditDiffCell;
}

function cell(
  side: Readonly<Record<string, unknown>> | null,
  column: string,
): AuditDiffCell {
  if (side === null || !Object.hasOwn(side, column)) return { kind: "none" };
  const value = side[column];
  if (value === AUDIT_MASK) return { kind: "masked" };
  if (value === null || value === undefined) return { kind: "value", text: "" };
  return {
    kind: "value",
    text: typeof value === "string" ? value : JSON.stringify(value),
  };
}

/**
 * The rows of the before/after diff, one per column either side names, in a stable order (the
 * columns of `after`, then any only in `before`). A view row (no values) has none.
 */
export function auditDiff(
  before: Readonly<Record<string, unknown>> | null,
  after: Readonly<Record<string, unknown>> | null,
): AuditDiffRow[] {
  const columns = [
    ...Object.keys(after ?? {}),
    ...Object.keys(before ?? {}).filter(
      (column) => after === null || !Object.hasOwn(after, column),
    ),
  ];
  return columns.map((column) => ({
    column,
    before: cell(before, column),
    after: cell(after, column),
  }));
}
