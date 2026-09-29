/**
 * SDKs only in their adapters (spec 001 §14 A20, AC-57), the logger's side doors closed (AC-56),
 * and the one function that configures every `no-restricted-*` rule (AC-52; TASK-160).
 *
 * ## Why one function
 * In flat config a later object's options for a rule **replace** an earlier object's; they do not
 * add to them. A second object that set `no-restricted-imports` for `src/**` would silently drop
 * the SDK list. So `restrictedRules()` is the only place the four `no-restricted-*` rules are
 * configured: it cuts the linted tree into disjoint file groups (each object's `ignores` are the
 * groups more specific than it) and gives each group the merged entries of AC-56 and AC-57.
 * AC-59 (TASK-163) adds its `as Minor` entry here. `tests/unit/lint-coverage.test.ts` fails when
 * an entry is missing from the options ESLint resolves for a file of its group.
 *
 * ## The two tables
 * `SDK_ADAPTERS` maps each package to the only files that may import it (plan/01 §5). In any other
 * file `eslint .` lints, a static import or re-export (type-only included) is rejected by
 * `no-restricted-imports` `patterns`, and a dynamic `import()` or `require()` of a literal
 * specifier by `no-restricted-syntax`; the message names the adapter to use. `tests/**` may import
 * every package (tests mock and exercise the adapters); `tests/fixtures/` is not `tests/**` here,
 * which is why the fixture mirror is linted with the lock on. A spec that adds an adapter, or moves
 * one, edits its row in the same PR.
 *
 * `SIDE_DOORS` are AC-56's entries: in `src/`, beside `no-console`, `console` as a value, the
 * `console` property of `globalThis`/`window`/`self`/`global`, `process.stdout`/`process.stderr`
 * (also by a computed name), and importing `console`/`node:console` or `stdout`/`stderr` from
 * `process`/`node:process`. They are off in `SIDE_DOOR_FILES` only. Still passing, said plainly:
 * `const p = process; p.stdout.write(…)`, and a name assembled at run time.
 *
 * `root` is repo-relative, with a trailing `/` when set: the real config passes `""`, the fixture
 * config `"tests/fixtures/lint/"`, the way `moduleBoundaryZones()` takes its `srcRoot`.
 */

/**
 * @typedef {object} SdkAdapter
 * @property {string} name        the row's name in AC-57's table
 * @property {string[]} packages  the packages, as the table spells them
 * @property {string} regex       matches an import specifier of any of them
 * @property {string[]} files     repo-relative files or globs that may import them
 * @property {string} use         what the message tells the importer to use instead
 */

/** @type {readonly SdkAdapter[]} */
export const SDK_ADAPTERS = [
  {
    name: "@sentry/*",
    packages: ["@sentry/*"],
    regex: "^@sentry/",
    files: [
      "src/lib/sentry.ts",
      "sentry.server.config.ts",
      "sentry.edge.config.ts",
      "instrumentation.ts",
      "instrumentation-client.ts",
      "next.config.ts",
    ],
    use: "src/lib/sentry.ts",
  },
  {
    name: "postgres",
    // §13 Q22: `drizzle-orm/postgres-js` is the driver's other entry point.
    packages: ["postgres", "drizzle-orm/postgres-js"],
    regex: "^(?:postgres|drizzle-orm/postgres-js)(?:/|$)",
    // `scripts/db-migrate.ts`: a `node scripts/*.ts` run cannot resolve `@/lib/db`.
    files: ["src/lib/db.ts", "scripts/db-migrate.ts"],
    use: "src/lib/db.ts",
  },
  {
    name: "stripe",
    packages: ["stripe"],
    regex: "^stripe(?:/|$)",
    files: ["src/modules/payments/stripe/**"],
    use: "src/modules/payments/stripe/",
  },
  {
    name: "@mollie/*",
    packages: ["@mollie/*"],
    regex: "^@mollie/",
    files: ["src/modules/payments/mollie/**"],
    use: "src/modules/payments/mollie/",
  },
  {
    name: "resend",
    packages: ["resend"],
    regex: "^resend(?:/|$)",
    files: ["src/modules/notifications/resend/**"],
    use: "src/modules/notifications/resend/",
  },
];

