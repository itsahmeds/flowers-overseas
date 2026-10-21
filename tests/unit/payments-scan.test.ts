/**
 * Source scans for spec 013 (TASK-255):
 *  - AC-14 (T-14 unit half): `payment.capture_failed` and `payment.auth_expiring`, the alerts the
 *    founder's ruling retired, appear nowhere in `src/` and in no row of §11's alert table.
 *  - AC-35 (T-35): `payments.confirmation.held` and `payments.confirmation.paidNow` appear in no
 *    source file.
 *  - AC-9 (T-09 lint half): `fo/no-float-money` is on, at error, for `src/modules/payments` and
 *    reports nothing there. (`src/modules/orders/outbox` is TASK-254's; the same `src/**` block
 *    covers it.)
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return filesUnder(path);
    return /\.(ts|tsx|js|mjs|json|css)$/.test(name) ? [path] : [];
  });
}

const SOURCE = filesUnder(resolve(repoRoot, "src")).map((path) => ({
  path: relative(repoRoot, path),
  text: readFileSync(path, "utf8"),
}));

/** Built from parts so this file is not itself a hit for a scan of the repository. */
const RETIRED_ALERTS = [
  ["payment", "capture_failed"].join("."),
  ["payment", "auth_expiring"].join("."),
];
const RETIRED_KEYS = [
  ["payments", "confirmation", "held"].join("."),
  ["payments", "confirmation", "paidNow"].join("."),
];

function hits(needles: readonly string[]): string[] {
  return SOURCE.flatMap(({ path, text }) =>
    needles
      .filter((needle) => text.includes(needle))
      .map((needle) => `${path}: ${needle}`),
  );
}

describe("retired names are absent from src/ (spec 013 AC-14, AC-35)", () => {
  it("scans a real tree", () => {
    expect(
      SOURCE.some(({ path }) => path === "src/modules/payments/provider.ts"),
    ).toBe(true);
  });

  it("no source file names payment.capture_failed or payment.auth_expiring", () => {
    expect(hits(RETIRED_ALERTS)).toEqual([]);
  });

  it("no source file names payments.confirmation.held or .paidNow", () => {
    expect(hits(RETIRED_KEYS)).toEqual([]);
  });

  it("the scan finds a planted name", () => {
    const planted = [
      { path: "src/x.ts", text: `alert("${RETIRED_ALERTS[0] ?? ""}")` },
    ];
    expect(
      planted.flatMap(({ text }) =>
        RETIRED_ALERTS.filter((needle) => text.includes(needle)),
      ),
    ).toEqual([RETIRED_ALERTS[0]]);
  });

  it("§11's alert table lists neither retired alert", () => {
    const spec = readFileSync(
      resolve(repoRoot, "specs/013-payments-order-state-machine.md"),
      "utf8",
    );
    const section = spec.slice(
      spec.indexOf("## 11. Observability"),
      spec.indexOf("## 12. Rollout"),
    );
    const alerts = section
      .split("\n")
      .filter((line) => line.startsWith("| `"))
      .map((line) => /^\| `([^`]+)`/.exec(line)?.[1]);
    expect(alerts).toContain("payment.unexpected_hold");
    expect(alerts.length).toBe(12);
    for (const retired of RETIRED_ALERTS) expect(alerts).not.toContain(retired);
  });
});

describe("fo/no-float-money on the payments module (spec 013 AC-9, T-09)", () => {
  const eslint = new ESLint({
    cwd: repoRoot,
    overrideConfigFile: resolve(repoRoot, "eslint.config.mjs"),
  });

  it("is on, at error, for every file of src/modules/payments", async () => {
    const files = SOURCE.filter(({ path }) =>
      path.startsWith("src/modules/payments/"),
    );
    expect(files.length).toBeGreaterThanOrEqual(10);
    for (const { path } of files) {
      const config = (await eslint.calculateConfigForFile(path)) as {
        rules?: Record<string, unknown>;
      };
      const setting = config.rules?.["fo/no-float-money"];
      expect(Array.isArray(setting) ? setting[0] : setting, path).toBe(2);
    }
  });

  it("reports nothing there", async () => {
    const results = await eslint.lintFiles(["src/modules/payments/**/*.ts"]);
    expect(results.length).toBeGreaterThanOrEqual(10);
    expect(
      results.flatMap((result) =>
        result.messages
          .filter((message) => message.ruleId === "fo/no-float-money")
          .map(
            (message) =>
              `${relative(repoRoot, result.filePath)}:${String(message.line)}`,
          ),
      ),
    ).toEqual([]);
  });

  it("would report a float amount planted there", async () => {
    const [result] = await eslint.lintText(
      "export const amount: number = 45.9;\n",
      {
        filePath: "src/modules/payments/planted.ts",
      },
    );
    expect(result?.messages.map((message) => message.ruleId)).toContain(
      "fo/no-float-money",
    );
  });
});
