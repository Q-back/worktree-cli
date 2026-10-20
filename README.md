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
wt --remove-all       Remove all other linked worktrees (terminal only)
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

### Remove all other worktrees

```bash
wt --remove-all
```

Targets every registered linked worktree, including paths outside the usual
container. The original repository, invocation worktree, and all branches are
preserved. The shell stays in its current directory.

1. Preview every target and a **red removal warning**. Press `y` to approve the batch.
2. If any target has uncommitted changes, untracked files, or ignored files, see
   all affected paths and a **red data-loss warning**. Press `y` once more to approve
   discarding data across the entire dirty batch.

`n`, Escape, end of input (`Ctrl+D`), or interruption (`Ctrl+C`) at either stage
cancels the **whole batch**, including clean targets. Nothing is deleted before
all required approvals. Only `y`/`Y` accepts; other input does not approve.
Interactive terminal input is required: piped approvals and `--yes`/force bypasses
are not supported. Warnings remain explicit text when color is unavailable.

Missing, uninspectable, locked, or unsafe nested targets block removal. A changed
target set or newly dirty target requires a fresh preview. Execution is sequential,
not an atomic filesystem transaction: an error stops further removal and reports
completed, failed, and unattempted paths. **Earlier removals are not rolled back.**

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

The footer advertises **`ctrl+x remove all others`**. This shortcut starts the
same safe batch flow as `wt --remove-all`, covering **all eligible registered
worktrees regardless of the current filter**. It preserves the invocation
worktree, original repository, and branches. Preview paths with `↑↓`, `PgUp` /
`PgDn`, or `Home` / `End`; long paths wrap and the list scrolls. Removal and
data-loss warnings are red, with one confirmation per required stage. `n`, Escape,
or interruption cancels before deletion and clears approvals. Filtering and mode
changes pause during the batch flow. Plain `x` still filters; Enter still removes
one item. The shortcut is not active in Go mode.

## Requirements

- [Bun](https://bun.sh) ≥ 1.0
- git with `worktree list --porcelain -z` support

## Development

```bash
bun run dev        # watch mode
bun test           # run tests
bun run typecheck  # tsc --noEmit
bun run check      # biome format + lint
```

`bun install` configures a pre-commit hook that runs check, typecheck, and tests.
Tests create throwaway git repos in `os.tmpdir()` — no mocking of git.
Terminal-backed CLI tests also require Python 3 (standard-library PTY support),
Bash, and Zsh on a POSIX system.