/**
 * Where every package of `SDK_ADAPTERS` may be imported: the tests, except `tests/fixtures/`
 * (AC-57's last row). The fixture mirror `tests/fixtures/lint/` gets its own groups.
 */
export const SDK_ALLOWED_EVERYWHERE_IN = ["tests/**"];
export const SDK_LOCKED_AGAIN_IN = ["tests/fixtures/**"];

/** The mirror tree `lint:fixtures` lints; the real config leaves it to the mirror's groups. */
export const FIXTURE_MIRROR_ROOT = "tests/fixtures/lint/";

/** The only files in `src/` where AC-56's side doors are open (AC-52's "allowed off" cell). */
export const SIDE_DOOR_FILES = ["src/lib/logger.ts", "src/lib/step-summary.ts"];

const LINTED = ["js", "jsx", "mjs", "cjs", "ts", "tsx", "mts", "cts"];

const SIDE_DOOR_MESSAGE =
  "Write through `logger` (`src/lib/logger.ts`), or step-summary text through `src/lib/step-summary.ts`: no output may skip the PII scan (spec 001 AC-56).";

const sdkMessage = (/** @type {SdkAdapter} */ row) =>
  `${row.packages.join(" and ")} may be imported only in ${row.files.join(", ")}: use ${row.use} (spec 001 AC-57).`;

/**
 * esquery reads a regex up to the next `/`, so a `/` inside one is written `/`.
 * @param {string} regex
 */
const selectorRegex = (regex) => regex.replaceAll("/", "\\u002F");

/** `x as T`, `<T>x`, `x!` and `x satisfies T`: the wrappers that hide an identifier from a rule. */
const TS_WRAPPER =
  "/^TS(?:AsExpression|TypeAssertion|NonNullExpression|SatisfiesExpression)$/";

/**
 * AC-56's entries, one list per rule. Each entry carries an `id` so the coverage test can name the
 * one that went missing; ESLint ignores keys its schemas do not know only where the schema allows
 * it, so `id` is stripped before an entry reaches a rule (see `toRuleOptions`).
 */
export const SIDE_DOORS = {
  "no-restricted-globals": [
    { id: "AC-56 console value", name: "console", message: SIDE_DOOR_MESSAGE },
  ],
  "no-restricted-properties": [
    ...["globalThis", "window", "self", "global"].map((object) => ({
      id: `AC-56 ${object}.console`,
      object,
      property: "console",
      message: SIDE_DOOR_MESSAGE,
    })),
    ...["stdout", "stderr"].map((property) => ({
      id: `AC-56 process.${property}`,
      object: "process",
      property,
      message: SIDE_DOOR_MESSAGE,
    })),
  ],
  "no-restricted-syntax": [
    {
      id: "AC-56 computed console",
      selector:
        "MemberExpression[computed=true][object.name=/^(?:globalThis|window|self|global)$/][property.value='console']",
      message: SIDE_DOOR_MESSAGE,
    },
    {
      id: "AC-56 computed process stream",
      selector:
        "MemberExpression[computed=true][object.name='process'][property.value=/^(?:stdout|stderr)$/]",
      message: SIDE_DOOR_MESSAGE,
    },
    // Behind a TypeScript wrapper, `(globalThis as X).console` or `process!.stdout`, the object
    // is not an identifier and `no-restricted-properties` does not see it (/break 117 hole 6).
    {
      id: "AC-56 wrapped console",
      selector: `MemberExpression[object.type=${TS_WRAPPER}][object.expression.name=/^(?:globalThis|window|self|global)$/]:matches([computed=false][property.name='console'], [computed=true][property.value='console'])`,
      message: SIDE_DOOR_MESSAGE,
    },
    {
      id: "AC-56 wrapped process stream",
      selector: `MemberExpression[object.type=${TS_WRAPPER}][object.expression.name='process']:matches([computed=false][property.name=/^(?:stdout|stderr)$/], [computed=true][property.value=/^(?:stdout|stderr)$/])`,
      message: SIDE_DOOR_MESSAGE,
    },
  ],
  "no-restricted-imports": {
    paths: [
      ...["console", "node:console"].map((name) => ({
        id: `AC-56 import ${name}`,
        name,
        message: SIDE_DOOR_MESSAGE,
      })),
      ...["process", "node:process"].map((name) => ({
        id: `AC-56 import { stdout, stderr } from ${name}`,
        name,
        importNames: ["stdout", "stderr"],
        message: SIDE_DOOR_MESSAGE,
      })),
    ],
    patterns: [],
  },
};

