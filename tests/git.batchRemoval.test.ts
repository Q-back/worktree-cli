import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  BatchRemovalError,
  executeBatchRemoval,
  planBatchRemoval,
} from "../src/git/batchRemoval.ts";
import { findCurrentWorktree, findRepoRoot } from "../src/git/repo.ts";
import { addNewBranch, list, pathFor, remove } from "../src/git/worktrees.ts";
import { execOrThrow } from "../src/lib/exec.ts";

let tmpDir: string;
let repoRoot: string;

const git = (args: string[], cwd = repoRoot) => execOrThrow(["git", ...args], { cwd });
const targetPaths = async (cwd: string) => (await planBatchRemoval(cwd)).targets.map((t) => t.path);

async function linked(name: string, outside = false): Promise<string> {
  const target = outside ? path.join(tmpDir, name) : pathFor(repoRoot, name);
  await addNewBranch(repoRoot, target, name, "main");
  return target;
}

beforeEach(async () => {
  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "wt-batch-test-")));
  repoRoot = path.join(tmpDir, "repo");
  fs.mkdirSync(repoRoot);
  await git(["init", "-b", "main"]);
  await git(["config", "user.email", "test@test.com"]);
  await git(["config", "user.name", "Test"]);
  fs.writeFileSync(path.join(repoRoot, "README.md"), "hello");
  fs.writeFileSync(path.join(repoRoot, ".gitignore"), "ignored/\n");
  await git(["add", "."]);
  await git(["commit", "-m", "init"]);
});

afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe("batch target selection", () => {
  it("selects all linked paths from the original root or nested directory without mutation", async () => {
    const outside = path.join(tmpDir, "outside space");
    await addNewBranch(repoRoot, outside, "outside", "main");
    const targets = [await linked("first"), outside];
    const branches = await git(["branch", "--format=%(refname)"]);
    const nested = path.join(repoRoot, "nested");
    fs.mkdirSync(nested);
    for (const cwd of [repoRoot, nested]) {
      expect((await targetPaths(cwd)).sort()).toEqual(targets.sort());
      expect(await findRepoRoot(cwd)).toBe(repoRoot);
      expect(await findCurrentWorktree(cwd)).toBe(repoRoot);
    }
    expect(await list(repoRoot)).toHaveLength(3);
    expect(await git(["branch", "--format=%(refname)"])).toBe(branches);
  });

  it("excludes the current linked checkout through roots, nested paths, symlinks and detached HEAD", async () => {
    const current = await linked("current");
    const other = await linked("other", true);
    const nested = path.join(current, "nested");
    const alias = path.join(tmpDir, "alias");
    fs.mkdirSync(nested);
    fs.symlinkSync(current, alias, "dir");
    await git(["checkout", "--detach"], current);
    for (const cwd of [current, nested, alias, path.join(alias, "nested")]) {
      expect(await findCurrentWorktree(cwd)).toBe(current);
      expect(await findRepoRoot(cwd)).toBe(repoRoot);
      expect(await targetPaths(cwd)).toEqual([other]);
    }
    expect(fs.existsSync(current)).toBe(true);
    expect(fs.existsSync(repoRoot)).toBe(true);
  });

  it("returns an empty batch when no other linked checkout exists", async () => {
    expect(await targetPaths(repoRoot)).toEqual([]);
    const current = await linked("current");
    expect(await targetPaths(current)).toEqual([]);
  });

  it("fails closed outside a registered worktree", async () => {
    await expect(planBatchRemoval(tmpDir)).rejects.toThrow();
  });
});

it("preserves the single-removal DIRTY sentinel and explicit force behavior", async () => {
  const target = await linked("single");
  fs.writeFileSync(path.join(target, "README.md"), "keep until approved");
  await expect(remove(repoRoot, target)).rejects.toThrow("DIRTY");
  expect(fs.readFileSync(path.join(target, "README.md"), "utf8")).toBe("keep until approved");
  await remove(repoRoot, target, true);
  expect(fs.existsSync(target)).toBe(false);
});

