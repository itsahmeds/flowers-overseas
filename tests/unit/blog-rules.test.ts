/**
 * T-05 (unit half) and T-06 (spec 044 §2.3, AC-5, AC-6; TASK-321): the blog's hard and soft rules.
 *
 *  - T-05: one fixture per hard rule, each refused with exactly its rule id; each soft rule warns
 *    and does not refuse. The vanished-corridor case is the same fixture with the corridor
 *    reference no longer existing (the integration suite drives it through `publishPost`).
 *  - T-06: a claim sentence without, then with, an allow entry; a stale entry; relay, price,
 *    scale, freshness and voice each refused with an allow entry present; the four everyday-word
 *    fixtures of AC-6 against `blog/relay`, with the message showing the pattern id, the matched
 *    word and the sentence.
 *
 * Every refusal asserts the one rule id the fixture trips (not "some rule fired").
 */
import { describe, expect, it } from "vitest";

import { adminT } from "../../src/modules/admin/messages.ts";

/** The admin translator over a key computed from a rule id. */
const ruleMessage = (
  key: string,
  params: Record<string, string | number>,
): string => adminT(key as Parameters<typeof adminT>[0], params);
import {
  BLOG_HARD_RULES,
  BLOG_SOFT_RULES,
  type BlogRuleContext,
  type BlogRuleResult,
  blogRuleMessageKey,
  validateBlogRevision,
} from "../../src/modules/content/blog/rules/index.ts";
import type { BlogRevisionFields } from "../../src/modules/content/blog/schemas.ts";
import {
  PROSE_RELAY_CONTEXT,
  proseRelayPatterns,
  relayMatches,
} from "../../src/config/honesty.ts";
import {
  BLOG_LINK_REFS,
  BLOG_LINKS_PARAGRAPH,
  blogBody,
  blogProse,
  blogRevisionFields,
} from "../fixtures/blog.ts";

const CONTEXT: BlogRuleContext = {
  existingRefs: new Set(BLOG_LINK_REFS),
  otherPosts: [],
  corridorGuides: [],
};

function run(
  overrides: Partial<BlogRevisionFields> = {},
  post: { slug?: string; countries?: readonly string[] } = {},
  context: Partial<BlogRuleContext> = {},
): readonly BlogRuleResult[] {
  return validateBlogRevision(
    {
      locale: "en",
      slug: post.slug ?? "send-flowers-to-poland",
      countries: post.countries ?? ["PL"],
      revision: blogRevisionFields(overrides),
    },
    { ...CONTEXT, ...context },
  );
}

const hardIds = (results: readonly BlogRuleResult[]): string[] => [
  ...new Set(results.filter((r) => r.severity === "hard").map((r) => r.id)),
];
const softIds = (results: readonly BlogRuleResult[]): string[] => [
  ...new Set(results.filter((r) => r.severity === "soft").map((r) => r.id)),
];

/** The valid body with one more paragraph. */
const withSentence = (sentence: string): string =>
  `${blogBody()}\n\n${sentence}`;

