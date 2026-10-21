# Proposal

## Why

The data-loss screen does not clearly identify which worktrees trigger its warning or why.

## What Changes

- Label and count affected worktrees.
- Show each full path with its reasons: tracked changes, untracked files, or ignored files.
- Say "ignored files only" when applicable.
- Explain that clean targets are hidden but still removed if confirmed.
- Keep deletion rules, CLI, and single-worktree removal unchanged.

## Capabilities

### Modified Capabilities

- `bulk-worktree-removal`: Clear affected-worktree labels and reasons.

## Impact

`src/git/batchRemoval.ts`, `src/tui/BatchRemoval.tsx`, their tests, and `README.md`.
