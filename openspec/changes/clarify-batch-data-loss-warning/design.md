# Design

## Screen

Keep the existing red warning and confirmation. Add:

```text
Affected worktrees (2): every worktree below has data to discard.
/full/path/a  [tracked changes, untracked files]
/full/path/b  [ignored files only]
Clean targets are hidden but will also be removed if confirmed.
```

## How

1. `src/git/batchRemoval.ts`: Collect unique, ordered reason categories from the existing inspection; keep `dirty` consistent.
2. `src/tui/BatchRemoval.tsx`: Render the affected count, full paths, and plain-text reasons. Keep wrapping and keyboard scrolling.
3. Leave the initial preview, preservation message, approvals, cancellation, revalidation, and deletion behavior unchanged. No extra Git inspection or per-file listing.
