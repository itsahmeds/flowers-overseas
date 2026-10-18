/**
 * `node scripts/artifact-credential-check.ts [--scrub] <path>...`: nothing CI uploads may carry
 * the staging wall's credential (spec 040 AC-25, AC-26; TASK-099, `/review 263` item 1 and round
 * 2, `/break 263` holes 3 and 9, round 2 holes 1 to 4).
 *
 * Since TASK-099 the browser suites and Lighthouse reach the pull request's Railway environment
 * through the staging wall, with `STAGING_BASIC_AUTH` (`user:password`) as Playwright HTTP
 * credentials and as a Lighthouse `extraHeaders` entry. The repository is public, and so are its
 * workflow artifacts, so every directory a job uploads is passed through this command first.
 *
 * **What it looks for.** It reads the secret itself (never a value another step derived) and
 * searches for its *core*, the secret trimmed, and for the password alone when it is eight
 * characters or more. A partly trimmed variant (`\r` or a space left on) contains the core, so
 * every variant is caught by the same search. It searches each file's bytes and its file and
 * directory names, as they are and through each of these views, applied in combination:
 *  - JSON / JavaScript unescaping (`\/`, `\"`, `\\`, `\uXXXX`, `\n`), twice, for double-escaped text;
 *  - percent-decoding, upper or lower case, with and without form encoding (`+` for a space);
 *  - base64 decoding of every run of 16 or more base64 characters (standard or URL-safe, wrapped
 *    across lines or not, `\/`-escaped or not) from each of its four alignments, so a credential
 *    encoded inside a larger blob, at any offset, is found once decoded.
 *
 * **What it opens.** A zip (by its `PK\x03\x04` magic, whatever its name) is read entry by entry
 * from its central directory, stored or deflated, and every entry name is checked too; a gzip
 * stream (`\x1f\x8b`) is inflated; a base64 run that decodes to either is opened as well. All of it
 * recursively, up to `MAX_DEPTH` levels. **It fails closed:** an archive it cannot open (encrypted,
 * zip64, an unknown method, a corrupt stream) or one nested deeper than `MAX_DEPTH` counts as
 * holding the credential.
 *
 * `--scrub` replaces every literal form of the credential with `REDACTED` (globally, longest form
 * first, so no fragment is left), then deletes any file the check still flags (an archive, a form
 * only a view reveals, a name that holds it) and any directory whose name holds it; then it checks
 * again. `--basic` prints the `Basic …` header `lighthouse` sends, from the same trimmed secret
 * (exit 2 when there is none), so the job and this check derive the bytes in one place.
 *
 * Exit codes: 0 clean (or no credential in scope: a push run, a fork, a local run) · 1 a file
 * still holds it after the run; the file is named and the value never printed · 2 usage.
 *
 * @purpose CI artifact check: no upload carries the staging wall's credential
 */
import {
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, inflateRawSync } from "node:zlib";

/** A password shorter than this is not searched alone: it could match unrelated bytes. */
export const MIN_PASSWORD_LENGTH = 8;

/** How many archives (or decoded blobs) deep it reads before it fails closed. */
export const MAX_DEPTH = 6;

/** A base64 run shorter than this is not decoded: the shortest credential encodes longer. */
export const MIN_BASE64_RUN = 16;

export const REDACTED = "REDACTED";

/**
 * The one credential the jobs send: the secret with surrounding whitespace removed, as the
 * GitHub UI easily adds a trailing newline or space to a pasted value. `lighthouse` builds its
 * header with `--basic` below, from this function, so the job and the check cannot drift apart
 * (`/review 263` round 2).
 */
export function wallCredential(raw: string | undefined): string {
  return raw?.trim() ?? "";
}

/** `Basic <base64>` of `wallCredential`, or `""` when there is none. */
export function basicAuthorization(raw: string | undefined): string {
  const credential = wallCredential(raw);
  return credential === ""
    ? ""
    : `Basic ${Buffer.from(credential).toString("base64")}`;
}

