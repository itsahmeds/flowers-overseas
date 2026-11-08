/**
 * The pre-deploy migration step as the runtime image runs it (spec 002 §14
 * A-orchestrator-2026-11-08c, spec 040 §14 pointer; TASK-505).
 *
 * Railway runs `config/railway.json`'s `preDeployCommand` in the shipped image, which has no
 * repository `node_modules` and no Drizzle schema. These cases build the bundle the Dockerfile's
 * `migrate` stage builds, lay it out the way the runtime stage does (`/app/scripts/db-migrate.mjs`
 * beside `/app/db/migrations/`) in an empty temporary directory, and run it with `node` and an
 * environment holding nothing but `PATH`, the image's `NODE_ENV=production` and, where a case
 * needs it, `DATABASE_URL_UNPOOLED`. The
 * connected half (36 migrations applied, a re-run applying none, a broken file exiting 1) was run
 * by hand against a scratch Postgres 16 and is recorded in the PR.
 */
import { execFile } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { isBuiltin } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  type BundleReport,
  RUNTIME_PATH,
  bundleMigrationRunner,
} from "../../scripts/db-migrate-bundle.ts";
import { railwayConfigSchema } from "../../src/lib/railway.ts";

const run = promisify(execFile);
const repoRoot = resolve(import.meta.dirname, "../..");
const dockerfile = readFileSync(resolve(repoRoot, "Dockerfile"), "utf8");
const migrateStage = dockerfile.slice(
  dockerfile.indexOf("AS migrate"),
  dockerfile.indexOf("AS build"),
);
const runtimeStage = dockerfile.slice(
  dockerfile.lastIndexOf("FROM node:24-slim"),
);

let image: string;
let report: BundleReport;

beforeAll(async () => {
  image = mkdtempSync(join(tmpdir(), "fo-migrate-image-"));
  report = await bundleMigrationRunner(repoRoot, join(image, RUNTIME_PATH));
  cpSync(resolve(repoRoot, "db/migrations"), join(image, "db/migrations"), {
    recursive: true,
    filter: (source) => !source.endsWith("README.md"),
  });
}, 60_000);

afterAll(() => {
  rmSync(image, { recursive: true, force: true });
});

/** Runs the bundle in the image layout with exactly `env`; resolves with the exit code and output. */
async function runInImage(
  env: Record<string, string>,
): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await run(process.execPath, [RUNTIME_PATH], {
      cwd: image,
      encoding: "utf8",
      // `NODE_ENV=production` is what the runtime stage sets (`ENV NODE_ENV=production`).
      env: { PATH: process.env["PATH"] ?? "", NODE_ENV: "production", ...env },
    });
    return { code: 0, stdout, stderr };
  } catch (error: unknown) {
    const failed = error as { code: number; stdout: string; stderr: string };
    return { code: failed.code, stdout: failed.stdout, stderr: failed.stderr };
  }
}

describe("the bundle the runtime image carries", () => {
  it("imports Node built-ins only, so it runs with no node_modules beside it", () => {
    expect(report.external.length).toBeGreaterThan(0);
    for (const imported of report.external) {
      expect(isBuiltin(imported), imported).toBe(true);
    }
  });

  it("is built from repository files the migrate stage copies, and none it does not", () => {
    expect(report.sources).toContain("scripts/db-migrate.ts");
    expect(report.sources).not.toContain("scripts/db-check.ts");
    for (const source of report.sources) {
      expect(migrateStage, source).toContain(source);
    }
  });

  it("fails closed, naming the key, when DATABASE_URL_UNPOOLED is not set", async () => {
    const result = await runInImage({});
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      "db:migrate: DATABASE_URL_UNPOOLED is missing",
    );
  });

  it("exits 1 on a database it cannot reach and never prints the password", async () => {
    const result = await runInImage({
      DATABASE_URL_UNPOOLED:
        "postgres://app_owner:pw-sentinel-505@127.0.0.1:1/flowers",
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("db:migrate:");
    expect(`${result.stdout}${result.stderr}`).not.toContain("pw-sentinel-505");
  });
});

describe("the Dockerfile and config/railway.json wiring", () => {
  it("runs the bundle as Railway's pre-deploy command, from the runtime path", () => {
    const declared = railwayConfigSchema.parse(
      JSON.parse(
        readFileSync(resolve(repoRoot, "config/railway.json"), "utf8"),
      ),
    );
    expect(declared.deploy.preDeployCommand).toEqual([`node ${RUNTIME_PATH}`]);
  });

  it("copies the bundle to that path and the migrations beside it in the runtime stage", () => {
    expect(runtimeStage).toContain(
      `COPY --from=migrate /app/dist/db-migrate.mjs ./${RUNTIME_PATH}`,
    );
    expect(runtimeStage).toMatch(/^COPY db\/migrations \.\/db\/migrations$/mu);
  });

  it("adds exactly those two copies to the standalone server's, and no node_modules", () => {
    const copies = runtimeStage
      .split("\n")
      .filter((line) => /^COPY\b/u.test(line))
      .map((line) => line.replace(/--chown=\S+ /u, ""));
    expect(copies).toEqual([
      "COPY --from=build /app/.next/standalone ./",
      "COPY --from=build /app/.next/static ./.next/static",
      "COPY --from=build /app/public ./public",
      `COPY --from=migrate /app/dist/db-migrate.mjs ./${RUNTIME_PATH}`,
      "COPY db/migrations ./db/migrations",
    ]);
  });

  it("builds the bundle in a stage that reads no build argument and sets no env", () => {
    expect(migrateStage).toContain(
      "RUN node scripts/db-migrate-bundle.ts dist/db-migrate.mjs",
    );
    expect(migrateStage).not.toMatch(/^\s*(ARG|ENV)\b/imu);
  });

  it("rejects a config/railway.json with no pre-deploy command", () => {
    const declared: unknown = JSON.parse(
      readFileSync(resolve(repoRoot, "config/railway.json"), "utf8"),
    );
    const { deploy } = declared as { deploy: Record<string, unknown> };
    const rest: Record<string, unknown> = { ...deploy };
    delete rest["preDeployCommand"];
    expect(
      railwayConfigSchema.safeParse({ ...(declared as object), deploy: rest })
        .success,
    ).toBe(false);
  });
});
