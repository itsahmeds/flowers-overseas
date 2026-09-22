/**
 * The visual-baseline ledger (spec 001 §2 "Testing harness", AC-17 / T-18; TASK-139).
 *
 * `playwright.config.ts` writes screenshots to
 * `tests/visual/__screenshots__/{projectName}/{platform}/{name}.png`, so every baseline exists
 * once per platform. **`linux` is the authoritative set** — CI is the gate of record (CLAUDE.md,
 * "Definition of done" 3) and `linux` is the only platform the `visual` job ever compares
 * against. `darwin` is a local-development convenience: it makes `pnpm test:visual` useful on the
 * founder's Mac, and it is never consulted by CI.
 *
 * Three commands, one file:
 *
 *   node scripts/visual/baselines.ts --check              every `darwin` baseline has a `linux`
 *                                                          counterpart (the authority rule, as a
 *                                                          gate; runs in the `lint` job)
 *   node scripts/visual/baselines.ts --manifest [--out f]  sha256 of every `linux` baseline, as
 *                                                          JSON — written by the
 *                                                          `visual-baselines` workflow
 *   node scripts/visual/baselines.ts --verify <manifest>   every committed `linux` baseline is
 *                                                          byte-for-byte a file that workflow
 *                                                          produced
 *
 * `--verify` is how a reviewer tells a legitimately-refreshed baseline from an accidental one: a
 * PNG whose sha256 is in the manifest of a named `visual-baselines` run came out of a Linux
 * runner rendering this commit; anything else was made somewhere nobody can reproduce.
 * `docs/runbooks/visual-baselines.md` is the procedure.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The platform CI renders on, and therefore the set that decides pass or fail. */
export const AUTHORITATIVE_PLATFORM = "linux";

/** The platform a developer can regenerate locally. Advisory only. */
export const LOCAL_PLATFORM = "darwin";

/** The Playwright projects that take screenshots (`playwright.config.ts`). */
export const SNAPSHOT_PROJECTS = ["visual", "pseudo-rtl"] as const;

/** Where `snapshotPathTemplate` puts them, relative to the repository root. */
export const SNAPSHOT_ROOT = "tests/visual/__screenshots__";

export interface BaselineCheck {
  /** `<project>/<file>.png` present for `darwin` but not for `linux`. The gate. */
  readonly missingOnLinux: readonly string[];
  /** Present for `linux` but not for `darwin`. Allowed: `darwin` may lag. */
  readonly localOnly: readonly string[];
  readonly counts: Readonly<Record<string, number>>;
}

/** Sorted `<project>/<name>.png` keys for one platform. */
export function baselinesFor(root: string, platform: string): string[] {
  const keys: string[] = [];
  for (const project of SNAPSHOT_PROJECTS) {
    const dir = join(root, SNAPSHOT_ROOT, project, platform);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (file.endsWith(".png")) keys.push(`${project}/${file}`);
    }
  }
  return keys.sort((a, b) => a.localeCompare(b));
}

export function checkBaselines(root: string): BaselineCheck {
  const linux = baselinesFor(root, AUTHORITATIVE_PLATFORM);
  const darwin = baselinesFor(root, LOCAL_PLATFORM);
  const linuxSet = new Set(linux);
  const darwinSet = new Set(darwin);
  return {
    missingOnLinux: darwin.filter((key) => !linuxSet.has(key)),
    localOnly: linux.filter((key) => !darwinSet.has(key)),
    counts: {
      [AUTHORITATIVE_PLATFORM]: linux.length,
      [LOCAL_PLATFORM]: darwin.length,
    },
  };
}

export interface BaselineManifest {
  readonly platform: string;
  /** `<project>/<name>.png` -> sha256 of the file, hex. */
  readonly files: Readonly<Record<string, string>>;
}

export function manifestFor(
  root: string,
  platform: string = AUTHORITATIVE_PLATFORM,
): BaselineManifest {
  const files: Record<string, string> = {};
  for (const key of baselinesFor(root, platform)) {
    const [project, name] = key.split("/");
    const bytes = readFileSync(
      join(root, SNAPSHOT_ROOT, project ?? "", platform, name ?? ""),
    );
    files[key] = createHash("sha256").update(bytes).digest("hex");
  }
  return { platform, files };
}

