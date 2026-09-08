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

export async function compileGlobalsCss(
  repoRoot: string,
  candidates: readonly string[] = KNOWN_CANDIDATES,
  source?: string,
): Promise<string> {
  const { compile } = await import("tailwindcss");
  const path = resolve(repoRoot, GLOBALS_CSS);
  const css = source ?? (await readFile(path, "utf8"));
  const compiler = await compile(css, {
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
  return compiler.build([...candidates]);
}
