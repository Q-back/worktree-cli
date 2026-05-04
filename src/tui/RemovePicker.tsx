import { useKeyboard, useRenderer } from "@opentui/react";
import { useCallback, useRef, useState } from "react";
import type { Worktree } from "../git/worktrees.ts";
import { remove } from "../git/worktrees.ts";
import { fuzzyFilter } from "./hooks/useFuzzy.ts";
import { theme } from "./theme.ts";

type ConfirmState = "none" | "confirm" | "confirm-force";

interface WtItem {
  branch: string;
  path: string;
}

interface Props {
  repoRoot: string;
  worktrees: Worktree[];
  onDone: () => void;
  onError: (msg: string) => void;
  onToggleMode: () => void;
}

export function RemovePicker({ repoRoot, worktrees, onDone, onError, onToggleMode }: Props) {
  const renderer = useRenderer();
  const [confirmState, setConfirmState] = useState<ConfirmState>("none");

  const baseItemsRef = useRef<WtItem[]>(
    worktrees
      .filter((w) => !w.isMain)
      .map((w) => ({
        branch: w.branch ?? "(detached)",
        path: w.path,
      })),
  );

  const [filtered, setFiltered] = useState<WtItem[]>(baseItemsRef.current);
  const [selectedIdx, setSelectedIdx] = useState(0);

  const safeIdx = Math.min(selectedIdx, Math.max(0, filtered.length - 1));
  const selected = filtered[safeIdx];

  const handleInput = useCallback((v: string) => {
    setFiltered(fuzzyFilter(baseItemsRef.current, ["branch"], v));
    setSelectedIdx(0);
  }, []);

  useKeyboard(async (key) => {
    if (confirmState !== "none") {
      if (key.sequence === "y" || key.sequence === "Y") {
        if (!selected) return;
        try {
          await remove(repoRoot, selected.path, confirmState === "confirm-force");
          renderer.destroy();
          onDone();
        } catch (e) {
          if (e instanceof Error && e.message === "DIRTY") {
            setConfirmState("confirm-force");
          } else {
            onError(e instanceof Error ? e.message : String(e));
          }
        }
      } else {
        setConfirmState("none");
      }
      return;
    }

    if (key.name === "tab") {
      onToggleMode();
      return;
    }
    if (key.name === "escape") {
      renderer.destroy();
      return;
    }
    if (key.name === "up") {
      setSelectedIdx((i) => Math.max(0, i - 1));
      return;
    }
    if (key.name === "down") {
      setSelectedIdx((i) => Math.min(filtered.length - 1, i + 1));
      return;
    }
    if (key.name === "return") {
      if (selected) setConfirmState("confirm");
    }
  });

  const confirmMsg =
    confirmState === "confirm-force"
      ? `Worktree is dirty. Force remove ${selected?.path}?`
      : `Remove ${selected?.path}?`;

  return (
    <box flexDirection="column" width="100%" height="100%">
      <box flexDirection="row" paddingLeft={2} paddingTop={1} height={2}>
        <text fg={theme.accent}>› </text>
        <input focused width="100%" placeholder="type to filter…" onInput={handleInput} />
      </box>
      {confirmState !== "none" ? (
        <box flexDirection="column" paddingLeft={2} paddingTop={1}>
          <text fg={theme.error}>{confirmMsg}</text>
          <text fg={theme.muted}>[y] confirm [n / esc] cancel</text>
        </box>
      ) : (
        <box flexDirection="column" flexGrow={1} paddingTop={1} paddingLeft={2}>
          {filtered.map((item, idx) => (
            <box key={item.path} flexDirection="row">
              <text fg={theme.cursor}>{idx === safeIdx ? "▸ " : "  "}</text>
              <text fg={theme.worktree}>{"● "}</text>
              <text fg={idx === safeIdx ? theme.accent : theme.text}>{item.branch}</text>
              <text>{"   "}</text>
              <text fg={theme.muted}>{item.path.replace(repoRoot, "")}</text>
            </box>
          ))}
          {filtered.length === 0 && <text fg={theme.dim}>No worktrees</text>}
        </box>
      )}
      <text fg={theme.dim}>{"─".repeat(80)}</text>
      <RemoveFooter />
    </box>
  );
}

function RemoveFooter() {
  return (
    <box flexDirection="column" paddingLeft={1} paddingBottom={1}>
      <box flexDirection="row">
        <text fg={theme.worktree}>● </text>
        <text fg={theme.muted}>worktree</text>
      </box>
      <box flexDirection="row">
        <text fg={theme.text}>↑↓</text>
        <text fg={theme.muted}> navigate</text>
        <text fg={theme.dim}>{"  │  "}</text>
        <text fg={theme.text}>↵</text>
        <text fg={theme.muted}> remove</text>
        <text fg={theme.dim}>{"  │  "}</text>
        <text fg={theme.text}>⇥</text>
        <text fg={theme.muted}> go mode</text>
        <text fg={theme.dim}>{"  │  "}</text>
        <text fg={theme.text}>esc</text>
        <text fg={theme.muted}> cancel</text>
      </box>
    </box>
  );
}
