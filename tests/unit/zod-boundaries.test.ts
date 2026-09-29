/**
 * T-57 (spec 001 §14 A20, AC-53; TASK-159): Zod at every boundary.
 *
 * `CLAUDE.md` says "Zod at every boundary"; until this test nothing checked it (standards audit
 * row 6: `(await req.json()) as {…}` passed ESLint and tsc). This test parses every `.ts` and
 * `.tsx` file under `src/` with the TypeScript compiler API and finds every **raw input**:
 *
 * 1. a call of `.json()`, `.formData()`, `.text()`, `.arrayBuffer()` or `.blob()` with no
 *    arguments (a request body, or a third-party `fetch` response), and every call of a `READERS`
 *    function;
 * 2. `searchParams` received by the default export of a `page`/`layout` file, or by an exported
 *    `generateMetadata`/`generateViewport`, under `src/app/`; and `.searchParams` read from
 *    `….nextUrl` or from a `new URL(…)` anywhere under `src/`;
 * 3. each parameter of a server action: a function exported from a file that starts with
 *    `"use server"`, or a function whose body starts with it.
 *
 * A raw input is **parsed** when, in the same function, it reaches the first argument of `.parse`,
 * `.safeParse`, `.parseAsync` or `.safeParseAsync`, directly or through these steps only: `await`,
 * brackets, the left side of `??`, `JSON.parse(…)`, `Object.fromEntries(…)`,
 * `new URLSearchParams(…)`, `.entries()`, and one `const` binding whose every other use is a
 * comparison with `null` or `undefined`. Passing it to a `PARSERS` function counts as parsed;
 * passing it to a function defined in the same file counts when that function's matching
 * parameter is parsed under the same rule, one level deep. Anything else is red, `as` included.
 *
 * **The exemptions are the two lists below and nothing else** (AC-53). No comment can mark a
 * function exempt: a comment is exactly the one-line switch-off AC-50 removes. Adding an entry
 * means changing this file, and the reviewer names that change. The test fails when an entry's
 * function no longer exists, or when a `PARSERS` function calls none of the four methods in its own
 * body or in a same-file function its body calls (one call, as the input rule).
 *
 * Not covered, said plainly (AC-53): route `params`; headers and cookies (`consentCookie.ts`
 * hand-parses `fo_consent` to keep Zod out of the browser bundle, spec 004 AC-25); webhooks and
 * job payloads (none exist yet); data that passes through more than one function; and
 * `useSearchParams()` in a client component, which reads the query string in the browser rather
 * than at a server boundary: a spec that adds a call names the schema that parses its result.
 *
 * It reads source text, so it catches a class of mistake, not every phrasing: bindings are
 * matched by name inside the function, and imports are followed through `export … from`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

/** One exemption: `path#function` (repository-relative) and why. */
interface Entry {
  readonly entry: string;
  readonly reason: string;
}

/** Functions that return a raw body. Their own read is not checked; every call to them is. */
const READERS: readonly Entry[] = [
  {
    entry: "src/lib/consent.ts#readBoundedBody",
    reason:
      "enforces the byte limit before anything is parsed; consent.ts and reminders.ts parse its result",
  },
];

/** Functions trusted to parse their argument. A raw input passed to one counts as parsed. */
const PARSERS: readonly Entry[] = [
  {
    entry: "src/modules/catalog/params.ts#listingRequest",
    reason:
      "calls the same-file parseSearch(), which runs ListingSearchParamsSchema.parse",
  },
];

const BODY_METHODS = new Set([
  "json",
  "formData",
  "text",
  "arrayBuffer",
  "blob",
]);
const SINKS = new Set(["parse", "safeParse", "parseAsync", "safeParseAsync"]);
const SINK_LIST = ".parse/.safeParse/.parseAsync/.safeParseAsync";

type Kind =
  | `body .${string}()`
  | `READERS call ${string}()`
  | "page searchParams"
  | "URL .searchParams"
  | `server action parameter ${string}`;

interface Finding {
  /** `src/…:line` of the raw input. */
  readonly at: string;
  readonly kind: Kind;
  readonly verdict: "parsed" | "exempt" | "raw";
  /** How it was parsed, why it is exempt, or where and why it is raw. */
  readonly detail: string;
}

interface Scan {
  readonly findings: readonly Finding[];
  /** Problems with `READERS`/`PARSERS` themselves. */
  readonly listProblems: readonly string[];
}

interface ScanOptions {
  readonly readers?: readonly Entry[];
  readonly parsers?: readonly Entry[];
  /** The one-call follow (same-file functions). Off only to prove the green cases need it. */
  readonly follow?: boolean;
}

type Fn = ts.FunctionLikeDeclaration;

interface FileInfo {
  readonly rel: string;
  readonly sf: ts.SourceFile;
  /** Named functions defined anywhere in the file (declarations and `const f = () => …`). */
  readonly functions: ReadonlyMap<string, Fn>;
  /** Local name → the module specifier and the name it imports. */
  readonly imports: ReadonlyMap<string, { spec: string; name: string }>;
}

type Verdict =
  | { readonly ok: true; readonly how: string }
  | { readonly ok: false; readonly line: number; readonly why: string };

