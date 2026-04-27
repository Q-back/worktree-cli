# Worktree directory convention
- Use **subdirectory** flow: worktrees live inside the repo under `.worktrees/`
- Worktree directory name = everything **after the last `/`** in the branch name
  - e.g. `feat/PROJ-123-auth` → `.worktrees/PROJ-123-auth`
  - e.g. `main` → `.worktrees/main`

# Definition of done
Using opentui create a tui for creating git worktree.
It should be intuitive and fast to run with keyboard.
By default it should use `master` (or `merge base` if that's a thing) as the base branch
and ask user to provide the custom branch name and the confirm worktree directory path.
There should be handy default for worktree directory path.

# Tech stack requirements
- opentui
- formatter
- linter
- strict typing

