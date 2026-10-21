/**
 * The review ledger's database half: `attest()`, the one writer, and the ledger reads (spec 012b
 * §2.4, §5.1 item 2, §5.2, AC-10, AC-11, AC-12, AC-13; proposed ADR-0022; TASK-293).
 *
 * `attest()` is the only code that writes `review_attestation` and the only code that sets the
 * review columns it mirrors (`product_translation.reviewed` / `reviewed_by` / `reviewed_at`,
 * `media_asset.review_state` / `reviewed_by` / `reviewed_at`). Postgres holds it to that:
 * `review_write_guard()` (migration `0019`) refuses those columns without
 * `app.allow_review_write`, and refuses an approval without an `approved` ledger row for the
 * current hash written in the same transaction; `fo/no-direct-review-write` refuses the code
 * outside a function named `attest`. So every write below sits lexically inside it.
 *
 * Two channels, one function:
 *
 *  - **`admin`** — a signed-in reviewer's decision. One `withAdminContext` transaction reads the
 *    reviewer's profile, roles and locale grants and the subject's current hash *from the
 *    database*, refuses (writing nothing, AC-11) when the user is not an active admin, has a
 *    blank `display_name`, lacks the subject's locale in `reviewer_locale` (photos: the
 *    `media.review` permission), submitted a hash other than the one served now, or requests a
 *    change without a note; otherwise appends the row — the attester's user id and
 *    `display_name`, the database's `now()`, the value hash and, for non-English copy, the English
 *    source hash — and mirrors the decision onto the subject's row.
 *  - **`import`** — a recorded approval carried in verbatim (§2.0 item 4): `pnpm
 *    attestations:import` and `db:seed`'s replay of `seed/data/attestations.json`, each on its own
 *    transaction. Idempotent: an identical import row already in the ledger is reported, not
 *    written again. The mirror is set only when the subject exists and serves the imported hash.
 *
 * Never in a savepoint: the guard recognises "this transaction" by the row's `xmin`.
 *
 * The file imports nothing through the `@/` alias at load time, so the Node scripts can import it
 * (`scripts/attestations-import.ts`, `seed/index.ts`); the admin defaults (`withAdminContext`,
 * the permission matrix, the logger) are loaded on first use.
 *
 * It lives in `db/`, the module's database adapter directory, which `pnpm check:no-db` leaves out
 * of its scan of `src/modules/i18n`.
 */
import { randomUUID } from "node:crypto";

import { type SQL, sql } from "drizzle-orm";

import {
  type AttestationProvider,
  type AttestInput,
  AttestInputSchema,
  type AttestOutcome,
  type LedgerEntry,
  LedgerEntrySchema,
  type LedgerHead,
  type ReviewChannel,
  type ReviewDecision,
  type ReviewState,
  refused,
  reviewStateOf,
  SOURCE_LOCALE,
  type Subject,
  subjectKey,
  subjectLocale,
} from "../attestation.ts";

/** What the ledger runs its statements through: a Drizzle transaction, or any SQL runner. */
export interface LedgerExecutor {
  execute(query: SQL): Promise<unknown>;
}

/** The two permissions `attest()` reads from spec 012's matrix. */
export type ReviewPermission = "translation.attest" | "media.review";

/** What the admin channel needs from the application; tests replace any of it. */
export interface AttestDeps {
  /** Opens one admin transaction (default: `withAdminContext`). */
  readonly runAdmin: <T>(
    context: {
      readonly userId: string;
      readonly requestId?: string;
      readonly action: string;
    },
    fn: (db: LedgerExecutor) => Promise<T>,
  ) => Promise<T>;
  /** Spec 012's `can()` over `ADMIN_PERMISSIONS`. */
  readonly can: (
    roles: readonly string[],
    permission: ReviewPermission,
  ) => boolean;
  /** One `info` line per decision: kind, ref, locale, decision; never a name (§11). */
  readonly log: (fields: Readonly<Record<string, unknown>>) => void;
}

/** `attest()`'s argument: a reviewer's decision, or one recorded approval to import. */
export type AttestCommand =
  | { readonly channel: "admin"; readonly input: AttestInput }
  | {
      readonly channel: "import";
      readonly entry: LedgerEntry;
      /** The caller's open transaction (the import script's, the seed's). */
      readonly db: LedgerExecutor;
      /** Mirror an imported approval onto the subject's row (default true; off in `--insert-only`). */
      readonly mirror?: boolean;
    };

async function rows<T>(db: LedgerExecutor, query: SQL): Promise<T[]> {
  return Array.from((await db.execute(query)) as Iterable<T>);
}

