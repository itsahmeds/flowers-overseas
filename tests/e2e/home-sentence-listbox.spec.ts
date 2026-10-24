/**
 * The home sentence's own listbox on a mouse (spec 004 §14 A-founder-2026-10-21d; TASK-326;
 * `docs/design/wireframes/home-sentence-listbox-desktop.dc.html`). T-65, T-67, T-69, T-70, T-71,
 * T-72 (e2e half), T-73 (e2e half), T-75 (fallbacks) and T-76:
 *
 *  - **AC-60** the server's HTML is unchanged: JavaScript off, three selects, 7 and 6 options,
 *    `country` and `occasion` the only names, no listbox, no `aria-haspopup`, no trigger, and
 *    Continue lands where `/api/send` (which asks `sentenceTarget()`) sends Poland and Birthday.
 *  - **AC-61** one trigger per control on a fine pointer, the select hidden; none on the phone,
 *    where `selectOption` still works; a pointer query that changes tears down and rebuilds.
 *  - **AC-62, AC-63** names, roles, states and the keyboard, with real key presses.
 *  - **AC-64** the pointer. **AC-65** the value flow, the possessive, no stored or sent byte.
 *  - **AC-66** motion 10 read from `getAnimations()` in both motion preferences.
 *  - **AC-67** the panel's tokens, top-layer escape, 44 px rows and room in the viewport.
 *  - **AC-69** a blocked chunk leaves the native select working; a focused select waits.
 *  - **AC-70** zero shift in the sentence, the trigger exactly over the select.
 *
 * Every case but the phone's runs in `e2e-desktop` (a fine pointer); the phone case in
 * `e2e-mobile`. A recorded consent refusal keeps the consent sheet off the sentence.
 */
import {
  type BrowserContext,
  type Page,
  type Route,
  expect,
  test,
} from "@playwright/test";

import {
  SENTENCE_REGION,
  recordLayoutShifts,
  shiftInside,
} from "../support/layout-shift.ts";
import {
  FINE_POINTER_QUERY,
  type SentenceField,
  chooseSentence,
  enhanceSentence,
  sentenceListbox,
  sentenceSelect,
  sentenceTrigger,
} from "../support/sentence.ts";

const FIELDS = ["who", "country", "occasion"] as const;
const ISLAND_MARK = "fo:deferred:home-sentence";
const SCRIPT = /\/_next\/static\/.+\.js(?:\?|$)/u;

async function recordConsentRefusal(
  context: BrowserContext,
  baseURL: string | undefined,
): Promise<void> {
  await context.addCookies([
    {
      name: "fo_consent",
      value: encodeURIComponent(
        JSON.stringify({
          v: 1,
          a: false,
          m: false,
          ts: "2026-09-09T00:00:00.000Z",
          cid: "6f1e6e6a-1d3a-4b5e-9c2f-8f0a1b2c3d4e",
        }),
      ),
      url: baseURL ?? "http://localhost:3000",
    },
  ]);
}

async function home(page: Page, path = "/en"): Promise<void> {
  expect((await page.goto(path))?.status(), path).toBe(200);
  await page.evaluate(() => document.fonts.ready);
}

const activeText = (page: Page): Promise<string | null> =>
  page.evaluate(() => document.activeElement?.textContent ?? null);

/** The label text a field's trigger and listbox are named by. */
async function labelOf(page: Page, field: SentenceField): Promise<string> {
  const selector =
    field === "who" ? "#send-heading" : `label[for="send-${field}"]`;
  return ((await page.locator(selector).textContent()) ?? "").trim();
}

async function selectedText(page: Page, field: SentenceField): Promise<string> {
  return sentenceSelect(page, field).evaluate(
    (node) => (node as HTMLSelectElement).selectedOptions[0]?.text ?? "",
  );
}

/** Where `/api/send/{locale}` sends a choice: `sentenceTarget()`'s answer, the native path's. */
async function nativeTarget(
  page: Page,
  query: Record<string, string>,
): Promise<string> {
  const action = await page.locator("form#send").getAttribute("action");
  const response = await page.request.get(
    `${action ?? ""}?${new URLSearchParams(query).toString()}`,
    { maxRedirects: 0 },
  );
  expect(response.status()).toBe(303);
  return new URL(response.headers()["location"] ?? "", page.url()).pathname;
}

test.beforeEach(async ({ context, baseURL }) => {
  await recordConsentRefusal(context, baseURL);
});

