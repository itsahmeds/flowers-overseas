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
      "src/app/admin/(signed-in)/applications/[id]/page.tsx",
      "src/app/admin/(signed-in)/applications/page.tsx",
      "src/app/admin/(signed-in)/audit/page.tsx",
      // spec 012b §2.8 (TASK-300): any admin role reads both; the actions need `country.status`.
      "src/app/admin/(signed-in)/countries/[iso2]/page.tsx",
      "src/app/admin/(signed-in)/countries/page.tsx",
      "src/app/admin/(signed-in)/flags/page.tsx",
      "src/app/admin/(signed-in)/orders/[id]/page.tsx",
      "src/app/admin/(signed-in)/orders/page.tsx",
      "src/app/admin/(signed-in)/page.tsx",
      "src/app/admin/(signed-in)/partners/[code]/page.tsx",
      "src/app/admin/(signed-in)/partners/new/page.tsx",
      "src/app/admin/(signed-in)/partners/page.tsx",
      "src/app/admin/(signed-in)/publish/page.tsx",
      "src/app/admin/(signed-in)/users/page.tsx",
    ]);
  });
});

describe("/admin/publish is bound to catalogue.publish (spec 012b §5.2, AC-6; TASK-295)", () => {
  it.each(["ops", "finance"] as const)(
    "the page and the Publish action answer 403 to %s",
    async (role) => {
      session.current = as(role);
      const page =
        await import("../../src/app/admin/(signed-in)/publish/page.tsx");
      expect(
        await digestOf(() =>
          page.default({ searchParams: Promise.resolve({}) }),
        ),
      ).toBe(FORBIDDEN);
      const actions =
        await import("../../src/app/admin/(signed-in)/publish/actions.ts");
      expect(await digestOf(() => actions.publishAction())).toBe(FORBIDDEN);
    },
  );

  it.each(["admin", "content"] as const)(
    "lets %s past the page's guard",
    async (role) => {
      session.current = as(role);
      const page =
        await import("../../src/app/admin/(signed-in)/publish/page.tsx");
      const digest = await digestOf(() =>
        page.default({ searchParams: Promise.resolve({}) }),
      );
      expect(digest).not.toBe(FORBIDDEN);
      expect(digest).not.toMatch(/;401$/u);
    },
  );
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
      ).default({
        params: Promise.resolve({ id: ORDER }),
        searchParams: Promise.resolve({}),
      }),
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

describe("/admin/partners and /admin/applications are bound to the §5.2 matrix (AC-4; TASK-221)", () => {
  const APPLICATION = "0b7e1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d";
  const search = { searchParams: Promise.resolve({}) };
  const pages = {
    partners: async () =>
      (
        await import("../../src/app/admin/(signed-in)/partners/page.tsx")
      ).default(search),
    partner: async () =>
      (
        await import("../../src/app/admin/(signed-in)/partners/[code]/page.tsx")
      ).default({ params: Promise.resolve({ code: "pl-test-1" }), ...search }),
    newPartner: async () =>
      (
        await import("../../src/app/admin/(signed-in)/partners/new/page.tsx")
      ).default(search),
    applications: async () =>
      (
        await import("../../src/app/admin/(signed-in)/applications/page.tsx")
      ).default(search),
    application: async () =>
      (
        await import("../../src/app/admin/(signed-in)/applications/[id]/page.tsx")
      ).default({ params: Promise.resolve({ id: APPLICATION }), ...search }),
  };
  /** Who may open each page: `partner.edit` or `partner.payout`; `partner.edit`; `application.manage`. */
  const allowed: Record<keyof typeof pages, readonly string[]> = {
    partners: ["admin", "ops", "finance"],
    partner: ["admin", "ops", "finance"],
    newPartner: ["admin", "ops"],
    applications: ["admin", "ops"],
    application: ["admin", "ops"],
  };
  const cases = (["admin", "ops", "finance", "content"] as const).flatMap(
    (role) =>
      (Object.keys(pages) as (keyof typeof pages)[]).map(
        (page) => [role, page, allowed[page].includes(role)] as const,
      ),
  );

  it.each(cases)("%s opening %s: allowed %s", async (role, page, ok) => {
    session.current = as(role);
    const digest = await digestOf(pages[page]);
    if (ok) {
      expect(digest).not.toBe(FORBIDDEN);
      expect(digest).not.toMatch(/;401$/u);
    } else {
      expect(digest).toBe(FORBIDDEN);
    }
  });

  /** The permission each action asks for, and so the roles it lets in. */
  const actionRoles: Record<string, readonly string[]> = {
    createPartnerAction: ["admin", "ops"],
    updatePartnerAction: ["admin", "ops"],
    recordTermsAction: ["admin", "ops"],
    saveCoverageAction: ["admin", "ops"],
    saveBlackoutAction: ["admin", "ops"],
    saveMappingAction: ["admin", "finance"],
    setPartnerStatusAction: ["admin", "ops"],
    markContactedAction: ["admin", "ops"],
    convertApplicationAction: ["admin", "ops"],
    rejectApplicationAction: ["admin", "ops"],
  };

  async function allActions(): Promise<Record<string, unknown>> {
    return {
      ...(await import("../../src/app/admin/(signed-in)/partners/actions.ts")),
      ...(await import("../../src/app/admin/(signed-in)/applications/actions.ts")),
    };
  }

  it("covers every action the two files export", async () => {
    expect(Object.keys(await allActions()).sort()).toEqual(
      Object.keys(actionRoles).sort(),
    );
  });

  it.each(["admin", "ops", "finance", "content"] as const)(
    "each action answers %s by the matrix",
    async (role) => {
      session.current = as(role);
      for (const [name, action] of Object.entries(await allActions())) {
        const digest = await digestOf(() =>
          (action as (f: FormData) => unknown)(new FormData()),
        );
        if (actionRoles[name]?.includes(role) === true) {
          expect(digest, name).not.toBe(FORBIDDEN);
        } else {
          expect(digest, name).toBe(FORBIDDEN);
        }
      }
    },
  );
});
