/**
 * `R2Storage` — the S3-API implementation of `Storage` over Cloudflare R2 (spec 006 §2.6, AC-24;
 * spec 002 §5.2; ADR-0015; TASK-082).
 *
 * It passes the same contract suite as `InMemoryStorage` (`tests/contract/support/
 * storage-contract.ts`): put → head → signed URL → delete, the 403 on an edited or expired URL, the
 * 404 after a delete. The signing is plain AWS Signature Version 4 over `fetch` (region `auto`,
 * path-style, what R2 expects), checked against AWS's own published examples in
 * `tests/contract/storage-r2.test.ts`, rather than `@aws-sdk/client-s3`: the same reasoning as
 * `scripts/media-upload.ts` (a twenty-megabyte dependency tree for four requests).
 *
 * ## What this adds to the interface's promises: placement (never expose a private object)
 *
 * The public bucket is served whole by the custom domain `https://media.flowersoverseas.com`
 * (`MEDIA_ORIGIN`), so **any** key written there is readable by anyone who can guess it. A prefix
 * cannot make part of a public bucket private. So every bucket this class may touch is declared
 * `public` or `private` up front, an undeclared bucket is refused for every operation, and a write
 * to a public bucket must be all of:
 *
 *  - a **derived variant of a public kind**: the key is `media/product/…` or `media/brand/…`
 *    (`objectKey()`'s variant shape). An original (`originals/…`, which still carries whatever
 *    metadata its source wrote), a dump (`backups/…`), and anything of kind `delivery_proof` or
 *    `partner` are private by rule and are refused, whatever the caller meant;
 *  - an **image of an allowed type**: `image/avif`, `image/webp`, `image/jpeg` or `image/png`, and
 *    the body's magic bytes must be that type. The public host is first-party, so an object stored
 *    as `text/html` or `image/svg+xml` there would be script on our own origin;
 *  - at most `MAX_PUBLIC_OBJECT_BYTES`.
 *
 * Reads of a private object happen only through `getSignedUrl`, whose URL is on the S3 endpoint
 * (never the public host) and expires within `MAX_SIGNED_URL_TTL_SECONDS`.
 *
 * ## Integrity and idempotence
 *
 * `put` hashes the body; a declared `checksumSha256` that differs is refused before any request.
 * The digest is the request's signed `x-amz-content-sha256` (so the store refuses bytes that are
 * not the ones signed) and is stored as `x-amz-meta-sha256`, which is where `head` reads the
 * checksum back from — the same metadata `pnpm media:upload` writes. A second `put` of the same
 * bytes at the same key leaves the same object; callers that must not rewrite (the derive worker)
 * `head` first and skip when the stored digest already matches.
 *
 * ## Logging and errors
 *
 * This module never logs. A thrown error names the operation and the HTTP status only — never the
 * key, the bucket, a URL, a credential or the store's response body (which echoes the key) — so
 * an error that reaches a log line carries nothing an object key could leak (spec 002 §8).
 */
import { createHash, createHmac } from "node:crypto";

import { z } from "zod";

import { MEDIA_CACHE_CONTROL } from "./media-headers.ts";
import {
  BucketSchema,
  type ObjectLocation,
  PutInput,
  StorageIntegrityError,
  StorageObject,
  assertTtl,
  objectKey,
  parseLocation,
  type ObjectKind,
  type Storage,
  type VariantRef,
} from "./storage.ts";

/* -------------------------------------------------------------------------- */
/* AWS Signature Version 4                                                    */
/* -------------------------------------------------------------------------- */

export const SIGV4_ALGORITHM = "AWS4-HMAC-SHA256";
/** The region R2 signs with. */
export const R2_REGION = "auto";
const SERVICE = "s3";
/** The payload hash a presigned GET signs. */
export const UNSIGNED_PAYLOAD = "UNSIGNED-PAYLOAD";

export interface SigV4Credentials {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
}

const sha256Hex = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");

const hmac = (key: Buffer | string, value: string): Buffer =>
  createHmac("sha256", key).update(value, "utf8").digest();

/** `20130524T000000Z` and `20130524`, the two date forms SigV4 uses. */
export function amzDates(now: Date): {
  readonly amzDate: string;
  readonly dateStamp: string;
} {
  const amzDate = `${now.toISOString().replace(/[-:]/gu, "").slice(0, 15)}Z`;
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

/**
 * AWS `UriEncode`: every byte but the unreserved `A-Z a-z 0-9 - . _ ~` percent-encoded in upper
 * case. `encodeURIComponent` leaves `! ' ( ) *` alone, so those five are encoded by hand.
 */
export function uriEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/gu,
    (character) => RESERVED_BY_HAND[character] ?? character,
  );
}

