import { exec, execOrThrow } from "../lib/exec.ts";

export async function findRepoRoot(cwd = process.cwd()): Promise<string> {
  const result = await exec(["git", "rev-parse", "--show-toplevel"], { cwd });
  if (result.code !== 0) {
    throw new Error("Not inside a git repository");
  }
  return result.stdout;
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
