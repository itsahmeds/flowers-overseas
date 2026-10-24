/**
 * The permission each real admin action and page asks for (spec 012 AC-4, §5.2's matrix;
 * `/break 246` hole 3; TASK-217). T-02 proves `requirePermission` comes first and T-05 proves the
 * matrix; this proves the **binding**: every action of `/admin/users` and the page itself answer
 * 403 to every role without `users.manage` (ops, finance, content), and let `admin` past the
 * guard. Nothing is written on a 403: the guard throws before the command runs (no database here).
 */
import { readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { AdminSession } from "../../src/lib/auth/admin.ts";

vi.stubEnv("__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS", "true");

const session = vi.hoisted(() => ({ current: null as AdminSession | null }));

vi.mock("@/lib/auth/admin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/auth/admin.ts")>()),
  getAdminSession: () => Promise.resolve(session.current),
}));
vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers()),
}));

const repoRoot = resolve(import.meta.dirname, "../..");

function as(role: AdminSession["roles"][number]): AdminSession {
  return {
    userId: "00000000-0000-4000-8000-000000000001",
    displayName: "Role Test",
    roles: [role],
    timeZone: "Europe/Tallinn",
  };
}

async function digestOf(fn: () => unknown): Promise<string> {
  try {
    await fn();
  } catch (error) {
    return typeof error === "object" && error !== null && "digest" in error
      ? String((error as { digest: unknown }).digest)
      : `other: ${error instanceof Error ? error.name : String(error)}`;
  }
  return "no error";
}

function form(): FormData {
  const data = new FormData();
  data.set("email", "someone@example.test");
  data.set("displayName", "Some One");
  data.set("role", "ops");
  data.set("userId", "00000000-0000-4000-8000-000000000002");
  data.set("updatedAt", "2026-10-18T00:00:00.000Z");
  return data;
}

const FORBIDDEN = "NEXT_HTTP_ERROR_FALLBACK;403";

describe("/admin/users is bound to users.manage (AC-4)", () => {
  it("covers every action the file exports", async () => {
    const actions =
      await import("../../src/app/admin/(signed-in)/users/actions.ts");
    expect(Object.keys(actions).sort()).toEqual([
      "deactivateUserAction",
      "grantRoleAction",
      "revokeRoleAction",
    ]);
  });

  it.each(["ops", "finance", "content"] as const)(
    "every action answers 403 to %s",
    async (role) => {
      session.current = as(role);
      const actions =
        await import("../../src/app/admin/(signed-in)/users/actions.ts");
      for (const [name, action] of Object.entries(actions)) {
        expect(
          await digestOf(() => (action as (f: FormData) => unknown)(form())),
          name,
        ).toBe(FORBIDDEN);
      }
    },
  );

  it("lets admin past the guard of every action", async () => {
    session.current = as("admin");
    const actions =
      await import("../../src/app/admin/(signed-in)/users/actions.ts");
    for (const [name, action] of Object.entries(actions)) {
      const digest = await digestOf(() =>
        (action as (f: FormData) => unknown)(form()),
      );
      expect(digest, name).not.toBe(FORBIDDEN);
      expect(digest, name).not.toMatch(/;401$/u);
    }
  });

  it.each(["ops", "finance", "content"] as const)(
    "the page answers 403 to %s (requireAdminPage honours its argument)",
    async (role) => {
      session.current = as(role);
      const page =
        await import("../../src/app/admin/(signed-in)/users/page.tsx");
      expect(
        await digestOf(() =>
          page.default({ searchParams: Promise.resolve({}) }),
        ),
      ).toBe(FORBIDDEN);
    },
  );

  it("lets admin past the page's guard", async () => {
    session.current = as("admin");
    const page = await import("../../src/app/admin/(signed-in)/users/page.tsx");
    expect(
      await digestOf(() => page.default({ searchParams: Promise.resolve({}) })),
    ).not.toBe(FORBIDDEN);
  });

  it("the home page and the layout let every role in", async () => {
    for (const role of ["admin", "ops", "finance", "content"] as const) {
      session.current = as(role);
      const layout = await import("../../src/app/admin/(signed-in)/layout.tsx");
      expect(
        await digestOf(() => layout.default({ children: null })),
        role,
      ).toBe("no error");
    }
  });

  it("names every signed-in page in this file or in T-01", () => {
    const pages = (function walk(dir: string): string[] {
      return readdirSync(join(repoRoot, dir)).flatMap((entry) => {
        const path = join(repoRoot, dir, entry);
        return statSync(path).isDirectory()
          ? walk(relative(repoRoot, path))
          : /page\.tsx$/u.test(entry)
            ? [relative(repoRoot, path)]
            : [];
      });
    })("src/app/admin/(signed-in)");
    expect(pages.sort()).toEqual([
      "src/app/admin/(signed-in)/audit/page.tsx",
      "src/app/admin/(signed-in)/flags/page.tsx",
      "src/app/admin/(signed-in)/orders/[id]/page.tsx",
      "src/app/admin/(signed-in)/orders/page.tsx",
      "src/app/admin/(signed-in)/page.tsx",
      "src/app/admin/(signed-in)/users/page.tsx",
    ]);
  });
});

