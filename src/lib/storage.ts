/**
 * The object-storage seam (spec 002 §2 "Jobs, storage seam, probes", §5.2, AC-22; ADR-0015;
 * TASK-017).
 *
 * Every image and private upload lives in Cloudflare R2; the database holds keys, never bytes
 * (`media_asset` / `media_variant`, migration `0004`). This module is the interface the rest of
 * the application programs against, the key convention, and an in-memory fake for tests. The S3-
 * API implementation against R2 — and with it upload, EXIF stripping and variant generation — is
 * **spec 006** (§3 non-goals, spec 006 AC-24); it implements {@link Storage} and is proven by the
 * same contract the fake satisfies, so no caller changes when it lands.
 *
 * ## The key convention
 *
 * `objectKey(kind, id, variant)` is the **only** builder of an object key:
 *
 * | kind             | key                                     |
 * |------------------|-----------------------------------------|
 * | `product`        | `product/{id}/{variant}`                |
 * | `delivery_proof` | `delivery-proof/{id}/{variant}`         |
 * | `brand`          | `brand/{id}/{variant}`                  |
 * | `partner`        | `partner/{id}/{variant}`                |
 * | `backup`         | `backups/{YYYY}/{MM}/{DD}/{variant}`    |
 *
 * - **Deterministic**: the same triple gives the same key, so a re-upload overwrites and an
 *   idempotent job can recompute the key instead of storing it twice.
 * - **Collision-free**: every kind has its own first segment, and `id` and `variant` are single
 *   segments from the alphabet `[a-z0-9][a-z0-9._-]*` (no `/`, no `..`). The key therefore parses
 *   back into exactly one triple — the property `tests/unit/storage.test.ts` asserts over a table.
 *   A `backup` id is the dump's calendar date, `YYYY-MM-DD`, expanded into the
 *   `backups/YYYY/MM/DD/` prefix spec 002 AC-25 names, so a bucket lifecycle rule can expire by
 *   prefix.
 * - **No personal data**: ids are opaque (UUIDs or spec 006's SKU-derived asset ids) and a key is
 *   on the logger's redaction list anyway (`object_key`, spec 002 §8). The keys match the
 *   `media_asset_object_key_check` alphabet in `0004`, so a key this function builds is a key the
 *   database accepts.
 *
 * ## No bytes in a log, no SDK here
 *
 * Nothing in this file logs. `CLAUDE.md`'s "no SDK calls outside adapters" is kept by
 * construction: the R2 client will live behind this interface in spec 006's adapter, and this
 * module imports nothing but zod.
 */
import { z } from "zod";

/** What an object is for — and therefore which bucket and key prefix it lives under (§5.2). */
export const ObjectKind = z.enum([
  "product",
  "delivery_proof",
  "brand",
  "partner",
  "backup",
]);
export type ObjectKind = z.infer<typeof ObjectKind>;

/** First key segment per kind. Distinct per kind, which is half of collision-freedom. */
export const OBJECT_KEY_PREFIX: Readonly<Record<ObjectKind, string>> = {
  product: "product",
  delivery_proof: "delivery-proof",
  brand: "brand",
  partner: "partner",
  backup: "backups",
};

/** One key segment: lowercase, starts alphanumeric, no `/`, and `..` refused separately. */
const SEGMENT = /^[a-z0-9][a-z0-9._-]*$/;

/** A single path segment of an object key. */
export const KeySegment = z
  .string()
  .min(1)
  .max(200)
  .regex(
    SEGMENT,
    "a key segment is lowercase [a-z0-9._-], starting alphanumeric",
  )
  .refine(
    (value) => !value.includes(".."),
    "a key segment may not contain '..'",
  );

/** A `backup` id: the dump's calendar date. */
const BackupDate = z.iso.date();

/** The object-key alphabet migration `0004` checks on `media_asset.object_key`. */
export const ObjectKey = z
  .string()
  .min(1)
  .max(1024)
  .regex(
    /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)*$/,
    "an object key is lowercase '/'-separated segments with no leading slash",
  )
  .refine(
    (value) => !value.includes(".."),
    "an object key may not contain '..'",
  );

/** A bucket name, as R2 and S3 spell them (and as `media_asset_bucket_check` does). */
export const BucketName = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/, "not a bucket name");

/** What `head` and `put` report about a stored object (§5.2 `StorageObject`). */
export const StorageObject = z
  .object({
    bucket: BucketName,
    objectKey: ObjectKey,
    mime: z.string().regex(/^[a-z]+\/[a-z0-9.+-]+$/, "not a MIME type"),
    bytes: z.number().int().nonnegative(),
    checksumSha256: z.string().regex(/^[0-9a-f]{64}$/, "not a hex SHA-256"),
  })
  .strict();
export type StorageObject = z.infer<typeof StorageObject>;

/** The input of {@link Storage.put}, parsed at the boundary like every other input. */
export const PutInput = z
  .object({
    objectKey: ObjectKey,
    mime: StorageObject.shape.mime,
    body: z.instanceof(Uint8Array),
  })
  .strict();
export type PutInput = z.infer<typeof PutInput>;

/**
 * Signed-URL lifetime in seconds: at least one second, at most seven days — the S3 SigV4 ceiling,
 * which R2 shares. A private delivery photo is shown through a URL that expires, never a public one.
 */
export const SignedUrlTtl = z.number().int().min(1).max(604_800);

