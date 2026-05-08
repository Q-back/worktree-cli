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
2. If the branch exists locally → creates `../my-app.worktrees/PROJ-123-auth`, checks it out.
3. Otherwise → creates the branch off `merge-base(HEAD, main|master)`, makes the worktree.

Worktrees live **beside** the repo in a `<repo-name>.worktrees/` sibling directory:

```
/Projects/
├── my-app/                 ← repo
└── my-app.worktrees/       ← all worktrees
    ├── PROJ-123-auth/
    └── hotfix-css/
```

### TUI

```
┌──────────────────────────────────────────────────┐
│  ▸ Go      Remove                      ⇥ switch  │
│──────────────────────────────────────────────────│
│  › [type to filter or create…         ]          │
│                                                  │
│  ▸ ◆ jpeczke/auth-refactor   /../worktrees/…     │
│    ● hotfix-css               /../worktrees/…    │
│    ○ feat/other-branch                           │
│    + new-branch-name          (will create)      │
│──────────────────────────────────────────────────│
│  ◆ current   ● worktree   ○ branch   + create   │
│  ↑↓ navigate  │  ↵ go  │  ⇥ remove mode  │  esc │
└──────────────────────────────────────────────────┘
```

The TUI opens in **Go mode** by default. Press `Tab` to toggle between modes.

**Go mode** — unified fuzzy picker across existing worktrees, local branches,
and a free-text "create new" fallback. Press Enter to switch or create.

Item legend:
- `◆` current branch
- `●` existing worktree
- `○` local branch (no worktree yet)
- `+` free-text input (will create new branch + worktree)

**Remove mode** — fuzzy picker over existing worktrees. Enter prompts `y/n`
confirmation inline; dirty worktrees get a second force-remove prompt.

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
