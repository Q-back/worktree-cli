const ZSH_COMPLETION = `#compdef wt

_wt() {
  local -a branches worktrees
  local repo_root
  repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || return

  # Existing worktrees (non-main)
  while IFS= read -r line; do
    [[ -n "$line" ]] && worktrees+=("$line")
  done < <(git worktree list --porcelain 2>/dev/null | awk '/^branch /{print substr($0,15)}' | tail -n +2)

  # All local branches
  while IFS= read -r line; do
    [[ -n "$line" ]] && branches+=("$line")
  done < <(git branch --format='%(refname:short)' 2>/dev/null)

  _arguments \\
    '1: :->arg1' \\
    '*: :->rest'

  case $state in
    arg1)
      local -a completions
      completions=(\${worktrees[@]} \${branches[@]})
      _describe 'branch or worktree' completions
      ;;
  esac
}

_wt "$@"
`;

const BASH_COMPLETION = `_wt_completions() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  local branches worktrees
  local repo_root
  repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || return

  worktrees=$(git worktree list --porcelain 2>/dev/null | awk '/^branch /{print substr($0,15)}' | tail -n +2)
  branches=$(git branch --format='%(refname:short)' 2>/dev/null)

  local completions="$worktrees $branches"
  COMPREPLY=($(compgen -W "$completions" -- "$cur"))
}

complete -F _wt_completions wt
`;

export function printCompletion(shell: string): void {
  if (shell === "zsh") {
    process.stdout.write(ZSH_COMPLETION);
  } else if (shell === "bash") {
    process.stdout.write(BASH_COMPLETION);
  } else {
    process.stderr.write(`Unknown shell: ${shell}. Use 'zsh' or 'bash'.\n`);
    process.exit(1);
  }
}