test.describe("AC-60 / T-65: the server's HTML does not change (JavaScript off)", () => {
  test.use({ javaScriptEnabled: false });
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "e2e-desktop", "one project");
  });

  for (const path of ["/en", "/de", "/pl"] as const) {
    test(`${path}: three selects, 7 and 6 options, two names, no listbox, and Continue lands where it did`, async ({
      page,
    }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      const body = (await response?.text()) ?? "";
      expect(body.match(/role="listbox"/gu) ?? []).toEqual([]);
      expect(body.match(/\baria-haspopup=/gu) ?? []).toEqual([]);
      expect(body.match(/data-fo-sentence-trigger/gu) ?? []).toEqual([]);

      const form = page.locator("form#send");
      await expect(form.locator("select")).toHaveCount(3);
      for (const id of ["#send-who", "#send-country", "#send-occasion"]) {
        await expect(form.locator(`select${id}`)).toHaveCount(1);
      }
      await expect(form.locator("#send-country option")).toHaveCount(7);
      await expect(form.locator("#send-occasion option")).toHaveCount(6);
      const names = await form
        .locator("[name]")
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("name")));
      // Each language orders the fields its own way (`/pl`: who, occasion, country).
      expect([...names].sort()).toEqual(["country", "occasion"]);
      await expect(
        form.locator('[role="listbox"], [aria-haspopup]'),
      ).toHaveCount(0);

      const target = await nativeTarget(page, {
        country: "PL",
        occasion: "birthday",
      });
      await chooseSentence(page, "country", "PL");
      await chooseSentence(page, "occasion", "birthday");
      await form.locator('button[type="submit"]').click();
      await page.waitForURL((url) => url.pathname === target);
      expect(new URL(page.url()).search).toBe("");
    });
  }
});

test.describe("AC-61 / T-67: on a fine pointer only, built whole or torn down whole", () => {
  test("e2e-desktop: one closed listbox trigger per control, each select hidden", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "e2e-desktop", "a fine pointer");
    await home(page);
    await enhanceSentence(page);

    for (const field of FIELDS) {
      const pick = page.locator(`[data-fo-pick]:has(> #send-${field})`);
      await expect(
        pick.locator('button[aria-haspopup="listbox"][aria-expanded="false"]'),
        field,
      ).toHaveCount(1);
      expect(
        await sentenceSelect(page, field).evaluate(
          (node) => getComputedStyle(node).visibility,
        ),
        field,
      ).toBe("hidden");
    }
  });

  test("e2e-mobile: no trigger once the island has loaded, the selects visible, selectOption works", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "e2e-mobile", "a coarse pointer");
    await home(page);
    // The island loads at the first interaction with the form: a focus, as a tap gives.
    await sentenceSelect(page, "who").focus();
    await page.waitForFunction(
      (mark) => performance.getEntriesByName(mark).length > 0,
      ISLAND_MARK,
    );
    expect(
      await page.evaluate(
        (query) => window.matchMedia(query).matches,
        FINE_POINTER_QUERY,
      ),
    ).toBe(false);
    await expect(page.locator("[data-fo-sentence-trigger]")).toHaveCount(0);
    await expect(page.locator('[aria-haspopup="listbox"]')).toHaveCount(0);
    for (const field of FIELDS) {
      await expect(sentenceSelect(page, field)).toBeVisible();
    }
    await sentenceSelect(page, "country").selectOption("PL");
    await expect(sentenceSelect(page, "country")).toHaveValue("PL");
  });

  test("a pointer that turns coarse removes the triggers; fine again rebuilds exactly one per control", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "e2e-desktop", "a fine pointer");
    // The query, made switchable: a tablet docked to a mouse, then undocked.
    await page.addInitScript((query) => {
      const real = window.matchMedia.bind(window);
      const listeners = new Set<(event: Event) => void>();
      let fine = true;
      (window as unknown as { __foFine: (value: boolean) => void }).__foFine = (
        value,
      ) => {
        fine = value;
        for (const listener of listeners) listener(new Event("change"));
      };
      window.matchMedia = (asked: string) =>
        asked === query
          ? ({
              media: asked,
              get matches() {
                return fine;
              },
              onchange: null,
              addEventListener: (_type: string, listener: () => void) => {
                listeners.add(listener);
              },
              removeEventListener: (_type: string, listener: () => void) => {
                listeners.delete(listener);
              },
              addListener: () => undefined,
              removeListener: () => undefined,
              dispatchEvent: () => true,
            } as unknown as MediaQueryList)
          : real(asked);
    }, FINE_POINTER_QUERY);
    await home(page);
    await enhanceSentence(page);
    const flip = (value: boolean): Promise<void> =>
      page.evaluate((fine) => {
        (window as unknown as { __foFine: (value: boolean) => void }).__foFine(
          fine,
        );
      }, value);

    await flip(false);
    await expect(page.locator("[data-fo-sentence-trigger]")).toHaveCount(0);
    for (const field of FIELDS) {
      await expect(sentenceSelect(page, field)).toBeVisible();
    }
    await flip(true);
    await flip(true);
    await expect(page.locator("[data-fo-sentence-trigger]")).toHaveCount(3);
    for (const field of FIELDS) {
      await expect(
        page.locator(
          `[data-fo-pick]:has(> #send-${field}) [data-fo-sentence-trigger]`,
        ),
        field,
      ).toHaveCount(1);
    }
  });
});

