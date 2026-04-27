# `wt` — git-worktree TUI

## Context

The repo is empty. We are building a personal CLI tool, `wt`, that makes
git worktree creation and navigation frictionless from the terminal. The
core problem: `git worktree add` is verbose, the directory-naming
convention is manual, and switching between worktrees requires
remembering paths. The intended outcome is a single command, `wt`,
that:

1. Opens an opentui-based TUI for creating / removing / switching
   worktrees when invoked bare.
2. Acts as a non-interactive fast-path: `wt jpeczke/new-branch` creates
   the worktree (or switches to it if it already exists) with sensible
   defaults — and the parent shell ends up `cd`'ed into it.

Convention (from `work_notes/1_prompt.md`): worktrees live under
`.worktrees/<last-segment-of-branch>` inside the repo.

## Stack & tooling

- **Runtime:** Bun (opentui is Bun-first as of April 2026).
- **Language:** TypeScript with `strict: true`.
- **TUI:** `@opentui/core` + `@opentui/react` (React-style component model).
- **Fuzzy matching:** `fuse.js` (in-process, no external `fzf` dep).
- **Formatter + linter:** Biome (single tool for both, replaces
  Prettier+ESLint).
- **Tests:** `bun test` (built-in, no extra deps).
- **Install method:** `install.sh` writes a 3-line bash wrapper to
  `~/.local/bin/wt` that execs `bun run <repo>/src/index.ts "$@"`, plus
  a `wt()` **shell function** appended to `~/.zshrc` (and `~/.bashrc`)
  that captures the binary's stdout and `cd`s the parent shell if it
  looks like a path.

## How `cd` works (the constraint)

A child process cannot change its parent shell's CWD. Standard
workaround (used by zoxide, nvm, autoenv): the install drops a shell
function — not just a binary — that runs the binary and runs `cd`
itself in the parent shell. Concretely:

```bash
# appended to ~/.zshrc by install.sh
wt() {
  local out
  out="$(command wt-bin "$@")" || return $?
  if [[ -d "$out" ]]; then
    cd "$out"
  else
    [[ -n "$out" ]] && printf '%s\n' "$out"
  fi
}
```

