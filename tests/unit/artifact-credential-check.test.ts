/**
 * `scripts/artifact-credential-check.ts` (spec 040 AC-25, AC-26; TASK-099, `/review 263` item 1,
 * `/break 263` holes 3 and 9): no artifact CI uploads may carry the staging wall's credential, in
 * any form, inside a trace zip or an HTML report's embedded zip included.
 *
 * Every case writes real files: a Playwright-shaped trace zip (made with `zip`), a JSON report, an
 * HTML report with the credential escaped, and an HTML report with a zip embedded as a data URL.
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  basicAuthorization,
  credentialForms,
  main,
} from "../../scripts/artifact-credential-check.ts";

// Low-entropy stand-in (the secret scan must not read it as a key). Its Basic form has a `/`.
const CREDENTIAL = "ci-wall:aaaa?bbbb?cccc";
const BASE64 = Buffer.from(CREDENTIAL).toString("base64");

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "fo-artifact-"));
  roots.push(root);
  for (const [name, body] of Object.entries(files)) {
    const path = join(root, name);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, body);
  }
  return root;
}

/** A zip of one entry, as `zip` writes a Playwright trace. */
function zipOf(
  root: string,
  name: string,
  entry: string,
  body: string,
): string {
  const staging = mkdtempSync(join(tmpdir(), "fo-artifact-entry-"));
  roots.push(staging);
  writeFileSync(join(staging, entry), body);
  const zip = join(root, name);
  mkdirSync(join(zip, ".."), { recursive: true });
  execFileSync("zip", ["-q", "-j", zip, join(staging, entry)]);
  return zip;
}

const run = (
  argv: string[],
  env: Record<string, string | undefined> = { STAGING_BASIC_AUTH: CREDENTIAL },
) => {
  const lines: string[] = [];
  const status = main(argv, env, {
    write: (chunk: string) => lines.push(chunk),
  });
  return { status, output: lines.join("") };
};

describe("the forms it looks for", () => {
  it("covers user:password, the password, the Basic base64, its JSON-escaped and URL-encoded forms", () => {
    expect(BASE64).toContain("/");
    const forms = credentialForms(CREDENTIAL);
    for (const form of [
      CREDENTIAL,
      "aaaa?bbbb?cccc",
      BASE64,
      BASE64.replaceAll("/", "\\/"),
      encodeURIComponent(CREDENTIAL),
      encodeURIComponent("aaaa?bbbb?cccc"),
    ]) {
      expect(forms, form).toContain(form);
    }
  });

  it.each([
    ["a trailing newline", "\n"],
    ["a trailing space", " "],
    ["a leading space", " "],
    ["a trailing CRLF", "\r\n"],
  ])(
    "covers the secret with %s both as stored and trimmed (/review 263 round 2)",
    (label, ws) => {
      const raw = label.includes("leading") ? ws + CREDENTIAL : CREDENTIAL + ws;
      const forms = credentialForms(raw);
      expect(forms).toContain(Buffer.from(raw).toString("base64"));
      expect(forms).toContain(BASE64);
      expect(forms).toContain(raw);
      expect(forms).toContain(CREDENTIAL);
    },
  );

  it("does not search a short password alone, which could match by chance", () => {
    expect(credentialForms("u:short")).not.toContain("short");
  });

  it("has nothing to look for when the secret is not in scope", () => {
    expect(credentialForms(undefined)).toEqual([]);
    expect(credentialForms("  ")).toEqual([]);
  });
});

