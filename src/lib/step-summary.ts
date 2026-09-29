/**
 * The one writer of CI step-summary text to stdout (spec 001 §14 A20, AC-56; TASK-160).
 *
 * Lint rejects `process.stdout`, `process.stderr` and every other way to reach `console` in `src/`
 * (`eslint/sdk-adapters.js`, `restrictedRules`), so that no line can skip the logger's PII scan.
 * Two files are exempt: `src/lib/logger.ts`, which writes log lines, and this one, which writes
 * the Markdown the build-time summary writers produce (`writeExistenceSummary` in
 * `src/modules/catalog/listing.ts`, `writeProductExistenceSummary` in
 * `src/modules/catalog/product.ts`) when no `$GITHUB_STEP_SUMMARY` file is set. That text is
 * counts and URL types, never a person's data; keeping it out of the logger keeps it Markdown
 * rather than a JSON line.
 */

/** Write step-summary Markdown to stdout, as it is: no newline added, no JSON wrapping. */
export function writeStepSummaryStdout(text: string): void {
  process.stdout.write(text);
}
