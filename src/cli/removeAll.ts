import { executeBatchRemoval, planBatchRemoval } from "../git/batchRemoval.ts";
import { confirmTerminal } from "./confirmTerminal.ts";

export async function removeAll(): Promise<void> {
  const plan = await planBatchRemoval();
  if (plan.targets.length === 0) {
    process.stderr.write("No other worktrees to remove.\n");
    return;
  }
  if (!process.stdin.isTTY) {
    throw new Error(
      "Bulk removal requires an interactive terminal; piped approval is not accepted",
    );
  }
  warning("Remove all listed linked worktrees:");
  for (const target of plan.targets) process.stderr.write(`  ${target.path}\n`);
  process.stderr.write("The original repository, current worktree and branches are preserved.\n");
  const dirty = plan.targets.filter((target) => target.dirty);
  let confirmed = await confirmTerminal("Remove all listed worktrees? [y/N] ");
  if (confirmed && dirty.length > 0) {
    warning("Uncommitted changes, untracked and ignored files will be lost:");
    for (const target of dirty) process.stderr.write(`  ${target.path}\n`);
    confirmed = await confirmTerminal("Discard data in all affected worktrees? [y/N] ");
  }
  if (!confirmed) {
    process.stderr.write("Cancelled. No worktrees removed.\n");
    return;
  }
  const removed = await executeBatchRemoval(plan, dirty.length > 0);
  process.stderr.write(
    `Removed worktrees:\n${removed.map((target) => `  ${target}`).join("\n")}\n`,
  );
}

function warning(message: string): void {
  const color =
    process.stderr.isTTY && process.env.TERM !== "dumb" && process.env.NO_COLOR === undefined;
  process.stderr.write(color ? `\x1b[31mWARNING: ${message}\x1b[0m\n` : `WARNING: ${message}\n`);
}
