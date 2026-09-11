/**
 * The type surface of a module barrel, as names (spec 005 AC-18, T-16; TASK-069).
 *
 * AC-18 turns the geo-blocking prohibition of EU 2018/302 (ADR-0006) into a gate: *no exported
 * function in `src/modules/catalog` may take the buyer's location*. A grep over the source would
 * miss the interesting cases — a parameter typed as an imported interface that carries
 * `buyerCountry` three levels down is not spelled anywhere in the module — so the enumeration is
 * done through the **type checker**: every export of the barrel, every call signature of every
 * export, every parameter of every signature, and every property of every type reachable from
 * those parameters and return types.
 *
 * Three bounds keep it a unit test rather than a second `tsc` run:
 *
 *  - the program is rooted at the barrel alone, so only what the barrel actually reaches is
 *    loaded (~320 files, well under a second);
 *  - any type whose declarations are **all** in `node_modules` is a leaf: zod's `ZodObject` and
 *    React's `ReactNode` have thousands of internal members, none of them ours, and walking them
 *    is what makes a naive version run out of heap;
 *  - a visit budget and a `seen` set stop structural recursion (`PriceProjection` contains a
 *    `Money`, which contains a `CurrencyCode`, …) from becoming an infinite one.
 *
 * The analyser is deliberately generic: it takes an entry file and returns names, so the same
 * function runs over the barrel (which must be clean) and over a **control** fixture (which must
 * not be), and a green result therefore means the scanner works rather than that it ran.
 */
import { resolve } from "node:path";

import ts from "typescript";

const repoRoot = resolve(__dirname, "../../..");

/**
 * The compiler options the walk needs. They mirror `tsconfig.json`'s module resolution and the
 * `@/*` path alias — without them a barrel that imports `@/config/currencies` resolves to `any`
 * and the surface comes back empty, which is the one failure mode a gate like this must not have
 * (the emptiness itself is asserted against, below).
 */
const OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  strict: true,
  skipLibCheck: true,
  noEmit: true,
  allowImportingTsExtensions: true,
  baseUrl: repoRoot,
  paths: { "@/*": ["./src/*"] },
};

/** Maximum property/parameter hops from an export before the walk stops descending. */
const MAX_DEPTH = 8;

/** Maximum types visited in one walk. Reached only by a pathological type; asserted below. */
const VISIT_BUDGET = 200_000;

/** True when every declaration of `symbol` lives in `node_modules` — a third-party leaf. */
function isExternal(symbol: ts.Symbol | undefined): boolean {
  const declarations = symbol?.declarations;
  if (declarations === undefined || declarations.length === 0) return false;
  return declarations.every((declaration) =>
    declaration.getSourceFile().fileName.includes("/node_modules/"),
  );
}

export interface TypeSurface {
  /** Every parameter name and every property name reachable from the module's exports. */
  readonly names: ReadonlySet<string>;
  /** The export names themselves, for the "did this actually load anything" assertion. */
  readonly exports: readonly string[];
  /** How much of the visit budget was left; a walk that exhausts it has not proved anything. */
  readonly budgetLeft: number;
}

/** Every parameter and property name reachable from the exports of `entryFile`. */
export function typeSurfaceOf(entryFile: string): TypeSurface {
  const entry = resolve(repoRoot, entryFile);
  const program = ts.createProgram([entry], OPTIONS);
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(entry);
  if (source === undefined) {
    throw new Error(`\`${entryFile}\` is not in the program`);
  }
  const moduleSymbol = checker.getSymbolAtLocation(source);
  if (moduleSymbol === undefined) {
    throw new Error(`\`${entryFile}\` exports nothing the checker can see`);
  }

  const names = new Set<string>();
  const seen = new Set<ts.Type>();
  let budget = VISIT_BUDGET;

  function walk(type: ts.Type, depth: number): void {
    if (depth > MAX_DEPTH || budget <= 0 || seen.has(type)) return;
    budget -= 1;
    seen.add(type);
    if (isExternal(type.getSymbol()) || isExternal(type.aliasSymbol)) return;

    for (const signature of type.getCallSignatures()) {
      for (const parameter of signature.getParameters()) {
        names.add(parameter.getName());
        const declaration =
          parameter.valueDeclaration ?? parameter.declarations?.[0];
        if (declaration !== undefined) {
          walk(
            checker.getTypeOfSymbolAtLocation(parameter, declaration),
            depth + 1,
          );
        }
      }
      walk(signature.getReturnType(), depth + 1);
    }

    for (const property of type.getProperties()) {
      if (isExternal(property)) continue;
      names.add(property.getName());
      const declaration =
        property.valueDeclaration ?? property.declarations?.[0];
      if (declaration !== undefined) {
        walk(
          checker.getTypeOfSymbolAtLocation(property, declaration),
          depth + 1,
        );
      }
    }

    const union = type as ts.UnionOrIntersectionType;
    if (union.types !== undefined) {
      for (const member of union.types) walk(member, depth);
    }
    const reference = type as ts.TypeReference;
    if (reference.typeArguments !== undefined) {
      for (const argument of reference.typeArguments) walk(argument, depth + 1);
    }
  }

  const exported = checker.getExportsOfModule(moduleSymbol);
  for (const raw of exported) {
    // A barrel re-export is an alias symbol; the type of the alias itself carries nothing.
    const symbol =
      (raw.flags & ts.SymbolFlags.Alias) === 0
        ? raw
        : checker.getAliasedSymbol(raw);
    const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
    if (declaration !== undefined) {
      walk(checker.getTypeOfSymbolAtLocation(symbol, declaration), 0);
    }
    if (
      (symbol.flags & (ts.SymbolFlags.TypeAlias | ts.SymbolFlags.Interface)) !==
      0
    ) {
      walk(checker.getDeclaredTypeOfSymbol(symbol), 0);
    }
  }

  return {
    names,
    exports: exported.map((symbol) => symbol.getName()),
    budgetLeft: budget,
  };
}
