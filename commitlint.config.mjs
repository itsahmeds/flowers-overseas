/**
 * commitlint config (spec 001 AC-20 / T-21, TASK-002).
 *
 * Commit messages follow Conventional Commits via `@commitlint/config-conventional`.
 * The `(TASK-NNN)` suffix is NOT required on individual commits: it is enforced on the
 * PR title by `.github/workflows/pr-policy.yml`, and `main` is squash-merged with the PR
 * title as the commit subject, so every commit on `main` carries a task ID while
 * docs/ledger commits and multi-commit task branches stay unblocked.
 */
const config = {
  extends: ["@commitlint/config-conventional"],
};

export default config;
