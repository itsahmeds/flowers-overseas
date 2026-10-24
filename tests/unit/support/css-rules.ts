/**
 * A small reader for the shipped stylesheet (spec 042 T-3; TASK-307): each style rule with the
 * at-rules around it, outermost first, and its declarations. A brace-matching walk, which is
 * enough for Tailwind's output (regular CSS); the same walk `tests/unit/motion-css.test.ts` uses.
 */

/** One style rule with the at-rules around it, outermost first. */
export interface CssRule {
  readonly context: readonly string[];
  readonly selector: string;
  readonly declarations: ReadonlyMap<string, string>;
}

export function cssRules(css: string): CssRule[] {
  const text = css.replaceAll(/\/\*[\s\S]*?\*\//g, "");
  const rules: CssRule[] = [];
  const visit = (body: string, context: readonly string[]): void => {
    let index = 0;
    while (index < body.length) {
      const open = body.indexOf("{", index);
      if (open === -1) return;
      const prelude = body
        .slice(index, open)
        .replace(/^[\s\S]*;/, "")
        .trim();
      let depth = 1;
      let cursor = open + 1;
      while (depth > 0 && cursor < body.length) {
        if (body[cursor] === "{") depth += 1;
        else if (body[cursor] === "}") depth -= 1;
        cursor += 1;
      }
      const inner = body.slice(open + 1, cursor - 1);
      if (prelude.startsWith("@") || inner.includes("{")) {
        const own = inner.split("{")[0]?.replace(/[^;]*$/, "") ?? "";
        if (!prelude.startsWith("@") && own.trim() !== "") {
          rules.push({ context, selector: prelude, declarations: parse(own) });
        }
        if (prelude.startsWith("@") && !inner.includes("{")) {
          // A block at-rule that holds declarations only (`@view-transition`, `@page`).
          rules.push({
            context,
            selector: prelude,
            declarations: parse(inner),
          });
        } else {
          visit(inner, [...context, prelude]);
        }
      } else {
        rules.push({ context, selector: prelude, declarations: parse(inner) });
      }
      index = cursor;
    }
  };
  visit(text, []);
  return rules;
}

function parse(block: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const declaration of block.split(";")) {
    const colon = declaration.indexOf(":");
    if (colon === -1) continue;
    map.set(
      declaration.slice(0, colon).trim(),
      declaration
        .slice(colon + 1)
        .replace("!important", "")
        .replaceAll(/\s+/g, " ")
        .trim(),
    );
  }
  return map;
}
