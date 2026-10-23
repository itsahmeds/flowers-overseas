/**
 * An in-process S3 endpoint for `R2Storage`'s contract run (spec 006 T-24; TASK-082).
 *
 * The contract suite asks for "identical observable results" against `InMemoryStorage` and a real
 * bucket. No real bucket and no real credential is used by any test (work order, 2026-10-22), so
 * this fake stands where R2 stands, and it is deliberately **strict** where R2 is strict, because a
 * permissive fake would let a signing bug pass:
 *
 *  - every request is authenticated with AWS Signature Version 4, header or query form, and the
 *    signature is **recomputed here from the request as received** by code written separately from
 *    `src/lib/storage-r2.ts` (its own encoder, its own canonical request), so a request the store
 *    would refuse is refused here too: an edited path, an edited expiry, a wrong key, a wrong
 *    region, an `x-amz-*` header left out of `SignedHeaders`;
 *  - a presigned URL is valid from its `X-Amz-Date` until `X-Amz-Date + X-Amz-Expires`, on the
 *    fake's own clock (the test's), and `X-Amz-Expires` above seven days is refused, as on S3;
 *  - a header-signed request must be within fifteen minutes of the clock;
 *  - a `PUT` body must hash to the signed `x-amz-content-sha256` (S3's `XAmzContentSHA256Mismatch`);
 *  - an unknown bucket is 404, an absent key is 404, a delete of an absent key is 204.
 *
 * `requests` records what reached the store (method, path, the headers), so a test can assert
 * that a refused write sent nothing at all.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export interface FakeS3Options {
  readonly host: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly region?: string;
  readonly buckets: readonly string[];
  readonly now: () => Date;
}

interface StoredObject {
  readonly body: Uint8Array;
  readonly headers: Readonly<Record<string, string>>;
}

export interface RecordedRequest {
  readonly method: string;
  readonly path: string;
  readonly headers: Readonly<Record<string, string>>;
}

const MAX_PRESIGN_SECONDS = 604_800;
const MAX_SKEW_MS = 15 * 60 * 1000;

const hex = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");

const mac = (key: Buffer | string, value: string): Buffer =>
  createHmac("sha256", key).update(value, "utf8").digest();

/** RFC 3986 unreserved characters stay; every other UTF-8 byte becomes `%XX`. */
function awsEncode(value: string): string {
  let out = "";
  for (const byte of Buffer.from(value, "utf8")) {
    const character = String.fromCharCode(byte);
    out += /[A-Za-z0-9\-._~]/u.test(character)
      ? character
      : `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
  }
  return out;
}

/** `20130524T000000Z` → epoch milliseconds, or NaN. */
function parseAmzDate(value: string): number {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/u.exec(value);
  if (match === null) return Number.NaN;
  const [, y, mo, d, h, mi, s] = match.map(Number) as number[];
  return Date.UTC(y ?? 0, (mo ?? 1) - 1, d ?? 0, h ?? 0, mi ?? 0, s ?? 0);
}

function bodyBytes(body: RequestInit["body"]): Uint8Array {
  if (body === undefined || body === null) return new Uint8Array(0);
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (typeof body === "string") return new TextEncoder().encode(body);
  throw new Error("fake S3: unsupported body type");
}

function lowerHeaders(init: RequestInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  new Headers(init?.headers).forEach((value, name) => {
    out[name.toLowerCase()] = value;
  });
  return out;
}

export class FakeS3 {
  readonly requests: RecordedRequest[] = [];
  readonly #options: FakeS3Options;
  readonly #region: string;
  readonly #buckets = new Map<string, Map<string, StoredObject>>();

  constructor(options: FakeS3Options) {
    this.#options = options;
    this.#region = options.region ?? "auto";
    for (const bucket of options.buckets) this.#buckets.set(bucket, new Map());
  }

  /** The `fetch` this endpoint answers; pass it to `R2Storage` and to the contract harness. */
  readonly fetch = async (
    input: string,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = new URL(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = lowerHeaders(init);
    this.requests.push({ method, path: url.pathname, headers });
    if (url.host !== this.#options.host)
      return new Response(null, { status: 400 });

    const body = bodyBytes(init?.body);
    const authorised = url.searchParams.has("X-Amz-Signature")
      ? this.#verifyPresigned(method, url)
      : this.#verifyHeaders(method, url, headers, body);
    if (!authorised) return new Response(null, { status: 403 });

    const segments = url.pathname.slice(1).split("/");
    const bucketName = decodeURIComponent(segments[0] ?? "");
    const key = segments.slice(1).map(decodeURIComponent).join("/");
    const bucket = this.#buckets.get(bucketName);
    if (bucket === undefined || key === "") {
      return new Response(null, { status: 404 });
    }

    switch (method) {
      case "PUT": {
        const kept: Record<string, string> = {};
        for (const [name, value] of Object.entries(headers)) {
          if (
            name === "content-type" ||
            name === "cache-control" ||
            name.startsWith("x-amz-meta-")
          ) {
            kept[name] = value;
          }
        }
        bucket.set(key, { body: new Uint8Array(body), headers: kept });
        return new Response(null, {
          status: 200,
          headers: { etag: `"${hex(body).slice(0, 32)}"` },
        });
      }
      case "HEAD":
      case "GET": {
        const object = bucket.get(key);
        if (object === undefined) return new Response(null, { status: 404 });
        const responseHeaders = new Headers(object.headers);
        responseHeaders.set("content-length", String(object.body.byteLength));
        return new Response(
          method === "HEAD" ? null : new Uint8Array(object.body),
          { status: 200, headers: responseHeaders },
        );
      }
      case "DELETE":
        bucket.delete(key);
        return new Response(null, { status: 204 });
      default:
        return new Response(null, { status: 405 });
    }
  };

  /** The stored object, for assertions a caller of `Storage` cannot make. */
  stored(bucket: string, key: string): StoredObject | undefined {
    return this.#buckets.get(bucket)?.get(key);
  }

  /** Every key in a bucket, sorted. */
  keys(bucket: string): string[] {
    return [...(this.#buckets.get(bucket)?.keys() ?? [])].sort();
  }

  /** Put bytes behind `Storage`'s back (another writer), with whatever headers the test needs. */
  seed(
    bucket: string,
    key: string,
    body: Uint8Array,
    headers: Readonly<Record<string, string>>,
  ): void {
    this.#buckets.get(bucket)?.set(key, { body, headers });
  }

  #signature(dateStamp: string, stringToSign: string): Buffer {
    const key = mac(
      mac(
        mac(
          mac(`AWS4${this.#options.secretAccessKey}`, dateStamp),
          this.#region,
        ),
        "s3",
      ),
      "aws4_request",
    );
    return mac(key, stringToSign);
  }

  #canonical(
    method: string,
    url: URL,
    excludeQuery: string | undefined,
    signedHeaders: readonly string[],
    headerValue: (name: string) => string | undefined,
    payload: string,
  ): string | undefined {
    const query = [...url.searchParams.entries()]
      .filter(([name]) => name !== excludeQuery)
      .map(([name, value]) => `${awsEncode(name)}=${awsEncode(value)}`)
      .sort()
      .join("&");
    const lines: string[] = [];
    for (const name of signedHeaders) {
      const value = headerValue(name);
      if (value === undefined) return undefined;
      lines.push(`${name}:${value.trim().replace(/\s+/gu, " ")}\n`);
    }
    // The path as received: S3 signs the encoded path the client sent.
    return [
      method,
      url.pathname,
      query,
      lines.join(""),
      signedHeaders.join(";"),
      payload,
    ].join("\n");
  }

  #credentialOk(credential: string, amzDate: string): boolean {
    const [accessKey, dateStamp, region, service, terminal] =
      credential.split("/");
    return (
      accessKey === this.#options.accessKeyId &&
      dateStamp === amzDate.slice(0, 8) &&
      region === this.#region &&
      service === "s3" &&
      terminal === "aws4_request"
    );
  }

  #matches(expected: Buffer, given: string): boolean {
    const provided = Buffer.from(given, "hex");
    return (
      /^[0-9a-f]{64}$/u.test(given) &&
      provided.length === expected.length &&
      timingSafeEqual(provided, expected)
    );
  }

  #verifyPresigned(method: string, url: URL): boolean {
    const params = url.searchParams;
    const amzDate = params.get("X-Amz-Date") ?? "";
    const issued = parseAmzDate(amzDate);
    const expires = Number(params.get("X-Amz-Expires"));
    if (
      params.get("X-Amz-Algorithm") !== "AWS4-HMAC-SHA256" ||
      !Number.isInteger(expires) ||
      expires < 1 ||
      expires > MAX_PRESIGN_SECONDS ||
      Number.isNaN(issued) ||
      !this.#credentialOk(params.get("X-Amz-Credential") ?? "", amzDate)
    ) {
      return false;
    }
    const now = this.#options.now().getTime();
    if (now < issued - MAX_SKEW_MS || now > issued + expires * 1000)
      return false;
    const signedHeaders = (params.get("X-Amz-SignedHeaders") ?? "").split(";");
    const canonical = this.#canonical(
      method,
      url,
      "X-Amz-Signature",
      signedHeaders,
      (name) => (name === "host" ? url.host : undefined),
      "UNSIGNED-PAYLOAD",
    );
    if (canonical === undefined) return false;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      `${amzDate.slice(0, 8)}/${this.#region}/s3/aws4_request`,
      hex(canonical),
    ].join("\n");
    return this.#matches(
      this.#signature(amzDate.slice(0, 8), stringToSign),
      params.get("X-Amz-Signature") ?? "",
    );
  }

  #verifyHeaders(
    method: string,
    url: URL,
    headers: Readonly<Record<string, string>>,
    body: Uint8Array,
  ): boolean {
    const match =
      /^AWS4-HMAC-SHA256 Credential=([^,]+), SignedHeaders=([^,]+), Signature=([0-9a-f]+)$/u.exec(
        headers["authorization"] ?? "",
      );
    const amzDate = headers["x-amz-date"] ?? "";
    const issued = parseAmzDate(amzDate);
    if (
      match === null ||
      Number.isNaN(issued) ||
      Math.abs(this.#options.now().getTime() - issued) > MAX_SKEW_MS ||
      !this.#credentialOk(match[1] ?? "", amzDate)
    ) {
      return false;
    }
    const signedHeaders = (match[2] ?? "").split(";");
    // S3 requires `host` and every `x-amz-*` header that was sent to be signed.
    const unsigned = Object.keys(headers).filter(
      (name) => name.startsWith("x-amz-") && !signedHeaders.includes(name),
    );
    if (!signedHeaders.includes("host") || unsigned.length > 0) return false;

    const payload = headers["x-amz-content-sha256"] ?? "";
    if (payload !== "UNSIGNED-PAYLOAD" && payload !== hex(body)) return false;

    const canonical = this.#canonical(
      method,
      url,
      undefined,
      signedHeaders,
      (name) => (name === "host" ? url.host : headers[name]),
      payload,
    );
    if (canonical === undefined) return false;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      `${amzDate.slice(0, 8)}/${this.#region}/s3/aws4_request`,
      hex(canonical),
    ].join("\n");
    return this.#matches(
      this.#signature(amzDate.slice(0, 8), stringToSign),
      match[3] ?? "",
    );
  }
}
