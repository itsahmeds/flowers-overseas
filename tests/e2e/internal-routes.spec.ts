/**
 * T-23, e2e half (spec 002 AC-23; TASK-024, review R1 on PR 224): the two internal routes on the
 * served origin — `GET /api/internal/db-health` and `POST /api/internal/jobs/tick`.
 *
 * What the preview can prove, and what it cannot. CI's preview is `next start` over the build with
 * `.env.example`'s placeholders and **no database** (`.github/actions/preview-origin/serve.sh`).
 * So this spec asserts, on the real server:
 *
 *  - without the `x-internal-cron-secret` header, or with a wrong one: **401**, `no-store`,
 *    `X-Robots-Tag: noindex`, body `{ ok: false, error: "unauthorized" }`;
 *  - with the placeholder secret the server was started with: the gate **opens** and the database
 *    work fails, so **503** with the same headers and a closed-set error body.
 *
 * The 200 half — the `DbHealthResponse` body and `latest_migration` equal to the newest applied
 * migration — needs a database and is covered by `tests/unit/jobs-internal.test.ts` (the real route
 * files) and `tests/integration/jobs-pgboss.test.ts` (`probeDbHealth` on a migrated database). That
 * split is the declared deviation in `docs/tasks/TASK-024.md`.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type APIResponse } from "@playwright/test";

import { INTERNAL_SECRET_HEADER, InternalError } from "@/jobs/internal";

const ROUTES = [
  {
    path: "/api/internal/db-health",
    method: "get",
    failure: "database_unavailable",
  },
  { path: "/api/internal/jobs/tick", method: "post", failure: "tick_failed" },
] as const;

/** The secret `serve.sh` started the server with: `.env.example`'s, read, not restated. */
const PLACEHOLDER_SECRET = (() => {
  const line = readFileSync(resolve(process.cwd(), ".env.example"), "utf8")
    .split(/\r?\n/)
    .find((row) => row.startsWith("INTERNAL_CRON_SECRET="));
  return line?.slice("INTERNAL_CRON_SECRET=".length).trim() ?? "";
})();

function expectInternalHeaders(response: APIResponse): void {
  const headers = response.headers();
  expect(headers["cache-control"]).toBe("no-store");
  expect(headers["x-robots-tag"]).toBe("noindex");
  expect(headers["content-type"]).toMatch(/^application\/json\b/);
}

test.describe("internal routes (spec 002 AC-23, T-23)", () => {
  for (const route of ROUTES) {
    test(`${route.method.toUpperCase()} ${route.path}: 401 without the secret, and with a wrong one`, async ({
      request,
    }) => {
      for (const headers of [
        {},
        { [INTERNAL_SECRET_HEADER]: "not-the-secret" },
      ]) {
        const response = await request[route.method](route.path, { headers });
        expect(response.status(), JSON.stringify(headers)).toBe(401);
        expectInternalHeaders(response);
        expect(InternalError.parse(await response.json())).toEqual({
          ok: false,
          error: "unauthorized",
        });
      }
    });

    test(`${route.method.toUpperCase()} ${route.path}: the placeholder secret opens the gate, and no database answers 503`, async ({
      request,
      baseURL,
    }) => {
      // Only the CI-owned origin runs on `.env.example`; a deployed origin has a real secret and
      // a real database, where this case does not apply.
      test.skip(
        new URL(baseURL ?? "http://localhost").hostname !== "localhost",
        "the placeholder secret is only the server's secret on the CI-owned localhost origin",
      );
      expect(PLACEHOLDER_SECRET).not.toBe("");
      const response = await request[route.method](route.path, {
        headers: { [INTERNAL_SECRET_HEADER]: PLACEHOLDER_SECRET },
        timeout: 30_000,
      });
      expect(response.status()).toBe(503);
      expectInternalHeaders(response);
      expect(InternalError.parse(await response.json())).toEqual({
        ok: false,
        error: route.failure,
      });
    });
  }
});
