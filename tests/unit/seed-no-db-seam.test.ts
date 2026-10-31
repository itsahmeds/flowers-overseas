/**
 * Spec 006 **AC-1**, the whole no-provisioning seam in one file (T-01; TASK-081, the Phase-0 close).
 *
 * "`pnpm build`, `pnpm test`, `pnpm seed:check` and `pnpm media:variants --check` all succeed with
 * `DATABASE_URL` unset and with no network access; `pnpm check:no-db` covers every file added by
 * §2.2–§2.5 and no such file imports `src/lib/db*`, `drizzle*`, `pg` or `postgres`."
 *
 * Four cases, each with its failure side:
 *
 *  1. **Coverage is total.** Every TypeScript file spec 006 added under `seed/`, its two scripts
 *     and `src/modules/ui/media/` is inside `SCANNED_PATHS` or named in `OUTSIDE_THE_SEAM` with
 *     the reason. A new seed file that is in neither list fails here, so the seam cannot leak
 *     quietly; an exemption that no longer names a file, or names a covered one, fails too.
 *  2. **Nothing in the seam reaches a database.** The scanner's two checks, over exactly that set.
 *  3. **The two gates run with no database and no network.** `seed:check` and
 *     `media:variants --check` are run as child processes with every `DATABASE_URL*` key removed
 *     and a preload that makes every socket, DNS lookup and `fetch` throw. A control proves the
 *     preload refuses a request, so a green run is not a guard that was never armed.
 *  4. **`pnpm test` and `pnpm build` are configured for it.** The unit job sets no database key
 *     and its MSW server errors on any unhandled request; the container job refuses a database
 *     key in the build's environment, and the image declares none as a build argument. The
 *     `pnpm build` run itself is recorded in `docs/tasks/TASK-081.md` (a build is CI's or the
 *     build slot's, never a unit test's).
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterAll, describe, expect, it } from "vitest";
import { parse } from "yaml";

import {
  SCANNED_PATHS,
  findDatabaseImports,
  findDatabaseUrlReads,
} from "../../scripts/check-no-db-imports.ts";

const repoRoot = resolve(__dirname, "../..");

/**
 * The spec 006 files that are deliberately **not** in the database-free seam, each with why.
 * Every one of them is §2.6 (the post-provisioning half) or another spec's.
 */
const OUTSIDE_THE_SEAM: Readonly<Record<string, string>> = {
  "seed/index.ts":
    "§2.6: `pnpm db:seed`, the importer, which imports `postgres` on purpose (spec 002 TASK-026)",
  "seed/plan.ts":
    "spec 002's seed plan (TASK-026): the importer's input, owned with it",
  "scripts/media-upload.ts":
    "§2.6: `pnpm media:upload`, which needs R2 credentials and the network by design (TASK-138)",
};

/** The two spec 006 scripts that live under `scripts/` rather than `seed/`. */
const SPEC_006_SCRIPTS = [
  "scripts/imagery-prompts-remaining.ts",
  "scripts/media-upload.ts",
] as const;

/** Every `.ts`/`.tsx` file under a directory, repository-relative, skipping data directories. */
function sourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(resolve(repoRoot, directory))) {
    const path = `${directory}/${name}`;
    if (statSync(resolve(repoRoot, path)).isDirectory()) {
      // `seed/data/` and `seed/snapshot/` are JSON; nothing in them is executed.
      if (path === "seed/data" || path === "seed/snapshot") continue;
      files.push(...sourceFiles(path));
    } else if (/\.tsx?$/u.test(name)) {
      files.push(path);
    }
  }
  return files;
}

/** Spec 006's file set: the seed tree, its two scripts and the design system's media directory. */
function spec006Files(): string[] {
  return [
    ...sourceFiles("seed"),
    ...SPEC_006_SCRIPTS,
    ...sourceFiles("src/modules/ui/media"),
  ].sort();
}

function isScanned(path: string): boolean {
  return SCANNED_PATHS.some(
    (entry) => path === entry || path.startsWith(`${entry}/`),
  );
}

