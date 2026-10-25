/**
 * `megaMenuModel(locale, iso2 | null)` (spec 004 §14 A-founder-2026-10-24a item 5, AC-100, T-106;
 * spec 043 AC-2, AC-3, AC-6, AC-50, T-01 to T-03 and T-06 regenerated, T-50; TASK-383).
 *
 * The pinned tables (`tests/fixtures/header/mega-menu-*.json`) are the model over the committed
 * catalogue with the clock fixed, out of context in `en` and `en-gb` and in context for every shop
 * country in `en`. Regenerate with `UPDATE_MEGA_FIXTURES=1` after a deliberate data change and read
 * the diff: it is the menu every page draws.
 *
 * The other cases change one input through `MegaMenuData` (the model's only seam), so the real
 * builder runs: a hub removed from the existence rule removes its entry (AC-100, spec 043 AC-2), a
 * country page missing in context removes the entry rather than linking the hub (AC-50), and the
 * link kinds follow item 3 (hub entries plain, shop entries through the chooser, no query string
 * on any `<a href>`).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  type MegaMenuData,
  chooseSegment,
  megaMenuModel,
  parseChooserPath,
  shopCountries,
} from "../../src/modules/catalog/index.ts";
// The committed inputs are not on the barrel (it exports no object that reads a provider, AC-2);
// the test reads them where they live to build its fixtures from the real ones.
import { committedMegaMenuData } from "../../src/modules/catalog/mega-menu.ts";
import {
  type MegaMenuModel,
  panelEntries,
} from "../../src/modules/ui/index.ts";
import { RECIPIENT_GROUPS } from "../../src/config/mega-menu.ts";

const NOW = new Date("2026-10-25T09:00:00Z");
const FIXTURES = join(import.meta.dirname, "../fixtures/header");

function pinned(name: string, model: MegaMenuModel): MegaMenuModel {
  const file = join(FIXTURES, `${name}.json`);
  if (process.env.UPDATE_MEGA_FIXTURES === "1" || !existsSync(file)) {
    writeFileSync(file, `${JSON.stringify(model, null, 2)}\n`);
  }
  return JSON.parse(readFileSync(file, "utf8")) as MegaMenuModel;
}

function entriesOf(model: MegaMenuModel) {
  return model.panels.flatMap((panel) => panelEntries(panel));
}

function panel(model: MegaMenuModel, id: string) {
  const found = model.panels.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`no ${id} panel`);
  return found;
}

describe("megaMenuModel out of context (AC-100, spec 043 AC-3)", () => {
  it.each(["en", "en-gb"])(
    "%s equals the pinned table built from the committed data",
    async (locale) => {
      const model = await megaMenuModel(locale, null, { now: NOW });
      expect(model).toEqual(pinned(`mega-menu-${locale}`, model));
    },
  );

  it("draws the six items in the row's order", async () => {
    const model = await megaMenuModel("en", null, { now: NOW });
    expect(model.panels.map((item) => item.id)).toEqual([
      "flowers",
      "occasions",
      "sympathy",
      "plantsGifts",
      "byPrice",
      "destinations",
    ]);
    expect(model.context).toBeNull();
  });

  it("links hubs plainly and shop entries through the chooser, path only (item 3, AC-76)", async () => {
    const model = await megaMenuModel("en", null, { now: NOW });
    const segment = chooseSegment("en");
    for (const entry of entriesOf(model)) {
      expect(entry.kind, entry.id).not.toBe("facet");
      if (entry.kind === "facet") continue;
      expect(entry.href, entry.id).not.toContain("?");
      const throughChooser = entry.href.startsWith(`/en/${segment}`);
      const isShopEntry =
        entry.id.startsWith("colour:") ||
        entry.id.startsWith("price:") ||
        entry.id === "all-flowers";
      expect(entry.kind, entry.id).toBe(isShopEntry ? "chooser" : "link");
      expect(throughChooser, entry.id).toBe(isShopEntry);
    }
    // The price bands carry `price/{band}` in the chooser's path, and nothing else does.
    const bands = panelEntries(panel(model, "byPrice")).map((entry) =>
      entry.kind === "chooser"
        ? parseChooserPath("en", entry.href.split("/").slice(3)).next
        : null,
    );
    expect(bands).toEqual([
      { locale: "en", kind: "price", band: "low" },
      { locale: "en", kind: "price", band: "mid" },
      { locale: "en", kind: "price", band: "high" },
    ]);
  });

  it("features country-less core cards through the chooser (item 2, AC-99)", async () => {
    const model = await megaMenuModel("en", null, { now: NOW });
    for (const id of ["flowers", "occasions", "sympathy", "plantsGifts"]) {
      const featured = panel(model, id).featured;
      expect(featured, id).not.toBeNull();
      if (featured === null) continue;
      expect(featured.chooser, id).toBe(true);
      expect("price" in featured.card, id).toBe(false);
      expect(featured.href, id).toBe(
        `/en/${chooseSegment("en")}/product/${featured.href.split("/").at(-1) ?? ""}`,
      );
    }
    expect(panel(model, "byPrice").featured).toBeNull();
    expect(panel(model, "destinations").featured).toBeNull();
  });

  it("lists For whom from RECIPIENT_GROUPS, only where the hub exists", async () => {
    const without = new Set(["grandparents_day"]);
    const data: MegaMenuData = {
      ...committedMegaMenuData,
      hubPath: async (locale, kind, key) =>
        kind === "occasion" && without.has(key)
          ? undefined
          : committedMegaMenuData.hubPath(locale, kind, key),
    };
    const model = await megaMenuModel("en", null, { now: NOW, data });
    const forWhom = panel(model, "occasions").columns.find(
      (column) => column.id === "forWhom",
    );
    expect(forWhom?.entries.map((entry) => entry.id)).toEqual(
      RECIPIENT_GROUPS.filter((group) => !without.has(group.occasionKey)).map(
        (group) => `recipient:${group.id}`,
      ),
    );
  });

  it("lists Coming up as the next five dated occasions by earliest date across shop countries", async () => {
    const model = await megaMenuModel("en", null, { now: NOW });
    const comingUp = panel(model, "occasions").columns.find(
      (column) => column.id === "comingUp",
    );
    const dates = (comingUp?.entries ?? []).map((entry) =>
      entry.kind === "link" ? entry.date : undefined,
    );
    expect(dates.length).toBe(5);
    expect(
      dates.every((date) => date !== undefined && date >= "2026-10-25"),
    ).toBe(true);
    expect([...dates].sort()).toEqual(dates);
    // The earliest date across the shop set: a country with an earlier date wins.
    const countries = await shopCountries("en");
    for (const entry of comingUp?.entries ?? []) {
      if (entry.kind !== "link") continue;
      const key = entry.id.replace("coming-up:", "");
      const earliest = countries
        .flatMap((iso2) =>
          committedMegaMenuData
            .datedOccasions(iso2, "2026-10-25", 12)
            .filter((dated) => dated.occasionKey === key)
            .map((dated) => dated.date),
        )
        .sort()[0];
      expect(entry.date, key).toBe(earliest);
    }
  });

  it("removes an entry whose page is removed (AC-100, spec 043 AC-2)", async () => {
    const data: MegaMenuData = {
      ...committedMegaMenuData,
      hubPath: async (locale, kind, key) =>
        kind === "category" && key === "roses"
          ? undefined
          : committedMegaMenuData.hubPath(locale, kind, key),
    };
    const before = await megaMenuModel("en", null, { now: NOW });
    const after = await megaMenuModel("en", null, { now: NOW, data });
    const ids = (model: MegaMenuModel) => entriesOf(model).map((e) => e.id);
    expect(ids(before)).toContain("category:roses");
    expect(ids(after)).not.toContain("category:roses");
    expect(ids(after).length).toBe(ids(before).length - 1);
  });

  it("links every hub out of context (spec 043 AC-6: no hub without an inbound link)", async () => {
    const model = await megaMenuModel("en", null, { now: NOW });
    const linked = new Set(entriesOf(model).map((entry) => entry.id));
    const categories = await committedMegaMenuData.categories();
    for (const row of categories) {
      if (row.kind === "occasion") continue;
      const exists = await committedMegaMenuData.hubPath(
        "en",
        "category",
        row.key,
      );
      if (exists === undefined) continue;
      expect(linked.has(`category:${row.key}`), row.key).toBe(true);
    }
    const occasions = await committedMegaMenuData.occasions();
    for (const row of occasions) {
      if (row.kind !== "evergreen") continue;
      const exists = await committedMegaMenuData.hubPath(
        "en",
        "occasion",
        row.key,
      );
      if (exists === undefined) continue;
      expect(linked.has(`occasion:${row.key}`), row.key).toBe(true);
    }
  });

  it("gives a pseudo-locale no menu", async () => {
    expect(await megaMenuModel("ar-XB", null, { now: NOW })).toEqual({
      context: null,
      panels: [],
    });
  });
});

describe("megaMenuModel in context (spec 043 AC-50, T-50)", () => {
  it("equals the pinned table for each shop country", async () => {
    for (const iso2 of await shopCountries("en")) {
      const model = await megaMenuModel("en", iso2, { now: NOW });
      expect(model, iso2).toEqual(
        pinned(`mega-menu-en-${iso2.toLowerCase()}`, model),
      );
    }
  });

  it("links the country's own pages, submits shop entries to its shop root, features its priced cards", async () => {
    const [iso2] = await shopCountries("en");
    if (iso2 === undefined) throw new Error("no shop country");
    const model = await megaMenuModel("en", iso2, { now: NOW });
    expect(model.context).toBe(iso2);
    const shopRoot = await committedMegaMenuData.shopRoot("en", iso2 as never);
    for (const entry of entriesOf(model)) {
      if (entry.id.startsWith("colour:") || entry.id.startsWith("price:")) {
        expect(entry.kind, entry.id).toBe("facet");
        if (entry.kind === "facet") expect(entry.action).toBe(shopRoot);
        continue;
      }
      expect(entry.kind, entry.id).toBe("link");
      if (entry.kind !== "link") continue;
      expect(entry.href, entry.id).not.toContain(`/${chooseSegment("en")}`);
      if (
        entry.id.startsWith("category:") ||
        entry.id.startsWith("occasion:")
      ) {
        // Never the country-less hub: the hub's path has no country segment.
        const [kind, key] = entry.id.split(":") as [
          "category" | "occasion",
          string,
        ];
        expect(entry.href, entry.id).not.toBe(
          await committedMegaMenuData.hubPath("en", kind, key),
        );
      }
    }
    for (const id of ["flowers", "occasions", "sympathy", "plantsGifts"]) {
      const featured = panel(model, id).featured;
      if (featured === null) continue;
      expect(featured.chooser, id).toBe(false);
      expect("price" in featured.card, id).toBe(true);
      expect(featured.href, id).toBe(featured.card.href);
    }
  });

  it("drops an entry with no page in the country instead of linking the hub (AC-50, AC-2)", async () => {
    const [iso2] = await shopCountries("en");
    if (iso2 === undefined) throw new Error("no shop country");
    const data: MegaMenuData = {
      ...committedMegaMenuData,
      countryHubPath: async (locale, kind, key, country) =>
        kind === "category" && key === "roses"
          ? undefined
          : committedMegaMenuData.countryHubPath(locale, kind, key, country),
    };
    const model = await megaMenuModel("en", iso2, { now: NOW, data });
    const ids = entriesOf(model).map((entry) => entry.id);
    expect(ids).not.toContain("category:roses");
    const all = panel(model, "flowers").all;
    expect(all?.kind === "link" ? all.href : null).toBe(
      await committedMegaMenuData.shopRoot("en", iso2 as never),
    );
  });

  it("treats a country with no shop root as out of context", async () => {
    const [iso2] = await shopCountries("en");
    if (iso2 === undefined) throw new Error("no shop country");
    const data: MegaMenuData = {
      ...committedMegaMenuData,
      shopRoot: async () => undefined,
    };
    const model = await megaMenuModel("en", iso2, { now: NOW, data });
    expect(model.context).toBeNull();
    expect(model).toEqual(await megaMenuModel("en", null, { now: NOW }));
  });
});