test.describe("AC-62, AC-63 / T-69: names, roles, states and the keyboard", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "e2e-desktop", "a fine pointer");
  });

  test("closed, each trigger controls its listbox and is named by its label and value", async ({
    page,
  }) => {
    await home(page);
    await enhanceSentence(page);

    for (const field of FIELDS) {
      const trigger = sentenceTrigger(page, field);
      await expect(trigger).toHaveAttribute(
        "aria-controls",
        `send-${field}-listbox`,
      );
      await expect(sentenceListbox(page, field)).toHaveCount(1);
      await expect(trigger).toHaveAccessibleName(
        `${await labelOf(page, field)} ${await selectedText(page, field)}`,
      );
    }
    await expect(sentenceTrigger(page, "country")).toHaveAccessibleName(
      `${await labelOf(page, "country")} Poland`,
    );
  });

  test("open, a named listbox with one option per <option>, the value selected, not-yet disabled, one roving stop focused", async ({
    page,
  }) => {
    await home(page);
    await enhanceSentence(page);
    await sentenceTrigger(page, "country").focus();
    await page.keyboard.press("Enter");
    const list = sentenceListbox(page, "country");
    const options = list.locator('[role="option"]');

    await expect(list).toHaveAttribute("role", "listbox");
    await expect(list).toHaveAccessibleName(await labelOf(page, "country"));
    await expect(options).toHaveCount(
      await sentenceSelect(page, "country").locator("option").count(),
    );
    await expect(list.locator('[aria-selected="true"]')).toHaveCount(1);
    await expect(list.locator('[aria-selected="true"]')).toHaveText(
      await selectedText(page, "country"),
    );
    await expect(list.locator('[aria-disabled="true"]')).toHaveCount(
      await sentenceSelect(page, "country").locator("option[disabled]").count(),
    );
    await expect(list.locator('[tabindex="0"]')).toHaveCount(1);
    await expect(list.locator('[tabindex="-1"]')).toHaveCount(
      (await options.count()) - 1,
    );
    await expect(list.locator('[tabindex="0"]')).toBeFocused();
  });

  for (const key of ["Enter", "Space", "ArrowDown", "ArrowUp"] as const) {
    test(`${key} on the country trigger opens it on the selected option`, async ({
      page,
    }) => {
      await home(page);
      await enhanceSentence(page);
      await sentenceTrigger(page, "country").focus();
      await page.keyboard.press(key);

      await expect(sentenceTrigger(page, "country")).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      expect(await activeText(page)).toBe("Poland");
    });
  }

  test("arrows do not wrap, Home and End reach the ends, and nothing scrolls the page", async ({
    page,
  }) => {
    await home(page);
    await enhanceSentence(page);
    await page.evaluate(() => {
      window.scrollTo(0, 60);
    });
    const scrolled = await page.evaluate(() => window.scrollY);
    expect(scrolled).toBeGreaterThan(0);
    await sentenceTrigger(page, "country").focus();
    await page.keyboard.press("ArrowDown");

    await page.keyboard.press("End");
    expect(await activeText(page)).toBe("Spain (not yet)");
    await page.keyboard.press("ArrowDown");
    expect(await activeText(page)).toBe("Spain (not yet)");
    await page.keyboard.press("Home");
    expect(await activeText(page)).toBe("France (not yet)");
    await page.keyboard.press("ArrowUp");
    expect(await activeText(page)).toBe("France (not yet)");
    expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);
    await page.keyboard.press("End");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    expect(await activeText(page)).toBe("Poland");
    await page.keyboard.press("Space");
    expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);
    await expect(sentenceTrigger(page, "country")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  test("type-ahead on /en: n gives Netherlands, then po gives Poland", async ({
    page,
  }) => {
    await home(page);
    await enhanceSentence(page);
    await sentenceTrigger(page, "country").focus();
    await page.keyboard.press("ArrowDown");

    await page.keyboard.press("n");
    expect(await activeText(page)).toBe("Netherlands (not yet)");
    await page.waitForTimeout(600);
    await page.keyboard.type("po");
    expect(await activeText(page)).toBe("Poland");
  });

  test("type-ahead on /pl: po gives Polska", async ({ page }) => {
    await home(page, "/pl");
    await enhanceSentence(page);
    await sentenceTrigger(page, "country").focus();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Home");

    await page.keyboard.type("po");
    expect(await activeText(page)).toBe("Polska");
  });

  for (const key of ["Enter", "Space"] as const) {
    test(`${key} on an enabled option chooses it: change once, text, focus, no navigation`, async ({
      page,
    }) => {
      await home(page);
      await enhanceSentence(page);
      const before = page.url();
      await page.evaluate(() => {
        const store = window as unknown as { __foChanges: number };
        store.__foChanges = 0;
        document
          .getElementById("send-occasion")
          ?.addEventListener("change", () => {
            store.__foChanges += 1;
          });
      });
      await sentenceTrigger(page, "occasion").focus();
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("End");
      const chosen = await activeText(page);
      await page.keyboard.press(key);

      await expect(sentenceTrigger(page, "occasion")).toHaveAttribute(
        "aria-expanded",
        "false",
      );
      await expect(sentenceSelect(page, "occasion")).toHaveValue("newBaby");
      await expect(sentenceTrigger(page, "occasion")).toHaveText(chosen ?? "");
      await expect(sentenceTrigger(page, "occasion")).toBeFocused();
      expect(
        await page.evaluate(
          () => (window as unknown as { __foChanges: number }).__foChanges,
        ),
      ).toBe(1);
      expect(page.url()).toBe(before);
    });
  }

  test("Enter on a not-yet destination keeps the list open and the value", async ({
    page,
  }) => {
    await home(page);
    await enhanceSentence(page);
    await sentenceTrigger(page, "country").focus();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowUp");
    expect(await activeText(page)).toBe("Netherlands (not yet)");
    await page.keyboard.press("Enter");

    await expect(sentenceTrigger(page, "country")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(sentenceSelect(page, "country")).toHaveValue("PL");
    expect(await activeText(page)).toBe("Netherlands (not yet)");
  });

  test("Escape closes with the value and focus back on the trigger", async ({
    page,
  }) => {
    await home(page);
    await enhanceSentence(page);
    await sentenceTrigger(page, "who").focus();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Escape");

    await expect(sentenceTrigger(page, "who")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await expect(sentenceSelect(page, "who")).toHaveValue("mum");
    await expect(sentenceTrigger(page, "who")).toBeFocused();
  });

  test("Tab closes with the value and moves focus on, out of the listbox", async ({
    page,
  }) => {
    await home(page);
    await enhanceSentence(page);
    await sentenceTrigger(page, "who").focus();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Tab");

    await expect(sentenceTrigger(page, "who")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await expect(sentenceSelect(page, "who")).toHaveValue("mum");
    expect(
      await page.evaluate(
        () =>
          document.activeElement?.closest("[role=listbox]") === null &&
          document.activeElement !== document.body,
      ),
    ).toBe(true);
    await expect(sentenceTrigger(page, "who")).not.toBeFocused();
  });
});

test.describe("AC-64 / T-70: the pointer", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "e2e-desktop", "a fine pointer");
  });

  test("a click toggles; a click on an option chooses it; hover never does; one open at a time", async ({
    page,
  }) => {
    await home(page);
    await enhanceSentence(page);
    const who = sentenceTrigger(page, "who");

    await who.click();
    await expect(who).toHaveAttribute("aria-expanded", "true");
    await who.click();
    await expect(who).toHaveAttribute("aria-expanded", "false");

    await who.click();
    await sentenceListbox(page, "who")
      .locator('[role="option"]')
      .nth(3)
      .hover();
    await expect(sentenceSelect(page, "who")).toHaveValue("mum");
    await expect(
      sentenceListbox(page, "who").locator('[aria-selected="true"]'),
    ).toHaveText(await selectedText(page, "who"));
    await expect(
      sentenceListbox(page, "who").locator('[aria-selected="true"]'),
    ).toHaveCount(1);

    await sentenceTrigger(page, "country").click();
    await expect(
      page.locator('[data-fo-sentence-trigger][aria-expanded="true"]'),
    ).toHaveCount(1);
    await expect(sentenceTrigger(page, "country")).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    await sentenceTrigger(page, "occasion").click();
    const sympathy = await sentenceSelect(page, "occasion")
      .locator("option")
      .evaluateAll((nodes) =>
        nodes.findIndex(
          (node) => (node as HTMLOptionElement).value === "sympathy",
        ),
      );
    await page.locator(`#send-occasion-listbox-${String(sympathy)}`).click();
    await expect(sentenceSelect(page, "occasion")).toHaveValue("sympathy");
    await expect(sentenceTrigger(page, "occasion")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await expect(sentenceTrigger(page, "occasion")).toBeFocused();
  });

  for (const [name, dismiss] of [
    [
      "a click on the page outside",
      async (page: Page) => {
        // The hero card's own padding at its top inline-end corner: no control, no link, and
        // clear of the panel, which opens over the card's inline-start half.
        const card = await page.locator("[data-fo-hero-card]").boundingBox();
        await page.mouse.click(
          (card?.x ?? 0) + (card?.width ?? 0) - 12,
          (card?.y ?? 0) + 16,
        );
      },
    ],
    [
      "a page scroll",
      async (page: Page) => {
        await page.evaluate(() => {
          window.scrollBy(0, 40);
        });
      },
    ],
    [
      "a viewport resize",
      async (page: Page) => {
        await page.setViewportSize({ width: 1200, height: 700 });
      },
    ],
  ] as const) {
    test(`${name} closes it, value unchanged, focus not sent to the trigger`, async ({
      page,
    }) => {
      await home(page);
      await enhanceSentence(page);
      await sentenceTrigger(page, "country").click();
      await expect(sentenceTrigger(page, "country")).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      await dismiss(page);

      await expect(sentenceTrigger(page, "country")).toHaveAttribute(
        "aria-expanded",
        "false",
      );
      await expect(sentenceSelect(page, "country")).toHaveValue("PL");
      await expect(sentenceTrigger(page, "country")).not.toBeFocused();
      await expect(sentenceListbox(page, "country")).toBeHidden();
    });
  }
});

