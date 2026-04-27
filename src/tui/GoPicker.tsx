import { useKeyboard, useRenderer } from "@opentui/react";
import { useState } from "react";
import { branchExists, mergeBase } from "../git/branches.ts";
import { currentBranch, defaultBaseBranch } from "../git/repo.ts";
import type { Worktree } from "../git/worktrees.ts";
import { add, addNewBranch, pathFor } from "../git/worktrees.ts";
import { useFuzzy } from "./hooks/useFuzzy.ts";

type GoItemKind = "worktree" | "branch" | "create";

interface GoItem {
  label: string;
  kind: GoItemKind;
  wtPath: string;
  branch: string;
}

interface Props {
  repoRoot: string;
  worktrees: Worktree[];
  localBranches: string[];
  onDone: (path: string) => void;
  onError: (msg: string) => void;
}

export function GoPicker({ repoRoot, worktrees, localBranches, onDone, onError }: Props) {
  const renderer = useRenderer();
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);

  const wtBranches = new Set(worktrees.filter((w) => !w.isMain).map((w) => w.branch));

  const baseItems: GoItem[] = [
    ...worktrees
      .filter((w) => !w.isMain && w.branch != null)
      .map((w) => ({
        label: `${w.branch}  ${w.path.replace(repoRoot, "")}  ✓`,
        kind: "worktree" as GoItemKind,
        wtPath: w.path,
        branch: w.branch ?? "",
      })),
    ...localBranches
      .filter((b) => !wtBranches.has(b))
      .map((b) => ({
        label: b,
        kind: "branch" as GoItemKind,
        wtPath: pathFor(repoRoot, b),
        branch: b,
      })),
  ];

  const matchedItems = useFuzzy(baseItems, ["label"], query);

  const showCreate = query.length > 0 && !baseItems.some((i) => i.branch === query);
  const createItem: GoItem = {
    label: `${query}  (will create)`,
    kind: "create",
    wtPath: pathFor(repoRoot, query),
    branch: query,
  };

  const items: GoItem[] = showCreate ? [...matchedItems, createItem] : matchedItems;
  const safeIdx = Math.min(selectedIdx, Math.max(0, items.length - 1));

  const isPrintable = (seq: string): boolean => seq.length === 1 && seq >= " " && seq <= "~";

  useKeyboard(async (key) => {
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
        const resolved = await resolveItem(item, repoRoot);
        renderer.destroy();
        onDone(resolved);
      } catch (e) {
        onError(e instanceof Error ? e.message : String(e));
      }
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

  return (
    <box flexDirection="column" width="100%" height="100%">
      <box borderStyle="single" padding={1}>
        <text>Branch: [{query}_]</text>
      </box>
      <box flexDirection="column" flexGrow={1} padding={1}>
        {items.map((item, idx) => (
          <text key={item.branch} {...(idx === safeIdx ? { fg: "#00FFFF" } : {})}>
            {idx === safeIdx ? "▸ " : "  "}
            {item.label}
          </text>
        ))}
        {items.length === 0 && <text fg="#666666">No matches</text>}
      </box>
      <box borderStyle="single" padding={1}>
        <text fg="#666666">↑↓ move ↵ go esc cancel</text>
      </box>
    </box>
  );
}

async function resolveItem(item: GoItem, repoRoot: string): Promise<string> {
  if (item.kind === "worktree") {
    return item.wtPath;
  }

  const { branch, wtPath } = item;

  if (item.kind === "branch") {
    await add(repoRoot, wtPath, branch);
    return wtPath;
  }

  const head = await currentBranch(repoRoot);
  const base = await defaultBaseBranch(repoRoot);
  const baseRef = head === base ? base : await mergeBase(repoRoot, "HEAD", base);

  if (await branchExists(repoRoot, branch)) {
    await add(repoRoot, wtPath, branch);
  } else {
    await addNewBranch(repoRoot, wtPath, branch, baseRef);
  }
  return wtPath;
}