describe("the check fails on every place the credential can sit", () => {
  it.each([
    [
      "a JSON report with the Basic header",
      "lhr-1.json",
      `{"Authorization":"Basic ${BASE64}"}`,
    ],
    [
      "an HTML report with `/` escaped",
      "report.html",
      `{"a":"Basic ${BASE64.replaceAll("/", "\\/")}"}`,
    ],
    [
      "an error context with the raw credential",
      "test-results/x/error-context.md",
      `GET https://${CREDENTIAL}@pr-1`,
    ],
    [
      "a call log with the password",
      "test-results/x/stdout.txt",
      "password aaaa?bbbb?cccc",
    ],
  ])("%s", (_, name, body) => {
    const root = tree({ [name]: body, "clean.txt": "nothing here" });
    const result = run([root]);
    expect(result.status).toBe(1);
    expect(result.output).toContain(name.split("/").pop());
    expect(result.output).not.toContain(BASE64);
    expect(result.output).not.toContain(CREDENTIAL);
  });

  it("inside a trace zip, where a byte search sees only deflated data", () => {
    const root = tree({});
    const header = `authorization: Basic ${BASE64}\n`.repeat(50);
    zipOf(root, "test-results/x/trace.zip", "trace.network", header);
    expect(
      readFileSync(join(root, "test-results/x/trace.zip")).includes(BASE64),
    ).toBe(false);
    expect(run([root]).status).toBe(1);
  });

  it("inside a zip embedded in an HTML report as a data URL", () => {
    const root = tree({});
    const zip = zipOf(
      root,
      "tmp/report.zip",
      "report.json",
      `Basic ${BASE64}\n`.repeat(50),
    );
    const blob = readFileSync(zip).toString("base64");
    rmSync(join(root, "tmp"), { recursive: true });
    writeFileSync(
      join(root, "index.html"),
      `<script>window.playwrightReportBase64 = "data:application/zip;base64,${blob}";</script>`,
    );
    expect(run([root]).status).toBe(1);
  });

  it("passes a tree that holds none of it, and a path that does not exist", () => {
    const root = tree({ "a.json": "{}", "b.html": "<p>ok</p>" });
    expect(run([root, join(root, "missing")]).status).toBe(0);
  });

  it("passes when the secret is not in scope (a push run, a fork)", () => {
    const root = tree({ "a.json": `Basic ${BASE64}` });
    const result = run([root], {});
    expect(result.status).toBe(0);
    expect(result.output).toContain("not in scope");
  });

  it("exits 2 with no path", () => {
    expect(run([]).status).toBe(2);
  });
});

describe("a secret pasted with whitespace (/review 263 round 2)", () => {
  it.each([
    ["a trailing newline", "\n"],
    ["a trailing space", " "],
  ])(
    "with %s, finds and scrubs the base64 of the stored and of the trimmed value",
    (_, tail) => {
      const raw = CREDENTIAL + tail;
      const untrimmed = Buffer.from(raw).toString("base64");
      const root = tree({
        "lhr-1.json": `{"Authorization":"Basic ${untrimmed}"}`,
        "lhr-2.json": `{"Authorization":"Basic ${BASE64}"}`,
      });
      expect(run([root], { STAGING_BASIC_AUTH: raw }).status).toBe(1);
      expect(run(["--scrub", root], { STAGING_BASIC_AUTH: raw }).status).toBe(
        0,
      );
      for (const name of ["lhr-1.json", "lhr-2.json"]) {
        expect(readFileSync(join(root, name), "utf8")).toBe(
          '{"Authorization":"Basic REDACTED"}',
        );
      }
    },
  );

  it("--basic prints the header of the trimmed secret, the one the job sends", () => {
    expect(basicAuthorization(`${CREDENTIAL}\n`)).toBe(`Basic ${BASE64}`);
    const result = run(["--basic"], {
      STAGING_BASIC_AUTH: ` ${CREDENTIAL} \n`,
    });
    expect(result.status).toBe(0);
    expect(result.output).toBe(`Basic ${BASE64}\n`);
  });

  it("--basic exits 2 on a secret that is only whitespace", () => {
    expect(run(["--basic"], { STAGING_BASIC_AUTH: " \n" }).status).toBe(2);
  });
});

describe("--scrub, then the check", () => {
  it("redacts text files, deletes zips that hold it, and then passes", () => {
    const root = tree({
      "lhr-1.json": `{"Authorization":"Basic ${BASE64}"}`,
      "report.html": `"Basic ${BASE64.replaceAll("/", "\\/")}"`,
      "keep.json": "{}",
    });
    zipOf(root, "trace.zip", "trace.network", `Basic ${BASE64}`);
    const result = run(["--scrub", root]);
    expect(result.status).toBe(0);
    expect(readFileSync(join(root, "lhr-1.json"), "utf8")).toBe(
      '{"Authorization":"Basic REDACTED"}',
    );
    expect(readFileSync(join(root, "report.html"), "utf8")).toBe(
      '"Basic REDACTED"',
    );
    expect(existsSync(join(root, "trace.zip"))).toBe(false);
    expect(readFileSync(join(root, "keep.json"), "utf8")).toBe("{}");
  });

  it("deletes an HTML report whose embedded zip holds it", () => {
    const root = tree({});
    const zip = zipOf(root, "tmp/r.zip", "r.json", `Basic ${BASE64}`);
    const blob = readFileSync(zip).toString("base64");
    rmSync(join(root, "tmp"), { recursive: true });
    writeFileSync(
      join(root, "index.html"),
      `"data:application/zip;base64,${blob}"`,
    );
    expect(run(["--scrub", root]).status).toBe(0);
    expect(existsSync(join(root, "index.html"))).toBe(false);
  });
});
