# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Non-obvious architecture decisions

- **Why the binary only prints a path**: the shell `wt()` wrapper function (injected by
  `install.sh`) `cd`s into whatever directory the binary prints. All exit paths in
  `createNonInteractive` and the TUI must print an absolute path — never anything else on stdout.

- **Dirty worktree sentinel**: `RemovePicker` detects dirty worktrees by checking if
  `git worktree remove` stderr contains `"DIRTY"` — this literal string is the trigger for the
  force-remove confirmation step.

- **Worktree base branch**: new branches are created off `merge-base(HEAD, main|master)`, not
  off the default branch tip directly. This avoids pulling in unrelated upstream commits when
  HEAD has diverged.

- **`pathFor` convention**: worktree paths use the suffix-sibling pattern —
  `<repoParent>/<repoName>.worktrees/<last-segment-of-branch>`. The container sits next to
  the repo directory, not inside it. Changing this breaks the idempotency check in
  `createNonInteractive` and the `isRegisteredWorktree` lookup.

## Linting

`noExplicitAny` is set to `error` in biome.json — no `any` types allowed.
