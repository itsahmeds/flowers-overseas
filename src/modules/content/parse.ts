/**
 * The info-page content loader (spec 041 §2 "The content model", AC-3; TASK-182).
 *
 * Pure, synchronous, network-free and clock-free: a path and a string in, a parsed record or a
 * named failure out. All the I/O is `corpus-files.ts`'s (scripts) or the generated index's (the
 * render path), so every rule of `pnpm pages:check` and every test drives the parser from a
 * literal. The path carries the family, the locale and the page id; the frontmatter carries none
 * of them, so a copied file cannot claim to be a page it is not filed under.
 */
import { parse as parseYaml } from "yaml";
import type { z } from "zod";

import {
  INFO_PAGE_IDS,
  type InfoPageId,
  infoPage,
} from "../../config/info-pages.ts";

import { REGISTRY_TOKENS, legalBody, tokensIn } from "./legal-body.ts";
import {
  ExtendsEnSchema,
  InfoPageContentSchema,
  LegalDocumentSchema,
  type InfoPageContent,
  type LegalDocument,
} from "./schemas.ts";

/** One committed file: its path relative to `content/`, and its bytes as text. */
export interface InfoSourceFile {
  /** `pages/en/help.md` or `legal/en-gb/terms.md`, POSIX-separated. */
  readonly path: string;
  readonly source: string;
}

/** One parse failure: the file to open, the field to look at, and what is wrong with it. */
export interface InfoParseIssue {
  readonly file: string;
  readonly field: string;
  readonly message: string;
}

export interface InfoPathFacts {
  readonly family: "trust" | "legal";
  readonly locale: string;
  readonly pageId: InfoPageId;
}

/** A parsed file: its facts and either its own content or the parent it extends. */
export type ParsedInfoFile =
  | (InfoPathFacts & {
      readonly kind: "trust";
      readonly content: InfoPageContent;
      readonly body: string;
    })
  | (InfoPathFacts & {
      readonly kind: "legal";
      readonly content: LegalDocument;
      readonly body: string;
    })
  | (InfoPathFacts & { readonly kind: "extends"; readonly parent: "en" });

export type InfoParseResult =
  | { readonly ok: true; readonly file: ParsedInfoFile }
  | { readonly ok: false; readonly issues: readonly InfoParseIssue[] };

const FILE_NAME_PATTERN = new RegExp(
  `^(pages|legal)/([a-z]{2}(?:-[a-z]{2})?)/(${INFO_PAGE_IDS.join("|")})\\.md$`,
  "u",
);

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/u;

/** The repo-relative path of a content file. */
export function infoFilePath(relativePath: string): string {
  return `content/${relativePath}`;
}

/** Split `pages/en/help.md` into its three facts, or `undefined` for any other name. */
export function infoPathFacts(relativePath: string): InfoPathFacts | undefined {
  const match = FILE_NAME_PATTERN.exec(relativePath.replaceAll("\\", "/"));
  if (match === null) return undefined;
  const [, dir, locale, pageId] = match;
  if (dir === undefined || locale === undefined || pageId === undefined) {
    return undefined;
  }
  const id = pageId as InfoPageId;
  const family = dir === "pages" ? "trust" : "legal";
  // A trust page filed under `legal/` (or the reverse) is a misfiled page, not a page.
  if (infoPage(id).family !== family) return undefined;
  return { family, locale, pageId: id };
}

function zodIssues(file: string, error: z.ZodError): readonly InfoParseIssue[] {
  return error.issues.map((issue) => ({
    file,
    field: issue.path.length === 0 ? "-" : issue.path.join("."),
    message: issue.message,
  }));
}

/**
 * Parse one file. A legal document in `en-gb` for `terms`, `privacy` or `cancellation` may not
 * `extends: en`, because the UK regime differs (spec 041 §2, AC-3).
 */
