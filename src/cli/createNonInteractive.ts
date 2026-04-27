import { branchExists, mergeBase } from "../git/branches.ts";
import { currentBranch, defaultBaseBranch, findRepoRoot } from "../git/repo.ts";
import { add, addNewBranch, isRegisteredWorktree, pathFor } from "../git/worktrees.ts";

export async function createNonInteractive(branch: string): Promise<void> {
  const repoRoot = await findRepoRoot();
  const wtPath = pathFor(repoRoot, branch);

  if (await isRegisteredWorktree(repoRoot, wtPath)) {
    process.stdout.write(`${wtPath}\n`);
    return;
  }

  if (await branchExists(repoRoot, branch)) {
    await add(repoRoot, wtPath, branch);
    process.stdout.write(`${wtPath}\n`);
    return;
  }

  const head = await currentBranch(repoRoot);
  const base = await defaultBaseBranch(repoRoot);
  const baseRef = head === base ? base : await mergeBase(repoRoot, "HEAD", base);

  await addNewBranch(repoRoot, wtPath, branch, baseRef);
  process.stdout.write(`${wtPath}\n`);
}
