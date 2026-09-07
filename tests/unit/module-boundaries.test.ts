/**
 * T-10 (spec 001 AC-9, TASK-004; plan/01 §5): `import/no-restricted-paths` module boundaries.
 *
 * Run through the ESLint Node API with the real `eslint.config.mjs` rather than RuleTester,
 * because the rule resolves every specifier and silently skips the ones it cannot resolve — a
 * fixture that only *looks* like a deep import would prove nothing. Two complementary runs:
 *
 *  1. the mirrored fixture tree `tests/fixtures/lint/src/**` (its own resolver project maps
 *     `@/*` onto it), which is what `pnpm lint:fixtures` reports;
 *  2. the real zones on `src/**`, via `lintText` with a `filePath` inside `src/modules/orders/`
 *     importing the real `src/app/page.tsx` and the real `src/modules/catalog/index.ts` barrel.
 */
import { ESLint } from "eslint";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { MODULES, moduleBoundaryZones } from "../../eslint/modules.js";

const repoRoot = resolve(__dirname, "../..");
const RULE = "import/no-restricted-paths";

const eslint = new ESLint({
  cwd: repoRoot,
  ignore: false,
  overrideConfigFile: resolve(repoRoot, "eslint.config.mjs"),
});

const boundaryMessages = async (
  file: string,
): Promise<ESLint.LintResult["messages"]> => {
  const [result] = await eslint.lintFiles([file]);
  return (result?.messages ?? []).filter((m) => m.ruleId === RULE);
};

const boundaryMessagesForText = async (
  code: string,
  filePath: string,
): Promise<ESLint.LintResult["messages"]> => {
  const [result] = await eslint.lintText(code, {
    filePath: resolve(repoRoot, filePath),
  });
  return (result?.messages ?? []).filter((m) => m.ruleId === RULE);
};

describe("module boundaries over the fixtures (T-10)", () => {
  it("fails on a deep import into another module's internals", async () => {
    const messages = await boundaryMessages(
      "tests/fixtures/lint/src/modules/orders/cross-module-import.ts",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toContain(
      "@/modules/catalog/internal/pricing",
    );
    expect(messages[0]?.message).toContain("index.ts");
  });

  it("fails on a modules/ file importing app/", async () => {
    const messages = await boundaryMessages(
      "tests/fixtures/lint/src/modules/orders/module-imports-app.ts",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toContain("@/app/page");
    expect(messages[0]?.message).toContain("never the reverse");
  });

  it("passes on an import through the public barrel", async () => {
    expect(
      await boundaryMessages(
        "tests/fixtures/lint/src/modules/orders/module-imports-valid.ts",
      ),
    ).toEqual([]);
  });
});

describe("module boundaries over real src paths (T-10)", () => {
  it("fails when a module imports a route file", async () => {
    const messages = await boundaryMessagesForText(
      'import Page from "@/app/page";\n\nexport const p = Page;\n',
      "src/modules/orders/probe.ts",
    );
    expect(messages).toHaveLength(1);
  });

  it("passes when a module imports another module's barrel", async () => {
    expect(
      await boundaryMessagesForText(
        'import * as catalog from "@/modules/catalog";\n\nexport const c = catalog;\n',
        "src/modules/orders/probe.ts",
      ),
    ).toEqual([]);
  });

  it("passes when app imports a module barrel (the allowed direction)", async () => {
    expect(
      await boundaryMessagesForText(
        'import * as orders from "@/modules/orders";\n\nexport const o = orders;\n',
        "src/app/probe.ts",
      ),
    ).toEqual([]);
  });

  it("keeps the rule switched on for src/**, with the import plugin registered", async () => {
    const config = await eslint.calculateConfigForFile(
      resolve(repoRoot, "src/modules/orders/probe.ts"),
    );
    expect(config.rules?.[RULE]?.[0]).toBe(2); // normalised severity for "error"
    expect(Object.keys(config.plugins ?? {})).toContain("import");
  });
});

describe("zone generation from the module manifest", () => {
  const zones = moduleBoundaryZones();

  it("covers the app rule plus one zone per module", () => {
    expect(MODULES).toHaveLength(11);
    expect(zones).toHaveLength(MODULES.length + 1);
    expect(zones[0]).toMatchObject({
      target: "src/modules/**",
      from: "src/app/**",
    });
  });

  it("lets each module import only the other modules' barrels", () => {
    for (const name of MODULES) {
      const zone = zones.find((z) => z.target === `src/modules/${name}/**`);
      expect(zone).toBeDefined();
      const from = zone?.from as string[];
      const except = zone?.except ?? [];
      expect(from).toHaveLength(MODULES.length - 1);
      expect(from).not.toContain(`src/modules/${name}/**`);
      expect(except).toHaveLength(MODULES.length - 1);
      for (const other of MODULES.filter((m) => m !== name)) {
        expect(from).toContain(`src/modules/${other}/**`);
        expect(except).toContain(
          `**/src/modules/${other}/index.{ts,tsx,js,jsx}`,
        );
      }
    }
  });

  it("re-roots onto the fixture mirror when asked", () => {
    const mirrored = moduleBoundaryZones({
      srcRoot: "tests/fixtures/lint/src",
    });
    expect(mirrored[0]).toMatchObject({
      target: "tests/fixtures/lint/src/modules/**",
      from: "tests/fixtures/lint/src/app/**",
    });
  });
});
