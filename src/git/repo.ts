import * as path from "node:path";
import { exec, execOrThrow } from "../lib/exec.ts";

export async function findRepoRoot(cwd = process.cwd()): Promise<string> {
  const result = await exec(["git", "rev-parse", "--git-common-dir"], { cwd });
  if (result.code !== 0) {
    throw new Error("Not inside a git repository");
  }
  // --git-common-dir returns an absolute path from a worktree or a relative ".git"
  // from the main worktree; resolve then strip /.git to get the main repo root
  const gitDir = path.resolve(cwd, result.stdout);
  return gitDir.replace(/[/\\]\.git$/, "");
}

export async function currentBranch(repoRoot: string): Promise<string> {
  return execOrThrow(["git", "rev-parse", "--abbrev-ref", "HEAD"], {
    cwd: repoRoot,
  });
}

export async function defaultBaseBranch(repoRoot: string): Promise<string> {
  const result = await exec(["git", "rev-parse", "--verify", "main"], { cwd: repoRoot });
  if (result.code === 0) return "main";
  return "master";
}
