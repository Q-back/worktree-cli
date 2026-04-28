import * as path from "node:path";
import { exec, execOrThrow } from "../lib/exec.ts";

export interface Worktree {
  path: string;
  branch: string | null;
  isMain: boolean;
}

export function pathFor(repoRoot: string, branch: string): string {
  const lastSegment = branch.split("/").at(-1) ?? branch;
  const repoName = path.basename(repoRoot);
  const siblingContainer = path.join(repoRoot, "..", `${repoName}.worktrees`);
  return path.join(siblingContainer, lastSegment);
}

export async function list(repoRoot: string): Promise<Worktree[]> {
  const out = await execOrThrow(["git", "worktree", "list", "--porcelain"], {
    cwd: repoRoot,
  });

  const worktrees: Worktree[] = [];
  let current: Partial<Worktree> & { path?: string } = {};

  for (const line of out.split("\n")) {
    if (line.startsWith("worktree ")) {
      current = { path: line.slice("worktree ".length) };
    } else if (line.startsWith("branch ")) {
      current.branch = line.slice("branch refs/heads/".length);
    } else if (line === "bare") {
      current.branch = null;
    } else if (line === "") {
      if (current.path != null) {
        worktrees.push({
          path: current.path,
          branch: current.branch ?? null,
          isMain: worktrees.length === 0,
        });
      }
      current = {};
    }
  }

  if (current.path != null) {
    worktrees.push({
      path: current.path,
      branch: current.branch ?? null,
      isMain: worktrees.length === 0,
    });
  }

  return worktrees;
}

export async function isRegisteredWorktree(repoRoot: string, wtPath: string): Promise<boolean> {
  const worktrees = await list(repoRoot);
  return worktrees.some((wt) => wt.path === wtPath);
}

export async function add(repoRoot: string, wtPath: string, branch: string): Promise<void> {
  await execOrThrow(["git", "worktree", "add", wtPath, branch], {
    cwd: repoRoot,
  });
}

export async function addNewBranch(
  repoRoot: string,
  wtPath: string,
  branch: string,
  base: string,
): Promise<void> {
  await execOrThrow(["git", "worktree", "add", "-b", branch, wtPath, base], { cwd: repoRoot });
}

export async function remove(repoRoot: string, wtPath: string, force = false): Promise<void> {
  const cmd = force
    ? ["git", "worktree", "remove", "--force", wtPath]
    : ["git", "worktree", "remove", wtPath];

  const result = await exec(cmd, { cwd: repoRoot });
  if (result.code !== 0) {
    if (!force && result.stderr.includes("contains modified or untracked")) {
      throw new Error("DIRTY");
    }
    throw new Error(result.stderr || "git worktree remove failed");
  }
}
