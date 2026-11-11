/**
 * `pnpm i18n:check` check 11's import rule and the admin pages (spec 003 §14 A17 clause 2; spec
 * 012 §5.4; spec 020a §7; TASK-358). Admin is never indexed and renders only its own catalogue, so
 * an admin page reaching a module whose public keys a scope entry claims is not a problem; the same
 * import from a localised page still is, and a shared file is still a root. API route handlers
 * under `src/app/api/` render no page either (TASK-521).
 */
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  NON_INDEXABLE_APP_DIRECTORIES,
  scopeProblems,
} from "../../scripts/i18n-check-scope.ts";

const BASE = "/repo";
const SRC = join(BASE, "src");
const ENTRY = {
  match: "payments.error.*",
  surface: "checkout",
  paths: ["src/modules/payments/**"],
};

function problemsFor(
  importer: string,
  statement = 'import { cancelOrder } from "@/modules/payments";\n',
): string[] {
  const files = new Map<string, string>([
    [join(BASE, importer), statement],
    [join(SRC, "modules/payments/index.ts"), "export const cancelOrder = 1;\n"],
  ]);
  return scopeProblems({
    base: BASE,
    srcDir: SRC,
    display: (absolute) => absolute.slice(BASE.length + 1),
    scopeFile: "src/modules/i18n/review-scope.ts",
    raw: [ENTRY],
    sourceKeys: ["payments.error.cardDeclined"],
    files,
    usageByFile: new Map(),
  }).map((problem) => problem.file);
}

describe("the import rule's roots (spec 003 A17 clause 2)", () => {
  it("names admin and the API route handlers, and only those, as app directories with no indexable page", () => {
    expect(NON_INDEXABLE_APP_DIRECTORIES).toEqual([
      "src/app/admin/",
      "src/app/api/",
    ]);
  });

  it("lets an API route handler reach the module while a [locale] page still may not (TASK-521)", () => {
    expect(problemsFor("src/app/api/basket/unsubscribe/route.ts")).toEqual([]);
    expect(problemsFor("src/app/[locale]/basket/page.tsx")).toEqual([
      "src/modules/payments/index.ts",
    ]);
  });

  it("lets an admin server action reach the payments module", () => {
    expect(
      problemsFor("src/app/admin/(signed-in)/orders/[id]/actions.ts"),
    ).toEqual([]);
  });

  it("still flags the same import from a localised page and from a shared file", () => {
    expect(problemsFor("src/app/[locale]/flowers/page.tsx")).toEqual([
      "src/modules/payments/index.ts",
    ]);
    expect(problemsFor("src/modules/ui/admin/Leak.tsx")).toEqual([
      "src/modules/payments/index.ts",
    ]);
  });
});

describe("the import rule's edges: type-only imports are erased (TASK-521)", () => {
  const PAGE = "src/app/[locale]/page-analytics.tsx";
  const LEAK = ["src/modules/payments/index.ts"];

  it("ignores `import type`, `export type ... from` and an all-type named import", () => {
    expect(
      problemsFor(PAGE, 'import type { Screen } from "@/modules/payments";\n'),
    ).toEqual([]);
    expect(
      problemsFor(PAGE, 'export type { Screen } from "@/modules/payments";\n'),
    ).toEqual([]);
    expect(
      problemsFor(
        PAGE,
        'import { type Screen, type Step } from "@/modules/payments";\n',
      ),
    ).toEqual([]);
  });

  it("still follows a value binding, a mixed import, a side-effect import and import()", () => {
    expect(
      problemsFor(
        PAGE,
        'import { type Screen, cancelOrder } from "@/modules/payments";\n',
      ),
    ).toEqual(LEAK);
    expect(problemsFor(PAGE, 'import "@/modules/payments";\n')).toEqual(LEAK);
    expect(
      problemsFor(PAGE, 'export { cancelOrder } from "@/modules/payments";\n'),
    ).toEqual(LEAK);
    expect(
      problemsFor(
        PAGE,
        'import type { Screen } from "@/modules/payments";\nconst m = import("@/modules/payments");\n',
      ),
    ).toEqual(LEAK);
  });
});