interface Ctx {
  readonly file: FileInfo;
  readonly followsLeft: number;
  readonly bindingsLeft: number;
}

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.tsx?$/.test(name) && !name.endsWith(".d.ts")) out.push(path);
  }
}

function lineOf(node: ts.Node): number {
  const sf = node.getSourceFile();
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some((m) => m.kind === kind)
  );
}

function isFn(node: ts.Node): node is Fn {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node)
  );
}

/** The name a function is known by in its file, or `undefined`. */
function fnName(fn: Fn): string | undefined {
  if (
    (ts.isFunctionDeclaration(fn) || ts.isMethodDeclaration(fn)) &&
    fn.name &&
    ts.isIdentifier(fn.name)
  )
    return fn.name.text;
  const parent = fn.parent;
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name))
    return parent.name.text;
  return undefined;
}

function indexFile(root: string, path: string): FileInfo {
  const text = readFileSync(path, "utf8");
  const sf = ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const functions = new Map<string, Fn>();
  const imports = new Map<string, { spec: string; name: string }>();
  const visit = (node: ts.Node): void => {
    if (isFn(node) && !ts.isMethodDeclaration(node)) {
      const name = fnName(node);
      if (name !== undefined && !functions.has(name)) functions.set(name, node);
    }
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const bindings = node.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          imports.set(element.name.text, {
            spec: node.moduleSpecifier.text,
            name: (element.propertyName ?? element.name).text,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { rel: relative(root, path), sf, functions, imports };
}

class Scanner {
  private readonly files = new Map<string, FileInfo>();
  private readonly readers: ReadonlySet<string>;
  private readonly parsers: ReadonlySet<string>;
  private readonly follow: boolean;
  private readonly root: string;

  constructor(root: string, options: Required<ScanOptions>) {
    this.root = root;
    const paths: string[] = [];
    walk(join(root, "src"), paths);
    for (const path of paths) {
      const info = indexFile(root, path);
      this.files.set(info.rel, info);
    }
    this.readers = new Set(options.readers.map((e) => e.entry));
    this.parsers = new Set(options.parsers.map((e) => e.entry));
    this.follow = options.follow;
  }

  /** `src/…` for a module specifier seen in `from`, or `undefined` for a package. */
  private resolveModule(from: FileInfo, spec: string): string | undefined {
    let base: string;
    if (spec.startsWith("@/")) base = join(this.root, "src", spec.slice(2));
    else if (spec.startsWith("."))
      base = resolve(this.root, dirname(from.rel), spec);
    else return undefined;
    for (const suffix of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
      const rel = relative(this.root, base + suffix);
      if (this.files.has(rel)) return rel;
    }
    return undefined;
  }

  /** Where `name`, as exported by `rel`, is defined: follows `export … from` a few hops. */
  private exportedFrom(
    rel: string,
    name: string,
    hops = 5,
  ): string | undefined {
    const file = this.files.get(rel);
    if (file === undefined || hops === 0) return undefined;
    if (file.functions.has(name)) return `${rel}#${name}`;
    for (const statement of file.sf.statements) {
      if (!ts.isExportDeclaration(statement)) continue;
      const spec =
        statement.moduleSpecifier &&
        ts.isStringLiteral(statement.moduleSpecifier)
          ? statement.moduleSpecifier.text
          : undefined;
      const clause = statement.exportClause;
      if (clause === undefined) {
        const target = spec && this.resolveModule(file, spec);
        const found = target && this.exportedFrom(target, name, hops - 1);
        if (found) return found;
        continue;
      }
      if (!ts.isNamedExports(clause)) continue;
      for (const element of clause.elements) {
        if (element.name.text !== name) continue;
        const local = (element.propertyName ?? element.name).text;
        if (spec !== undefined) {
          const target = this.resolveModule(file, spec);
          return target && this.exportedFrom(target, local, hops - 1);
        }
        return this.originOf(file, local, hops - 1);
      }
    }
    return undefined;
  }

  /** `path#name` of the function an identifier in `file` calls, when it is ours. */
  private originOf(file: FileInfo, name: string, hops = 5): string | undefined {
    if (file.functions.has(name)) return `${file.rel}#${name}`;
    const imported = file.imports.get(name);
    if (imported === undefined) return undefined;
    const target = this.resolveModule(file, imported.spec);
    return target && this.exportedFrom(target, imported.name, hops);
  }

  private red(node: ts.Node, why: string): Verdict {
    return { ok: false, line: lineOf(node), why };
  }

  /** Every read of the binding `name` inside `scope`, the declaration itself excluded. */
  private uses(scope: ts.Node, name: ts.Identifier): ts.Identifier[] {
    const found: ts.Identifier[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isIdentifier(node) && node !== name && node.text === name.text) {
        const parent = node.parent;
        const isName =
          (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
          ((ts.isPropertyAssignment(parent) ||
            ts.isPropertySignature(parent) ||
            ts.isMethodDeclaration(parent) ||
            ts.isParameter(parent) ||
            ts.isVariableDeclaration(parent)) &&
            parent.name === node) ||
          (ts.isBindingElement(parent) && parent.propertyName === node) ||
          ts.isTypeReferenceNode(parent) ||
          ts.isQualifiedName(parent);
        if (!isName) found.push(node);
      }
      ts.forEachChild(node, visit);
    };
    visit(scope);
    return found;
  }

  private isNullComparison(use: ts.Identifier): boolean {
    let node: ts.Node = use;
    while (ts.isParenthesizedExpression(node.parent)) node = node.parent;
    const parent = node.parent;
    if (!ts.isBinaryExpression(parent)) return false;
    const op = parent.operatorToken.kind;
    if (
      op !== ts.SyntaxKind.EqualsEqualsEqualsToken &&
      op !== ts.SyntaxKind.ExclamationEqualsEqualsToken &&
      op !== ts.SyntaxKind.EqualsEqualsToken &&
      op !== ts.SyntaxKind.ExclamationEqualsToken
    )
      return false;
    const other = parent.left === node ? parent.right : parent.left;
    return (
      other.kind === ts.SyntaxKind.NullKeyword ||
      (ts.isIdentifier(other) && other.text === "undefined")
    );
  }

  /** A binding is parsed when it is used, and every use but `null` checks reaches a schema. */
  private binding(scope: ts.Node, name: ts.Identifier, ctx: Ctx): Verdict {
    const reads = this.uses(scope, name).filter(
      (use) => !this.isNullComparison(use),
    );
    if (reads.length === 0)
      return this.red(name, `\`${name.text}\` never reaches a schema`);
    let how = "";
    for (const use of reads) {
      const verdict = this.climb(use, ctx);
      if (!verdict.ok) return verdict;
      how ||= verdict.how;
    }
    return { ok: true, how: `${name.text} → ${how}` };
  }

  /** Follow a raw value up the tree until it reaches a schema, or a step the rule does not allow. */
  private climb(node: ts.Node, ctx: Ctx): Verdict {
    const parent = node.parent;
    if (ts.isParenthesizedExpression(parent) || ts.isAwaitExpression(parent))
      return this.climb(parent, ctx);
    if (ts.isAsExpression(parent) || ts.isTypeAssertionExpression(parent))
      return this.red(parent, "an `as` cast");
    if (
      ts.isBinaryExpression(parent) &&
      parent.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken &&
      parent.left === node
    )
      return this.climb(parent, ctx);
    if (ts.isCallExpression(parent) && parent.expression !== node) {
      return this.argument(
        parent,
        parent.arguments.indexOf(node as ts.Expression),
        ctx,
      );
    }
    if (
      ts.isNewExpression(parent) &&
      ts.isIdentifier(parent.expression) &&
      parent.expression.text === "URLSearchParams" &&
      parent.arguments?.[0] === node
    )
      return this.climb(parent, ctx);
    if (
      ts.isPropertyAccessExpression(parent) &&
      parent.expression === node &&
      parent.name.text === "entries" &&
      ts.isCallExpression(parent.parent) &&
      parent.parent.expression === parent &&
      parent.parent.arguments.length === 0
    )
      return this.climb(parent.parent, ctx);
    if (
      ts.isVariableDeclaration(parent) &&
      parent.initializer === node &&
      ts.isIdentifier(parent.name) &&
      ts.isVariableDeclarationList(parent.parent) &&
      (parent.parent.flags & ts.NodeFlags.Const) !== 0 &&
      ctx.bindingsLeft > 0
    ) {
      let scope: ts.Node = parent;
      while (!isFn(scope) && !ts.isSourceFile(scope)) scope = scope.parent;
      return this.binding(scope, parent.name, {
        ...ctx,
        bindingsLeft: ctx.bindingsLeft - 1,
      });
    }
    if (ts.isPropertyAccessExpression(parent) && parent.expression === node)
      return this.red(parent, `read as \`.${parent.name.text}\``);
    return this.red(parent, `reaches a ${ts.SyntaxKind[parent.kind]}`);
  }

  /** A raw value is argument `index` of `call`. */
  private argument(call: ts.CallExpression, index: number, ctx: Ctx): Verdict {
    const callee = call.expression;
    if (ts.isPropertyAccessExpression(callee)) {
      const method = callee.name.text;
      const object = callee.expression;
      const on = ts.isIdentifier(object) ? object.text : undefined;
      if (on === "JSON" && method === "parse")
        return index === 0
          ? this.climb(call, ctx)
          : this.red(call, "a later argument of JSON.parse");
      if (on === "Object" && method === "fromEntries")
        return index === 0
          ? this.climb(call, ctx)
          : this.red(call, "a later argument of Object.fromEntries");
      if (SINKS.has(method) && index === 0)
        return {
          ok: true,
          how: `.${method}() at line ${String(lineOf(call))}`,
        };
      return this.red(call, `passed to \`${callee.getText()}()\``);
    }
    if (!ts.isIdentifier(callee))
      return this.red(call, "passed to a computed callee");
    const origin = this.originOf(ctx.file, callee.text);
    if (origin !== undefined && this.parsers.has(origin))
      return { ok: true, how: `PARSERS ${origin}` };
    const local = ctx.file.functions.get(callee.text);
    if (local !== undefined && this.follow && ctx.followsLeft > 0) {
      const param = local.parameters[index];
      if (param === undefined || !ts.isIdentifier(param.name))
        return this.red(
          call,
          `passed to \`${callee.text}()\`, whose parameter is not a plain name`,
        );
      const inner = this.binding(local, param.name, {
        file: ctx.file,
        followsLeft: ctx.followsLeft - 1,
        bindingsLeft: 1,
      });
      if (inner.ok)
        return {
          ok: true,
          how: `${callee.text}(${param.name.text}) → ${inner.how}`,
        };
      return {
        ok: false,
        line: inner.line,
        why: `passed to \`${callee.text}()\`, which does not parse it: ${inner.why}`,
      };
    }
    return this.red(call, `passed to \`${callee.text}()\``);
  }

  private verdictOf(
    at: ts.Node,
    kind: Kind,
    file: FileInfo,
    check: (ctx: Ctx) => Verdict,
  ): Finding {
    const verdict = check({ file, followsLeft: 1, bindingsLeft: 1 });
    return {
      at: `${file.rel}:${String(lineOf(at))}`,
      kind,
      verdict: verdict.ok ? "parsed" : "raw",
      detail: verdict.ok
        ? verdict.how
        : `line ${String(verdict.line)}: ${verdict.why}`,
    };
  }

  /** The `READERS` entry an enclosing function of `node` is, if any. */
  private insideReader(file: FileInfo, node: ts.Node): string | undefined {
    for (let n: ts.Node = node; !ts.isSourceFile(n); n = n.parent) {
      if (!isFn(n)) continue;
      const name = fnName(n);
      const key = name && `${file.rel}#${name}`;
      if (key && this.readers.has(key)) return key;
    }
    return undefined;
  }

  /** Each parameter binding (a plain name, or every name in a destructuring pattern). */
  private paramNames(fn: Fn): ts.Identifier[] {
    const names: ts.Identifier[] = [];
    const collect = (name: ts.BindingName): void => {
      if (ts.isIdentifier(name)) names.push(name);
      else
        for (const element of name.elements)
          if (!ts.isOmittedExpression(element)) collect(element.name);
    };
    for (const param of fn.parameters) collect(param.name);
    return names;
  }

  private startsWithUseServer(statements: readonly ts.Statement[]): boolean {
    const first = statements[0];
    return (
      first !== undefined &&
      ts.isExpressionStatement(first) &&
      ts.isStringLiteral(first.expression) &&
      first.expression.text === "use server"
    );
  }

  /** The local name of each `searchParams` key in `{ searchParams }`/`{ searchParams: sp }`. */
  private searchParamsNames(name: ts.BindingName): ts.Identifier[] {
    if (!ts.isObjectBindingPattern(name)) return [];
    const out: ts.Identifier[] = [];
    for (const element of name.elements) {
      const key = (element.propertyName ?? element.name).getText();
      if (key === "searchParams" && ts.isIdentifier(element.name))
        out.push(element.name);
    }
    return out;
  }

  private isURLValue(file: FileInfo, node: ts.Expression): boolean {
    let expr = node;
    while (ts.isParenthesizedExpression(expr)) expr = expr.expression;
    if (ts.isNewExpression(expr))
      return ts.isIdentifier(expr.expression) && expr.expression.text === "URL";
    if (ts.isPropertyAccessExpression(expr))
      return expr.name.text === "nextUrl";
    if (!ts.isIdentifier(expr)) return false;
    const name = expr.text;
    let found = false;
    const visit = (n: ts.Node): void => {
      if (
        ts.isVariableDeclaration(n) &&
        ts.isIdentifier(n.name) &&
        n.name.text === name &&
        n.initializer !== undefined &&
        this.isURLValue(file, n.initializer) &&
        n.initializer !== node
      )
        found = true;
      if (!found) ts.forEachChild(n, visit);
    };
    visit(file.sf);
    return found;
  }

  /** Page/layout default exports and exported `generateMetadata`/`generateViewport`. */
  private routeFunctions(file: FileInfo): Fn[] {
    if (!file.rel.startsWith(join("src", "app"))) return [];
    const pageOrLayout = /(^|\/)(page|layout)\.tsx?$/.test(file.rel);
    const out: Fn[] = [];
    for (const statement of file.sf.statements) {
      if (
        ts.isFunctionDeclaration(statement) &&
        hasModifier(statement, ts.SyntaxKind.ExportKeyword)
      ) {
        const isDefault = hasModifier(statement, ts.SyntaxKind.DefaultKeyword);
        const name = statement.name?.text;
        if (
          (isDefault && pageOrLayout) ||
          name === "generateMetadata" ||
          name === "generateViewport"
        )
          out.push(statement);
      }
      if (
        ts.isVariableStatement(statement) &&
        hasModifier(statement, ts.SyntaxKind.ExportKeyword)
      ) {
        for (const d of statement.declarationList.declarations) {
          if (
            ts.isIdentifier(d.name) &&
            (d.name.text === "generateMetadata" ||
              d.name.text === "generateViewport") &&
            d.initializer &&
            isFn(d.initializer)
          )
            out.push(d.initializer);
        }
      }
      if (
        pageOrLayout &&
        ts.isExportAssignment(statement) &&
        !statement.isExportEquals
      ) {
        const expr = statement.expression;
        if (isFn(expr)) out.push(expr);
        else if (ts.isIdentifier(expr)) {
          const fn = file.functions.get(expr.text);
          if (fn) out.push(fn);
        }
      }
    }
    return out;
  }

  /** The function a value is, or the functions passed to the call that wraps it (`withAuth(async (fd) => …)`). */
  private actionFns(expr: ts.Expression | undefined, depth = 3): Fn[] {
    if (expr === undefined || depth === 0) return [];
    let e = expr;
    while (
      ts.isParenthesizedExpression(e) ||
      ts.isAsExpression(e) ||
      ts.isSatisfiesExpression(e)
    )
      e = e.expression;
    if (isFn(e)) return [e];
    if (ts.isCallExpression(e))
      return e.arguments.flatMap((arg) => this.actionFns(arg, depth - 1));
    return [];
  }

  /** The functions a top-level name of `file` is bound to. */
  private localValue(file: FileInfo, name: string): Fn[] {
    for (const statement of file.sf.statements) {
      if (ts.isFunctionDeclaration(statement) && statement.name?.text === name)
        return [statement];
      if (ts.isVariableStatement(statement))
        for (const d of statement.declarationList.declarations)
          if (ts.isIdentifier(d.name) && d.name.text === name)
            return this.actionFns(d.initializer);
    }
    return [];
  }

  /** Exported functions of a `"use server"` file, and functions whose body starts with it. */
  private serverActions(file: FileInfo): Fn[] {
    const out = new Set<Fn>();
    if (this.startsWithUseServer(file.sf.statements)) {
      for (const statement of file.sf.statements) {
        if (
          ts.isFunctionDeclaration(statement) &&
          hasModifier(statement, ts.SyntaxKind.ExportKeyword)
        )
          out.add(statement);
        if (
          ts.isVariableStatement(statement) &&
          hasModifier(statement, ts.SyntaxKind.ExportKeyword)
        )
          for (const d of statement.declarationList.declarations)
            for (const fn of this.actionFns(d.initializer)) out.add(fn);
        // `export default async (fd) => …`, `export default act`
        if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
          const expr = statement.expression;
          const fns = ts.isIdentifier(expr)
            ? this.localValue(file, expr.text)
            : this.actionFns(expr);
          for (const fn of fns) out.add(fn);
        }
        // `export { act }`, `export { act as default }`
        if (
          ts.isExportDeclaration(statement) &&
          statement.moduleSpecifier === undefined &&
          statement.exportClause !== undefined &&
          ts.isNamedExports(statement.exportClause)
        )
          for (const element of statement.exportClause.elements)
            for (const fn of this.localValue(
              file,
              (element.propertyName ?? element.name).text,
            ))
              out.add(fn);
      }
    }
    const visit = (node: ts.Node): void => {
      if (
        isFn(node) &&
        node.body &&
        ts.isBlock(node.body) &&
        this.startsWithUseServer(node.body.statements)
      )
        out.add(node);
      ts.forEachChild(node, visit);
    };
    visit(file.sf);
    return [...out];
  }

  private scanFile(file: FileInfo): Finding[] {
    const findings: Finding[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        if (
          ts.isPropertyAccessExpression(callee) &&
          BODY_METHODS.has(callee.name.text) &&
          node.arguments.length === 0
        ) {
          const kind: Kind = `body .${callee.name.text}()`;
          const reader = this.insideReader(file, node);
          findings.push(
            reader === undefined
              ? this.verdictOf(node, kind, file, (ctx) => this.climb(node, ctx))
              : {
                  at: `${file.rel}:${String(lineOf(node))}`,
                  kind,
                  verdict: "exempt",
                  detail: `inside READERS ${reader}`,
                },
          );
        }
        if (ts.isIdentifier(callee)) {
          const origin = this.originOf(file, callee.text);
          if (origin !== undefined && this.readers.has(origin))
            findings.push(
              this.verdictOf(
                node,
                `READERS call ${callee.text}()`,
                file,
                (ctx) => this.climb(node, ctx),
              ),
            );
        }
      }
      if (
        ts.isPropertyAccessExpression(node) &&
        node.name.text === "searchParams" &&
        this.isURLValue(file, node.expression)
      )
        findings.push(
          this.verdictOf(node, "URL .searchParams", file, (ctx) =>
            this.climb(node, ctx),
          ),
        );
      // `const { searchParams } = new URL(…)` / `= req.nextUrl` / `= url`.
      if (
        ts.isVariableDeclaration(node) &&
        node.initializer !== undefined &&
        this.isURLValue(file, node.initializer)
      ) {
        let scope: ts.Node = node;
        while (!isFn(scope) && !ts.isSourceFile(scope)) scope = scope.parent;
        for (const name of this.searchParamsNames(node.name))
          findings.push(
            this.verdictOf(name, "URL .searchParams", file, (ctx) =>
              this.binding(scope, name, ctx),
            ),
          );
      }
      ts.forEachChild(node, visit);
    };
    visit(file.sf);

    for (const fn of this.routeFunctions(file)) {
      const first = fn.parameters[0];
      if (first === undefined || fn.body === undefined) continue;
      if (ts.isObjectBindingPattern(first.name)) {
        for (const name of this.searchParamsNames(first.name)) {
          findings.push(
            this.verdictOf(name, "page searchParams", file, (ctx) =>
              this.binding(fn.body ?? fn, name, ctx),
            ),
          );
        }
      } else if (ts.isIdentifier(first.name)) {
        const props = first.name;
        const body = fn.body;
        for (const use of this.uses(body, props)) {
          const access = use.parent;
          if (
            ts.isPropertyAccessExpression(access) &&
            access.name.text === "searchParams"
          )
            findings.push(
              this.verdictOf(access, "page searchParams", file, (ctx) =>
                this.climb(access, ctx),
              ),
            );
          // `const { searchParams } = props` (or `= await props`) in the body.
          let value: ts.Node = use;
          while (
            ts.isParenthesizedExpression(value.parent) ||
            ts.isAwaitExpression(value.parent)
          )
            value = value.parent;
          const declaration = value.parent;
          if (
            ts.isVariableDeclaration(declaration) &&
            declaration.initializer === value
          )
            for (const name of this.searchParamsNames(declaration.name))
              findings.push(
                this.verdictOf(name, "page searchParams", file, (ctx) =>
                  this.binding(body, name, ctx),
                ),
              );
        }
      }
    }

    for (const fn of this.serverActions(file)) {
      if (fn.body === undefined) continue;
      for (const name of this.paramNames(fn)) {
        if (this.uses(fn.body, name).length === 0) continue; // never read, so nothing raw
        findings.push(
          this.verdictOf(
            name,
            `server action parameter ${name.text}`,
            file,
            (ctx) => this.binding(fn.body ?? fn, name, ctx),
          ),
        );
      }
    }
    return findings;
  }

  /** A `PARSERS` function's own body, or a same-file function it calls, calls a schema method. */
  private callsSink(fn: Fn, file: FileInfo, depth: number): boolean {
    let found = false;
    const callees: string[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        if (
          ts.isPropertyAccessExpression(callee) &&
          SINKS.has(callee.name.text) &&
          !(
            ts.isIdentifier(callee.expression) &&
            callee.expression.text === "JSON"
          )
        )
          found = true;
        if (ts.isIdentifier(callee)) callees.push(callee.text);
      }
      ts.forEachChild(node, visit);
    };
    if (fn.body) visit(fn.body);
    if (found || depth === 0) return found;
    return callees.some((name) => {
      const local = file.functions.get(name);
      return (
        local !== undefined &&
        local !== fn &&
        this.callsSink(local, file, depth - 1)
      );
    });
  }

  private checkLists(
    readers: readonly Entry[],
    parsers: readonly Entry[],
  ): string[] {
    const problems: string[] = [];
    const lookup = (entry: string): { file: FileInfo; fn: Fn } | undefined => {
      const [path = "", name = ""] = entry.split("#");
      const file = this.files.get(path);
      const fn = file?.functions.get(name);
      return file && fn ? { file, fn } : undefined;
    };
    for (const { entry } of readers)
      if (lookup(entry) === undefined)
        problems.push(`READERS ${entry}: the function no longer exists`);
    for (const { entry } of parsers) {
      const found = lookup(entry);
      if (found === undefined)
        problems.push(`PARSERS ${entry}: the function no longer exists`);
      else if (!this.callsSink(found.fn, found.file, this.follow ? 1 : 0))
        problems.push(
          `PARSERS ${entry}: calls none of ${SINK_LIST}, itself or through a same-file function`,
        );
    }
    return problems;
  }

  run(readers: readonly Entry[], parsers: readonly Entry[]): Scan {
    const findings = [...this.files.values()].flatMap((file) =>
      this.scanFile(file),
    );
    return { findings, listProblems: this.checkLists(readers, parsers) };
  }
}

