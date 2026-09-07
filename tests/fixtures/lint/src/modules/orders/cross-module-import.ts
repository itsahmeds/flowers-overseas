// Invalid fixture: deep import into another module's internals (spec 001 AC-9; plan/01 §5).
// Physically under the mirrored `tests/fixtures/lint/src` tree so that the import resolves —
// `import/no-restricted-paths` skips any specifier it cannot resolve. See README.md.
import { x } from "@/modules/catalog/internal/pricing";

export const y = x;