The bun-backed binary is installed as **`wt-bin`** in `~/.local/bin`;
the function `wt` is what the user actually invokes. The binary always
prints either an absolute path (when the action implies a `cd`) or
human-readable status (when it doesn't, e.g. `--help`, `rm`).

## Command surface

| Invocation                 | Behavior                                              |
| -------------------------- | ----------------------------------------------------- |
| `wt`                       | Opens TUI (create / switch / remove tabs).            |
| `wt <branch>`              | If worktree exists → print its path (→ shell cd's). If branch exists locally → create worktree from it. Otherwise → create branch + worktree from `merge-base(HEAD, master||main)`. |
| `wt --help`                | Usage. Stdout is text, not a path — function won't cd.|
| `wt completion zsh\|bash`  | Prints completion script. (`source <(wt completion zsh)`.) |

Tab completion lists existing branches and existing worktree names.

## TUI layout (single screen, two modes)

```
┌─ wt ─────────────────────────────────────────────┐
│  [g] Go   [r] Remove                             │  ← mode tabs
├──────────────────────────────────────────────────┤
│ < section content for the active mode >          │
├──────────────────────────────────────────────────┤
│ ↑↓ move   ⇥ next field   ↵ confirm   esc cancel  │  ← key hints
└──────────────────────────────────────────────────┘
```

**Go mode** (default — unified create + switch):

```
┌──────────────────────────────────────────────────┐
│ Branch:  [jpec_____________________]             │  ← fuzzy input
├──────────────────────────────────────────────────┤
│ ▸ jpeczke/auth-refactor    .worktrees/auth-…  ✓  │  ← existing worktrees
│   jpeczke/old-feature                            │  ← existing branch (no wt)
│   ── new branch from merge-base(HEAD, master) ── │
│   jpec  (will create)                            │  ← free-text fallback
└──────────────────────────────────────────────────┘
  ↵ go    ⌥↵ pick base    esc
```

Single input drives everything. As you type, Fuse.js ranks results
across three buckets:

1. **Existing worktrees** — Enter prints path → shell `cd`s.
2. **Existing branches without a worktree** — Enter creates
   `.worktrees/<lastSegment>`, checks out the branch in it, prints
   path.
3. **Free-text "create new"** — always shown when the typed text isn't
   an exact match. Enter creates the branch off
   `merge-base(HEAD, master||main)`, makes the worktree, prints path.

`Alt+Enter` (or a key like `b`) on the free-text row opens a fuzzy
picker over local + remote branches to override the base before
creating.

**Remove mode:**

- Fuzzy picker over existing worktrees. Enter prompts a one-key
  confirmation (`y`/`n`), then runs `git worktree remove`
  (with `--force` if dirty, after a second confirm).

## File layout

```
worktree-cli/
├── package.json
├── tsconfig.json              # strict: true, jsx: react-jsx, jsxImportSource: @opentui/react
├── biome.json                 # formatter + linter config
├── bunfig.toml
├── .gitignore                 # node_modules, dist, .DS_Store, .worktrees, *.log
├── README.md                  # install + usage
├── install.sh                 # symlinks + zshrc/bashrc shell-function injection
├── completions/
│   ├── wt.zsh
│   └── wt.bash
├── src/
│   ├── index.tsx              # CLI dispatch: parse argv → tui | create | switch | rm | completion
│   ├── git/
│   │   ├── repo.ts            # findRepoRoot, currentBranch, defaultBaseBranch (master||main)
│   │   ├── branches.ts        # listLocal, listRemote, exists, mergeBase
│   │   └── worktrees.ts       # list, add, remove, pathFor (branch → .worktrees/<segment>)
│   ├── cli/
│   │   ├── createNonInteractive.ts  # `wt <branch>` fast path
│   │   ├── completion.ts      # emits zsh/bash completion scripts
│   │   └── help.ts
│   ├── tui/
│   │   ├── App.tsx            # mode tabs (Go / Remove) + routing
│   │   ├── GoPicker.tsx       # unified create + switch fuzzy picker
│   │   ├── RemovePicker.tsx
│   │   ├── BasePicker.tsx     # Alt+Enter overlay for picking a base branch
│   │   └── hooks/
│   │       └── useFuzzy.ts    # wraps fuse.js
│   └── lib/
│       └── exec.ts            # thin Bun.spawn wrapper, returns {stdout, stderr, code}
└── tests/
    ├── git.worktrees.test.ts  # uses temp git repos
    ├── git.branches.test.ts
    └── cli.createNonInteractive.test.ts
```

## Behavior details

### `wt <branch>` non-interactive flow

1. `findRepoRoot()` — error if not in a git repo.
2. `pathFor(branch)` → `<repoRoot>/.worktrees/<lastSegment>`.
3. If that path is already a registered worktree → print path, exit 0.
4. Else if the branch exists locally → `git worktree add <path> <branch>`.
5. Else compute `base = mergeBase(HEAD, master||main)` (fallback to
   `master||main` itself if HEAD is on it) → `git worktree add -b
   <branch> <path> <base>`.
6. Print absolute path to stdout. Shell function cd's.

### `.gitignore`

```
node_modules/
dist/
.DS_Store
*.log
.worktrees/
```

(`.worktrees/` is included so users who run `wt` inside a project that
itself uses this tool don't accidentally commit worktree contents.)

### Shell-function install (install.sh sketch)

- Creates `~/.local/bin` if missing.
- Symlinks `<repo>/bin/wt-bin` (a tiny shim: `#!/usr/bin/env bash; exec bun run "$(dirname "$0")/../src/index.tsx" "$@"`) into `~/.local/bin/wt-bin`.
- Appends a marked block to `~/.zshrc` and `~/.bashrc` (idempotent — checks for marker comment) containing:
  - The `wt()` function shown above.
  - `source <(wt-bin completion zsh)` (or `bash`).
- Prints next-steps: `exec $SHELL` to pick up the function, then `wt --help`.

### Strict TS / Biome config

- `tsconfig.json`: `"strict": true`, `"noUncheckedIndexedAccess": true`,
  `"exactOptionalPropertyTypes": true`, `jsx: "react-jsx"`,
  `jsxImportSource: "@opentui/react"`, `moduleResolution: "bundler"`.
- `biome.json`: enable `recommended` rules, `formatter.indentStyle: "space"`,
  `formatter.indentWidth: 2`, `linter.rules.suspicious.noExplicitAny: "error"`.
- Scripts (package.json):
  - `bun run dev` → `bun run --watch src/index.tsx`
  - `bun run check` → `biome check --write .`
  - `bun run typecheck` → `tsc --noEmit`
  - `bun test`

## Critical files (will be created)

- `src/git/worktrees.ts` — the heart of the tool; thin shell wrapper around `git worktree`.
- `src/cli/createNonInteractive.ts` — the `wt <branch>` fast path.
- `src/tui/App.tsx` — entry into the TUI.
- `install.sh` — the user's install experience.

## Verification

1. **Lint + typecheck pass:** `bun run check && bun run typecheck`.
2. **Unit tests pass:** `bun test`. Tests use `Bun.spawn` to create
   throwaway git repos in `os.tmpdir()` and assert on real `git worktree
   list` output. No mocking of git.
3. **Non-interactive smoke test:** in a scratch repo with branches
   `master` and a few features, run `wt jpeczke/foo` and assert:
   - `.worktrees/foo` exists,
   - `git worktree list` includes it,
   - the branch `jpeczke/foo` was created off `merge-base(HEAD, master)`.
4. **Switch idempotency:** `wt jpeczke/foo` a second time prints the
   existing path, doesn't error.
5. **TUI smoke test (manual):** `bun run dev` in a repo with several
   branches; verify Tab cycling, fuzzy filter on Switch mode, and that
   Create on a branch with `/` in it produces the right
   `.worktrees/<lastSegment>` path.
6. **Install end-to-end:** `./install.sh` in a fresh shell, then
   `exec zsh`, then in a different repo `wt some/branch` — verify the
   shell `cd`'s into the new worktree (i.e. `pwd` reflects it).
7. **Tab completion:** type `wt fea<TAB>` in a repo with a `feature/x`
   branch — completes to `feature/x`. `wt <TAB>` lists worktrees.

## Out of scope (explicit YAGNI)

- Publishing to npm.
- `bun build --compile` standalone binary (the wrapper is faster to
  iterate; can add later).
- Cross-shell beyond bash + zsh (no fish/nu now).
- Pruning `.worktrees/` of stale entries — `git worktree prune` exists
  already; users can run it.
- Remote-branch checkout sugar — only local branches and new branches in
  v1; the merge-base lookup already needs a recent fetch to be
  meaningful.