function scan(root: string, options: ScanOptions = {}): Scan {
  const full = {
    readers: options.readers ?? READERS,
    parsers: options.parsers ?? PARSERS,
    follow: options.follow ?? true,
  };
  return new Scanner(root, full).run(full.readers, full.parsers);
}

/** Every reason the scan is red: raw inputs, list problems, or nothing found at all. */
function problems(result: Scan): string[] {
  const out = result.findings
    .filter((f) => f.verdict === "raw")
    .map((f) => `${f.at} ${f.kind}: ${f.detail}`);
  out.push(...result.listProblems);
  if (result.findings.length === 0)
    out.push(
      "found none: no raw input under src/, so the scan checked nothing",
    );
  return out;
}

const repoRoot = resolve(__dirname, "../..");
const fixture = (name: string): string =>
  join(repoRoot, "tests/fixtures/zod-boundaries", name);
const none: readonly Entry[] = [];
const entry = (e: string): Entry => ({ entry: e, reason: "fixture" });

describe("T-57: the real tree", () => {
  it("every raw input under src/ is parsed or exempt, and both lists hold", () => {
    const result = scan(repoRoot);
    console.log(
      [
        `zod-boundaries: ${String(result.findings.length)} raw input(s) under src/`,
        ...result.findings.map(
          (f) => `  ${f.verdict.padEnd(6)} ${f.at} ${f.kind} — ${f.detail}`,
        ),
      ].join("\n"),
    );
    expect(problems(result)).toEqual([]);
  });

  it("the lists are today's: one reader, one parser (adding one changes this file)", () => {
    expect(READERS.map((e) => e.entry)).toEqual([
      "src/lib/consent.ts#readBoundedBody",
    ]);
    expect(PARSERS.map((e) => e.entry)).toEqual([
      "src/modules/catalog/params.ts#listingRequest",
    ]);
  });

  it("an empty tree → red, found none", () => {
    expect(
      problems(scan(fixture("empty"), { readers: none, parsers: none })),
    ).toEqual([
      "found none: no raw input under src/, so the scan checked nothing",
    ]);
  });
});