/** AC-57's entries for the given adapter rows. */
function sdkEntries(/** @type {readonly SdkAdapter[]} */ rows) {
  return {
    patterns: rows.map((row) => ({
      id: `AC-57 import ${row.name}`,
      regex: row.regex,
      message: sdkMessage(row),
    })),
    syntax: rows.flatMap((row) => [
      {
        id: `AC-57 import() ${row.name}`,
        selector: `ImportExpression[source.value=/${selectorRegex(row.regex)}/]`,
        message: sdkMessage(row),
      },
      {
        id: `AC-57 require() ${row.name}`,
        selector: `CallExpression[callee.name='require'][arguments.0.value=/${selectorRegex(row.regex)}/]`,
        message: sdkMessage(row),
      },
      // A template literal with no substitution is a literal specifier too (/break 117 hole 5).
      {
        id: `AC-57 import(\`\`) ${row.name}`,
        selector: `ImportExpression[source.type='TemplateLiteral'][source.expressions.length=0][source.quasis.0.value.cooked=/${selectorRegex(row.regex)}/]`,
        message: sdkMessage(row),
      },
      {
        id: `AC-57 require(\`\`) ${row.name}`,
        selector: `CallExpression[callee.name='require'][arguments.0.type='TemplateLiteral'][arguments.0.expressions.length=0][arguments.0.quasis.0.value.cooked=/${selectorRegex(row.regex)}/]`,
        message: sdkMessage(row),
      },
      // The type `import("stripe").Stripe` is a type-only import (AC-57, /break 117 hole 5).
      {
        id: `AC-57 import("…") type ${row.name}`,
        selector: `TSImportType[argument.literal.value=/${selectorRegex(row.regex)}/]`,
        message: sdkMessage(row),
      },
    ]),
  };
}

/**
 * The merged entries for one file group, with each entry's `id`. `sideDoors` says whether AC-56
 * applies; `sdks` are the adapter rows whose packages the group may not import.
 * @param {{ sideDoors: boolean, sdks: readonly SdkAdapter[] }} group
 */
export function restrictedEntries(group) {
  const sdk = sdkEntries(group.sdks);
  const doors = group.sideDoors ? SIDE_DOORS : undefined;
  return {
    "no-restricted-globals": doors?.["no-restricted-globals"] ?? [],
    "no-restricted-properties": doors?.["no-restricted-properties"] ?? [],
    "no-restricted-syntax": [
      ...(doors?.["no-restricted-syntax"] ?? []),
      ...sdk.syntax,
    ],
    "no-restricted-imports": {
      paths: doors?.["no-restricted-imports"].paths ?? [],
      patterns: sdk.patterns,
    },
  };
}

/** Drop the `id` keys: the rules' option schemas do not allow them. */
const bare = (/** @type {{ id: string }} */ entry) =>
  Object.fromEntries(Object.entries(entry).filter(([key]) => key !== "id"));

