/**
 * Spec 020a T-03, source half (AC-2; TASK-358): every server action under `src/app/admin/(signed-in)/orders`
 * calls `requirePermission` as its first statement, and each admin order command
 * (`adminOrderReroute`, `adminOrderCancel`, `adminOrderRefund`, `adminResendNotification`) asks its guard for its own
 * permission first. The set of actions is enumerated from the file tree (every `"use server"`
 * file's exported async functions), never a hand list; the fixtures prove the scan bites.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "../..");
const ORDERS_APP = join(ROOT, "src/app/admin/(signed-in)/orders");
const COMMANDS = {
  "src/modules/admin/order-actions/reroute.ts": [
    "adminOrderReroute",
    "orders.reroute",
  ],
  "src/modules/admin/order-actions/cancel.ts": [
    "adminOrderCancel",
    "orders.cancel",
  ],
  "src/modules/admin/order-actions/refund.ts": [
    "adminOrderRefund",
    "orders.refund",
  ],
  // TASK-360: resend, admin and ops.
  "src/modules/admin/order-actions/resend.ts": [
    "adminResendNotification",
    "orders.resend",
  ],
} as const;

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return filesUnder(path);
    return /\.tsx?$/u.test(name) ? [path] : [];
  });
}

/** Each exported async function of `source` with the first statement of its body. */
function firstStatements(source: string): { name: string; first: string }[] {
  const found: { name: string; first: string }[] = [];
  const header = /export async function (\w+)\s*\(/gu;
  for (const match of source.matchAll(header)) {
    // The body opens at the first `{` after the parameter list closes (no parameter here holds
    // a parenthesis).
    const from = (match.index ?? 0) + match[0].length;
    const brace = source.indexOf("{", source.indexOf(")", from));
    const body = source.slice(brace + 1).trimStart();
    found.push({
      name: match[1] ?? "",
      first: body.slice(0, body.indexOf(";") + 1),
    });
  }
  return found;
}

const GUARD_FIRST =
  /^(?:const \w+ = )?await requirePermission\("orders\.[a-z]+"\);$/u;

function unguarded(source: string): string[] {
  return firstStatements(source)
    .filter(({ first }) => !GUARD_FIRST.test(first))
    .map(({ name }) => name);
}

describe("T-03 the guard is the first statement (spec 020a AC-2)", () => {
  it("holds for every server action under src/app/admin/(signed-in)/orders", () => {
    const actionFiles = filesUnder(ORDERS_APP).filter((file) =>
      /^\s*(?:\/\*[\s\S]*?\*\/\s*)?["']use server["']/u.test(
        readFileSync(file, "utf8"),
      ),
    );
    const actions = actionFiles.flatMap((file) =>
      firstStatements(readFileSync(file, "utf8")).map(
        ({ name }) => `${relative(ROOT, file)}#${name}`,
      ),
    );
    expect(actions.length).toBeGreaterThanOrEqual(3);
    expect(
      actionFiles.flatMap((file) =>
        unguarded(readFileSync(file, "utf8")).map(
          (name) => `${relative(ROOT, file)}#${name}`,
        ),
      ),
    ).toEqual([]);
  });

  it("holds for each admin order command, with its own permission", () => {
    for (const [file, [name, permission]] of Object.entries(COMMANDS)) {
      const first = firstStatements(
        readFileSync(join(ROOT, file), "utf8"),
      ).find((fn) => fn.name === name)?.first;
      expect(first, file).toBe(
        `const session = await (deps.guard ?? defaultGuard)("${permission}");`,
      );
    }
  });

  it.each([
    [
      "a read before the guard",
      'export async function a(formData: FormData): Promise<void> {\n  const input = fields(formData);\n  await requirePermission("orders.cancel");\n}',
    ],
    [
      "no guard at all",
      "export async function b(formData: FormData): Promise<void> {\n  redirect('/admin');\n}",
    ],
  ])("catches %s", (_label, source) => {
    expect(unguarded(source)).toHaveLength(1);
  });
});