async function defaultDeps(): Promise<AttestDeps> {
  const [{ withAdminContext }, { can }, { logger }] = await Promise.all([
    import("@/lib/db"),
    import("@/modules/admin"),
    import("@/lib/logger"),
  ]);
  return {
    runAdmin: (context, fn) =>
      withAdminContext(
        {
          userId: context.userId,
          action: context.action,
          ...(context.requestId === undefined
            ? {}
            : { requestId: context.requestId }),
        },
        (db) => fn(db),
      ),
    can: (roles, permission) => can(roles, permission),
    log: (fields) => {
      logger.info(fields, "catalogue.review.attested");
    },
  };
}

/** The hash a subject serves now, from the database (`null`: no such subject). */
function currentHashQuery(subject: Subject, locale: string | null): SQL {
  return sql`SELECT public.review_subject_hash(${subject.kind}, ${subject.ref}, ${locale}::text) AS hash`;
}

/** The §5.4 tags of a review decision: the product's, its priced countries', and the sitemap. */
async function tagsFor(
  db: LedgerExecutor,
  subject: Subject,
): Promise<string[]> {
  const products =
    subject.kind === "product_translation"
      ? sql`SELECT p.id, p.sku FROM public.product p WHERE p.sku = ${subject.ref}`
      : sql`SELECT DISTINCT p.id, p.sku FROM public.product p
            JOIN public.product_media pm ON pm.product_id = p.id
            JOIN public.media_asset a ON a.id = pm.media_asset_id
            WHERE a.checksum_sha256 = ${subject.ref}`;
  const found = await rows<{ sku: string; iso2: string | null }>(
    db,
    sql`SELECT p.sku, upper(c.iso2) AS iso2
        FROM (${products}) p
        LEFT JOIN public.country_price cp ON cp.product_id = p.id
        LEFT JOIN public.country c ON c.id = cp.country_id`,
  );
  const tags = new Set<string>(["sitemap"]);
  for (const row of found) {
    tags.add(`product:${row.sku}`);
    if (row.iso2 !== null) tags.add(`catalog:${row.iso2}`);
  }
  return [...tags].sort();
}

/**
 * Records one review decision (see the header). The only writer of the ledger and of the review
 * columns.
 */
