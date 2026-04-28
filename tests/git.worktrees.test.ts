import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { add, addNewBranch, list, pathFor, remove } from "../src/git/worktrees.ts";
import { exec } from "../src/lib/exec.ts";

let tmpDir: string;
let repoRoot: string;

async function git(args: string[], cwd = repoRoot) {
  const result = await exec(["git", ...args], { cwd });
  if (result.code !== 0) throw new Error(result.stderr);
  return result.stdout;
}

beforeEach(async () => {
  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "wt-test-")));
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

describe("pathFor", () => {
  it("uses last segment of branch in sibling container", () => {
    const repoName = path.basename(repoRoot);
    const container = path.join(repoRoot, "..", `${repoName}.worktrees`);
    expect(pathFor(repoRoot, "feat/PROJ-123")).toBe(path.join(container, "PROJ-123"));
  });

  it("handles simple branch name", () => {
    const repoName = path.basename(repoRoot);
    const container = path.join(repoRoot, "..", `${repoName}.worktrees`);
    expect(pathFor(repoRoot, "main")).toBe(path.join(container, "main"));
  });

  it("places worktree as sibling to repo directory", () => {
    const wtPath = pathFor(repoRoot, "feature/foo");
    expect(path.dirname(path.dirname(wtPath))).toBe(path.dirname(repoRoot));
  });
});

describe("list", () => {
  it("returns main worktree with isMain=true", async () => {
    const worktrees = await list(repoRoot);
    expect(worktrees).toHaveLength(1);
    expect(worktrees[0]?.isMain).toBe(true);
    expect(worktrees[0]?.branch).toBe("main");
  });

  it("reflects added worktrees", async () => {
    const wtPath = pathFor(repoRoot, "feature/foo");
    await add(repoRoot, wtPath, "feature/foo");
    const worktrees = await list(repoRoot);
    expect(worktrees).toHaveLength(2);
    const secondary = worktrees.find((w) => !w.isMain);
    expect(secondary?.branch).toBe("feature/foo");
    expect(secondary?.path).toBe(wtPath);
  });
});

describe("add", () => {
  it("creates a worktree directory", async () => {
    const wtPath = pathFor(repoRoot, "feature/foo");
    await add(repoRoot, wtPath, "feature/foo");
    expect(fs.existsSync(wtPath)).toBe(true);
  });
});

describe("addNewBranch", () => {
  it("creates a new branch and worktree", async () => {
    const wtPath = pathFor(repoRoot, "feat/new");
    await addNewBranch(repoRoot, wtPath, "feat/new", "main");
    expect(fs.existsSync(wtPath)).toBe(true);
    const branches = await git(["branch", "--format=%(refname:short)"]);
    expect(branches).toContain("feat/new");
  });
});

describe("remove", () => {
  it("removes a worktree", async () => {
    const wtPath = pathFor(repoRoot, "feature/foo");
    await add(repoRoot, wtPath, "feature/foo");
    await remove(repoRoot, wtPath);
    const worktrees = await list(repoRoot);
    expect(worktrees.every((w) => w.path !== wtPath)).toBe(true);
  });
});
