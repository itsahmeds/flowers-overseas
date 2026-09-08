/**
 * `fo/no-adhoc-intl` (spec 003 §2 "Lint, checks, CI", §7, §8 "Price display", AC-21; `plan/03`
 * §7; TASK-037).
 *
 * Spec 003 §4: "there is exactly one way to render a price, a date, a list or an address block,
 * and `pnpm lint` fails the moment I invent a second one". `src/modules/i18n/format.ts` and
 * `src/modules/i18n/collate.ts` are that one way; this rule is what makes the sentence a fact
 * about the import graph rather than a convention. It also closes the two paths through which a
 * rounding error enters a *displayed* price (§8): `toFixed` (binary rounding, `.` decimal
 * separator regardless of locale) and string concatenation of an amount with a currency symbol
 * (wrong symbol position, wrong separator, wrong spacing in three of the four launch locales).
 *
 * Flagged everywhere the rule runs, except in the two files of `FORMATTER_MODULE_FILES`:
 *
 *  1. **`Intl.<X>` in any value position** — `new Intl.NumberFormat(…)`,
 *     `Intl.DateTimeFormat(…)` (callable without `new`), and the aliasing form
 *     `const NF = Intl.NumberFormat`. The report site is the `Intl.<X>` member access itself, so
 *     all three forms cost exactly one error and no construction can be laundered through a
 *     local binding.
 *  2. **`.toLocaleString(…)` / `.toLocaleDateString(…)` / `.toLocaleTimeString(…)`** — they
 *     format with the *ambient* locale and, for dates, the *server's* time zone, which in a relay
 *     is never the zone the answer belongs to (`plan/03` §10).
 *  3. **`.toFixed(…)`** on any receiver.
 *  4. **A currency symbol or `%` adjacent to an interpolation** — `` `${x} zł` ``, `` `€${x}` ``,
 *     `` `${x}%` `` — and the same in a `+` concatenation with a string literal (`"€" + x`,
 *     `x + "%"`).
 *
 * **Deny-by-default on `Intl`, with three non-formatting members allowed anywhere:**
 * `Intl.Locale`, `Intl.supportedValuesOf` and `Intl.getCanonicalLocales`. The spec's wording is
 * "`new Intl.*` / `Intl.NumberFormat(…)` / `Intl.DateTimeFormat(…)` / `Intl.*Format(…)`", i.e.
 * the *formatters*; the three allowed members format nothing — they validate and enumerate
 * identifiers, which is exactly what `src/config/locales.ts` does in a zod refinement
 * (`new Intl.Locale(tag).baseName === tag`) and what `format.ts` does to validate an IANA zone.
 * Banning them would push locale-tag validation into the formatter module, where it does not
 * belong, or into a hand-written regex, which is worse. Everything else on `Intl` — including
 * members that do not exist yet — is denied, so a future `Intl.SomethingFormat` is covered on the
 * day it ships rather than the day someone remembers to extend a list.
 *
 * **Known limits, stated rather than discovered.** The rule is purely syntactic and has no type
 * information: it cannot tell a money `toFixed` from a physics one and flags both (intended — a
 * number a buyer reads goes through `formatNumber`), and it cannot follow
 * `const { NumberFormat } = Intl` or `globalThis.Intl["NumberFormat"]`. Those are covered by the
 * destructuring/computed-access checks below only in their direct forms; a determined author can
 * still evade a syntactic rule, which is why the module boundary (`plan/01` §5) and code review
 * back it up. A percent template is flagged even when the `%` is a CSS width (`` `${w}%` ``);
 * the answer there is a CSS custom property or `calc()`, never a disable comment
 * (`CLAUDE.md`: no disabling lint rules).
 */

/**
 * The two files that own every locale-sensitive string, matched by **path suffix** so the same
 * rule instance covers the real tree and the mirrored fixture tree
 * (`tests/fixtures/lint/src/modules/i18n/format.ts`, which is how AC-21's "identical code in a
 * fixture path simulating `src/modules/i18n/format.ts`" is executable).
 */
export const FORMATTER_MODULE_FILES = [
  "src/modules/i18n/format.ts",
  "src/modules/i18n/collate.ts",
];

/** `Intl` members that identify or enumerate locales instead of formatting a value. */
export const ALLOWED_INTL_MEMBERS = new Set([
  "Locale",
  "supportedValuesOf",
  "getCanonicalLocales",
]);

/**
 * Currency symbols and affixes of the currencies `src/config/currencies.ts` carries (EUR, GBP,
 * PLN, CHF, SEK/NOK/DKK, CZK, HUF, RON) plus `$` and `%`. The config stores no symbol — the
 * symbol is ICU's business, which is the whole point of the rule — so the list lives here, next
 * to the check that uses it.
 */
