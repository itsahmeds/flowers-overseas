"use client";

// `/break 270` hole 7: a client module that reaches the locale rows only through a dynamic
// `import()`. `tests/unit/client-message-graph.test.ts` asserts the import walk finds the edge.
export const rows = () => import("../../../src/config/locales.data.ts");
