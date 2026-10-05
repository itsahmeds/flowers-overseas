/**
 * Whether the enforced Content-Security-Policy is actually being applied, as a value `/api/health`
 * can report (`/review 196` item 4; TASK-058, ADR-0020).
 *
 * The cache handler fails open: if it cannot build the per-document policy it serves the page
 * without an enforcing header rather than take the site down. Failing open is the right call for
 * availability, and wrong if nobody can tell. So the handler records what happened here, and the
 * health endpoint — which a scheduled check and the Railway healthcheck already read — reports it
 * as `cspEnforce`, and logs one `warn` line when it is `degraded`. The handler itself cannot log:
 * it runs outside the bundle, where `src/lib/logger.ts` and its PII scan are not importable.
 *
 * Same constraints as `src/lib/csp-response.ts`, because the handler imports this file too: Node
 * type stripping, erasable syntax, `.ts` specifiers, no alias, no app imports. The record lives on
 * `globalThis` because the handler (loaded by Next with a bare
 * `import()`) and the health route (compiled into the server bundle) are two module instances in
 * one process; a module-level variable would be two variables. It is a typed global
 * (`__flowersOverseasCspEnforce`), declared below.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { cspEnforced, staticPolicyFromRoutesManifest } from "./csp-response.ts";

/** What `/api/health` reports. No PII, no policy text, no path. */
export const CSP_ENFORCE_STATES = ["report-only", "ok", "degraded"] as const;
export type CspEnforceState = (typeof CSP_ENFORCE_STATES)[number];

export interface CspRuntimeRecord {
  /** `.next/server` as the handler was given it; set on the handler's first construction. */
  serverDistDir: string | undefined;
  /** Cached documents served without the enforcing header while enforcement was asked for. */
  failedOpen: number;
}

declare global {
  // One record per process, shared by the handler and the health route (see the header). A
  // typed global rather than a cast (`/review 196` round 2 nit 2); the long name is the
  // collision guard a registered symbol used to be.
  var __flowersOverseasCspEnforce: CspRuntimeRecord | undefined;
}

function record(): CspRuntimeRecord {
  globalThis.__flowersOverseasCspEnforce ??= {
    serverDistDir: undefined,
    failedOpen: 0,
  };
  return globalThis.__flowersOverseasCspEnforce;
}

const staticPolicies = new Map<string, string>();

/**
 * The static policy this build sends, read back from `routes-manifest.json` next to
 * `serverDistDir` and memoised per directory. A miss is not memoised: during `next build` the
 * manifest may not be written yet, and the run-time read is the one that matters.
 */
export function readStaticPolicy(
  serverDistDir: string | undefined,
): string | undefined {
  if (serverDistDir === undefined) return undefined;
  const known = staticPolicies.get(serverDistDir);
  if (known !== undefined) return known;
  let policy: string | undefined;
  try {
    policy = staticPolicyFromRoutesManifest(
      JSON.parse(
        readFileSync(
          path.join(serverDistDir, "..", "routes-manifest.json"),
          "utf8",
        ),
      ) as unknown,
    );
  } catch {
    policy = undefined;
  }
  if (policy !== undefined) staticPolicies.set(serverDistDir, policy);
  return policy;
}

/** The handler says where it reads from (every construction; the value never changes). */
export function noteCspHandler(serverDistDir: string | undefined): void {
  record().serverDistDir = serverDistDir;
}

/** The handler served a cached document unenforced although enforcement was asked for. */
export function noteCspFailedOpen(): void {
  record().failedOpen += 1;
}

/**
 * The state `/api/health` reports:
 *
 *  - `report-only` — `CSP_REPORT_ONLY` is not `"false"`; nothing is meant to enforce;
 *  - `degraded` — enforcement was asked for and the handler has failed open at least once since
 *    the process started, or the static policy cannot be read from the manifest right now;
 *  - `ok` — enforcement was asked for and the policy the handler stamps from is readable.
 *
 * `fallbackDistDir` is where to look when no handler has been constructed yet in this process
 * (`.next/server` under the working directory, which is where both `next start` and the
 * standalone `server.js` run).
 */
export function cspEnforceState(
  source: Readonly<Record<string, string | undefined>>,
  fallbackDistDir: string = path.join(process.cwd(), ".next", "server"),
): CspEnforceState {
  if (!cspEnforced(source)) return "report-only";
  const current = record();
  if (current.failedOpen > 0) return "degraded";
  return readStaticPolicy(current.serverDistDir ?? fallbackDistDir) ===
    undefined
    ? "degraded"
    : "ok";
}

/** Tests only: forget what this process has recorded. */
export function resetCspStateForTests(): void {
  const current = record();
  current.serverDistDir = undefined;
  current.failedOpen = 0;
  staticPolicies.clear();
}
