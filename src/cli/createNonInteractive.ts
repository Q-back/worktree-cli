import { writeFileSync } from "node:fs";
import { branchExists, mergeBase } from "../git/branches.ts";
import { currentBranch, defaultBaseBranch, findRepoRoot } from "../git/repo.ts";
import { add, addNewBranch, isRegisteredWorktree, pathFor } from "../git/worktrees.ts";

export async function createNonInteractive(
  branch: string,
  outputFile: string | null = null,
): Promise<void> {
  const repoRoot = await findRepoRoot();
  const wtPath = pathFor(repoRoot, branch);

  const emit = (path: string): void => {
    if (outputFile) {
      writeFileSync(outputFile, `${path}\n`);
    } else {
      process.stdout.write(`${path}\n`);
    }
  };

  if (await isRegisteredWorktree(repoRoot, wtPath)) {
    emit(wtPath);
    return;
  }

  if (await branchExists(repoRoot, branch)) {
    await add(repoRoot, wtPath, branch);
    emit(wtPath);
    return;
  }

  const head = await currentBranch(repoRoot);
  const base = await defaultBaseBranch(repoRoot);
  const baseRef = head === base ? base : await mergeBase(repoRoot, "HEAD", base);

  await addNewBranch(repoRoot, wtPath, branch, baseRef);
  emit(wtPath);
}
