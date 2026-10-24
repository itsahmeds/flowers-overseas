/**
 * `retention.sweep` (spec 002 §8 "Retention", AC-20, T-20; `plan/07` §1.2, §1.5, §10; TASK-025).
 *
 * Retention is implemented, not promised: the sweep reads every `retention_policy` row (`0009`)
 * and applies the one handler its `key` names, on an **injected clock**, so a changed period is a
 * data edit (§13 Q7: numbers may move, the mechanism does not) and a test can stand 91 days in the
 * future without waiting for it.
 *
 * What each key does (the cut-off is `now − retention_days`):
 *
 *  - `recipient_contact` (90 days after delivery, pseudonymise). Delivery is the first
 *    `order_event` whose `to_status` is `delivered`. Per order: `recipient_snapshot` becomes the
 *    recipient's initials and the allow-listed city-level keys (street, postcode, phone, delivery
 *    note and every unknown key dropped; §8 "name initialised, phone dropped, street dropped, city
 *    kept"). Per recipient, once **every** order of theirs qualifies: `full_name` → initials,
 *    `phone_e164` → null, `contact_redacted` set; their `recipient_address` rows lose `lines`,
 *    `postal_code` and `delivery_note` and keep city, country and zone. Skipped: a dispute-open
 *    order (`disputed`, `chargeback_open`), and a recipient who became a customer
 *    (`linked_customer_id` set) or is the buyer (`is_self`) — `plan/07` §1.2's "unless the
 *    recipient created an account or a dispute is open". The order, its lines, its events and its
 *    payment are never touched (the accounting obligation).
 *  - `delivery_photo` (2 years after upload, delete): the R2 objects (every variant, then the
 *    original) through the storage seam, then the `delivery_proof` row and its `media_asset`
 *    (variants cascade). Objects go first: a failure after them leaves a row whose objects are
 *    gone, which the next sweep finishes (deleting an absent object succeeds), never an object
 *    nothing points at. Dispute-open orders keep their photos (dispute evidence). With no storage
 *    supplied the policy deletes nothing and says so (`storage_unavailable`): the R2 adapter is
 *    spec 006's (TASK-082).
 *  - `buyer_personal` (3 years after the buyer's last order, pseudonymise): `customer.name` and
 *    `phone_e164` → null, `email_normalised` → a non-deliverable placeholder (frees the address,
 *    `customer_email_normalised_idx` is partial on `redacted = false`), `marketing_consent` off,
 *    `redacted` set; billing `address` rows lose `lines` and `postal_code`; each order's
 *    `buyer_snapshot` keeps initials and country. Skipped: a buyer with a dispute-open order, and
 *    a buyer with an account (`user_id` set), whose erasure is account deletion (spec 018/019).
 *  - `fraud_signals` (12 months, delete): `webhook_inbox` rows received before the cut-off
 *    (§8: the 12-month row covers `webhook_inbox.raw`, which is `NOT NULL`, so the row goes).
 *  - `consent_records` (5 years after withdrawal, delete): a `consent_log` row is withdrawn when a
 *    later record for the same subject supersedes it; it is deleted once that later record is
 *    older than the cut-off. The latest record per subject is never deleted (it is the proof).
 *  - `invoice_archive` (`keep`): nothing.
 *  - `checkout_draft_personal` (1 day after the draft's last activity, pseudonymise; spec 010
 *    §14 A-founder-2026-10-22 item 2 C, AC-35; TASK-207): `checkout_draft.buyer` and every
 *    line's `recipient` and `card` become null; the lines keep product, tier, destination, date
 *    and add-ons.
 *  - `checkout_draft` (30 days after the last activity, delete): the draft, and its lines by
 *    cascade. A placed line's order is untouched (the line points at it, not the reverse).
 *  - `demo_order_personal` (1 day after placement on the production seed, 7 on staging and PR
 *    environments, pseudonymise; spec 010 §5.1 A, AC-35): for orders with `mode` `demo` or
 *    `test`, both snapshots as the 90-day and 3-year rules leave them; a `recipient` whose every
 *    order is such an order, as `recipient_contact` leaves one; a `customer` with no account
 *    whose every order is such an order, as `buyer_personal` leaves one. The order, its lines,
 *    its events and its purchase are kept; a `live` order, and anyone with one, is never touched.
 *  A key with no handler here is reported `no_handler` and nothing is written for it.
 *
 * `dryRun` writes nothing — no row, no object — and reports the same counts, because every count
 * comes from the selection a real run would then act on.
 *
 * `audit_log` is append-only (`0009`): the sweep never edits `before`/`after` (a migration-owned
 * path, carried forward on the brief). It logs counts and policy keys only, never an id, a name
 * or a value (§8 "Logs and PII").
 */
