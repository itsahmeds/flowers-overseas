/**
 * `pnpm media:upload [--dry-run] [--only <assetId>] [--force] [--verify]` — put the derived
 * variants into the media bucket, idempotently, with no database and no queue (spec 006 §2.6,
 * AC-27; ADR-0015; TASK-138).
 *
 * ## Why this is a script and not a worker
 *
 * TASK-082 stopped because the worker shape it inherited needed three things that do not exist:
 * `src/lib/storage.ts`, migration 0004's `media_variant` table and the pg-boss registry. None of
 * them buys a visitor anything today. The variant ladder is already derived deterministically by
 * `pnpm media:variants` and already recorded, row for row, in `seed/data/media-variants.json`
 * — 118 rows, committed, checked by `pnpm seed:check`. **That manifest is the source of truth in
 * Phase 0**, so putting the bytes in the bucket is a loop over rows, and a loop over rows is a
 * script. A `media_variant` table and a `media.derive_variants` job are Phase 1 groundwork.
 *
 * ## Idempotent by checksum, not by mtime and not by "upload everything"
 *
 * Each object carries its SHA-256 as user metadata (`x-amz-meta-sha256`). A run `HEAD`s every
 * key first and uploads only where the stored digest differs from the manifest's — so a re-run
 * after adding one photograph transfers one photograph's worth of bytes, a re-run after none
 * transfers nothing, and an interrupted run resumes correctly. `--force` re-uploads regardless,
 * which is the repair when an object's bytes and its metadata have been made to disagree by
 * something other than this script.
 *
 * ## What it refuses to do
 *
 * Nothing reaches the bucket that the gates have not seen:
 *
 *  - `checkVariants()` — the same function `pnpm media:variants --check` runs — must be clean,
 *    which ties every file to its manifest row by byte count and SHA-256 and rejects an orphan
 *    file or a row with no file;
 *  - every file must be inside its slot's `SLOT_BYTE_CAPS` entry (`seed/budgets.ts`). The 6 MB
 *    repository total is gone with the committed bytes — that is the point of this task — and
 *    this is one of the guards that replaced it;
 *  - no file may carry the demo watermark (spec 006 §13 Q12, AC-16). The repository no longer
 *    holds the bytes, so the "nothing watermarked ships" invariant is enforced here, at the last
 *    moment before they are published, rather than over a committed tree that no longer exists;
 *  - `R2_PUBLIC_BASE_URL` must equal `MEDIA_ORIGIN`, the constant the application builds every
 *    image URL and the CSP `img-src` allowance from. Uploading to a bucket the site does not
 *    read from is the one failure this whole path cannot detect afterwards.
 *
 * ## `--verify`: auditing the bucket against the manifest, with no credential
 *
 * Those four gates all run *before* the bytes leave this machine, which leaves one direction
 * unchecked and `/review 94` round 2 measured it: lowering a row's `bytes` from 9 911 to 900
 * leaves `pnpm seed:check` and `pnpm media:variants --check` both clean in the CI condition,
 * because neither has the file. The hole is narrow — a sanctioned upload reads the real file, so
 * an over-cap object cannot get into the bucket that way — but "no row can disagree with its
 * file" was a stronger claim than what ran.
 *
 * `pnpm media:upload --verify` closes it from the other end. It `HEAD`s every row's `objectKey`
 * on the **public** origin and compares the published `content-length` and `content-type` to the
 * row, so it needs no access key, no secret and no derived tree: the manifest and a network are
 * the whole input. It is an operator command rather than a CI job because 118 requests against a
 * rate-limited `pub-*.r2.dev` origin is not a thing to put on every pull request; the runbook
 * (`docs/runbooks/imagery.md` §6) names when to run it — after an upload, and before trusting a
 * byte column nobody watched being written.
 *
 * ## Credentials
 *
 * Read through `@next/env`'s `loadEnvConfig` (the loader `scripts/db-migrate.ts` uses) and parsed
 * with the R2 half of `serverEnvSchema` — only that half, so the script runs with no database
 * configured. **No value is ever printed**: a missing or malformed key is reported by name.
 *
 * The signing is plain SigV4 over `fetch`, about sixty lines below, rather than
 * `@aws-sdk/client-s3`: a twenty-megabyte dependency tree, in the production lockfile, for a
 * `PUT` and a `HEAD` in a script nobody runs in a request path.
 */
