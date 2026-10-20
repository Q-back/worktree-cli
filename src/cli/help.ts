export function printHelp(): void {
  process.stdout.write(`wt — git worktree manager

USAGE
  wt                   Open interactive TUI (create / switch / remove)
  wt <branch>          Switch to or create a worktree for <branch>
  wt --remove-all      Remove all other linked worktrees (terminal only)
  wt --help            Show this help
  wt completion zsh    Print zsh completion script
  wt completion bash   Print bash completion script

WORKTREE PATHS
  Worktrees are created as siblings to the repo in a <repo-name>.worktrees/ directory.
  Example: wt feat/PROJ-123 in my-app/ → ../my-app.worktrees/PROJ-123

BULK REMOVAL
  --remove-all previews every target with a red warning, then asks once to remove
  the batch. Dirty targets (including untracked/ignored files) require one more
  data-loss approval. No / Escape / EOF / Ctrl+C at either stage deletes nothing.
  The original repository, current worktree and branches are preserved.
  The shell stays in its directory. Piped approval and bypass flags are rejected.
  Removal is not atomic: errors stop the batch but do not undo earlier removals.

SHELL INTEGRATION
  The installer writes a shell function that automatically cd's you into
  the new worktree after wt <branch> succeeds.
  Run: ./install.sh
`);
}