/** The ESLint `rules` object for one group's entries. */
function toRuleOptions(
  /** @type {ReturnType<typeof restrictedEntries>} */ entries,
) {
  const imports = entries["no-restricted-imports"];
  return {
    "no-restricted-globals": [
      "error",
      ...entries["no-restricted-globals"].map(bare),
    ],
    "no-restricted-properties": [
      "error",
      ...entries["no-restricted-properties"].map(bare),
    ],
    "no-restricted-syntax": [
      "error",
      ...entries["no-restricted-syntax"].map(bare),
    ],
    "no-restricted-imports": [
      "error",
      {
        paths: imports.paths.map(bare),
        patterns: imports.patterns.map(bare),
      },
    ],
  };
}

const isSrc = (/** @type {string} */ file) => file.startsWith("src/");
const globsUnder = (/** @type {string} */ dir) =>
  LINTED.map((ext) => `${dir}**/*.${ext}`);

/**
 * The file groups of the linted tree, most general first, each disjoint from the others:
 * everything; `src/`; the side-door files; each adapter's files, split into their `src/` and
 * other halves; and `tests/**`, which gets no group because every package is allowed there and
 * AC-56 is a `src/` rule.
 * @param {{ root?: string }} [options]
 */
export function restrictedGroups(options = {}) {
  const root = options.root ?? "";
  const at = (/** @type {string} */ path) =>
    path.startsWith("!") ? `!${root}${path.slice(1)}` : `${root}${path}`;
  const adapterGroups = SDK_ADAPTERS.flatMap((row) => {
    const others = SDK_ADAPTERS.filter((other) => other !== row);
    return [
      { files: row.files.filter(isSrc), sideDoors: true },
      { files: row.files.filter((file) => !isSrc(file)), sideDoors: false },
    ]
      .filter((half) => half.files.length > 0)
      .map((half) => ({
        name: `fo/restricted/adapter/${row.name}${half.sideDoors ? "/src" : ""}`,
        files: half.files.map(at),
        ignores: [],
        sideDoors: half.sideDoors,
        sdks: others,
      }));
  });
  const srcAdapterFiles = SDK_ADAPTERS.flatMap((row) =>
    row.files.filter(isSrc),
  );
  const otherAdapterFiles = SDK_ADAPTERS.flatMap((row) =>
    row.files.filter((file) => !isSrc(file)),
  );
  return [
    {
      name: "fo/restricted/everywhere",
      files: globsUnder(root),
      // Order matters: `ignores` read as gitignore lines, so `!tests/fixtures/**` takes the
      // fixtures back after `tests/**` let them go.
      ignores: [
        ...SDK_ALLOWED_EVERYWHERE_IN,
        ...SDK_LOCKED_AGAIN_IN.map((pattern) => `!${pattern}`),
        ...(root === "" ? [`${FIXTURE_MIRROR_ROOT}**`] : []),
        "src/**",
        ...otherAdapterFiles,
      ].map(at),
      sideDoors: false,
      sdks: SDK_ADAPTERS,
    },
    {
      name: "fo/restricted/src",
      files: globsUnder(at("src/")),
      ignores: [...SIDE_DOOR_FILES, ...srcAdapterFiles].map(at),
      sideDoors: true,
      sdks: SDK_ADAPTERS,
    },
    {
      name: "fo/restricted/side-door-files",
      files: SIDE_DOOR_FILES.map(at),
      ignores: [],
      sideDoors: false,
      sdks: SDK_ADAPTERS,
    },
    ...adapterGroups,
  ];
}

/**
 * The flat-config objects that configure the four `no-restricted-*` rules, one per file group.
 * The real config spreads `restrictedRules()`; the fixture config spreads
 * `restrictedRules({ root: "tests/fixtures/lint/" })`.
 * @param {{ root?: string }} [options]
 * @returns {import("eslint").Linter.Config[]}
 */
export function restrictedRules(options = {}) {
  return restrictedGroups(options).map((group) => ({
    name: `${group.name}${options.root ? `/${options.root}` : ""}`,
    files: group.files,
    ...(group.ignores.length > 0 ? { ignores: group.ignores } : {}),
    rules: toRuleOptions(restrictedEntries(group)),
  }));
}
