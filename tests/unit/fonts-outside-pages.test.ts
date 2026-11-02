/**
 * The page faces load outside the page graph (spec 010 TASK-204; the 2026-10-25 local run).
 *
 * Route handlers reach `ui/fonts` through the `ui` barrel (`catalog`, `geo`). `next/font` is only
 * compiled in the page graph, so there `localFont()` is a plain call that returns nothing under
 * `next dev`; `fontVariables` read `.variable` from it at module load and every such route
 * (`/api/health`, `POST /api/checkout/start`, "Try a demo order") answered 500. This loads the
 * module with `localFont()` returning `undefined`, as a route handler sees it.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/local", () => ({ default: () => undefined }));

describe("ui/fonts outside the page graph", () => {
  it("loads, and gives an empty class list, when next/font is not compiled", async () => {
    const fonts = await import("../../src/modules/ui/fonts/index.ts");
    expect(fonts.fontVariables).toBe("");
  });

  it("loads through the ui barrel a route handler imports", async () => {
    await expect(
      import("../../src/modules/ui/index.ts"),
    ).resolves.toBeDefined();
  });
});
