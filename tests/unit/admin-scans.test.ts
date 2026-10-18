/**
 * Spec 012's source scans and static checks for the admin shell (TASK-217):
 *
 *  - T-02 (AC-1, AC-4): every exported server action under `src/app/admin` and every
 *    `/admin/api/**` handler outside the auth endpoints calls `requirePermission` as its first
 *    statement; a fixture action without it fails the scan.
 *  - T-10, source half (AC-8): Auth.js is configured only under `src/lib/auth/`, the one `Mailer`
 *    set lives in `src/modules/notifications/mailer.ts`, and no `AUTH_RESEND_KEY` or
 *    `ADMIN_MAIL_FROM` exists in code, config or env files.
 *  - AC-5, configuration half: the admin header rules, `authInterrupts`, the admin document's
 *    robots meta and the core's own response headers.
 *  - AC-6, source half: `robots.txt` disallows `/admin/`; no public source links to `/admin`.
 *  - AC-7: the admin catalogue is read only by `src/modules/admin/messages.ts`, `src/modules/admin`
 *    only by admin code; public catalogues hold no `admin` namespace; every admin key formats and
 *    ships `reviewed: false`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { adminHeaderRules } from "../../src/lib/admin-headers.ts";
import { AUTH_RESPONSE_HEADERS } from "../../src/lib/auth/surface.ts";
import { adminMessages, adminT } from "../../src/modules/admin/messages.ts";
import { DISALLOWED_PATHS } from "../../src/modules/seo/robots.ts";

const repoRoot = resolve(import.meta.dirname, "../..");

function walk(dir: string): string[] {
  const absolute = join(repoRoot, dir);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute).flatMap((entry) => {
    const path = join(absolute, entry);
    if (entry === "node_modules" || entry.startsWith(".")) return [];
    return statSync(path).isDirectory()
      ? walk(relative(repoRoot, path))
      : [relative(repoRoot, path)];
  });
}

const read = (file: string): string =>
  readFileSync(join(repoRoot, file), "utf8");

/* -------------------------------------------------------------------------- */
/* T-02                                                                        */
/* -------------------------------------------------------------------------- */

/** Exported functions of `source` whose first statement is not an awaited `requirePermission(…)`. */
export function unguardedExports(
  fileName: string,
  source: string,
  only?: ReadonlySet<string>,
): string[] {
  const file = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const isGuard = (statement: ts.Statement | undefined): boolean => {
    if (statement === undefined) return false;
    let expression: ts.Expression | undefined;
    if (ts.isExpressionStatement(statement)) expression = statement.expression;
    else if (ts.isVariableStatement(statement)) {
      expression = statement.declarationList.declarations[0]?.initializer;
    }
    if (expression === undefined || !ts.isAwaitExpression(expression))
      return false;
    const call = expression.expression;
    return (
      ts.isCallExpression(call) &&
      ts.isIdentifier(call.expression) &&
      call.expression.text === "requirePermission"
    );
  };
  const found: string[] = [];
  for (const statement of file.statements) {
    if (!ts.isFunctionDeclaration(statement) || statement.name === undefined)
      continue;
    const exported = statement.modifiers?.some(
      (m) => m.kind === ts.SyntaxKind.ExportKeyword,
    );
    if (exported !== true) continue;
    if (only !== undefined && !only.has(statement.name.text)) continue;
    if (!isGuard(statement.body?.statements[0]))
      found.push(statement.name.text);
  }
  // An exported arrow or const function cannot be scanned the same way: refuse it outright.
  for (const statement of file.statements) {
    if (
      ts.isVariableStatement(statement) &&
      statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      for (const declaration of statement.declarationList.declarations) {
        const init = declaration.initializer;
        if (
          init !== undefined &&
          (ts.isArrowFunction(init) || ts.isFunctionExpression(init))
        ) {
          found.push(declaration.name.getText(file));
        }
      }
    }
  }
  return found;
}

