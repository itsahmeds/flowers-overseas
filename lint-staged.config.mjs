/**
 * lint-staged (spec 001 §2 "Husky pre-commit", TASK-002): ESLint + Prettier on staged files.
 * `tsc --noEmit` runs separately in `.husky/pre-commit` because it needs the whole program.
 */
const config = {
  "*.{js,mjs,cjs,ts,mts,tsx}": [
    "eslint --fix --max-warnings=0 --no-warn-ignored",
    "prettier --write --ignore-unknown",
  ],
  "!*.{js,mjs,cjs,ts,mts,tsx}": "prettier --write --ignore-unknown",
};

export default config;
