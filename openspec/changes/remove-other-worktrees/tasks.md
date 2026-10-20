# Tasks

Complete these ordered commit groups one at a time. Start each behavior with failing tests, then implement it. Each group must leave the repository working after all preceding groups. Do not ship a later entry point without its own tests and user documentation.

At each green boundary, inspect the actual diff and added-line count before committing; stop and hand off if the session-size threshold is reached. After each implementation commit, load `agent-code-review`, use a fresh read-only reviewer for shared behavior or multiple consumers, and include preserved consumers and replaced behavior. Commit each review-fix round separately, rerun checks, and re-review before completing the group.

## 1. Commit: Add safe batch planning and execution

- [x] 1.1 Add current-worktree resolution and batch selection without changing `findRepoRoot()` semantics; verify with real Git tests from original/linked roots, nested directories, symlinked paths, detached HEAD, and worktrees outside the usual container, plus empty-batch and branch-preservation assertions.
- [x] 1.2 Add complete, non-destructive preflight inspection of tracked changes, all untracked files, ignored files, missing/uninspectable targets, and locks; verify tests leave every target intact and correctly identify all data-loss targets or block the batch.
- [x] 1.3 Add guarded sequential execution, requiring dirty-batch authorization and revalidating the full plan before deletion; verify real Git tests for clean/dirty success, absent authorization, changed target membership, newly dirty targets, and stop-on-error reporting of completed/failed/unattempted paths.
- [x] 1.4 Document the plan/execute safety contract alongside the helper and preserve existing `remove()`/`DIRTY` and original-repository resolution behavior; verify existing Git and CLI creation tests pass unchanged.
- [x] 1.5 Run `bun test`, `bun run typecheck`, and `bunx biome check src tests`; inspect the scoped diff and added-line count, commit this group, and complete the review/fix/re-review cycle described above with passing checks.

## 2. Commit: Expose confirmed bulk removal in the CLI

- [ ] 2.1 Route `wt --remove-all` before branch creation, reject incompatible extra arguments, and retain lazy TUI loading; verify CLI tests cover correct routing, invalid combinations, existing help/completion/create behavior, and no native terminal output on this path.
- [ ] 2.2 Add terminal-only batch preview, red warnings, one removal confirmation, and at most one aggregate data-loss confirmation; verify terminal-backed integration tests using real Git worktrees cover clean success and approval across multiple dirty targets, including untracked-only and ignored-only targets.
- [ ] 2.3 Make negative responses, Escape, EOF, and interruption stop the entire flow; verify cancellation at either stage leaves clean and dirty worktrees and their contents intact, and piped approvals/nonterminal input cannot authorize deletion.
- [ ] 2.4 Document the CLI command, preservation rules, red warnings, two-stage cancellation, and partial-error limitation in help/README, and add Bash/Zsh completion; verify generated help/completions expose the flag, and bulk-removal shell tests keep stdout/navigation output empty and preserve cwd on success, cancellation, and errors.
- [ ] 2.5 Run `bun test`, `bun run typecheck`, and `bunx biome check src tests`; inspect the scoped diff and added-line count, commit this group, and complete its review/fix/re-review cycle with passing checks.

## 3. Commit: Add the Remove-mode bulk shortcut

- [ ] 3.1 Carry invocation worktree identity into Remove mode and bind `Ctrl+X` to the shared batch plan regardless of the current filter; verify keyboard/component tests cover filtered lists, plain `x`, unchanged Enter removal, no global Go-mode trigger, and current-worktree protection.
- [ ] 3.2 Add accessible target previews and red removal/data-loss warning states, with one confirmation per stage and no deletion before both required approvals; verify rendered output and state transitions for clean and multiple-dirty-target batches, cancellation at either stage, empty batches, and inspection errors.
- [ ] 3.3 Suspend filtering and duplicate actions while the batch flow is active, reset authorization on cancellation, and report removal failures accurately; verify input-routing/re-entry tests and at least one TUI-to-real-Git integration path demonstrate correct removal and no accidental repeated execution.
- [ ] 3.4 Update the Remove footer and README with `ctrl+x remove all others` and its batch-wide scope; verify the hint is rendered and manually smoke-test the shortcut, long target previews, warnings, cancellation, and unchanged Go/Remove navigation.
- [ ] 3.5 Run `bun test`, `bun run typecheck`, `bunx biome check src tests`, and `openspec validate remove-other-worktrees --strict`; inspect the scoped diff and added-line count, commit this group, and complete its review/fix/re-review cycle with passing checks.