import { sql, type SQL } from "drizzle-orm";

import type { Logger } from "../lib/logger";
import type { Storage } from "../lib/storage";

/** Order statuses in which a dispute is open (`0007`'s `order_status`). */
export const DISPUTE_OPEN_STATUSES = ["disputed", "chargeback_open"] as const;

/** Snapshot keys that are city-level or coarser, kept for analytics (`plan/07` §1.2). */
export const RECIPIENT_SNAPSHOT_KEEP = [
  "city",
  "city_id",
  "cityId",
  "country",
  "country_id",
  "countryId",
  "country_iso2",
  "countryIso2",
] as const;

/** Buyer snapshot keys kept after the 3-year rule: the country (invoicing, analytics). */
export const BUYER_SNAPSHOT_KEEP = [
  "country",
  "country_iso2",
  "countryIso2",
] as const;

/** Snapshot keys that carry a person's name, replaced by its initials. */
const NAME_KEYS = ["name", "full_name", "fullName"] as const;

const DAY_MS = 86_400_000;

/**
 * A name reduced to its initials: the first character of each whitespace-separated word, each
 * followed by a dot — "Anna Maria Nowak" → "A. M. N.". Never empty (the name columns require a
 * non-blank value): a name with no word becomes "X.".
 */
export function initialsOf(name: string): string {
  const initials = name
    .normalize("NFC")
    .trim()
    .split(/\s+/u)
    .map((word) => Array.from(word)[0])
    .filter((first): first is string => first !== undefined && first !== "")
    .map((first) => `${first.toLocaleUpperCase()}.`);
  return initials.length === 0 ? "X." : initials.join(" ");
}

type Snapshot = Readonly<Record<string, unknown>>;

/** True when a snapshot already carries the sweep's marker. */
export function isRedactedSnapshot(snapshot: unknown): boolean {
  return (
    typeof snapshot === "object" &&
    snapshot !== null &&
    (snapshot as Snapshot)["redacted"] === true
  );
}

function pseudonymise(
  snapshot: Snapshot,
  keep: readonly string[],
  at: Date,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keep) {
    if (Object.hasOwn(snapshot, key)) out[key] = snapshot[key];
  }
  for (const key of NAME_KEYS) {
    const value = snapshot[key];
    if (typeof value === "string" && value.trim() !== "") {
      out[key] = initialsOf(value);
    }
  }
  out["redacted"] = true;
  out["redacted_at"] = at.toISOString();
  return out;
}

/**
 * The recipient snapshot after the 90-day rule: an allow-list, so a key nobody listed (a
 * street, a phone, a postcode, a note, a future field) is dropped rather than kept by default.
 */
export function pseudonymiseRecipientSnapshot(
  snapshot: Snapshot,
  at: Date,
): Record<string, unknown> {
  return pseudonymise(snapshot, RECIPIENT_SNAPSHOT_KEEP, at);
}

/** The buyer snapshot after the 3-year rule: initials and country only. */
export function pseudonymiseBuyerSnapshot(
  snapshot: Snapshot,
  at: Date,
): Record<string, unknown> {
  return pseudonymise(snapshot, BUYER_SNAPSHOT_KEEP, at);
}

/** The placeholder a pseudonymised buyer's email becomes: unique, valid shape, undeliverable. */
export function redactedEmail(customerId: string): string {
  return `redacted-${customerId}@redacted.invalid`;
}

/** One `retention_policy` row as the sweep reads it. */
export interface RetentionPolicyRow {
  readonly key: string;
  readonly retentionDays: number | null;
  readonly action: "delete" | "pseudonymise" | "keep";
}

export type PolicyStatus =
  "applied" | "dry_run" | "kept" | "no_handler" | "storage_unavailable";

