/**
 * The container and the Railway declaration (spec 040 §5.3, AC-8 / T-08, AC-9 / T-09; TASK-098).
 *
 * T-08 is an integration case: `docker build`, then `GET /api/health` against the running image,
 * `whoami`, and a listing proving no `.env*` is inside. A Docker daemon is not available in every
 * environment this repository is worked in (it was not available when this task was implemented,
 * nor when TASK-135 fixed the build), so the *static* half of AC-8 — the facts that make the image
 * correct, and that a wrong edit would silently break — is asserted here from the files
 * themselves; the daemon half is the `container` job of `.github/workflows/ci.yml`, which builds
 * the image with an empty environment and curls `/api/health` out of the running container.
 *
 * The second half of this file is TASK-135's pin: the `Dockerfile`'s build-argument set and the
 * **build half of the env contract** are one fact, asserted against each other, so a key added to
 * `serverEnvSchema` cannot re-enter the build gate — and a credential cannot become a build
 * argument — without a red test (spec 001 §14 A17, spec 040 §14 A1).
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BUILD_ENV_KEYS,
  ENV_KEYS,
  hostPlatform,
  RUNTIME_ENV_KEYS,
  validateBuildEnv,
  validateRuntimeEnv,
} from "../../src/lib/env.schema";
import {
  RAILWAY_CONFIG_PATH,
  RAILWAY_REGION,
  WEB_SERVICE_NAME,
  railwayConfigSchema,
} from "../../src/lib/railway";

// `server-only` is Next's build-time guard and has no runtime body; the health route reaches it
// through `@/lib/env`, which the runtime-gate cases below import.
vi.mock("server-only", () => ({}));

const repoRoot = resolve(__dirname, "../..");
const read = (relative: string): string =>
  readFileSync(resolve(repoRoot, relative), "utf8");

const dockerfile = read("Dockerfile");
const dockerignore = read(".dockerignore");
const nextConfig = read("next.config.ts");
const instrumentation = read("instrumentation.ts");
const healthRoute = read("src/app/api/health/route.ts");
const workflow = read(".github/workflows/ci.yml");

/** The `build` stage of the image — the only stage that may declare a build argument. */
const buildStage = dockerfile.slice(
  dockerfile.indexOf("AS build"),
  dockerfile.lastIndexOf("FROM node:24-slim"),
);

/** Every `ARG` the image declares, in declaration order. */
const declaredArgs = [...dockerfile.matchAll(/^ARG\s+([A-Za-z0-9_]+)/gmu)].map(
  (match) => match[1],
);

/**
 * What `docker build` sees with **no** credentials in the environment: the `ARG` defaults of the
 * build stage and nothing else. This is the environment the 2026-09-18 Railway build had, minus
 * the `APP_ENV=staging` Railway passed in.
 */
const credentialFreeBuildEnv: Record<string, string> = {
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
};

/** The same build, on Railway staging: `APP_ENV` and the public values arrive, secrets do not. */
const stagingBuildEnv: Record<string, string> = {
  APP_ENV: "staging",
  NEXT_PUBLIC_APP_ENV: "staging",
  NEXT_PUBLIC_SITE_URL: "https://web-staging-dbe4.up.railway.app",
};
const manifest = JSON.parse(read("package.json")) as {
  packageManager: string;
  scripts: Record<string, string>;
};

describe("next.config.ts (AC-8)", () => {
  it("emits standalone output off Vercel, which is what `node server.js` needs", () => {
    // Pinned as the *branch*, not a literal call: `output: "standalone"` unconditionally is the
    // defect spec 040 §14 A2 records, and a bare substring match passes on either shape.
    expect(nextConfig).toMatch(
      /\.\.\.\(platform === "vercel" \? \{\} : \{ output: "standalone" as const \}\)/u,
    );
    expect(nextConfig).not.toMatch(/^\s*output: "standalone",\s*$/mu);
  });
});