describe("T-57: red, naming the file and line", () => {
  it("the audit's plant: `(await req.json()) as {…}` in a route.ts", () => {
    const tree = fixture("cast-plant");
    expect(problems(scan(tree, { readers: none, parsers: none }))).toEqual([
      "src/app/api/x/route.ts:3 body .json(): line 3: an `as` cast",
    ]);
  });

  it("the plant flips green when its function is added to READERS", () => {
    const result = scan(fixture("cast-plant"), {
      readers: [entry("src/app/api/x/route.ts#POST")],
      parsers: none,
    });
    expect(problems(result)).toEqual([]);
    expect(result.findings.map((f) => `${f.at} ${f.verdict}`)).toEqual([
      "src/app/api/x/route.ts:3 exempt",
    ]);
  });

  it("`const b = await req.json(); use(b)`", () => {
    expect(
      problems(
        scan(fixture("binding-escapes"), { readers: none, parsers: none }),
      ),
    ).toEqual([
      "src/app/api/x/route.ts:6 body .json(): line 7: passed to `use()`",
    ]);
  });

  it("the same flips green when `use` is added to PARSERS", () => {
    const result = scan(fixture("binding-escapes"), {
      readers: none,
      parsers: [entry("src/lib/check.ts#use")],
    });
    expect(problems(result)).toEqual([]);
    expect(result.findings.map((f) => `${f.at} ${f.verdict}`)).toEqual([
      "src/app/api/x/route.ts:6 parsed",
    ]);
  });

  it("a thin route.ts whose handler in lib/ reads `.json()` unparsed", () => {
    expect(
      problems(scan(fixture("thin-route"), { readers: none, parsers: none })),
    ).toEqual([
      "src/lib/handler.ts:3 body .json(): line 4: passed to `String()`",
    ]);
  });

  it('a "use server" action reading `formData.get("x")`', () => {
    expect(
      problems(
        scan(fixture("server-action"), { readers: none, parsers: none }),
      ),
    ).toEqual([
      "src/app/actions.ts:4 server action parameter formData: line 6: read as `.get`",
    ]);
  });

  it('a "use server" file exporting through `export { act }`, a wrapping call, and `export default` an arrow', () => {
    expect(
      problems(
        scan(fixture("server-action-exports"), {
          readers: none,
          parsers: none,
        }),
      ),
    ).toEqual([
      "src/app/actions.ts:8 server action parameter fd: line 10: read as `.get`",
      "src/app/actions.ts:14 server action parameter fd: line 16: read as `.get`",
      "src/app/actions.ts:19 server action parameter fd: line 21: read as `.get`",
    ]);
  });

  it('an inline "use server" function in a file that does not start with it', () => {
    expect(
      problems(
        scan(fixture("inline-server"), { readers: none, parsers: none }),
      ),
    ).toEqual([
      "src/lib/inline.ts:3 server action parameter fd: line 6: read as `.get`",
    ]);
  });

  it("a page reading `searchParams.page`", () => {
    expect(
      problems(scan(fixture("page-reads"), { readers: none, parsers: none })),
    ).toEqual([
      "src/app/page.tsx:6 page searchParams: line 7: read as `.page`",
    ]);
  });

  it("`const { searchParams } = props` in a page and in generateMetadata; `props.searchParams`; generateViewport", () => {
    expect(
      problems(scan(fixture("page-props"), { readers: none, parsers: none })),
    ).toEqual([
      "src/app/a/page.tsx:7 page searchParams: line 9: read as `.page`",
      "src/app/a/page.tsx:13 page searchParams: line 14: read as `.q`",
      "src/app/b/page.tsx:7 page searchParams: line 8: read as `.page`",
      "src/app/b/page.tsx:11 page searchParams: line 12: passed to `String()`",
    ]);
  });

  it("URL `.searchParams`: `req.nextUrl`, `new URL(…)` through a binding, and both destructured", () => {
    expect(
      problems(scan(fixture("url-search"), { readers: none, parsers: none })),
    ).toEqual([
      "src/lib/query.ts:5 URL .searchParams: line 5: read as `.get`",
      "src/lib/query.ts:10 URL .searchParams: line 10: read as `.get`",
      "src/lib/query.ts:14 URL .searchParams: line 15: read as `.get`",
      "src/lib/query.ts:19 URL .searchParams: line 20: read as `.get`",
    ]);
  });

  it("a READERS entry naming a deleted function", () => {
    const result = scan(fixture("readers"), {
      readers: [
        entry("src/lib/read.ts#readAll"),
        entry("src/lib/read.ts#readGone"),
      ],
      parsers: none,
    });
    expect(problems(result)).toEqual([
      "READERS src/lib/read.ts#readGone: the function no longer exists",
    ]);
  });

  it("a PARSERS entry that calls none of the four methods, itself or through a same-file function", () => {
    expect(
      scan(fixture("parsers-nocall"), {
        readers: none,
        parsers: [entry("src/lib/params.ts#request")],
      }).listProblems,
    ).toEqual([
      `PARSERS src/lib/params.ts#request: calls none of ${SINK_LIST}, itself or through a same-file function`,
    ]);
  });

  it("a PARSERS entry whose only `.parse` is two same-file calls away", () => {
    expect(
      scan(fixture("parsers-two-away"), {
        readers: none,
        parsers: [entry("src/lib/params.ts#request")],
      }).listProblems,
    ).toEqual([
      `PARSERS src/lib/params.ts#request: calls none of ${SINK_LIST}, itself or through a same-file function`,
    ]);
  });

  it("a PARSERS entry whose only `.parse` is in an imported function", () => {
    expect(
      scan(fixture("parsers-imported"), {
        readers: none,
        parsers: [entry("src/lib/params.ts#request")],
      }).listProblems,
    ).toEqual([
      `PARSERS src/lib/params.ts#request: calls none of ${SINK_LIST}, itself or through a same-file function`,
    ]);
  });

  it("without the READERS entry, the reader's own `.text()` is a raw input", () => {
    expect(
      problems(scan(fixture("readers"), { readers: none, parsers: none })),
    ).toEqual(["src/lib/read.ts:4 body .text(): line 5: read as `.length`"]);
  });
});

