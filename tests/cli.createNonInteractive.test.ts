import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { list, pathFor } from "../src/git/worktrees.ts";
import { exec } from "../src/lib/exec.ts";

let tmpDir: string;
let repoRoot: string;

async function git(args: string[], cwd = repoRoot) {
  const result = await exec(["git", ...args], { cwd });
  if (result.code !== 0) throw new Error(result.stderr);
  return result.stdout;
}

async function runWt(branch: string, cwd = repoRoot) {
  return exec(["bun", "run", path.join(process.cwd(), "src/index.tsx"), branch], { cwd });
}

beforeEach(async () => {
  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "wt-cli-test-")));
  repoRoot = path.join(tmpDir, "repo");
  fs.mkdirSync(repoRoot);

  await git(["init", "-b", "main"], repoRoot);
  await git(["config", "user.email", "test@test.com"]);
  await git(["config", "user.name", "Test"]);
  fs.writeFileSync(path.join(repoRoot, "README.md"), "hello");
  await git(["add", "."]);
  await git(["commit", "-m", "init"]);
  await git(["branch", "feature/existing"]);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("wt <branch> — non-interactive", () => {
  it("creates worktree for existing branch", async () => {
    const result = await runWt("feature/existing");
    expect(result.code).toBe(0);
    const expectedPath = pathFor(repoRoot, "feature/existing");
    expect(result.stdout.trim()).toBe(expectedPath);
    expect(fs.existsSync(expectedPath)).toBe(true);
  });

  it("creates new branch and worktree when branch does not exist", async () => {
    const result = await runWt("feat/new-thing");
    expect(result.code).toBe(0);
    const expectedPath = pathFor(repoRoot, "feat/new-thing");
    expect(result.stdout.trim()).toBe(expectedPath);
    expect(fs.existsSync(expectedPath)).toBe(true);
    const branches = await git(["branch", "--format=%(refname:short)"]);
    expect(branches).toContain("feat/new-thing");
  });

  it("returns existing path when worktree already exists (idempotent)", async () => {
    await runWt("feature/existing");
    const result2 = await runWt("feature/existing");
    expect(result2.code).toBe(0);
    const expectedPath = pathFor(repoRoot, "feature/existing");
    expect(result2.stdout.trim()).toBe(expectedPath);
    const worktrees = await list(repoRoot);
    expect(worktrees.filter((w) => w.path === expectedPath)).toHaveLength(1);
  });
});