describe("check:no-db covers every file spec 006 added (AC-1)", () => {
  it("puts every spec 006 file inside the scanned set or names it outside with a reason", () => {
    const files = spec006Files();
    // The control: the walk found the tree, not an empty directory.
    expect(files).toContain("seed/check.ts");
    expect(files).toContain("seed/watermark.ts");
    expect(files).toContain("src/modules/ui/media/MediaAsset.tsx");

    const unaccounted = files.filter(
      (path) => !isScanned(path) && OUTSIDE_THE_SEAM[path] === undefined,
    );
    expect(unaccounted).toEqual([]);
  });

  it("keeps the exemption list honest: each names a real file the scan really skips", () => {
    for (const [path, reason] of Object.entries(OUTSIDE_THE_SEAM)) {
      expect(existsSync(resolve(repoRoot, path)), path).toBe(true);
      expect(isScanned(path), path).toBe(false);
      expect(reason.length).toBeGreaterThan(0);
    }
  });

  it("finds no database import and no DATABASE_URL read anywhere in the seam", () => {
    const seam = spec006Files().filter(isScanned);
    expect(seam.length).toBeGreaterThan(20);
    expect(findDatabaseImports(repoRoot, seam)).toEqual([]);
    expect(findDatabaseUrlReads(repoRoot, seam)).toEqual([]);
  });

  it("would report one if it appeared (the scanner is live over a seam path)", () => {
    const root = mkdtempSync(join(tmpdir(), "fo-seam-"));
    try {
      writeFileSync(
        join(root, "watermark.ts"),
        'import postgres from "postgres";\n',
      );
      expect(
        findDatabaseImports(root, ["watermark.ts"]).map((hit) => hit.banned),
      ).toEqual(["postgres"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("seed:check and media:variants --check need no database and no network (AC-1)", () => {
  const scratch = mkdtempSync(join(tmpdir(), "fo-offline-"));
  const preload = join(scratch, "offline.mjs");
  const REFUSED = "network refused (spec 006 AC-1 seam test)";
  writeFileSync(
    preload,
    `import dns from "node:dns";
import net from "node:net";
const refuse = () => { throw new Error(${JSON.stringify(REFUSED)}); };
net.Socket.prototype.connect = refuse;
dns.lookup = refuse;
dns.promises.lookup = refuse;
globalThis.fetch = async () => refuse();
`,
  );

  afterAll(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  /** `process.env` with every database key removed: unset, not blank. */
  function offlineEnv(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const key of Object.keys(env)) {
      if (key.startsWith("DATABASE_URL") || key === "DATABASE_BUILD_URL") {
        delete env[key];
      }
    }
    return env;
  }

  function runOffline(args: readonly string[]) {
    return spawnSync(process.execPath, ["--import", preload, ...args], {
      cwd: repoRoot,
      env: offlineEnv(),
      encoding: "utf8",
      timeout: 60_000,
    });
  }

  it("arms the guard: a request from the same preload fails", () => {
    const fetched = runOffline([
      "--input-type=module",
      "-e",
      'await fetch("https://example.com/");',
    ]);
    expect(fetched.status).not.toBe(0);
    expect(fetched.stderr).toContain(REFUSED);

    // An IP literal, so the socket guard is reached without the DNS guard in front of it.
    const socket = runOffline([
      "-e",
      'require("node:net").connect(9, "127.0.0.1");',
    ]);
    expect(socket.status).not.toBe(0);
    expect(socket.stderr).toContain(REFUSED);

    const lookup = runOffline([
      "-e",
      'require("node:dns").lookup("example.com", () => undefined);',
    ]);
    expect(lookup.status).not.toBe(0);
    expect(lookup.stderr).toContain(REFUSED);

    const unset = runOffline([
      "-e",
      'process.exit(Object.keys(process.env).some((k) => k.startsWith("DATABASE_URL")) ? 1 : 0);',
    ]);
    expect(unset.status).toBe(0);
  });

  it("runs `pnpm seed:check` green", () => {
    const run = runOffline(["seed/check.ts"]);
    expect(run.stderr).not.toContain(REFUSED);
    expect(run.status, run.stdout + run.stderr).toBe(0);
  });

  it("runs `pnpm media:variants --check` green", () => {
    const run = runOffline(["seed/media-variants.ts", "--check"]);
    expect(run.stderr).not.toContain(REFUSED);
    expect(run.status, run.stdout + run.stderr).toBe(0);
    expect(run.stdout).toContain("manifest clean");
  });
});

describe("pnpm test and pnpm build are configured to run without a database (AC-1)", () => {
  interface Step {
    readonly run?: string;
    readonly env?: Record<string, string>;
  }
  interface Job {
    readonly env?: Record<string, string>;
    readonly services?: Record<string, unknown>;
    readonly steps: readonly Step[];
  }
  const ci = parse(
    readFileSync(resolve(repoRoot, ".github/workflows/ci.yml"), "utf8"),
  ) as { jobs: Record<string, Job> };

  it("runs the unit suite with no database key, no database service and no copied env file", () => {
    const job = ci.jobs["test-unit"];
    expect(job).toBeDefined();
    expect(job?.services).toBeUndefined();
    const keys = [
      ...Object.keys(job?.env ?? {}),
      ...(job?.steps ?? []).flatMap((step) => Object.keys(step.env ?? {})),
    ];
    expect(keys.filter((key) => key.startsWith("DATABASE"))).toEqual([]);
    for (const step of job?.steps ?? []) {
      expect(step.run ?? "").not.toMatch(/\.env/u);
      expect(step.run ?? "").not.toContain("DATABASE");
    }
  });

  it('refuses every unhandled request in the unit project (MSW `onUnhandledRequest: "error"`)', () => {
    const config = readFileSync(resolve(repoRoot, "vitest.config.ts"), "utf8");
    expect(config).toContain('setupFiles: ["tests/msw/setup.ts"]');
    const setup = readFileSync(resolve(repoRoot, "tests/msw/setup.ts"), "utf8");
    expect(setup).toContain('server.listen({ onUnhandledRequest: "error" })');
  });

  it("builds the image with no DATABASE_URL in the environment and none as a build argument", () => {
    const steps = ci.jobs["container"]?.steps ?? [];
    const build = steps.find((step) =>
      (step.run ?? "").includes("docker build"),
    );
    expect(build?.run).toContain(
      "env | grep -qE '^(DATABASE_URL|DATABASE_URL_UNPOOLED|INTERNAL_CRON_SECRET|R2_)'",
    );
    const dockerfile = readFileSync(resolve(repoRoot, "Dockerfile"), "utf8");
    expect(dockerfile).not.toMatch(/^ARG DATABASE_URL\b/mu);
    expect(dockerfile).not.toMatch(/^ENV DATABASE_URL\b/mu);
  });
});