/** The five characters `encodeURIComponent` leaves alone and SigV4 encodes. */
const RESERVED_BY_HAND: Readonly<Record<string, string>> = {
  "!": "%21",
  "'": "%27",
  "(": "%28",
  ")": "%29",
  "*": "%2A",
};

/** A path encoded segment by segment: `/` separates and is kept, everything else is encoded. */
export function canonicalPath(path: string): string {
  return path.split("/").map(uriEncode).join("/");
}

/** The query string sorted by encoded name, then value, each pair encoded (SigV4 step 1). */
export function canonicalQuery(
  query: Readonly<Record<string, string>>,
): string {
  return Object.entries(query)
    .map(([name, value]) => [uriEncode(name), uriEncode(value)] as const)
    .sort(([leftName, leftValue], [rightName, rightValue]) =>
      leftName === rightName
        ? leftValue < rightValue
          ? -1
          : 1
        : leftName < rightName
          ? -1
          : 1,
    )
    .map(([name, value]) => `${name}=${value}`)
    .join("&");
}

/** The derived signing key: `HMAC(HMAC(HMAC(HMAC("AWS4"+secret, date), region), service), "aws4_request")`. */
function signingKey(secret: string, dateStamp: string, region: string): Buffer {
  return hmac(
    hmac(hmac(hmac(`AWS4${secret}`, dateStamp), region), SERVICE),
    "aws4_request",
  );
}

interface CanonicalInput {
  readonly method: string;
  /** Already canonical (encoded) path. */
  readonly path: string;
  readonly query: string;
  /** Lower-case names → values; every one of them is signed. */
  readonly headers: Readonly<Record<string, string>>;
  readonly payloadSha256: string;
}

function canonicalRequest(input: CanonicalInput): {
  readonly canonical: string;
  readonly signedHeaders: string;
} {
  const names = Object.keys(input.headers).sort();
  const canonicalHeaders = names
    .map(
      (name) =>
        `${name}:${(input.headers[name] ?? "").trim().replace(/\s+/gu, " ")}\n`,
    )
    .join("");
  const signedHeaders = names.join(";");
  return {
    canonical: [
      input.method,
      input.path,
      input.query,
      canonicalHeaders,
      signedHeaders,
      input.payloadSha256,
    ].join("\n"),
    signedHeaders,
  };
}

function signCanonical(options: {
  readonly canonical: string;
  readonly credentials: SigV4Credentials;
  readonly region: string;
  readonly now: Date;
}): { readonly signature: string; readonly scope: string } {
  const { amzDate, dateStamp } = amzDates(options.now);
  const scope = `${dateStamp}/${options.region}/${SERVICE}/aws4_request`;
  const stringToSign = [
    SIGV4_ALGORITHM,
    amzDate,
    scope,
    sha256Hex(options.canonical),
  ].join("\n");
  const signature = hmac(
    signingKey(options.credentials.secretAccessKey, dateStamp, options.region),
    stringToSign,
  ).toString("hex");
  return { signature, scope };
}

/**
 * Sign a request with an `Authorization` header. `path` is the raw (unencoded) path; the
 * returned `path` is the encoded one the request must be sent to, so the bytes signed are the
 * bytes sent. `headers` are signed as given, plus `host`, `x-amz-date` and `x-amz-content-sha256`.
 */