test.describe("AC-65 / T-71: the value flow", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "e2e-desktop", "a fine pointer");
  });

  test("dad makes it his birthday with the occasion closed; Poland and Sympathy land on the native path's URL; nothing stored or sent", async ({
    page,
    context,
  }) => {
    await home(page);
    await enhanceSentence(page);
    const target = await nativeTarget(page, {
      country: "PL",
      occasion: "sympathy",
    });
    const stored = (): Promise<string> =>
      page.evaluate(() =>
        JSON.stringify({
          local: Object.keys(localStorage).sort(),
          session: Object.keys(sessionStorage).sort(),
          cookie: document.cookie.split("; ").sort(),
        }),
      );
    const before = await stored();
    const cookies = await context.cookies();
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));

    await chooseSentence(page, "who", "dad");
    await expect(
      page.locator('[data-fo-sentence-trigger][aria-expanded="true"]'),
    ).toHaveCount(0);
    await expect(sentenceTrigger(page, "occasion")).toHaveText(
      await selectedText(page, "occasion"),
    );
    await expect(sentenceTrigger(page, "occasion")).toHaveText("his birthday");
    await expect(sentenceSelect(page, "who")).not.toHaveAttribute("name");
    await chooseSentence(page, "country", "PL");
    await chooseSentence(page, "occasion", "sympathy");

    expect(requests).toEqual([]);
    expect(await stored()).toBe(before);
    expect(await context.cookies()).toEqual(cookies);

    const submitted = page.waitForRequest((request) =>
      request.url().includes("/api/send/"),
    );
    await page.locator('form#send button[type="submit"]').click();
    const query = new URL((await submitted).url()).searchParams;
    expect([...query.keys()]).toEqual(["country", "occasion"]);
    await page.waitForURL((url) => url.pathname === target);

    // Back: the restored select and its trigger agree (bfcache or a fresh load alike).
    await page.goBack();
    await enhanceSentence(page);
    await expect(sentenceTrigger(page, "occasion")).toHaveText(
      await selectedText(page, "occasion"),
    );
    await expect(sentenceTrigger(page, "country")).toHaveText(
      await selectedText(page, "country"),
    );
  });
});

