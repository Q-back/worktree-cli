# Design

## Context

See `proposal.md` for motivation and `specs/bulk-worktree-removal/spec.md` for the behavior contract.

`src/git/worktrees.ts` already lists worktrees, identifies the original repository with `isMain`, and removes one worktree. `src/tui/RemovePicker.tsx` attempts removal before discovering dirty state; that ordering cannot be reused for a batch because declining the later warning must leave even clean targets untouched.

`findRepoRoot()` resolves the original repository, not the invocation's current linked worktree. The CLI lazy-loads OpenTUI only for interactive mode. The shell wrapper reads navigation from `--output-file`; deletion must leave that file empty and keep stdout free of human-facing output.

## Goals / Non-Goals

**Goals:** Share target planning and safe execution across both entry points; keep terminal rendering and input in their respective adapters; inspect without deleting; finish confirmation before executing.

**Non-Goals:** Branch cleanup, removing the current/original worktree, changing single-item removal, adding global Go-tab shortcuts, confirmation bypasses, automatic unlocking, rollback, and unrelated CLI or worktree-parser refactors.

## Decisions

### Separate original-repository identity from current-worktree identity

Keep `findRepoRoot()` unchanged for existing consumers. Resolve `git rev-parse --show-toplevel` from the invocation's actual cwd and canonicalize filesystem paths for comparison with registered worktrees. Fail closed if the current worktree cannot be matched safely. Select every non-main, non-current worktree from Git's registry, independently of the sibling-container convention, branch names, or TUI filters.

Alternative: branch comparison or reusing the original-repository root. Both can select the active linked worktree, especially with detached HEAD or invocation from nested directories.

### Share a read-only plan and a guarded execution step

Add a small Git-layer batch helper containing target selection, inspection, and execution. Record original/current identities, target paths, and which targets need data-loss authorization. Use Git status with all untracked files and ignored entries included; ignored files can otherwise disappear without Git considering the checkout dirty. Preserve the existing `DIRTY` sentinel contract for single-item removal.

A plan must cover every target before prompting. Inspection errors, missing/uninspectable registrations, or locked worktrees block the batch without deletion. Do not use removal attempts as dirty-state probes and do not bypass locks with repeated force flags.

Alternative: loop over `remove()` and handle errors as they arise. Rejected because clean targets could be gone before the user rejects discarding dirty targets.

### Confirm in two aggregate stages before executing

```text
plan all targets
  --> no targets: report and finish
  --> preview every path + red removal warning
  --> confirm whole batch
        no / Escape / EOF / interrupt --> cancel, no deletion
        yes --> dirty targets?
                  no --> revalidate --> execute
                  yes --> list all dirty paths + red data-loss warning
                            --> confirm discarding data across all dirty targets
                                  no / Escape / EOF / interrupt --> cancel
                                  yes --> revalidate --> execute
```

Keep the displayed plan fixed during confirmation. Ignore duplicate triggers and navigation/filter changes while confirmations or deletion are active. Cancellation clears the plan and all authorization; in the TUI it returns to the picker without proceeding to another target.

Alternative: ask once per worktree or remove clean targets when dirty authorization is declined. Both contradict the agreed batch behavior.

### Revalidate, then remove sequentially with bounded force

Immediately before the first deletion, re-list and inspect the complete plan. Reject changed target membership, identity, locks, or newly discovered data loss outside the confirmed dirty-target set; report that a fresh preview is required rather than adding another prompt. Reject execution if required data-loss approval is absent.

Remove sequentially, using normal removal for clean targets and a single `--force` only for approved dirty targets. Stop on the first error and identify completed, failed, and unattempted paths. Do not retry failures with stronger force or restart confirmation after deletion has begun.

Alternative: parallel deletion makes failure reporting and stopping less predictable. Filesystem rollback is out of scope; Git cannot restore discarded files.

### Keep CLI prompts outside the navigation channel

Route `--remove-all` before the positional-branch fast path, reject incompatible extra arguments, and do not import OpenTUI. Use Bun/Node terminal primitives rather than a new dependency. Require interactive stdin for a nonempty batch; do not accept piped approval or add `--yes`/force bypass flags. Render preview, warnings, prompts, and results to stderr, with red warnings on color-capable terminals and explicit warning text everywhere.

Only explicit `y`/`Y` accepts a prompt; `n`, Escape, EOF, or interruption cancels. Other input must not advance the flow. Deliberate cancellation and an empty batch are successful no-ops; inspection, terminal, and removal errors return nonzero. Never write a navigation path. Add help, Bash/Zsh completion, and README usage together with the CLI entry point.

### Add a dedicated Remove-mode shortcut

Handle `key.ctrl && key.name === "x"` in Remove mode and advertise `ctrl+x remove all others` in its footer. Plain `x` remains filter text; Enter retains existing single-item removal. Pass invocation worktree identity through the TUI boundary rather than deriving it from the branch selected in Go mode. Render the fixed batch preview and warning states with the existing error color, making every path accessible when a batch exceeds the viewport.

Alternative: `Ctrl+D` was rejected because it suggests exiting. A selectable bulk-action row was replaced by the requested dedicated key. A global shortcut in Go mode is not needed for this change.

## Risks / Trade-offs

- Concurrent filesystem changes after final validation remain possible --> keep the validation-to-removal interval short, retain Git's normal dirty checks for clean targets, and document that this is not an atomic filesystem transaction.
- An execution error can leave a partially removed batch --> stop immediately, report actual outcomes, and never promise rollback. Cancellation before execution still guarantees no deletion.
- Ignored files such as build output trigger data-loss approval --> this is intentionally conservative because their deletion is otherwise silent.
- Terminal/TUI key handling can accidentally process confirmation input as filter text or repeat deletion --> suspend filtering, guard pending operations, and test input routing and double-trigger behavior.

## Migration Plan

No data migration or installer changes are needed. Ship shared helpers first, then the CLI and TUI entry points in independently green commits with their tests and documentation. Rolling back removes the new entry points and helpers; it cannot recover worktrees or files already deleted by a user-approved operation.
