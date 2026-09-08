/**
 * `pnpm branch-protection` — AC-21 / T-22 (spec 001 §2 "Branch protection", §12 note (a);
 * TASK-011).
 *
 * Branch protection is a *repository setting*, not code: the founder applies it and this script
 * is the only thing that can say whether what is applied matches what the spec asked for. It
 * never changes a setting. Two modes:
 *
 *   pnpm branch-protection                    # --verify (default): read the settings, assert, exit
 *   pnpm branch-protection --print-commands   # the exact `gh` commands that apply them
 *
 * The required-check list is **derived from `.github/workflows/ci.yml` and
 * `.github/workflows/pr-policy.yml`**, never typed out here, so a job added by a later spec is
 * automatically part of the contract and `--verify` turns red until protection is updated. That
 * is the whole point of AC-21: `ci.yml` "exposes exactly the job names listed in §2" *and* each is
 * required.
 *
 * One documented exclusion: `lighthouse`. Spec 001 §13 Q4 makes it informational until spec 004
 * ships the design system, and the job carries `continue-on-error: true`. A `continue-on-error`
 * job still reports its own check as failed, so requiring it would block every merge for a reason
 * the spec explicitly says not to block on. This script reads `continue-on-error` from the
 * workflow rather than hard-coding the job name: when spec 004 removes the flag, `lighthouse`
 * becomes required with no change here.
 *
 * §12 note (a) is the reason this is a verifier and not a setup step: required-check *names* can
 * only be selected after a run has registered them, so the founder configures protection after
 * the first green run.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";
import { z } from "zod";

export const OWNER = "itsahmeds";
export const REPO = "flowers-overseas";
export const BRANCH = "main";
/**
 * **Deviation from spec 001 §2 "Branch protection" ("one approving review"), recorded for
 * TASK-012 to correct in the spec text.** GitHub does not let a pull-request author approve their
 * own pull request. With one human on the project and `CODEOWNERS = * @itsahmeds`, requiring one
 * approving review would make every pull request unmergeable — including the ones that add the
 * second contributor. The gate the spec is really asking for is the `/review` verdict, which
 * `CLAUDE.md`'s definition of done already requires to be recorded in the PR and in `TASKS.md`.
 *
 * So: `required_approving_review_count: 0`, `require_code_owner_reviews: false`, and the reviewer
 * agent's recorded PASS is the review gate. Raise this to 1 the day a second person can approve.
 */
export const REQUIRED_APPROVING_REVIEW_COUNT = 0;

/**
 * A workflow, narrowed to what the check-name contract needs. `name` on a job is what appears as
 * the status-check name; without it GitHub uses the job *key*, so the fallback matters.
 */
const Workflow = z.object({
  jobs: z.record(
    z.string(),
    z
      .object({
        name: z.string().optional(),
        "continue-on-error": z.union([z.boolean(), z.string()]).optional(),
      })
      .loose(),
  ),
});

export interface WorkflowJob {
  /** The key under `jobs:`. */
  readonly key: string;
  /** The status-check name GitHub reports (`name:` if set, otherwise the key). */
  readonly checkName: string;
  /** True when the job carries `continue-on-error: true`. */
  readonly informational: boolean;
}

/** Parses a workflow's jobs. Pure, so the unit test can drive it from a fixture string. */
export function parseWorkflowJobs(yamlSource: string): WorkflowJob[] {
  const workflow = Workflow.parse(parse(yamlSource));
  return Object.entries(workflow.jobs).map(([key, job]) => ({
    key,
    checkName: job.name ?? key,
    informational:
      job["continue-on-error"] === true || job["continue-on-error"] === "true",
  }));
}

export interface CheckContract {
  readonly required: string[];
  /** Job names deliberately left out, with the reason, for the summary and the runbook. */
  readonly excluded: { readonly name: string; readonly reason: string }[];
}

/**
 * The status checks that must be required on `main`: every job of every workflow that gates a PR,
 * minus the informational ones.
 *
 * `preview`, `e2e`, `visual`, `a11y`, `commitlint` and `pr-policy` only run on `pull_request`.
 * They are required anyway and that is deliberate: a required check that never runs on a push to
 * `main` is exactly what stops a direct push, and every change is supposed to arrive by PR.
 */