import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { SLOT_BYTE_CAPS } from "../seed/budgets.ts";
import {
  VARIANT_MANIFEST_PATH,
  checkVariants,
  readMediaAssets,
  readVariantManifest,
  variantFilePath,
} from "../seed/media-variants.ts";
import type { MediaVariantManifest } from "../seed/schema/media.ts";
import { isWatermarked } from "../seed/watermark.ts";
import { MEDIA_CACHE_CONTROL } from "../src/lib/media-headers.ts";
import { MEDIA_ORIGIN } from "../src/lib/media-origin.ts";
import { type EnvSource, serverEnvSchema } from "../src/lib/env.schema.ts";

/* -------------------------------------------------------------------------- */
/* Configuration.                                                             */
/* -------------------------------------------------------------------------- */

/** Only the keys this script needs: a missing `DATABASE_URL` must not stop an image upload. */
const r2EnvSchema = serverEnvSchema.pick({
  R2_BUCKET: true,
  R2_S3_ENDPOINT: true,
  R2_ACCESS_KEY_ID: true,
  R2_SECRET_ACCESS_KEY: true,
  R2_PUBLIC_BASE_URL: true,
});

export type R2Config = z.infer<typeof r2EnvSchema>;

/**
 * Parse the R2 half of the environment. Errors name **keys**, never values (spec 001 §5): a
 * secret that reaches a terminal reaches a scrollback, a screenshot and a paste.
 */
export function readR2Config(source: EnvSource): R2Config {
  const parsed = r2EnvSchema.safeParse(source);
  if (!parsed.success) {
    const keys = [
      ...new Set(parsed.error.issues.map((issue) => issue.path.join("."))),
    ].sort();
    throw new Error(
      `R2 configuration is missing or malformed: ${keys.join(", ")} (see .env.example; values are never printed)`,
    );
  }
  return parsed.data;
}

/**
 * The one place the public origin is checked against the environment. The application builds
 * every image URL and its own CSP from `MEDIA_ORIGIN` (`src/lib/media-origin.ts`), so a bucket
 * published at a different host would upload cleanly and serve nothing.
 */
export function assertOriginAgrees(publicBaseUrl: string): void {
  if (publicBaseUrl.replace(/\/+$/u, "") !== MEDIA_ORIGIN) {
    throw new Error(
      `R2_PUBLIC_BASE_URL does not match MEDIA_ORIGIN (\`${MEDIA_ORIGIN}\`, src/lib/media-origin.ts): the site would build its image URLs — and its CSP \`img-src\` — from an origin these objects are not published at. Change the constant, or the variable, so the two agree.`,
    );
  }
}

/** The stored `Content-Type` per derived format. */
export function contentTypeFor(format: string): string {
  switch (format) {
    case "avif":
      return "image/avif";
    case "webp":
      return "image/webp";
    case "jpeg":
      return "image/jpeg";
    default:
      throw new Error(`no content type for derived format \`${format}\``);
  }
}

/* -------------------------------------------------------------------------- */
/* SigV4 (S3, region `auto` — what R2 expects).                               */
/* -------------------------------------------------------------------------- */

const ALGORITHM = "AWS4-HMAC-SHA256";
const REGION = "auto";
const SERVICE = "s3";
/** The hash of an empty body, which every `HEAD` signs. */
export const EMPTY_SHA256 =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

const sha256Hex = (value: Buffer | string): string =>
  createHash("sha256").update(value).digest("hex");

const hmac = (key: Buffer | string, value: string): Buffer =>
  createHmac("sha256", key).update(value, "utf8").digest();