describe("Dockerfile (AC-8)", () => {
  it("builds and runs on Node 24, the version package.json#engines pins", () => {
    const bases = [...dockerfile.matchAll(/^FROM\s+(\S+)/gmu)].map(
      (match) => match[1],
    );
    expect(bases.length).toBeGreaterThanOrEqual(2);
    for (const base of bases) expect(base).toBe("node:24-slim");
  });

  it("pins pnpm through corepack rather than installing a floating version", () => {
    expect(dockerfile).toContain("corepack enable");
    expect(dockerfile).toContain("pnpm install --frozen-lockfile");
    expect(manifest.packageManager).toMatch(/^pnpm@/u);
  });

  it("runs as a non-root user", () => {
    const users = [...dockerfile.matchAll(/^USER\s+(\S+)/gmu)].map(
      (match) => match[1],
    );
    expect(users).toEqual(["node"]);
    expect(users).not.toContain("root");
  });

  it("copies the standalone output only — no development node_modules tree", () => {
    const runtime = dockerfile.slice(
      dockerfile.lastIndexOf("FROM node:24-slim"),
    );
    for (const copied of [
      "/app/.next/standalone",
      "/app/.next/static",
      "/app/public",
    ]) {
      expect(runtime, copied).toContain(copied);
    }
    expect(runtime).not.toMatch(/COPY[^\n]*node_modules/u);
    expect(runtime).toContain('CMD ["node", "server.js"]');
    expect(runtime).toContain("EXPOSE 3000");
  });

  it("copies no .env file into any stage, and the context excludes every one", () => {
    expect(dockerfile).not.toMatch(/COPY[^\n]*\.env/u);
    for (const pattern of [".env", ".env.*", ".env.example"]) {
      expect(dockerignore.split("\n"), pattern).toContain(pattern);
    }
    // A negation would put `.env.example` back into the build context.
    expect(dockerignore).not.toMatch(/^!\.env/mu);
  });
});

describe("build-time env contract (AC-8; spec 001 §14 A17, TASK-135)", () => {
  it("declares a build argument for exactly the keys the build consumes", () => {
    expect([...declaredArgs].sort()).toEqual([...BUILD_ENV_KEYS].sort());
  });

  it("declares every build argument in the build stage, never in the runtime stage", () => {
    const inBuildStage = [
      ...buildStage.matchAll(/^ARG\s+([A-Za-z0-9_]+)/gmu),
    ].map((match) => match[1]);
    expect(inBuildStage).toEqual(declaredArgs);
  });

  it("makes no server-only key a build argument: a secret must not enter layer history", () => {
    for (const key of RUNTIME_ENV_KEYS) {
      expect(declaredArgs, key).not.toContain(key);
      expect(dockerfile, key).not.toMatch(
        new RegExp(`^(ARG|ENV)\\s+${key}\\b`, "mu"),
      );
    }
  });

  it("partitions the contract: every key is graded by exactly one of the two gates", () => {
    expect([...BUILD_ENV_KEYS, ...RUNTIME_ENV_KEYS].sort()).toEqual([
      ...ENV_KEYS,
    ]);
    for (const key of BUILD_ENV_KEYS)
      expect(RUNTIME_ENV_KEYS, key).not.toContain(key);
  });

  it("runs the build half from next.config.ts and the runtime half at server start", () => {
    expect(nextConfig).toContain("assertBuildEnv()");
    // The whole-contract assertion must not be what a build runs (the defect of 2026-09-18).
    expect(nextConfig).not.toMatch(/(?<!Build)assertEnv\(\)/u);
    expect(instrumentation).toContain("assertRuntimeEnv(process.env)");
    expect(healthRoute).toContain("assertRuntimeEnv(process.env)");
  });

  /**
   * **The runtime half as behaviour, not as text** (TASK-143). The two `toContain` lines above
   * catch a deleted call and nothing else: `// assertRuntimeEnv(process.env)` or
   * `if (false) assertRuntimeEnv(process.env)` still contains the string. What spec 040 §14 A1
   * needs is that a server started without its credentials *fails*: `register()` throws at boot,
   * and `GET /api/health` — the Railway healthcheck target — throws so the response is a 500.
   * Both are called here with every key of `RUNTIME_ENV_KEYS` absent and must name
   * `DATABASE_URL`. The count is read off the constant, not written here: round 1's prose said
   * "ten", which is how many of them are *required*, while the list itself is longer.
   */
  describe(`with all ${String(RUNTIME_ENV_KEYS.length)} server-only keys absent`, () => {
    const saved = { ...process.env };
    const missing = (): void => {
      for (const key of RUNTIME_ENV_KEYS)
        Reflect.deleteProperty(process.env, key);
    };
    afterEach(() => {
      for (const key of Object.keys(process.env)) {
        if (!(key in saved)) Reflect.deleteProperty(process.env, key);
      }
      Object.assign(process.env, saved);
    });

    it("fails `register()` at server start, and not during `next build`", async () => {
      const { register } = await import("../../instrumentation.ts");
      missing();
      process.env["NEXT_RUNTIME"] = "nodejs";
      Reflect.deleteProperty(process.env, "NEXT_PHASE");
      await expect(register()).rejects.toThrow(/DATABASE_URL/u);
      // …and the same missing keys are no failure while `next build` collects page data, which
      // is the whole of spec 001 §14 A17: a build needs no credential.
      process.env["NEXT_PHASE"] = "phase-production-build";
      await expect(register()).resolves.toBeUndefined();
    });

    it("fails `GET /api/health`, so the healthcheck never passes", async () => {
      // `@/lib/env` parses the browser half at import, so the route is loaded under the staging
      // build environment — every key a build has — and every server-only key is then removed.
      Object.assign(process.env, stagingBuildEnv);
      const { GET } = await import("../../src/app/api/health/route.ts");
      missing();
      expect(() => GET(new Request("https://example.test/api/health"))).toThrow(
        /DATABASE_URL/u,
      );
    });
  });

  it("passes the build gate with no credential in the environment at all", () => {
    for (const source of [credentialFreeBuildEnv, stagingBuildEnv]) {
      expect(validateBuildEnv(source).issues).toEqual([]);
    }
  });

  it("names no server-only key in the build gate, whatever the environment", () => {
    for (const source of [{}, credentialFreeBuildEnv, stagingBuildEnv]) {
      const named = validateBuildEnv(source).issues.map((issue) => issue.key);
      expect(named.filter((key) => RUNTIME_ENV_KEYS.includes(key))).toEqual([]);
    }
  });

  it("still catches the ten keys, at server start, printing no value (the 2026-09-18 log)", () => {
    const named = validateRuntimeEnv(stagingBuildEnv).issues.map(
      (issue) => issue.key,
    );
    expect(named).toEqual([
      "DATABASE_URL",
      "DATABASE_URL_UNPOOLED",
      "R2_ACCOUNT_ID",
      "R2_BUCKET",
      "R2_BACKUPS_BUCKET",
      "R2_S3_ENDPOINT",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "R2_PUBLIC_BASE_URL",
      "INTERNAL_CRON_SECRET",
    ]);
    const report = JSON.stringify(validateRuntimeEnv(stagingBuildEnv).issues);
    expect(report).not.toContain(stagingBuildEnv["NEXT_PUBLIC_SITE_URL"]);
  });

  it("is proved by a CI job that builds the image with an empty environment", () => {
    expect(workflow).toMatch(/^ {2}container:$/mu);
    expect(workflow).toContain("docker build");
    expect(workflow).toContain("/api/health");
  });
});

