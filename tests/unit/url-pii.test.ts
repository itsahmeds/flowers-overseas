/**
 * T-59 (spec 001 §14 A20, AC-55; TASK-160): no PII in our URLs.
 *
 * `urlPiiViolations(root)` fails when:
 * - (a) a dynamic segment under `src/app/` (`[x]`, `[...x]`, `[[...x]]`) is a name `isRedactedKey`
 *   accepts;
 * - (b) an entry of `QUERY_KEYS` (`src/config/url-keys.ts`) or of `EXTERNAL_QUERY_KEYS` (below) is
 *   such a name;
 * - (c) the code under `src/` names a query key that is in neither list: a string first argument
 *   to a `URLSearchParams` `get`, `getAll`, `has`, `set`, `append` or `delete`; a key of an object
 *   literal given to `new URLSearchParams({…})`; or a `?key=` / `&key=` inside a string or template
 *   literal. An `EXTERNAL_QUERY_KEYS` entry allows its key in its own file only;
 * - (e) an `EXTERNAL_QUERY_KEYS` entry's file no longer names its key.
 * And `schemaViolations()` is (d): a query-string schema honours a key outside `QUERY_KEYS`.
 *
 * **The receiver is identified by the TypeScript type checker, never by the method name** (the
 * `/break 108` carry-forward). One `ts.Program` is built from the tree's `tsconfig.json` over
 * `src/`, and for each call the checker gives the symbol of the method name; the call counts when
 * one of its declarations belongs to an interface or class named `URLSearchParams`, or to one that
 * inherits from it (Next's `ReadonlyURLSearchParams` overrides `set`/`append`/`delete`). A
 * `Headers`, `Map` or `Set` with the same method names never counts. The `receiver: "name"` mode
 * exists only to prove that: on the real tree it goes red.
 *
 * Said plainly (AC-55): a key built at run time is not seen, and a visitor can type `?email=` into
 * any URL. That URL is not ours; AC-54's scan keeps it out of logs and Sentry.
 */
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import ts from "typescript";
import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { REDACTED_KEYS, isRedactedKey } from "../../src/lib/logger";
import { ListingSearchParamsSchema } from "../../src/modules/catalog/schemas";
import { listingSorts } from "../../src/modules/catalog/types";

const repoRoot = resolve(__dirname, "../..");

/**
 * Query keys of URLs we do not route (advisor fix 1): a third party's loader, a map or share link,
 * a payment redirect. Each entry is `path#key` with a one-line reason. It lives here and not in
 * `src/config/url-keys.ts`, so no schema of ours can read it and start honouring a key such as
 * `id`. Adding an entry means changing this file, and the reviewer names that change.
 */
const EXTERNAL_QUERY_KEYS: readonly {
  readonly entry: string;
  readonly reason: string;
}[] = [
  {
    entry: "src/modules/analytics/ga4.ts#id",
    reason:
      "Google's tag loader takes the measurement id as `?id=` (ga4.ts L13)",
  },
];
const EXTERNAL = EXTERNAL_QUERY_KEYS.map(({ entry }) => entry);

const METHODS = new Set(["get", "getAll", "has", "set", "append", "delete"]);
const SEGMENT = /^\[{1,2}(?:\.\.\.)?([^\]]+)\]{1,2}$/;
const LITERAL_KEY = /[?&]([A-Za-z0-9_.~%[\]-]+)=/g;

interface NamedKey {
  readonly file: string;
  readonly line: number;
  readonly key: string;
  readonly how: string;
}

type Receiver = "checker" | "name";

function posix(path: string): string {
  return path.split(sep).join("/");
}

function dirsUnder(dir: string): string[] {
  let out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out = [...out, full, ...dirsUnder(full)];
  }
  return out;
}