/** What one policy did (or, on a dry run, would do). Counts only. */
export interface PolicyOutcome {
  readonly key: string;
  readonly status: PolicyStatus;
  /** Rows (or objects) written, by what was written. Equal on a dry run and a real run. */
  readonly counts: Readonly<Record<string, number>>;
  /** Rows the rule would have reached but an exception kept, by reason. */
  readonly skipped: Readonly<Record<string, number>>;
}

export interface RetentionSweepResult {
  readonly dryRun: boolean;
  readonly now: string;
  readonly policies: readonly PolicyOutcome[];
}

export interface RetentionSweepOptions {
  /** The injected clock. */
  readonly now: Date;
  readonly dryRun: boolean;
  /** The R2 seam; absent until spec 006's adapter exists, and then photos are not deleted. */
  readonly storage?: Storage;
  readonly log?: Logger;
}

/**
 * What the sweep runs its statements through: Drizzle's transaction handle from
 * `withSystemContext` in production (its `execute` resolves to the rows), or any runner that
 * renders a Drizzle `SQL` and returns its rows (the integration suite's).
 */
export interface RetentionDb {
  execute(query: SQL): Promise<unknown>;
}

interface PolicyContext {
  readonly db: RetentionDb;
  readonly now: Date;
  readonly cutoff: Date;
  readonly dryRun: boolean;
  readonly storage: Storage | undefined;
}

type PolicyHandler = (
  context: PolicyContext,
) => Promise<Omit<PolicyOutcome, "key">>;

type Row = Record<string, unknown>;

async function rows<T extends Row>(db: RetentionDb, query: SQL): Promise<T[]> {
  const result = await db.execute(query);
  return Array.from(result as unknown as Iterable<T>);
}

function ts(date: Date): SQL {
  return sql`${date.toISOString()}::timestamptz`;
}

const DISPUTE_LIST = sql.join(
  DISPUTE_OPEN_STATUSES.map((status) => sql`${status}`),
  sql`, `,
);

/** `o.id` has a delivery event at or before `cutoff`. */
function deliveredBy(cutoff: Date): SQL {
  return sql`EXISTS (
    SELECT 1 FROM public.order_event e
    WHERE e.order_id = o.id AND e.to_status = 'delivered' AND e.occurred_at <= ${ts(cutoff)})`;
}

function uuidArray(ids: readonly string[]): SQL {
  return sql`ARRAY[${sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  )}]::uuid[]`;
}

const recipientContact: PolicyHandler = async ({ db, now, cutoff, dryRun }) => {
  const candidates = await rows<{
    id: string;
    snapshot: Snapshot;
    dispute: boolean;
    customer: boolean;
  }>(
    db,
    sql`SELECT o.id, o.recipient_snapshot AS snapshot,
               o.status IN (${DISPUTE_LIST}) AS dispute,
               (r.linked_customer_id IS NOT NULL OR r.is_self) AS customer
        FROM public."order" o
        JOIN public.recipient r ON r.id = o.recipient_id
        WHERE ${deliveredBy(cutoff)}
          AND COALESCE(o.recipient_snapshot -> 'redacted', 'false'::jsonb) <> 'true'::jsonb
        ORDER BY o.id`,
  );
  const orders = candidates.filter((row) => !row.dispute && !row.customer);
  const recipients = await rows<{ id: string; full_name: string }>(
    db,
    sql`SELECT r.id, r.full_name FROM public.recipient r
        WHERE NOT r.contact_redacted
          AND r.linked_customer_id IS NULL AND NOT r.is_self
          AND EXISTS (SELECT 1 FROM public."order" o WHERE o.recipient_id = r.id)
          AND NOT EXISTS (
            SELECT 1 FROM public."order" o
            WHERE o.recipient_id = r.id
              AND (o.status IN (${DISPUTE_LIST}) OR NOT ${deliveredBy(cutoff)}))
        ORDER BY r.id`,
  );
  const recipientIds = recipients.map((row) => row.id);
  const addresses =
    recipientIds.length === 0
      ? []
      : await rows<{ id: string }>(
          db,
          sql`SELECT a.id FROM public.recipient_address a
              WHERE a.recipient_id = ANY(${uuidArray(recipientIds)})
              ORDER BY a.id`,
        );
  if (!dryRun) {
    for (const order of orders) {
      const next = pseudonymiseRecipientSnapshot(order.snapshot, now);
      await db.execute(
        sql`UPDATE public."order" SET recipient_snapshot = ${JSON.stringify(next)}::text::jsonb
            WHERE id = ${order.id}::uuid`,
      );
    }
    for (const recipient of recipients) {
      await db.execute(
        sql`UPDATE public.recipient
            SET full_name = ${initialsOf(recipient.full_name)}, phone_e164 = NULL,
                contact_redacted = true, contact_redacted_at = ${ts(now)}
            WHERE id = ${recipient.id}::uuid`,
      );
    }
    if (recipientIds.length > 0) {
      await db.execute(
        sql`UPDATE public.recipient_address
            SET lines = '{}'::text[], postal_code = NULL, delivery_note = NULL
            WHERE recipient_id = ANY(${uuidArray(recipientIds)})`,
      );
    }
  }
  return {
    status: dryRun ? "dry_run" : "applied",
    counts: {
      order_snapshots: orders.length,
      recipients: recipients.length,
      recipient_addresses: addresses.length,
    },
    skipped: {
      dispute_open: candidates.filter((row) => row.dispute).length,
      recipient_is_customer: candidates.filter(
        (row) => !row.dispute && row.customer,
      ).length,
    },
  };
};

