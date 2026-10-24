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
import { crc32, deflateRawSync, gzipSync } from "node:zlib";

import { afterEach, describe, expect, it } from "vitest";

import {
  ArchiveBudgetError,
  basicAuthorization,
  bytesHold,
  credentialForms,
  MAX_DEPTH,
  inflateWithin,
  MAX_INFLATED_BYTES,
  main,
  newBudget,
  textViews,
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
  it("redacts text files, and fails loudly on a zip it cannot rewrite, deleting nothing", () => {
    const root = tree({
      "lhr-1.json": `{"Authorization":"Basic ${BASE64}"}`,
      "report.html": `"Basic ${BASE64.replaceAll("/", "\\/")}"`,
      "keep.json": "{}",
    });
    zipOf(root, "trace.zip", "trace.network", `Basic ${BASE64}`);
    const result = run(["--scrub", root]);
    expect(result.status).toBe(1);
    expect(result.output).toContain(
      "trace.zip holds the staging wall's credential",
    );
    expect(readFileSync(join(root, "lhr-1.json"), "utf8")).toBe(
      '{"Authorization":"Basic REDACTED"}',
    );
    expect(readFileSync(join(root, "report.html"), "utf8")).toBe(
      '"Basic REDACTED"',
    );
    expect(existsSync(join(root, "trace.zip"))).toBe(true);
    expect(readFileSync(join(root, "keep.json"), "utf8")).toBe("{}");
  });

  it("fails loudly on an HTML report whose embedded zip holds it, and keeps the file", () => {
    const root = tree({});
    const zip = zipOf(root, "tmp/r.zip", "r.json", `Basic ${BASE64}`);
    const blob = readFileSync(zip).toString("base64");
    rmSync(join(root, "tmp"), { recursive: true });
    writeFileSync(
      join(root, "index.html"),
      `"data:application/zip;base64,${blob}"`,
    );
    const result = run(["--scrub", root]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("index.html holds");
    expect(existsSync(join(root, "index.html"))).toBe(true);
  });
});