export const CURRENCY_SYMBOLS = [
  "€",
  "£",
  "zł",
  "Ft",
  "kr",
  "Kč",
  "lei",
  "CHF",
  "$",
];

/** `%` is not a currency but is the same mistake: `plan/03` §7 spaces it per locale (`19 %`). */
export const PERCENT_SIGN = "%";

/** Every affix the template/concatenation checks look for. */
const AFFIXES = [...CURRENCY_SYMBOLS, PERCENT_SIGN];

/** Affixes made of letters need a whole-token match, or ` lei` would flag ` left`. */
const hasLetters = (affix) => /\p{Letter}/u.test(affix);

/** `toLocale*` methods that format with the ambient locale (and zone). */
export const TO_LOCALE_METHODS = new Set([
  "toLocaleString",
  "toLocaleDateString",
  "toLocaleTimeString",
]);

/** Which formatter each `toLocale*` method should have been. */
const TO_LOCALE_REPLACEMENT = {
  toLocaleString: "formatNumber",
  toLocaleDateString: "formatDate",
  toLocaleTimeString: "formatTimeInZone",
};

/**
 * @param {string} filename
 * @returns {string} posix-normalised path
 */
function posix(filename) {
  return filename.split("\\").join("/");
}

/**
 * True for the two files allowed to construct an `Intl.*` object and to assemble a formatted
 * value by hand.
 * @param {string} filename
 * @returns {boolean}
 */
export function isFormatterModule(filename) {
  const path = posix(filename);
  return FORMATTER_MODULE_FILES.some((allowed) => path.endsWith(allowed));
}

/**
 * The whitespace-delimited token that ends `text`, ignoring trailing whitespace (incl. NBSP).
 * @param {string} text
 * @returns {string}
 */
function trailingToken(text) {
  const trimmed = text.replace(/[\s\u00a0]+$/u, "");
  const boundary = trimmed.search(/[\s\u00a0][^\s\u00a0]*$/u);
  return boundary === -1 ? trimmed : trimmed.slice(boundary + 1);
}

/**
 * The whitespace-delimited token that starts `text`.
 * @param {string} text
 * @returns {string}
 */
function leadingToken(text) {
  const trimmed = text.replace(/^[\s\u00a0]+/u, "");
  const boundary = trimmed.search(/[\s\u00a0]/u);
  return boundary === -1 ? trimmed : trimmed.slice(0, boundary);
}

/**
 * The affix a token carries, or `null`. A letter affix (`zł`, `kr`, `CHF`) must be the whole
 * token; a symbol affix (`€`, `%`, `$`) may sit at the given edge of it (`10€`, `%`).
 * @param {string} token
 * @param {"start" | "end"} edge which end of the token abuts the interpolation
 * @returns {string | null}
 */
function affixOf(token, edge) {
  if (token === "") return null;
  for (const affix of AFFIXES) {
    if (token === affix) return affix;
    if (hasLetters(affix)) continue;
    if (edge === "start" && token.startsWith(affix)) return affix;
    if (edge === "end" && token.endsWith(affix)) return affix;
  }
  return null;
}