describe("T-57: green", () => {
  const verdicts = (result: Scan): string[] =>
    result.findings.map((f) => `${f.at} ${f.kind} ${f.verdict}`);

  it("a PARSERS entry whose body calls a same-file helper that calls `.parse` (listingRequest → parseSearch)", () => {
    const result = scan(fixture("parsers-one-call"), {
      readers: none,
      parsers: [entry("src/lib/params.ts#request")],
    });
    expect(problems(result)).toEqual([]);
    expect(verdicts(result)).toEqual([
      "src/app/api/x/route.ts:5 body .json() parsed",
    ]);
  });

  it("dropping the one-call follow turns that entry red", () => {
    expect(
      scan(fixture("parsers-one-call"), {
        readers: none,
        parsers: [entry("src/lib/params.ts#request")],
        follow: false,
      }).listProblems,
    ).toEqual([
      `PARSERS src/lib/params.ts#request: calls none of ${SINK_LIST}, itself or through a same-file function`,
    ]);
  });

  it("`Schema.parse(await req.json())`", () => {
    const result = scan(fixture("parse-direct"), {
      readers: none,
      parsers: none,
    });
    expect(problems(result)).toEqual([]);
    expect(verdicts(result)).toEqual([
      "src/app/api/x/route.ts:7 body .json() parsed",
    ]);
  });

  it("`const b = await req.json(); if (b === null) …; Schema.safeParse(b)`", () => {
    const result = scan(fixture("null-check"), {
      readers: none,
      parsers: none,
    });
    expect(problems(result)).toEqual([]);
    expect(verdicts(result)).toEqual([
      "src/app/api/x/route.ts:7 body .json() parsed",
    ]);
  });

  it("`Schema.parse(Object.fromEntries(await req.formData()))`", () => {
    const result = scan(fixture("form-entries"), {
      readers: none,
      parsers: none,
    });
    expect(problems(result)).toEqual([]);
    expect(verdicts(result)).toEqual([
      "src/app/api/x/route.ts:7 body .formData() parsed",
    ]);
  });

  it("a READERS result through `JSON.parse` into `.parse`", () => {
    const result = scan(fixture("readers"), {
      readers: [entry("src/lib/read.ts#readAll")],
      parsers: none,
    });
    expect(problems(result)).toEqual([]);
    expect(verdicts(result)).toEqual([
      "src/app/api/x/route.ts:9 READERS call readAll() parsed",
      "src/lib/read.ts:4 body .text() exempt",
    ]);
  });

  it("a raw input passed to a same-file function that parses it; red without the follow", () => {
    const tree = fixture("same-file-helper");
    const result = scan(tree, { readers: none, parsers: none });
    expect(problems(result)).toEqual([]);
    expect(verdicts(result)).toEqual([
      "src/app/api/x/route.ts:11 body .json() parsed",
    ]);
    expect(
      problems(scan(tree, { readers: none, parsers: none, follow: false })),
    ).toEqual([
      "src/app/api/x/route.ts:11 body .json(): line 11: passed to `read()`",
    ]);
  });
});
