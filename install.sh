#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
BIN_DIR="${HOME}/.local/bin"
BEGIN_MARKER="# wt-worktree-cli"
END_MARKER="# end wt-worktree-cli"

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
  local out_file
  out_file="$(mktemp -t wt-out.XXXXXX)" || return $?
  command wt-bin --output-file "$out_file" "$@"
  local rc=$?
  if [[ $rc -ne 0 ]]; then
    rm -f "$out_file"
    return $rc
  fi
  local out
  out="$(<"$out_file")"
  rm -f "$out_file"
  if [[ -d "$out" ]]; then
    cd "$out"
  elif [[ -n "$out" ]]; then
    printf '%s\n' "$out"
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
  touch "${rcfile}"
  if grep -qF "${BEGIN_MARKER}" "${rcfile}"; then
    # Strip the existing block between BEGIN_MARKER and END_MARKER (inclusive),
    # then append the new one. Idempotent and self-upgrading.
    local tmp
    tmp="$(mktemp)"
    awk -v begin="${BEGIN_MARKER}" -v end="${END_MARKER}" '
      $0 ~ begin { skip=1; next }
      skip && $0 ~ end { skip=0; next }
      !skip { print }
    ' "${rcfile}" > "${tmp}"
    mv "${tmp}" "${rcfile}"
    printf '\n%s\n' "${block}" >> "${rcfile}"
    echo "  ✓ Updated wt function in ${rcfile}"
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
