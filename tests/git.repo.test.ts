import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { findRepoRoot } from "../src/git/repo.ts";
import { add, pathFor } from "../src/git/worktrees.ts";
import { exec } from "../src/lib/exec.ts";

let tmpDir: string;
let repoRoot: string;

async function git(args: string[], cwd = repoRoot) {
  const result = await exec(["git", ...args], { cwd });
  if (result.code !== 0) throw new Error(result.stderr);
  return result.stdout;
}

beforeEach(async () => {
  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "wt-repo-test-")));
  repoRoot = path.join(tmpDir, "repo");
  fs.mkdirSync(repoRoot);

  await git(["init", "-b", "main"], repoRoot);
  await git(["config", "user.email", "test@test.com"]);
  await git(["config", "user.name", "Test"]);
  fs.writeFileSync(path.join(repoRoot, "README.md"), "hello");
  await git(["add", "."]);
  await git(["commit", "-m", "init"]);
  await git(["branch", "feature/foo"]);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("findRepoRoot", () => {
  it("returns repo root when called from the main worktree", async () => {
    expect(await findRepoRoot(repoRoot)).toBe(repoRoot);
  });

  it("returns main repo root when called from inside a linked worktree", async () => {
    const wtPath = pathFor(repoRoot, "feature/foo");
    await add(repoRoot, wtPath, "feature/foo");

    expect(await findRepoRoot(wtPath)).toBe(repoRoot);
  });
});
