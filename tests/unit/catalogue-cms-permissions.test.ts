/**
 * Spec 012b T-26 (AC-26; TASK-301): the permission rows the catalogue CMS adds, and spec 012's
 * suites finding every new admin page, action and handler.
 *
 *  1. **The matrix, from the spec.** The rows of spec 012b §5.2 "Permission rows" are read from
 *     `specs/012b-cms.md` itself, not copied here, and every cell is asked of `can()`: allowed
 *     exactly where the spec marks it. A slice B row (`country.edit`) is not registered yet.
 *  2. **The binding.** Every action and handler under the four 012b sections answers 403 to each
 *     role the matrix leaves out and lets each role it marks past the guard; the two pages with a
 *     fixed permission do the same. The guard throws before any command runs (no database here).
 *  3. **The enumeration.** Spec 012's unauthenticated suite (T-01, `admin-unauthenticated.test.ts`)
 *     and its guard scan (T-02, `admin-scans.test.ts`) walk `src/app/admin`; this asserts every
 *     012b page, action file and handler is in what those walks find, that neither suite names a
 *     012b path by hand, and that every 012b URL is under the `/admin/:path*` header rule
 *     (`noindex, nofollow`, `no-store, private`). Both suites then run them.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { AdminSession } from "../../src/lib/auth/admin.ts";
import { adminHeaderRules } from "../../src/lib/admin-headers.ts";
import { ADMIN_PERMISSIONS, can } from "../../src/modules/admin/permissions.ts";
import { adminRoles } from "../../db/schema/auth.ts";

vi.stubEnv("__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS", "true");

const session = vi.hoisted(() => ({ current: null as AdminSession | null }));

vi.mock("@/lib/auth/admin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/auth/admin.ts")>()),
  getAdminSession: () => Promise.resolve(session.current),
}));
vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers()),
  cookies: () => Promise.resolve({ get: () => undefined }),
}));

const repoRoot = resolve(import.meta.dirname, "../..");
const read = (file: string): string =>
  readFileSync(join(repoRoot, file), "utf8");

type Role = (typeof adminRoles)[number];

/* -------------------------------------------------------------------------- */
/* 1. The matrix, read from spec 012b §5.2                                      */
/* -------------------------------------------------------------------------- */

interface SpecRow {
  readonly permissions: readonly string[];
  readonly allowed: readonly Role[];
  readonly sliceB: boolean;
}

