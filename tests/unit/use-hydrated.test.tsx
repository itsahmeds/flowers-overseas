/**
 * `useHydrated()` and the consent loader that uses it (spec 004 §5.4: the consent island is never
 * server-rendered; TASK-376 replaced `next/dynamic({ ssr: false })` with this gate and
 * `React.lazy`, taking `next/dynamic`'s runtime off every page).
 *
 * The server half is asserted by rendering: the hook answers `false` on the server, so the loader
 * renders nothing and the cached HTML is the same for every visitor. The client half (the island's
 * chunk requested right after hydration, where a consent source is active) needs a browser: the
 * `consent-active` suites assert the sheet appears, and `tests/e2e/client-js-budget.spec.ts` that
 * the default build (nothing needs consent, TASK-279) fetches exactly the set
 * `budget:client-js` charges, which leaves the island out until "Cookie settings" is pressed.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { prerender } from "react-dom/static";
import { describe, expect, it } from "vitest";

import {
  ConsentBannerLoader,
  type ConsentBannerLoaderProps,
} from "../../src/modules/ui/consent/ConsentBannerLoader";
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
  it.each([true, false])(
    "renders no markup on the server, whatever its props (prompt %s)",
    async (prompt) => {
      // `prerender` waits for every Suspense boundary, as a server render of the page does: without
      // the gate the lazy island would be imported and rendered here. Before hydration the loader
      // reads only the reopen attribute (its "Cookie settings" listener, TASK-279), so a view with
      // just that is enough to prove it.
      const props = {
        view: { config: { reopenAttribute: "data-fo-consent-reopen" } },
        prompt,
      } as unknown as ConsentBannerLoaderProps;
      const { prelude } = await prerender(<ConsentBannerLoader {...props} />);
      expect(await new Response(prelude).text()).toBe("");
    },
  );

  it("mounts the lazy island only behind the hydration gate, inside a Suspense", () => {
    const loader = code("src/modules/ui/consent/ConsentBannerLoader.tsx");
    expect(loader).toMatch(
      /const Island = lazy\(async \(\) => import\("\.\/ConsentBannerIsland"\)\);/u,
    );
    expect(loader).toMatch(/const hydrated = useHydrated\(\);/u);
    // The gate returns before either mode (TASK-279's prompt and on-press modes) renders the island.
    const gate = loader.indexOf("if (!hydrated) return null;");
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(loader.indexOf("<Island"));
    // Every mount of the island sits directly inside its own Suspense.
    const mounts = loader.match(/<Island[\s\S]*?\/>/gu) ?? [];
    expect(mounts).toHaveLength(2);
    expect(
      loader.match(
        /<Suspense fallback=\{null\}>\s*<Island[^>]*\/>\s*<\/Suspense>/gu,
      ),
    ).toHaveLength(2);
    expect(loader).not.toMatch(/next\/dynamic/u);
  });
});
