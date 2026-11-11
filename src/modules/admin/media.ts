/**
 * The photo commands and reads of admin (spec 012b §2.7, §5.2, §5.3; AC-22, AC-23; TASK-299).
 *
 *  - `uploadPhoto` (`MediaUploadSchema` + `MediaProvenanceSchema`, discriminated on `source`):
 *    every refusal happens **before** anything is stored: the fields (a `delivery` photo, a
 *    florist photo with no florist, a missing provenance field), then the bytes (`media-image.ts`:
 *    15 MiB, JPEG, PNG or WebP by magic bytes, 40 megapixels from the header, re-encoded with no
 *    EXIF, GPS, XMP or IPTC block), then the florist and the product named. Only then is the
 *    clean original put to the **private** bucket under `objectKey(kind, assetId, "original")`
 *    (`originals/{kind}/{assetId}`), one `media_asset` row is written in `pending` with the
 *    provenance of its source, and one `media.derive_variants` job is enqueued. A failed write
 *    deletes the object again.
 *  - `reviewPhoto`: approve or reject through `attest()` only (the ledger's one writer; the
 *    database guard refuses any other write of `review_state`). A florist photo is not approved
 *    while the florist has no `terms_version` (`attest()` refuses `no_supplier_terms`, and the
 *    page shows no Approve). An approval enqueues `media.derive_variants` again: a pending
 *    photo's job derives nothing public, an approved one's publishes the ladder.
 *  - `attachPhoto` (`MediaAttachSchema`): a pending or rejected photo is never primary; a second
 *    primary on a product is refused (the partial unique index of `0004` holds it as well).
 *  - `savePhotoAlt` (`MediaAltEditSchema`): one locale's alt text, in the user's reviewer
 *    locales; empty removes it, a file name is refused. The alt text is part of that locale's
 *    product copy hash, so saving it makes that locale unreviewed.
 *
 * Every command runs in one admin transaction carrying its audit action (spec 012's trigger
 * writes the rows it changed, `0044`) and returns its §5.4 tags to `applyCommand()`.
 */
import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { z } from "zod";

import { isLocaleCode, launchLocales } from "@/config/locales";
import { isFileNameAlt } from "@/config/media-upload";
import { invalidate as invalidateCache } from "@/lib/cache";
import { type AdminCommand, commandTags } from "@/lib/command-tags";
import type { AdminContextInput, DbTransaction } from "@/lib/db";
import { type ObjectKind, type Storage, objectKey } from "@/lib/storage";
import {
  type AttestInput,
  type AttestOutcome,
  type AttestRefusal,
  attest,
} from "@/modules/i18n";

import type { CleanImageResult, ImageRefusal } from "./media-image";
import { type AdminRunner, adminRunner } from "./users";

/* -------------------------------------------------------------------------- */
/* vocabulary                                                                 */
/* -------------------------------------------------------------------------- */

export const MEDIA_ACTIONS = Object.freeze({
  list: "media.list",
  view: "media.view",
  upload: "media.upload",
  attach: "media.attach",
  alt: "media.alt_save",
} as const);

/** What an admin photo may show. `delivery` is refused: delivery photos come with the order. */
export const UPLOAD_DEPICTS = ["product", "brand", "context"] as const;
export type UploadDepicts = (typeof UPLOAD_DEPICTS)[number];

export const MEDIA_SOURCES = ["partner", "ai", "photo"] as const;
export const MEDIA_STATES = ["pending", "approved", "rejected"] as const;

const Sha256 = z.string().regex(/^[0-9a-f]{64}$/u);
const Sku = z.string().regex(/^FO-(?:BQ|AR|PT|FN|GS)-\d{3}$/u);
const Version = z.iso.datetime({ offset: true });
const Text = (max: number) => z.string().trim().min(2).max(max);

/** §5.2 `MediaProvenanceSchema`: what spec 006 §2.4 requires of each source. */
export const MediaProvenanceSchema = z.discriminatedUnion("source", [
  z.strictObject({ source: z.literal("partner"), supplierPartnerId: z.uuid() }),
  z.strictObject({
    source: z.literal("ai"),
    generator: Text(80),
    generatorModel: Text(80),
    promptHash: Sha256,
    generatorSeed: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  }),
  z.strictObject({
    source: z.literal("photo"),
    credit: Text(200),
    licence: Text(200),
  }),
]);
export type MediaProvenance = z.infer<typeof MediaProvenanceSchema>;