const deliveryPhoto: PolicyHandler = async ({
  db,
  cutoff,
  dryRun,
  storage,
}) => {
  const photos = await rows<{
    id: string;
    asset_id: string;
    bucket: string;
    object_key: string;
    variant_keys: string[] | null;
    dispute: boolean;
  }>(
    db,
    sql`SELECT p.id, a.id AS asset_id, a.bucket, a.object_key,
               (SELECT array_agg(v.object_key ORDER BY v.object_key)
                  FROM public.media_variant v WHERE v.media_asset_id = a.id) AS variant_keys,
               o.status IN (${DISPUTE_LIST}) AS dispute
        FROM public.delivery_proof p
        JOIN public.media_asset a ON a.id = p.media_asset_id
        JOIN public."order" o ON o.id = p.order_id
        WHERE p.uploaded_at <= ${ts(cutoff)}
        ORDER BY p.id`,
  );
  const due = photos.filter((row) => !row.dispute);
  const objects = due.reduce(
    (total, row) => total + 1 + (row.variant_keys?.length ?? 0),
    0,
  );
  const skipped = { dispute_open: photos.length - due.length };
  if (storage === undefined) {
    return {
      status: "storage_unavailable",
      counts: { photos: 0, objects: 0 },
      skipped: { ...skipped, storage_unavailable: due.length },
    };
  }
  if (!dryRun) {
    for (const photo of due) {
      for (const key of photo.variant_keys ?? []) {
        await storage.delete({ bucket: photo.bucket, objectKey: key });
      }
      await storage.delete({
        bucket: photo.bucket,
        objectKey: photo.object_key,
      });
      await db.execute(
        sql`DELETE FROM public.delivery_proof WHERE id = ${photo.id}::uuid`,
      );
      await db.execute(
        sql`DELETE FROM public.media_asset WHERE id = ${photo.asset_id}::uuid`,
      );
    }
  }
  return {
    status: dryRun ? "dry_run" : "applied",
    counts: { photos: due.length, objects },
    skipped,
  };
};

