#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
BIN_DIR="${HOME}/.local/bin"
MARKER="# wt-worktree-cli"

echo "Installing wt from ${REPO_DIR}..."

# Ensure ~/.local/bin exists
mkdir -p "${BIN_DIR}"

# Make bin/wt-bin executable
chmod +x "${REPO_DIR}/bin/wt-bin"

# Symlink wt-bin
ln -sf "${REPO_DIR}/bin/wt-bin" "${BIN_DIR}/wt-bin"
echo "  ✓ Linked ${BIN_DIR}/wt-bin → ${REPO_DIR}/bin/wt-bin"

# Shell function block
read -r -d '' WT_BLOCK << 'SHELL_BLOCK' || true
# wt-worktree-cli
wt() {
  local out
  out="$(command wt-bin "$@")" || return $?
  if [[ -d "$out" ]]; then
    cd "$out"
  else
    [[ -n "$out" ]] && printf '%s\n' "$out"
  fi
}
# source completions
if command -v wt-bin &>/dev/null; then
  source <(wt-bin completion zsh 2>/dev/null) 2>/dev/null || true
fi
# end wt-worktree-cli
SHELL_BLOCK

BASH_BLOCK="${WT_BLOCK/completion zsh/completion bash}"

inject_into() {
  local rcfile="$1"
  local block="$2"
  if [[ -f "${rcfile}" ]] && grep -qF "${MARKER}" "${rcfile}"; then
    echo "  ✓ ${rcfile} already has wt function (skipping)"
  else
    printf '\n%s\n' "${block}" >> "${rcfile}"
    echo "  ✓ Injected wt function into ${rcfile}"
  fi
}

inject_into "${HOME}/.zshrc" "${WT_BLOCK}"

if [[ -f "${HOME}/.bashrc" ]]; then
  inject_into "${HOME}/.bashrc" "${BASH_BLOCK}"
fi

echo ""
echo "Done! To activate:"
echo "  exec \$SHELL"
echo ""
echo "Then try:"
echo "  wt --help"