/** §5.2 `MediaUploadSchema`: what the photo shows, the product it is for, where it is from. */
export const MediaUploadSchema = z.strictObject({
  depicts: z.enum(UPLOAD_DEPICTS),
  productSku: Sku.optional(),
  provenance: MediaProvenanceSchema,
});
export type MediaUpload = z.infer<typeof MediaUploadSchema>;

/** §5.2 `MediaAttachSchema`. */
export const MediaAttachSchema = z.strictObject({
  productId: z.uuid(),
  updatedAt: Version,
  assetId: z.uuid(),
  primary: z.boolean(),
});

/** §5.2 `MediaAltEditSchema`. */
export const MediaAltEditSchema = z.strictObject({
  productId: z.uuid(),
  updatedAt: Version,
  productMediaId: z.uuid(),
  locale: z.string().refine(isLocaleCode),
  alt: z.string().trim().max(300),
});

/** The review decision of `/admin/media/[id]`: spec 006's four checks before an approval. */
export const MediaReviewSchema = z
  .strictObject({
    assetId: z.uuid(),
    checksum: Sha256,
    decision: z.enum(["approved", "rejected"]),
    note: z.string().trim().max(2000).optional(),
    checks: z.array(z.enum(["people", "address", "brand", "matches"])),
  })
  .refine(
    (input) =>
      input.decision !== "approved" || new Set(input.checks).size === 4,
    { path: ["checks"] },
  )
  .refine(
    (input) =>
      input.decision !== "rejected" || (input.note ?? "").trim() !== "",
    { path: ["note"] },
  );

export interface MediaActor {
  readonly userId: string;
  readonly requestId?: string;
  readonly roles: readonly string[];
}

export type UploadRefusalReason =
  | ImageRefusal
  | "delivery"
  | "supplier_required"
  | "provenance"
  | "supplier_unknown"
  | "product_unknown"
  | "duplicate"
  | "storage_unconfigured";

export type UploadResult =
  | { readonly ok: true; readonly assetId: string }
  | {
      readonly ok: false;
      readonly reason: UploadRefusalReason;
      /** `provenance`: the missing or invalid fields. `duplicate`: the asset already stored. */
      readonly fields?: readonly string[];
      readonly assetId?: string;
    };

export type MediaRefusalReason =
  | "invalid"
  | "not_found"
  | "conflict"
  | "not_approved"
  | "primary_taken"
  | "already_attached"
  | "forbidden_locale"
  | "alt_file_name"
  | AttestRefusal;

export type MediaResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: MediaRefusalReason };

/** Where originals live: the private bucket and the storage seam over it. */
export interface MediaStore {
  readonly storage: Storage;
  readonly bucket: string;
}

export interface MediaDeps {
  readonly run: AdminRunner;
  /** The private bucket; throws `MEDIA_STORAGE_UNCONFIGURED` when none is configured. */
  readonly store: () => Promise<MediaStore>;
  readonly clean: (bytes: Uint8Array) => Promise<CleanImageResult>;
  readonly enqueueDerive: (assetId: string, requestId: string) => Promise<void>;
  readonly attest: (input: AttestInput) => Promise<AttestOutcome>;
  readonly invalidate: (tags: readonly string[]) => Promise<unknown>;
}

export const STORAGE_UNCONFIGURED = "MEDIA_STORAGE_UNCONFIGURED";

/** The production store: R2's private bucket, loaded at the first call (no env read at import). */
export async function privateMediaStore(): Promise<MediaStore> {
  const { R2Storage, r2EnvironmentFrom } = await import("@/lib/storage-r2");
  const r2 = r2EnvironmentFrom(process.env);
  if (r2.privateBucket === undefined) {
    throw new Error(`${STORAGE_UNCONFIGURED}: no private bucket is configured`);
  }
  return { storage: new R2Storage(r2.config), bucket: r2.privateBucket };
}

async function enqueueDeriveJob(
  assetId: string,
  requestId: string,
): Promise<void> {
  const { enqueue, withBoss } = await import("@/jobs/runtime");
  await withBoss((boss) =>
    enqueue(
      boss,
      "media.derive_variants",
      { assetId, reason: "upload" },
      { requestId },
    ),
  );
}

const defaults: MediaDeps = {
  run: adminRunner,
  store: privateMediaStore,
  clean: async (bytes) =>
    (await import("./media-image")).cleanUploadedImage(bytes),
  enqueueDerive: enqueueDeriveJob,
  attest: (input) => attest(input),
  invalidate: (tags) => invalidateCache([...tags]),
};

function depsOf(overrides: Partial<MediaDeps>): MediaDeps {
  return { ...defaults, ...overrides };
}

