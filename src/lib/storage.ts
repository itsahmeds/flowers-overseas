/**
 * The object-storage seam (spec 002 §2 "Jobs, storage seam, probes", §5.2, AC-22; ADR-0015;
 * TASK-017).
 *
 * ADR-0015 puts every image, private upload and database dump in Cloudflare R2 and keeps **keys,
 * never bytes** in Postgres: `media_asset` and `media_variant` (migration `0004`) store a bucket,
 * an object key, a size and a SHA-256, and no column anywhere is `bytea`. This module is the one
 * place those keys are minted and the one interface through which the bytes are reached:
 *
 *  - `objectKey(kind, id, variant)` — the key convention, pure and deterministic. Collision-free by
 *    construction: every component is a single path segment from an alphabet without `/`, the
 *    kind is always a segment, and the three shapes live under three different roots —
 *
 *        originals/{kind}/{id}                  the uploaded original   (`"original"`)
 *        media/{kind}/{id}/{variant}.{format}   a derived variant       (`{ variant, format }`)
 *        backups/{yyyy}/{mm}/{dd}/{file}        a nightly dump          (`kind: "backup"`)
 *
 *    so a bucket rule or a public-access policy can address originals, derived media and dumps
 *    separately. `backups/YYYY/MM/DD/` is spec 002 §2's own wording (AC-25).
 *  - `Storage` — `put`, `head`, `getSignedUrl`, `delete`, `objectKey`, every input parsed by zod
 *    before it reaches an implementation ("Zod at every boundary").
 *  - `InMemoryStorage` — the fake every test uses. The S3-API implementation over R2 is spec 006
 *    (TASK-082) and must pass the same contract suite (`tests/contract/support/storage-contract.ts`).
 *
 * Nothing here reads the environment, opens a connection or logs: the R2 implementation takes its
 * bucket names and credentials from `lib/env.ts` when it exists, and an object key is on the
 * logger's redaction list (spec 002 §8), so no message below echoes one.
 */
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { z } from "zod";

/* -------------------------------------------------------------------------- */
/* Vocabulary                                                                 */
/* -------------------------------------------------------------------------- */

/** §5.2's `ObjectKind`: the four `media_asset.kind` values plus the database dump. */
export const objectKinds = [
  "product",
  "delivery_proof",
  "brand",
  "partner",
  "backup",
] as const;
export const ObjectKind = z.enum(objectKinds);
export type ObjectKind = z.infer<typeof ObjectKind>;

/** `media_variant.format` — spec 002 §5.1's CHECK list. */
export const mediaFormats = ["avif", "webp", "jpeg"] as const;
export const MediaFormat = z.enum(mediaFormats);
export type MediaFormat = z.infer<typeof MediaFormat>;

/**
 * The object-key alphabet: lowercase, slash-separated segments, each starting with a letter or a
 * digit, with dots only between words. So no leading or trailing slash, no empty segment (`//`),
 * no dot segment (`.`, `..`, `./`) and no `..` anywhere: a key names exactly one object, and the
 * path `URL` normalises is the path that was signed. Identical to `ObjectKeySchema` in
 * `seed/schema/media.ts` and to the `*_object_key_check` constraints of migration `0004`, so a
 * key minted here is a key the seed and the database both accept.
 */
export const OBJECT_KEY_PATTERN =
  "^[a-z0-9][a-z0-9_-]*([.][a-z0-9_-]+)*(/[a-z0-9][a-z0-9_-]*([.][a-z0-9_-]+)*)*$";

/** An S3/R2 bucket name, as `R2_BUCKET` is validated in `lib/env.schema.ts`. */
const BUCKET_PATTERN = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;

/** One path segment: lowercase ASCII words joined by single hyphens (asset ids, uuids). */
const SEGMENT_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_ID_LENGTH = 128;
const MAX_VARIANT_LENGTH = 64;

