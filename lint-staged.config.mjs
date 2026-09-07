/**
 * lint-staged (spec 001 §2 "Husky pre-commit", TASK-002): ESLint + Prettier on staged files.
 * `tsc --noEmit` runs separately in `.husky/pre-commit` because it needs the whole program.
 */
const config = {
  "*.{js,mjs,cjs,ts,mts,tsx}": [
    "eslint --fix --max-warnings=0 --no-warn-ignored",
    "prettier --write --ignore-unknown",
  ],
  // Stylelint enforces the logical-CSS bans of spec 001 §7 (TASK-003); Prettier still runs on
  // the same files through the catch-all below.
  "src/**/*.css": "stylelint",
  "!*.{js,mjs,cjs,ts,mts,tsx}": "prettier --write --ignore-unknown",
};

export default config;
