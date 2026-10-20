import { writeFileSync } from "node:fs";
import { useRenderer } from "@opentui/react";
import { useState } from "react";
import type { Worktree } from "../git/worktrees.ts";
import { GoPicker } from "./GoPicker.tsx";
import { RemovePicker } from "./RemovePicker.tsx";
import { theme } from "./theme.ts";

type Mode = "go" | "remove";

interface Props {
  repoRoot: string;
  worktrees: Worktree[];
  localBranches: string[];
  outputFile: string;
  currentBranch: string;
  currentWorktreePath: string;
}

export function App({
  repoRoot,
  worktrees,
  localBranches,
  outputFile,
  currentBranch,
  currentWorktreePath,
}: Props) {
  const renderer = useRenderer();
  const [mode, setMode] = useState<Mode>("go");
  const [error, setError] = useState<string | null>(null);

  const toggleMode = () => setMode((m) => (m === "go" ? "remove" : "go"));

  const handleDone = (path: string) => {
    writeFileSync(outputFile, `${path}\n`);
    renderer.destroy();
    process.exit(0);
  };

  const handleRemoveDone = () => {
    renderer.destroy();
    process.exit(0);
  };

  const handleError = (msg: string) => {
    setError(msg);
  };

  return (
    <box flexDirection="column" width="100%" height="100%" borderStyle="single">
      <box flexDirection="row" paddingLeft={1} paddingRight={1} height={1} flexShrink={0}>
        <text fg={mode === "go" ? theme.accent : theme.dim}>{mode === "go" ? "▸ " : "  "}Go</text>
        <text>{"    "}</text>
        <text fg={mode === "remove" ? theme.accent : theme.dim}>
          {mode === "remove" ? "▸ " : "  "}Remove
        </text>
        <box flexGrow={1} />
        <text fg={theme.muted}>⇥ switch</text>
      </box>
      <text fg={theme.dim} height={1} flexShrink={0} wrapMode="none">
        {"─".repeat(80)}
      </text>
      {error && (
        <box paddingLeft={1}>
          <text fg={theme.error}>Error: {error}</text>
        </box>
      )}
      <box flexDirection="column" flexGrow={1} minHeight={0}>
        {mode === "go" ? (
          <GoPicker
            repoRoot={repoRoot}
            worktrees={worktrees}
            localBranches={localBranches}
            currentBranch={currentBranch}
            onDone={handleDone}
            onError={handleError}
            onToggleMode={toggleMode}
          />
        ) : (
          <RemovePicker
            repoRoot={repoRoot}
            currentWorktreePath={currentWorktreePath}
            worktrees={worktrees}
            onDone={handleRemoveDone}
            onError={handleError}
            onToggleMode={toggleMode}
          />
        )}
      </box>
    </box>
  );
}