export async function attest(
  command: AttestCommand,
  overrides: Partial<AttestDeps> = {},
): Promise<AttestOutcome> {
  /** Mirrors a decision onto the subject's row, under the guard's session flag. */
  const mirror = async (
    db: LedgerExecutor,
    subject: Subject,
    decision: ReviewDecision,
    valueHash: string,
    attesterName: string,
    attestedAt: string,
  ): Promise<void> => {
    await db.execute(
      sql`SELECT set_config('app.allow_review_write', 'on', true)`,
    );
    if (subject.kind === "product_translation") {
      await db.execute(
        sql`UPDATE public.product_translation t
            SET reviewed = ${decision === "approved"},
                reviewed_by = ${attesterName},
                reviewed_at = ${attestedAt}::timestamptz
            FROM public.product p
            WHERE p.id = t.product_id AND p.sku = ${subject.ref}
              AND t.locale_code = ${subject.locale}
              AND public.review_product_copy_hash(
                    t.product_id, t.locale_code, t.name, t.slug, t.description_md, t.seo_title,
                    t.seo_description) = ${valueHash}`,
      );
    } else {
      const state =
        decision === "approved"
          ? "approved"
          : decision === "rejected"
            ? "rejected"
            : "pending";
      await db.execute(
        sql`UPDATE public.media_asset
            SET review_state = ${state},
                reviewed_by = ${attesterName},
                reviewed_at = ${attestedAt}::timestamptz
            WHERE checksum_sha256 = ${subject.ref} AND checksum_sha256 = ${valueHash}`,
      );
    }
    await db.execute(
      sql`SELECT set_config('app.allow_review_write', 'off', true)`,
    );
  };

  if (command.channel === "import") {
    const entry = LedgerEntrySchema.parse(command.entry);
    const db = command.db;
    const subject: Subject =
      entry.subjectKind === "media_asset"
        ? { kind: "media_asset", ref: entry.subjectRef }
        : {
            kind: "product_translation",
            ref: entry.subjectRef,
            locale: entry.localeCode ?? "",
          };
    const [existing] = await rows<{ id: string; attested_at: string }>(
      db,
      sql`SELECT id, to_char(attested_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS attested_at
          FROM public.review_attestation
          WHERE channel = 'import' AND subject_kind = ${entry.subjectKind}
            AND subject_ref = ${entry.subjectRef}
            AND locale_code IS NOT DISTINCT FROM ${entry.localeCode}::text
            AND value_hash = ${entry.valueHash} AND decision = ${entry.decision}
            AND attester_name = ${entry.attesterName}
            AND attested_at = ${entry.attestedAt}::timestamptz
          LIMIT 1`,
    );
    if (existing !== undefined) {
      return {
        ok: true,
        id: existing.id,
        attestedAt: existing.attested_at,
        created: false,
        tags: [],
      };
    }
    const [row] = await rows<{ id: string }>(
      db,
      sql`INSERT INTO public.review_attestation (
            subject_kind, subject_ref, locale_code, value_hash, source_hash, decision,
            attester_user_id, attester_name, channel, attested_at)
          VALUES (${entry.subjectKind}, ${entry.subjectRef}, ${entry.localeCode}::text,
            ${entry.valueHash}, ${entry.sourceHash}::text, ${entry.decision}, NULL,
            ${entry.attesterName}, 'import', ${entry.attestedAt}::timestamptz)
          RETURNING id`,
    );
    if (row === undefined)
      throw new Error("attest: the ledger returned no row");
    if (command.mirror !== false) {
      await mirror(
        db,
        subject,
        entry.decision,
        entry.valueHash,
        entry.attesterName,
        entry.attestedAt,
      );
    }
    return {
      ok: true,
      id: row.id,
      attestedAt: entry.attestedAt,
      created: true,
      tags: await tagsFor(db, subject),
    };
  }

  const input = AttestInputSchema.parse(command.input);
  const deps: AttestDeps = { ...(await defaultDeps()), ...overrides };
  const subject = input.subject;
  const locale = subjectLocale(subject);
  const note =
    input.note === undefined || input.note === "" ? null : input.note;
  if (input.decision === "changes_requested" && note === null) {
    return refused("note_required");
  }

  const outcome = await deps.runAdmin(
    {
      userId: input.userId,
      action: `review.${input.decision}`,
      ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
    },
    async (db): Promise<AttestOutcome> => {
      const [reviewer] = await rows<{
        display_name: string;
        roles: string[] | null;
        locales: string[] | null;
      }>(
        db,
        sql`SELECT p.display_name,
                   (SELECT array_agg(r.role ORDER BY r.role) FROM public.user_role r
                     WHERE r.user_id = p.user_id) AS roles,
                   (SELECT array_agg(l.locale_code ORDER BY l.locale_code)
                      FROM public.reviewer_locale l WHERE l.user_id = p.user_id) AS locales
            FROM public.admin_profile p
            WHERE p.user_id = ${input.userId}::uuid AND p.deactivated_at IS NULL`,
      );
      const roles = reviewer?.roles ?? [];
      if (reviewer === undefined || roles.length === 0) {
        return refused("not_a_reviewer");
      }
      const attesterName = reviewer.display_name.trim();
      if (attesterName === "") return refused("no_display_name");
      if (subject.kind === "product_translation") {
        if (
          !deps.can(roles, "translation.attest") ||
          !(reviewer.locales ?? []).includes(subject.locale)
        ) {
          return refused("locale_not_granted");
        }
      } else if (!deps.can(roles, "media.review")) {
        return refused("permission_denied");
      }

      const [current] = await rows<{ hash: string | null }>(
        db,
        currentHashQuery(subject, locale),
      );
      if (current?.hash === null || current?.hash === undefined) {
        return refused("unknown_subject");
      }
      if (current.hash !== input.valueHash) return refused("stale_hash");

      let sourceHash: string | null = null;
      if (
        subject.kind === "product_translation" &&
        subject.locale !== SOURCE_LOCALE
      ) {
        const [source] = await rows<{ hash: string | null }>(
          db,
          currentHashQuery(
            { ...subject, locale: SOURCE_LOCALE },
            SOURCE_LOCALE,
          ),
        );
        sourceHash = source?.hash ?? null;
      }

      const [row] = await rows<{ id: string; attested_at: string }>(
        db,
        sql`INSERT INTO public.review_attestation (
              subject_kind, subject_ref, locale_code, value_hash, source_hash, decision, note,
              suggested_text, attester_user_id, attester_name, channel)
            VALUES (${subject.kind}, ${subject.ref}, ${locale}::text, ${input.valueHash},
              ${sourceHash}::text, ${input.decision}, ${note}::text,
              ${input.suggestedText ?? null}::text, ${input.userId}::uuid, ${attesterName},
              'admin')
            RETURNING id,
              to_char(attested_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS attested_at`,
      );
      if (row === undefined)
        throw new Error("attest: the ledger returned no row");
      await mirror(
        db,
        subject,
        input.decision,
        input.valueHash,
        attesterName,
        row.attested_at,
      );
      return {
        ok: true,
        id: row.id,
        attestedAt: row.attested_at,
        created: true,
        tags: await tagsFor(db, subject),
      };
    },
  );
  if (outcome.ok) {
    deps.log({
      kind: subject.kind,
      ref: subject.ref,
      locale,
      decision: input.decision,
    });
  }
  return outcome;
}