/** The formatter that replaces a hand-built affix string. */
const affixReplacement = (affix) =>
  affix === PERCENT_SIGN ? "formatPercentFromBasisPoints" : "formatMoney";

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "disallow ad-hoc Intl formatters, toLocale* methods, toFixed and hand-built currency/percent strings outside src/modules/i18n/format.ts and collate.ts",
    },
    schema: [],
    messages: {
      intlFormatter:
        "`Intl.{{ member }}` outside the formatter module. There is exactly one way to render a locale-sensitive value (spec 003 §4): use `{{ replacement }}` from `src/modules/i18n` — or add the case there.",
      toLocaleMethod:
        "`{{ method }}` formats with the ambient locale and the server's time zone. Use `{{ replacement }}` from `src/modules/i18n` (spec 003 §2, plan/03 §7, §10).",
      toFixed:
        "`toFixed` rounds in binary floating point and always emits a `.` decimal separator. Use `formatMoney` (integer minor units) or `formatNumber` from `src/modules/i18n` (spec 003 §8, plan/12 §2).",
      currencyTemplate:
        "Hand-built `{{ affix }}` string. Symbol position, separator and spacing are locale decisions: use `{{ replacement }}` from `src/modules/i18n` (spec 003 §8, plan/03 §7).",
      currencyConcat:
        "Hand-built `{{ affix }}` string by concatenation. Symbol position, separator and spacing are locale decisions: use `{{ replacement }}` from `src/modules/i18n` (spec 003 §8, plan/03 §7).",
    },
  },
  create(context) {
    if (isFormatterModule(context.filename)) return {};

    /** Nodes already reported, so `new Intl.X(…)` costs one error, not three. */
    const reported = new WeakSet();

    /**
     * @param {any} node
     * @param {string} messageId
     * @param {Record<string, string>} data
     */
    function report(node, messageId, data) {
      if (reported.has(node)) return;
      reported.add(node);
      context.report({ node, messageId, data });
    }

    /**
     * The formatter named in an `Intl.<member>` message.
     * @param {string} member
     * @returns {string}
     */
    function replacementFor(member) {
      if (member === "NumberFormat") return "formatMoney / formatNumber";
      if (member === "DateTimeFormat") return "formatDate / formatTimeInZone";
      if (member === "RelativeTimeFormat") return "formatRelativeTime";
      if (member === "ListFormat") return "formatList";
      if (member === "Collator") return "collator";
      return "the formatters of src/modules/i18n";
    }

    /**
     * `Intl.<member>` in a value position. Type positions are `TSQualifiedName` nodes, never
     * `MemberExpression`, so `let f: Intl.NumberFormat` is untouched by construction.
     * @param {any} node
     */
    function checkIntlMember(node) {
      if (node.object.type !== "Identifier" || node.object.name !== "Intl") {
        return;
      }
      let member = null;
      if (!node.computed && node.property.type === "Identifier") {
        member = node.property.name;
      } else if (
        node.computed &&
        node.property.type === "Literal" &&
        typeof node.property.value === "string"
      ) {
        member = node.property.value;
      }
      if (member === null || ALLOWED_INTL_MEMBERS.has(member)) return;
      report(node, "intlFormatter", {
        member,
        replacement: replacementFor(member),
      });
    }

    /**
     * A template literal with at least one interpolation whose neighbouring text carries a
     * currency symbol or `%`. One report per template: a second affix in the same string is the
     * same mistake.
     * @param {any} node
     */
    function checkTemplate(node) {
      for (const [index] of node.expressions.entries()) {
        const before = node.quasis[index]?.value?.cooked ?? "";
        const after = node.quasis[index + 1]?.value?.cooked ?? "";
        const affix =
          affixOf(trailingToken(before), "end") ??
          affixOf(leadingToken(after), "start");
        if (affix === null) continue;
        report(node, "currencyTemplate", {
          affix,
          replacement: affixReplacement(affix),
        });
        return;
      }
    }

    /**
     * `"€" + amount` / `amount + " zł"`: a string literal carrying an affix, concatenated with
     * something that is not a literal (two literals are a catalogue problem, not this rule's).
     * @param {any} node
     */
    function checkConcatenation(node) {
      if (node.operator !== "+") return;
      const isStringLiteral = (side) =>
        side.type === "Literal" && typeof side.value === "string";
      const left = node.left;
      const right = node.right;
      if (isStringLiteral(left) === isStringLiteral(right)) return;
      const affix = isStringLiteral(left)
        ? affixOf(trailingToken(left.value), "end")
        : affixOf(leadingToken(right.value), "start");
      if (affix === null) return;
      report(node, "currencyConcat", {
        affix,
        replacement: affixReplacement(affix),
      });
    }

    return {
      MemberExpression(/** @type {any} */ node) {
        checkIntlMember(node);
      },
      CallExpression(/** @type {any} */ node) {
        const callee = node.callee;
        if (callee.type !== "MemberExpression" || callee.computed) return;
        if (callee.property.type !== "Identifier") return;
        const method = callee.property.name;
        if (TO_LOCALE_METHODS.has(method)) {
          report(node, "toLocaleMethod", {
            method,
            replacement: TO_LOCALE_REPLACEMENT[method],
          });
          return;
        }
        if (method === "toFixed") report(node, "toFixed", {});
      },
      TemplateLiteral(/** @type {any} */ node) {
        checkTemplate(node);
      },
      BinaryExpression(/** @type {any} */ node) {
        checkConcatenation(node);
      },
      // `const { NumberFormat } = Intl` — the one indirect form worth covering, because it is
      // the idiom a bundle-size-minded author reaches for.
      VariableDeclarator(/** @type {any} */ node) {
        if (node.init?.type !== "Identifier" || node.init.name !== "Intl") {
          return;
        }
        if (node.id?.type !== "ObjectPattern") return;
        for (const property of node.id.properties) {
          if (property.type !== "Property" || property.computed) continue;
          if (property.key.type !== "Identifier") continue;
          const member = property.key.name;
          if (ALLOWED_INTL_MEMBERS.has(member)) continue;
          report(property, "intlFormatter", {
            member,
            replacement: replacementFor(member),
          });
        }
      },
    };
  },
};

export default rule;
