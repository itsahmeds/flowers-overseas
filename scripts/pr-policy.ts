/**
 * PR policy (spec 001 §2 "CI", AC-19 / T-20, TASK-002).
 *
 * Pure rules for `.github/workflows/pr-policy.yml`, kept out of YAML so they are unit-tested
 * (`tests/unit/pr-policy.test.ts`). The workflow passes the PR facts through environment
 * variables and runs `node scripts/pr-policy.ts` (Node ≥ 24 strips types natively).
 *
 * Rules:
 *  - title must match TITLE_PATTERN (Conventional Commits header ending in `(TASK-NNN)`);
 *  - head branch must match BRANCH_PATTERN, or a dependency-bot branch prefix;
 *  - both checks are exempt for PRs authored by a dependency bot, and for PRs labelled
 *    `no-task` **only when** the author is the repository owner and no changed file lives
 *    under a guarded path (§13 Q5 default).
 */
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const TITLE_PATTERN =
  /^(feat|fix|chore|docs|refactor|test|perf|ci|build|revert)(\([a-z0-9-]+\))?: .+ \(TASK-\d{3,}\)$/;

export const BRANCH_PATTERN = /^task\/TASK-\d{3,}-[a-z0-9-]+$/;

/** Branch prefixes used by dependency bots; allowed as head branches. */
export const BOT_BRANCH_PREFIXES = ["renovate/", "dependabot/"] as const;

/** Logins of dependency bots whose PRs cannot carry a task ID. */
export const BOT_LOGINS = new Set([
  "renovate[bot]",
  "dependabot[bot]",
  "github-actions[bot]",
]);

export const NO_TASK_LABEL = "no-task";

/** Paths where application code lives; a `no-task` PR may not touch them. */
export const GUARDED_PATHS = [
  "src/",
  "tests/",
  "db/",
  "seed/",
  "emails/",
] as const;

export interface PullRequestFacts {
  title: string;
  headRef: string;
  authorLogin: string;
  /** GitHub `user.type`: "User" | "Bot" | "Organization". */
  authorType: string;
  repositoryOwner: string;
  labels: readonly string[];
  changedFiles: readonly string[];
}

export interface PolicyResult {
  ok: boolean;
  /** Why the checks were skipped, when they were. */
  exemption?: string;
  errors: string[];
}

export function isBotAuthor(facts: PullRequestFacts): boolean {
  return facts.authorType === "Bot" || BOT_LOGINS.has(facts.authorLogin);
}

export function guardedFiles(files: readonly string[]): string[] {
  return files.filter((f) => GUARDED_PATHS.some((p) => f.startsWith(p)));
}

export function titleErrors(title: string): string[] {
  if (TITLE_PATTERN.test(title)) return [];
  return [
    `PR title "${title}" must match "<type>(<scope>): <summary> (TASK-NNN)", e.g. ` +
      `"feat(core): scaffold (TASK-001)". Allowed types: feat, fix, chore, docs, refactor, ` +
      `test, perf, ci, build, revert. Pattern: ${TITLE_PATTERN.source}`,
  ];
}

export function branchErrors(headRef: string): string[] {
  if (BRANCH_PATTERN.test(headRef)) return [];
  if (BOT_BRANCH_PREFIXES.some((p) => headRef.startsWith(p))) return [];
  return [
    `Head branch "${headRef}" must match "task/TASK-NNN-<slug>", e.g. ` +
      `"task/TASK-001-scaffold" (lowercase letters, digits and hyphens). ` +
      `Pattern: ${BRANCH_PATTERN.source}`,
  ];
}

export function evaluate(facts: PullRequestFacts): PolicyResult {
  if (isBotAuthor(facts)) {
    return {
      ok: true,
      exemption: `author "${facts.authorLogin}" is a dependency bot`,
      errors: [],
    };
  }

  if (facts.labels.includes(NO_TASK_LABEL)) {
    const errors: string[] = [];
    if (facts.authorLogin !== facts.repositoryOwner) {
      errors.push(
        `Label "${NO_TASK_LABEL}" is only honoured when the PR author is the repository ` +
          `owner ("${facts.repositoryOwner}"); author is "${facts.authorLogin}".`,
      );
    }
    const guarded = guardedFiles(facts.changedFiles);
    if (guarded.length > 0) {
      errors.push(
        `Label "${NO_TASK_LABEL}" is only honoured when no file under ` +
          `${GUARDED_PATHS.join(" ")} changes; this PR touches: ${guarded.join(", ")}. ` +
          `Remove the label and add a task ID (TASK-NNN) to the title and branch.`,
      );
    }
    if (errors.length === 0) {
      return {
        ok: true,
        exemption: `label "${NO_TASK_LABEL}" by repository owner, no guarded path touched`,
        errors: [],
      };
    }
    return {
      ok: false,
      errors: [
        ...errors,
        ...titleErrors(facts.title),
        ...branchErrors(facts.headRef),
      ],
    };
  }

  const errors = [...titleErrors(facts.title), ...branchErrors(facts.headRef)];
  return { ok: errors.length === 0, errors };
}

function splitList(value: string | undefined): string[] {
  return (value ?? "")
    .split(/\r?\n|,/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function factsFromEnv(
  env: Readonly<Record<string, string | undefined>>,
): PullRequestFacts {
  return {
    title: env["PR_TITLE"] ?? "",
    headRef: env["PR_HEAD_REF"] ?? "",
    authorLogin: env["PR_AUTHOR_LOGIN"] ?? "",
    authorType: env["PR_AUTHOR_TYPE"] ?? "User",
    repositoryOwner: env["REPOSITORY_OWNER"] ?? "",
    labels: splitList(env["PR_LABELS"]),
    changedFiles: splitList(env["PR_CHANGED_FILES"]),
  };
}

const isMain =
  typeof process.argv[1] === "string" &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const result = evaluate(factsFromEnv(process.env));
  if (!result.ok) {
    for (const e of result.errors) process.stderr.write(`::error::${e}\n`);
    process.exit(1);
  }
  process.stdout.write(
    result.exemption
      ? `pr-policy ok (exempt: ${result.exemption})\n`
      : "pr-policy ok: title and branch carry a task ID\n",
  );
}
