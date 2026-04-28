export function printHelp(): void {
  process.stdout.write(`wt — git worktree manager

USAGE
  wt                   Open interactive TUI (create / switch / remove)
  wt <branch>          Switch to or create a worktree for <branch>
  wt --help            Show this help
  wt completion zsh    Print zsh completion script
  wt completion bash   Print bash completion script

WORKTREE PATHS
  Worktrees are created as siblings to the repo in a <repo-name>.worktrees/ directory.
  Example: wt feat/PROJ-123 in my-app/ → ../my-app.worktrees/PROJ-123

SHELL INTEGRATION
  The installer writes a shell function that automatically cd's you into
  the new worktree after wt <branch> succeeds.
  Run: ./install.sh
`);
}