function context(actor: MediaActor, action: string): AdminContextInput {
  return {
    userId: actor.userId,
    ...(actor.requestId === undefined ? {} : { requestId: actor.requestId }),
    action,
  };
}

function requestIdOf(actor: MediaActor): string {
  return actor.requestId ?? `admin:${MEDIA_ACTIONS.upload}`;
}

/* -------------------------------------------------------------------------- */
/* upload                                                                     */
/* -------------------------------------------------------------------------- */

/** The upload form's text fields, as the route reads them. */
export type UploadFields = Readonly<Record<string, string>>;

/**
 * The fields into `MediaUploadSchema`, with the refusals the form names: a `delivery` photo, a
 * florist photo with no florist, and the missing or invalid provenance fields.
 */
export function parseUploadFields(fields: UploadFields):
  | { readonly ok: true; readonly value: MediaUpload }
  | {
      readonly ok: false;
      readonly reason: "delivery" | "supplier_required" | "provenance";
      readonly fields: readonly string[];
    } {
  const value = (name: string): string | undefined => {
    const raw = fields[name]?.trim();
    return raw === undefined || raw === "" ? undefined : raw;
  };
  if (value("depicts") === "delivery") {
    return { ok: false, reason: "delivery", fields: ["depicts"] };
  }
  const source = value("source");
  if (source === "partner" && value("supplierPartnerId") === undefined) {
    return {
      ok: false,
      reason: "supplier_required",
      fields: ["supplierPartnerId"],
    };
  }
  const provenanceFields: Record<string, readonly string[]> = {
    partner: ["supplierPartnerId"],
    ai: ["generator", "generatorModel", "promptHash", "generatorSeed"],
    photo: ["credit", "licence"],
  };
  const provenance: Record<string, string | undefined> = { source };
  for (const name of provenanceFields[source ?? ""] ?? []) {
    provenance[name] = value(name);
  }
  const productSku = value("productSku");
  const parsed = MediaUploadSchema.safeParse({
    depicts: value("depicts"),
    ...(productSku === undefined ? {} : { productSku }),
    provenance,
  });
  if (!parsed.success) {
    const names = [
      ...new Set(
        parsed.error.issues.map((issue) =>
          String(issue.path.at(-1) ?? "source"),
        ),
      ),
    ].sort();
    return { ok: false, reason: "provenance", fields: names };
  }
  return { ok: true, value: parsed.data };
}

/** `media_asset.kind` from what an upload shows (`seed/schema/media.ts`'s `mediaAssetKindFor`). */
function kindFor(depicts: UploadDepicts): ObjectKind {
  return depicts === "product" ? "product" : "brand";
}

interface UploadFacts {
  readonly supplier?: { readonly code: string; readonly terms: string | null };
  readonly productId?: string;
  readonly duplicate?: string;
}

async function uploadFacts(
  db: DbTransaction,
  upload: MediaUpload,
  checksum: string,
): Promise<UploadFacts | UploadRefusalReason> {
  let supplier: UploadFacts["supplier"];
  if (upload.provenance.source === "partner") {
    const [row] = await db.execute<{ code: string; terms: string | null }>(sql`
      SELECT code, terms_version AS terms FROM public.fulfillment_partner
       WHERE id = ${upload.provenance.supplierPartnerId}::uuid AND status <> 'demo'`);
    if (row === undefined) return "supplier_unknown";
    supplier = { code: row.code, terms: row.terms };
  }
  let productId: string | undefined;
  if (upload.productSku !== undefined) {
    const [row] = await db.execute<{ id: string }>(sql`
      SELECT id FROM public.product WHERE sku = ${upload.productSku}`);
    if (row === undefined) return "product_unknown";
    productId = row.id;
  }
  const [same] = await db.execute<{ id: string }>(sql`
    SELECT id FROM public.media_asset WHERE checksum_sha256 = ${checksum} LIMIT 1`);
  return {
    ...(supplier === undefined ? {} : { supplier }),
    ...(productId === undefined ? {} : { productId }),
    ...(same === undefined ? {} : { duplicate: same.id }),
  };
}