describe("batch execution", () => {
  it.each([
    "original",
    "linked",
  ])("removes clean targets from the %s checkout and preserves branches", async (invocation) => {
    const current = invocation === "linked" ? await linked("current") : repoRoot;
    await linked("first");
    await linked("second", true);
    const branches = await git(["branch", "--format=%(refname)"]);
    const plan = await planBatchRemoval(current);
    expect(await executeBatchRemoval(plan)).toEqual(plan.targets.map((t) => t.path));
    for (const target of plan.targets) expect(fs.existsSync(target.path)).toBe(false);
    expect(fs.existsSync(repoRoot)).toBe(true);
    expect(fs.existsSync(current)).toBe(true);
    expect(await git(["branch", "--format=%(refname)"])).toBe(branches);
  });

  it("executes an empty plan without mutation", async () => {
    expect(await executeBatchRemoval(await planBatchRemoval(repoRoot))).toEqual([]);
    expect(await list(repoRoot)).toHaveLength(1);
  });

  it("requires aggregate authorization for tracked, untracked and ignored data", async () => {
    const clean = await linked("clean");
    for (const name of ["tracked", "untracked", "ignored"]) {
      const target = await linked(name);
      const relative = name === "tracked" ? "README.md" : `${name}/file`;
      fs.mkdirSync(path.dirname(path.join(target, relative)), { recursive: true });
      fs.writeFileSync(path.join(target, relative), "keep until approved");
    }
    const plan = await planBatchRemoval(repoRoot);
    await expect(executeBatchRemoval(plan)).rejects.toThrow("authorization");
    for (const target of plan.targets) expect(fs.existsSync(target.path)).toBe(true);
    expect(fs.readFileSync(path.join(clean, "README.md"), "utf8")).toBe("hello");
    expect(await executeBatchRemoval(plan, true)).toEqual(plan.targets.map((t) => t.path));
    expect(await list(repoRoot)).toHaveLength(1);
    expect(await git(["branch", "--format=%(refname:short)"])).toContain("ignored");
  });

  it.each([
    "added",
    "removed",
    "dirty",
    "locked",
    "replaced",
  ])("rejects a %s target before any deletion", async (change) => {
    await linked("first");
    await linked("second");
    const plan = await planBatchRemoval(repoRoot);
    const last = plan.targets.at(-1)?.path;
    if (!last) throw new Error("Expected a target");
    if (change === "added") await linked("new");
    if (change === "removed") await git(["worktree", "remove", last]);
    if (change === "dirty") fs.writeFileSync(path.join(last, "new-data"), "not approved");
    if (change === "locked") await git(["worktree", "lock", last]);
    if (change === "replaced") {
      fs.renameSync(last, `${last}-old`);
      fs.cpSync(`${last}-old`, last, { recursive: true });
    }
    await expect(executeBatchRemoval(plan, true)).rejects.toThrow("fresh preview");
    for (const target of plan.targets) {
      expect(fs.existsSync(target.path)).toBe(change !== "removed" || target.path !== last);
    }
    if (change === "dirty")
      expect(fs.readFileSync(path.join(last, "new-data"), "utf8")).toBe("not approved");
  });

  it("stops on a real Git removal error and reports completed, failed and unattempted paths", async () => {
    const first = await linked("a-first");
    const failed = await linked("b-submodule");
    const remaining = await linked("c-last");
    await git(["-c", "protocol.file.allow=always", "submodule", "add", repoRoot, "module"], failed);
    await git(["commit", "-am", "add submodule"], failed);
    const plan = await planBatchRemoval(repoRoot);
    expect(plan.targets.map((t) => t.path)).toEqual([first, failed, remaining]);
    let failure: unknown;
    try {
      await executeBatchRemoval(plan);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(BatchRemovalError);
    if (!(failure instanceof BatchRemovalError)) throw failure;
    expect(failure.completed).toEqual([first]);
    expect(failure.failed).toBe(failed);
    expect(failure.unattempted).toEqual([remaining]);
    for (const target of [first, failed, remaining]) expect(failure.message).toContain(target);
    expect(fs.existsSync(first)).toBe(false);
    expect(fs.existsSync(failed)).toBe(true);
    expect(fs.existsSync(remaining)).toBe(true);
  });
});

describe("batch inspection", () => {
  it("finds tracked, staged, nested untracked and ignored-only data without changing files", async () => {
    const clean = await linked("clean");
    const dirty = [];
    for (const name of ["tracked", "staged", "untracked", "ignored"]) {
      const target = await linked(name);
      const relative = ["tracked", "staged"].includes(name) ? "README.md" : `${name}/nested/file`;
      const file = path.join(target, relative);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, name);
      if (name === "staged") await git(["add", "."], target);
      dirty.push({ target, file, contents: name });
    }
    const plan = await planBatchRemoval(repoRoot);
    expect(
      plan.targets
        .filter((t) => t.dirty)
        .map((t) => t.path)
        .sort(),
    ).toEqual(dirty.map((t) => t.target).sort());
    expect(plan.targets.find((t) => t.path === clean)?.dirty).toBe(false);
    for (const { file, contents } of dirty) expect(fs.readFileSync(file, "utf8")).toBe(contents);
    expect(await list(repoRoot)).toHaveLength(6);
  });

  it.each([
    "missing",
    "uninspectable",
    "locked",
    "foreign",
  ])("blocks %s targets before mutation", async (problem) => {
    const clean = await linked("clean");
    const target = await linked("problem", true);
    if (problem === "missing") fs.rmSync(target, { recursive: true });
    if (problem === "uninspectable") fs.writeFileSync(path.join(target, ".git"), "invalid");
    if (problem === "locked") await git(["worktree", "lock", "--reason", "keep", target]);
    if (problem === "foreign") {
      fs.unlinkSync(path.join(target, ".git"));
      await git(["init", "-b", "foreign"], target);
    }
    await expect(planBatchRemoval(repoRoot)).rejects.toThrow(target);
    expect(fs.readFileSync(path.join(clean, "README.md"), "utf8")).toBe("hello");
    expect(await list(repoRoot)).toHaveLength(3);
    expect(fs.existsSync(target)).toBe(problem !== "missing");
  });
});
