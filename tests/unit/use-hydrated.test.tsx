/**
 * `useHydrated()` and the consent loader that uses it (spec 004 §5.4: the consent island is never
 * server-rendered; TASK-376 replaced `next/dynamic({ ssr: false })` with this gate and
 * `React.lazy`, taking `next/dynamic`'s runtime off every page).
 *
 * The server half is asserted by rendering: the hook answers `false` on the server, so the loader
 * renders nothing and the cached HTML is the same for every visitor. The client half (the island's
 * chunk requested right after hydration) needs a browser: `tests/e2e/client-js-budget.spec.ts`
 * asserts the consent chunk is in the set Chromium fetches on every audited URL, and
 * `tests/e2e/consent-banner.spec.ts` that the sheet still appears.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { prerender } from "react-dom/static";
import { describe, expect, it } from "vitest";

import { ConsentBannerLoader } from "../../src/modules/ui/consent/ConsentBannerLoader";
import type { ConsentBannerIslandProps } from "../../src/modules/ui/consent/ConsentBannerIsland";
import { useHydrated } from "../../src/modules/ui/deferred/useHydrated";

function Probe() {
  return <i>{String(useHydrated())}</i>;
}

const code = (path: string): string =>
  readFileSync(resolve(import.meta.dirname, "../..", path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/(^|[^:])\/\/.*$/gmu, "$1");

describe("useHydrated() (TASK-376)", () => {
  it("answers false on the server", () => {
    expect(renderToStaticMarkup(<Probe />)).toBe("<i>false</i>");
  });
});

describe("ConsentBannerLoader is never server-rendered (§5.4)", () => {
  it("renders no markup on the server, whatever its props", async () => {
    // `prerender` waits for every Suspense boundary, as a server render of the page does: without
    // the gate the lazy island would be imported and rendered here. The loader never reads its
    // props before hydration, so an empty view is enough to prove it.
    const props = { view: {} } as unknown as ConsentBannerIslandProps;
    const { prelude } = await prerender(<ConsentBannerLoader {...props} />);
    expect(await new Response(prelude).text()).toBe("");
  });

  it("mounts the lazy island only behind the hydration gate, inside a Suspense", () => {
    const loader = code("src/modules/ui/consent/ConsentBannerLoader.tsx");
    expect(loader).toMatch(
      /const Island = lazy\(async \(\) => import\("\.\/ConsentBannerIsland"\)\);/u,
    );
    expect(loader).toMatch(
      /return useHydrated\(\) \? \(\s*<Suspense fallback=\{null\}>\s*<Island \{\.\.\.props\} \/>\s*<\/Suspense>\s*\) : null;/u,
    );
    expect(loader).not.toMatch(/next\/dynamic/u);
  });
});