export function checkContract(workflows: readonly string[]): CheckContract {
  const jobs = workflows.flatMap((source) => parseWorkflowJobs(source));
  const required: string[] = [];
  const excluded: { name: string; reason: string }[] = [];
  for (const job of jobs) {
    if (job.informational) {
      excluded.push({
        name: job.checkName,
        reason:
          "carries `continue-on-error: true` (spec 001 §13 Q4: informational until spec 004); " +
          "a continue-on-error job still reports a failed check, so requiring it would block " +
          "every merge",
      });
      continue;
    }
    required.push(job.checkName);
  }
  return { required: required.sort(), excluded };
}

/** Reads the two workflows that gate a PR. */
export function readWorkflows(repoRoot: string): string[] {
  return [".github/workflows/ci.yml", ".github/workflows/pr-policy.yml"].map(
    (relative) => readFileSync(resolve(repoRoot, relative), "utf8"),
  );
}

// --- the settings, as the API reports them ------------------------------------------------------

const Protection = z
  .object({
    required_status_checks: z
      .object({
        strict: z.boolean().optional(),
        contexts: z.array(z.string()).optional(),
        checks: z.array(z.object({ context: z.string() }).loose()).optional(),
      })
      .loose()
      .optional(),
    required_pull_request_reviews: z
      .object({
        required_approving_review_count: z.number().optional(),
        require_code_owner_reviews: z.boolean().optional(),
        dismiss_stale_reviews: z.boolean().optional(),
      })
      .loose()
      .optional(),
    required_linear_history: z
      .object({ enabled: z.boolean() })
      .loose()
      .optional(),
    allow_force_pushes: z.object({ enabled: z.boolean() }).loose().optional(),
    allow_deletions: z.object({ enabled: z.boolean() }).loose().optional(),
    required_conversation_resolution: z
      .object({ enabled: z.boolean() })
      .loose()
      .optional(),
  })
  .loose();

const RepoSettings = z
  .object({
    allow_squash_merge: z.boolean().optional(),
    allow_merge_commit: z.boolean().optional(),
    allow_rebase_merge: z.boolean().optional(),
    squash_merge_commit_title: z.string().optional(),
    delete_branch_on_merge: z.boolean().optional(),
  })
  .loose();

export type Protection = z.infer<typeof Protection>;
export type RepoSettings = z.infer<typeof RepoSettings>;

export interface Failure {
  readonly what: string;
  readonly expected: string;
  readonly actual: string;
}

/** The contexts a protection payload requires, from either shape the API returns. */
export function protectedContexts(protection: Protection): string[] {
  const fromChecks = protection.required_status_checks?.checks?.map(
    (check) => check.context,
  );
  const contexts =
    fromChecks ?? protection.required_status_checks?.contexts ?? [];
  return [...contexts].sort();
}

/**
 * Asserts the whole of AC-21 against the two API payloads. Pure and total: it returns every
 * failure it finds rather than throwing on the first, so one run tells the founder everything
 * that needs changing.
 */
export function verifyProtection(
  contract: CheckContract,
  protection: Protection,
  repo: RepoSettings,
): Failure[] {
  const failures: Failure[] = [];
  const contexts = protectedContexts(protection);

  const missing = contract.required.filter((name) => !contexts.includes(name));
  const extra = contexts.filter((name) => !contract.required.includes(name));
  if (missing.length > 0) {
    failures.push({
      what: "required status checks: missing",
      expected: contract.required.join(", "),
      actual: contexts.length === 0 ? "(none)" : contexts.join(", "),
    });
  }
  if (extra.length > 0) {
    // An extra context is not harmless: a required check that no workflow produces never
    // reports, and the PR waits for it forever.
    failures.push({
      what: "required status checks: not produced by any workflow",
      expected: contract.required.join(", "),
      actual: extra.join(", "),
    });
  }

  const reviews =
    protection.required_pull_request_reviews?.required_approving_review_count ??
    0;
  if (reviews !== REQUIRED_APPROVING_REVIEW_COUNT) {
    failures.push({
      what:
        "required_approving_review_count (spec 001 §2 says 1; recorded deviation — a solo " +
        "founder cannot approve their own PR, so the `/review` verdict is the gate)",
      expected: String(REQUIRED_APPROVING_REVIEW_COUNT),
      actual: String(reviews),
    });
  }
  if (
    protection.required_pull_request_reviews?.require_code_owner_reviews ===
    true
  ) {
    failures.push({
      what: "require_code_owner_reviews (same reason: the only code owner is the PR author)",
      expected: "false",
      actual: "true",
    });
  }

  // The review signals that do exist must not be stale, and an unresolved reviewer comment must
  // not be merged past: with `required_approving_review_count: 0` these two are what is left of
  // the human half of the gate, so the verifier asserts them rather than trusting the apply step.
  if (
    protection.required_pull_request_reviews?.dismiss_stale_reviews !== true
  ) {
    failures.push({
      what: "dismiss_stale_reviews (a review of an older head is not a review of this one)",
      expected: "true",
      actual: String(
        protection.required_pull_request_reviews?.dismiss_stale_reviews ??
          false,
      ),
    });
  }

  if (protection.required_conversation_resolution?.enabled !== true) {
    failures.push({
      what: "required_conversation_resolution",
      expected: "true",
      actual: String(
        protection.required_conversation_resolution?.enabled ?? false,
      ),
    });
  }

  if (protection.required_linear_history?.enabled !== true) {
    failures.push({
      what: "required_linear_history",
      expected: "true",
      actual: String(protection.required_linear_history?.enabled ?? false),
    });
  }

  if (protection.allow_force_pushes?.enabled !== false) {
    failures.push({
      what: "allow_force_pushes",
      expected: "false",
      actual: String(protection.allow_force_pushes?.enabled ?? true),
    });
  }

  const mergeExpectations: [keyof RepoSettings, boolean | string][] = [
    ["allow_squash_merge", true],
    ["allow_merge_commit", false],
    ["allow_rebase_merge", false],
    ["squash_merge_commit_title", "PR_TITLE"],
    // The last clause of the §3 `gh repo edit` call: a merged task branch should not linger, and
    // `pr-policy` derives the task id from the branch name, so stale `task/TASK-NNN-*` branches
    // are a source of confusion rather than history.
    ["delete_branch_on_merge", true],
  ];
  for (const [key, expected] of mergeExpectations) {
    const actual = repo[key];
    if (actual !== expected) {
      failures.push({
        what: `repository setting ${key}`,
        expected: String(expected),
        actual: actual === undefined ? "(absent)" : String(actual),
      });
    }
  }

  return failures;
}