export interface VerifyResult {
  /** Committed baselines the manifest does not contain at all. */
  readonly unknown: readonly string[];
  /** Committed baselines the manifest knows under a different sha256. */
  readonly altered: readonly string[];
  /** Manifest entries with no committed baseline. Informational: a deletion is legitimate. */
  readonly uncommitted: readonly string[];
  readonly matched: number;
}

export function verifyAgainstManifest(
  root: string,
  manifest: BaselineManifest,
): VerifyResult {
  const committed = manifestFor(root, manifest.platform);
  const unknown: string[] = [];
  const altered: string[] = [];
  let matched = 0;
  for (const [key, hash] of Object.entries(committed.files)) {
    const expected = manifest.files[key];
    if (expected === undefined) unknown.push(key);
    else if (expected !== hash) altered.push(key);
    else matched += 1;
  }
  const uncommitted = Object.keys(manifest.files).filter(
    (key) => !(key in committed.files),
  );
  return { unknown, altered, uncommitted, matched };
}

function parseManifest(raw: string): BaselineManifest {
  const parsed: unknown = JSON.parse(raw);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("platform" in parsed) ||
    !("files" in parsed) ||
    typeof (parsed as { platform: unknown }).platform !== "string" ||
    typeof (parsed as { files: unknown }).files !== "object"
  ) {
    throw new Error("not a baseline manifest: expected { platform, files }");
  }
  return parsed as BaselineManifest;
}

function runCheck(root: string): number {
  const result = checkBaselines(root);
  const counts = Object.entries(result.counts)
    .map(([platform, n]) => `${platform}: ${String(n)}`)
    .join(", ");
  if (result.missingOnLinux.length > 0) {
    console.error(
      `visual baselines: ${String(result.missingOnLinux.length)} baseline(s) exist for ` +
        `${LOCAL_PLATFORM} but not for ${AUTHORITATIVE_PLATFORM}, which is the platform CI ` +
        `compares against — the \`visual\` job will fail on every one of them:`,
    );
    for (const key of result.missingOnLinux) console.error(`  - ${key}`);
    console.error(
      "\nRefresh them with the `visual-baselines` workflow, not by hand:\n" +
        "  docs/runbooks/visual-baselines.md",
    );
    return 1;
  }
  console.log(
    `visual baselines: ${counts} — every local baseline has a Linux counterpart.`,
  );
  if (result.localOnly.length > 0) {
    console.log(
      `  (${String(result.localOnly.length)} Linux-only baseline(s); \`darwin\` may lag, it is ` +
        "advisory.)",
    );
  }
  return 0;
}

function runVerify(root: string, manifestPath: string): number {
  const manifest = parseManifest(readFileSync(resolve(manifestPath), "utf8"));
  const result = verifyAgainstManifest(root, manifest);
  if (result.unknown.length > 0 || result.altered.length > 0) {
    console.error(
      "visual baselines: committed files that the refresh run did not produce —",
    );
    for (const key of result.unknown)
      console.error(`  - ${key}: not in the manifest`);
    for (const key of result.altered)
      console.error(`  - ${key}: sha256 differs`);
    return 1;
  }
  console.log(
    `visual baselines: ${String(result.matched)} committed ${manifest.platform} baseline(s) ` +
      "match the manifest byte for byte" +
      (result.uncommitted.length > 0
        ? `; ${String(result.uncommitted.length)} manifest entry/entries are not committed`
        : ""),
  );
  return 0;
}

export function main(argv: readonly string[], root: string): number {
  if (argv.includes("--manifest")) {
    const out = argv[argv.indexOf("--out") + 1];
    const platform = argv.includes("--platform")
      ? (argv[argv.indexOf("--platform") + 1] ?? AUTHORITATIVE_PLATFORM)
      : AUTHORITATIVE_PLATFORM;
    const json = `${JSON.stringify(manifestFor(root, platform), null, 2)}\n`;
    if (argv.includes("--out") && out !== undefined)
      writeFileSync(resolve(out), json);
    else process.stdout.write(json);
    return 0;
  }
  if (argv.includes("--verify")) {
    const path = argv[argv.indexOf("--verify") + 1];
    if (path === undefined) {
      console.error("usage: --verify <manifest.json>");
      return 2;
    }
    return runVerify(root, path);
  }
  return runCheck(root);
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === `file://${process.argv[1]}`
) {
  process.exitCode = main(
    process.argv.slice(2),
    fileURLToPath(new URL("../..", import.meta.url)),
  );
}