const adminFiles = walk("src/app/admin").filter((f) => /\.tsx?$/u.test(f));
const actionFiles = adminFiles.filter((f) =>
  /^\s*(?:\/\*[\s\S]*?\*\/\s*)?["']use server["']/u.test(read(f)),
);
const AUTH_ENDPOINTS = /^src\/app\/admin\/api\/auth\//u;
const handlerFiles = adminFiles.filter(
  (f) => /\/route\.ts$/u.test(f) && !AUTH_ENDPOINTS.test(f),
);

describe("T-02 — requirePermission is the first statement of every admin action and handler", () => {
  it("finds the server actions in the tree", () => {
    expect(actionFiles).toContain("src/app/admin/(signed-in)/users/actions.ts");
  });

  it.each(actionFiles)("%s", (file) => {
    expect(unguardedExports(file, read(file))).toEqual([]);
  });

  it.each(handlerFiles.length === 0 ? ["(none yet)"] : handlerFiles)(
    "handler %s",
    (file) => {
      if (file === "(none yet)") return;
      expect(
        unguardedExports(
          file,
          read(file),
          new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]),
        ),
      ).toEqual([]);
    },
  );

  it("fails a fixture action without the guard, or with the guard second", () => {
    const fixture = [
      '"use server";',
      'export async function a(form: FormData) { await requirePermission("users.manage"); }',
      'export async function b(form: FormData) { const x = 1; await requirePermission("users.manage"); }',
      "export async function c(form: FormData) { await grantRole(form); }",
      'export const d = async () => { await requirePermission("users.manage"); };',
    ].join("\n");
    expect(unguardedExports("fixture.ts", fixture)).toEqual(["b", "c", "d"]);
  });
});

/* -------------------------------------------------------------------------- */
/* T-10 (source half)                                                          */
/* -------------------------------------------------------------------------- */

const codeRoots = ["src", "scripts", "emails", "db", "config", "seed"];
const codeFiles = codeRoots.flatMap(walk);

describe("T-10 — one sign-in core, one Mailer, no stray env names (AC-8)", () => {
  it("configures Auth.js only under src/lib/auth/", () => {
    const importers = codeFiles.filter(
      (f) =>
        /\.(?:[cm]?[jt]sx?)$/u.test(f) &&
        /from\s+["'](?:next-auth|@auth\/)[^"']*["']/u.test(read(f)),
    );
    expect(importers.length).toBeGreaterThan(0);
    expect(importers.filter((f) => !f.startsWith("src/lib/auth/"))).toEqual([]);
  });

  it("has one Mailer implementation set, and nothing else names Resend's API or a mail SDK", () => {
    const resendApi = codeFiles.filter((f) =>
      read(f).includes("api.resend.com"),
    );
    expect(resendApi).toEqual(["src/modules/notifications/mailer.ts"]);
    const mailerFactories = codeFiles.filter(
      (f) =>
        /\.tsx?$/u.test(f) && /\):\s*(?:Capturing)?Mailer\s*\{/u.test(read(f)),
    );
    expect(mailerFactories).toEqual(["src/modules/notifications/mailer.ts"]);
    const sdks = codeFiles.filter((f) =>
      /from\s+["'](?:resend|nodemailer|@sendgrid\/[^"']+|postmark)["']/u.test(
        read(f),
      ),
    );
    expect(sdks).toEqual([]);
  });

  it("names no AUTH_RESEND_KEY or ADMIN_MAIL_FROM in code, config or env files", () => {
    const files = [
      ...codeFiles,
      ".env.example",
      "package.json",
      "next.config.ts",
      ...walk(".github"),
    ];
    const stray = files.filter((f) =>
      /AUTH_RESEND_KEY|ADMIN_MAIL_FROM/u.test(read(f)),
    );
    expect(stray).toEqual([]);
  });

  it("declares the four keys in .env.example", () => {
    const example = read(".env.example");
    for (const key of [
      "AUTH_SECRET",
      "RESEND_API_KEY",
      "EMAIL_FROM",
      "MAILER",
    ]) {
      expect(example, key).toMatch(new RegExp(`^${key}=`, "mu"));
    }
  });
});

/* -------------------------------------------------------------------------- */
/* AC-5, AC-6                                                                  */
/* -------------------------------------------------------------------------- */