/** The transitions on the panel as it opens, then as it closes, read in the page. */
async function panelTransitions(page: Page): Promise<{
  open: [string, number, string][];
  close: [string, number, string][];
  others: string[];
  transforms: string[];
}> {
  return page.evaluate(async () => {
    const read = (panel: HTMLElement): [string, number, string][] =>
      panel
        .getAnimations()
        .filter((animation) => animation instanceof CSSTransition)
        .map((animation) => {
          const timing = animation.effect?.getComputedTiming();
          return [
            (animation as CSSTransition).transitionProperty,
            Number(timing?.duration ?? -1),
            String(timing?.easing ?? ""),
          ];
        });
    const trigger = document.querySelector<HTMLButtonElement>(
      '[aria-controls="send-country-listbox"]',
    );
    const panel = document.getElementById("send-country-listbox");
    if (trigger === null || panel === null) throw new Error("no listbox");
    trigger.click();
    const open = read(panel);
    const transforms: string[] = [];
    const others: string[] = [];
    for (let frame = 0; frame < 15; frame += 1) {
      transforms.push(getComputedStyle(panel).transform);
      for (const animation of panel.getAnimations()) {
        const property =
          animation instanceof CSSTransition
            ? animation.transitionProperty
            : `animation:${animation.constructor.name}`;
        if (property !== "opacity" && property !== "transform")
          others.push(property);
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
    trigger.click();
    const close = read(panel);
    return { open, close, others, transforms };
  });
}

test.describe("AC-66 / T-72: motion 10, read from getAnimations()", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "e2e-desktop", "a fine pointer");
  });

  test("no-preference: open is opacity and transform, 200 ms, --ease-standard; close is opacity alone, 120 ms", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await home(page);
    await enhanceSentence(page);
    // The token as numbers: the shipped stylesheet is minified (`.2`), the timing serialised (`0.2`).
    const numbers = (curve: string): number[] =>
      (curve.match(/-?\d*\.?\d+/gu) ?? []).map(Number);
    const easing = numbers(
      await page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue("--ease-standard")
          .trim(),
      ),
    );
    expect(easing).toEqual([0.2, 0, 0.13, 1]);
    const motion = await panelTransitions(page);

    expect(motion.open.map(([property]) => property).sort()).toEqual([
      "opacity",
      "transform",
    ]);
    for (const [property, duration, curve] of motion.open) {
      expect(duration, property).toBe(200);
      expect(curve, property).toMatch(/^cubic-bezier\(/u);
      expect(numbers(curve), property).toEqual(easing);
    }
    expect(
      motion.close.map(([property, duration]) => [property, duration]),
    ).toEqual([["opacity", 120]]);
    expect(motion.others).toEqual([]);
  });

  test("reduce: open is one opacity fade of 120 ms and the panel never moves", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await home(page);
    await enhanceSentence(page);
    const motion = await panelTransitions(page);

    expect(
      motion.open.map(([property, duration]) => [property, duration]),
    ).toEqual([["opacity", 120]]);
    expect(new Set(motion.transforms)).toEqual(new Set(["none"]));
    expect(
      motion.close.map(([property, duration]) => [property, duration]),
    ).toEqual([["opacity", 120]]);
    expect(motion.others).toEqual([]);
  });
});