const buyerPersonal: PolicyHandler = async ({ db, now, cutoff, dryRun }) => {
  const candidates = await rows<{
    id: string;
    dispute: boolean;
    account: boolean;
  }>(
    db,
    sql`SELECT c.id,
               EXISTS (SELECT 1 FROM public."order" o
                       WHERE o.customer_id = c.id AND o.status IN (${DISPUTE_LIST})) AS dispute,
               c.user_id IS NOT NULL AS account
        FROM public.customer c
        WHERE NOT c.redacted
          AND GREATEST(c.created_at,
                       COALESCE((SELECT max(o.created_at) FROM public."order" o
                                 WHERE o.customer_id = c.id), c.created_at)) <= ${ts(cutoff)}
        ORDER BY c.id`,
  );
  const customers = candidates.filter((row) => !row.dispute && !row.account);
  const ids = customers.map((row) => row.id);
  const addresses =
    ids.length === 0
      ? []
      : await rows<{ id: string }>(
          db,
          sql`SELECT id FROM public.address WHERE customer_id = ANY(${uuidArray(ids)}) ORDER BY id`,
        );
  const snapshots =
    ids.length === 0
      ? []
      : await rows<{ id: string; snapshot: Snapshot }>(
          db,
          sql`SELECT o.id, o.buyer_snapshot AS snapshot FROM public."order" o
              WHERE o.customer_id = ANY(${uuidArray(ids)})
                AND COALESCE(o.buyer_snapshot -> 'redacted', 'false'::jsonb) <> 'true'::jsonb
              ORDER BY o.id`,
        );
  if (!dryRun) {
    for (const id of ids) {
      await db.execute(
        sql`UPDATE public.customer
            SET name = NULL, phone_e164 = NULL, email_normalised = ${redactedEmail(id)},
                marketing_consent = false, redacted = true, redacted_at = ${ts(now)}
            WHERE id = ${id}::uuid`,
      );
    }
    if (ids.length > 0) {
      await db.execute(
        sql`UPDATE public.address SET lines = '{}'::text[], postal_code = NULL
            WHERE customer_id = ANY(${uuidArray(ids)})`,
      );
    }
    for (const order of snapshots) {
      const next = pseudonymiseBuyerSnapshot(order.snapshot, now);
      await db.execute(
        sql`UPDATE public."order" SET buyer_snapshot = ${JSON.stringify(next)}::text::jsonb
            WHERE id = ${order.id}::uuid`,
      );
    }
  }
  return {
    status: dryRun ? "dry_run" : "applied",
    counts: {
      customers: customers.length,
      addresses: addresses.length,
      buyer_snapshots: snapshots.length,
    },
    skipped: {
      dispute_open: candidates.filter((row) => row.dispute).length,
      account_holder: candidates.filter((row) => !row.dispute && row.account)
        .length,
    },
  };
};

const fraudSignals: PolicyHandler = async ({ db, cutoff, dryRun }) => {
  const due = await rows<{ count: number }>(
    db,
    sql`SELECT count(*)::int AS count FROM public.webhook_inbox
        WHERE received_at <= ${ts(cutoff)}`,
  );
  if (!dryRun) {
    await db.execute(
      sql`DELETE FROM public.webhook_inbox WHERE received_at <= ${ts(cutoff)}`,
    );
  }
  return {
    status: dryRun ? "dry_run" : "applied",
    counts: { webhook_inbox: due[0]?.count ?? 0 },
    skipped: {},
  };
};

/** A consent record superseded by a later one for its subject, that later one before `cutoff`. */
function withdrawnBefore(cutoff: Date): SQL {
  return sql`EXISTS (
    SELECT 1 FROM public.consent_log n
    WHERE n.subject_kind = c.subject_kind
      AND COALESCE(n.subject_ref, n.anonymous_id) = COALESCE(c.subject_ref, c.anonymous_id)
      AND (n.occurred_at, n.id) > (c.occurred_at, c.id)
      AND n.occurred_at <= ${ts(cutoff)})`;
}

const consentRecords: PolicyHandler = async ({ db, cutoff, dryRun }) => {
  const due = await rows<{ count: number }>(
    db,
    sql`SELECT count(*)::int AS count FROM public.consent_log c WHERE ${withdrawnBefore(cutoff)}`,
  );
  if (!dryRun) {
    await db.execute(
      sql`DELETE FROM public.consent_log c WHERE ${withdrawnBefore(cutoff)}`,
    );
  }
  return {
    status: dryRun ? "dry_run" : "applied",
    counts: { consent_log: due[0]?.count ?? 0 },
    skipped: {},
  };
};

/** The draft's last activity is at or before `cutoff`. */
function draftIdleSince(cutoff: Date): SQL {
  return sql`d.last_activity_at <= ${ts(cutoff)}`;
}