/** What every view is searched for: the trimmed secret, and the password when long enough. */
export function needles(raw: string | undefined): string[] {
  const core = wallCredential(raw);
  if (core === "") return [];
  const colon = core.indexOf(":");
  const password = colon === -1 ? "" : core.slice(colon + 1);
  return password.length >= MIN_PASSWORD_LENGTH ? [core, password] : [core];
}

/**
 * The literal forms `--scrub` replaces, longest first so a scrub never leaves a fragment: for the
 * stored secret and every trimmed variant, the value, its base64 (and `\/`-escaped), its URL
 * encoding (upper and lower case), and the password alone and its URL encoding. Anything these
 * miss is still found by the check's views, and the file is then deleted instead.
 */
export function credentialForms(raw: string | undefined): string[] {
  if (raw === undefined || raw.trim() === "") return [];
  const variants = new Set([raw, raw.trim(), raw.trimStart(), raw.trimEnd()]);
  const forms = new Set<string>();
  for (const variant of variants) {
    const base64 = Buffer.from(variant).toString("base64");
    const encoded = encodeURIComponent(variant);
    for (const form of [
      variant,
      base64,
      base64.replaceAll("/", "\\/"),
      encoded,
      encoded.replace(/%[0-9A-F]{2}/gu, (hex) => hex.toLowerCase()),
    ]) {
      forms.add(form);
    }
    const colon = variant.indexOf(":");
    const password = colon === -1 ? "" : variant.slice(colon + 1);
    if (password.trim().length >= MIN_PASSWORD_LENGTH) {
      forms.add(password);
      forms.add(encodeURIComponent(password));
    }
  }
  return [...forms].sort((a, b) => b.length - a.length);
}

// ---------------------------------------------------------------------------------------------
// Views of a text
// ---------------------------------------------------------------------------------------------

const SIMPLE_ESCAPES: Readonly<Record<string, string>> = {
  n: "\n",
  r: "\r",
  t: "\t",
  b: "\b",
  f: "\f",
};

/** One level of JSON / JavaScript string unescaping; unknown escapes keep their character. */
export function jsonUnescape(text: string): string {
  return text.replace(
    /\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[\s\S])/gu,
    (_, escape: string) => {
      if (
        (escape.startsWith("u") && escape.length === 5) ||
        (escape.startsWith("x") && escape.length === 3)
      ) {
        return String.fromCharCode(Number.parseInt(escape.slice(1), 16));
      }
      return SIMPLE_ESCAPES[escape] ?? escape;
    },
  );
}