export function signHeaders(options: {
  readonly method: string;
  readonly host: string;
  readonly path: string;
  readonly query?: Readonly<Record<string, string>>;
  readonly headers?: Readonly<Record<string, string>>;
  readonly payloadSha256: string;
  readonly credentials: SigV4Credentials;
  readonly region: string;
  readonly now: Date;
}): {
  readonly path: string;
  readonly query: string;
  readonly headers: Readonly<Record<string, string>>;
} {
  const { amzDate } = amzDates(options.now);
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(options.headers ?? {})) {
    headers[name.toLowerCase()] = value;
  }
  headers["host"] = options.host;
  headers["x-amz-date"] = amzDate;
  headers["x-amz-content-sha256"] = options.payloadSha256;

  const path = canonicalPath(options.path);
  const query = canonicalQuery(options.query ?? {});
  const { canonical, signedHeaders } = canonicalRequest({
    method: options.method,
    path,
    query,
    headers,
    payloadSha256: options.payloadSha256,
  });
  const { signature, scope } = signCanonical({
    canonical,
    credentials: options.credentials,
    region: options.region,
    now: options.now,
  });
  headers["authorization"] =
    `${SIGV4_ALGORITHM} Credential=${options.credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { path, query, headers };
}

/**
 * A presigned GET URL (query-string authentication): only `host` is signed and the payload is
 * `UNSIGNED-PAYLOAD`, so the URL alone is the credential, valid for `expiresSeconds` from `now`.
 */
export function presignGet(options: {
  readonly origin: string;
  readonly host: string;
  readonly path: string;
  readonly credentials: SigV4Credentials;
  readonly region: string;
  readonly now: Date;
  readonly expiresSeconds: number;
}): string {
  const { amzDate, dateStamp } = amzDates(options.now);
  const scope = `${dateStamp}/${options.region}/${SERVICE}/aws4_request`;
  const params: Record<string, string> = {
    "X-Amz-Algorithm": SIGV4_ALGORITHM,
    "X-Amz-Credential": `${options.credentials.accessKeyId}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(options.expiresSeconds),
    "X-Amz-SignedHeaders": "host",
  };
  const path = canonicalPath(options.path);
  const query = canonicalQuery(params);
  const { canonical } = canonicalRequest({
    method: "GET",
    path,
    query,
    headers: { host: options.host },
    payloadSha256: UNSIGNED_PAYLOAD,
  });
  const { signature } = signCanonical({
    canonical,
    credentials: options.credentials,
    region: options.region,
    now: options.now,
  });
  return `${options.origin}${path}?${query}&X-Amz-Signature=${signature}`;
}

/* -------------------------------------------------------------------------- */
/* Placement: which bytes may go where                                        */
/* -------------------------------------------------------------------------- */

export type BucketAccess = "public" | "private";

/** The kinds whose derived variants may be published (spec 002 §5.1 `media_asset.kind`). */
export const PUBLIC_OBJECT_KINDS = ["product", "brand"] as const;

/** The only content types a public bucket stores: images a browser renders and never runs. */
export const PUBLIC_MIME_TYPES = [
  "image/avif",
  "image/webp",
  "image/jpeg",
  "image/png",
] as const;

/** A public object's ceiling: a derived variant is tens of kilobytes; twenty megabytes is a bug. */
export const MAX_PUBLIC_OBJECT_BYTES = 20 * 1024 * 1024;

/** A private object's ceiling: the single-request `PUT` limit of S3 and R2 (5 GiB). */
export const MAX_PRIVATE_OBJECT_BYTES = 5 * 1024 * 1024 * 1024;

/** The key prefix a public write must carry: `media/{product|brand}/…`. */
const PUBLIC_KEY = /^media\/(?:product|brand)\//u;

/** A write or a read the bucket declarations do not allow. Names the rule, never the key. */
export class StoragePlacementError extends Error {
  override readonly name = "StoragePlacementError";
}

/** The store answered with a status the operation does not accept, or not at all. */
export class StorageRequestError extends Error {
  override readonly name = "StorageRequestError";
  readonly operation: "put" | "head" | "delete";
  /** The HTTP status, or `0` for a network failure or a timeout. */
  readonly status: number;

  constructor(operation: "put" | "head" | "delete", status: number) {
    super(
      status === 0
        ? `R2 ${operation}: no response (network failure or timeout)`
        : `R2 ${operation}: unexpected status ${String(status)}`,
    );
    this.operation = operation;
    this.status = status;
  }
}

/** The image type the bytes are, by magic number, or `undefined` for anything else. */
export function sniffImageMime(body: Uint8Array): string | undefined {
  const ascii = (from: number, to: number): string =>
    String.fromCharCode(...body.subarray(from, to));
  if (
    body.length >= 3 &&
    body[0] === 0xff &&
    body[1] === 0xd8 &&
    body[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    body.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (byte, index) => body[index] === byte,
    )
  ) {
    return "image/png";
  }
  if (body.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") {
    return "image/webp";
  }
  if (body.length >= 16 && ascii(4, 8) === "ftyp") {
    // ISO-BMFF: the major brand at 8, compatible brands from 16 to the end of the `ftyp` box.
    const boxEnd = Math.min(
      body.length,
      ((body[0] ?? 0) << 24) |
        ((body[1] ?? 0) << 16) |
        ((body[2] ?? 0) << 8) |
        (body[3] ?? 0),
    );
    const brands = [ascii(8, 12)];
    for (let offset = 16; offset + 4 <= boxEnd; offset += 4) {
      brands.push(ascii(offset, offset + 4));
    }
    if (brands.some((brand) => brand === "avif" || brand === "avis")) {
      return "image/avif";
    }
  }
  return undefined;
}

