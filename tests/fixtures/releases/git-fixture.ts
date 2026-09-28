/**
 * A throwaway remote for the `release:*` integration tests (spec 040 §14 A3, T-36, T-37, T-38;
 * TASK-156).
 *
 * Every case builds its own **temporary bare repository** (the "remote", standing in for
 * `origin`) and one working clone, in a private `mktemp -d`. The commands under test are the real
 * CLI, `node scripts/release.ts …`, run with the clone as its working directory, so every refusal
 * is observed where it matters: on the bare repository's refs. Nothing here ever talks to the
 * project's real remote.
 *
 * Git runs with no system or global configuration and a fixed identity, so a developer's
 * `~/.gitconfig` (hooks, signing, `push.default`) cannot change what the tests see.
 *
 * `serveHealth` stands in for production's `/api/health` (AC-31's `commit`), and
 * `renderFixture` turns a recorded-shape Railway response under `tests/fixtures/railway/` into
 * one that names this repository's commits: the templates carry `{{name}}` placeholders instead
 * of SHAs, because a commit's SHA depends on the moment the test made it.
 */
import { execFile } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { type AddressInfo } from "node:net";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

export const REPO_ROOT = resolve(__dirname, "../../..");
export const RELEASE_CLI = join(REPO_ROOT, "scripts/release.ts");
const FIXTURES = join(REPO_ROOT, "tests/fixtures");

export interface RunResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
  /** stdout and stderr together, for assertions that do not care which stream a line went to. */
  readonly output: string;
}

function run(
  file: string,
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<RunResult> {
  return new Promise((done) => {
    execFile(
      file,
      [...args],
      { cwd, env, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const code =
          error === null
            ? 0
            : typeof error.code === "number"
              ? error.code
              : 127;
        done({ code, stdout, stderr, output: `${stdout}\n${stderr}` });
      },
    );
  });
}

export interface ReleaseRepo {
  readonly root: string;
  readonly bare: string;
  readonly work: string;
  /** The environment every git and CLI child runs with (no user or system git configuration). */
  readonly env: NodeJS.ProcessEnv;
  /** Name → full SHA of every commit made through `commit`. */
  readonly sha: Record<string, string>;
  git(args: readonly string[], cwd?: string): Promise<string>;
  /** Commit on the working clone's current branch; `files` maps path → content. */
  commit(name: string, files?: Record<string, string>): Promise<string>;
  /** Set a ref on the remote directly: "someone else moved it". */
  setRemote(ref: string, sha: string): Promise<void>;
  /** The remote's value of `refs/heads/<branch>`, or `undefined` when it does not exist. */
  remote(branch: string): Promise<string | undefined>;
  /** Run `node scripts/release.ts <args>` in the working clone. */
  release(
    args: readonly string[],
    env?: Record<string, string>,
  ): Promise<RunResult>;
  cleanup(): void;
}

export async function makeReleaseRepo(): Promise<ReleaseRepo> {
  const root = mkdtempSync(join(tmpdir(), "fo-release-"));
  const bare = join(root, "remote.git");
  const work = join(root, "work");
  const emptyConfig = join(root, "gitconfig");
  writeFileSync(emptyConfig, "");
  const env: NodeJS.ProcessEnv = {
    PATH: process.env["PATH"] ?? "",
    HOME: root,
    TMPDIR: root,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: emptyConfig,
    GIT_AUTHOR_NAME: "release fixture",
    GIT_AUTHOR_EMAIL: "release@example.invalid",
    GIT_COMMITTER_NAME: "release fixture",
    GIT_COMMITTER_EMAIL: "release@example.invalid",
    GIT_TERMINAL_PROMPT: "0",
  };
  const sha: Record<string, string> = {};
  let counter = 0;

  const git = async (
    args: readonly string[],
    cwd: string = work,
  ): Promise<string> => {
    const result = await run("git", args, cwd, env);
    if (result.code !== 0) {
      throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
    }
    return result.stdout.trim();
  };

  await git(["init", "-q", "--bare", "-b", "main", bare], root);
  await git(["clone", "-q", bare, work], root);
  await git(["checkout", "-q", "-b", "main"]).catch(() => undefined);

  const repo: ReleaseRepo = {
    root,
    bare,
    work,
    env,
    sha,
    git,
    async commit(name, files = {}) {
      counter += 1;
      const content = { [`history/${name}.txt`]: `${name} ${String(counter)}\n`, ...files };
      for (const [path, text] of Object.entries(content)) {
        mkdirSync(dirname(join(work, path)), { recursive: true });
        writeFileSync(join(work, path), text);
      }
      await git(["add", "-A"]);
      await git(["commit", "-q", "--no-verify", "-m", `commit ${name}`]);
      const full = await git(["rev-parse", "HEAD"]);
      sha[name] = full;
      return full;
    },
    async setRemote(ref, value) {
      await git(["update-ref", `refs/heads/${ref}`, value], bare);
    },
    async remote(branch) {
      const result = await run(
        "git",
        ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`],
        bare,
        env,
      );
      return result.code === 0 ? result.stdout.trim() : undefined;
    },
    release(args, extra = {}) {
      return run(
        process.execPath,
        [RELEASE_CLI, ...args],
        work,
        { ...env, ...extra },
      );
    },
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
  return repo;
}

/**
 * `tests/fixtures/<relative>` with every `{{name}}` replaced by `sha[name]` (and `{{name:7}}` by
 * its first seven characters), written into the repository's scratch directory. Returns the path.
 */
export function renderFixture(
  repo: ReleaseRepo,
  relative: string,
): string {
  const text = readFileSync(join(FIXTURES, relative), "utf8").replace(
    /\{\{([A-Za-z0-9_-]+)(?::(\d+))?\}\}/g,
    (_match, name: string, length: string | undefined) => {
      const full = repo.sha[name];
      if (full === undefined) {
        throw new Error(`fixture ${relative} names unknown commit ${name}`);
      }
      return length === undefined ? full : full.slice(0, Number(length));
    },
  );
  const out = join(repo.root, relative.replaceAll("/", "__"));
  writeFileSync(out, text);
  return out;
}

/** The text of a release-note template under `tests/fixtures/releases/`, rendered. */
export function renderNote(repo: ReleaseRepo, template: string): string {
  return readFileSync(renderFixture(repo, `releases/${template}`), "utf8");
}

export interface HealthServer {
  readonly url: string;
  setCommit(commit: string): void;
  close(): Promise<void>;
}

/** A stand-in for production's `GET /api/health`, answering AC-31's body with `commit`. */
export async function serveHealth(commit: string): Promise<HealthServer> {
  let current = commit;
  const server: Server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        status: "ok",
        version: current,
        commit: current,
        appEnv: "production",
        region: "europe-west4",
      }),
    );
  });
  await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${String(port)}/api/health`,
    setCommit(value) {
      current = value;
    },
    close: () =>
      new Promise<void>((closed) => {
        server.close(() => closed());
      }),
  };
}
