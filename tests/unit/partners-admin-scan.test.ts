/**
 * Spec 012 T-20, source half (AC-17; TASK-221): admin reads and moves applications only through
 * spec 011's two queries.
 *
 *  - No file under `src/modules/partners` outside spec 011's own `application/` directory, and
 *    no file under `src/app/admin`, imports the `partnerApplication` table or names
 *    `partner_application` in a statement (`FROM`, `JOIN`, `INTO`, `UPDATE`, `DELETE FROM`).
 *  - Migration `0035` adds no `partner_application` and no session retention row: those are spec
 *    011's (`0022`), and spec 012 keeps no copy (§13 Q5, ruling R2).
 *
 * The scan is proved on fixtures first: a planted query is found, so a clean result means
 * something.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = resolve(import.meta.dirname, "../..");

function walk(dir: string): string[] {
  const absolute = join(repoRoot, dir);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute).flatMap((entry) => {
    const path = join(absolute, entry);
    return statSync(path).isDirectory()
      ? walk(relative(repoRoot, path))
      : [relative(repoRoot, path)];
  });
}

const STATEMENT =
  /\b(?:from|join|into|update|delete\s+from)\s+(?:public\.)?"?partner_application"?\b/iu;
const TABLE_IMPORT = /\bpartnerApplication\b/u;

/** The reasons `source` holds an application query of its own; empty when it holds none. */
export function applicationQueries(source: string): string[] {
  const found: string[] = [];
  if (TABLE_IMPORT.test(source)) found.push("imports partnerApplication");
  if (STATEMENT.test(source)) found.push("names partner_application in SQL");
  return found;
}

describe("T-20 (source scan) · no second application query (AC-17)", () => {
  it("finds a planted query, in Drizzle and in SQL", () => {
    expect(
      applicationQueries(
        'import { partnerApplication } from "../../db/schema/partners";',
      ),
    ).toEqual(["imports partnerApplication"]);
    expect(
      applicationQueries(
        "await db.execute(sql`UPDATE public.partner_application SET status = 'new'`);",
      ),
    ).toEqual(["names partner_application in SQL"]);
    expect(
      applicationQueries("sql`SELECT count(*) FROM partner_application`"),
    ).toEqual(["names partner_application in SQL"]);
    // A comment naming the table is not a query.
    expect(
      applicationQueries("// `partner_application.status_reason`"),
    ).toEqual([]);
  });

  it("finds none under src/modules/partners outside application/, or under src/app/admin", () => {
    const files = [
      ...walk("src/modules/partners").filter(
        (file) => !file.startsWith("src/modules/partners/application/"),
      ),
      ...walk("src/app/admin"),
    ].filter((file) => /\.(?:ts|tsx)$/u.test(file));
    expect(files).toContain("src/modules/partners/admin/applications.ts");
    expect(files).toContain(
      "src/app/admin/(signed-in)/applications/[id]/page.tsx",
    );
    const offenders = files
      .map((file) => ({
        file,
        reasons: applicationQueries(readFileSync(join(repoRoot, file), "utf8")),
      }))
      .filter((entry) => entry.reasons.length > 0);
    expect(offenders).toEqual([]);
  });

  it("migration 0035 holds no application or session retention row", () => {
    const migration = readFileSync(
      join(repoRoot, "db/migrations/0035_partner_terms_and_retention.sql"),
      "utf8",
    );
    const insert = migration.slice(
      migration.indexOf("INSERT INTO public.retention_policy"),
    );
    const keys = [...insert.matchAll(/^\s*\('([a-z_]+)', '([a-z_]+)',/gmu)].map(
      (match) => [match[1], match[2]],
    );
    expect(keys).toEqual([
      ["audit_log", "audit_log"],
      ["auth_email_send", "auth_email_send"],
    ]);
  });
});