/** `uploadOriginal`: see the header. Nothing is stored on any refusal. */
export async function uploadPhoto(
  actor: MediaActor,
  fields: UploadFields,
  bytes: Uint8Array,
  overrides: Partial<MediaDeps> = {},
): Promise<UploadResult> {
  const deps = depsOf(overrides);
  const parsed = parseUploadFields(fields);
  if (!parsed.ok) return parsed;
  const upload = parsed.value;
  const cleaned = await deps.clean(bytes);
  if (!cleaned.ok) return cleaned;
  const image = cleaned.image;

  const facts = await deps.run(context(actor, MEDIA_ACTIONS.view), (db) =>
    uploadFacts(db, upload, image.checksumSha256),
  );
  if (typeof facts === "string") return { ok: false, reason: facts };
  if (facts.duplicate !== undefined) {
    return { ok: false, reason: "duplicate", assetId: facts.duplicate };
  }

  let store: MediaStore;
  try {
    store = await deps.store();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith(STORAGE_UNCONFIGURED)
    ) {
      return { ok: false, reason: "storage_unconfigured" };
    }
    throw error;
  }
  const assetId = randomUUID();
  const kind = kindFor(upload.depicts);
  const location = {
    bucket: store.bucket,
    objectKey: objectKey(kind, assetId, "original"),
  };
  await store.storage.put({
    ...location,
    body: image.body,
    mime: image.mime,
    checksumSha256: image.checksumSha256,
  });

  const p = upload.provenance;
  const credit =
    p.source === "partner"
      ? (facts.supplier?.code ?? null)
      : p.source === "photo"
        ? p.credit
        : p.generator;
  const licence =
    p.source === "partner"
      ? (facts.supplier?.terms ?? null)
      : p.source === "photo"
        ? p.licence
        : null;
  try {
    const written = await deps.run(
      context(actor, MEDIA_ACTIONS.upload),
      async (db): Promise<UploadResult> => {
        const again = await uploadFacts(db, upload, image.checksumSha256);
        if (typeof again === "string") return { ok: false, reason: again };
        if (again.duplicate !== undefined) {
          return { ok: false, reason: "duplicate", assetId: again.duplicate };
        }
        await db.execute(sql`
          INSERT INTO public.media_asset (
            id, kind, bucket, object_key, mime, width, height, bytes, checksum_sha256,
            visibility, source, generator_prompt_hash, generator_seed, generator_model, credit,
            licence, exif_stripped, depicts, supplier_partner_id)
          VALUES (
            ${assetId}::uuid, ${kind}, ${location.bucket}, ${location.objectKey}, ${image.mime},
            ${image.width}, ${image.height}, ${image.body.byteLength}, ${image.checksumSha256},
            'public', ${p.source}, ${p.source === "ai" ? p.promptHash : null},
            ${p.source === "ai" ? p.generatorSeed : null},
            ${p.source === "ai" ? p.generatorModel : null}, ${credit}, ${licence}, true,
            ${upload.depicts},
            ${p.source === "partner" ? p.supplierPartnerId : null}::uuid)`);
        if (again.productId !== undefined) {
          await db.execute(sql`
            INSERT INTO public.product_media (product_id, media_asset_id, sort, is_primary)
            SELECT ${again.productId}::uuid, ${assetId}::uuid,
                   coalesce(max(sort) + 1, 0), false
              FROM public.product_media WHERE product_id = ${again.productId}::uuid`);
        }
        return { ok: true, assetId };
      },
    );
    if (!written.ok) {
      await store.storage.delete(location);
      return written;
    }
  } catch (error) {
    await store.storage.delete(location).catch(() => undefined);
    throw error;
  }
  await deps.enqueueDerive(assetId, requestIdOf(actor));
  return { ok: true, assetId };
}

/* -------------------------------------------------------------------------- */
/* review, attach, alt                                                        */
/* -------------------------------------------------------------------------- */

/** The §5.4 tags of a change to the photos of the products in `skus`, as one union. */
async function photoTags(
  db: DbTransaction,
  productIds: readonly string[],
  kind: "photo" | "review" | "copy",
): Promise<string[]> {
  const tags = new Set<string>();
  for (const id of productIds) {
    const [row] = await db.execute<{
      sku: string;
      priced: string[] | null;
    }>(sql`
      SELECT p.sku,
             (SELECT array_agg(DISTINCT c.iso2 ORDER BY c.iso2)
                FROM public.country_price cp JOIN public.country c ON c.id = cp.country_id
               WHERE cp.product_id = p.id AND cp.active_to IS NULL) AS priced
        FROM public.product p WHERE p.id = ${id}::uuid`);
    if (row === undefined || !Sku.safeParse(row.sku).success) continue;
    const priced = row.priced ?? [];
    const command: AdminCommand =
      priced.length === 0
        ? { kind: "structural" }
        : { kind, sku: row.sku, pricedIn: priced };
    for (const tag of commandTags(command)) tags.add(tag);
  }
  return [...tags].sort();
}