/** `QUERY_KEYS`, read from the tree's `src/config/url-keys.ts` without importing it. */
function readQueryKeys(root: string): string[] | undefined {
  const path = join(root, "src/config/url-keys.ts");
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  let keys: string[] | undefined;
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "QUERY_KEYS" &&
      node.initializer !== undefined
    ) {
      let init: ts.Expression = node.initializer;
      while (ts.isAsExpression(init) || ts.isSatisfiesExpression(init)) {
        init = init.expression;
      }
      if (ts.isArrayLiteralExpression(init)) {
        keys = init.elements.flatMap((element) =>
          ts.isStringLiteralLike(element) ? [element.text] : [],
        );
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return keys;
}

/** Whether a class or interface is `URLSearchParams` or inherits from it. */
function isUrlSearchParamsType(
  checker: ts.TypeChecker,
  type: ts.Type,
  seen: Set<ts.Type> = new Set(),
): boolean {
  if (seen.has(type)) return false;
  seen.add(type);
  if (type.getSymbol()?.getName() === "URLSearchParams") return true;
  if (type.isClassOrInterface()) {
    return (checker.getBaseTypes(type) ?? []).some((base) =>
      isUrlSearchParamsType(checker, base, seen),
    );
  }
  return false;
}

function ownerIsUrlSearchParams(
  checker: ts.TypeChecker,
  declaration: ts.Declaration,
): boolean {
  const owner = declaration.parent;
  if (
    (ts.isInterfaceDeclaration(owner) || ts.isClassLike(owner)) &&
    owner.name !== undefined
  ) {
    if (owner.name.text === "URLSearchParams") return true;
    const symbol = checker.getSymbolAtLocation(owner.name);
    return (
      symbol !== undefined &&
      isUrlSearchParamsType(checker, checker.getDeclaredTypeOfSymbol(symbol))
    );
  }
  return false;
}

const namedCache = new Map<string, NamedKey[]>();

/** Every query key the code under `root/src/` names, by the three shapes of AC-55 (c). */
function namedQueryKeys(root: string, receiver: Receiver): NamedKey[] {
  const cacheKey = `${root}\0${receiver}`;
  const cached = namedCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const configPath = join(root, "tsconfig.json");
  const read = ts.readConfigFile(configPath, (path) => ts.sys.readFile(path));
  if (read.error !== undefined) throw new Error(`cannot read ${configPath}`);
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, root);
  const srcDir = `${resolve(root, "src")}${sep}`;
  const rootNames = parsed.fileNames.filter((file) =>
    resolve(file).startsWith(srcDir),
  );
  const program = ts.createProgram({
    rootNames,
    options: {
      ...parsed.options,
      incremental: false,
      noEmit: true,
    },
  });
  const checker = program.getTypeChecker();
  /**
   * The keys an expression names: a string literal, or any expression whose type the checker
   * knows as a string literal or a union of them (`const K = "email"`, /break 117 hole 7).
   */
  const keysOf = (expression: ts.Expression): string[] => {
    if (ts.isStringLiteralLike(expression)) return [expression.text];
    const type = checker.getTypeAtLocation(expression);
    const members = type.isUnion() ? type.types : [type];
    return members.every((member) => member.isStringLiteral())
      ? members.map((member) => (member as ts.StringLiteralType).value)
      : [];
  };
  const roots = new Set(rootNames.map((file) => resolve(file)));
  const found: NamedKey[] = [];

  for (const source of program.getSourceFiles()) {
    if (!roots.has(resolve(source.fileName))) continue;
    const file = posix(relative(root, source.fileName));
    const push = (node: ts.Node, key: string, how: string): void => {
      const { line } = source.getLineAndCharacterOfPosition(
        node.getStart(source),
      );
      found.push({ file, line: line + 1, key, how });
    };
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        METHODS.has(node.expression.name.text)
      ) {
        const [first] = node.arguments;
        const keys = first === undefined ? [] : keysOf(first);
        if (keys.length > 0) {
          const counts =
            receiver === "name" ||
            (
              checker.getSymbolAtLocation(node.expression.name)?.declarations ??
              []
            ).some((declaration) =>
              ownerIsUrlSearchParams(checker, declaration),
            );
          if (counts && first !== undefined) {
            for (const key of keys) {
              push(first, key, `URLSearchParams.${node.expression.name.text}`);
            }
          }
        }
      }
      if (ts.isNewExpression(node)) {
        const [first] = node.arguments ?? [];
        const isParams =
          receiver === "name"
            ? node.expression.getText(source) === "URLSearchParams"
            : isUrlSearchParamsType(checker, checker.getTypeAtLocation(node));
        if (isParams && first !== undefined) {
          if (ts.isObjectLiteralExpression(first)) {
            for (const property of first.properties) {
              const name = property.name;
              const keys =
                name === undefined
                  ? []
                  : ts.isIdentifier(name) || ts.isStringLiteralLike(name)
                    ? [name.text]
                    : ts.isComputedPropertyName(name)
                      ? keysOf(name.expression)
                      : [];
              for (const key of keys) {
                push(name ?? property, key, "new URLSearchParams({…})");
              }
            }
          }
          // `new URLSearchParams([["email", x]])` (/break 117 hole 7).
          if (ts.isArrayLiteralExpression(first)) {
            for (const pair of first.elements) {
              const [key] = ts.isArrayLiteralExpression(pair)
                ? pair.elements
                : [];
              for (const name of key === undefined ? [] : keysOf(key)) {
                push(key ?? pair, name, "new URLSearchParams([[…]])");
              }
            }
          }
        }
      }
      if (
        ts.isStringLiteralLike(node) ||
        ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) ||
        ts.isTemplateTail(node)
      ) {
        for (const match of node.text.matchAll(LITERAL_KEY)) {
          const key = match[1];
          if (key !== undefined) push(node, key, "literal");
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  namedCache.set(cacheKey, found);
  return found;
}

function urlPiiViolations(
  root: string,
  options: {
    readonly external?: readonly string[];
    readonly receiver?: Receiver;
  } = {},
): string[] {
  const external = options.external ?? EXTERNAL;
  const violations: string[] = [];

  // (a) dynamic segments under src/app/.
  for (const dir of dirsUnder(join(root, "src/app"))) {
    const name = SEGMENT.exec(dir.slice(dir.lastIndexOf(sep) + 1))?.[1];
    if (name !== undefined && isRedactedKey(name)) {
      violations.push(
        `${posix(relative(root, dir))}: dynamic segment "${name}" is a PII key name (AC-55 (a))`,
      );
    }
  }

  // (b) the two lists.
  const queryKeys = readQueryKeys(root);
  if (queryKeys === undefined || queryKeys.length === 0) {
    violations.push(
      "src/config/url-keys.ts: no QUERY_KEYS array literal found (AC-55 (b))",
    );
  }
  for (const key of queryKeys ?? []) {
    if (isRedactedKey(key)) {
      violations.push(
        `src/config/url-keys.ts: QUERY_KEYS entry "${key}" is a PII key name (AC-55 (b))`,
      );
    }
  }
  const entries = external.map((entry) => {
    const hash = entry.lastIndexOf("#");
    return { entry, file: entry.slice(0, hash), key: entry.slice(hash + 1) };
  });
  for (const { entry, key } of entries) {
    if (isRedactedKey(key)) {
      violations.push(
        `EXTERNAL_QUERY_KEYS: entry "${entry}" is a PII key name (AC-55 (b))`,
      );
    }
  }

  // (c) every key the code names is in one of the lists.
  const named = namedQueryKeys(root, options.receiver ?? "checker");
  for (const { file, line, key, how } of named) {
    const allowed =
      (queryKeys ?? []).includes(key) ||
      entries.some((entry) => entry.file === file && entry.key === key);
    if (!allowed) {
      violations.push(
        `${file}:${String(line)}: query key "${key}" (${how}) is in neither QUERY_KEYS nor EXTERNAL_QUERY_KEYS (AC-55 (c))`,
      );
    }
  }

  // (e) no stale external entry.
  for (const { entry, file, key } of entries) {
    if (!named.some((n) => n.file === file && n.key === key)) {
      violations.push(
        `EXTERNAL_QUERY_KEYS: entry "${entry}": ${file} no longer names "${key}" (AC-55 (e))`,
      );
    }
  }
  return violations;
}

/** One query-string schema: what it returns names the keys it honoured. */
interface QuerySchema {
  readonly name: string;
  readonly schema: z.ZodType<{ readonly honoured: readonly string[] }>;
  /** A valid value for each key the schema is meant to honour. */
  readonly valid: Readonly<Record<string, string>>;
}

/** Every query-string schema of ours; each later one joins this list (AC-55 (d)). */
const QUERY_SCHEMAS: readonly QuerySchema[] = [
  {
    name: "ListingSearchParamsSchema",
    schema: ListingSearchParamsSchema,
    valid: { page: "2", sort: listingSorts[1] ?? "" },
  },
];

/** Every key on the logger's list, plus a key for each prefix and the `*name` suffix. */
const PII_KEYS = [
  ...REDACTED_KEYS,
  "phone_e164",
  "address_line1",
  "card_number",
  "recipient_name",
  "name",
];

/** (d): given the valid keys and every PII key, the schema honours only `QUERY_KEYS`. */
function schemaViolations(
  schemas: readonly QuerySchema[],
  queryKeys: readonly string[],
): string[] {
  const violations: string[] = [];
  for (const { name, schema, valid } of schemas) {
    const input: Record<string, string> = {};
    for (const key of PII_KEYS) input[key] = "jane@example.com";
    Object.assign(input, valid);
    for (const key of schema.parse(input).honoured) {
      if (!queryKeys.includes(key)) {
        violations.push(
          `${name}: honours "${key}", which is outside QUERY_KEYS (AC-55 (d))`,
        );
      }
    }
  }
  return violations;
}

// Scratch trees under `node_modules/.cache/`, as `lint-coverage.test.ts` does: the checker there
// resolves `typescript`'s libs, `@types/node` and `next` from the repository's own `node_modules`.
const SCRATCH_PARENT = resolve(repoRoot, "node_modules/.cache");
const scratchDirs: string[] = [];
afterAll(() => {
  for (const dir of scratchDirs) rmSync(dir, { recursive: true, force: true });
});

const SCRATCH_TSCONFIG = JSON.stringify({
  compilerOptions: {
    target: "ES2022",
    lib: ["dom", "dom.iterable", "esnext"],
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    module: "esnext",
    moduleResolution: "bundler",
    types: ["node"],
  },
  include: ["src/**/*.ts", "src/**/*.tsx"],
});

const URL_KEYS_TODAY = 'export const QUERY_KEYS = ["page", "sort"] as const;\n';

function scratchTree(files: Readonly<Record<string, string>>): string {
  mkdirSync(SCRATCH_PARENT, { recursive: true });
  const root = mkdtempSync(join(SCRATCH_PARENT, "fo-url-pii-"));
  scratchDirs.push(root);
  const all: Record<string, string> = {
    "tsconfig.json": SCRATCH_TSCONFIG,
    "src/config/url-keys.ts": URL_KEYS_TODAY,
    ...files,
  };
  for (const [path, text] of Object.entries(all)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

const GA4_LIKE = [
  "const ORIGIN = 'https://www.googletagmanager.com';",
  "export const tag = (id: string): string => `${ORIGIN}/gtag/js?id=${id}`;",
  "",
].join("\n");

describe("the real tree (T-59)", () => {
  it("is green with EXTERNAL_QUERY_KEYS = [src/modules/analytics/ga4.ts#id]", () => {
    expect(EXTERNAL).toEqual(["src/modules/analytics/ga4.ts#id"]);
    expect(urlPiiViolations(repoRoot)).toEqual([]);
  });

  it("finds the listing's page and ga4's id, so the scan is not reading nothing", () => {
    const named = namedQueryKeys(repoRoot, "checker");
    expect(
      named.some(
        (n) => n.file === "src/modules/analytics/ga4.ts" && n.key === "id",
      ),
    ).toBe(true);
    expect(named.some((n) => n.key === "page")).toBe(true);
  });

  it("keeps today's four dynamic segments, none a PII key", () => {
    const names = dirsUnder(join(repoRoot, "src/app")).flatMap((dir) => {
      const name = SEGMENT.exec(dir.slice(dir.lastIndexOf(sep) + 1))?.[1];
      return name === undefined ? [] : [name];
    });
    expect([...new Set(names)].sort()).toEqual([
      "child",
      "grandchild",
      "locale",
      "segment",
    ]);
  });

  it("reads QUERY_KEYS = page, sort from src/config/url-keys.ts", () => {
    expect(readQueryKeys(repoRoot)).toEqual(["page", "sort"]);
  });

  it("goes red when the receiver is matched by method name instead of the checker", () => {
    const violations = urlPiiViolations(repoRoot, { receiver: "name" });
    expect(
      violations.some((v) =>
        v.startsWith(
          'src/lib/consent.ts:196: query key "content-type" (URLSearchParams.get)',
        ),
      ),
    ).toBe(true);
  });

  it("names ga4.ts:13 when the ga4.ts#id entry is removed", () => {
    expect(urlPiiViolations(repoRoot, { external: [] })).toEqual([
      'src/modules/analytics/ga4.ts:13: query key "id" (literal) is in neither QUERY_KEYS nor EXTERNAL_QUERY_KEYS (AC-55 (c))',
    ]);
  });

  it("goes red on an entry src/x.ts#email", () => {
    expect(
      urlPiiViolations(repoRoot, { external: [...EXTERNAL, "src/x.ts#email"] }),
    ).toEqual([
      'EXTERNAL_QUERY_KEYS: entry "src/x.ts#email" is a PII key name (AC-55 (b))',
      'EXTERNAL_QUERY_KEYS: entry "src/x.ts#email": src/x.ts no longer names "email" (AC-55 (e))',
    ]);
  });

  it("goes red on an entry whose file no longer names its key", () => {
    expect(
      urlPiiViolations(repoRoot, {
        external: [...EXTERNAL, "src/modules/analytics/ga4.ts#tid"],
      }),
    ).toEqual([
      'EXTERNAL_QUERY_KEYS: entry "src/modules/analytics/ga4.ts#tid": src/modules/analytics/ga4.ts no longer names "tid" (AC-55 (e))',
    ]);
  });
});

describe("scratch trees (T-59)", () => {
  it("goes red on src/app/[email]/page.tsx", () => {
    const root = scratchTree({
      "src/app/[email]/page.tsx":
        "export default function P() { return null; }\n",
    });
    expect(urlPiiViolations(root, { external: [] })).toEqual([
      'src/app/[email]: dynamic segment "email" is a PII key name (AC-55 (a))',
    ]);
  });

  it("goes red on a catch-all segment [...recipient_name]", () => {
    const root = scratchTree({
      "src/app/[[...recipient_name]]/page.tsx":
        "export default function P() { return null; }\n",
    });
    expect(urlPiiViolations(root, { external: [] })).toEqual([
      'src/app/[[...recipient_name]]: dynamic segment "recipient_name" is a PII key name (AC-55 (a))',
    ]);
  });

  it("goes red when phone is added to QUERY_KEYS", () => {
    const root = scratchTree({
      "src/config/url-keys.ts":
        'export const QUERY_KEYS = ["page", "sort", "phone"] as const;\n',
    });
    expect(urlPiiViolations(root, { external: [] })).toEqual([
      'src/config/url-keys.ts: QUERY_KEYS entry "phone" is a PII key name (AC-55 (b))',
    ]);
  });

  describe("receivers and literals under src/", () => {
    const files: Record<string, string> = {
      "src/a-url.ts":
        'export const e = (x: string) => new URL(x).searchParams.get("email");\n',
      "src/b-union.ts": [
        "export function f(p: URLSearchParams | Map<string, string>): boolean {",
        '  if (p instanceof URLSearchParams) return p.has("email");',
        "  return false;",
        "}",
        "",
      ].join("\n"),
      "src/c-new-set.ts":
        'export const g = (s: string, v: string) => new URLSearchParams(s).set("email", v);\n',
      "src/d-template.ts":
        "export const t = (x: string) => `/track?recipient_name=${x}`;\n",
      "src/e-maps.ts":
        "export const m = (x: string) => `https://maps.example/?id=${x}`;\n",
      "src/f-object.ts":
        'export const o = () => new URLSearchParams({ page: "1", phone: "x" });\n',
      "src/g-next.ts": [
        'import { useSearchParams } from "next/navigation";',
        'export const n = () => useSearchParams().get("email");',
        "",
      ].join("\n"),
      "src/h-node.ts": [
        'import { URLSearchParams as NodeParams } from "node:url";',
        'export const q = (s: string) => new NodeParams(s).append("phone", "1");',
        "",
      ].join("\n"),
      "src/i-headers-map-set.ts": [
        'export const h = (r: Request) => r.headers.get("email");',
        'export const mp = () => new Map<string, string>().get("email");',
        'export const st = () => new Set<string>().has("email");',
        "",
      ].join("\n"),
      "src/j-ours.ts":
        "export const ours = (base: string, n: number) => `${base}?page=${String(n)}&sort=price`;\n",
      // /break 117 hole 7: pairs, a const key, a computed key.
      "src/k-pairs.ts":
        'export const k = (x: string) => new URLSearchParams([["email", x]]);\n',
      "src/l-const.ts": [
        'const K = "email";',
        "export const l = (u: URL, x: string) => u.searchParams.set(K, x);",
        "",
      ].join("\n"),
      "src/m-computed.ts":
        'export const n = (x: string) => new URLSearchParams({ ["phone"]: x });\n',
      "src/n-string.ts":
        "export const w = (sp: URLSearchParams, key: string) => sp.getAll(key);\n",
      "src/modules/analytics/ga4.ts": GA4_LIKE,
    };
    const violations = (): string[] =>
      urlPiiViolations(scratchTree(files), { external: EXTERNAL });

    it("reports each red case, naming its path, and nothing else", () => {
      expect(violations()).toEqual([
        'src/a-url.ts:1: query key "email" (URLSearchParams.get) is in neither QUERY_KEYS nor EXTERNAL_QUERY_KEYS (AC-55 (c))',
        'src/b-union.ts:2: query key "email" (URLSearchParams.has) is in neither QUERY_KEYS nor EXTERNAL_QUERY_KEYS (AC-55 (c))',
        'src/c-new-set.ts:1: query key "email" (URLSearchParams.set) is in neither QUERY_KEYS nor EXTERNAL_QUERY_KEYS (AC-55 (c))',
        'src/d-template.ts:1: query key "recipient_name" (literal) is in neither QUERY_KEYS nor EXTERNAL_QUERY_KEYS (AC-55 (c))',
        'src/e-maps.ts:1: query key "id" (literal) is in neither QUERY_KEYS nor EXTERNAL_QUERY_KEYS (AC-55 (c))',
        'src/f-object.ts:1: query key "phone" (new URLSearchParams({…})) is in neither QUERY_KEYS nor EXTERNAL_QUERY_KEYS (AC-55 (c))',
        'src/g-next.ts:2: query key "email" (URLSearchParams.get) is in neither QUERY_KEYS nor EXTERNAL_QUERY_KEYS (AC-55 (c))',
        'src/h-node.ts:2: query key "phone" (URLSearchParams.append) is in neither QUERY_KEYS nor EXTERNAL_QUERY_KEYS (AC-55 (c))',
        'src/k-pairs.ts:1: query key "email" (new URLSearchParams([[…]])) is in neither QUERY_KEYS nor EXTERNAL_QUERY_KEYS (AC-55 (c))',
        'src/l-const.ts:2: query key "email" (URLSearchParams.set) is in neither QUERY_KEYS nor EXTERNAL_QUERY_KEYS (AC-55 (c))',
        'src/m-computed.ts:1: query key "phone" (new URLSearchParams({…})) is in neither QUERY_KEYS nor EXTERNAL_QUERY_KEYS (AC-55 (c))',
      ]);
    });

    it("counts a Headers, a Map and a Set by their type, not their method name", () => {
      expect(
        violations().filter((v) => v.startsWith("src/i-headers-map-set.ts")),
      ).toEqual([]);
      expect(
        urlPiiViolations(scratchTree(files), { receiver: "name" }).filter((v) =>
          v.startsWith("src/i-headers-map-set.ts"),
        ),
      ).toHaveLength(3);
    });
  });
});

describe("query-string schemas honour only QUERY_KEYS (AC-55 (d))", () => {
  const queryKeys = readQueryKeys(repoRoot) ?? [];

  it("ListingSearchParamsSchema honours page and sort and no PII key", () => {
    expect(
      ListingSearchParamsSchema.parse({
        ...Object.fromEntries(PII_KEYS.map((key) => [key, "x"])),
        page: "2",
        sort: listingSorts[1],
      }).honoured,
    ).toEqual(["page", "sort"]);
    expect(schemaViolations(QUERY_SCHEMAS, queryKeys)).toEqual([]);
  });

  it("goes red on a listing schema that honours email", () => {
    const honoursEmail = ListingSearchParamsSchema.transform((parsed) => ({
      ...parsed,
      honoured: [...parsed.honoured, "email"],
    }));
    expect(
      schemaViolations(
        [
          {
            name: "ListingSearchParamsSchema",
            schema: honoursEmail,
            valid: { page: "2" },
          },
        ],
        queryKeys,
      ),
    ).toEqual([
      'ListingSearchParamsSchema: honours "email", which is outside QUERY_KEYS (AC-55 (d))',
    ]);
  });
});
