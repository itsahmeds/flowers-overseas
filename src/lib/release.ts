/**
 * The rules `release:status`, `release:promote` and `release:rollback` apply (spec 040 §14 A3,
 * AC-35, AC-36, AC-39; TASK-156), as pure functions over facts the CLI has already read from git,
 * from production's `/api/health` and from Railway. `scripts/release.ts` does the reading and the
 * one push; everything that decides lives here.
 *
 * The invariant: `release` always equals `origin/main` or is an ancestor of it. It moves forward
 * only to a gated commit already on `main` (promotion), and backward only to a commit production
 * has already run from `release`, or to the previous release the note that promoted the bad
 * commit records (rollback). Nothing is ever committed on it.
 */
import { z } from "zod";

import {
  DEPLOYMENT_IN_PROGRESS,
  DEPLOYMENT_SUCCESS,
  type DeploymentFact,
  RELEASE_BRANCH,
} from "./railway.ts";

export { RELEASE_BRANCH };

/** The branch `release` must stay equal to or behind. */
export const MAIN_BRANCH = "main";

/** Production's health endpoint (AC-31's `commit`); `--health-url` overrides it. */
export const PRODUCTION_HEALTH_URL = "https://flowersoverseas.com/api/health";

/** Where production release notes live on `main` (`.claude/agents/launch.md`). */
export const RELEASE_NOTES_DIR = "docs/releases";

/** A SHA argument: 7 to 40 lowercase hex digits, resolved to one full commit by git. */
export const SHA_ARGUMENT = /^[0-9a-f]{7,40}$/;

/** A full SHA-1 commit id. */
export const FULL_SHA = /^[0-9a-f]{40}$/;

/** `/api/health`'s body, as far as this module reads it (spec 040 AC-31). */
export const healthCommitSchema = z.object({ commit: z.string().min(1) });

/**
 * `docs/releases/YYYY-MM-DD-<env>-<short-sha>.md`. The environment is read from the name, so a
 * staging note is never taken for a production one.
 */
const NOTE_NAME =
  /^(\d{4}-\d{2}-\d{2})-([a-z][a-z0-9-]*?)-([0-9a-f]{7,40})\.md$/;

/** AC-37's visit-1 report: `RELEASE: READY <40-char sha> (release at <sha>)`. */
const READY_LINE =
  /RELEASE: READY ([0-9a-f]{40}) \(release at ([0-9a-f]{7,40})\)/g;

/** AC-37's halt: `RELEASE: HALTED <sha>: <gate>`. */
const HALTED_LINE = /RELEASE: HALTED ([0-9a-f]{7,40})/g;

/** AC-37's visit-2 report: `RELEASE: PROMOTED <sha>`. */
const PROMOTED_LINE = /RELEASE: PROMOTED ([0-9a-f]{7,40})/g;

export interface ReleaseNote {
  readonly file: string;
  readonly environment: string | undefined;
  /** Every READY report: the gated commit and the release it was promoted over. */
  readonly ready: readonly { sha: string; previous: string }[];
  /** Every commit a HALTED report names. */
  readonly halted: readonly string[];
  /** Every commit a PROMOTED report names. */
  readonly promoted: readonly string[];
}

export function parseReleaseNote(file: string, text: string): ReleaseNote {
  const name = NOTE_NAME.exec(file.split("/").pop() ?? "");
  return {
    file,
    environment: name?.[2],
    ready: [...text.matchAll(READY_LINE)].map((match) => ({
      sha: match[1] ?? "",
      previous: match[2] ?? "",
    })),
    halted: [...text.matchAll(HALTED_LINE)].map((match) => match[1] ?? ""),
    promoted: [...text.matchAll(PROMOTED_LINE)].map((match) => match[1] ?? ""),
  };
}

export interface PromotingNote {
  readonly file: string;
  /** The `(release at <sha>)` value, as written: the caller resolves it to a full SHA. */
  readonly previous: string;
}

/**
 * Route (b)'s source: the **production** note that reported `READY <bad>` and did not halt on
 * it before promoting it. A note that reports `PROMOTED <bad>` still counts when it later marks
 * `<bad>` HALTED (the watch halting a promoted release is exactly when a rollback runs); a note
 * that halted on `<bad>` without promoting it promoted nothing and never counts, and neither does
 * an older note's previous release. When several notes promoted the same commit (it was rolled
 * back and promoted again), the newest by file name wins.
 */
