import { printCompletion } from "./cli/completion.ts";
import { createNonInteractive } from "./cli/createNonInteractive.ts";
import { printHelp } from "./cli/help.ts";
import { listLocal } from "./git/branches.ts";
import { findRepoRoot } from "./git/repo.ts";
import { list } from "./git/worktrees.ts";

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

  const outputFileIdx = args.indexOf("--output-file");
  const outputFile = args[outputFileIdx + 1];
  if (!outputFile) {
    process.stderr.write("wt: --output-file <path> is required\n");
    process.exit(1);
  }
  const positionalArgs = args.filter((_, i) => i !== outputFileIdx && i !== outputFileIdx + 1);

  if (positionalArgs.length > 0 && positionalArgs[0] != null) {
    await createNonInteractive(positionalArgs[0], outputFile);
    return;
  }

  // TUI mode — lazy-load OpenTUI to avoid its native side effects on
  // non-interactive paths (which would otherwise pollute captured stdout
  // with terminal capability queries).
  const repoRoot = await findRepoRoot();
  const [worktrees, localBranches] = await Promise.all([list(repoRoot), listLocal(repoRoot)]);

  const { createCliRenderer } = await import("@opentui/core");
  const { createRoot } = await import("@opentui/react");
  const { App } = await import("./tui/App.tsx");

  const renderer = await createCliRenderer({ exitOnCtrlC: true });
  createRoot(renderer).render(
    <App
      repoRoot={repoRoot}
      worktrees={worktrees}
      localBranches={localBranches}
      outputFile={outputFile}
    />,
  );
}

main().catch((e) => {
  process.stderr.write(`Error: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