describe(`${RAILWAY_CONFIG_PATH} (AC-9, T-09)`, () => {
  const declared = railwayConfigSchema.parse(
    JSON.parse(read(RAILWAY_CONFIG_PATH)),
  );

  it("declares the four §5.3 values of the web service", () => {
    expect(declared.deploy.region).toBe(RAILWAY_REGION);
    expect(declared.deploy.numReplicas).toBe(1);
    expect(declared.deploy.healthcheckPath).toBe("/api/health");
    expect(declared.deploy.restartPolicyType).toBe("ON_FAILURE");
    expect(declared.deploy.restartPolicyMaxRetries).toBe(10);
  });

  it("builds from the committed Dockerfile and starts the standalone server", () => {
    expect(declared.build.builder).toBe("DOCKERFILE");
    expect(declared.build.dockerfilePath).toBe("Dockerfile");
    expect(declared.deploy.startCommand).toBe("node server.js");
    expect(WEB_SERVICE_NAME).toBe("web");
  });

  it("rejects a declaration that raises the replica count past one (ADR-0018)", () => {
    const raised: unknown = {
      ...declared,
      deploy: { ...declared.deploy, numReplicas: 0 },
    };
    expect(railwayConfigSchema.safeParse(raised).success).toBe(false);
  });

  it("rejects a healthcheck path that is not a path and an unknown restart policy", () => {
    for (const deploy of [
      { ...declared.deploy, healthcheckPath: "api/health" },
      { ...declared.deploy, restartPolicyType: "SOMETIMES" },
    ]) {
      expect(
        railwayConfigSchema.safeParse({ ...declared, deploy }).success,
      ).toBe(false);
    }
  });

  it("is reachable through `pnpm railway:check`", () => {
    expect(manifest.scripts["railway:check"]).toBe(
      "node scripts/railway-check.ts",
    );
  });
});

describe("the standalone output is not emitted on Vercel (TASK-135)", () => {
  const configSource = readFileSync(join(repoRoot, "next.config.ts"), "utf8");

  it("branches the output shape on hostPlatform(), not unconditionally", () => {
    // TASK-098 shipped `output: "standalone"` unconditionally on the claim that Vercel ignores it.
    // Vercel's own tracer runs in `onBuildComplete` and reads `.next/next-server.js.nft.json`,
    // which standalone output does not leave there, so every deployment after `d0a1d66` failed
    // with ENOENT after generating all 31 pages.
    expect(configSource).toMatch(/platform === "vercel"/u);
    expect(configSource).toMatch(/output: "standalone" as const/);
    expect(configSource).not.toMatch(/^\s*output: "standalone",\s*$/m);
  });

  it("still emits standalone everywhere that is not Vercel, which is what the image runs", () => {
    expect(hostPlatform({})).toBe("local");
    expect(hostPlatform({ RAILWAY_ENVIRONMENT_NAME: "staging" })).toBe(
      "railway",
    );
    expect(hostPlatform({ VERCEL: "1" })).toBe("vercel");
  });
});
