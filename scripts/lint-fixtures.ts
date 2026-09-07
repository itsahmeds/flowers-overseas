/**
 * `pnpm lint:fixtures` (spec 001 AC-4 / AC-5, TASK-003).
 *
 * Runs the real `eslint.config.mjs` (with `--no-ignore` semantics) and `stylelint.config.mjs`
 * over `tests/fixtures/lint/`. The fixtures violate the rules on purpose, so this command is
 * **expected to exit 1** and to name each offending file and rule. It is the executable form of
 * "`pnpm lint` fails on `physical-css.tsx` …" — the main lint run ignores the fixture directory
 * so that violations on purpose never turn the repository red.
 *
 * The unit test `tests/unit/lint-fixtures.test.ts` calls `lintFixtures()` directly.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface FixtureViolation {
  file: string;
  ruleId: string;
}

export interface FixtureLintReport {
  eslint: FixtureViolation[];
  stylelint: FixtureViolation[];
}

const FIXTURE_DIR = "tests/fixtures/lint";

function relative(root: string, file: string): string {
  return file.startsWith(root) ? file.slice(root.length + 1) : file;
}

export async function lintFixtures(root: string): Promise<FixtureLintReport> {
  const { ESLint } = await import("eslint");
  const stylelint = (await import("stylelint")).default;

  const eslint = new ESLint({
    cwd: root,
    ignore: false,
    overrideConfigFile: resolve(root, "eslint.config.mjs"),
  });
  const eslintResults = await eslint.lintFiles([`${FIXTURE_DIR}/**/*.tsx`]);
  const eslintViolations: FixtureViolation[] = [];
  for (const result of eslintResults) {
    for (const message of result.messages) {
      eslintViolations.push({
        file: relative(root, result.filePath),
        ruleId: message.ruleId ?? "(fatal)",
      });
    }
  }

  const cssResult = await stylelint.lint({
    cwd: root,
    files: `${FIXTURE_DIR}/**/*.css`,
    configFile: resolve(root, "stylelint.config.mjs"),
  });
  const stylelintViolations: FixtureViolation[] = [];
  for (const result of cssResult.results) {
    for (const warning of result.warnings) {
      stylelintViolations.push({
        file: relative(root, result.source ?? ""),
        ruleId: warning.rule,
      });
    }
  }

  return { eslint: eslintViolations, stylelint: stylelintViolations };
}

export function formatFixtureReport(report: FixtureLintReport): string {
  const lines: string[] = [];
  for (const violation of [...report.eslint, ...report.stylelint]) {
    lines.push(`${violation.file}: ${violation.ruleId}`);
  }
  return lines.join("\n");
}

const isMain =
  typeof process.argv[1] === "string" &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const root = resolve(process.argv[2] ?? process.cwd());
  const report = await lintFixtures(root);
  const total = report.eslint.length + report.stylelint.length;
  if (total === 0) {
    process.stderr.write(
      `lint:fixtures found no violations in ${FIXTURE_DIR}/ — the fo rules or the Stylelint bans are not wired\n`,
    );
    process.exit(1);
  }
  process.stdout.write(`${formatFixtureReport(report)}\n`);
  process.stdout.write(
    `lint:fixtures: ${String(total)} expected violations in ${FIXTURE_DIR}/ (exit 1 by design)\n`,
  );
  process.exit(1);
}
