# Spec Delta

## Purpose

Let users clean up other linked Git worktrees in one operation while protecting their current workspace and explicitly authorizing any loss of uncommitted work.

## ADDED Requirements

### Requirement: Safe batch target selection

The system SHALL target all registered linked worktrees except the invocation's current worktree. It SHALL preserve the original repository and all Git branches. Selection SHALL use worktree identity by filesystem path, not branch name or the TUI filter.

#### Scenario: Invocation from the original repository
- **WHEN** bulk removal starts from the original repository or one of its subdirectories
- **THEN** every registered linked worktree is targeted, including worktrees outside the usual worktree container
- **AND** the original repository and all branches are preserved

#### Scenario: Invocation from a linked worktree
- **WHEN** bulk removal starts from a linked worktree, including a subdirectory, a symlinked path, or a detached HEAD checkout
- **THEN** the current linked worktree and original repository are excluded
- **AND** all other registered linked worktrees are targeted

#### Scenario: No eligible worktrees
- **WHEN** no linked worktrees remain after exclusions
- **THEN** the system reports that there are no other worktrees to remove
- **AND** it neither prompts nor deletes anything

### Requirement: CLI and TUI entry points

The system SHALL expose bulk removal through `wt --remove-all` and `Ctrl+X` in the TUI's Remove tab. The TUI SHALL advertise the shortcut in its footer. Existing single-worktree removal, filtering, creation, and navigation SHALL retain their behavior.

#### Scenario: CLI invocation
- **WHEN** the user runs `wt --remove-all`
- **THEN** the batch flow starts instead of interpreting the flag as a branch name
- **AND** the command is described in help and offered by Bash and Zsh completion

#### Scenario: Shortcut with a filtered list
- **WHEN** the user presses `Ctrl+X` in Remove mode with a filter applied
- **THEN** the batch flow includes all eligible worktrees, not only visible matches
- **AND** plain `x` continues to act as filter input

#### Scenario: Existing removal remains available
- **WHEN** the user presses Enter on a worktree in Remove mode
- **THEN** the existing single-worktree removal flow runs instead of the batch flow

### Requirement: Complete preview and batch removal confirmation

Before deleting anything, the system SHALL inspect every target, show all target paths and a red removal warning, and request one confirmation covering the whole batch. The preview SHALL explain that the original repository, current worktree, and branches are preserved.

#### Scenario: Entire batch is clean
- **WHEN** every target is clean and the user accepts the batch removal confirmation
- **THEN** the system removes all targets without further confirmation

#### Scenario: Several targets are dirty
- **WHEN** inspection finds uncommitted changes or untracked files in multiple targets
- **THEN** the first confirmation still covers the entire batch once
- **AND** no worktree is deleted before the required data-loss confirmation

### Requirement: Aggregate data-loss authorization

If any target contains uncommitted changes or untracked files, including ignored files that removal would delete, the system SHALL show all affected paths and a red warning explicitly describing that loss. It SHALL request exactly one additional confirmation authorizing the loss across all affected targets, never one prompt per worktree.

#### Scenario: Accept discarding data across dirty worktrees
- **WHEN** the user accepts the batch removal confirmation and then the aggregate data-loss confirmation
- **THEN** all targets are removed, including all dirty targets
- **AND** no further per-worktree confirmation appears

#### Scenario: Untracked-only or ignored-only worktree
- **WHEN** a target has no tracked changes but contains untracked or ignored files that would be deleted
- **THEN** it is included in the aggregate data-loss warning and requires the additional confirmation

### Requirement: Cancellation precedes every deletion

A negative response, Escape, end of input, or interruption at either confirmation SHALL stop the entire batch flow before any deletion. Declining data loss SHALL NOT remove even the clean targets. Cancellation SHALL NOT retain authorization for a later attempt.

#### Scenario: Decline initial confirmation
- **WHEN** the user declines the first confirmation or presses Escape
- **THEN** every target and its contents remain unchanged
- **AND** no data-loss confirmation appears

#### Scenario: Decline discarding dirty work
- **WHEN** a mixed clean-and-dirty batch has passed the first confirmation but the user declines the second
- **THEN** neither clean nor dirty worktrees are removed

#### Scenario: Interrupted confirmation
- **WHEN** input ends or the flow is interrupted while either confirmation is pending
- **THEN** no target is deleted

### Requirement: Fail-safe inspection and execution

The system SHALL refuse deletion if target identity or required inspection cannot be established safely. Before starting deletion, it SHALL reject a changed target set or newly discovered data loss not covered by the preview and confirmations. Removal errors SHALL stop execution and report any completed removals without claiming rollback.

#### Scenario: Unsafe preflight
- **WHEN** the current worktree cannot be identified, a target cannot be inspected, or a target is locked
- **THEN** the system reports the blocking condition and removes nothing

#### Scenario: Changes appear during confirmation
- **WHEN** a previously clean target becomes dirty before execution begins
- **THEN** the system cancels the batch without deletion and asks the user to restart with a fresh preview
- **AND** it does not add a third confirmation or silently discard the new data

#### Scenario: Removal fails after another target was removed
- **WHEN** a removal fails after at least one earlier target was removed
- **THEN** remaining removals stop and the error identifies the failed and completed targets
- **AND** the system does not claim that the completed removals were undone

### Requirement: Safe shell and terminal behavior

Bulk removal SHALL leave the invoking shell in its existing directory and SHALL NOT publish a navigation path or human-facing text as navigation output. CLI confirmations SHALL require interactive terminal input and SHALL offer no confirmation-bypass option.

#### Scenario: Successful CLI cleanup
- **WHEN** the user completes the CLI batch flow through the shell wrapper
- **THEN** the shell remains in the original invocation directory
- **AND** previews, prompts, and results do not appear in stdout or the navigation output file

#### Scenario: Non-interactive invocation
- **WHEN** targets exist but interactive terminal input is unavailable
- **THEN** the command exits with an error and removes nothing
- **AND** piped affirmative responses cannot bypass the terminal requirement
