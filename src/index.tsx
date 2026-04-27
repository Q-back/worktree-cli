import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { printCompletion } from "./cli/completion.ts";
import { createNonInteractive } from "./cli/createNonInteractive.ts";
import { printHelp } from "./cli/help.ts";
import { listLocal } from "./git/branches.ts";
import { findRepoRoot } from "./git/repo.ts";
import { list } from "./git/worktrees.ts";
import { App } from "./tui/App.tsx";

const args = process.argv.slice(2);

async function main() {
  if (args[0] === "--help" || args[0] === "-h") {
    printHelp();
    return;
  }

  if (args[0] === "completion") {
    const shell = args[1];
    if (!shell) {
      process.stderr.write("Usage: wt completion <zsh|bash>\n");
      process.exit(1);
    }
    printCompletion(shell);
    return;
  }

  if (args.length > 0 && args[0] != null) {
    await createNonInteractive(args[0]);
    return;
  }

  // TUI mode
  const repoRoot = await findRepoRoot();
  const [worktrees, localBranches] = await Promise.all([list(repoRoot), listLocal(repoRoot)]);

  const renderer = await createCliRenderer({ exitOnCtrlC: true });
  createRoot(renderer).render(
    <App repoRoot={repoRoot} worktrees={worktrees} localBranches={localBranches} />,
  );
}

main().catch((e) => {
  process.stderr.write(`Error: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
