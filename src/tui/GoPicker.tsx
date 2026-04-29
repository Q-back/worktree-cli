import { useKeyboard, useRenderer } from "@opentui/react";
import { useCallback, useRef, useState } from "react";
import { branchExists, mergeBase } from "../git/branches.ts";
import { defaultBaseBranch } from "../git/repo.ts";
import type { Worktree } from "../git/worktrees.ts";
import { add, addNewBranch, pathFor } from "../git/worktrees.ts";
import { fuzzyFilter } from "./hooks/useFuzzy.ts";
import { theme } from "./theme.ts";

type GoItemKind = "worktree" | "branch" | "create";

interface GoItem {
  kind: GoItemKind;
  wtPath: string;
  branch: string;
}

interface Props {
  repoRoot: string;
  worktrees: Worktree[];
  localBranches: string[];
  currentBranch: string;
  onDone: (path: string) => void;
  onError: (msg: string) => void;
  onToggleMode: () => void;
}

export function GoPicker({
  repoRoot,
  worktrees,
  localBranches,
  currentBranch,
  onDone,
  onError,
  onToggleMode,
}: Props) {
  const renderer = useRenderer();

  const wtBranches = new Set(worktrees.filter((w) => !w.isMain).map((w) => w.branch));
  const baseItems: GoItem[] = [
    ...worktrees
      .filter((w) => !w.isMain && w.branch != null)
      .map((w) => ({
        kind: "worktree" as GoItemKind,
        wtPath: w.path,
        branch: w.branch ?? "",
      })),
    ...localBranches
      .filter((b) => !wtBranches.has(b))
      .map((b) => ({
        kind: "branch" as GoItemKind,
        wtPath: pathFor(repoRoot, b),
        branch: b,
      })),
  ];

  const queryRef = useRef("");
  const [items, setItems] = useState<GoItem[]>(baseItems);
  const [selectedIdx, setSelectedIdx] = useState(0);

  const safeIdx = Math.min(selectedIdx, Math.max(0, items.length - 1));

  const handleInput = useCallback(
    (v: string) => {
      queryRef.current = v;
      const matched = fuzzyFilter(baseItems, ["branch"], v);
      const showCreate = v.length > 0 && !baseItems.some((i) => i.branch === v);
      const createItem: GoItem = {
        kind: "create",
        wtPath: pathFor(repoRoot, v),
        branch: v,
      };
      setItems(showCreate ? [...matched, createItem] : matched);
      setSelectedIdx(0);
    },
    // baseItems and repoRoot are stable (derived from props that don't change after mount)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useKeyboard(async (key) => {
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
      setSelectedIdx((i) => Math.min(items.length - 1, i + 1));
      return;
    }
    if (key.name === "return") {
      const item = items[safeIdx];
      if (!item) return;
      try {
        const resolved = await resolveItem(item, repoRoot, currentBranch);
        renderer.destroy();
        onDone(resolved);
      } catch (e) {
        onError(e instanceof Error ? e.message : String(e));
      }
    }
  });

  return (
    <box flexDirection="column" width="100%" height="100%">
      <box flexDirection="row" paddingLeft={2} paddingTop={1} height={2}>
        <text fg={theme.accent}>› </text>
        <input focused width="100%" placeholder="type to filter or create…" onInput={handleInput} />
      </box>
      <box flexDirection="column" flexGrow={1} paddingTop={1} paddingLeft={2}>
        {items.map((item, idx) => (
          <GoRow
            key={`${item.kind}:${item.branch}`}
            item={item}
            isSelected={idx === safeIdx}
            isActive={item.branch === currentBranch}
            repoRoot={repoRoot}
          />
        ))}
        {items.length === 0 && <text fg={theme.dim}>No matches</text>}
      </box>
      <text fg={theme.dim}>{"─".repeat(80)}</text>
      <GoFooter />
    </box>
  );
}

