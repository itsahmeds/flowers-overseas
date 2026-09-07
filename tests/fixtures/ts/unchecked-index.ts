// Fixture for AC-2 / T-02: MUST fail `tsc -p tsconfig.fixtures.json` with TS2532 (Object is possibly 'undefined').
// Excluded from the main `pnpm typecheck` project.
const cities: string[] = ["Warsaw"];
export const firstLength: number = cities[0].length;