describe("T-05 — each hard rule refuses with its id (spec 044 AC-5)", () => {
  it("the base fixture passes every rule", () => {
    expect(run()).toEqual([]);
  });

  const cases: readonly {
    readonly rule: (typeof BLOG_HARD_RULES)[number];
    readonly results: () => readonly BlogRuleResult[];
  }[] = [
    {
      rule: "blog/slug-shape",
      results: () => run({}, { slug: "Send_Flowers" }),
    },
    { rule: "blog/slug-reserved", results: () => run({}, { slug: "feed" }) },
    {
      rule: "blog/length",
      results: () => run({ excerpt: "Too short to be an excerpt." }),
    },
    { rule: "blog/country-tag", results: () => run({}, { countries: [] }) },
    {
      rule: "blog/link-corridor",
      results: () =>
        run({}, {}, { existingRefs: new Set(["fo:occasion-hub/name_day"]) }),
    },
    {
      rule: "blog/link-occasion-or-category",
      results: () => run({}, {}, { existingRefs: new Set(["fo:corridor/PL"]) }),
    },
    {
      rule: "blog/anchor-generic",
      results: () =>
        run({
          bodyMd: withSentence("For the rest, [read more](fo:corridor/PL)."),
        }),
    },
    {
      rule: "blog/min-words",
      results: () =>
        run({
          bodyMd: `## Choosing flowers\n\n${blogProse(1, 200)}\n\n${BLOG_LINKS_PARAGRAPH}`,
        }),
    },
    {
      rule: "blog/distinct",
      results: () =>
        run(
          {},
          {},
          {
            otherPosts: [
              {
                postId: "11111111-1111-4111-8111-111111111111",
                bodyMd: blogBody(),
              },
            ],
          },
        ),
    },
    {
      rule: "blog/raw-contact",
      results: () =>
        run({
          bodyMd: withSentence("Write to hello@example.com with questions."),
        }),
    },
    {
      rule: "blog/price-literal",
      results: () =>
        run({ bodyMd: withSentence("A small bunch costs £25 in most towns.") }),
    },
    {
      rule: "blog/scale-claim",
      results: () =>
        run({
          bodyMd: withSentence(
            "Flowers reach 1,200 cities across the country.",
          ),
        }),
    },
    {
      rule: "blog/relay",
      results: () => run({ bodyMd: withSentence("Your order is on hold.") }),
    },
    {
      rule: "blog/voice",
      results: () =>
        run({ bodyMd: withSentence("Our network covers every town.") }),
    },
    {
      rule: "blog/freshness",
      results: () =>
        run({ bodyMd: withSentence("These roses stay fresh for 7 days.") }),
    },
    {
      rule: "blog/competitor",
      results: () =>
        run({
          bodyMd: withSentence(
            "Unlike Interflora, we write the card ourselves.",
          ),
        }),
    },
    {
      rule: "blog/claim",
      results: () =>
        run({ bodyMd: withSentence("Read the reviews before you choose.") }),
    },
    {
      rule: "blog/allow-stale",
      results: () =>
        run({
          honestyAllow: [
            {
              sentence: "No such sentence exists here.",
              rule: "review",
              reason: "test",
            },
          ],
        }),
    },
    {
      rule: "blog/h1-in-body",
      results: () => run({ bodyMd: `# A second title\n\n${blogBody()}` }),
    },
  ];

  it("has one fixture for every hard rule", () => {
    expect(cases.map((c) => c.rule).sort()).toEqual(
      [...BLOG_HARD_RULES].sort(),
    );
  });

  for (const { rule, results } of cases) {
    it(`${rule} refuses its fixture, and nothing else does`, () => {
      expect(hardIds(results())).toEqual([rule]);
    });
  }

  it("the vanished corridor: the same text, its corridor gone, is refused with blog/link-corridor", () => {
    expect(run()).toEqual([]);
    expect(
      hardIds(
        run({}, {}, { existingRefs: new Set(["fo:occasion-hub/name_day"]) }),
      ),
    ).toEqual(["blog/link-corridor"]);
  });

  it("the distinctness rule also reads each tagged country's corridor guide (advisor fix 3)", () => {
    const results = run(
      {},
      {},
      {
        corridorGuides: [{ iso2: "PL", text: blogProse(1, 540) }],
      },
    );
    expect(hardIds(results)).toEqual(["blog/distinct"]);
    expect(
      results.find((r) => r.id === "blog/distinct")?.params["against"],
    ).toBe("corridor:PL");
  });

  it("a raw URL, a bare domain and a phone number are raw contact too", () => {
    for (const sentence of [
      "See https://example.org/page for more.",
      "See example.pl for more.",
      "Call +48 22 123 45 67 for more.",
    ]) {
      expect(
        hardIds(run({ bodyMd: withSentence(sentence) })),
        sentence,
      ).toEqual(["blog/raw-contact"]);
    }
  });
});

describe("T-05 — soft rules warn and save (spec 044 AC-5)", () => {
  const cases: readonly {
    readonly rule: (typeof BLOG_SOFT_RULES)[number];
    readonly results: () => readonly BlogRuleResult[];
  }[] = [
    {
      rule: "blog/title-long",
      results: () =>
        run({
          title:
            "How to send flowers to Poland from the UK for a name day or a birthday",
        }),
    },
    {
      rule: "blog/body-long",
      results: () => run({ bodyMd: blogBody(3, 3100) }),
    },
    {
      rule: "blog/no-heading",
      results: () =>
        run({ bodyMd: `${blogProse(4, 850)}\n\n${BLOG_LINKS_PARAGRAPH}` }),
    },
    {
      rule: "blog/unknown-construct",
      results: () =>
        run({ bodyMd: withSentence("> A quoted line is not formatted.") }),
    },
  ];

  it("has one fixture for every soft rule", () => {
    expect(cases.map((c) => c.rule).sort()).toEqual(
      [...BLOG_SOFT_RULES].sort(),
    );
  });

  for (const { rule, results } of cases) {
    it(`${rule} warns, and refuses nothing`, () => {
      const found = results();
      expect(softIds(found)).toEqual([rule]);
      expect(hardIds(found)).toEqual([]);
    });
  }
});

