/**
 * The container and the Railway declaration (spec 040 §5.3, AC-8 / T-08, AC-9 / T-09; TASK-098).
 *
 * T-08 is an integration case: `docker build`, then `GET /api/health` against the running image,
 * `whoami`, and a listing proving no `.env*` is inside. A Docker daemon is not available in every
 * environment this repository is worked in (it was not available when this task was implemented),
 * so the *static* half of AC-8 — the facts that make the image correct, and that a wrong edit
 * would silently break — is asserted here from the files themselves, and the runtime half is
 * recorded in `docs/runbooks/railway-cloudflare-setup.md` as a founder step.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  RAILWAY_CONFIG_PATH,
  RAILWAY_REGION,
  WEB_SERVICE_NAME,
  railwayConfigSchema,
} from "../../src/lib/railway";

const repoRoot = resolve(__dirname, "../..");
const read = (relative: string): string =>
  readFileSync(resolve(repoRoot, relative), "utf8");

const dockerfile = read("Dockerfile");
const dockerignore = read(".dockerignore");
const nextConfig = read("next.config.ts");
const manifest = JSON.parse(read("package.json")) as {
  packageManager: string;
  scripts: Record<string, string>;
};

describe("next.config.ts (AC-8)", () => {
  it('sets output: "standalone", which is what `node server.js` needs', () => {
    expect(nextConfig).toContain('output: "standalone"');
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