/** The storage seam every caller programs against (§5.2). */
export interface Storage {
  /** The bucket this instance writes to. Public media and private backups are two instances. */
  readonly bucket: string;
  /** The one key builder; see the module header for the convention. */
  objectKey(kind: ObjectKind, id: string, variant: string): string;
  /** Stores `body` under `objectKey`, replacing any object already there. */
  put(input: PutInput): Promise<StorageObject>;
  /** The stored object's description, or `null` when there is none. Never the bytes. */
  head(objectKey: string): Promise<StorageObject | null>;
  /** A time-limited URL for reading a (private) object. */
  getSignedUrl(objectKey: string, ttlSeconds: number): Promise<string>;
  /** Removes the object. Deleting an absent key is not an error (S3 semantics). */
  delete(objectKey: string): Promise<void>;
}

/**
 * Builds the object key of `(kind, id, variant)`. Throws a `ZodError` naming the offending part
 * when a part is outside the alphabet — a key that cannot be built is a bug at the call site, not
 * something to repair silently.
 */
export function objectKey(
  kind: ObjectKind,
  id: string,
  variant: string,
): string {
  const parsedKind = ObjectKind.parse(kind);
  const parsedVariant = KeySegment.parse(variant);
  if (parsedKind === "backup") {
    const [year, month, day] = BackupDate.parse(id).split("-");
    return `${OBJECT_KEY_PREFIX.backup}/${year}/${month}/${day}/${parsedVariant}`;
  }
  return `${OBJECT_KEY_PREFIX[parsedKind]}/${KeySegment.parse(id)}/${parsedVariant}`;
}

/**
 * The inverse of {@link objectKey}: the triple a key was built from, or `null` for a key this
 * convention cannot have produced. Exists so collision-freedom is a checkable property rather
 * than an argument (T-22).
 */
export function parseObjectKey(
  key: string,
): { kind: ObjectKind; id: string; variant: string } | null {
  if (!ObjectKey.safeParse(key).success) return null;
  const segments = key.split("/");
  const prefix = segments[0];
  if (prefix === OBJECT_KEY_PREFIX.backup) {
    if (segments.length !== 5) return null;
    const [, year, month, day, variant] = segments;
    const id = `${year}-${month}-${day}`;
    if (!BackupDate.safeParse(id).success || variant === undefined) return null;
    return { kind: "backup", id, variant };
  }
  if (segments.length !== 3) return null;
  const kind = ObjectKind.options.find(
    (candidate) =>
      candidate !== "backup" && OBJECT_KEY_PREFIX[candidate] === prefix,
  );
  const [, id, variant] = segments;
  if (kind === undefined || id === undefined || variant === undefined)
    return null;
  return { kind, id, variant };
}

/** Lower-case hex SHA-256 of `body`, through Web Crypto so the fake runs on node and edge alike. */
export async function sha256Hex(body: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(body));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Runs `fn` and settles a promise with its result or its error. */
function settle<T>(fn: () => T): Promise<T> {
  try {
    return Promise.resolve(fn());
  } catch (error) {
    return Promise.reject(
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}

/**
 * The in-memory fake (§5.2): the contract every implementation must satisfy, with no network and
 * no credentials. `now` is injectable so a test can drive signed-URL expiry without a timer.
 */
export class InMemoryStorage implements Storage {
  readonly bucket: string;
  readonly #objects = new Map<
    string,
    { object: StorageObject; body: Uint8Array }
  >();
  readonly #now: () => number;

  constructor(bucket: string, options: { now?: () => number } = {}) {
    this.bucket = BucketName.parse(bucket);
    this.#now = options.now ?? Date.now;
  }

  objectKey(kind: ObjectKind, id: string, variant: string): string {
    return objectKey(kind, id, variant);
  }

  async put(input: PutInput): Promise<StorageObject> {
    const { objectKey: key, mime, body } = PutInput.parse(input);
    const copy = new Uint8Array(body);
    const object = StorageObject.parse({
      bucket: this.bucket,
      objectKey: key,
      mime,
      bytes: copy.byteLength,
      checksumSha256: await sha256Hex(copy),
    });
    this.#objects.set(key, { object, body: copy });
    return object;
  }

  // The three methods below parse inside a promise so that a bad key is a *rejection*, as it is
  // from a network-backed implementation, and never a synchronous throw at the call site.

  head(key: string): Promise<StorageObject | null> {
    return settle(
      () => this.#objects.get(ObjectKey.parse(key))?.object ?? null,
    );
  }

  getSignedUrl(key: string, ttlSeconds: number): Promise<string> {
    return settle(() => {
      const parsed = ObjectKey.parse(key);
      const ttl = SignedUrlTtl.parse(ttlSeconds);
      if (!this.#objects.has(parsed))
        throw new Error("no object under that key");
      const expires = Math.floor(this.#now() / 1000) + ttl;
      return `memory://${this.bucket}/${parsed}?expires=${String(expires)}`;
    });
  }

  delete(key: string): Promise<void> {
    return settle(() => {
      this.#objects.delete(ObjectKey.parse(key));
    });
  }

  /** Test-only read-back of the stored bytes: the fake's equivalent of a GET. */
  read(key: string): Uint8Array | null {
    const stored = this.#objects.get(ObjectKey.parse(key));
    return stored === undefined ? null : new Uint8Array(stored.body);
  }
}
