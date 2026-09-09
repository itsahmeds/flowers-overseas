/**
 * Compiles `src/app/globals.css` the way the build does (spec 004 AC-1, T-01; TASK-045).
 *
 * T-01 asks for an assertion against the **built** CSS, not against the source text: a token that
 * is declared but shadowed, a `@utility` that Tailwind rejects, or a `@theme` block Tailwind
 * silently drops would all pass a regex over the file and fail in the browser. So this helper runs
 * Tailwind's own compiler (`tailwindcss`'s `compile()`, the same package `@tailwindcss/postcss`
 * wraps) over the real stylesheet and returns the emitted CSS for a given list of candidate class
 * names.
 *
 * `loadStylesheet` resolves `@import "tailwindcss"` through `createRequire`, because the import
 * specifier is a package export rather than a path — the one piece of plumbing PostCSS would
 * otherwise do. No network, no `.next` directory, no build step: `pnpm test` stays offline (AC-2).
 */
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

const require = createRequire(import.meta.url);

export const GLOBALS_CSS = "src/app/globals.css";

/** Utilities the design system's own components use; the compiler only emits what is requested. */
export const KNOWN_CANDIDATES = [
  "display",
  "label",
  "photo",
  "mirror-in-rtl",
  "layer-header",
  "layer-banner",
  "layer-overlay",
  "bg-accent",
  "bg-accent-strong",
  "bg-paper-2",
  "bg-surface-muted",
  "bg-surface-inverse",
  "text-ink",
  "text-ink-muted",
  "text-ink-subtle",
  "text-on-inverse",
  "text-on-accent",
  "text-danger",
  "border-rule",
  "border-border-strong",
  "border-border-emphasis",
  "text-display",
  "text-display-s",
  "text-2xl",
  "text-xl",
  "text-lg",
  "text-md",
  "text-sm",
  "text-xs",
  "font-medium",
  "gap-xs",
  "gap-sm",
  "gap-md",
  "gap-lg",
  "gap-xl",
  "gap-2xl",
  "gap-3xl",
  "px-md",
  "px-2xl",
  "py-xl",
  "max-w-prose",
  "rounded-none",
  "rounded-sm",
  "rounded-md",
  "rounded-full",
  "shadow-xs",
  "shadow-sm",
  "shadow-md",
  "motion-fast",
  "motion-base",
  "motion-slow",
  "ease-standard",
  "ease-emphasised",
  "tabular-nums",
  "sr-only",
];

/** Runs Tailwind's compiler over the real stylesheet; `source` overrides its text. */
async function globalsCompiler(repoRoot: string, source?: string) {
  const { compile } = await import("tailwindcss");
  const path = resolve(repoRoot, GLOBALS_CSS);
  const css = source ?? (await readFile(path, "utf8"));
  return compile(css, {
    base: dirname(path),
    async loadStylesheet(id: string, base: string) {
      const file = id.startsWith(".")
        ? resolve(base, id)
        : require.resolve(`${id}/index.css`);
      return {
        path: file,
        base: dirname(file),
        content: await readFile(file, "utf8"),
      };
    },
  });
}

export async function compileGlobalsCss(
  repoRoot: string,
  candidates: readonly string[] = KNOWN_CANDIDATES,
  source?: string,
): Promise<string> {
  const compiler = await globalsCompiler(repoRoot, source);
  return compiler.build([...candidates]);
}

/**
 * Compiles the stylesheet with the **real** source set, scanned the way `next build` scans it
 * (`/review 27` required change 1).
 *
 * `compileGlobalsCss()` above answers "does this utility compile?", because `build()` emits CSS
 * for whatever candidates it is handed. It therefore cannot answer the opposite and more important
 * question — "what actually ships?" — which is how a kilobyte of lint fixtures
 * (`bg-[#ff0000]`, `ml-4`, `text-left`, …) reached the production stylesheet unnoticed. So this
 * helper takes the `@source` configuration out of the compiled stylesheet, hands it to Tailwind's
 * own scanner (`@tailwindcss/oxide`, the crate `@tailwindcss/postcss` uses in the build), and
 * builds only the candidates the scan found. The result is byte-comparable with the build output
 * before Next's minifier rewrites colours, which is exactly the artefact an "outside `@theme`"
 * assertion has to read.
 *
 * Offline and build-free: no `.next` directory, no network (AC-2).
 */
export async function compileScannedCss(
  repoRoot: string,
  sources?: readonly { base: string; pattern: string; negated: boolean }[],
): Promise<string> {
  const { Scanner } = await import("@tailwindcss/oxide");
  const compiler = await globalsCompiler(repoRoot);
  const scanner = new Scanner({ sources: [...(sources ?? compiler.sources)] });
  return compiler.build(scanner.scan());
}

/** The `@source` globs the stylesheet declares, as the scanner receives them. */
export async function globalsSources(
  repoRoot: string,
): Promise<readonly { base: string; pattern: string; negated: boolean }[]> {
  const compiler = await globalsCompiler(repoRoot);
  return compiler.sources;
}