export function parseInfoFile(
  relativePath: string,
  source: string,
): InfoParseResult {
  const file = infoFilePath(relativePath);
  const facts = infoPathFacts(relativePath);
  if (facts === undefined) {
    return {
      ok: false,
      issues: [
        {
          file,
          field: "-",
          message:
            "file name is not `pages/{locale}/{trust page id}.md` or `legal/{locale}/{legal page id}.md` (spec 041 §5.2)",
        },
      ],
    };
  }
  const match = FRONTMATTER_PATTERN.exec(source);
  if (match === null) {
    return {
      ok: false,
      issues: [
        {
          file,
          field: "-",
          message: "file has no `---` YAML frontmatter block at its top",
        },
      ],
    };
  }
  const [, yamlText = "", body = ""] = match;
  let frontmatter: unknown;
  try {
    frontmatter = parseYaml(yamlText) as unknown;
  } catch (error) {
    return {
      ok: false,
      issues: [
        {
          file,
          field: "-",
          message: `frontmatter is not valid YAML: ${error instanceof Error ? (error.message.split("\n")[0] ?? "") : String(error)}`,
        },
      ],
    };
  }

  if (
    typeof frontmatter === "object" &&
    frontmatter !== null &&
    "extends" in frontmatter
  ) {
    if (facts.locale === "en") {
      return {
        ok: false,
        issues: [
          {
            file,
            field: "extends",
            message: "an `en` file is the source and extends nothing",
          },
        ],
      };
    }
    if (
      facts.family === "legal" &&
      facts.locale === "en-gb" &&
      ["terms", "privacy", "cancellation"].includes(facts.pageId)
    ) {
      return {
        ok: false,
        issues: [
          {
            file,
            field: "extends",
            message: `the \`en-gb\` \`${facts.pageId}\` is its own file: the UK regime differs (spec 041 §2)`,
          },
        ],
      };
    }
    const parsed = ExtendsEnSchema.safeParse(frontmatter);
    if (!parsed.success)
      return { ok: false, issues: zodIssues(file, parsed.error) };
    return { ok: true, file: { ...facts, kind: "extends", parent: "en" } };
  }

  if (facts.family === "trust") {
    const parsed = InfoPageContentSchema.safeParse(frontmatter);
    if (!parsed.success)
      return { ok: false, issues: zodIssues(file, parsed.error) };
    const tokenIssues = trustTokenIssues(file, yamlText);
    if (tokenIssues.length > 0) return { ok: false, issues: tokenIssues };
    return {
      ok: true,
      file: { ...facts, kind: "trust", content: parsed.data, body },
    };
  }
  const parsed = LegalDocumentSchema.safeParse(frontmatter);
  if (!parsed.success)
    return { ok: false, issues: zodIssues(file, parsed.error) };
  const bodyIssues = legalBodyIssues(file, facts.pageId, parsed.data, body);
  if (bodyIssues.length > 0) return { ok: false, issues: bodyIssues };
  return {
    ok: true,
    file: { ...facts, kind: "legal", content: parsed.data, body },
  };
}

/**
 * The one data slot a trust page may carry is `{legalName}` (spec 041 §14 A-founder-2026-10-23
 * clause 3, About). `{representativeName}` is withdrawn: no person's name is printed on the site
 * (clause 4, AC-37), so a file that still carries it fails, naming the file.
 */
function trustTokenIssues(
  file: string,
  yamlText: string,
): readonly InfoParseIssue[] {
  return tokensIn(yamlText)
    .filter((token) => token !== "legalName")
    .map((token) => ({
      file,
      field: "-",
      message:
        token === "representativeName"
          ? "`{representativeName}` is withdrawn: no person's name appears on the site (spec 041 §14 A-founder-2026-10-23 clause 4)"
          : `\`{${token}}\` is not a data slot a trust page may carry (only \`{legalName}\`)`,
    }));
}

/** The body and its frontmatter agree (spec 041 §2, AC-3, AC-10, AC-11, AC-13, AC-29). */
function legalBodyIssues(
  file: string,
  pageId: InfoPageId,
  doc: LegalDocument,
  body: string,
): readonly InfoParseIssue[] {
  const parsed = legalBody(body, pageId);
  const issues: InfoParseIssue[] = parsed.issues.map((issue) => ({
    file,
    ...issue,
  }));
  const directives = new Set(
    parsed.sections.flatMap((section) =>
      section.blocks.flatMap((block) =>
        block.kind === "directive" ? [block.name] : [],
      ),
    ),
  );
  if (directives.has("register") && doc.labels?.register === undefined) {
    issues.push({
      file,
      field: "labels.register",
      message: "`[[register]]` needs the register's labels",
    });
  }
  if (directives.has("facts") && doc.labels?.facts === undefined) {
    issues.push({
      file,
      field: "labels.facts",
      message: "`[[facts]]` needs the imprint's field labels",
    });
  }
  const anchors = new Set(parsed.sections.map((section) => section.id));
  (doc.interim?.sections ?? []).forEach((id, index) => {
    if (!anchors.has(id)) {
      issues.push({
        file,
        field: `interim.sections.${String(index)}`,
        message: `\`${id}\` is not a section anchor of this document`,
      });
    }
  });
  // A document that exists before the company does may not print a registry fact (AC-11): its
  // slot would have nothing to say, and an empty slot is the one thing no page may show.
  if (!infoPage(pageId).requiresRegistration) {
    for (const token of tokensIn(body)) {
      if (REGISTRY_TOKENS.includes(token as (typeof REGISTRY_TOKENS)[number])) {
        issues.push({
          file,
          field: "body",
          message: `\`{${token}}\` needs the registered company, and \`${pageId}\` exists before it`,
        });
      }
    }
  }
  return issues;
}