async function lockProduct(
  db: DbTransaction,
  productId: string,
  updatedAt: string,
): Promise<"not_found" | "conflict" | undefined> {
  const [row] = await db.execute<{ version: string }>(sql`
    SELECT to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS version
      FROM public.product WHERE id = ${productId}::uuid FOR UPDATE`);
  if (row === undefined) return "not_found";
  if (new Date(row.version).getTime() !== new Date(updatedAt).getTime()) {
    return "conflict";
  }
  return undefined;
}

async function bumpProduct(
  db: DbTransaction,
  productId: string,
): Promise<void> {
  await db.execute(sql`
    UPDATE public.product SET updated_at = clock_timestamp() WHERE id = ${productId}::uuid`);
}

class Refused extends Error {
  readonly reason: MediaRefusalReason;
  constructor(reason: MediaRefusalReason) {
    super(reason);
    this.reason = reason;
  }
}

async function command<T>(
  actor: MediaActor,
  action: string,
  deps: MediaDeps,
  fn: (db: DbTransaction) => Promise<{ value: T; tags: readonly string[] }>,
): Promise<MediaResult<T>> {
  try {
    const done = await deps.run(context(actor, action), fn);
    if (done.tags.length > 0) await deps.invalidate(done.tags);
    return { ok: true, value: done.value };
  } catch (error) {
    if (error instanceof Refused) return { ok: false, reason: error.reason };
    throw error;
  }
}

/** Approve or reject a photo through `attest()`; see the header. */
export async function reviewPhoto(
  actor: MediaActor,
  input: unknown,
  overrides: Partial<MediaDeps> = {},
): Promise<MediaResult<{ assetId: string }>> {
  const deps = depsOf(overrides);
  const parsed = MediaReviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const review = parsed.data;
  const outcome = await deps.attest({
    userId: actor.userId,
    subject: { kind: "media_asset", ref: review.checksum },
    decision: review.decision,
    valueHash: review.checksum,
    ...(review.note === undefined || review.note === ""
      ? {}
      : { note: review.note }),
    ...(actor.requestId === undefined ? {} : { requestId: actor.requestId }),
  });
  if (!outcome.ok) return { ok: false, reason: outcome.refusal };
  const tags = await deps.run(
    context(actor, MEDIA_ACTIONS.view),
    async (db) => {
      const products = await db.execute<{ id: string }>(sql`
      SELECT DISTINCT pm.product_id AS id FROM public.product_media pm
        JOIN public.media_asset a ON a.id = pm.media_asset_id
       WHERE a.checksum_sha256 = ${review.checksum}`);
      return photoTags(
        db,
        products.map((row) => row.id),
        "review",
      );
    },
  );
  if (tags.length > 0) await deps.invalidate(tags);
  if (review.decision === "approved") {
    await deps.enqueueDerive(review.assetId, requestIdOf(actor));
  }
  return { ok: true, value: { assetId: review.assetId } };
}

/** `attachMedia`: a photo onto a product, as primary only when approved and none is. */
export async function attachPhoto(
  actor: MediaActor,
  input: unknown,
  overrides: Partial<MediaDeps> = {},
): Promise<MediaResult<{ productMediaId: string }>> {
  const deps = depsOf(overrides);
  const parsed = MediaAttachSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const edit = parsed.data;
  return command(actor, MEDIA_ACTIONS.attach, deps, async (db) => {
    const locked = await lockProduct(db, edit.productId, edit.updatedAt);
    if (locked !== undefined) throw new Refused(locked);
    const [asset] = await db.execute<{ state: string; depicts: string }>(sql`
      SELECT review_state AS state, depicts FROM public.media_asset
       WHERE id = ${edit.assetId}::uuid`);
    if (asset?.depicts !== "product") throw new Refused("not_found");
    if (edit.primary && asset.state !== "approved") {
      throw new Refused("not_approved");
    }
    const existing = await db.execute<{ asset: string; primary: boolean }>(sql`
      SELECT media_asset_id AS asset, is_primary AS primary FROM public.product_media
       WHERE product_id = ${edit.productId}::uuid`);
    if (existing.some((row) => row.asset === edit.assetId)) {
      throw new Refused("already_attached");
    }
    if (edit.primary && existing.some((row) => row.primary)) {
      throw new Refused("primary_taken");
    }
    const [row] = await db.execute<{ id: string }>(sql`
      INSERT INTO public.product_media (product_id, media_asset_id, sort, is_primary)
      VALUES (${edit.productId}::uuid, ${edit.assetId}::uuid, ${existing.length}, ${edit.primary})
      RETURNING id`);
    await bumpProduct(db, edit.productId);
    return {
      value: { productMediaId: row?.id ?? "" },
      tags: await photoTags(db, [edit.productId], "photo"),
    };
  });
}