/** A zip of the given entries, stored (0) or deflated (8), written the way the format says. */
function makeZip(
  entries: readonly {
    name: string;
    data: Buffer;
    method?: 0 | 8;
    flags?: number;
  }[],
): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const method = entry.method ?? 8;
    const body = method === 8 ? deflateRawSync(entry.data) : entry.data;
    const name = Buffer.from(entry.name);
    const crc = crc32(entry.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(entry.flags ?? 0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(entry.flags ?? 0, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, body);
    centrals.push(central, name);
    offset += 30 + name.length + body.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

describe("archives, nested and named anything (/break 263 round 2 hole 1)", () => {
  const secret = Buffer.from(`authorization: Basic ${BASE64}\n`.repeat(20));
  const flagged = (
    files: Record<string, Buffer | string>,
    raw = CREDENTIAL,
  ) => {
    const root = tree({});
    for (const [name, body] of Object.entries(files)) {
      mkdirSync(join(root, name, ".."), { recursive: true });
      writeFileSync(join(root, name), body);
    }
    return run([root], { STAGING_BASIC_AUTH: raw });
  };

  it("opens a deflated zip inside a deflated zip, under a name that is not .zip", () => {
    const inner = makeZip([{ name: "trace.network", data: secret }]);
    const outer = makeZip([{ name: "data.bin", data: inner, method: 8 }]);
    expect(outer.includes(BASE64)).toBe(false);
    expect(flagged({ "report/resources/blob": outer }).status).toBe(1);
  });

  it("opens a stored zip inside a zip inside a zip", () => {
    const one = makeZip([{ name: "a", data: secret, method: 0 }]);
    const two = makeZip([{ name: "b", data: one, method: 0 }]);
    const three = makeZip([{ name: "c", data: two }]);
    expect(flagged({ "x.dat": three }).status).toBe(1);
  });

  it("opens a .gz file, and gzip inside a zip", () => {
    expect(flagged({ "trace.gz": gzipSync(secret) }).status).toBe(1);
    expect(
      flagged({ "t.zip": makeZip([{ name: "n.gz", data: gzipSync(secret) }]) })
        .status,
    ).toBe(1);
  });

  it("opens a zip that `zip` streamed with a data descriptor", () => {
    const root = tree({});
    const zip = join(root, "streamed.zip");
    execFileSync(
      "bash",
      ["-c", `printf '%s' "$BODY" | zip -q - - > "${zip}"`],
      {
        env: {
          PATH: process.env["PATH"] ?? "",
          NODE_ENV: "test",
          BODY: secret.toString(),
        },
      },
    );
    expect(run([root]).status).toBe(1);
  });

  it("opens a zip carried as base64 inside a JSON report", () => {
    const zip = makeZip([{ name: "r.json", data: secret }]);
    expect(
      flagged({ "r.json": `{"attachment":"${zip.toString("base64")}"}` })
        .status,
    ).toBe(1);
  });

  it("checks the names of zip entries", () => {
    const zip = makeZip([
      {
        name: `call-${encodeURIComponent(CREDENTIAL)}.txt`,
        data: Buffer.from("x"),
      },
    ]);
    expect(flagged({ "t.zip": zip }).status).toBe(1);
  });

  it.each([
    [
      "an encrypted entry",
      makeZip([{ name: "a", data: Buffer.from("x"), flags: 1 }]),
    ],
    [
      "a corrupt deflate stream",
      (() => {
        const zip = makeZip([
          { name: "a", data: Buffer.from("x".repeat(200)) },
        ]);
        zip.fill(0xff, 30 + 1, 30 + 6);
        return zip;
      })(),
    ],
    [
      "a zip with no central directory",
      Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(40)]),
    ],
    [
      "a corrupt gzip stream",
      Buffer.concat([Buffer.from([0x1f, 0x8b, 0x08]), Buffer.alloc(30, 7)]),
    ],
    [
      "gzip nested past the depth cap",
      (() => {
        let blob = Buffer.from("clean");
        for (let i = 0; i <= MAX_DEPTH + 1; i += 1) blob = gzipSync(blob);
        return blob;
      })(),
    ],
  ])("fails closed on %s, which it cannot read", (_, body) => {
    const result = flagged({ "x.bin": body });
    expect(result.status).toBe(1);
    expect(result.output).toContain("unreadable archive");
  });

  it("passes a clean nested archive inside the depth cap", () => {
    const zip = makeZip([
      {
        name: "a.gz",
        data: gzipSync(makeZip([{ name: "b", data: Buffer.from("clean") }])),
      },
    ]);
    expect(flagged({ "x.zip": zip }).status).toBe(0);
  });
});

describe("file and directory names (/break 263 round 2 hole 2)", () => {
  it.each([
    [
      "a file named with the URL-encoded credential",
      `test-results/${encodeURIComponent(CREDENTIAL)}.txt`,
    ],
    [
      "a directory named with the password",
      `test-results/${encodeURIComponent("aaaa?bbbb?cccc")}/a.txt`,
    ],
    ["a file named with the password", "test-results/aaaa?bbbb?cccc.png"],
  ])("flags %s", (_, name) => {
    const root = tree({ [name]: "clean" });
    const result = run([root]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("in its name");
  });

  it("--scrub fails loudly on a directory whose name holds it, and deletes nothing", () => {
    const root = tree({
      "r/aaaa?bbbb?cccc/a.txt": "clean",
      "r/keep.txt": "clean",
    });
    const result = run(["--scrub", root]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("in its name");
    expect(existsSync(join(root, "r/aaaa?bbbb?cccc/a.txt"))).toBe(true);
    expect(existsSync(join(root, "r/keep.txt"))).toBe(true);
  });

  it("does not flag the uploaded directory's own location above it", () => {
    const parent = tree({});
    const root = join(parent, "aaaa?bbbb?cccc-workspace", "playwright-report");
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, "a.txt"), "clean");
    expect(run([root]).status).toBe(0);
  });
});

