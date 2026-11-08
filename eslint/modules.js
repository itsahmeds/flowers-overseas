/**
 * Module-boundary zones for `import/no-restricted-paths` (spec 001 §2, AC-9; plan/01 §5).
 *
 * plan/01 §5 states two rules:
 *   1. `app/` imports from `modules/`, never the reverse;
 *   2. `modules/*` do not import each other's internals, only the public `index.ts` barrel.
 *
 * A module may also publish a `client.ts`: a second public entry holding only what a
 * `"use client"` file may load (pure functions, types, schemas), because the barrel can reach
 * server code that a client bundle must not contain (TASK-503: `@/modules/i18n` reaches the
 * review ledger's database writer). It is allowed exactly like `index.ts`;
 * `tests/unit/client-server-graph.test.ts` is what keeps it client-safe.
 *
 * `moduleBoundaryZones()` generates those zones from the single module manifest in
 * `scripts/check-layout.ts`, so a spec that adds a module updates one list and both the layout
 * check (AC-3) and the boundary lint follow. The generated `from`/`except` entries are globs,
 * because `import/no-restricted-paths` compares `except` patterns against the *absolute*
 * resolved import path (hence the leading globstar), and requires `from` and `except` to be either
 * all globs or all plain paths.
 *
 * `srcRoot` is repo-relative. The real config passes `"src"`; the fixture config
 * (`tests/fixtures/lint/src`) passes the mirrored tree used by T-10, which exists so that the
 * offending imports actually resolve — the rule silently skips imports it cannot resolve.
 */
import { MODULES } from "../scripts/check-layout.ts";

export { MODULES };

/**
 * @typedef {object} Zone
 * @property {string | string[]} target
 * @property {string | string[]} from
 * @property {string[]} [except]
 * @property {string} [message]
 */

const APP_MESSAGE =
  "`src/modules/**` must not import from `src/app/**`: app/ imports from modules/, never the reverse (plan/01 §5).";

const CROSS_MODULE_MESSAGE =
  "Cross-module imports must go through the other module's public `index.ts` barrel (or its client-safe `client.ts`), not its internals (plan/01 §5).";

/**
 * @param {{ srcRoot?: string, modules?: readonly string[] }} [options]
 * @returns {Zone[]}
 */
export function moduleBoundaryZones(options = {}) {
  const srcRoot = options.srcRoot ?? "src";
  const modules = options.modules ?? MODULES;

  /** @type {Zone[]} */
  const zones = [
    {
      target: `${srcRoot}/modules/**`,
      from: `${srcRoot}/app/**`,
      message: APP_MESSAGE,
    },
  ];

  for (const target of modules) {
    const others = modules.filter((m) => m !== target);
    zones.push({
      target: `${srcRoot}/modules/${target}/**`,
      from: others.map((other) => `${srcRoot}/modules/${other}/**`),
      except: others.flatMap((other) => [
        `**/${srcRoot}/modules/${other}/index.{ts,tsx,js,jsx}`,
        `**/${srcRoot}/modules/${other}/client.{ts,tsx,js,jsx}`,
      ]),
      message: CROSS_MODULE_MESSAGE,
    });
  }

  return zones;
}