/**
 * Refuse a write the bucket's access does not allow (see the header). Pure, so the rules are
 * testable one by one without a store.
 */
export function assertPlacement(access: BucketAccess, input: PutInput): void {
  const bytes = input.body.byteLength;
  if (access === "private") {
    if (bytes > MAX_PRIVATE_OBJECT_BYTES) {
      throw new StoragePlacementError(
        `put: a private object is at most ${String(MAX_PRIVATE_OBJECT_BYTES)} bytes`,
      );
    }
    return;
  }
  if (!PUBLIC_KEY.test(input.objectKey)) {
    throw new StoragePlacementError(
      "put: a public bucket takes only derived variants of a public kind (media/product/… or media/brand/…); originals, dumps, delivery photographs and partner files are private",
    );
  }
  if (!(PUBLIC_MIME_TYPES as readonly string[]).includes(input.mime)) {
    throw new StoragePlacementError(
      `put: a public object's type must be one of ${PUBLIC_MIME_TYPES.join(", ")}`,
    );
  }
  if (sniffImageMime(input.body) !== input.mime) {
    throw new StoragePlacementError(
      "put: the body is not the image type it is declared as",
    );
  }
  if (bytes > MAX_PUBLIC_OBJECT_BYTES) {
    throw new StoragePlacementError(
      `put: a public object is at most ${String(MAX_PUBLIC_OBJECT_BYTES)} bytes`,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Configuration                                                              */
/* -------------------------------------------------------------------------- */

const SecretSchema = z
  .string()
  .regex(/^\S+$/u, "must be non-empty with no whitespace");

/** An `https:` origin with nothing after the host: the account's S3 endpoint. */
const EndpointSchema = z.string().refine((value) => {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return (
    url.protocol === "https:" &&
    url.username === "" &&
    url.password === "" &&
    (url.pathname === "/" || url.pathname === "") &&
    url.search === "" &&
    url.hash === ""
  );
}, "must be an https origin with no path, query or credentials");

export const R2StorageConfigSchema = z
  .strictObject({
    endpoint: EndpointSchema,
    accessKeyId: SecretSchema,
    secretAccessKey: SecretSchema,
    publicBuckets: z.array(BucketSchema),
    privateBuckets: z.array(BucketSchema),
  })
  .refine(
    (config) => config.publicBuckets.length + config.privateBuckets.length > 0,
    "declare at least one bucket",
  )
  .refine(
    (config) =>
      !config.publicBuckets.some((bucket) =>
        config.privateBuckets.includes(bucket),
      ),
    "a bucket is public or private, never both",
  );
export type R2StorageConfig = z.infer<typeof R2StorageConfigSchema>;

type Fetch = (input: string, init: RequestInit) => Promise<Response>;

export interface R2StorageOptions extends R2StorageConfig {
  /** Injected in tests (the fake S3 server); defaults to the global `fetch` at call time. */
  readonly fetch?: Fetch;
  /** The signing clock; defaults to the wall clock. */
  readonly now?: () => Date;
  /** One request's budget before it counts as failed. */
  readonly timeoutMs?: number;
}

/** One request's budget: generous for a 15 MB original on a slow uplink, finite for a hang. */
export const R2_REQUEST_TIMEOUT_MS = 60_000;

/** The private cache rule: a signed read is never stored by a shared cache. */
const PRIVATE_CACHE_CONTROL = "private, no-store";

/* -------------------------------------------------------------------------- */
/* R2Storage                                                                  */
/* -------------------------------------------------------------------------- */

export class R2Storage implements Storage {
  readonly #origin: string;
  readonly #host: string;
  readonly #credentials: SigV4Credentials;
  readonly #access: ReadonlyMap<string, BucketAccess>;
  readonly #fetch: Fetch | undefined;
  readonly #now: () => Date;
  readonly #timeoutMs: number;

  constructor(options: R2StorageOptions) {
    const parsed = R2StorageConfigSchema.safeParse({
      endpoint: options.endpoint,
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
      publicBuckets: options.publicBuckets,
      privateBuckets: options.privateBuckets,
    });
    if (!parsed.success) {
      // Field names only: a credential must never reach a message.
      const fields = [
        ...new Set(
          parsed.error.issues.map(
            (issue) => issue.path.map(String).join(".") || "(config)",
          ),
        ),
      ].sort();
      throw new StoragePlacementError(
        `R2Storage: invalid configuration (${fields.join(", ")})`,
      );
    }
    const url = new URL(parsed.data.endpoint);
    this.#origin = url.origin;
    this.#host = url.host;
    this.#credentials = {
      accessKeyId: parsed.data.accessKeyId,
      secretAccessKey: parsed.data.secretAccessKey,
    };
    this.#access = new Map<string, BucketAccess>([
      ...parsed.data.publicBuckets.map((bucket) => [bucket, "public"] as const),
      ...parsed.data.privateBuckets.map(
        (bucket) => [bucket, "private"] as const,
      ),
    ]);
    this.#fetch = options.fetch;
    this.#now = options.now ?? (() => new Date());
    this.#timeoutMs = options.timeoutMs ?? R2_REQUEST_TIMEOUT_MS;
  }

  /** `public`, `private`, or `undefined` for a bucket this instance was not given. */
  accessOf(bucket: string): BucketAccess | undefined {
    return this.#access.get(bucket);
  }

  objectKey(kind: ObjectKind, id: string, variant: VariantRef): string {
    return objectKey(kind, id, variant);
  }

  async put(input: PutInput): Promise<StorageObject> {
    const parsed = PutInput.parse(input);
    const access = this.#declared(parsed.bucket);
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
    assertPlacement(access, { ...parsed, body });

    const response = await this.#send("put", "PUT", parsed, {
      headers: {
        "content-type": parsed.mime,
        "cache-control":
          access === "public" ? MEDIA_CACHE_CONTROL : PRIVATE_CACHE_CONTROL,
        "x-amz-meta-sha256": checksumSha256,
      },
      payloadSha256: checksumSha256,
      body,
    });
    if (response.status !== 200) {
      throw new StorageRequestError("put", response.status);
    }
    return {
      bucket: parsed.bucket,
      objectKey: parsed.objectKey,
      mime: parsed.mime,
      bytes: body.byteLength,
      checksumSha256,
    };
  }

  async head(location: ObjectLocation): Promise<StorageObject | null> {
    const parsed = parseLocation(location);
    this.#declared(parsed.bucket);
    const response = await this.#send("head", "HEAD", parsed, {
      payloadSha256: sha256Hex(""),
    });
    if (response.status === 404) return null;
    if (response.status !== 200) {
      throw new StorageRequestError("head", response.status);
    }
    const facts = StorageObject.safeParse({
      bucket: parsed.bucket,
      objectKey: parsed.objectKey,
      mime: (response.headers.get("content-type") ?? "").split(";")[0]?.trim(),
      bytes: Number(response.headers.get("content-length")),
      checksumSha256: response.headers.get("x-amz-meta-sha256") ?? "",
    });
    if (!facts.success) {
      throw new StorageIntegrityError(
        "head: the stored object has no valid recorded SHA-256, size or type (it was not written through Storage.put)",
      );
    }
    return facts.data;
  }

  async getSignedUrl(
    location: ObjectLocation,
    ttlSeconds: number,
  ): Promise<string> {
    const parsed = parseLocation(location);
    assertTtl(ttlSeconds);
    this.#declared(parsed.bucket);
    return presignGet({
      origin: this.#origin,
      host: this.#host,
      path: `/${parsed.bucket}/${parsed.objectKey}`,
      credentials: this.#credentials,
      region: R2_REGION,
      now: this.#now(),
      expiresSeconds: ttlSeconds,
    });
  }

  async delete(location: ObjectLocation): Promise<void> {
    const parsed = parseLocation(location);
    this.#declared(parsed.bucket);
    const response = await this.#send("delete", "DELETE", parsed, {
      payloadSha256: sha256Hex(""),
    });
    // 204 is S3's answer, 200 some stores'; 404 is "already absent", which `delete` promises is
    // a success. Anything else — a 403 above all — is not a deletion and must not look like one.
    if (![200, 204, 404].includes(response.status)) {
      throw new StorageRequestError("delete", response.status);
    }
  }

  /** The bucket's declared access; an undeclared bucket is refused for every operation. */
  #declared(bucket: string): BucketAccess {
    const access = this.#access.get(bucket);
    if (access === undefined) {
      throw new StoragePlacementError(
        "R2Storage: the bucket is not one this instance was configured with",
      );
    }
    return access;
  }

  async #send(
    operation: "put" | "head" | "delete",
    method: "PUT" | "HEAD" | "DELETE",
    location: ObjectLocation,
    request: {
      readonly headers?: Readonly<Record<string, string>>;
      readonly payloadSha256: string;
      readonly body?: Uint8Array;
    },
  ): Promise<Response> {
    const signed = signHeaders({
      method,
      host: this.#host,
      path: `/${location.bucket}/${location.objectKey}`,
      ...(request.headers === undefined ? {} : { headers: request.headers }),
      payloadSha256: request.payloadSha256,
      credentials: this.#credentials,
      region: R2_REGION,
      now: this.#now(),
    });
    // `host` is set by `fetch` itself from the URL; sending it explicitly is refused by undici.
    const headers = Object.fromEntries(
      Object.entries(signed.headers).filter(([name]) => name !== "host"),
    );
    const fetcher = this.#fetch ?? globalThis.fetch;
    try {
      return await fetcher(`${this.#origin}${signed.path}`, {
        method,
        headers,
        ...(request.body === undefined
          ? {}
          : { body: request.body as BodyInit }),
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
    } catch {
      // The cause is dropped on purpose: undici's message can carry the URL, and the URL the key.
      throw new StorageRequestError(operation, 0);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* From the environment                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The private media bucket (EU jurisdiction, no public access, no lifecycle rule): originals and
 * every private kind's objects. **Absent means off**, like `CLOUDFLARE_API_TOKEN`: it is not one of
 * the contract's keys, because no environment may be made to require it before the founder
 * creates the bucket; with it unset, a write that needs a private bucket is refused, never
 * redirected to the public one.
 */
export const R2_PRIVATE_BUCKET_KEY = "R2_PRIVATE_BUCKET";

type EnvSource = Readonly<Record<string, string | undefined>>;

/** What `createR2Storage` builds, and which bucket plays which role. */
export interface R2Environment {
  readonly config: R2StorageConfig;
  /** `R2_BUCKET`: served whole at `MEDIA_ORIGIN`. */
  readonly publicBucket: string;
  /** `R2_PRIVATE_BUCKET`, when set. */
  readonly privateBucket: string | undefined;
  /** `R2_BACKUPS_BUCKET`: private, 30-day lifecycle — dumps only, never media. */
  readonly backupsBucket: string;
}

/**
 * Read the R2 half of the environment. Errors name **keys**, never values (spec 001 §5).
 * `R2_BUCKET` is the public bucket; `R2_BACKUPS_BUCKET` and `R2_PRIVATE_BUCKET` are private.
 */
export function r2EnvironmentFrom(source: EnvSource): R2Environment {
  const schema = z.object({
    R2_S3_ENDPOINT: EndpointSchema,
    R2_ACCESS_KEY_ID: SecretSchema,
    R2_SECRET_ACCESS_KEY: SecretSchema,
    R2_BUCKET: BucketSchema,
    R2_BACKUPS_BUCKET: BucketSchema,
    [R2_PRIVATE_BUCKET_KEY]: z.preprocess(
      (value) =>
        typeof value === "string" && value.trim() === "" ? undefined : value,
      BucketSchema.optional(),
    ),
  });
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const keys = [
      ...new Set(parsed.error.issues.map((issue) => issue.path.join("."))),
    ].sort();
    throw new StoragePlacementError(
      `R2 configuration is missing or malformed: ${keys.join(", ")} (values are never printed)`,
    );
  }
  const env = parsed.data;
  const privateBucket = env[R2_PRIVATE_BUCKET_KEY];
  const config = R2StorageConfigSchema.parse({
    endpoint: env.R2_S3_ENDPOINT,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    publicBuckets: [env.R2_BUCKET],
    privateBuckets: [
      env.R2_BACKUPS_BUCKET,
      ...(privateBucket === undefined ? [] : [privateBucket]),
    ],
  });
  return {
    config,
    publicBucket: env.R2_BUCKET,
    privateBucket,
    backupsBucket: env.R2_BACKUPS_BUCKET,
  };
}
