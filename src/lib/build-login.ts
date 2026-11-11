/**
 * Whether a deployment carries the build's database login (spec 012b §12 founder action 4; AC-4):
 * `DATABASE_BUILD_URL` holds a `postgres://` connection string. The cutover's composition roots
 * read the database only then (`cmsSourceFor()` in `src/config/countries.ts`, TASK-294's staging
 * fallback), so a deployment without the variable builds and serves from the repository files.
 *
 * Its own module, with no import, because `src/config/countries.ts` is client-reachable and
 * database-free (`pnpm check:no-db`) and cannot import `./db.ts`. It answers a boolean and never
 * the value; `./db.ts` is the only module that connects with it.
 */

/** The one key the build's connection string is read from. */
export const BUILD_DATABASE_URL_KEY = "DATABASE_BUILD_URL";

/** The shape `./db.ts` accepts for the build login. */
export const BUILD_DATABASE_URL_PATTERN = /^postgres(?:ql)?:\/\/[^\s]+$/u;

/** True when `environment` carries a build login of the accepted shape. */
export function buildDatabaseConfigured(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  const value = environment[BUILD_DATABASE_URL_KEY];
  return value !== undefined && BUILD_DATABASE_URL_PATTERN.test(value);
}
