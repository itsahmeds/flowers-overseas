/**
 * T-41 / AC-41 and T-43 / AC-43 (spec 003 §14 A17; TASK-224): `pnpm i18n:check` check 11, "scope",
 * and the summary's counted columns and unapproved buyer-facing list.
 *
 * The real CLI runs in a child process inside a sandbox tree built here (its own `messages/`,
 * `src/` and `scope.json`), the way `i18n-check.test.ts` runs it over `tests/fixtures`: the exit
 * code is the criterion. The sandbox mirrors the repository layout (`src/app/[locale]/`,
 * `src/modules/{ui,catalog}/`), so the registry's globs and the check's shared-file list read the
 * same paths they read in the repository.
 *
 * Each seeded fault must exit non-zero naming the entry and the file; the repaired tree exits 0.
 * Mutations watched red (A17's T-41 row): delete the scan half of check 11 and the
 * `src/modules/catalog/` case passes; empty the shared-file list and the `src/modules/ui/**` glob
 * passes; follow direct imports only and the case imported through an intermediate file passes.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../..");
const sandboxes: string[] = [];

afterAll(() => {
  for (const dir of sandboxes) rmSync(dir, { recursive: true, force: true });
});

interface CliResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

function run(cwd: string, ...args: readonly string[]): CliResult {
  try {
    const stdout = execFileSync(
      process.execPath,
      [join(repoRoot, "scripts/i18n-check.ts"), ...args],
      { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    const failure = error as {
      status?: number;
      stdout?: string;
      stderr?: string;
    };
    return {
      status: failure.status ?? 1,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
    };
  }
}

type Files = Readonly<Record<string, string>>;

function sandbox(files: Files): string {
  const dir = mkdtempSync(join(tmpdir(), "i18n-scope-"));
  sandboxes.push(dir);
  for (const [path, content] of Object.entries(files)) {
    const full = join(dir, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}

const sha = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

/** `en.json` + `en.meta.json` for a flat `{ namespace: { name: value } }` tree. */
function catalogue(
  tree: Readonly<Record<string, Readonly<Record<string, string>>>>,
  reviewed: (key: string) => boolean,
): Files {
  const meta: Record<string, unknown> = {};
  for (const [namespace, entries] of Object.entries(tree)) {
    for (const [name, value] of Object.entries(entries)) {
      const key = `${namespace}.${name}`;
      meta[key] = {
        source: "human",
        reviewed: reviewed(key),
        ...(reviewed(key)
          ? { reviewedBy: "founder", reviewedAt: "2026-10-05T00:00:00Z" }
          : {}),
        sourceHash: sha(value),
        retained: true,
      };
    }
  }
  return {
    "messages/en.json": JSON.stringify(tree),
    "messages/en.meta.json": JSON.stringify(meta),
  };
}

// ---------------------------------------------------------------------------------------------
// T-41: check 11
// ---------------------------------------------------------------------------------------------

const CHECKOUT_PATHS = [
  "src/app/[locale]/(checkout)/**",
  "src/modules/checkout/**",
];
const ENTRY = {
  match: "checkout",
  surface: "checkout",
  paths: CHECKOUT_PATHS,
};

// A flat two-level tree keeps `catalogue()` simple: `checkout.review`.
const FLAT = {
  common: { back: "Back" },
  checkout: { review: "Review your order" },
};

/** A tree that passes check 11: nothing indexable reaches the checkout files. */
const GOOD: Files = {
  ...catalogue(FLAT, () => true),
  "scope.json": JSON.stringify([ENTRY]),
  "src/app/[locale]/product/page.tsx":
    'import { Button } from "@/modules/ui/Button";\nexport const a = ["common.back", Button];\n',
  "src/app/[locale]/(checkout)/page.tsx":
    'import { Summary } from "@/modules/checkout/Summary";\nexport const b = Summary;\n',
  "src/modules/checkout/Summary.tsx":
    'import { Button } from "@/modules/ui/Button";\nexport const Summary = [Button, "checkout.review"];\n',
  "src/modules/ui/Button.tsx": "export const Button = 1;\n",
  "src/modules/catalog/Card.tsx": "export const Card = 1;\n",
};

function check(files: Files): CliResult {
  return run(sandbox({ ...GOOD, ...files }), "--scope", "scope.json");
}

describe("check 11 on a repaired tree (AC-41)", () => {
  it("exits 0 and says nothing about the scope", () => {
    const result = check({});
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });

  it("exits 0 on the committed tree", () => {
    const result = run(repoRoot);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });
});

