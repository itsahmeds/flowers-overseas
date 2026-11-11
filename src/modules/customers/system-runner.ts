/**
 * The `system` database context as the customers module's runner (spec 018 §14 C.7.4; TASK-353),
 * for the reminder consent columns and `consent_log`, which a buyer session may not write. The
 * caller names the job for `app.request_id` and passes only a customer it resolved itself (from
 * the session or a verified token). `@/lib/db` loads on first use, so importing this connects to
 * nothing and a page module stays free of the database import (`pnpm check:no-db`).
 */
import type { AccountRunner } from "./buyer-account";

export function systemAccountRunner(job: string): AccountRunner {
  return async (fn) => {
    const { withSystemContext } = await import("@/lib/db");
    return withSystemContext(job, (db) =>
      fn({
        async execute(query) {
          const rows: unknown = await db.execute(query);
          return rows as readonly Record<string, unknown>[];
        },
      }),
    );
  };
}
