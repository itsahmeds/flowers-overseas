/**
 * T-20 / AC-20 (TASK-038): ICU plurals through the **real** catalogues.
 *
 * Polish is the acid test and the reason this test exists: it has four plural categories, and
 * code that pairs a naive `count === 1 ? singular : plural` with a translated string gets
 * `2 kwiaciarnie` and `5 kwiaciarni` wrong in a way no English or German test can see
 * (spec 003 §7, `plan/03` §5). 22 and 25 are here because Polish `few`/`many` depend on the
 * *last two* digits, and 1.5 because a fractional count falls into `other` rather than `one`.
 *
 * The translator is next-intl's `createTranslator` over `loadMessages()`, i.e. exactly the
 * pipeline a page uses — no fixture catalogue. If `messages/pl.json`'s plural forms are replaced
 * by an echo of the English string, this test fails, which is what keeps the one piece of real
 * Polish copy in the repo honest.
 */
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import { loadMessages } from "../../src/modules/i18n";
import { MESSAGE_NAMESPACES } from "../../src/modules/i18n/messages.ts";

/** The same call the layout makes: the merged catalogue for the locale, all shell namespaces. */
const translatorFor = (locale: string): ((count: number) => string) => {
  const t = createTranslator({
    locale,
    messages: loadMessages(locale, MESSAGE_NAMESPACES),
  });
  return (count) => t("common.floristCount", { count });
};

describe("ICU plurals through the real catalogue (AC-20)", () => {
  it("resolves the four Polish categories, including the last-two-digit rule", () => {
    const t = translatorFor("pl");

    expect(t(1)).toBe("1 kwiaciarnia");
    expect(t(2)).toBe("2 kwiaciarnie");
    expect(t(5)).toBe("5 kwiaciarni");
    expect(t(22)).toBe("22 kwiaciarnie");
    expect(t(25)).toBe("25 kwiaciarni");
    // `other` for a fractional count, with the Polish decimal comma from `Intl` (§7).
    expect(t(1.5)).toBe("1,5 kwiaciarni");
  });

  it("resolves `one`/`other` for en and en-gb", () => {
    const en = translatorFor("en");
    expect(en(1)).toBe("1 florist");
    expect(en(2)).toBe("2 florists");

    // The thin `en-gb` override does not touch this key, so it resolves through the fallback
    // chain rather than being absent (§13 Q5).
    const gb = translatorFor("en-gb");
    expect(gb(1)).toBe("1 florist");
    expect(gb(2)).toBe("2 florists");
  });

  it("resolves the German forms the draft did not echo", () => {
    const de = translatorFor("de");

    expect(de(1)).toBe("1 Florist");
    expect(de(2)).toBe("2 Floristen");
  });
});