/** A token's resolved value for one property, read from a probe element in the page. */
async function token(
  page: Page,
  property: string,
  value: string,
): Promise<string> {
  return page.evaluate(
    ([name, css]) => {
      const probe = document.createElement("div");
      probe.style.setProperty(name, css);
      if (name === "border-radius") probe.style.borderStyle = "solid";
      document.body.append(probe);
      const resolved = getComputedStyle(probe).getPropertyValue(name);
      probe.remove();
      return resolved;
    },
    [property, value] as const,
  );
}

const SYSTEM_FAMILIES =
  /^(?:serif|sans-serif|monospace|system-ui|ui-[\w-]+|-apple-system|BlinkMacSystemFont|Arial|Helvetica|Times(?: New Roman)?|Georgia)$/iu;

test.describe("AC-67 / T-73: the panel, in the design system and never clipped", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "e2e-desktop", "a fine pointer");
  });

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
  ]) {
    test(`at ${String(viewport.width)} x ${String(viewport.height)}: tokens, top layer, 44 px rows, inside the viewport`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await home(page);
      await enhanceSentence(page);
      const trigger = sentenceTrigger(page, "country");
      await trigger.click();
      const panel = sentenceListbox(page, "country");
      await expect(panel).toBeVisible();
      // The open transition (200 ms) has run: geometry and colours are read at rest.
      await page.waitForTimeout(400);

      const style = await panel.evaluate((node) => {
        const computed = getComputedStyle(node);
        return {
          background: computed.backgroundColor,
          radius: computed.borderTopLeftRadius,
          shadow: computed.boxShadow,
          border: Number.parseFloat(computed.borderTopWidth),
        };
      });
      expect(style.background).toBe(
        await token(page, "background-color", "var(--color-surface-card)"),
      );
      expect(style.radius).toBe(
        await token(page, "border-radius", "var(--radius-letter)"),
      );
      expect(style.shadow).toBe(
        await token(page, "box-shadow", "var(--shadow-md)"),
      );
      expect(style.border).toBeGreaterThanOrEqual(1);

      const families = await page.evaluate(() => {
        const first = (element: Element | null): string =>
          (element === null ? "" : getComputedStyle(element).fontFamily)
            .split(",")[0]
            ?.trim()
            .replaceAll(/^["']|["']$/gu, "") ?? "";
        return {
          option: first(
            document.querySelector('#send-country-listbox [role="option"]'),
          ),
          sentence: first(document.querySelector("[data-fo-sentence] p")),
        };
      });
      expect(families.option).toBe(families.sentence);
      expect(families.option).not.toBe("");
      expect(families.option).not.toMatch(SYSTEM_FAMILIES);

      const geometry = await page.evaluate(() => {
        const list = document.getElementById("send-country-listbox");
        const button = document.querySelector(
          '[aria-controls="send-country-listbox"]',
        );
        if (list === null || button === null) throw new Error("no listbox");
        const box = list.getBoundingClientRect();
        const options = [...list.querySelectorAll('[role="option"]')];
        return {
          inside:
            box.top >= 0 &&
            box.left >= 0 &&
            box.bottom <= window.innerHeight &&
            box.right <= document.documentElement.clientWidth,
          hits: options.map((option) => {
            const rect = option.getBoundingClientRect();
            return (
              document.elementFromPoint(
                rect.left + rect.width / 2,
                rect.top + rect.height / 2,
              ) === option
            );
          }),
          heights: options.map(
            (option) => option.getBoundingClientRect().height,
          ),
          width: box.width,
          triggerWidth: button.getBoundingClientRect().width,
        };
      });
      expect(geometry.inside).toBe(true);
      expect(geometry.hits).toEqual(geometry.hits.map(() => true));
      expect(geometry.hits).toHaveLength(7);
      expect(Math.min(...geometry.heights)).toBeGreaterThanOrEqual(44);
      expect(geometry.width).toBeGreaterThanOrEqual(geometry.triggerWidth);
    });
  }

  test("opened downward past the hero card's bottom edge, every option still answers elementFromPoint (the top layer, not the card's overflow: hidden)", async ({
    page,
  }) => {
    // Upward, at these sizes, the panel fits inside the card, so it is the downward case that
    // shows a panel left in the card: there the card's `overflow: hidden` cuts every row below
    // its edge (6 of 7 rows, measured with the panel moved into the card).
    await page.setViewportSize({ width: 1280, height: 720 });
    await home(page);
    await enhanceSentence(page);
    await page.evaluate(() => {
      const box = document
        .getElementById("send-country")
        ?.getBoundingClientRect();
      window.scrollBy(0, (box?.top ?? 0) - 150);
    });
    await sentenceTrigger(page, "country").click();
    await page.waitForTimeout(400);

    const geometry = await page.evaluate(() => {
      const list = document.getElementById("send-country-listbox");
      const button = document.querySelector(
        '[aria-controls="send-country-listbox"]',
      );
      const card = document.querySelector("[data-fo-hero-card]");
      if (list === null || button === null || card === null)
        throw new Error("no listbox or card");
      const box = list.getBoundingClientRect();
      return {
        below: box.top > button.getBoundingClientRect().bottom,
        pastCard: box.bottom > card.getBoundingClientRect().bottom,
        hits: [...list.querySelectorAll('[role="option"]')].map((option) => {
          const rect = option.getBoundingClientRect();
          return (
            document.elementFromPoint(
              rect.left + rect.width / 2,
              rect.top + rect.height / 2,
            ) === option
          );
        }),
      };
    });
    expect(geometry.below, "opened downward").toBe(true);
    expect(geometry.pastCard, "reaches past the card's bottom edge").toBe(true);
    expect(geometry.hits).toEqual([true, true, true, true, true, true, true]);
  });

  test("with the trigger 100 px above the viewport's bottom edge, the panel still lies inside it", async ({
    page,
  }) => {
    // Find a viewport height at which the page can scroll the trigger to 100 px from the bottom.
    let placed = false;
    for (const height of [640, 560, 480, 420]) {
      await page.setViewportSize({ width: 1280, height });
      await home(page);
      const bottom = await sentenceSelect(page, "country").evaluate(
        (node) => node.getBoundingClientRect().bottom + window.scrollY,
      );
      const scroll = bottom - (height - 100);
      if (scroll < 0) continue;
      await page.evaluate((y) => {
        window.scrollTo(0, y);
      }, scroll);
      placed = true;
      break;
    }
    expect(
      placed,
      "a viewport where the trigger sits 100 px from the bottom",
    ).toBe(true);
    await enhanceSentence(page);
    const trigger = sentenceTrigger(page, "country");
    const triggerBox = await trigger.boundingBox();
    const height = page.viewportSize()?.height ?? 0;
    expect(
      Math.round(height - (triggerBox?.y ?? 0) - (triggerBox?.height ?? 0)),
    ).toBe(100);
    await trigger.click();
    await page.waitForTimeout(400);
    const box = await sentenceListbox(page, "country").boundingBox();
    expect(box?.y ?? -1).toBeGreaterThanOrEqual(0);
    expect(
      (box?.y ?? 0) + (box?.height ?? Number.POSITIVE_INFINITY),
    ).toBeLessThanOrEqual(height);
  });
});

