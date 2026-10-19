/**
 * T-01 (AC-1), without a database: with no session, every admin page found under `src/app/admin`
 * (the sign-in pages excepted) redirects to `/admin/sign-in`, and every server action and
 * `/admin/api/**` handler (auth endpoints excepted) answers 401 before it reaches anything that
 * writes. The set is enumerated from the file tree, not listed by hand.
 *
 * "Writes nothing" is structural here: there is no database in the unit project and no
 * `DATABASE_URL`, so an action that got past its guard would fail with a connection or env error,
 * not with the 401 this asserts. T-02 (`admin-scans.test.ts`) proves the guard comes first.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

// What `next build` sets from `experimental.authInterrupts` (next.config.ts), so the guard's
// `unauthorized()` and `forbidden()` behave as in the deployed server.
vi.stubEnv("__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS", "true");

const request = vi.hoisted(() => ({ cookie: "" }));

vi.mock("next/headers", () => ({
  headers: () =>
    Promise.resolve(
      new Headers(request.cookie === "" ? {} : { cookie: request.cookie }),
    ),
  cookies: () => Promise.resolve({ get: () => undefined }),
}));

const repoRoot = resolve(import.meta.dirname, "../..");

function walk(dir: string): string[] {
  return readdirSync(join(repoRoot, dir)).flatMap((entry) => {
    const path = join(repoRoot, dir, entry);
    return statSync(path).isDirectory()
      ? walk(relative(repoRoot, path))
      : [relative(repoRoot, path)];
  });
}

const files = walk("src/app/admin");
const SIGNED_OUT = /^src\/app\/admin\/sign-in\//u;
const pages = files.filter(
  (f) =>
    /\/(?:page|layout)\.tsx$/u.test(f) &&
    !SIGNED_OUT.test(f) &&
    f !== "src/app/admin/layout.tsx",
);
const actionFiles = files.filter((f) =>
  /["']use server["']/u.test(readFileSync(join(repoRoot, f), "utf8")),
);
const handlers = files.filter(
  (f) => /\/route\.ts$/u.test(f) && !/^src\/app\/admin\/api\/auth\//u.test(f),
);

function digestOf(error: unknown): string {
  return typeof error === "object" && error !== null && "digest" in error
    ? String((error as { digest: unknown }).digest)
    : `not a Next interrupt: ${String(error)}`;
}

async function thrown(fn: () => unknown): Promise<unknown> {
  try {
    await fn();
  } catch (error) {
    return error;
  }
  return new Error("did not throw");
}

describe("T-01 — no session, nothing admin (AC-1)", () => {
  it("finds the signed-in pages, the actions and their exports", () => {
    expect(pages).toEqual(
      expect.arrayContaining([
        "src/app/admin/(signed-in)/layout.tsx",
        "src/app/admin/(signed-in)/page.tsx",
        "src/app/admin/(signed-in)/users/page.tsx",
      ]),
    );
    expect(actionFiles).toContain("src/app/admin/(signed-in)/users/actions.ts");
  });

  it.each(pages)("%s redirects to /admin/sign-in", async (file) => {
    const loaded = (await import(`../../${file}`)) as {
      default: (props: unknown) => unknown;
    };
    const error = await thrown(() =>
      loaded.default({ searchParams: Promise.resolve({}), children: null }),
    );
    expect(digestOf(error)).toMatch(
      /^NEXT_REDIRECT;[a-z]+;\/admin\/sign-in;30[37];/u,
    );
  });

  it.each(actionFiles)("every export of %s answers 401", async (file) => {
    const loaded = (await import(`../../${file}`)) as Record<string, unknown>;
    const actions = Object.entries(loaded).filter(
      ([, value]) => typeof value === "function",
    );
    expect(actions.length).toBeGreaterThan(0);
    for (const [name, action] of actions) {
      const form = new FormData();
      form.set("email", "someone@example.test");
      form.set("displayName", "Some One");
      form.set("role", "admin");
      const error = await thrown(() =>
        (action as (f: FormData) => unknown)(form),
      );
      expect(digestOf(error), name).toBe("NEXT_HTTP_ERROR_FALLBACK;401");
    }
  });

  it.each(handlers.length === 0 ? ["(none yet)"] : handlers)(
    "handler %s answers 401",
    async (file) => {
      if (file === "(none yet)") return;
      const loaded = (await import(`../../${file}`)) as Record<string, unknown>;
      for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
        const handler = loaded[method];
        if (typeof handler !== "function") continue;
        const error = await thrown(() =>
          (handler as (r: Request) => unknown)(
            new Request(`https://example.test/${file}`, { method }),
          ),
        );
        expect(digestOf(error), method).toBe("NEXT_HTTP_ERROR_FALLBACK;401");
      }
    },
  );

  it.each([
    "__Secure-fo-admin.session-token=%E0%A4%A",
    "__Secure-fo-admin.session-token=%",
    "__Secure-fo-admin.session-token=",
  ])(
    "a malformed cookie (%s) redirects to sign-in, never a 500 (B4)",
    async (cookie) => {
      request.cookie = cookie;
      try {
        for (const file of pages) {
          const loaded = (await import(`../../${file}`)) as {
            default: (props: unknown) => unknown;
          };
          const error = await thrown(() =>
            loaded.default({
              searchParams: Promise.resolve({}),
              children: null,
            }),
          );
          expect(digestOf(error), file).toMatch(
            /^NEXT_REDIRECT;[a-z]+;\/admin\/sign-in;30[37];/u,
          );
        }
      } finally {
        request.cookie = "";
      }
    },
  );
});
