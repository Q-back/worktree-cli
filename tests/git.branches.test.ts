import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { branchExists, listLocal, mergeBase } from "../src/git/branches.ts";
import { exec } from "../src/lib/exec.ts";

let tmpDir: string;
let repoRoot: string;

async function git(args: string[], cwd = repoRoot) {
  const result = await exec(["git", ...args], { cwd });
  if (result.code !== 0) throw new Error(result.stderr);
  return result.stdout;
}

beforeEach(async () => {
  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "wt-branches-test-")));
  repoRoot = path.join(tmpDir, "repo");
  fs.mkdirSync(repoRoot);

  await git(["init", "-b", "main"], repoRoot);
  await git(["config", "user.email", "test@test.com"]);
  await git(["config", "user.name", "Test"]);
  fs.writeFileSync(path.join(repoRoot, "README.md"), "hello");
  await git(["add", "."]);
  await git(["commit", "-m", "init"]);
  await git(["branch", "feature/bar"]);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("listLocal", () => {
  it("lists all local branches", async () => {
    const branches = await listLocal(repoRoot);
    expect(branches).toContain("main");
    expect(branches).toContain("feature/bar");
  });
});

describe("branchExists", () => {
  it("returns true for existing branch", async () => {
    expect(await branchExists(repoRoot, "main")).toBe(true);
  });

  it("returns false for non-existent branch", async () => {
    expect(await branchExists(repoRoot, "nonexistent")).toBe(false);
  });
});

describe("mergeBase", () => {
  it("finds merge base between branches", async () => {
    fs.writeFileSync(path.join(repoRoot, "extra.md"), "extra");
    await git(["checkout", "feature/bar"]);
    await git(["add", "."]);
    await git(["commit", "-m", "branch commit"]);

    const base = await mergeBase(repoRoot, "main", "feature/bar");
    expect(base).toBeTruthy();
    expect(base).toHaveLength(40);
  });
});
