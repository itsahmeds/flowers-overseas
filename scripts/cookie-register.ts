/**
 * `pnpm cookies:check [--write]` — renders `docs/compliance/cookie-register.md`'s normative table
 * from `src/config/cookies.ts` (spec 004 §2, §5.1, AC-22; TASK-050).
 *
 * ## Why a generator and not two hand-kept tables
 *
 * Spec 003 shipped the prose register (`docs/compliance/cookie-register.md`); spec 004 ships the
 * machine register (`src/config/cookies.ts`) that the settings panel, the cookie-policy page and
 * AC-22's session check read. Two lists of the same facts drift, and the drift is a compliance
 * defect rather than a documentation nit: a visitor would be shown one lifetime and given
 * another. So the **machine register is the source of truth** and the prose file derives its
 * table from it, inside a marked block. The narrative around the block stays human — it carries
 * the reasoning a table cannot — and `tests/unit/cookies-config.test.ts` additionally asserts
 * that every registered name appears in that narrative, so a row cannot be added in code and
 * left undescribed.
 *
 * Exit 0 when the committed block matches; exit 1 with the diff'able instruction otherwise.
 * `--write` rewrites the block in place.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  COOKIE_REGISTRY,
  type CookieRegistryEntry,
} from "../src/config/cookies.ts";

export const GENERATED_BLOCK_START =
  "<!-- generated: cookie register from src/config/cookies.ts — `pnpm cookies:check --write` -->";
export const GENERATED_BLOCK_END = "<!-- /generated: cookie register -->";

const DAY = 24 * 60 * 60;
const HOUR = 60 * 60;

/** Seconds as the disclosure reads them: whole days where it divides, else hours or seconds. */
export function humanLifetime(entry: CookieRegistryEntry): string {
  if (entry.lifetime.kind === "session")
    return "session (cleared with the tab)";
  const asText = (seconds: number): string => {
    if (seconds % DAY === 0) return `${String(seconds / DAY)} days`;
    if (seconds % HOUR === 0) return `${String(seconds / HOUR)} hours`;
    return `${String(seconds)} s`;
  };
  const base = `${asText(entry.lifetime.seconds)} (${String(entry.lifetime.seconds)} s)`;
  return entry.lifetime.secondsOnReject === undefined
    ? base
    : `${base} on accept / ${asText(entry.lifetime.secondsOnReject)} (${String(entry.lifetime.secondsOnReject)} s) on reject`;
}

const HEADER = [
  "Key",
  "Kind",
  "Category",
  "Consent",
  "Party",
  "Written by",
  "Status",
  "Lifetime",
  "Purpose key",
  "Attributes",
  "Spec",
] as const;

function row(entry: CookieRegistryEntry): string {
  const cells = [
    `\`${entry.name}\``,
    entry.kind,
    entry.category,
    entry.consentRequired
      ? "**required**"
      : "not required (Art. 5(3) exemption)",
    entry.party,
    entry.writer,
    entry.status === "set" ? "set today" : "declared, not set",
    humanLifetime(entry),
    `\`${entry.purposeKey}\``,
    entry.scope === "" ? "—" : `\`${entry.scope}\``,
    entry.spec,
  ];
  return `| ${cells.join(" | ")} |`;
}

/** The whole block, markers included. The bytes the doc must carry verbatim. */
export function renderRegisterBlock(
  entries: readonly CookieRegistryEntry[] = COOKIE_REGISTRY,
): string {
  const lines = [
    GENERATED_BLOCK_START,
    "",
    `| ${HEADER.join(" | ")} |`,
    `|${HEADER.map(() => "---").join("|")}|`,
    ...entries.map(row),
    "",
    GENERATED_BLOCK_END,
  ];
  return lines.join("\n");
}

export const DOC_PATH = "docs/compliance/cookie-register.md";

export interface CheckResult {
  readonly ok: boolean;
  readonly message: string;
  readonly updated: string | undefined;
}

/** Compare (and optionally rewrite) the block in a document's text. */
export function checkDocument(doc: string): CheckResult {
  const start = doc.indexOf(GENERATED_BLOCK_START);
  const end = doc.indexOf(GENERATED_BLOCK_END);
  const expected = renderRegisterBlock();
  if (start === -1 || end === -1 || end < start) {
    return {
      ok: false,
      message: `${DOC_PATH} has no generated block: add the markers around the register table`,
      updated: undefined,
    };
  }
  const committed = doc.slice(start, end + GENERATED_BLOCK_END.length);
  if (committed === expected) {
    return {
      ok: true,
      message: `${DOC_PATH}: register block up to date`,
      updated: undefined,
    };
  }
  return {
    ok: false,
    message: `${DOC_PATH}: register block is stale — run \`pnpm cookies:check --write\``,
    updated:
      doc.slice(0, start) +
      expected +
      doc.slice(end + GENERATED_BLOCK_END.length),
  };
}

const isMain =
  typeof process.argv[1] === "string" &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const write = process.argv.includes("--write");
  const path = resolve(process.cwd(), DOC_PATH);
  const result = checkDocument(readFileSync(path, "utf8"));
  if (result.ok) {
    process.stdout.write(`${result.message}\n`);
  } else if (write && result.updated !== undefined) {
    writeFileSync(path, result.updated);
    process.stdout.write(`${DOC_PATH}: register block rewritten\n`);
  } else {
    process.stderr.write(`${result.message}\n`);
    process.exit(1);
  }
}
