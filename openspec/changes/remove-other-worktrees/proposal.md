# Proposal

## Why

Cleaning up several worktrees currently requires repeating the single-worktree removal flow. Users need one batch action that keeps their current worktree safe and makes any loss of uncommitted work explicit before deletion starts.

## What Changes

- Add `wt --remove-all` and a dedicated `Ctrl+X` shortcut in the TUI's Remove tab to remove all linked worktrees except the current one.
- When invoked from the original repository, target all linked worktrees; always preserve the original repository and Git branches.
- Preview the complete target list with a red removal warning and ask for one batch confirmation.
- If any targets contain uncommitted changes or untracked files, show the affected paths and one additional red data-loss warning, with a single confirmation covering every dirty target.
- Cancel the entire operation on either negative confirmation, Escape, or interrupted input. Delete nothing until all required confirmations pass.
- Preserve the existing single-worktree removal and create/switch flows.

## Capabilities

### New Capabilities

- `bulk-worktree-removal`: Safely remove other linked worktrees through CLI and TUI entry points, with path-based protection and batch-level confirmation before destructive actions.

### Modified Capabilities

None. The project has no existing capability specs.

## Impact

- Git helpers: resolve the invocation's current worktree independently of the original repository; plan, inspect, and execute batch removals.
- CLI: add flag routing, terminal confirmations, help, and Bash/Zsh completion support without loading OpenTUI for this command.
- TUI: add the shortcut, footer hint, target preview, and batch confirmation states to Remove mode.
- Tests and README: cover real Git removal, cancellation, dirty batches, current-worktree protection, and unchanged shell navigation behavior.
- No new runtime dependencies, branch deletion, installer migration, or non-interactive confirmation bypass.
