/**
 * The corridor page's state-B chip row, served (spec 007 §2 "Internal links", §14 A9 and A10;
 * spec 008 AC-20; TASK-147).
 *
 * State B renders on no real page in Phase 0, so the page under test is the fixture
 * `/dev/components/corridor-state-b`: the real Poland guide in its live state with the real shop
 * entry, chips included (`src/app/(dev)/dev/components/corridor-state-b/page.tsx`). What only a
 * request can prove: every chip answers 200 (a link to a 404 is the defect the existence rule
 * exists to prevent), the row sits in the shop entry after the shop-root link, and **the real
 * guide page carries no chip** (A9).
 */
import { expect, test } from "@playwright/test";

const FIXTURE = "/dev/components/corridor-state-b";
const GUIDE_URL = "/en/send-flowers-to/poland";
const SHOP = "[data-fo-corridor-shop]";
const ROW = "[data-fo-corridor-shop-chips]";

test.describe("state B: the shop entry's chip row (A10)", () => {
  test("renders seven chips under the shop-root link, every one a page that answers 200", async ({
    page,
    request,
  }) => {
    const response = await page.goto(FIXTURE);
    expect(
      response?.status(),
      `${FIXTURE} must be served; is ENABLE_DEV_UI=true on the target?`,
    ).toBe(200);
    await expect(page.locator("[data-fo-corridor-state=live]")).toHaveCount(1);

    const shop = page.locator(SHOP);
    await expect(shop).toHaveCount(1);
    await expect(shop.locator("a").first()).toHaveAttribute(
      "href",
      "/en/poland/flowers",
    );

    const row = shop.locator(ROW);
    await expect(row).toHaveCount(1);
    await expect(row.getByText("Also for Poland")).toBeVisible();
    const links = row.locator("a");
    await expect(links).toHaveCount(7);
    await expect(row.locator('[data-fo-shop-chip="category"]')).toHaveCount(6);
    await expect(row.locator('[data-fo-shop-chip="occasion"]')).toHaveCount(1);
    await expect(row.locator("a", { hasText: "Mother's Day" })).toHaveAttribute(
      "href",
      "/en/poland/occasions/mothers-day",
    );

    const hrefs = await links.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("href") ?? ""),
    );
    expect(new Set(hrefs).size, "seven distinct targets").toBe(7);
    for (const href of hrefs) {
      const target = await request.get(href, { maxRedirects: 0 });
      expect(target.status(), href).toBe(200);
    }
  });

  test("the row follows the shop-root link in reading order and is a named landmark", async ({
    page,
  }) => {
    await page.goto(FIXTURE);
    const order = await page
      .locator(`${SHOP} a`)
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("href") ?? ""),
      );
    expect(order[0]).toBe("/en/poland/flowers");
    expect(order).toHaveLength(8);
    const name = await page
      .locator(ROW)
      .getAttribute("aria-labelledby")
      .then((id) => page.locator(`#${id ?? "!"}`).textContent());
    // `textContent`, not `innerText`: the eyebrow is drawn upper-case by CSS.
    expect((name ?? "").trim()).toBe("Also for Poland");
  });

  test("the real guide page, state A, carries the shop-root link and no chip (A9)", async ({
    page,
  }) => {
    await page.goto(GUIDE_URL);
    await expect(page.locator("[data-fo-corridor-state=guide]")).toHaveCount(1);
    await expect(page.locator(SHOP)).toHaveCount(1);
    await expect(page.locator(ROW)).toHaveCount(0);
    await expect(page.locator(`${SHOP} a`)).toHaveCount(1);
  });
});