describe("every encoding the credential can travel in (/break 263 round 2 hole 3)", () => {
  // A low-entropy credential whose base64 has both `+` and `/`.
  const PLUS = "ci-wall:>a??bbbb~cccc";
  const PLUS64 = Buffer.from(PLUS).toString("base64");
  const holds = (body: string, raw: string) => {
    const root = tree({ "report.txt": body });
    return run([root], { STAGING_BASIC_AUTH: raw }).status;
  };

  it("has the test credential it needs", () => {
    expect(PLUS64).toContain("+");
    expect(PLUS64).toContain("/");
  });

  it.each([
    ["`/` escaped", PLUS64.replaceAll("/", "\\/")],
    ["`+` escaped", PLUS64.replaceAll("+", "\\+")],
    ["both escaped", PLUS64.replaceAll("/", "\\/").replaceAll("+", "\\+")],
    ["URL-safe", PLUS64.replaceAll("+", "-").replaceAll("/", "_")],
    ["wrapped every 8 characters", PLUS64.replace(/(.{8})/gu, "$1\n")],
    [
      "wrapped with CRLF and indentation",
      PLUS64.replace(/(.{8})/gu, "$1\r\n    "),
    ],
    ["wrapped with escaped newlines", PLUS64.replace(/(.{8})/gu, "$1\\n")],
    ["at string offset 1 of a run", `Q${PLUS64}`],
    ["at string offset 2 of a run", `QQ${PLUS64}`],
    ["at string offset 3 of a run", `QQQ${PLUS64}`],
  ])("finds its base64 %s", (_, encoded) => {
    expect(holds(`{"h":"Basic ${encoded}"}`, PLUS)).toBe(1);
  });

  it.each([0, 1, 2, 5])(
    "finds it inside a larger base64 blob at byte offset %i",
    (pad) => {
      const blob = Buffer.concat([
        Buffer.alloc(pad, 0x41),
        Buffer.from(PLUS),
        Buffer.from(" and more"),
      ]).toString("base64");
      expect(holds(`data=${blob}`, PLUS)).toBe(1);
    },
  );

  it.each([
    ["upper-case percent-encoding", encodeURIComponent(PLUS)],
    ["lower-case percent-encoding", encodeURIComponent(PLUS).toLowerCase()],
    [
      "percent-encoded twice-escaped JSON",
      JSON.stringify(JSON.stringify(PLUS)),
    ],
  ])("finds %s", (_, encoded) => {
    expect(holds(`x ${encoded} x`, PLUS)).toBe(1);
  });

  it("finds form encoding, a space written as `+`", () => {
    const spaced = "ci wall:aaaa bbbb cccc";
    const form = new URLSearchParams({ c: spaced }).toString();
    expect(form).toContain("+");
    expect(holds(form, spaced)).toBe(1);
  });

  it('finds JSON-escaped `"` and `\\` in the password', () => {
    const quoted = 'ci-wall:aa"aa\\bbbb?cccc';
    const escaped = JSON.stringify(quoted);
    expect(escaped).toContain('\\"');
    expect(escaped).toContain("\\\\");
    expect(holds(`{"c":${escaped}}`, quoted)).toBe(1);
  });

  it.each([
    ["`\\r` left on", `${CREDENTIAL}\r`],
    ["a space left on", `${CREDENTIAL} `],
    ["a leading space left on", ` ${CREDENTIAL}`],
  ])(
    "finds the base64 of a partly trimmed secret (%s) when the stored one has more",
    (_, partial) => {
      const encoded = Buffer.from(partial).toString("base64");
      expect(holds(`Basic ${encoded}`, `${CREDENTIAL}\r\n `)).toBe(1);
    },
  );
});