interface GoRowProps {
  item: GoItem;
  isSelected: boolean;
  isActive: boolean;
  repoRoot: string;
}

function GoRow({ item, isSelected, isActive, repoRoot }: GoRowProps) {
  const cursor = isSelected ? "▸ " : "  ";
  const cursorColor = theme.accent;

  if (item.kind === "create") {
    return (
      <box flexDirection="row">
        <text fg={cursorColor}>{cursor}</text>
        <text fg={theme.accent}>+ </text>
        <text fg={isSelected ? theme.accent : theme.text}>{item.branch}</text>
        <text>{"   "}</text>
        <text fg={theme.accent}>(will create)</text>
      </box>
    );
  }

  if (isActive) {
    const relPath = item.wtPath.replace(repoRoot, "");
    return (
      <box flexDirection="row">
        <text fg={cursorColor}>{cursor}</text>
        <text fg={theme.accent}>{"● "}</text>
        <text fg={theme.accent}>{item.branch}</text>
        {item.kind === "worktree" && (
          <>
            <text>{"   "}</text>
            <text fg={theme.muted}>{relPath}</text>
          </>
        )}
      </box>
    );
  }

  if (item.kind === "worktree") {
    const relPath = item.wtPath.replace(repoRoot, "");
    return (
      <box flexDirection="row">
        <text fg={cursorColor}>{cursor}</text>
        <text fg={theme.accent}>{"◆ "}</text>
        <text fg={isSelected ? theme.accent : theme.text}>{item.branch}</text>
        <text>{"   "}</text>
        <text fg={theme.muted}>{relPath}</text>
      </box>
    );
  }

  return (
    <box flexDirection="row">
      <text fg={cursorColor}>{cursor}</text>
      <text fg={theme.dim}>{"○ "}</text>
      <text fg={isSelected ? theme.accent : theme.text}>{item.branch}</text>
    </box>
  );
}

function GoFooter() {
  return (
    <box flexDirection="column" paddingLeft={1} paddingBottom={1}>
      <box flexDirection="row">
        <text fg={theme.accent}>● </text>
        <text fg={theme.muted}>current</text>
        <text fg={theme.dim}>{"   "}</text>
        <text fg={theme.accent}>◆ </text>
        <text fg={theme.muted}>worktree</text>
        <text fg={theme.dim}>{"   "}</text>
        <text fg={theme.dim}>○ </text>
        <text fg={theme.muted}>branch</text>
        <text fg={theme.dim}>{"   "}</text>
        <text fg={theme.accent}>+ </text>
        <text fg={theme.muted}>create</text>
      </box>
      <box flexDirection="row">
        <text fg={theme.text}>↑↓</text>
        <text fg={theme.muted}> navigate</text>
        <text fg={theme.dim}>{"  │  "}</text>
        <text fg={theme.text}>↵</text>
        <text fg={theme.muted}> go</text>
        <text fg={theme.dim}>{"  │  "}</text>
        <text fg={theme.text}>⇥</text>
        <text fg={theme.muted}> remove mode</text>
        <text fg={theme.dim}>{"  │  "}</text>
        <text fg={theme.text}>esc</text>
        <text fg={theme.muted}> cancel</text>
      </box>
    </box>
  );
}

async function resolveItem(item: GoItem, repoRoot: string, head: string): Promise<string> {
  if (item.kind === "worktree") {
    return item.wtPath;
  }

  const { branch, wtPath } = item;

  if (item.kind === "branch") {
    await add(repoRoot, wtPath, branch);
    return wtPath;
  }

  const base = await defaultBaseBranch(repoRoot);
  const baseRef = head === base ? base : await mergeBase(repoRoot, "HEAD", base);

  if (await branchExists(repoRoot, branch)) {
    await add(repoRoot, wtPath, branch);
  } else {
    await addNewBranch(repoRoot, wtPath, branch, baseRef);
  }
  return wtPath;
}
