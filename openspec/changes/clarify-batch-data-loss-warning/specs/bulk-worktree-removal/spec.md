# Spec Delta

## ADDED Requirements

### Requirement: Explicit affected-worktree scope in the TUI

The data-loss screen SHALL label and count affected worktrees, list only their full paths, and state that every listed worktree triggers the warning. It SHALL explain that omitted clean targets will also be removed if confirmed.

#### Scenario: Mixed batch
- **WHEN** a batch contains one clean and two affected worktrees
- **THEN** the screen lists only the two affected paths, shows a count of two, and explains the clean target's omission without implying it is spared

### Requirement: Per-worktree data-loss reasons in the TUI

Each path SHALL show all applicable reasons once, in order: tracked changes, untracked files, ignored files. Ignored-only targets SHALL say "ignored files only". Labels SHALL NOT rely on color.

#### Scenario: Mixed reasons and ignored-only data
- **WHEN** one target has all three categories and another has only ignored files
- **THEN** the first shows all three reasons in order and the second shows "ignored files only"

### Requirement: Accessible affected-worktree details without changing approval scope

Full paths and reasons SHALL remain accessible through wrapping and keyboard scrolling, with the red warning, count, explanation, and controls readable. Existing confirmation, cancellation, revalidation, deletion, CLI, and single-item behavior SHALL remain unchanged.

#### Scenario: Small terminal
- **WHEN** affected entries exceed the viewport
- **THEN** every path and its reasons can be reached by keyboard scrolling while the warning scope and controls remain readable