/** `saveAlt`: one locale's alt text of one attached photo; see the header. */
export async function savePhotoAlt(
  actor: MediaActor,
  input: unknown,
  overrides: Partial<MediaDeps> = {},
): Promise<MediaResult<{ productMediaId: string }>> {
  const deps = depsOf(overrides);
  const parsed = MediaAltEditSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const edit = parsed.data;
  return command(actor, MEDIA_ACTIONS.alt, deps, async (db) => {
    if (!actor.roles.includes("admin")) {
      const granted = await db.execute<{ one: number }>(sql`
        SELECT 1 AS one FROM public.reviewer_locale
         WHERE user_id = ${actor.userId}::uuid AND locale_code = ${edit.locale}`);
      if (granted.length === 0) throw new Refused("forbidden_locale");
    }
    const locked = await lockProduct(db, edit.productId, edit.updatedAt);
    if (locked !== undefined) throw new Refused(locked);
    const [attached] = await db.execute<{ key: string }>(sql`
      SELECT a.object_key AS key FROM public.product_media pm
        JOIN public.media_asset a ON a.id = pm.media_asset_id
       WHERE pm.id = ${edit.productMediaId}::uuid AND pm.product_id = ${edit.productId}::uuid`);
    if (attached === undefined) throw new Refused("not_found");
    if (edit.alt === "") {
      await db.execute(sql`
        DELETE FROM public.product_media_alt
         WHERE product_media_id = ${edit.productMediaId}::uuid AND locale_code = ${edit.locale}`);
    } else {
      const keyId = attached.key.split("/").at(-1) ?? "";
      if (isFileNameAlt(edit.alt, [keyId])) throw new Refused("alt_file_name");
      await db.execute(sql`
        INSERT INTO public.product_media_alt (product_media_id, locale_code, alt)
        VALUES (${edit.productMediaId}::uuid, ${edit.locale}, ${edit.alt})
        ON CONFLICT (product_media_id, locale_code) DO UPDATE SET alt = EXCLUDED.alt`);
    }
    await bumpProduct(db, edit.productId);
    return {
      value: { productMediaId: edit.productMediaId },
      tags: await photoTags(db, [edit.productId], "copy"),
    };
  });
}

/* -------------------------------------------------------------------------- */
/* reads                                                                      */
/* -------------------------------------------------------------------------- */

/** Does a photo render in a locale? Approved, and an alt there that is not empty or a file name. */
export function photoRendersIn(
  state: string,
  alt: string | undefined,
  names: readonly string[] = [],
): boolean {
  return (
    state === "approved" &&
    alt !== undefined &&
    alt.trim() !== "" &&
    !isFileNameAlt(alt, names)
  );
}

export interface MediaListRow {
  readonly id: string;
  readonly shortId: string;
  readonly state: string;
  readonly source: string;
  readonly depicts: string;
  readonly imported: boolean;
  readonly skus: readonly string[];
  readonly createdAt: string;
}

export const MediaListFilterSchema = z
  .object({
    state: z.enum(MEDIA_STATES).optional().catch(undefined),
    source: z.enum(MEDIA_SOURCES).optional().catch(undefined),
    sku: Sku.optional().catch(undefined),
  })
  .catch({});
export type MediaListFilter = z.infer<typeof MediaListFilterSchema>;

export interface MediaListView {
  readonly rows: readonly MediaListRow[];
  readonly photoCount: number;
  readonly waitingCount: number;
}

