/**
 * T-68 / AC-62, AC-63 (spec 004 §14 A-founder-2026-10-21d clauses 5 and 6; TASK-326): the home
 * sentence listbox's pure model. Arrow, Home/End and no-wrap indices over the seven destinations
 * with the not-yet ones among them; the type-ahead with an injected clock and the page locale's
 * collator; `Enter` on a disabled option keeps the list open.
 *
 * Mutations watched red (`## Self-review` in the PR): the window at 5 s (the 501 ms case), a
 * wrapping `ArrowDown`, `Home` ignored, a disabled option made selectable, the cycle starting at
 * `current` instead of after it.
 */
import { describe, expect, it } from "vitest";

import {
  TYPEAHEAD_MS,
  activation,
  collatorCompare,
  moveIndex,
  openingIndex,
  typeahead,
} from "../../src/modules/ui/home/sentence-listbox-model.ts";

/** The seven destinations as `/en` renders them, Poland open (the order of `sentenceDestinations`). */
const EN = [
  "France (not yet)",
  "Germany (not yet)",
  "Italy (not yet)",
  "Netherlands (not yet)",
  "Poland",
  "Romania (not yet)",
  "Spain (not yet)",
];
const EN_DISABLED = EN.map((label) => label !== "Poland");
const PL = [
  "Francja (jeszcze nie)",
  "Hiszpania (jeszcze nie)",
  "Holandia (jeszcze nie)",
  "Niemcy (jeszcze nie)",
  "Polska",
  "Rumunia (jeszcze nie)",
  "Włochy (jeszcze nie)",
];

/** A clock the test moves by hand. */
function clock(): { now: () => number; advance: (ms: number) => void } {
  let at = 1_000;
  return {
    now: () => at,
    advance: (ms) => {
      at += ms;
    },
  };
}

describe("moveIndex: arrows move one, never wrap; Home and End go to the ends", () => {
  it("moves down and up by one, through not-yet destinations", () => {
    expect(moveIndex("ArrowDown", 4, 7)).toBe(5);
    expect(moveIndex("ArrowUp", 4, 7)).toBe(3);
    expect(moveIndex("ArrowDown", 0, 7)).toBe(1);
  });

  it("stays on the last option with ArrowDown and on the first with ArrowUp", () => {
    expect(moveIndex("ArrowDown", 6, 7)).toBe(6);
    expect(moveIndex("ArrowUp", 0, 7)).toBe(0);
  });

  it("goes to the first with Home and the last with End", () => {
    expect(moveIndex("Home", 4, 7)).toBe(0);
    expect(moveIndex("End", 4, 7)).toBe(6);
    expect(moveIndex("End", 2, 6)).toBe(5);
  });

  it("answers -1 for a key that is not a move", () => {
    for (const key of ["Enter", " ", "Escape", "Tab", "n", "PageDown"]) {
      expect(moveIndex(key, 4, 7), key).toBe(-1);
    }
  });
});

describe("openingIndex: an opening focuses the selected option", () => {
  it("is the selected one, Poland", () => {
    expect(openingIndex(EN_DISABLED, 4)).toBe(4);
  });

  it("is the first enabled one when nothing is selected", () => {
    expect(openingIndex(EN_DISABLED, -1)).toBe(4);
    expect(openingIndex([false, false], -1)).toBe(0);
  });
});

describe("activation: Enter or Space on an option", () => {
  it("chooses an enabled option and keeps the list open on a not-yet one", () => {
    expect(activation(false)).toBe("select");
    expect(activation(true)).toBe("stay");
    expect(activation(EN_DISABLED[3] ?? false)).toBe("stay");
  });
});

describe("typeahead: a 500 ms buffer, a case-insensitive prefix in the page's collator", () => {
  const en = new Intl.Collator("en", { sensitivity: "base" }).compare;
  const pl = new Intl.Collator("pl", { sensitivity: "base" }).compare;

  it("n gives Netherlands in en, from Poland", () => {
    const time = clock();
    const find = typeahead(en, time.now);
    expect(find("n", EN, 4)).toBe(3);
    expect(EN[3]).toBe("Netherlands (not yet)");
  });

  it("p then o within the window gives Poland, and keeps it while the prefix holds", () => {
    const time = clock();
    const find = typeahead(en, time.now);
    expect(find("p", EN, 3)).toBe(4);
    time.advance(200);
    expect(find("o", EN, 4)).toBe(4);
    time.advance(200);
    expect(find("L", EN, 4)).toBe(4);
  });

  it("po gives Polska in pl", () => {
    const time = clock();
    const find = typeahead(pl, time.now);
    expect(find("p", PL, 0)).toBe(4);
    time.advance(100);
    expect(find("o", PL, 4)).toBe(4);
    expect(PL[4]).toBe("Polska");
  });

  it("matches without case and accents (base sensitivity): W finds Włochy, w too", () => {
    const time = clock();
    const find = typeahead(pl, time.now);
    expect(find("w", PL, 0)).toBe(6);
    time.advance(TYPEAHEAD_MS + 1);
    expect(find("W", PL, 0)).toBe(6);
  });

  it("cycles through the matches when one letter repeats", () => {
    const labels = ["Rome", "Paris", "Riga", "Rotterdam"];
    const time = clock();
    const find = typeahead(en, time.now);
    expect(find("r", labels, 0)).toBe(2);
    time.advance(100);
    expect(find("r", labels, 2)).toBe(3);
    time.advance(100);
    expect(find("r", labels, 3)).toBe(0);
  });

  it("keeps the buffer at exactly 500 ms and clears it at 501 ms", () => {
    expect(TYPEAHEAD_MS).toBe(500);
    const time = clock();
    const find = typeahead(en, time.now);
    expect(find("p", EN, 0)).toBe(4);
    time.advance(500);
    // "po" still: the buffer held.
    expect(find("o", EN, 4)).toBe(4);
    time.advance(501);
    // A fresh "n", not "pon" (which matches nothing).
    expect(find("n", EN, 4)).toBe(3);
  });

  it("answers -1 when nothing starts with the buffer", () => {
    const time = clock();
    const find = typeahead(en, time.now);
    expect(find("z", EN, 4)).toBe(-1);
    time.advance(10);
    expect(find("q", EN, 4)).toBe(-1);
  });
});

describe("collatorCompare: the page locale's Intl.Collator at base sensitivity", () => {
  const pairs = [
    ["Po", "po"],
    ["Ł", "l"],
    ["Ł", "ł"],
    ["Wł", "wl"],
    ["É", "e"],
    ["N", "n"],
    ["Ni", "Ne"],
    ["ß", "ss"],
  ] as const;

  it.each(["en", "pl", "de"])(
    "gives the same answer as new Intl.Collator(%s, { sensitivity: 'base' }).compare",
    (locale) => {
      const collator = new Intl.Collator(locale, { sensitivity: "base" });
      const compare = collatorCompare(locale);
      for (const [a, b] of pairs) {
        expect(Math.sign(compare(a, b)), `${a} ${b}`).toBe(
          Math.sign(collator.compare(a, b)),
        );
      }
      expect(compare("Polska".slice(0, 2), "po")).toBe(0);
    },
  );

  it("drives the type-ahead: po finds Polska with the pl comparison", () => {
    const time = clock();
    const find = typeahead(collatorCompare("pl"), time.now);
    expect(find("p", PL, 0)).toBe(4);
    expect(find("o", PL, 4)).toBe(4);
  });
});