/** The "Permission rows" table of spec 012b §5.2, parsed. */
function specPermissionRows(spec: string): SpecRow[] {
  const start = spec.indexOf("**Permission rows** added");
  expect(start, "the §5.2 heading").toBeGreaterThan(-1);
  const lines = spec.slice(start).split("\n").slice(1);
  const table: string[] = [];
  for (const line of lines) {
    if (line.trim() === "" && table.length > 0) break;
    if (line.startsWith("|")) table.push(line);
  }
  const cells = (line: string): string[] =>
    line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
  const header = cells(table[0] ?? "");
  const roleColumns = header.slice(1) as Role[];
  expect(roleColumns).toEqual(["admin", "ops", "finance", "content"]);
  return table.slice(2).map((line) => {
    const [first = "", ...marks] = cells(line);
    // The permission names are the backticked tokens before the row's note: "(…)" or " for …".
    const head = first.split(/\s\(|\sfor\s/u)[0] ?? "";
    const permissions = [...head.matchAll(/`([a-z]+\.[a-z_]+)`/gu)].map(
      (match) => match[1] ?? "",
    );
    return {
      permissions,
      allowed: roleColumns.filter((_, i) => marks[i] === "✓"),
      sliceB: /slice B/u.test(first),
    };
  });
}

const rows = specPermissionRows(read("specs/012b-cms.md"));

describe("T-26 — spec 012b §5.2's permission rows, cell by cell (AC-26)", () => {
  it("reads the nine rows of the spec, ten permissions", () => {
    expect(rows.flatMap((row) => row.permissions)).toEqual([
      "catalogue.edit",
      "catalogue.supplier",
      "price.edit",
      "media.upload",
      "media.review",
      "translation.attest",
      "catalogue.publish",
      "country.edit",
      "country.status",
      "flags.toggle",
    ]);
  });

  const cells = rows
    .filter((row) => !row.sliceB)
    .flatMap((row) =>
      row.permissions.flatMap((permission) =>
        adminRoles.map(
          (role) => [permission, role, row.allowed.includes(role)] as const,
        ),
      ),
    );

  it.each(cells)("%s for %s → %s", (permission, role, allowed) => {
    expect(Object.hasOwn(ADMIN_PERMISSIONS, permission), permission).toBe(true);
    expect(can([role], permission as never)).toBe(allowed);
  });

  it("registers no slice B row yet (country.edit is task 13's)", () => {
    for (const row of rows.filter((r) => r.sliceB)) {
      for (const permission of row.permissions) {
        expect(Object.hasOwn(ADMIN_PERMISSIONS, permission), permission).toBe(
          false,
        );
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 2. The binding of every 012b action, handler and fixed-permission page       */
/* -------------------------------------------------------------------------- */

function as(role: Role): AdminSession {
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

const FORBIDDEN = "NEXT_HTTP_ERROR_FALLBACK;403";
const ROLES = ["admin", "ops", "finance", "content"] as const;

/** Who each permission lets in, straight from the spec's rows. */
function allowedFor(permission: string): readonly Role[] {
  const row = rows.find((r) => r.permissions.includes(permission));
  if (row === undefined) throw new Error(`no spec row for ${permission}`);
  return row.allowed;
}

const SECTION = "src/app/admin/(signed-in)";

/** Every exported action of the 012b action files, with the permission its guard names. */
const ACTIONS: Readonly<Record<string, Record<string, string>>> = {
  [`${SECTION}/catalogue/products/actions.ts`]: {
    saveProductAction: "catalogue.edit",
    saveTiersAction: "catalogue.edit",
    saveCopyAction: "catalogue.edit",
    setStatusAction: "catalogue.edit",
    confirmPriceAction: "price.edit",
    removeFromCountryAction: "price.edit",
    attachPhotoAction: "catalogue.edit",
    savePhotoAltAction: "catalogue.edit",
  },
  [`${SECTION}/countries/[iso2]/actions.ts`]: {
    flipCountryStatusAction: "country.status",
    saveFiscalFieldsAction: "country.status",
  },
  [`${SECTION}/media/actions.ts`]: { reviewPhotoAction: "media.review" },
  [`${SECTION}/publish/actions.ts`]: { publishAction: "catalogue.publish" },
};

/** The 012b handlers: file, method, permission. */
const HANDLERS = [
  ["src/app/admin/api/media/route.ts", "POST", "media.upload"],
  ["src/app/admin/api/media/[id]/original/route.ts", "GET", "media.review"],
] as const;

/** The 012b pages whose first statement names a permission. */
const FIXED_PAGES = [
  [`${SECTION}/catalogue/products/new/page.tsx`, "catalogue.edit"],
  [`${SECTION}/publish/page.tsx`, "catalogue.publish"],
] as const;

async function load(file: string): Promise<Record<string, unknown>> {
  return (await import(`../../${file}`)) as Record<string, unknown>;
}

describe("T-26 — every 012b action and handler is bound to its row (AC-26)", () => {
  it.each(Object.keys(ACTIONS))(
    "lists every action %s exports",
    async (file) => {
      expect(Object.keys(await load(file)).sort()).toEqual(
        Object.keys(ACTIONS[file] ?? {}).sort(),
      );
      // The table above matches the guard each action actually calls.
      const source = read(file);
      for (const [name, permission] of Object.entries(ACTIONS[file] ?? {})) {
        const body = source.slice(source.indexOf(`function ${name}(`));
        expect(body, name).toMatch(
          new RegExp(
            `^[^{]*\\{\\s*(?:const \\w+ = )?await requirePermission\\("${permission.replace(".", "\\.")}"\\)`,
            "u",
          ),
        );
      }
    },
  );

  const actionCases = Object.entries(ACTIONS).flatMap(([file, actions]) =>
    Object.entries(actions).flatMap(([name, permission]) =>
      ROLES.map(
        (role) =>
          [name, role, allowedFor(permission).includes(role), file] as const,
      ),
    ),
  );

  it.each(actionCases)(
    "%s for %s: allowed %s",
    async (name, role, allowed, file) => {
      session.current = as(role);
      const action = (await load(file))[name] as (f: FormData) => unknown;
      const digest = await digestOf(() => action(new FormData()));
      if (allowed) {
        expect(digest).not.toBe(FORBIDDEN);
        expect(digest).not.toMatch(/;401$/u);
      } else {
        expect(digest).toBe(FORBIDDEN);
      }
    },
  );

  const handlerCases = HANDLERS.flatMap(([file, method, permission]) =>
    ROLES.map(
      (role) =>
        [
          `${method} ${file}`,
          role,
          allowedFor(permission).includes(role),
          file,
          method,
        ] as const,
    ),
  );

  it.each(handlerCases)(
    "%s for %s: allowed %s",
    async (_label, role, allowed, file, method) => {
      session.current = as(role);
      const handler = (await load(file))[method] as (
        r: Request,
        c: unknown,
      ) => unknown;
      const digest = await digestOf(() =>
        handler(
          new Request(`https://example.test/admin/api/media`, { method }),
          {
            params: Promise.resolve({
              id: "00000000-0000-4000-8000-000000000009",
            }),
          },
        ),
      );
      if (allowed) {
        expect(digest).not.toBe(FORBIDDEN);
        expect(digest).not.toMatch(/;401$/u);
      } else {
        expect(digest).toBe(FORBIDDEN);
      }
    },
  );

  const pageCases = FIXED_PAGES.flatMap(([file, permission]) =>
    ROLES.map(
      (role) => [file, role, allowedFor(permission).includes(role)] as const,
    ),
  );

  it.each(pageCases)("%s for %s: allowed %s", async (file, role, allowed) => {
    session.current = as(role);
    const page = (await load(file))["default"] as (props: unknown) => unknown;
    const digest = await digestOf(() =>
      page({ searchParams: Promise.resolve({}) }),
    );
    if (allowed) {
      expect(digest).not.toBe(FORBIDDEN);
      expect(digest).not.toMatch(/;401$/u);
    } else {
      expect(digest).toBe(FORBIDDEN);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 3. Spec 012's suites find every 012b file with no hand-edited list           */
/* -------------------------------------------------------------------------- */

function walk(dir: string): string[] {
  return readdirSync(join(repoRoot, dir)).flatMap((entry) => {
    const path = join(repoRoot, dir, entry);
    return statSync(path).isDirectory()
      ? walk(relative(repoRoot, path))
      : [relative(repoRoot, path)];
  });
}

const SECTIONS_012B = /\/(?:catalogue|media|countries|publish)\//u;
const adminFiles = walk("src/app/admin");
const files012b = adminFiles.filter((f) => SECTIONS_012B.test(`${f}/`));

/** T-01's three filters (`admin-unauthenticated.test.ts`), applied to the same walk. */
const t01Pages = adminFiles.filter(
  (f) =>
    /\/(?:page|layout)\.tsx$/u.test(f) &&
    !/^src\/app\/admin\/sign-in\//u.test(f) &&
    f !== "src/app/admin/layout.tsx",
);
const t01Actions = adminFiles.filter((f) =>
  /["']use server["']/u.test(read(f)),
);
const t01Handlers = adminFiles.filter(
  (f) => /\/route\.ts$/u.test(f) && !/^src\/app\/admin\/api\/auth\//u.test(f),
);

/** The URL a page or handler file serves (route groups dropped, dynamic segments kept). */
function urlOf(file: string): string {
  return `/${file
    .replace(/^src\/app\//u, "")
    .replace(/\/\([^)]+\)/gu, "")
    .replace(/\/(?:page\.tsx|route\.ts)$/u, "")}`;
}

describe("T-26 — spec 012's enumerated suites find every 012b page, action and handler (AC-26)", () => {
  it("finds the 012b files in the four sections and the media API", () => {
    expect(files012b.length).toBeGreaterThanOrEqual(16);
    expect(files012b).toEqual(
      expect.arrayContaining([
        ...Object.keys(ACTIONS),
        ...HANDLERS.map(([file]) => file),
        ...FIXED_PAGES.map(([file]) => file),
      ]),
    );
  });

  it("puts every 012b page in T-01's redirect walk", () => {
    const pages = files012b.filter((f) => /\/page\.tsx$/u.test(f));
    expect(pages).toHaveLength(8);
    for (const page of pages) expect(t01Pages, page).toContain(page);
  });

  it("puts every 012b action file in T-01's 401 walk and T-02's guard scan", () => {
    const actions = files012b.filter((f) =>
      /["']use server["']/u.test(read(f)),
    );
    expect(actions.sort()).toEqual(Object.keys(ACTIONS).sort());
    for (const file of actions) expect(t01Actions, file).toContain(file);
  });

  it("puts every 012b handler in T-01's 401 walk and T-02's guard scan", () => {
    const handlers = files012b.filter((f) => /\/route\.ts$/u.test(f));
    expect(handlers.sort()).toEqual(HANDLERS.map(([file]) => file).sort());
    for (const file of handlers) expect(t01Handlers, file).toContain(file);
  });

  it("names no 012b path by hand in either suite (the walk is the list)", () => {
    for (const suite of [
      "tests/unit/admin-unauthenticated.test.ts",
      "tests/unit/admin-scans.test.ts",
    ]) {
      expect(read(suite), suite).not.toMatch(
        /admin\/(?:\(signed-in\)\/)?(?:catalogue|media|countries|publish)\b|api\/media/u,
      );
    }
  });

  it("serves every 012b URL under the /admin/:path* rule: noindex, nofollow and no-store", () => {
    const rule = adminHeaderRules().find(
      (candidate) => candidate.source === "/admin/:path*",
    );
    expect(rule?.headers).toEqual([
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
      { key: "Cache-Control", value: "no-store, private" },
    ]);
    const urls = files012b
      .filter((f) => /\/(?:page\.tsx|route\.ts)$/u.test(f))
      .map(urlOf);
    expect(urls).toEqual(
      expect.arrayContaining([
        "/admin/catalogue/products",
        "/admin/catalogue/products/new",
        "/admin/catalogue/products/[sku]",
        "/admin/media",
        "/admin/media/[id]",
        "/admin/countries",
        "/admin/countries/[iso2]",
        "/admin/publish",
        "/admin/api/media",
        "/admin/api/media/[id]/original",
      ]),
    );
    for (const url of urls) expect(url, url).toMatch(/^\/admin\/.+/u);
  });
});