/** Every photo, newest first, filtered; with the total and the count waiting for review. */
export async function mediaList(
  actor: MediaActor,
  filter: MediaListFilter,
  run: AdminRunner = adminRunner,
): Promise<MediaListView> {
  return run(context(actor, MEDIA_ACTIONS.list), async (db) => {
    const rows = await db.execute<{
      id: string;
      state: string;
      source: string;
      depicts: string;
      imported: boolean;
      skus: string[] | null;
      created: string;
    }>(sql`
      SELECT a.id, a.review_state AS state, a.source, a.depicts,
             EXISTS (SELECT 1 FROM public.review_attestation r
                      WHERE r.subject_kind = 'media_asset' AND r.subject_ref = a.checksum_sha256
                        AND r.channel = 'import') AS imported,
             (SELECT array_agg(p.sku ORDER BY p.sku) FROM public.product_media pm
                JOIN public.product p ON p.id = pm.product_id
               WHERE pm.media_asset_id = a.id) AS skus,
             to_char(a.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created
        FROM public.media_asset a
       WHERE a.kind IN ('product', 'brand')
         AND (${filter.state ?? null}::text IS NULL OR a.review_state = ${filter.state ?? null})
         AND (${filter.source ?? null}::text IS NULL OR a.source = ${filter.source ?? null})
         AND (${filter.sku ?? null}::text IS NULL OR EXISTS (
               SELECT 1 FROM public.product_media pm JOIN public.product p ON p.id = pm.product_id
                WHERE pm.media_asset_id = a.id AND p.sku = ${filter.sku ?? null}))
       ORDER BY a.created_at DESC, a.id
       LIMIT 200`);
    const [counts] = await db.execute<{ photos: number; waiting: number }>(sql`
      SELECT count(*)::int AS photos,
             count(*) FILTER (WHERE review_state = 'pending')::int AS waiting
        FROM public.media_asset WHERE kind IN ('product', 'brand')`);
    return {
      rows: rows.map((row) => ({
        id: row.id,
        shortId: row.id.slice(0, 4),
        state: row.state,
        source: row.source,
        depicts: row.depicts,
        imported: row.imported,
        skus: row.skus ?? [],
        createdAt: row.created,
      })),
      photoCount: counts?.photos ?? 0,
      waitingCount: counts?.waiting ?? 0,
    };
  });
}

export interface MediaDetailView {
  readonly id: string;
  readonly checksum: string;
  readonly state: string;
  readonly source: string;
  readonly depicts: string;
  readonly mime: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly credit: string | null;
  readonly licence: string | null;
  readonly generatorModel: string | null;
  readonly supplier:
    { readonly code: string; readonly terms: string | null } | undefined;
  readonly reviewedBy: string | null;
  readonly reviewedAt: string | null;
  readonly createdAt: string;
  readonly imported: boolean;
  readonly derived: boolean;
  readonly note: string | null;
  readonly skus: readonly string[];
}

/** One photo for `/admin/media/[id]`. */
export async function mediaDetail(
  actor: MediaActor,
  assetId: string,
  run: AdminRunner = adminRunner,
): Promise<MediaDetailView | undefined> {
  if (!z.uuid().safeParse(assetId).success) return undefined;
  return run(context(actor, MEDIA_ACTIONS.view), async (db) => {
    const [row] = await db.execute<{
      id: string;
      checksum: string;
      state: string;
      source: string;
      depicts: string;
      mime: string;
      width: number | null;
      height: number | null;
      credit: string | null;
      licence: string | null;
      model: string | null;
      code: string | null;
      terms: string | null;
      reviewed_by: string | null;
      reviewed_at: string | null;
      created: string;
      imported: boolean;
      derived: boolean;
      note: string | null;
      skus: string[] | null;
    }>(sql`
      SELECT a.id, a.checksum_sha256 AS checksum, a.review_state AS state, a.source, a.depicts,
             a.mime, a.width, a.height, a.credit, a.licence, a.generator_model AS model,
             f.code, f.terms_version AS terms, a.reviewed_by,
             to_char(a.reviewed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS reviewed_at,
             to_char(a.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created,
             EXISTS (SELECT 1 FROM public.review_attestation r
                      WHERE r.subject_kind = 'media_asset' AND r.subject_ref = a.checksum_sha256
                        AND r.channel = 'import') AS imported,
             EXISTS (SELECT 1 FROM public.media_variant v WHERE v.media_asset_id = a.id) AS derived,
             (SELECT r.note FROM public.review_attestation r
               WHERE r.subject_kind = 'media_asset' AND r.subject_ref = a.checksum_sha256
               ORDER BY r.attested_at DESC, r.id DESC LIMIT 1) AS note,
             (SELECT array_agg(p.sku ORDER BY p.sku) FROM public.product_media pm
                JOIN public.product p ON p.id = pm.product_id
               WHERE pm.media_asset_id = a.id) AS skus
        FROM public.media_asset a
        LEFT JOIN public.fulfillment_partner f ON f.id = a.supplier_partner_id
       WHERE a.id = ${assetId}::uuid`);
    if (row === undefined) return undefined;
    return {
      id: row.id,
      checksum: row.checksum,
      state: row.state,
      source: row.source,
      depicts: row.depicts,
      mime: row.mime,
      width: row.width,
      height: row.height,
      credit: row.credit,
      licence: row.licence,
      generatorModel: row.model,
      supplier:
        row.code === null ? undefined : { code: row.code, terms: row.terms },
      reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at,
      createdAt: row.created,
      imported: row.imported,
      derived: row.derived,
      note: row.note,
      skus: row.skus ?? [],
    };
  });
}