const checkoutDraftPersonal: PolicyHandler = async ({ db, cutoff, dryRun }) => {
  const due = await rows<{ drafts: number; lines: number }>(
    db,
    sql`SELECT
          (SELECT count(*)::int FROM public.checkout_draft d
            WHERE ${draftIdleSince(cutoff)}
              AND (d.buyer IS NOT NULL OR EXISTS (
                SELECT 1 FROM public.checkout_draft_line l
                 WHERE l.draft_id = d.id AND (l.recipient IS NOT NULL OR l.card IS NOT NULL)))) AS drafts,
          (SELECT count(*)::int FROM public.checkout_draft_line l
             JOIN public.checkout_draft d ON d.id = l.draft_id
            WHERE ${draftIdleSince(cutoff)}
              AND (l.recipient IS NOT NULL OR l.card IS NOT NULL)) AS lines`,
  );
  if (!dryRun) {
    await db.execute(
      sql`UPDATE public.checkout_draft_line l SET recipient = NULL, card = NULL
            FROM public.checkout_draft d
           WHERE d.id = l.draft_id AND ${draftIdleSince(cutoff)}
             AND (l.recipient IS NOT NULL OR l.card IS NOT NULL)`,
    );
    await db.execute(
      sql`UPDATE public.checkout_draft d SET buyer = NULL
           WHERE ${draftIdleSince(cutoff)} AND d.buyer IS NOT NULL`,
    );
  }
  return {
    status: dryRun ? "dry_run" : "applied",
    counts: {
      drafts: due[0]?.drafts ?? 0,
      draft_lines: due[0]?.lines ?? 0,
    },
    skipped: {},
  };
};

const checkoutDraft: PolicyHandler = async ({ db, cutoff, dryRun }) => {
  const due = await rows<{ drafts: number; lines: number }>(
    db,
    sql`SELECT count(DISTINCT d.id)::int AS drafts, count(l.id)::int AS lines
          FROM public.checkout_draft d
          LEFT JOIN public.checkout_draft_line l ON l.draft_id = d.id
         WHERE ${draftIdleSince(cutoff)}`,
  );
  if (!dryRun) {
    await db.execute(
      sql`DELETE FROM public.checkout_draft d WHERE ${draftIdleSince(cutoff)}`,
    );
  }
  return {
    status: dryRun ? "dry_run" : "applied",
    counts: {
      drafts: due[0]?.drafts ?? 0,
      draft_lines: due[0]?.lines ?? 0,
    },
    skipped: {},
  };
};

/** `o` is a demo or test order placed at or before `cutoff`. */
function demoPlacedBy(cutoff: Date): SQL {
  return sql`o.mode IN ('demo', 'test') AND o.created_at <= ${ts(cutoff)}`;
}