// --- the commands that apply it -----------------------------------------------------------------

/**
 * The exact commands the founder runs. Printed rather than executed: an implementer changing
 * repository settings is out of scope (and the token in CI cannot).
 */
export function applyCommands(contract: CheckContract): string {
  const body = {
    required_status_checks: {
      // `strict: false`: with linear history and squash merges, requiring every PR to be
      // rebased onto the newest `main` before merging serialises a solo founder's queue for no
      // safety gain. Turn it on when more than one person merges.
      strict: false,
      contexts: contract.required,
    },
    enforce_admins: false,
    required_pull_request_reviews: {
      required_approving_review_count: REQUIRED_APPROVING_REVIEW_COUNT,
      require_code_owner_reviews: false,
      dismiss_stale_reviews: true,
    },
    restrictions: null,
    required_linear_history: true,
    allow_force_pushes: false,
    allow_deletions: false,
    block_creations: false,
    required_conversation_resolution: true,
  };
  return [
    "# 1. Branch protection on `main` (requires GitHub Pro on a private repository).",
    `gh api -X PUT repos/${OWNER}/${REPO}/branches/${BRANCH}/protection \\`,
    "  -H 'Accept: application/vnd.github+json' \\",
    `  --input - <<'JSON'`,
    JSON.stringify(body, null, 2),
    "JSON",
    "",
    "# 2. Merge method and squash-commit subject (repository settings, any plan).",
    `gh repo edit ${OWNER}/${REPO} \\`,
    "  --enable-squash-merge \\",
    "  --enable-merge-commit=false \\",
    "  --enable-rebase-merge=false \\",
    "  --squash-merge-commit-title=PR_TITLE \\",
    "  --squash-merge-commit-message=COMMIT_MESSAGES \\",
    "  --delete-branch-on-merge",
    "",
    "# 3. Verify (this is what CI and the reviewer run):",
    "pnpm branch-protection --verify",
  ].join("\n");
}

// --- reading the settings -----------------------------------------------------------------------

export interface GhResult {
  readonly ok: boolean;
  readonly status: number;
  readonly body: string;
}

/** `gh api <path>`, capturing the failure body instead of throwing. */
export function ghApi(path: string): GhResult {
  try {
    return {
      ok: true,
      status: 0,
      body: execFileSync("gh", ["api", path], { encoding: "utf8" }),
    };
  } catch (error) {
    const failure = error as {
      status?: number;
      stdout?: string;
      stderr?: string;
    };
    return {
      ok: false,
      status: failure.status ?? 1,
      body: `${failure.stdout ?? ""}${failure.stderr ?? ""}`,
    };
  }
}