describe("check 11 names the entry and the file for each seeded fault (AC-41)", () => {
  it("a `match` that reaches no `en` key", () => {
    const result = check({
      "scope.json": JSON.stringify([{ ...ENTRY, match: "checkoutt" }]),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("scope.json");
    expect(result.stderr).toContain(
      'scope entry 1 (match "checkoutt", surface "checkout") matches no `en` key',
    );
  });

  it("a `surface` outside the closed set", () => {
    const result = check({
      "scope.json": JSON.stringify([{ ...ENTRY, surface: "billing" }]),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("scope.json");
    expect(result.stderr).toContain(
      'scope entry 1 (match "checkout", surface "billing")',
    );
    expect(result.stderr).toContain(
      'surface "billing" is outside the closed set',
    );
  });

  it("`checkout.review` read from a file under src/modules/catalog/", () => {
    const result = check({
      "src/modules/catalog/Leak.tsx":
        'export const t = (x: (k: string) => string) => x("checkout.review");\n',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("src/modules/catalog/Leak.tsx");
    expect(result.stderr).toContain("[checkout.review]");
    expect(result.stderr).toContain(
      'scope entry 1 (match "checkout", surface "checkout")',
    );
  });

  it("a `paths` glob that matches src/modules/ui/**", () => {
    const result = check({
      "scope.json": JSON.stringify([
        { ...ENTRY, paths: [...CHECKOUT_PATHS, "src/modules/ui/**"] },
      ]),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("scope.json");
    expect(result.stderr).toContain('paths glob "src/modules/ui/**"');
    expect(result.stderr).toContain("src/modules/ui/");
  });

  it("a checkout file imported through one intermediate file by a product page", () => {
    const result = check({
      "src/app/[locale]/product/page.tsx":
        'import { Glue } from "../../../modules/glue/Glue";\nexport const a = ["common.back", Glue];\n',
      "src/modules/glue/Glue.tsx":
        'import { Picker } from "@/modules/checkout/Picker";\nexport const Glue = Picker;\n',
      "src/modules/checkout/Picker.tsx": "export const Picker = 1;\n",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("src/modules/checkout/Picker.tsx");
    expect(result.stderr).toContain(
      'scope entry 1 (match "checkout", surface "checkout")',
    );
    expect(result.stderr).toContain(
      "src/app/[locale]/product/page.tsx -> src/modules/glue/Glue.tsx -> src/modules/checkout/Picker.tsx",
    );
  });

  it("follows `export from` and a literal `import()` as well as `import`", () => {
    for (const body of [
      'export { Picker } from "@/modules/checkout/Picker";\n',
      'export const load = () => import("@/modules/checkout/Picker");\n',
    ]) {
      const result = check({
        "src/app/[locale]/product/page.tsx": `${body}export const a = "common.back";\n`,
        "src/modules/checkout/Picker.tsx": "export const Picker = 1;\n",
      });
      expect(result.status, body).toBe(1);
      expect(result.stderr, body).toContain("src/modules/checkout/Picker.tsx");
    }
  });

  it("a shared file that imports a checkout file", () => {
    const result = check({
      "src/modules/ui/Banner.tsx":
        'import { Summary } from "@/modules/checkout/Summary";\nexport const Banner = Summary;\n',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("src/modules/checkout/Summary.tsx");
  });

  it("does not flag a checkout page that imports a checkout file", () => {
    const result = check({
      "src/app/[locale]/(checkout)/confirm/page.tsx":
        'import { Summary } from "@/modules/checkout/Summary";\nexport const c = Summary;\n',
    });
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });

  it("flags a malformed registry file rather than ignoring it", () => {
    const result = check({ "scope.json": '{"match": "checkout"}' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("is not a scope registry");
  });
});

// ---------------------------------------------------------------------------------------------
// T-43: the summary
// ---------------------------------------------------------------------------------------------

function fixtureTree(opts: {
  readonly unreviewedCounted: number;
  readonly checkoutReviewed: boolean;
  readonly extra?: Readonly<Record<string, Record<string, string>>>;
}): Files {
  const shared: Record<string, string> = {};
  const checkout: Record<string, string> = {};
  for (let index = 0; index < 100; index += 1)
    shared[`k${String(index)}`] = `Value ${String(index)}`;
  for (let index = 0; index < 50; index += 1)
    checkout[`s${String(index)}`] = `Step ${String(index)}`;
  return {
    ...catalogue({ shared, checkout, ...(opts.extra ?? {}) }, (key) => {
      if (key.startsWith("checkout.")) return opts.checkoutReviewed;
      if (key.startsWith("shared.k")) {
        return Number(key.slice("shared.k".length)) >= opts.unreviewedCounted;
      }
      return false;
    }),
    "scope.json": JSON.stringify([
      { match: "checkout", surface: "checkout", paths: ["src/checkout/**"] },
      ...(opts.extra === undefined
        ? []
        : [
            {
              match: "floristInbox",
              surface: "florist",
              paths: ["src/florist/**"],
            },
          ]),
    ]),
    "src/checkout/x.ts": "export const x = 1;\n",
  };
}

function summary(files: Files): CliResult {
  return run(sandbox(files), "--scope", "scope.json", "--summary");
}

describe("the summary prints the counted columns and the unapproved list (AC-43)", () => {
  it("fixture (b): share 6.0 %, not indexable, 50 keys not counted, list none", () => {
    const result = summary(
      fixtureTree({ unreviewedCounted: 6, checkoutReviewed: true }),
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      "| `en` | 150 | 100 | 50 | 0 | 6 | 6.0% | 0 | no |",
    );
    expect(result.stdout).toMatch(
      /Buyer-facing keys not yet approved[\s\S]*none/,
    );
  });

  it("fixture (a): share 4.0 %, indexable, the list is exactly the 50 checkout keys", () => {
    const result = summary(
      fixtureTree({ unreviewedCounted: 4, checkoutReviewed: false }),
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      "| `en` | 150 | 100 | 50 | 0 | 4 | 4.0% | 0 | yes |",
    );
    const listed = result.stdout
      .split("\n")
      .filter((line) => line.startsWith("- `"))
      .map((line) => line.slice(3, -1))
      .sort();
    const expected = Array.from(
      { length: 50 },
      (_unused, index) => `checkout.s${String(index)}`,
    ).sort();
    expect(listed).toEqual(expected);
    expect(result.stdout).not.toMatch(/\bnone\b/);
  });

  it("lists buyer-facing surfaces only: an unreviewed florist key is not on it", () => {
    const result = summary(
      fixtureTree({
        unreviewedCounted: 4,
        checkoutReviewed: true,
        extra: { floristInbox: { title: "Inbox" } },
      }),
    );
    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain("floristInbox.title");
    expect(result.stdout).toMatch(
      /Buyer-facing keys not yet approved[\s\S]*none/,
    );
    expect(result.stdout).toContain(
      "| `en` | 151 | 100 | 51 | 0 | 4 | 4.0% | 0 | yes |",
    );
  });
});