/** A dump's file name: dot-separated words, so no empty segment, no `..`, no `/`. */
const FILE_PATTERN = /^[a-z0-9][a-z0-9_-]*(?:\.[a-z0-9_-]+)*$/;
const MAX_FILE_LENGTH = 128;

/** S3 SigV4 presigned URLs expire after at most seven days; the fake keeps the same bound. */
export const MAX_SIGNED_URL_TTL_SECONDS = 604_800;

export const ObjectKeySchema = z
  .string()
  .regex(
    new RegExp(OBJECT_KEY_PATTERN),
    "an object key is lowercase, slash-separated words, with no empty or dot segment",
  )
  .max(1024);

export const BucketSchema = z
  .string()
  .regex(
    BUCKET_PATTERN,
    "a bucket name is 3-63 lowercase letters, digits or dashes",
  );

export const Sha256Schema = z
  .string()
  .regex(/^[0-9a-f]{64}$/, "a checksum is a lowercase hex SHA-256");

export const MimeSchema = z
  .string()
  .regex(/^[a-z]+\/[a-z0-9.+-]+$/, "a mime type is type/subtype in lowercase");

/** The variant of an object: the original, a derived ladder step, or a dump file. */
export const VariantRef = z.union([
  z.literal("original"),
  z.strictObject({
    variant: z.string().max(MAX_VARIANT_LENGTH).regex(SEGMENT_PATTERN),
    format: MediaFormat,
  }),
  z.strictObject({
    file: z.string().max(MAX_FILE_LENGTH).regex(FILE_PATTERN),
  }),
]);
export type VariantRef = z.infer<typeof VariantRef>;

/** Where an object lives. */
export const ObjectLocation = z.strictObject({
  bucket: BucketSchema,
  objectKey: ObjectKeySchema,
});
export type ObjectLocation = z.infer<typeof ObjectLocation>;

/** §5.2's `StorageObject`: the facts `media_asset` and `media_variant` record about an object. */
export const StorageObject = z.strictObject({
  bucket: BucketSchema,
  objectKey: ObjectKeySchema,
  mime: MimeSchema,
  /** Never 0: both tables require `bytes > 0`, and `put` refuses an empty body. */
  bytes: z.number().int().positive(),
  checksumSha256: Sha256Schema,
});
export type StorageObject = z.infer<typeof StorageObject>;

export const PutInput = z.strictObject({
  bucket: BucketSchema,
  objectKey: ObjectKeySchema,
  body: z.custom<Uint8Array>(
    (value) => value instanceof Uint8Array && value.byteLength > 0,
    "body must be at least one byte",
  ),
  mime: MimeSchema,
  /** When given, the write is refused unless the body hashes to it (S3 `x-amz-checksum-sha256`). */
  checksumSha256: Sha256Schema.optional(),
});
export type PutInput = z.infer<typeof PutInput>;

/** The interface of spec 002 §5.2. Implementations: `InMemoryStorage` here, R2 in spec 006. */
export interface Storage {
  objectKey(kind: ObjectKind, id: string, variant: VariantRef): string;
  /** Write (or overwrite) an object and return its facts. */
  put(input: PutInput): Promise<StorageObject>;
  /** The facts of a stored object, or `null` when nothing is stored at the location. */
  head(location: ObjectLocation): Promise<StorageObject | null>;
  /** A time-limited read URL; `ttlSeconds` is a whole number in 1 … 604 800. */
  getSignedUrl(location: ObjectLocation, ttlSeconds: number): Promise<string>;
  /** Remove an object; removing an absent object succeeds, as on S3. */
  delete(location: ObjectLocation): Promise<void>;
}

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

/** A (kind, id, variant) triple outside the convention. Names the field, never the value. */
export class StorageKeyError extends Error {
  override readonly name = "StorageKeyError";
}

/** A body whose SHA-256 is not the one the caller declared. */
export class StorageIntegrityError extends Error {
  override readonly name = "StorageIntegrityError";
}

/* -------------------------------------------------------------------------- */
/* The key convention                                                         */
/* -------------------------------------------------------------------------- */

