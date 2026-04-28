Right now the new worktree is being created in `.worrktrees/` directory.
Let's change approach to `Suffix Sibling` pattern:
```
/Projects/
├── my-app/                (Main development / master)
└── my-app.worktrees/      (A container for all worktrees)
    ├── feature-login/
    ├── hotfix-css/
    └── experiment-api/
```

# Definition of done
Tests are available and confirm this behavior.
Tests pass.

# Test and play
(This paragraph is for operator, not for agent)
You can use `wt` and it works as expected