describe("--scrub replaces globally and longest first (/break 263 round 2 hole 4)", () => {
  it("redacts every occurrence and keeps the file", () => {
    const root = tree({ "a.json": `["Basic ${BASE64}","Basic ${BASE64}"]` });
    expect(run(["--scrub", root]).status).toBe(0);
    expect(readFileSync(join(root, "a.json"), "utf8")).toBe(
      '["Basic REDACTED","Basic REDACTED"]',
    );
  });

  it("turns user:password into exactly REDACTED, not user:REDACTED", () => {
    const root = tree({ "a.txt": `got ${CREDENTIAL} here` });
    expect(run(["--scrub", root]).status).toBe(0);
    expect(readFileSync(join(root, "a.txt"), "utf8")).toBe("got REDACTED here");
  });

  it("puts the longest form first, whatever order it is handed", () => {
    const forms = credentialForms(CREDENTIAL);
    expect(forms).toEqual([...forms].sort((a, b) => b.length - a.length));
  });
});

describe("round 3 (/break 263 round 3)", () => {
  const flaggedWith = (raw: string, files: Record<string, Buffer | string>) => {
    const root = tree({});
    for (const [name, body] of Object.entries(files)) {
      mkdirSync(join(root, name, ".."), { recursive: true });
      writeFileSync(join(root, name), body);
    }
    return run([root], { STAGING_BASIC_AUTH: raw });
  };

  describe("hole 1: any compression method but stored or deflate fails closed", () => {
    it.each([12, 14, 99])(
      "method %i, even on an entry with nothing in it",
      (method) => {
        const zip = makeZip([
          { name: "a.txt", data: Buffer.from("clean ".repeat(50)) },
        ]);
        // Patch the method in the local header (offset 8) and the central header (10).
        zip.writeUInt16LE(method, 8);
        const central = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
        zip.writeUInt16LE(method, central + 10);
        const result = flaggedWith(CREDENTIAL, { "trace.zip": zip });
        expect(result.status).toBe(1);
        expect(result.output).toContain(
          "cannot be checked (unreadable archive)",
        );
      },
    );
  });

  describe("hole 2: a short password and a non-ASCII credential, through every decoder", () => {
    const SHORT = "ci-wall:Ab7?xYz"; // a 7-character password: only the whole credential is searched
    const NON_ASCII = "wänd-üser>>?:pä~ß7";
    const b64 = (raw: string) => Buffer.from(raw, "utf8").toString("base64");
    const uEscape = (text: string) =>
      text.replace(
        /[^\x20-\x7e]|[/+]/gu,
        (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
      );

    it.each([SHORT, NON_ASCII])(
      "has only the whole credential to search for: %s",
      (raw) => {
        expect(credentialForms(raw).length).toBeGreaterThan(0);
      },
    );

    it.each([
      ["plain base64", (raw: string) => `Basic ${b64(raw)}`],
      [
        "base64 with `/` and `+` as \\u escapes",
        (raw: string) => `{"h":"Basic ${uEscape(b64(raw))}"}`,
      ],
      [
        "the raw credential with \\u escapes",
        (raw: string) => `{"c":"${uEscape(raw)}"}`,
      ],
      [
        "base64 wrapped every 8",
        (raw: string) => b64(raw).replace(/(.{8})/gu, "$1\n"),
      ],
      ["base64 at string offset 2", (raw: string) => `QQ${b64(raw)}`],
      [
        "base64 inside a larger blob",
        (raw: string) =>
          Buffer.concat([
            Buffer.from("A"),
            Buffer.from(raw, "utf8"),
            Buffer.from("tail tail"),
          ]).toString("base64"),
      ],
    ])("finds %s for both", (_, encode) => {
      for (const raw of [SHORT, NON_ASCII]) {
        expect(flaggedWith(raw, { "r.json": encode(raw) }).status, raw).toBe(1);
      }
    });

    it("finds both inside gzip, and in a directory name", () => {
      for (const raw of [SHORT, NON_ASCII]) {
        expect(
          flaggedWith(raw, {
            "t.gz": gzipSync(Buffer.from(`Basic ${b64(raw)}`)),
          }).status,
        ).toBe(1);
        expect(
          flaggedWith(raw, { [`d/${encodeURIComponent(raw)}/a.txt`]: "clean" })
            .status,
        ).toBe(1);
      }
    });
  });

  describe("hole 3: clean reports are never flagged, and nothing is ever deleted", () => {
    /** Deterministic bytes, so the fixture is the same on every run. */
    const noise = (seed: number, length: number): Buffer => {
      const out = Buffer.alloc(length);
      let x = seed >>> 0 || 1;
      for (let i = 0; i < length; i += 1) {
        x ^= x << 13;
        x ^= x >>> 17;
        x ^= x << 5;
        out[i] = x & 0xff;
      }
      return out;
    };
    /** A Lighthouse-shaped report: ten JPEG thumbnails and a final screenshot as data URLs. */
    const report = (seed: number): string =>
      JSON.stringify({
        lighthouseVersion: "12.6.0",
        requestedUrl: `https://pr-263.flowersoverseas.com/en?run=${String(seed)}`,
        configSettings: { extraHeaders: { Authorization: "Basic REDACTED" } },
        audits: {
          "screenshot-thumbnails": {
            details: {
              items: Array.from({ length: 10 }, (_, i) => ({
                timing: i * 300,
                data: `data:image/jpeg;base64,${Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), noise(seed * 100 + i, 12_000)]).toString("base64")}`,
              })),
            },
          },
          "final-screenshot": {
            details: {
              data: `data:image/jpeg;base64,${noise(seed * 7919, 40_000).toString("base64")}`,
            },
          },
        },
      });

    it("passes 30 credential-free Lighthouse-shaped reports, untouched, under --scrub", () => {
      const files = Object.fromEntries(
        Array.from({ length: 30 }, (_, i) => [
          `.lighthouseci/lhr-${String(i)}.json`,
          report(i + 1),
        ]),
      );
      const root = tree(files);
      const result = run(["--scrub", root]);
      expect(result.output).not.toContain("::error::");
      expect(result.status).toBe(0);
      for (const [name, body] of Object.entries(files)) {
        expect(readFileSync(join(root, name), "utf8")).toBe(body);
      }
    });

    it("decodes no base64 from the form-`+` view, which splits every image into short runs", () => {
      const views = textViews("abc+def%2Bghi");
      expect(
        views.find((view) => view.text === "abc def+ghi")?.decodeBase64,
      ).toBe(false);
      expect(
        views.find((view) => view.text === "abc+def+ghi")?.decodeBase64,
      ).toBe(true);
    });

    it("treats a base64 run that only decodes to a gzip-looking header as not an archive", () => {
      // A run whose decoding begins 1f 8b 08 and is not a gzip stream: a guess, not a file.
      const fake = Buffer.concat([
        Buffer.from([0x1f, 0x8b, 0x08]),
        noise(3, 60),
      ]).toString("base64");
      const result = flaggedWith(CREDENTIAL, {
        "lhr.json": `{"data":"${fake}"}`,
      });
      expect(result.status).toBe(0);
    });

    it("does not read a file starting 1f 8b with another method byte as gzip", () => {
      const result = flaggedWith(CREDENTIAL, {
        "shot.bin": Buffer.concat([
          Buffer.from([0x1f, 0x8b, 0x00]),
          noise(4, 200),
        ]),
      });
      expect(result.status).toBe(0);
    });

    it("never deletes: a file it cannot scrub stays, and the job fails naming it", () => {
      const zip = makeZip([
        { name: "t", data: Buffer.from(`Basic ${BASE64}`) },
      ]);
      const root = tree({});
      writeFileSync(join(root, "trace.zip"), zip);
      const result = run(["--scrub", root]);
      expect(result.status).toBe(1);
      expect(readFileSync(join(root, "trace.zip")).equals(zip)).toBe(true);
      expect(result.output).not.toContain("deleted");
    });
  });

  it("hole 4: scrubs the lower-case percent-encoded credential to exactly REDACTED", () => {
    const lower = encodeURIComponent(CREDENTIAL).replace(
      /%[0-9A-F]{2}/gu,
      (hex) => hex.toLowerCase(),
    );
    expect(lower).not.toBe(encodeURIComponent(CREDENTIAL));
    const root = tree({ "u.txt": `url=${lower}&x=1` });
    expect(run(["--scrub", root]).status).toBe(0);
    expect(readFileSync(join(root, "u.txt"), "utf8")).toBe("url=REDACTED&x=1");
  });

  describe("hole 5: decompression bombs fail closed inside a budget", () => {
    const wanted = [CREDENTIAL];
    const kilobyte = Buffer.alloc(1024, 0x20);

    it("stops inflating zip entries past the byte budget", () => {
      const zip = makeZip(
        Array.from({ length: 5 }, (_, i) => ({
          name: `e${String(i)}`,
          data: kilobyte,
        })),
      );
      expect(() => bytesHold(zip, wanted, 0, newBudget(3000))).toThrow(
        ArchiveBudgetError,
      );
      expect(bytesHold(zip, wanted, 0, newBudget(6000))).toBe(false);
    });

    it("stops a gzip stream past the byte budget", () => {
      expect(() =>
        bytesHold(gzipSync(Buffer.alloc(10_000)), wanted, 0, newBudget(5000)),
      ).toThrow(ArchiveBudgetError);
    });

    it("stops past the entry budget", () => {
      const zip = makeZip(
        Array.from({ length: 3 }, (_, i) => ({
          name: `e${String(i)}`,
          data: kilobyte,
        })),
      );
      expect(() => bytesHold(zip, wanted, 0, newBudget(1e9, 2))).toThrow(
        ArchiveBudgetError,
      );
    });

    it("never lets zlib allocate past what is left: it is told the remaining budget", () => {
      const budget = newBudget(4096);
      const asked: number[] = [];
      inflateWithin(
        budget,
        (options) => {
          asked.push(options.maxOutputLength);
          return Buffer.alloc(1000);
        },
        "x",
      );
      inflateWithin(
        budget,
        (options) => {
          asked.push(options.maxOutputLength);
          return Buffer.alloc(10);
        },
        "y",
      );
      expect(asked).toEqual([4096, 3096]);
      expect(budget.bytes).toBe(3086);
    });

    it("refuses a bomb carried as base64 inside a report, rather than calling it no archive", () => {
      const megabyte = Buffer.alloc(1024 * 1024);
      const zip = makeZip(
        Array.from(
          { length: Math.ceil(MAX_INFLATED_BYTES / megabyte.length) + 5 },
          (_, i) => ({
            name: `e${String(i)}`,
            data: megabyte,
          }),
        ),
      );
      const result = flaggedWith(CREDENTIAL, {
        "lhr.json": `{"attachment":"data:application/zip;base64,${zip.toString("base64")}"}`,
      });
      expect(result.status).toBe(1);
      expect(result.output).toContain("cannot be checked (decompression bomb)");
    });

    it("refuses a real bomb with the default budget, named as one", () => {
      const megabyte = Buffer.alloc(1024 * 1024);
      const zip = makeZip(
        Array.from(
          { length: Math.ceil(MAX_INFLATED_BYTES / megabyte.length) + 5 },
          (_, i) => ({
            name: `e${String(i)}`,
            data: megabyte,
          }),
        ),
      );
      expect(zip.length).toBeLessThan(2 * 1024 * 1024);
      const result = flaggedWith(CREDENTIAL, { "bomb.zip": zip });
      expect(result.status).toBe(1);
      expect(result.output).toContain("cannot be checked (decompression bomb)");
    });
  });
});
