import { realpath, stat } from "node:fs/promises";
import * as path from "node:path";
import { execOrThrow } from "../lib/exec.ts";
import { findCurrentWorktree, findRepoRoot } from "./repo.ts";
import { remove } from "./worktrees.ts";

export interface BatchRemovalTarget {
  readonly path: string;
  readonly identity: string;
  readonly dirty: boolean;
}

export interface BatchRemovalPlan {
  readonly repoRoot: string;
  readonly currentPath: string;
  readonly currentIdentity: string;
  readonly targets: readonly BatchRemovalTarget[];
}

/**
 * Inspect every eligible checkout without removing anything. The original and
 * invocation worktrees are excluded by canonical path, not branch or container.
 * Missing, foreign, uninspectable or locked targets block the entire plan.
 * Targets containing either protected worktree also block the entire plan.
 * `dirty` includes tracked, untracked and ignored data that deletion would lose.
 * Callers must preview this fixed plan and confirm the batch before executing it.
 */
export async function planBatchRemoval(cwd = process.cwd()): Promise<BatchRemovalPlan> {
  const repoRoot = await realpath(await findRepoRoot(cwd));
  const currentPath = await findCurrentWorktree(cwd);
  const registry = await readRegistry(repoRoot);
  const paths = await Promise.all(registry.map((entry) => realpath(entry.path)));
  if (paths[0] !== repoRoot || paths.filter((p) => p === currentPath).length !== 1) {
    throw new Error("Cannot safely identify the original and current worktrees");
  }
  const currentIdentity = await worktreeIdentity(repoRoot, currentPath);
  const targets: BatchRemovalTarget[] = [];
  for (const [index, entry] of registry.entries()) {
    const targetPath = paths[index];
    if (index === 0 || targetPath === currentPath || targetPath === undefined) continue;
    const protectedPath = [repoRoot, currentPath].find((p) => containsPath(targetPath, p));
    if (protectedPath) {
      throw new Error(`Cannot remove ${targetPath}: contains protected worktree ${protectedPath}`);
    }
    targets.push(await inspectTarget(repoRoot, targetPath, entry.locked));
  }
  return { repoRoot, currentPath, currentIdentity, targets };
}

/**
 * Execute only after batch confirmation; `discardChanges` requires a separate,
 * aggregate data-loss approval. Cancelled callers must discard the plan/approval.
 * Reinspect the full plan before deletion; changed identities, membership, locks
 * or newly dirty targets require a fresh preview, not an extra confirmation.
 * Removals are sequential and stop on error, with no rollback. This is not an
 * atomic filesystem transaction: concurrent changes after revalidation can race.
 * Only approved dirty targets receive a single --force; locks are never bypassed.
 */
export async function executeBatchRemoval(
  plan: BatchRemovalPlan,
  discardChanges = false,
): Promise<string[]> {
  if (!discardChanges && plan.targets.some((target) => target.dirty)) {
    throw new Error("Data-loss authorization is required; no worktrees removed");
  }
  const fresh = await revalidate(plan);
  const completed: string[] = [];
  for (const [index, target] of fresh.targets.entries()) {
    try {
      await remove(fresh.repoRoot, target.path, target.dirty && discardChanges);
      completed.push(target.path);
    } catch (cause) {
      throw new BatchRemovalError(
        completed,
        target.path,
        fresh.targets.slice(index + 1).map((remaining) => remaining.path),
        cause,
      );
    }
  }
  return completed;
}

export class BatchRemovalError extends Error {
  constructor(
    readonly completed: readonly string[],
    readonly failed: string,
    readonly unattempted: readonly string[],
    cause: unknown,
  ) {
    super(
      `Removal failed: ${failed}\n${cause instanceof Error ? cause.message : cause}\n` +
        `Completed removals (not undone): ${completed.join(", ") || "none"}\n` +
        `Not attempted: ${unattempted.join(", ") || "none"}`,
      { cause },
    );
    this.name = "BatchRemovalError";
  }
}

async function revalidate(plan: BatchRemovalPlan): Promise<BatchRemovalPlan> {
  try {
    const fresh = await planBatchRemoval(plan.currentPath);
    const confirmed = new Map(plan.targets.map((target) => [target.path, target]));
    if (
      fresh.repoRoot !== plan.repoRoot ||
      fresh.currentPath !== plan.currentPath ||
      fresh.currentIdentity !== plan.currentIdentity ||
      fresh.targets.length !== plan.targets.length ||
      fresh.targets.some((target) => {
        const previous = confirmed.get(target.path);
        return (
          !previous || previous.identity !== target.identity || (target.dirty && !previous.dirty)
        );
      })
    ) {
      throw new Error("Worktree identities, target membership or data-loss requirements changed");
    }
    return fresh;
  } catch (cause) {
    throw new Error(
      `Batch cannot proceed; restart with a fresh preview. ${cause instanceof Error ? cause.message : cause}`,
      { cause },
    );
  }
}

function containsPath(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return !path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`);
}

async function inspectTarget(
  repoRoot: string,
  targetPath: string,
  locked: boolean,
): Promise<BatchRemovalTarget> {
  try {
    if (locked) throw new Error("Worktree is locked");
    const identity = await worktreeIdentity(repoRoot, targetPath);
    const status = await execOrThrow(
      [
        "git",
        "--no-optional-locks",
        "status",
        "--porcelain=v1",
        "-z",
        "--untracked-files=all",
        "--ignored",
      ],
      { cwd: targetPath },
    );
    return { path: targetPath, identity, dirty: status.length > 0 };
  } catch (cause) {
    throw new Error(
      `Cannot inspect ${targetPath}: ${cause instanceof Error ? cause.message : cause}`,
      { cause },
    );
  }
}

async function worktreeIdentity(repoRoot: string, targetPath: string): Promise<string> {
  if (
    (await findCurrentWorktree(targetPath)) !== targetPath ||
    (await realpath(await findRepoRoot(targetPath))) !== repoRoot
  ) {
    throw new Error("Path is not the registered checkout of this repository");
  }
  const gitDir = await realpath(
    await execOrThrow(["git", "rev-parse", "--absolute-git-dir"], { cwd: targetPath }),
  );
  const directory = await stat(targetPath);
  const metadata = await stat(gitDir);
  return `${gitDir}\0${directory.dev}:${directory.ino}\0${metadata.dev}:${metadata.ino}`;
}

async function readRegistry(repoRoot: string) {
  const output = await execOrThrow(["git", "worktree", "list", "--porcelain", "-z"], {
    cwd: repoRoot,
  });
  return output
    .split("\0\0")
    .filter(Boolean)
    .map((record) => {
      const fields = record.split("\0");
      const first = fields[0];
      if (!first?.startsWith("worktree ")) throw new Error("Cannot read worktree registry");
      return {
        path: first.slice("worktree ".length),
        locked: fields.some((f) => /^locked(?: |$)/.test(f)),
      };
    });
}