/* -------------------------------------------------------------------------- */
/* Reads.                                                                      */
/* -------------------------------------------------------------------------- */

/** What the ledger reads run in (default: `withSystemContext('attestations.read')`). */
export type LedgerReader = <T>(
  fn: (db: LedgerExecutor) => Promise<T>,
) => Promise<T>;

async function defaultReader(): Promise<LedgerReader> {
  const { withSystemContext } = await import("@/lib/db");
  return (fn) => withSystemContext("attestations.read", (db) => fn(db));
}

/** The newest ledger row of each subject: subject, hash, decision and channel, never a name. */
async function headsIn(
  db: LedgerExecutor,
  subjects: readonly Subject[],
): Promise<Map<string, LedgerHead>> {
  const out = new Map<string, LedgerHead>();
  if (subjects.length === 0) return out;
  const wanted = sql.join(
    subjects.map(
      (subject) =>
        sql`(${subject.kind}::text, ${subject.ref}::text, ${subjectLocale(subject)}::text)`,
    ),
    sql`, `,
  );
  const found = await rows<{
    subject_kind: Subject["kind"];
    subject_ref: string;
    locale_code: string | null;
    decision: ReviewDecision;
    value_hash: string;
    source_hash: string | null;
    channel: ReviewChannel;
  }>(
    db,
    sql`SELECT DISTINCT ON (a.subject_kind, a.subject_ref, a.locale_code)
               a.subject_kind, a.subject_ref, a.locale_code, a.decision, a.value_hash,
               a.source_hash, a.channel
        FROM public.review_attestation a
        JOIN (VALUES ${wanted}) AS w(kind, ref, locale)
          ON a.subject_kind = w.kind AND a.subject_ref = w.ref
         AND a.locale_code IS NOT DISTINCT FROM w.locale
        ORDER BY a.subject_kind, a.subject_ref, a.locale_code, a.attested_at DESC,
                 (a.channel = 'admin') DESC, a.id DESC`,
  );
  for (const row of found) {
    const subject: Subject =
      row.subject_kind === "media_asset"
        ? { kind: "media_asset", ref: row.subject_ref }
        : {
            kind: "product_translation",
            ref: row.subject_ref,
            locale: row.locale_code ?? "",
          };
    out.set(subjectKey(subject), {
      decision: row.decision,
      valueHash: row.value_hash,
      sourceHash: row.source_hash,
      channel: row.channel,
    });
  }
  return out;
}

/** The database `AttestationProvider` (§5.2). */
export function dbAttestationProvider(
  reader?: LedgerReader,
): AttestationProvider {
  return {
    async heads(subjects) {
      const run = reader ?? (await defaultReader());
      return run((db) => headsIn(db, subjects));
    },
  };
}

/**
 * The review state of one subject now (§5.2 `reviewState`): its newest ledger row against the
 * hash it serves, and for non-English copy the English source's current hash (stale, AC-12).
 */
export async function reviewState(
  subject: Subject,
  reader?: LedgerReader,
): Promise<ReviewState> {
  const run = reader ?? (await defaultReader());
  return run(async (db) => {
    const locale = subjectLocale(subject);
    const [current] = await rows<{ hash: string | null }>(
      db,
      currentHashQuery(subject, locale),
    );
    let source: string | null = null;
    if (
      subject.kind === "product_translation" &&
      subject.locale !== SOURCE_LOCALE
    ) {
      const [row] = await rows<{ hash: string | null }>(
        db,
        currentHashQuery({ ...subject, locale: SOURCE_LOCALE }, SOURCE_LOCALE),
      );
      source = row?.hash ?? null;
    }
    const heads = await headsIn(db, [subject]);
    return reviewStateOf(
      heads.get(subjectKey(subject)),
      current?.hash ?? null,
      source,
    );
  });
}

/** A request id for a CLI run that has none. */
export function cliRequestId(name: string): string {
  return `cli:${name}:${randomUUID()}`;
}