/** `YYYY-MM-DD` that names a real calendar day, split into its three path segments. */
function backupDay(id: string): readonly [string, string, string] | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(id);
  if (match === null) return undefined;
  const [, year = "", month = "", day = ""] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  const roundTrips =
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() === Number(month) - 1 &&
    date.getUTCDate() === Number(day);
  return roundTrips ? [year, month, day] : undefined;
}

/**
 * The object key of `(kind, id, variant)` — deterministic, and injective over every triple it
 * accepts. Throws `StorageKeyError` for a triple outside the convention rather than producing a
 * key that could equal a valid one.
 */
export function objectKey(
  kind: ObjectKind,
  id: string,
  variant: VariantRef,
): string {
  const parsedKind = ObjectKind.safeParse(kind);
  if (!parsedKind.success) {
    throw new StorageKeyError(
      `objectKey: \`kind\` must be one of ${objectKinds.join(", ")}`,
    );
  }
  const parsedVariant = VariantRef.safeParse(variant);
  if (!parsedVariant.success) {
    throw new StorageKeyError(
      'objectKey: `variant` must be "original", { variant, format } or { file } in the key alphabet',
    );
  }
  const ref = parsedVariant.data;

  if (parsedKind.data === "backup") {
    const day = backupDay(id);
    if (day === undefined) {
      throw new StorageKeyError(
        "objectKey: a backup's `id` must be a calendar date, YYYY-MM-DD",
      );
    }
    if (typeof ref === "string" || !("file" in ref)) {
      throw new StorageKeyError(
        "objectKey: a backup's `variant` must be { file }",
      );
    }
    return `backups/${day.join("/")}/${ref.file}`;
  }

  if (id.length > MAX_ID_LENGTH || !SEGMENT_PATTERN.test(id)) {
    throw new StorageKeyError(
      `objectKey: \`id\` must be one lowercase path segment of at most ${String(MAX_ID_LENGTH)} characters`,
    );
  }
  if (ref === "original") return `originals/${parsedKind.data}/${id}`;
  if ("file" in ref) {
    throw new StorageKeyError(
      'objectKey: `variant` { file } is for backups; media takes "original" or { variant, format }',
    );
  }
  return `media/${parsedKind.data}/${id}/${ref.variant}.${ref.format}`;
}

/* -------------------------------------------------------------------------- */
/* Shared input checks                                                        */
/* -------------------------------------------------------------------------- */

function parseLocation(location: ObjectLocation): ObjectLocation {
  return ObjectLocation.parse(location);
}

function assertTtl(ttlSeconds: number): void {
  if (
    !Number.isInteger(ttlSeconds) ||
    ttlSeconds < 1 ||
    ttlSeconds > MAX_SIGNED_URL_TTL_SECONDS
  ) {
    throw new RangeError(
      `getSignedUrl: ttlSeconds must be a whole number from 1 to ${String(MAX_SIGNED_URL_TTL_SECONDS)}`,
    );
  }
}

const sha256Hex = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

/* -------------------------------------------------------------------------- */
/* InMemoryStorage — the fake                                                 */
/* -------------------------------------------------------------------------- */

interface StoredEntry {
  readonly facts: StorageObject;
  readonly body: Uint8Array;
}

export interface InMemoryStorageOptions {
  /** The clock signed URLs are issued and checked against; defaults to the wall clock. */
  readonly now?: () => Date;
}

/** The reserved TLD (RFC 2606): a fake URL that leaks can never resolve to a real bucket. */
const FAKE_HOST_SUFFIX = ".storage.invalid";

/** `/{expires}/{signature}/{objectKey}` — the path of a URL the fake signed. */
const SIGNED_PATH = /^\/(\d{1,16})\/([0-9a-f]{64})\/(.+)$/;

/**
 * An in-process `Storage` for tests. It signs read URLs with a per-instance HMAC key and serves
 * them itself through `fetch`, answering as R2 does: 200 with the bytes, 403 for an edited or
 * expired signature, 404 for an absent object.
 */
