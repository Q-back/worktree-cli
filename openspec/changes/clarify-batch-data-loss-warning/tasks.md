# Tasks

## 1. Commit: Clarify the data-loss screen

Tests first; ship implementation, tests, and docs together.

- [x] 1.1 Expose reason categories from existing inspection; verify with real-Git tests for clean, staged/unstaged, untracked, ignored-only, mixed, and renamed/unusual filenames.
- [x] 1.2 Render the affected count, paths, reasons, and clean-target explanation; verify real-Git TUI tests cover all-dirty/mixed batches, approval/cancellation, and small-window scrolling.
- [x] 1.3 Update `README.md`; check its description against the rendered UI.
- [ ] 1.4 Add test-only Git environment cleanup before fixtures and a regression test (approved unblock for a pre-existing hook-environment failure). Run `bun test`, `bun run typecheck`, `bunx biome check src tests`, and `openspec validate clarify-batch-data-loss-warning --strict`. Inspect the diff/added-line count, commit, and follow repository review rules, including unchanged consumers.

## Workflow follow-up

- Archive or sync the shipped `remove-other-worktrees` baseline before archiving this change; leave its artifacts unchanged here.
