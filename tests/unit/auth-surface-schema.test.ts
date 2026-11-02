/**
 * `AuthSurfaceSchema` refuses what a surface must not be (spec 012 §2.2, §5.2; `/review 246`
 * change 4; TASK-217): a mail tag outside `mailTags` (which would otherwise fail silently behind
 * the identical "sent" page), a `__Host-` prefix, and a path outside the cookie path.
 */
import { describe, expect, it } from "vitest";

import { ADMIN_SURFACE } from "../../src/lib/auth/admin.ts";
import { AuthSurfaceSchema } from "../../src/lib/auth/schema.ts";

describe("AuthSurfaceSchema", () => {
  it("accepts the admin surface", () => {
    expect(AuthSurfaceSchema.parse(ADMIN_SURFACE).mailTag).toBe(
      "admin_sign_in",
    );
  });

  it.each([
    // `florist_sign_in` joined the registry with TASK-212; the application alert has not yet.
    ["an unregistered mail tag", { mailTag: "florist_application_alert" }],
    ["a __Host- cookie prefix", { cookiePrefix: "__Host-fo-admin" }],
    ["a base path outside the cookie path", { basePath: "/api/auth" }],
    [
      "a home outside the cookie path",
      { pages: { ...ADMIN_SURFACE.pages, home: "/en" } },
    ],
  ])("refuses %s", (_label, change) => {
    expect(
      AuthSurfaceSchema.safeParse({ ...ADMIN_SURFACE, ...change }).success,
    ).toBe(false);
  });
});
