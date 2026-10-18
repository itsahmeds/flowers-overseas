/**
 * `node scripts/artifact-credential-check.ts [--scrub] <path>...`: nothing CI uploads may carry
 * the staging wall's credential (spec 040 AC-25, AC-26; TASK-099, `/review 263` item 1, `/break
 * 263` holes 3 and 9).
 *
 * Since TASK-099 the browser suites and Lighthouse reach the pull request's Railway environment
 * through the staging wall, with `STAGING_BASIC_AUTH` (`user:password`) as Playwright HTTP
 * credentials and as a Lighthouse `extraHeaders` entry. The repository is public, and so are its
 * workflow artifacts, so every directory a job uploads is passed through this command first:
 *
 *  - it reads the credential from `STAGING_BASIC_AUTH` itself, never from a value another step
 *    derived, so no earlier step can switch it off by forgetting to hand something on;
 *  - it looks for every form the credential travels in: `user:password`, the password alone (when
 *    it is eight characters or more, so a short one cannot match by chance), its Basic base64, and
 *    that base64 with `/` escaped as `\/`, as JSON and HTML reports write it;
 *  - it reads inside what a plain byte search cannot: every `.zip` (a Playwright trace) through
 *    `unzip -p`, and every `data:application/zip;base64,…` blob embedded in an HTML report;
 *  - `--scrub` first replaces each form with `REDACTED` in every file that holds it as plain
 *    bytes, and **deletes** a zip, or an HTML file whose embedded zip holds it, since neither can
 *    be rewritten in place; then it checks again.
 *
 * `--basic` prints the `Basic …` header value `lighthouse` sends, from the same trimmed secret
 * (exit 2 when there is none), so the job and this check derive the bytes in one place.
 *
 * Exit codes: 0 clean (or no credential in scope: a push run, a fork, a local run) · 1 a file
 * still holds a form after the run; the file is named and the value never printed · 2 usage.
 *
 * @purpose CI artifact check: no upload carries the staging wall's credential
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** A password shorter than this is not searched alone: it could match unrelated bytes. */
export const MIN_PASSWORD_LENGTH = 8;

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

/**
 * Every form the credential can travel in, longest first so a scrub never leaves a fragment. It
 * starts from every variant of the secret a job could have used (the raw value as stored, and
 * trimmed, trimmed at either end), and for each: the value, its Basic base64 and that base64 with
 * `/` escaped as `\/` (JSON and HTML reports), its URL encoding, and the password alone (when it
 * is long enough not to match by chance) and its URL encoding.
 */
export function credentialForms(raw: string | undefined): string[] {
  if (raw === undefined || raw.trim() === "") return [];
  const variants = new Set([raw, raw.trim(), raw.trimStart(), raw.trimEnd()]);
  const forms = new Set<string>();
  for (const variant of variants) {
    const base64 = Buffer.from(variant).toString("base64");
    forms.add(variant);
    forms.add(base64);
    forms.add(base64.replaceAll("/", "\\/"));
    forms.add(encodeURIComponent(variant));
    const colon = variant.indexOf(":");
    const password = colon === -1 ? "" : variant.slice(colon + 1);
    if (password.trim().length >= MIN_PASSWORD_LENGTH) {
      forms.add(password);
      forms.add(encodeURIComponent(password));
    }
  }
  return [...forms].sort((a, b) => b.length - a.length);
}

/** True when any form occurs in the bytes. */
export function holdsCredential(
  bytes: Buffer,
  forms: readonly string[],
): boolean {
  return forms.some((form) => bytes.includes(form));
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

/** The decompressed entries of a zip, concatenated. Throws when `unzip` cannot read it. */
export function zipContents(zipPath: string): Buffer {
  return execFileSync("unzip", ["-p", zipPath], {
    maxBuffer: 1024 * 1024 * 1024,
  });
}

const EMBEDDED_ZIP = /data:application\/zip;base64,([A-Za-z0-9+/=]+)/gu;

/** The decompressed contents of every zip embedded as a base64 data URL in a text file. */
export function embeddedZipContents(text: string): Buffer[] {
  const blobs: Buffer[] = [];
  for (const match of text.matchAll(EMBEDDED_ZIP)) {
    const dir = mkdtempSync(join(tmpdir(), "fo-artifact-zip-"));
    try {
      const zip = join(dir, "embedded.zip");
      writeFileSync(zip, Buffer.from(match[1] ?? "", "base64"));
      blobs.push(zipContents(zip));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  return blobs;
}

/** Does this file hold a form, read the way its kind needs? */
export function fileHoldsCredential(
  path: string,
  forms: readonly string[],
): boolean {
  const bytes = readFileSync(path);
  if (holdsCredential(bytes, forms)) return true;
  if (path.endsWith(".zip")) return holdsCredential(zipContents(path), forms);
  if (bytes.includes("data:application/zip;base64,")) {
    return embeddedZipContents(bytes.toString("latin1")).some((blob) =>
      holdsCredential(blob, forms),
    );
  }
  return false;
}

export interface ScrubAction {
  readonly path: string;
  readonly action: "redacted" | "deleted";
}

/**
 * Replace every form in each file that holds it as plain bytes; delete a zip, or a file whose
 * embedded zip holds it, because neither can be rewritten in place.
 */
export function scrub(
  files: readonly string[],
  forms: readonly string[],
): ScrubAction[] {
  const actions: ScrubAction[] = [];
  for (const path of files) {
    const bytes = readFileSync(path);
    const plain = holdsCredential(bytes, forms);
    if (path.endsWith(".zip")) {
      if (plain || holdsCredential(zipContents(path), forms)) {
        rmSync(path);
        actions.push({ path, action: "deleted" });
      }
      continue;
    }
    if (plain) {
      let text = bytes.toString("latin1");
      for (const form of forms) text = text.replaceAll(form, REDACTED);
      writeFileSync(path, Buffer.from(text, "latin1"));
      actions.push({ path, action: "redacted" });
    }
    if (fileHoldsCredential(path, forms)) {
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
  const paths = argv.filter((arg) => arg !== "--scrub");
  if (paths.length === 0) {
    out.write("artifact-credential-check: name at least one path\n");
    return 2;
  }
  const forms = credentialForms(env["STAGING_BASIC_AUTH"]);
  if (forms.length === 0) {
    out.write(
      "artifact-credential-check: STAGING_BASIC_AUTH is not in scope, so no artifact can hold it\n",
    );
    return 0;
  }
  if (doScrub) {
    for (const action of scrub(filesUnder(paths), forms)) {
      out.write(`artifact-credential-check: ${action.action} ${action.path}\n`);
    }
  }
  const files = filesUnder(paths);
  const holding = files.filter((path) => fileHoldsCredential(path, forms));
  for (const path of holding) {
    out.write(
      `::error::artifact-credential-check: ${path} holds the staging wall's credential (value not printed); nothing may be uploaded\n`,
    );
  }
  if (holding.length > 0) return 1;
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