const demoOrderPersonal: PolicyHandler = async ({
  db,
  now,
  cutoff,
  dryRun,
}) => {
  const orders = await rows<{
    id: string;
    recipient: Snapshot;
    buyer: Snapshot;
  }>(
    db,
    sql`SELECT o.id, o.recipient_snapshot AS recipient, o.buyer_snapshot AS buyer
          FROM public."order" o
         WHERE ${demoPlacedBy(cutoff)}
           AND (COALESCE(o.recipient_snapshot -> 'redacted', 'false'::jsonb) <> 'true'::jsonb
             OR COALESCE(o.buyer_snapshot -> 'redacted', 'false'::jsonb) <> 'true'::jsonb)
         ORDER BY o.id`,
  );
  const recipients = await rows<{ id: string; full_name: string }>(
    db,
    sql`SELECT r.id, r.full_name FROM public.recipient r
         WHERE NOT r.contact_redacted
           AND EXISTS (SELECT 1 FROM public."order" o WHERE o.recipient_id = r.id)
           AND NOT EXISTS (SELECT 1 FROM public."order" o
                            WHERE o.recipient_id = r.id AND NOT (${demoPlacedBy(cutoff)}))
         ORDER BY r.id`,
  );
  const customers = await rows<{ id: string }>(
    db,
    sql`SELECT c.id FROM public.customer c
         WHERE NOT c.redacted AND c.user_id IS NULL
           AND EXISTS (SELECT 1 FROM public."order" o WHERE o.customer_id = c.id)
           AND NOT EXISTS (SELECT 1 FROM public."order" o
                            WHERE o.customer_id = c.id AND NOT (${demoPlacedBy(cutoff)}))
         ORDER BY c.id`,
  );
  const recipientIds = recipients.map((row) => row.id);
  const customerIds = customers.map((row) => row.id);
  if (!dryRun) {
    for (const order of orders) {
      const recipient = isRedactedSnapshot(order.recipient)
        ? order.recipient
        : pseudonymiseRecipientSnapshot(order.recipient, now);
      const buyer = isRedactedSnapshot(order.buyer)
        ? order.buyer
        : pseudonymiseBuyerSnapshot(order.buyer, now);
      await db.execute(
        sql`UPDATE public."order"
               SET recipient_snapshot = ${JSON.stringify(recipient)}::text::jsonb,
                   buyer_snapshot = ${JSON.stringify(buyer)}::text::jsonb
             WHERE id = ${order.id}::uuid`,
      );
    }
    for (const recipient of recipients) {
      await db.execute(
        sql`UPDATE public.recipient
               SET full_name = ${initialsOf(recipient.full_name)}, phone_e164 = NULL,
                   contact_redacted = true, contact_redacted_at = ${ts(now)}
             WHERE id = ${recipient.id}::uuid`,
      );
    }
    if (recipientIds.length > 0) {
      await db.execute(
        sql`UPDATE public.recipient_address
               SET lines = '{}'::text[], postal_code = NULL, delivery_note = NULL
             WHERE recipient_id = ANY(${uuidArray(recipientIds)})`,
      );
    }
    for (const id of customerIds) {
      await db.execute(
        sql`UPDATE public.customer
               SET name = NULL, phone_e164 = NULL, email_normalised = ${redactedEmail(id)},
                   marketing_consent = false, redacted = true, redacted_at = ${ts(now)}
             WHERE id = ${id}::uuid`,
      );
    }
    if (customerIds.length > 0) {
      await db.execute(
        sql`UPDATE public.address SET lines = '{}'::text[], postal_code = NULL
             WHERE customer_id = ANY(${uuidArray(customerIds)})`,
      );
    }
  }
  return {
    status: dryRun ? "dry_run" : "applied",
    counts: {
      order_snapshots: orders.length,
      recipients: recipients.length,
      customers: customers.length,
    },
    skipped: {},
  };
};

/** The handler per `retention_policy.key`. A key absent here is reported `no_handler`. */
export const RETENTION_HANDLERS: Readonly<Record<string, PolicyHandler>> = {
  recipient_contact: recipientContact,
  delivery_photo: deliveryPhoto,
  buyer_personal: buyerPersonal,
  fraud_signals: fraudSignals,
  consent_records: consentRecords,
  checkout_draft_personal: checkoutDraftPersonal,
  checkout_draft: checkoutDraft,
  demo_order_personal: demoOrderPersonal,
};

/**
 * Applies every `retention_policy` row in `db` (which the caller opened as `system`, normally
 * `withSystemContext("retention.sweep", …)`), in key order, and returns the counts.
 */
export async function runRetentionSweep(
  db: RetentionDb,
  options: RetentionSweepOptions,
): Promise<RetentionSweepResult> {
  const policies = await rows<{
    key: string;
    retention_days: number | null;
    action: RetentionPolicyRow["action"];
  }>(
    db,
    sql`SELECT key, retention_days, action FROM public.retention_policy ORDER BY key`,
  );
  const outcomes: PolicyOutcome[] = [];
  for (const policy of policies) {
    const handler = RETENTION_HANDLERS[policy.key];
    let outcome: PolicyOutcome;
    if (policy.action === "keep" || policy.retention_days === null) {
      outcome = { key: policy.key, status: "kept", counts: {}, skipped: {} };
    } else if (handler === undefined) {
      outcome = {
        key: policy.key,
        status: "no_handler",
        counts: {},
        skipped: {},
      };
    } else {
      const cutoff = new Date(
        options.now.getTime() - policy.retention_days * DAY_MS,
      );
      outcome = {
        key: policy.key,
        ...(await handler({
          db,
          now: options.now,
          cutoff,
          dryRun: options.dryRun,
          storage: options.storage,
        })),
      };
    }
    options.log?.info(
      {
        job: "retention.sweep",
        policy: outcome.key,
        status: outcome.status,
        dry_run: options.dryRun,
        counts: outcome.counts,
        skipped: outcome.skipped,
      },
      "retention.policy",
    );
    outcomes.push(outcome);
  }
  return {
    dryRun: options.dryRun,
    now: options.now.toISOString(),
    policies: outcomes,
  };
}
