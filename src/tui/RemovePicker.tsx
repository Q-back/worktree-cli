import { useKeyboard, useRenderer } from "@opentui/react";
import { useState } from "react";
import type { Worktree } from "../git/worktrees.ts";
import { remove } from "../git/worktrees.ts";
import { useFuzzy } from "./hooks/useFuzzy.ts";

type ConfirmState = "none" | "confirm" | "confirm-force";

interface WtItem {
  label: string;
  path: string;
}

interface Props {
  repoRoot: string;
  worktrees: Worktree[];
  onDone: () => void;
  onError: (msg: string) => void;
}

export function RemovePicker({ repoRoot, worktrees, onDone, onError }: Props) {
  const renderer = useRenderer();
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [confirmState, setConfirmState] = useState<ConfirmState>("none");

  const items: WtItem[] = worktrees
    .filter((w) => !w.isMain)
    .map((w) => ({
      label: `${w.branch ?? "(detached)"}  ${w.path.replace(repoRoot, "")}`,
      path: w.path,
    }));

  const filtered = useFuzzy(items, ["label"], query);
  const safeIdx = Math.min(selectedIdx, Math.max(0, filtered.length - 1));
  const selected = filtered[safeIdx];

  const isPrintable = (seq: string): boolean => seq.length === 1 && seq >= " " && seq <= "~";

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
      return;
    }
    if (key.name === "backspace") {
      setQuery((q) => q.slice(0, -1));
      setSelectedIdx(0);
    } else if (!key.ctrl && !key.meta && isPrintable(key.sequence)) {
      setQuery((q) => q + key.sequence);
      setSelectedIdx(0);
    }
  });

  const confirmMsg =
    confirmState === "confirm-force"
      ? `Worktree is dirty. Force remove ${selected?.path}? [y/n]`
      : `Remove ${selected?.path}? [y/n]`;

  return (
    <box flexDirection="column" width="100%" height="100%">
      <box borderStyle="single" padding={1}>
        <text>Filter: [{query}_]</text>
      </box>
      {confirmState !== "none" ? (
        <box padding={1}>
          <text fg="#FF4444">{confirmMsg}</text>
        </box>
      ) : (
        <box flexDirection="column" flexGrow={1} padding={1}>
          {filtered.map((item, idx) => (
            <text key={item.path} {...(idx === safeIdx ? { fg: "#FF6666" } : {})}>
              {idx === safeIdx ? "▸ " : "  "}
              {item.label}
            </text>
          ))}
          {filtered.length === 0 && <text fg="#666666">No worktrees</text>}
        </box>
      )}
      <box borderStyle="single" padding={1}>
        <text fg="#666666">↑↓ move ↵ remove esc cancel</text>
      </box>
    </box>
  );
}