/** Holds, or aborts, every script that carries the sentence island's mark. */
async function interceptIsland(
  page: Page,
  mode: "hold" | "abort",
): Promise<() => void> {
  let release: () => void = () => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(SCRIPT, async (route: Route) => {
    const response = await route.fetch();
    const body = await response.text();
    if (!body.includes(ISLAND_MARK)) {
      await route.fulfill({ response, body });
      return;
    }
    if (mode === "abort") {
      await route.abort();
      return;
    }
    await released;
    await route.fulfill({ response, body });
  });
  return release;
}

test.describe("AC-69 / T-75: before, or without, the chunk the native select serves", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "e2e-desktop", "a fine pointer");
  });

  test("with the chunk blocked, the country select opens natively and selectOption works", async ({
    page,
  }) => {
    await interceptIsland(page, "abort");
    await home(page);
    await page.locator("form#send > h2").hover();
    await sentenceSelect(page, "country").click();
    await sentenceSelect(page, "country").selectOption("PL");

    await expect(sentenceSelect(page, "country")).toHaveValue("PL");
    await expect(sentenceSelect(page, "country")).toBeVisible();
    await expect(page.locator("[data-fo-sentence-trigger]")).toHaveCount(0);
  });

  test("a select focused when the chunk lands keeps its place until it blurs", async ({
    page,
  }) => {
    const release = await interceptIsland(page, "hold");
    await home(page);
    await sentenceSelect(page, "country").focus();
    release();
    await page.waitForFunction(
      (mark) => performance.getEntriesByName(mark).length > 0,
      ISLAND_MARK,
    );

    await expect(page.locator("[data-fo-sentence-trigger]")).toHaveCount(2);
    await expect(sentenceTrigger(page, "country")).toHaveCount(0);
    await expect(sentenceSelect(page, "country")).toBeVisible();
    await expect(sentenceSelect(page, "country")).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(page.locator("[data-fo-sentence-trigger]")).toHaveCount(3);
    await expect(sentenceTrigger(page, "country")).toHaveText("Poland");
  });
});