describe("AC-5 — every /admin response is noindex, nofollow and no-store, private", () => {
  it("sets both headers on /admin and every path under it", () => {
    const rules = adminHeaderRules();
    expect(rules.map((rule) => rule.source)).toEqual([
      "/admin",
      "/admin/:path*",
    ]);
    for (const rule of rules) {
      expect(rule.headers).toEqual([
        { key: "X-Robots-Tag", value: "noindex, nofollow" },
        { key: "Cache-Control", value: "no-store, private" },
      ]);
    }
  });

  it("applies them after the environment-wide noindex rule, and turns on authInterrupts", () => {
    const config = read("next.config.ts");
    const noindex = config.indexOf("...noindexHeaderRules(environment)");
    const admin = config.indexOf("...adminHeaderRules()");
    expect(noindex).toBeGreaterThan(-1);
    expect(admin).toBeGreaterThan(noindex);
    expect(config).toMatch(/experimental:\s*\{\s*authInterrupts:\s*true\s*\}/u);
  });

  it("puts the robots meta on the admin document", () => {
    expect(read("src/app/admin/layout.tsx")).toMatch(
      /robots:\s*"noindex,nofollow"/u,
    );
  });

  it("stamps the core's own responses", () => {
    expect(AUTH_RESPONSE_HEADERS).toEqual({
      "cache-control": "no-store, private",
      "x-robots-tag": "noindex, nofollow",
    });
  });
});

describe("AC-6 — admin is never discoverable (source half; the built-HTML half is e2e)", () => {
  it("disallows /admin/ in robots.txt", () => {
    expect(DISALLOWED_PATHS).toContain("/admin/");
  });

  it("links to /admin from no public source", () => {
    const adminOwned = [
      "src/app/admin/",
      "src/lib/auth/",
      "src/modules/admin/",
      "src/modules/ui/admin/",
      "src/lib/admin-headers.ts",
      "src/modules/seo/robots.ts",
    ];
    const linking = walk("src").filter(
      (f) =>
        /\.tsx?$/u.test(f) &&
        !adminOwned.some((owned) => f.startsWith(owned)) &&
        /href=\{?["'`]\/admin/u.test(read(f)),
    );
    expect(linking).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* AC-7                                                                        */
/* -------------------------------------------------------------------------- */

function keysOf(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    keysOf(child, prefix === "" ? key : `${prefix}.${key}`),
  );
}

describe("AC-7 — admin copy lives only in messages/admin/en.json", () => {
  const sources = walk("src").concat(walk("emails"), walk("scripts"));

  it("is imported by src/modules/admin/messages.ts and nothing else", () => {
    const importers = sources.filter((f) =>
      /messages\/admin\/en(?:\.meta)?\.json/u.test(read(f)),
    );
    expect(importers).toEqual(["src/modules/admin/messages.ts"]);
  });

  it("is reached only from admin code", () => {
    const allowed = [
      "src/app/admin/",
      "src/lib/auth/",
      "src/modules/admin/",
      "emails/admin-",
    ];
    const importers = sources.filter(
      (f) =>
        /\.tsx?$/u.test(f) &&
        /from\s+["'](?:@\/modules\/admin|[./]+\/modules\/admin)[^"']*["']/u.test(
          read(f),
        ),
    );
    expect(importers.length).toBeGreaterThan(0);
    expect(
      importers.filter((f) => !allowed.some((a) => f.startsWith(a))),
    ).toEqual([]);
  });

  it("adds no admin namespace to a public catalogue", () => {
    for (const file of readdirSync(join(repoRoot, "messages"))) {
      if (!file.endsWith(".json")) continue;
      const catalogue = JSON.parse(read(`messages/${file}`)) as Record<
        string,
        unknown
      >;
      expect(Object.keys(catalogue), file).not.toContain("admin");
    }
  });

  it("formats every key and ships every key unreviewed", () => {
    const keys = keysOf(adminMessages);
    const meta = JSON.parse(read("messages/admin/en.meta.json")) as Record<
      string,
      { reviewed: boolean }
    >;
    expect(Object.keys(meta).sort()).toEqual([...keys].sort());
    const params = {
      roles: "admin",
      timeZone: "Europe/Tallinn",
      date: "Sunday 18 October 2026",
      role: "ops",
      name: "Test",
    };
    for (const key of keys) {
      expect(meta[key]?.reviewed, key).toBe(false);
      expect(adminT(key as never, params as never), key).not.toBe(key);
    }
  });
});
