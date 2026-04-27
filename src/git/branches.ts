import { exec, execOrThrow } from "../lib/exec.ts";

export async function listLocal(repoRoot: string): Promise<string[]> {
  const out = await execOrThrow(["git", "branch", "--format=%(refname:short)"], { cwd: repoRoot });
  return out
    ? out
        .split("\n")
        .map((b) => b.trim())
        .filter(Boolean)
    : [];
}

export async function listRemote(repoRoot: string): Promise<string[]> {
  const out = await execOrThrow(["git", "branch", "-r", "--format=%(refname:short)"], {
    cwd: repoRoot,
  });
  return out
    ? out
        .split("\n")
        .map((b) => b.trim())
        .filter(Boolean)
    : [];
}

export async function branchExists(repoRoot: string, branch: string): Promise<boolean> {
  const result = await exec(["git", "rev-parse", "--verify", `refs/heads/${branch}`], {
    cwd: repoRoot,
  });
  return result.code === 0;
}

export async function mergeBase(repoRoot: string, a: string, b: string): Promise<string> {
  return execOrThrow(["git", "merge-base", a, b], { cwd: repoRoot });
}