export class InMemoryStorage implements Storage {
  readonly #objects = new Map<string, StoredEntry>();
  readonly #secret = randomBytes(32);
  readonly #now: () => Date;

  constructor(options: InMemoryStorageOptions = {}) {
    this.#now = options.now ?? (() => new Date());
  }

  objectKey(kind: ObjectKind, id: string, variant: VariantRef): string {
    return objectKey(kind, id, variant);
  }

  async put(input: PutInput): Promise<StorageObject> {
    const parsed = PutInput.parse(input);
    const body = new Uint8Array(parsed.body);
    const checksumSha256 = sha256Hex(body);
    if (
      parsed.checksumSha256 !== undefined &&
      parsed.checksumSha256 !== checksumSha256
    ) {
      throw new StorageIntegrityError(
        "put: the body does not hash to the declared checksumSha256",
      );
    }
    const facts: StorageObject = {
      bucket: parsed.bucket,
      objectKey: parsed.objectKey,
      mime: parsed.mime,
      bytes: body.byteLength,
      checksumSha256,
    };
    this.#objects.set(InMemoryStorage.#slot(parsed), { facts, body });
    return { ...facts };
  }

  async head(location: ObjectLocation): Promise<StorageObject | null> {
    const entry = this.#objects.get(
      InMemoryStorage.#slot(parseLocation(location)),
    );
    return entry === undefined ? null : { ...entry.facts };
  }

  async getSignedUrl(
    location: ObjectLocation,
    ttlSeconds: number,
  ): Promise<string> {
    const parsed = parseLocation(location);
    assertTtl(ttlSeconds);
    const expires = this.#now().getTime() + ttlSeconds * 1000;
    // Expiry and signature ride in the path, not the query: the fake has no query string at all.
    return `https://${parsed.bucket}${FAKE_HOST_SUFFIX}/${String(expires)}/${this.#sign(parsed, expires)}/${parsed.objectKey}`;
  }

  async delete(location: ObjectLocation): Promise<void> {
    this.#objects.delete(InMemoryStorage.#slot(parseLocation(location)));
  }

  /** Serve a URL this instance signed, with R2's status codes. */
  async fetch(url: string): Promise<Response> {
    const parsed = URL.canParse(url) ? new URL(url) : undefined;
    if (parsed?.hostname.endsWith(FAKE_HOST_SUFFIX) !== true) {
      return new Response(null, { status: 400 });
    }
    const path = SIGNED_PATH.exec(parsed.pathname);
    const location = ObjectLocation.safeParse({
      bucket: parsed.hostname.slice(0, -FAKE_HOST_SUFFIX.length),
      objectKey: path?.[3] ?? "",
    });
    const expires = Number(path?.[1]);
    const valid =
      location.success &&
      Number.isSafeInteger(expires) &&
      this.#verify(location.data, expires, path?.[2] ?? "") &&
      this.#now().getTime() <= expires;
    if (!valid) return new Response(null, { status: 403 });

    const entry = this.#objects.get(InMemoryStorage.#slot(location.data));
    if (entry === undefined) {
      return new Response(null, { status: 404 });
    }
    return new Response(new Uint8Array(entry.body), {
      status: 200,
      headers: { "content-type": entry.facts.mime },
    });
  }

  static #slot(location: ObjectLocation): string {
    return `${location.bucket}\u0000${location.objectKey}`;
  }

  #sign(location: ObjectLocation, expires: number): string {
    return createHmac("sha256", this.#secret)
      .update(`${location.bucket}\n${location.objectKey}\n${String(expires)}`)
      .digest("hex");
  }

  #verify(
    location: ObjectLocation,
    expires: number,
    signature: string,
  ): boolean {
    const expected = Buffer.from(this.#sign(location, expires), "hex");
    const given = Buffer.from(signature, "hex");
    return given.length === expected.length && timingSafeEqual(given, expected);
  }
}
