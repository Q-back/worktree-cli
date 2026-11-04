import { lstat, realpath, rm, stat } from "node:fs/promises";
import * as path from "node:path";
import { execOrThrow } from "../lib/exec.ts";
import { findCurrentWorktree, findRepoRoot } from "./repo.ts";
import { remove } from "./worktrees.ts";

export interface BatchRemovalProgress {
  readonly phase: "inspecting" | "rechecking" | "removing";
  /** One-based index of the target being processed, not a completed count. */
  readonly current: number;
  readonly total: number;
  readonly path: string;
}

export type DataLossReason = "tracked changes" | "untracked files" | "ignored files";

export interface BatchRemovalTarget {
  readonly path: string;
  readonly identity: string;
  readonly invalid: boolean;
  readonly dirty: boolean;
  readonly reasons: readonly DataLossReason[];
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
 * Git-marked prunable targets without .git metadata need separate deletion approval.
 * Foreign, uninspectable, locked or unsafe nested targets block the entire plan.
 * `dirty` includes tracked, untracked and ignored data that deletion would lose.
 * Callers must preview this fixed plan and confirm the batch before executing it.
 */
export async function planBatchRemoval(
  cwd = process.cwd(),
  onProgress?: (progress: BatchRemovalProgress) => void,
): Promise<BatchRemovalPlan> {
  const repoRoot = await realpath(await findRepoRoot(cwd));
  const currentPath = await findCurrentWorktree(cwd);
  const registry = await readRegistry(repoRoot);
  const paths = await Promise.all(
    registry.map(async (entry) => {
      try {
        return await realpath(entry.path);
      } catch (cause) {
        if (isMissing(cause) && entry.prunable) return path.resolve(entry.path);
        throw cause;
      }
    }),
  );
  if (paths[0] !== repoRoot || paths.filter((p) => p === currentPath).length !== 1) {
    throw new Error("Cannot safely identify the original and current worktrees");
  }
  const currentIdentity = await worktreeIdentity(repoRoot, currentPath);
  const targets: BatchRemovalTarget[] = [];
  const total = paths.filter((targetPath, index) => index > 0 && targetPath !== currentPath).length;
  for (const [index, entry] of registry.entries()) {
    const targetPath = paths[index];
    if (index === 0 || targetPath === currentPath || targetPath === undefined) continue;
    onProgress?.({
      phase: "inspecting",
      current: targets.length + 1,
      total,
      path: targetPath,
    });
    const protectedPath = [repoRoot, currentPath].find((p) => containsPath(targetPath, p));
    if (protectedPath) {
      throw new Error(`Cannot remove ${targetPath}: contains protected worktree ${protectedPath}`);
    }
    if (entry.prunable && (await optionalStat(entry.path))?.isSymbolicLink()) {
      throw new Error(`Cannot inspect ${entry.path}: invalid folder is a symlink`);
    }
    targets.push(await inspectTarget(repoRoot, targetPath, entry.locked, entry.prunable));
  }
  for (const target of targets.filter((target) => target.invalid)) {
    if (
      targets.some(
        (other) =>
          other !== target &&
          (containsPath(target.path, other.path) || containsPath(other.path, target.path)),
      )
    ) {
      throw new Error(`Cannot remove ${target.path}: unsafe nested worktree targets`);
    }
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
 * Invalid folders are skipped unless `deleteInvalidFolders` is separately approved.
 * Their registration is removed individually, never with a repository-wide prune.
 */
export async function executeBatchRemoval(
  plan: BatchRemovalPlan,
  discardChanges = false,
  onProgress?: (progress: BatchRemovalProgress) => void,
  deleteInvalidFolders = false,
): Promise<string[]> {
  if (!discardChanges && plan.targets.some((target) => target.dirty)) {
    throw new Error("Data-loss authorization is required; no worktrees removed");
  }
  const fresh = await revalidate(plan, onProgress);
  const targets = fresh.targets.filter((target) => !target.invalid || deleteInvalidFolders);
  const completed: string[] = [];
  for (const [index, target] of targets.entries()) {
    onProgress?.({
      phase: "removing",
      current: index + 1,
      total: targets.length,
      path: target.path,
    });
    try {
      if (target.invalid) {
        const registration = (await readRegistry(fresh.repoRoot)).find(
          (entry) => path.resolve(entry.path) === target.path,
        );
        if (!registration?.prunable || registration.locked) {
          throw new Error("Invalid registration changed; restart with a fresh preview");
        }
        const checked = await inspectInvalidTarget(target.path);
        if (checked.identity !== target.identity) {
          throw new Error("Invalid folder changed; restart with a fresh preview");
        }
        if (target.identity !== "missing") await rm(target.path, { recursive: true });
      }
      await remove(fresh.repoRoot, target.path, target.dirty && discardChanges);
      completed.push(target.path);
    } catch (cause) {
      throw new BatchRemovalError(
        completed,
        target.path,
        targets.slice(index + 1).map((remaining) => remaining.path),
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

async function revalidate(
  plan: BatchRemovalPlan,
  onProgress?: (progress: BatchRemovalProgress) => void,
): Promise<BatchRemovalPlan> {
  try {
    const fresh = await planBatchRemoval(plan.currentPath, (progress) =>
      onProgress?.({ ...progress, phase: "rechecking" }),
    );
    const confirmed = new Map(plan.targets.map((target) => [target.path, target]));
    if (
      fresh.repoRoot !== plan.repoRoot ||
      fresh.currentPath !== plan.currentPath ||
      fresh.currentIdentity !== plan.currentIdentity ||
      fresh.targets.length !== plan.targets.length ||
      fresh.targets.some((target) => {
        const previous = confirmed.get(target.path);
        return (
          !previous ||
          previous.identity !== target.identity ||
          previous.invalid !== target.invalid ||
          (target.dirty && !previous.dirty)
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
  prunable: boolean,
): Promise<BatchRemovalTarget> {
  try {
    if (locked) throw new Error("Worktree is locked");
    if (prunable) return await inspectInvalidTarget(targetPath);
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
    const reasons = dataLossReasons(status);
    return { path: targetPath, identity, invalid: false, dirty: reasons.length > 0, reasons };
  } catch (cause) {
    throw new Error(
      `Cannot inspect ${targetPath}: ${cause instanceof Error ? cause.message : cause}`,
      { cause },
    );
  }
}

function isMissing(cause: unknown): boolean {
  return cause instanceof Error && "code" in cause && cause.code === "ENOENT";
}

async function optionalStat(targetPath: string) {
  try {
    return await lstat(targetPath);
  } catch (cause) {
    if (isMissing(cause)) return null;
    throw cause;
  }
}

async function inspectInvalidTarget(targetPath: string): Promise<BatchRemovalTarget> {
  const directory = await optionalStat(targetPath);
  if (directory && !directory.isDirectory()) {
    throw new Error(`Cannot inspect ${targetPath}: invalid folder is not a directory`);
  }
  // Bare repositories keep Git metadata in the folder itself, not inside .git.
  const bareMetadata =
    directory &&
    (await optionalStat(path.join(targetPath, "HEAD"))) &&
    (await optionalStat(path.join(targetPath, "objects")));
  if (bareMetadata || (directory && (await optionalStat(path.join(targetPath, ".git"))))) {
    throw new Error(`Cannot inspect ${targetPath}: Git metadata exists; repair the worktree first`);
  }
  return {
    path: targetPath,
    identity: directory ? `${directory.dev}:${directory.ino}` : "missing",
    invalid: true,
    dirty: false,
    reasons: [],
  };
}

function dataLossReasons(status: string): DataLossReason[] {
  const found = new Set<DataLossReason>();
  const records = status.split("\0");
  for (let index = 0; index < records.length; index++) {
    const record = records[index];
    if (!record) continue;
    const code = record.slice(0, 2);
    found.add(
      code === "??" ? "untracked files" : code === "!!" ? "ignored files" : "tracked changes",
    );
    // Porcelain -z renames/copies have an extra NUL-delimited source path.
    if (code.includes("R") || code.includes("C")) index++;
  }
  return (["tracked changes", "untracked files", "ignored files"] as const).filter((reason) =>
    found.has(reason),
  );
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
        prunable: fields.some((f) => /^prunable(?: |$)/.test(f)),
      };
    });
}