export function findPromotingNote(
  notes: readonly ReleaseNote[],
  badSha: string,
): PromotingNote | undefined {
  const candidates = notes
    .filter((note) => note.environment === "production")
    .filter((note) => !haltedBeforePromoting(note, badSha))
    .flatMap((note) =>
      note.ready
        .filter((ready) => ready.sha === badSha)
        .map((ready) => ({ file: note.file, previous: ready.previous })),
    )
    .sort((a, b) => b.file.localeCompare(a.file));
  return candidates[0];
}

function haltedBeforePromoting(note: ReleaseNote, badSha: string): boolean {
  const names = (sha: string) => sha.length > 0 && badSha.startsWith(sha);
  return note.halted.some(names) && !note.promoted.some(names);
}

/** What route (a) found for one commit among production `web`'s deployments. */
export type DeploymentFinding =
  | { readonly kind: "released"; readonly id: string }
  | { readonly kind: "branch-unknown"; readonly ids: readonly string[] }
  | { readonly kind: "other-branch"; readonly branches: readonly string[] }
  | { readonly kind: "unsuccessful"; readonly statuses: readonly string[] }
  | { readonly kind: "none" };

/**
 * AC-39 route (a): a deployment of `sha` whose status is `SUCCESS` **and** whose source branch is
 * `release`. A `SUCCESS` from `main` (before A3) never passed a gate; one with no branch cannot be
 * told apart from it; any other status (`FAILED`, `CRASHED`, and `REMOVED`, which says a
 * deployment was replaced but not whether it ever succeeded) is not a success.
 */
export function judgeDeployments(
  facts: readonly DeploymentFact[],
  sha: string,
): DeploymentFinding {
  const mine = facts.filter((fact) => fact.commit === sha);
  if (mine.length === 0) return { kind: "none" };
  const succeeded = mine.filter((fact) => fact.status === DEPLOYMENT_SUCCESS);
  if (succeeded.length === 0) {
    return {
      kind: "unsuccessful",
      statuses: [...new Set(mine.map((fact) => fact.status))].sort(),
    };
  }
  const released = succeeded.find((fact) => fact.branch === RELEASE_BRANCH);
  if (released !== undefined) return { kind: "released", id: released.id };
  const unknown = succeeded.filter((fact) => fact.branch === undefined);
  if (unknown.length > 0) {
    return { kind: "branch-unknown", ids: unknown.map((fact) => fact.id) };
  }
  return {
    kind: "other-branch",
    branches: [...new Set(succeeded.map((fact) => fact.branch ?? ""))].sort(),
  };
}

/** Route (a)'s finding in words, for the refusal that names both routes. */
export function describeFinding(
  finding: DeploymentFinding,
  sha: string,
): string {
  switch (finding.kind) {
    case "released":
      return `Railway lists a successful production web deployment of ${sha} made from ${RELEASE_BRANCH} (deployment ${finding.id})`;
    case "branch-unknown":
      return `Railway lists a successful production web deployment of ${sha} (deployment ${finding.ids.join(", ")}) whose response names no source branch: source branch unknown, so it does not count`;
    case "other-branch":
      return `Railway's successful production web deployments of ${sha} were made from ${finding.branches.join(", ")}, not ${RELEASE_BRANCH}, and never passed a gate`;
    case "unsuccessful":
      return `Railway lists no successful production web deployment of ${sha} (only ${finding.statuses.join(", ")})`;
    case "none":
      return `Railway lists no production web deployment of ${sha}`;
  }
}

/** AC-35: is a production deployment of `sha` queued, building or deploying? */
export function deploymentInProgress(
  facts: readonly DeploymentFact[],
  sha: string,
): DeploymentFact | undefined {
  return facts.find(
    (fact) =>
      fact.commit === sha && DEPLOYMENT_IN_PROGRESS.includes(fact.status),
  );
}

/** AC-35's broken-invariant line. */
export function brokenInvariantLine(commitsNotOnMain: number): string {
  return `invariant: BROKEN (release has ${String(commitsNotOnMain)} commits not on main)`;
}

/** AC-35's mismatch line. */
export function productionMismatchLine(
  production: string,
  release: string,
): string {
  return `production runs ${production}, release is ${release}`;
}
