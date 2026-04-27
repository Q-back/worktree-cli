# wt — git worktree manager

Frictionless git worktree creation and navigation from the terminal.

## Install

```bash
git clone <this-repo>
cd worktree-cli
bun install
./install.sh
exec $SHELL
```

`install.sh` symlinks `wt-bin` into `~/.local/bin` and injects a `wt()` shell
function into `~/.zshrc` / `~/.bashrc` that automatically `cd`s you into the
new worktree after creation.

## Usage

```
wt                    Open interactive TUI (create / switch / remove)
wt <branch>           Switch to or create a worktree for <branch>
wt --help             Show help
wt completion zsh     Print zsh completion script
wt completion bash    Print bash completion script
```

### Non-interactive fast-path

```bash
wt feat/PROJ-123-auth
```

1. If a worktree already exists for that branch → prints its path (shell `cd`s).
2. If the branch exists locally → creates `.worktrees/PROJ-123-auth`, checks it out.
3. Otherwise → creates the branch off `merge-base(HEAD, main|master)`, makes the worktree.

Worktrees live at `.worktrees/<last-segment-of-branch>` inside the repo root.

### TUI

```
┌─ wt ─────────────────────────────────────────────┐
│  [g] Go   [r] Remove                             │
├──────────────────────────────────────────────────┤
│ Branch:  [jpec_____________________]             │
├──────────────────────────────────────────────────┤
│ ▸ jpeczke/auth-refactor  .worktrees/auth-…  ✓    │
│   jpeczke/old-feature                            │
│   jpec  (will create)                            │
└──────────────────────────────────────────────────┘
  ↑↓ move   ↵ go   esc cancel
```

**Go mode** (`g`) — unified fuzzy picker across existing worktrees, local
branches, and a free-text "create new" fallback. Press Enter to switch or
create.

**Remove mode** (`r`) — fuzzy picker over existing worktrees. Enter prompts
`y/n` confirmation; dirty worktrees get a second force-remove prompt.

## Requirements

- [Bun](https://bun.sh) ≥ 1.0
- git ≥ 2.5

## Development

```bash
bun run dev        # watch mode
bun test           # run tests
bun run typecheck  # tsc --noEmit
bun run check      # biome format + lint
```

Tests create throwaway git repos in `os.tmpdir()` — no mocking of git.