/** Percent-decoding, either case, byte-wise and tolerant of malformed sequences. */
export function percentDecode(text: string, formPlus: boolean): string {
  const plussed = formPlus ? text.replaceAll("+", " ") : text;
  return Buffer.from(
    plussed.replace(/%([0-9a-fA-F]{2})/gu, (_, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    ),
    "latin1",
  ).toString("utf8");
}

/** Every distinct text view: as is, unescaped (once, twice), each percent-decoded both ways. */
export function textViews(text: string): string[] {
  const once = jsonUnescape(text);
  const twice = jsonUnescape(once);
  const views = new Set<string>();
  for (const base of [text, once, twice]) {
    views.add(base);
    views.add(percentDecode(base, false));
    views.add(percentDecode(base, true));
  }
  return [...views];
}

const BASE64_RUN =
  /[A-Za-z0-9+/_-]+(?:=*(?:\r?\n[ \t]*|\\[nr]|\\[/+])+[A-Za-z0-9+/_-]+)*=*/gu;

/**
 * Every run of base64 characters long enough to hold a credential, normalised: line breaks
 * (real or escaped) and `\/` escapes removed, URL-safe `-`/`_` mapped to `+`/`/`.
 */
export function base64Runs(text: string): string[] {
  const runs: string[] = [];
  for (const match of text.matchAll(BASE64_RUN)) {
    const run = match[0]
      .replace(/\r?\n[ \t]*|\\[nr]/gu, "")
      .replaceAll("\\/", "/")
      .replaceAll("\\+", "+")
      .replaceAll("-", "+")
      .replaceAll("_", "/");
    if (run.length >= MIN_BASE64_RUN) runs.push(run);
  }
  return runs;
}

/** A run decoded from each of its four character alignments (padding inside splits it). */
export function base64Decodings(run: string): Buffer[] {
  const out: Buffer[] = [];
  for (const segment of run.split(/=+/u)) {
    if (segment.length < MIN_BASE64_RUN - 4) continue;
    for (let offset = 0; offset < 4; offset += 1) {
      // Node decodes a trailing partial quantum, so the last bytes are kept without padding.
      out.push(Buffer.from(segment.slice(offset), "base64"));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Archives, read in-process
// ---------------------------------------------------------------------------------------------

export class UnreadableArchiveError extends Error {
  override name = "UnreadableArchiveError";
}

const ZIP_LOCAL = 0x04034b50;
const ZIP_CENTRAL = 0x02014b50;
const ZIP_END = 0x06054b50;

export const isZip = (bytes: Buffer): boolean =>
  bytes.length >= 4 && bytes.readUInt32LE(0) === ZIP_LOCAL;
export const isGzip = (bytes: Buffer): boolean =>
  bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;

export interface ZipEntry {
  readonly name: string;
  readonly data: Buffer;
}

/**
 * The entries of a zip, from its central directory (so streamed zips with data descriptors read
 * too). Stored and deflated entries only; encrypted, zip64, other methods and corrupt data throw,
 * and the caller fails closed.
 */
export function zipEntries(bytes: Buffer): ZipEntry[] {
  let end = -1;
  for (
    let i = bytes.length - 22;
    i >= Math.max(0, bytes.length - 65_557);
    i -= 1
  ) {
    if (bytes.readUInt32LE(i) === ZIP_END) {
      end = i;
      break;
    }
  }
  if (end === -1) {
    throw new UnreadableArchiveError("no end of central directory");
  }
  const count = bytes.readUInt16LE(end + 10);
  let at = bytes.readUInt32LE(end + 16);
  if (count === 0xffff || at === 0xffffffff) {
    throw new UnreadableArchiveError("zip64 is not read");
  }
  const entries: ZipEntry[] = [];
  for (let n = 0; n < count; n += 1) {
    if (at + 46 > bytes.length || bytes.readUInt32LE(at) !== ZIP_CENTRAL) {
      throw new UnreadableArchiveError("corrupt central directory");
    }
    const flags = bytes.readUInt16LE(at + 8);
    const method = bytes.readUInt16LE(at + 10);
    const compressed = bytes.readUInt32LE(at + 20);
    const nameLength = bytes.readUInt16LE(at + 28);
    const extraLength = bytes.readUInt16LE(at + 30);
    const commentLength = bytes.readUInt16LE(at + 32);
    const local = bytes.readUInt32LE(at + 42);
    const name = bytes.subarray(at + 46, at + 46 + nameLength).toString("utf8");
    if ((flags & 1) === 1) {
      throw new UnreadableArchiveError(`${name} is encrypted`);
    }
    if (compressed === 0xffffffff || local === 0xffffffff) {
      throw new UnreadableArchiveError("zip64 is not read");
    }
    if (local + 30 > bytes.length || bytes.readUInt32LE(local) !== ZIP_LOCAL) {
      throw new UnreadableArchiveError(`${name}: corrupt local header`);
    }
    const start =
      local +
      30 +
      bytes.readUInt16LE(local + 26) +
      bytes.readUInt16LE(local + 28);
    const raw = bytes.subarray(start, start + compressed);
    let data: Buffer;
    if (method === 0) {
      data = Buffer.from(raw);
    } else if (method === 8) {
      try {
        data = inflateRawSync(raw);
      } catch {
        throw new UnreadableArchiveError(`${name}: corrupt deflate stream`);
      }
    } else {
      throw new UnreadableArchiveError(
        `${name}: compression method ${String(method)}`,
      );
    }
    entries.push({ name, data });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

// ---------------------------------------------------------------------------------------------
// The inspection
// ---------------------------------------------------------------------------------------------

/**
 * Does a text hold a needle in any view, or in any base64 it carries, decoded? A binary file (a
 * NUL in its first 8 KB: a screenshot) is not escaped text, so only its bytes as they are and its
 * base64 runs are read, which keeps a directory of screenshots fast.
 */
function viewsHold(
  text: string,
  wanted: readonly string[],
  onDecoded: (decoded: Buffer) => boolean,
  binary = false,
): boolean {
  for (const view of binary ? [text] : textViews(text)) {
    if (wanted.some((needle) => view.includes(needle))) return true;
    for (const run of base64Runs(view)) {
      for (const decoded of base64Decodings(run)) {
        if (onDecoded(decoded)) return true;
        const plain = decoded.toString("latin1");
        const utf8 = decoded.toString("utf8");
        if (
          wanted.some(
            (needle) => plain.includes(needle) || utf8.includes(needle),
          )
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

/** Does a short text (a file, directory or entry name) hold the credential? */
export function textHolds(text: string, wanted: readonly string[]): boolean {
  return wanted.length > 0 && viewsHold(text, wanted, () => false);
}

/**
 * Do these bytes hold the credential, read every way above? Throws `UnreadableArchiveError` on
 * an archive it cannot open or one nested deeper than `MAX_DEPTH`.
 */
export function bytesHold(
  bytes: Buffer,
  wanted: readonly string[],
  depth = 0,
): boolean {
  if (wanted.length === 0) return false;
  if (depth > MAX_DEPTH) {
    throw new UnreadableArchiveError(
      `nested deeper than ${String(MAX_DEPTH)} levels`,
    );
  }
  if (isGzip(bytes)) {
    let inflated: Buffer;
    try {
      inflated = gunzipSync(bytes);
    } catch {
      throw new UnreadableArchiveError("corrupt gzip stream");
    }
    return bytesHold(inflated, wanted, depth + 1);
  }
  if (isZip(bytes)) {
    return zipEntries(bytes).some(
      (entry) =>
        textHolds(entry.name, wanted) ||
        bytesHold(entry.data, wanted, depth + 1),
    );
  }
  const onDecoded = (decoded: Buffer): boolean =>
    (isZip(decoded) || isGzip(decoded)) &&
    bytesHold(decoded, wanted, depth + 1);
  const binary = bytes.subarray(0, 8192).includes(0);
  const texts = binary
    ? [bytes.toString("latin1")]
    : [...new Set([bytes.toString("latin1"), bytes.toString("utf8")])];
  return texts.some((text) => viewsHold(text, wanted, onDecoded, binary));
}

/** Every file under each path (a file path is itself), sorted, missing paths skipped. */
export function filesUnder(paths: readonly string[]): string[] {
  const out: string[] = [];
  const walk = (path: string): void => {
    if (!existsSync(path)) return;
    if (statSync(path).isDirectory()) {
      for (const entry of readdirSync(path).sort()) walk(join(path, entry));
      return;
    }
    out.push(path);
  };
  for (const path of paths) walk(path);
  return out;
}

export type Finding = "content" | "name" | "unreadable archive";

/** Why a file is flagged, or `undefined` when it is clean. Its name is read from `root` down. */
export function fileFinding(
  path: string,
  root: string,
  wanted: readonly string[],
): Finding | undefined {
  const name = relative(root, path) || path;
  if (textHolds(name.split(sep).join("/"), wanted)) return "name";
  try {
    return bytesHold(readFileSync(path), wanted) ? "content" : undefined;
  } catch (error) {
    if (error instanceof UnreadableArchiveError) return "unreadable archive";
    throw error;
  }
}

export interface ScrubAction {
  readonly path: string;
  readonly action: "redacted" | "deleted";
}

/** The root a path was reached from, so names are checked relative to what is uploaded. */
function rootOf(path: string, roots: readonly string[]): string {
  return (
    roots.find((root) => path === root || path.startsWith(root + sep)) ?? path
  );
}

function directoriesUnder(path: string): string[] {
  if (!existsSync(path) || !statSync(path).isDirectory()) return [];
  return readdirSync(path)
    .sort()
    .map((entry) => join(path, entry))
    .filter((child) => statSync(child).isDirectory())
    .flatMap((child) => [child, ...directoriesUnder(child)]);
}

/**
 * Delete any directory whose name holds it; replace every literal form in every other file,
 * globally and longest first; then delete any file the check still flags.
 */
export function scrub(
  roots: readonly string[],
  forms: readonly string[],
  wanted: readonly string[],
): ScrubAction[] {
  const actions: ScrubAction[] = [];
  const longestFirst = [...forms].sort((a, b) => b.length - a.length);
  for (const root of roots) {
    for (const dir of directoriesUnder(root)) {
      if (
        existsSync(dir) &&
        textHolds(relative(root, dir).split(sep).join("/"), wanted)
      ) {
        rmSync(dir, { recursive: true, force: true });
        actions.push({ path: dir, action: "deleted" });
      }
    }
  }
  for (const path of filesUnder(roots)) {
    const bytes = readFileSync(path);
    if (!isZip(bytes) && !isGzip(bytes)) {
      const before = bytes.toString("latin1");
      let text = before;
      for (const form of longestFirst) {
        text = text.replaceAll(
          Buffer.from(form, "utf8").toString("latin1"),
          REDACTED,
        );
      }
      if (text !== before) {
        writeFileSync(path, Buffer.from(text, "latin1"));
        actions.push({ path, action: "redacted" });
      }
    }
    if (fileFinding(path, rootOf(path, roots), wanted) !== undefined) {
      rmSync(path);
      actions.push({ path, action: "deleted" });
    }
  }
  return actions;
}

export function main(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>> = process.env,
  out: { write: (chunk: string) => unknown } = process.stdout,
): number {
  if (argv.includes("--basic")) {
    // The header `lighthouse` sends, built by the same function the check reads.
    const header = basicAuthorization(env["STAGING_BASIC_AUTH"]);
    if (header === "") return 2;
    out.write(`${header}\n`);
    return 0;
  }
  const doScrub = argv.includes("--scrub");
  const roots = argv
    .filter((arg) => arg !== "--scrub")
    .map((path) => resolve(path));
  if (roots.length === 0) {
    out.write("artifact-credential-check: name at least one path\n");
    return 2;
  }
  const wanted = needles(env["STAGING_BASIC_AUTH"]);
  if (wanted.length === 0) {
    out.write(
      "artifact-credential-check: STAGING_BASIC_AUTH is not in scope, so no artifact can hold it\n",
    );
    return 0;
  }
  if (doScrub) {
    const forms = credentialForms(env["STAGING_BASIC_AUTH"]);
    for (const action of scrub(roots, forms, wanted)) {
      out.write(`artifact-credential-check: ${action.action} ${action.path}\n`);
    }
  }
  const files = filesUnder(roots);
  const flagged = files
    .map((path) => ({
      path,
      finding: fileFinding(path, rootOf(path, roots), wanted),
    }))
    .filter((entry) => entry.finding !== undefined);
  for (const { path, finding } of flagged) {
    out.write(
      `::error::artifact-credential-check: ${path} holds the staging wall's credential in its ${String(finding)} (value not printed); nothing may be uploaded\n`,
    );
  }
  if (flagged.length > 0) return 1;
  out.write(
    `artifact-credential-check: ${String(files.length)} file(s) checked, none holds the wall's credential\n`,
  );
  return 0;
}

// `realpathSync`, so the check still recognises itself when reached through a symlinked path.
const isMain =
  typeof process.argv[1] === "string" &&
  realpathSync(resolve(process.argv[1])) ===
    realpathSync(fileURLToPath(import.meta.url));

if (isMain) {
  process.exitCode = main(process.argv.slice(2));
}