test.describe("AC-70 / T-76: no shift, the trigger exactly over the select", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "e2e-desktop", "a fine pointer");
  });

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
  ]) {
    test(`at ${String(viewport.width)} x ${String(viewport.height)}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await recordLayoutShifts(page);
      await home(page);
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      // The webfont swap is bounded by its own test in `home.spec.ts`; from here on, nothing.
      // The load's own shifts are summed for the page's CLS, then the record starts afresh.
      const atLoad = await page.evaluate(() => {
        const store = window as unknown as { __foShifts: { value: number }[] };
        const total = store.__foShifts.reduce(
          (sum, entry) => sum + entry.value,
          0,
        );
        store.__foShifts = [];
        return total;
      });
      const boxes = (selector: string): Promise<number[][]> =>
        page.evaluate(
          (css) =>
            [...document.querySelectorAll(css)].map((node) => {
              const rect = node.getBoundingClientRect();
              return [rect.x, rect.y, rect.width, rect.height];
            }),
          selector,
        );
      const selects = await boxes("form#send select");
      const continueTop = await page
        .locator('form#send button[type="submit"]')
        .evaluate((node) => node.getBoundingClientRect().top);

      await enhanceSentence(page);
      const triggers = await boxes("[data-fo-sentence-trigger]");
      const selectsAfter = await boxes("form#send select");
      expect(selectsAfter).toEqual(selects);
      for (const [index, box] of triggers.entries()) {
        for (const [axis, value] of box.entries()) {
          expect(
            Math.abs(value - (selects[index]?.[axis] ?? Number.NaN)),
            `trigger ${String(index)} axis ${String(axis)}`,
          ).toBeLessThanOrEqual(0.5);
        }
      }
      expect(
        await sentenceTrigger(page, "country")
          .locator("span")
          .evaluate((node) => node.scrollWidth <= node.clientWidth),
      ).toBe(true);

      await sentenceTrigger(page, "country").click();
      expect(
        await page
          .locator('form#send button[type="submit"]')
          .evaluate((node) => node.getBoundingClientRect().top),
      ).toBe(continueTop);
      await page.keyboard.press("Escape");

      // A different country: one more destination opened for the probe, as a data flip would.
      await sentenceSelect(page, "country").evaluate((node) => {
        const option = (node as HTMLSelectElement).querySelector(
          'option[value="DE"]',
        ) as HTMLOptionElement;
        option.disabled = false;
        option.text = option.text.replace(/\s*\([^)]*\)$/u, "");
      });
      await chooseSentence(page, "country", "DE");
      await chooseSentence(page, "occasion", "newBaby");
      for (const field of ["country", "occasion"] as const) {
        const [select] = await boxes(`#send-${field}`);
        const [trigger] = await boxes(
          `[data-fo-sentence-trigger][aria-controls="send-${field}-listbox"]`,
        );
        expect(
          Math.abs((trigger?.[2] ?? 0) - (select?.[2] ?? Number.NaN)),
          `${field} width`,
        ).toBeLessThanOrEqual(0.5);
      }

      expect(await shiftInside(page, SENTENCE_REGION)).toBe(0);
      const since = await page.evaluate(() =>
        (
          window as unknown as { __foShifts: { value: number }[] }
        ).__foShifts.map((entry) => entry.value),
      );
      expect(since, "no shift anywhere after the load").toEqual([]);
      expect(atLoad).toBeLessThan(0.05);
    });
  }

  test("the closed triggers draw the sentence as the selects did, within the visual threshold", async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await home(page);
    const sentence = page.locator("form#send p");
    const before = await sentence.screenshot({ animations: "disabled" });
    await enhanceSentence(page);
    await page.mouse.move(1, 1);
    const after = await sentence.screenshot({ animations: "disabled" });
    await testInfo.attach("selects", {
      body: before,
      contentType: "image/png",
    });
    await testInfo.attach("triggers", {
      body: after,
      contentType: "image/png",
    });

    const diff = await page.evaluate(
      async ([a, b]) => {
        const pixels = async (base64: string): Promise<ImageData> => {
          const image = new Image();
          image.src = `data:image/png;base64,${base64}`;
          await image.decode();
          const canvas = new OffscreenCanvas(image.width, image.height);
          const context = canvas.getContext("2d");
          if (context === null) throw new Error("no canvas");
          context.drawImage(image, 0, 0);
          return context.getImageData(0, 0, image.width, image.height);
        };
        const p = await pixels(a ?? "");
        const q = await pixels(b ?? "");
        if (p.width !== q.width || p.height !== q.height)
          return { size: false, differing: -1, total: p.width * p.height };
        let differing = 0;
        for (let index = 0; index < p.data.length; index += 4) {
          if (
            p.data[index] !== q.data[index] ||
            p.data[index + 1] !== q.data[index + 1] ||
            p.data[index + 2] !== q.data[index + 2]
          )
            differing += 1;
        }
        return { size: true, differing, total: p.width * p.height };
      },
      [before.toString("base64"), after.toString("base64")],
    );
    testInfo.annotations.push({
      type: "AC-70",
      description: `${String(diff.differing)} of ${String(diff.total)} pixels differ`,
    });
    expect(diff.size, "the same box").toBe(true);
    // The project's visual threshold (`maxDiffPixelRatio: 0.001`), the one AC-71 holds the
    // existing home baseline to.
    expect(diff.differing / diff.total).toBeLessThanOrEqual(0.001);
  });
});