describe("T-06 — the honesty gate and its allow list (spec 044 AC-6)", () => {
  const CLAIM = "Read the reviews before you choose.";

  it("a claim sentence saves only when that exact sentence is in the allow list with a reason", () => {
    expect(hardIds(run({ bodyMd: withSentence(CLAIM) }))).toEqual([
      "blog/claim",
    ]);
    expect(
      run({
        bodyMd: withSentence(CLAIM),
        honestyAllow: [
          {
            sentence: CLAIM,
            rule: "review",
            reason: "names a page, not a review",
          },
        ],
      }),
    ).toEqual([]);
    // Not the exact sentence: still refused, and the entry is stale.
    expect(
      hardIds(
        run({
          bodyMd: withSentence(CLAIM),
          honestyAllow: [
            { sentence: "Read the reviews.", rule: "review", reason: "x" },
          ],
        }),
      ),
    ).toEqual(["blog/claim", "blog/allow-stale"]);
  });

  it("an allow entry matching no sentence fails with blog/allow-stale", () => {
    expect(
      hardIds(
        run({
          honestyAllow: [{ sentence: CLAIM, rule: "review", reason: "x" }],
        }),
      ),
    ).toEqual(["blog/allow-stale"]);
  });

  const EVEN_WITH_ALLOW: readonly [string, string][] = [
    ["blog/relay", "Your order is on hold."],
    ["blog/price-literal", "A small bunch costs £25 in most towns."],
    ["blog/scale-claim", "Flowers reach 1,200 cities across the country."],
    ["blog/freshness", "These roses stay fresh for 7 days."],
    ["blog/voice", "Our network covers every town."],
  ];
  for (const [rule, sentence] of EVEN_WITH_ALLOW) {
    it(`${rule} fails even with its sentence in the allow list`, () => {
      const results = run({
        bodyMd: withSentence(sentence),
        honestyAllow: [
          { sentence, rule: "review", reason: "an attempt to exempt it" },
        ],
      });
      // The entry exempts no claim, so it is also stale; the rule itself is not exempted.
      expect(hardIds(results)).toEqual([rule, "blog/allow-stale"]);
    });
  }

  const relayOf = (sentence: string): readonly BlogRuleResult[] =>
    run({ bodyMd: withSentence(sentence) }).filter(
      (r) => r.id === "blog/relay",
    );

  it("the everyday words pass the relay rule in prose (advisor fix 1 (b))", () => {
    expect(relayOf("Flowers for your partner on her name day.")).toEqual([]);
    expect(
      run({ bodyMd: withSentence("Hold the stems under running water.") }),
    ).toEqual([]);
  });

  it("the same words with a florist or order word are refused with blog/relay, naming the word and sentence", () => {
    const partner = relayOf("Our partner florist makes it.");
    expect(partner.map((r) => r.params)).toEqual([
      {
        pattern: "partner",
        match: "partner",
        sentence: "Our partner florist makes it.",
      },
    ]);
    const hold = relayOf("Your order is on hold.");
    expect(hold.map((r) => r.params)).toEqual([
      { pattern: "hold", match: "on hold", sentence: "Your order is on hold." },
    ]);
    const message = ruleMessage(blogRuleMessageKey("blog/relay"), {
      ...partner[0]?.params,
    });
    expect(message).toContain("partner");
    expect(message).toContain('(partner, "partner")');
    expect(message).toContain("Our partner florist makes it.");
  });

  it("dropping the floristOrOrder context from PROSE_RELAY_CONTEXT turns the partner pass case red", () => {
    const sentence = "Flowers for your partner on her name day.";
    expect(relayMatches(sentence, "en", proseRelayPatterns())).toEqual([]);
    const withoutPartner = Object.fromEntries(
      Object.entries(PROSE_RELAY_CONTEXT).filter(([id]) => id !== "partner"),
    );
    expect(
      relayMatches(sentence, "en", proseRelayPatterns(withoutPartner)).map(
        (m) => m.id,
      ),
    ).toEqual(["partner"]);
  });

  it("every rule id has an admin message that formats", () => {
    for (const id of [...BLOG_HARD_RULES, ...BLOG_SOFT_RULES]) {
      const key = blogRuleMessageKey(id);
      const formatted = ruleMessage(key, {
        slug: "s",
        length: 1,
        min: 1,
        max: 2,
        anchor: "a",
        words: 3,
        against: "x",
        score: 0.5,
        match: "m",
        pattern: "p",
        sentence: "t",
        word: "w",
        detail: "d",
        check: "c",
        mark: "k",
        label: "l",
        line: 4,
        construct: "quote",
        kind: "email",
      });
      expect(formatted, key).not.toBe(key);
    }
  });
});