describe("/admin/audit is bound to audit.read (AC-4; TASK-218)", () => {
  it.each(["ops", "finance", "content"] as const)(
    "the page answers 403 to %s",
    async (role) => {
      session.current = as(role);
      const page =
        await import("../../src/app/admin/(signed-in)/audit/page.tsx");
      expect(
        await digestOf(() =>
          page.default({ searchParams: Promise.resolve({}) }),
        ),
      ).toBe(FORBIDDEN);
    },
  );

  it("lets admin past the page's guard", async () => {
    session.current = as("admin");
    const page = await import("../../src/app/admin/(signed-in)/audit/page.tsx");
    const digest = await digestOf(() =>
      page.default({ searchParams: Promise.resolve({}) }),
    );
    expect(digest).not.toBe(FORBIDDEN);
    expect(digest).not.toMatch(/;401$/u);
  });
});

describe("/admin/flags is bound to flags.toggle (AC-4, AC-14; TASK-220)", () => {
  it.each(["ops", "finance", "content"] as const)(
    "the page answers 403 to %s",
    async (role) => {
      session.current = as(role);
      const page =
        await import("../../src/app/admin/(signed-in)/flags/page.tsx");
      expect(
        await digestOf(() =>
          page.default({ searchParams: Promise.resolve({}) }),
        ),
      ).toBe(FORBIDDEN);
    },
  );

  it.each(["ops", "finance", "content"] as const)(
    "the toggle action answers 403 to %s",
    async (role) => {
      session.current = as(role);
      const actions =
        await import("../../src/app/admin/(signed-in)/flags/actions.ts");
      expect(
        await digestOf(() => actions.toggleFlagAction(new FormData())),
      ).toBe(FORBIDDEN);
    },
  );

  it("lets admin past the page's guard", async () => {
    session.current = as("admin");
    const page = await import("../../src/app/admin/(signed-in)/flags/page.tsx");
    const digest = await digestOf(() =>
      page.default({ searchParams: Promise.resolve({}) }),
    );
    expect(digest).not.toBe(FORBIDDEN);
    expect(digest).not.toMatch(/;401$/u);
  });
});

describe("/admin/orders, its detail and its head are bound to orders.view (AC-4; TASK-222)", () => {
  const ORDER = "0b7e1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d";
  const views = {
    list: async () =>
      (await import("../../src/app/admin/(signed-in)/orders/page.tsx")).default(
        { searchParams: Promise.resolve({}) },
      ),
    detail: async () =>
      (
        await import("../../src/app/admin/(signed-in)/orders/[id]/page.tsx")
      ).default({ params: Promise.resolve({ id: ORDER }) }),
    head: async () =>
      (await import("../../src/app/admin/api/orders/head/route.ts")).GET(),
  };

  it.each(Object.keys(views))("%s answers 403 to content", async (view) => {
    session.current = as("content");
    expect(await digestOf(views[view as keyof typeof views])).toBe(FORBIDDEN);
  });

  it.each(
    (["admin", "ops", "finance"] as const).flatMap((role) =>
      (Object.keys(views) as (keyof typeof views)[]).map(
        (view) => [role, view] as const,
      ),
    ),
  )("lets %s past the guard of %s", async (role, view) => {
    session.current = as(role);
    const digest = await digestOf(views[view]);
    expect(digest).not.toBe(FORBIDDEN);
    expect(digest).not.toMatch(/;401$/u);
  });
});