export type Availability =
  | { readonly kind: "available" }
  /** 404: the endpoint works, the branch simply has no protection yet. */
  | { readonly kind: "unset" }
  /** 403 "Upgrade to GitHub Pro": the plan does not offer the feature at all. */
  | { readonly kind: "unavailable-on-plan" }
  | { readonly kind: "error"; readonly detail: string };

/**
 * Distinguishes "not configured" from "cannot be configured on this plan". The difference decides
 * whether the founder has an action or a purchasing decision, so the verifier must not blur it.
 */
export function classifyProtectionResponse(result: GhResult): Availability {
  if (result.ok) return { kind: "available" };
  const body = result.body;
  if (/upgrade to github pro|make this repository public/i.test(body)) {
    return { kind: "unavailable-on-plan" };
  }
  if (/branch not protected|not found/i.test(body)) return { kind: "unset" };
  return { kind: "error", detail: body.trim() };
}

export const PLAN_MESSAGE = [
  "branch-protection: UNAVAILABLE ON THIS PLAN.",
  "",
  `GitHub answered 403 "Upgrade to GitHub Pro or make this repository public to enable this`,
  `feature." for repos/${OWNER}/${REPO}/branches/${BRANCH}/protection. Branch protection and`,
  "rulesets are not offered for private repositories on GitHub Free, so AC-21 cannot be",
  "satisfied as written until one of the following happens:",
  "",
  "  1. Upgrade the account to GitHub Pro (~$4/month) and run",
  "     `pnpm branch-protection --print-commands`. This is the recommended option: it is the",
  "     only one that keeps the repository private (spec 001 §13 Q1) and enforces the gate.",
  "  2. Make the repository public — rejected: §13 Q1 decided private.",
  "  3. Accept unenforced protection as a recorded deviation, with the `/review` verdict and",
  "     `TASKS.md` as the only gate. Every check still runs on every PR and is visible; nothing",
  "     mechanically stops a merge past a red one.",
  "",
  "See docs/runbooks/branch-protection.md. Exiting non-zero: an unenforced gate must not read as",
  "a pass.",
].join("\n");

function verifyMode(repoRoot: string): number {
  const contract = checkContract(readWorkflows(repoRoot));
  const protectionResult = ghApi(
    `repos/${OWNER}/${REPO}/branches/${BRANCH}/protection`,
  );
  const availability = classifyProtectionResponse(protectionResult);

  console.log(
    `branch-protection: ${String(contract.required.length)} check(s) required by the workflows:`,
  );
  for (const name of contract.required) console.log(`  - ${name}`);
  for (const exclusion of contract.excluded) {
    console.log(`  ! ${exclusion.name} excluded — ${exclusion.reason}`);
  }
  console.log("");

  if (availability.kind === "unavailable-on-plan") {
    console.error(PLAN_MESSAGE);
    return 1;
  }
  if (availability.kind === "unset") {
    console.error(
      `branch-protection: NOT CONFIGURED. \`${BRANCH}\` has no protection yet (GitHub answered\n` +
        '404 "Branch not protected"). Apply it with `pnpm branch-protection --print-commands`\n' +
        "(spec 001 §12 note (a): after the first green run). Exiting non-zero.",
    );
    return 1;
  }
  if (availability.kind === "error") {
    console.error(
      `branch-protection: could not read the settings.\n${availability.detail}`,
    );
    return 1;
  }

  const protection = Protection.parse(JSON.parse(protectionResult.body));
  const repoResult = ghApi(`repos/${OWNER}/${REPO}`);
  if (!repoResult.ok) {
    console.error(
      `branch-protection: could not read the repository settings.\n${repoResult.body}`,
    );
    return 1;
  }
  const repo = RepoSettings.parse(JSON.parse(repoResult.body));

  const failures = verifyProtection(contract, protection, repo);
  if (failures.length === 0) {
    console.log("branch-protection: OK — every assertion of AC-21 holds.");
    return 0;
  }
  console.error(`branch-protection: ${String(failures.length)} problem(s):`);
  for (const failure of failures) {
    console.error(
      `  - ${failure.what}\n      expected: ${failure.expected}\n      actual:   ${failure.actual}`,
    );
  }
  console.error("\nFix with `pnpm branch-protection --print-commands`.");
  return 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const mode = process.argv[2] ?? "--verify";
  if (mode === "--print-commands") {
    console.log(applyCommands(checkContract(readWorkflows(repoRoot))));
    process.exit(0);
  }
  if (mode !== "--verify") {
    console.error(
      `branch-protection: unknown mode "${mode}" (use --verify or --print-commands)`,
    );
    process.exit(2);
  }
  process.exit(verifyMode(repoRoot));
}