/** `20260921T101530Z` and `20260921`, the two forms SigV4 wants. */
export function amzDates(now: Date): { amzDate: string; dateStamp: string } {
  const amzDate = `${now.toISOString().replace(/[-:]/gu, "").slice(0, 15)}Z`;
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

/** Percent-encode a key path segment by segment: `/` separates, everything else is encoded. */
export function canonicalUri(path: string): string {
  return path
    .split("/")
    .map((segment) =>
      encodeURIComponent(segment).replace(
        /[!'()*]/gu,
        (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
      ),
    )
    .join("/");
}

export interface SignedRequest {
  readonly url: string;
  readonly method: "PUT" | "HEAD";
  readonly headers: Readonly<Record<string, string>>;
}

/**
 * Sign one request. Pure — the clock is an argument — so the canonical request, the signed
 * header set and the stability of the signature are all unit-testable without a network or a
 * fixed system time.
 */
export function signRequest(options: {
  readonly method: "PUT" | "HEAD";
  readonly endpoint: string;
  readonly bucket: string;
  readonly objectKey: string;
  readonly payloadSha256: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly now: Date;
}): SignedRequest {
  const { amzDate, dateStamp } = amzDates(options.now);
  const endpoint = new URL(options.endpoint);
  const path = canonicalUri(`/${options.bucket}/${options.objectKey}`);

  const headers: Record<string, string> = {
    ...(options.headers ?? {}),
    host: endpoint.host,
    "x-amz-content-sha256": options.payloadSha256,
    "x-amz-date": amzDate,
  };
  const names = Object.keys(headers)
    .map((name) => name.toLowerCase())
    .sort();
  const canonicalHeaders = names
    .map((name) => `${name}:${(headers[name] ?? "").trim()}\n`)
    .join("");
  const signedHeaders = names.join(";");

  const canonicalRequest = [
    options.method,
    path,
    "",
    canonicalHeaders,
    signedHeaders,
    options.payloadSha256,
  ].join("\n");

  const scope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign = [
    ALGORITHM,
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signature = hmac(
    hmac(
      hmac(
        hmac(hmac(`AWS4${options.secretAccessKey}`, dateStamp), REGION),
        SERVICE,
      ),
      "aws4_request",
    ),
    stringToSign,
  ).toString("hex");

  return {
    url: `${endpoint.origin}${path}`,
    method: options.method,
    headers: {
      ...headers,
      authorization: `${ALGORITHM} Credential=${options.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* The plan.                                                                  */
/* -------------------------------------------------------------------------- */

export interface UploadItem {
  readonly row: MediaVariantManifest;
  readonly path: string;
  readonly bytes: Buffer;
}

export interface UploadOutcome {
  readonly objectKey: string;
  readonly action: "uploaded" | "skipped";
  readonly bytes: number;
}

/** A minimal `fetch`, so the whole loop is testable without a network. */
export type Fetcher = (
  url: string,
  init: {
    readonly method: string;
    readonly headers: Record<string, string>;
    readonly body?: Buffer;
  },
) => Promise<{
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

/**
 * Read, verify and load every file the manifest lists. Throws on the first refusal, before a
 * single byte is sent: a partial upload of a set that failed a gate is worse than none.
 */
export async function loadUploadSet(options: {
  readonly root: string;
  readonly only?: readonly string[];
}): Promise<readonly UploadItem[]> {
  const { root } = options;
  const report = checkVariants({ root });
  if (report.problems.length > 0) {
    throw new Error(
      `the derived tree does not match the manifest — fix these before uploading (\`pnpm media:variants --check\`):\n${report.problems.join("\n")}`,
    );
  }
  if (!report.derivedTreePresent) {
    throw new Error(
      "no derived tree to upload: run `pnpm media:variants` first (the bytes are git-ignored since TASK-138 — they live in the bucket, not in the repository)",
    );
  }

  const slots = new Map(
    readMediaAssets(root).map((asset) => [asset.id, asset.slot]),
  );
  const rows = (readVariantManifest(root)?.rows ?? []).filter(
    (row) => options.only === undefined || options.only.includes(row.assetId),
  );

  const items: UploadItem[] = [];
  for (const row of rows) {
    const path = variantFilePath(row.assetId, row.width, row.format);
    const bytes = readFileSync(join(root, path));
    const slot = slots.get(row.assetId);
    if (slot === undefined) {
      throw new Error(`${path}: no asset \`${row.assetId}\` in media.json`);
    }
    const cap = SLOT_BYTE_CAPS[slot];
    if (bytes.byteLength > cap) {
      throw new Error(
        `${path}: ${String(bytes.byteLength)} B is above the ${String(cap)} B cap for the \`${slot}\` slot (seed/budgets.ts) — an oversized image fails here, before it is served`,
      );
    }
    if (await isWatermarked(bytes)) {
      throw new Error(
        `${path}: carries the demo watermark, which never ships (spec 006 §13 Q12, AC-16)`,
      );
    }
    items.push({ row, path, bytes });
  }
  return items;
}

/**
 * Put one object if the bucket does not already hold exactly these bytes. The comparison is the
 * stored SHA-256, so it is a property of the bytes rather than of a timestamp or a byte count.
 */
export async function syncObject(options: {
  readonly item: UploadItem;
  readonly config: R2Config;
  readonly fetcher: Fetcher;
  readonly force?: boolean;
  readonly dryRun?: boolean;
  readonly now?: () => Date;
}): Promise<UploadOutcome> {
  const { item, config, fetcher } = options;
  const now = options.now ?? ((): Date => new Date());
  const credentials = {
    endpoint: config.R2_S3_ENDPOINT,
    bucket: config.R2_BUCKET,
    objectKey: item.row.objectKey,
    accessKeyId: config.R2_ACCESS_KEY_ID,
    secretAccessKey: config.R2_SECRET_ACCESS_KEY,
  };

  if (options.force !== true) {
    const head = signRequest({
      ...credentials,
      method: "HEAD",
      payloadSha256: EMPTY_SHA256,
      now: now(),
    });
    const response = await fetcher(head.url, {
      method: "HEAD",
      headers: { ...head.headers },
    });
    if (response.status === 200) {
      if (
        response.headers.get("x-amz-meta-sha256") === item.row.checksumSha256
      ) {
        return {
          objectKey: item.row.objectKey,
          action: "skipped",
          bytes: item.bytes.byteLength,
        };
      }
    } else if (response.status !== 404) {
      throw new Error(
        `HEAD ${item.row.objectKey}: unexpected status ${String(response.status)}`,
      );
    }
  }

  if (options.dryRun === true) {
    return {
      objectKey: item.row.objectKey,
      action: "uploaded",
      bytes: item.bytes.byteLength,
    };
  }

  const put = signRequest({
    ...credentials,
    method: "PUT",
    // The manifest's checksum **is** the payload hash SigV4 signs, which is why a tampered file
    // cannot be uploaded under a clean row: the signature would not verify against its bytes.
    payloadSha256: item.row.checksumSha256,
    headers: {
      "content-type": contentTypeFor(item.row.format),
      "content-length": String(item.bytes.byteLength),
      "cache-control": MEDIA_CACHE_CONTROL,
      "x-amz-meta-sha256": item.row.checksumSha256,
    },
    now: now(),
  });
  const response = await fetcher(put.url, {
    method: "PUT",
    headers: { ...put.headers },
    body: item.bytes,
  });
  if (response.status !== 200) {
    throw new Error(
      `PUT ${item.row.objectKey}: status ${String(response.status)} — ${(await response.text()).slice(0, 300)}`,
    );
  }
  return {
    objectKey: item.row.objectKey,
    action: "uploaded",
    bytes: item.bytes.byteLength,
  };
}

/**
 * Audit what is published against what the manifest says is published: one `HEAD` per row on the
 * **public** origin, comparing `content-length` and `content-type` to the row.
 *
 * No credential, no signing, no derived tree — which is the point. The gates in `loadUploadSet()`
 * all run before the bytes leave this machine and are blind to a manifest edited afterwards; this
 * is the only check that reads the bucket. Every problem is collected rather than thrown on, so
 * one run names every disagreement instead of the first.
 *
 * `concurrency` is deliberately small: the origin is rate-limited (`docs/tasks/TASK-138.md`
 * escalation 2) and a burst of 118 is exactly the shape that makes it answer slowly.
 */
export async function verifyPublished(options: {
  readonly rows: readonly MediaVariantManifest[];
  readonly fetcher: Fetcher;
  readonly origin?: string;
  readonly concurrency?: number;
}): Promise<readonly string[]> {
  const origin = options.origin ?? MEDIA_ORIGIN;
  const size = Math.max(1, options.concurrency ?? 8);
  const problems: string[] = [];

  const check = async (row: MediaVariantManifest): Promise<void> => {
    // No `authorization` header and no `x-amz-*`: a public object needs none, and a command that
    // asked for a secret would be one more place a secret could be printed.
    const response = await options.fetcher(`${origin}/${row.objectKey}`, {
      method: "HEAD",
      headers: {},
    });
    if (response.status === 404) {
      problems.push(
        `${row.objectKey}: the manifest lists it but the bucket does not publish it (404 at ${origin}) — run \`pnpm media:upload\``,
      );
      return;
    }
    if (response.status !== 200) {
      problems.push(
        `${row.objectKey}: HEAD returned ${String(response.status)} from ${origin}`,
      );
      return;
    }
    const length = Number(response.headers.get("content-length"));
    if (!Number.isInteger(length)) {
      problems.push(
        `${row.objectKey}: no usable \`content-length\` on the published object`,
      );
    } else if (length !== row.bytes) {
      problems.push(
        `${row.objectKey}: ${String(length)} B published but ${String(row.bytes)} B in ${VARIANT_MANIFEST_PATH} — the row and the object it names disagree`,
      );
    }
    const type = response.headers.get("content-type");
    const expected = contentTypeFor(row.format);
    if (type !== expected) {
      problems.push(
        `${row.objectKey}: published as \`${type ?? "(none)"}\`, expected \`${expected}\``,
      );
    }
  };

  for (let index = 0; index < options.rows.length; index += size) {
    await Promise.all(options.rows.slice(index, index + size).map(check));
  }
  return problems;
}

export interface UploadArgs {
  readonly dryRun: boolean;
  readonly force: boolean;
  readonly verify: boolean;
  readonly only?: readonly string[];
}

export function parseArgs(argv: readonly string[]): UploadArgs {
  let dryRun = false;
  let force = false;
  let verify = false;
  const only: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--force") force = true;
    else if (arg === "--verify") verify = true;
    else if (arg === "--only" || arg.startsWith("--only=")) {
      const value = arg.startsWith("--only=")
        ? arg.slice("--only=".length)
        : (argv[index + 1] ?? "");
      if (value === "") throw new Error("`--only` needs an asset id");
      if (!arg.startsWith("--only=")) index += 1;
      only.push(value);
    } else {
      throw new Error(
        `unknown flag \`${arg}\` — \`pnpm media:upload [--dry-run] [--only <assetId>] [--force] [--verify]\``,
      );
    }
  }
  return { dryRun, force, verify, ...(only.length > 0 ? { only } : {}) };
}

/* c8 ignore start -- the connected half: proved by a real run against the bucket, not in CI */

async function main(): Promise<void> {
  const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const args = parseArgs(process.argv.slice(2));

  // CommonJS interop, as in `scripts/db-migrate.ts`: the named export lives on `default` when
  // `@next/env` is reached through a dynamic `import()` from a type-stripped `.ts` file.
  const nextEnv = await import("@next/env");
  (nextEnv as unknown as { default: typeof nextEnv }).default.loadEnvConfig(
    root,
  );

  const fetcher: Fetcher = async (url, init) =>
    await fetch(url, {
      method: init.method,
      headers: init.headers,
      ...(init.body === undefined
        ? {}
        : { body: new Uint8Array(init.body) as BodyInit }),
    });

  // `--verify` reads the public origin only, so it runs before any credential is asked for: a
  // command that needs no secret must not fail because a secret is absent.
  if (args.verify) {
    const rows = (readVariantManifest(root)?.rows ?? []).filter(
      (row) => args.only === undefined || args.only.includes(row.assetId),
    );
    const problems = await verifyPublished({ rows, fetcher });
    if (problems.length > 0) {
      throw new Error(
        `${String(problems.length)} published object(s) disagree with ${VARIANT_MANIFEST_PATH}:\n${problems.join("\n")}`,
      );
    }
    process.stdout.write(
      `${String(rows.length)} row(s) verified against ${MEDIA_ORIGIN}/: every object is published with the byte count and content type its row records.\n`,
    );
    return;
  }

  const config = readR2Config(process.env);
  assertOriginAgrees(config.R2_PUBLIC_BASE_URL);

  const items = await loadUploadSet({
    root,
    ...(args.only === undefined ? {} : { only: args.only }),
  });

  let uploaded = 0;
  let skipped = 0;
  let bytes = 0;
  for (const item of items) {
    const outcome = await syncObject({
      item,
      config,
      fetcher,
      force: args.force,
      dryRun: args.dryRun,
    });
    if (outcome.action === "uploaded") {
      uploaded += 1;
      bytes += outcome.bytes;
      process.stdout.write(
        `${args.dryRun ? "would upload" : "uploaded"} ${outcome.objectKey} (${String(outcome.bytes)} B)\n`,
      );
    } else {
      skipped += 1;
    }
  }

  process.stdout.write(
    `${String(items.length)} variant(s): ${String(uploaded)} ${args.dryRun ? "to upload" : "uploaded"}, ${String(skipped)} already current, ${String(bytes)} B transferred. Served from ${MEDIA_ORIGIN}/.\n`,
  );
}

const isMain =
  typeof process.argv[1] === "string" &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  });
}

/* c8 ignore stop */