/** The bytes of a photo's stored original, for the admin preview (never a public URL). */
export async function mediaOriginal(
  actor: MediaActor,
  assetId: string,
  overrides: Partial<MediaDeps> & {
    readonly fetch?: (url: string) => Promise<Response>;
  } = {},
): Promise<{ readonly body: Uint8Array; readonly mime: string } | undefined> {
  const deps = depsOf(overrides);
  if (!z.uuid().safeParse(assetId).success) return undefined;
  const [row] = await deps.run(context(actor, MEDIA_ACTIONS.view), (db) =>
    db.execute<{ bucket: string; key: string; mime: string }>(sql`
      SELECT bucket, object_key AS key, mime FROM public.media_asset
       WHERE id = ${assetId}::uuid AND kind IN ('product', 'brand')`),
  );
  if (row === undefined) return undefined;
  const { storage } = await deps.store();
  const url = await storage.getSignedUrl(
    { bucket: row.bucket, objectKey: row.key },
    60,
  );
  const response = await (overrides.fetch ?? fetch)(url);
  if (response.status !== 200) return undefined;
  return {
    body: new Uint8Array(await response.arrayBuffer()),
    mime: row.mime,
  };
}

export interface ProductPhoto {
  readonly productMediaId: string;
  readonly assetId: string;
  readonly keyId: string;
  readonly state: string;
  readonly source: string;
  readonly primary: boolean;
  readonly sort: number;
  readonly imported: boolean;
  readonly alts: Readonly<Record<string, string>>;
}

export interface ProductPhotosView {
  readonly photos: readonly ProductPhoto[];
  /** Product photos not attached to this product, for "Attach a photo". */
  readonly attachable: readonly {
    readonly id: string;
    readonly shortId: string;
    readonly state: string;
  }[];
}

/** The photos tab of the product editor. */
export async function productPhotos(
  actor: MediaActor,
  productId: string,
  run: AdminRunner = adminRunner,
): Promise<ProductPhotosView> {
  return run(context(actor, MEDIA_ACTIONS.view), async (db) => {
    const rows = await db.execute<{
      pm: string;
      asset: string;
      key: string;
      state: string;
      source: string;
      primary: boolean;
      sort: number;
      imported: boolean;
      alts: Record<string, string> | null;
    }>(sql`
      SELECT pm.id AS pm, a.id AS asset, a.object_key AS key, a.review_state AS state, a.source,
             pm.is_primary AS primary, pm.sort,
             EXISTS (SELECT 1 FROM public.review_attestation r
                      WHERE r.subject_kind = 'media_asset' AND r.subject_ref = a.checksum_sha256
                        AND r.channel = 'import') AS imported,
             (SELECT jsonb_object_agg(x.locale_code, x.alt) FROM public.product_media_alt x
               WHERE x.product_media_id = pm.id) AS alts
        FROM public.product_media pm JOIN public.media_asset a ON a.id = pm.media_asset_id
       WHERE pm.product_id = ${productId}::uuid
       ORDER BY pm.is_primary DESC, pm.sort, pm.id`);
    const attachable = await db.execute<{ id: string; state: string }>(sql`
      SELECT a.id, a.review_state AS state FROM public.media_asset a
       WHERE a.depicts = 'product' AND a.review_state <> 'rejected'
         AND NOT EXISTS (SELECT 1 FROM public.product_media pm
                          WHERE pm.media_asset_id = a.id AND pm.product_id = ${productId}::uuid)
       ORDER BY a.created_at DESC LIMIT 100`);
    return {
      photos: rows.map((row) => ({
        productMediaId: row.pm,
        assetId: row.asset,
        keyId: row.key.split("/").at(-1) ?? "",
        state: row.state,
        source: row.source,
        primary: row.primary,
        sort: row.sort,
        imported: row.imported,
        alts: Object.fromEntries(
          launchLocales.flatMap((locale) => {
            const alt = row.alts?.[locale];
            return alt === undefined ? [] : [[locale, alt]];
          }),
        ),
      })),
      attachable: attachable.map((row) => ({
        id: row.id,
        shortId: row.id.slice(0, 4),
        state: row.state,
      })),
    };
  });
}
