import { useKeyboard, useRenderer } from "@opentui/react";
import { useState } from "react";
import type { Worktree } from "../git/worktrees.ts";
import { GoPicker } from "./GoPicker.tsx";
import { RemovePicker } from "./RemovePicker.tsx";

type Mode = "go" | "remove";

interface Props {
  repoRoot: string;
  worktrees: Worktree[];
  localBranches: string[];
}

export function App({ repoRoot, worktrees, localBranches }: Props) {
  const renderer = useRenderer();
  const [mode, setMode] = useState<Mode>("go");
  const [error, setError] = useState<string | null>(null);

  useKeyboard((key) => {
    if (key.sequence === "g") setMode("go");
    if (key.sequence === "r") setMode("remove");
  });

  const handleDone = (path: string) => {
    process.stdout.write(`${path}\n`);
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
    <box flexDirection="column" width="100%" height="100%">
      <box borderStyle="single" padding={1}>
        <text {...(mode === "go" ? { fg: "#00FFFF" } : {})}>[g] Go </text>
        <text {...(mode === "remove" ? { fg: "#00FFFF" } : {})}>[r] Remove</text>
      </box>
      {error && (
        <box padding={1}>
          <text fg="#FF4444">Error: {error}</text>
        </box>
      )}
      {mode === "go" ? (
        <GoPicker
          repoRoot={repoRoot}
          worktrees={worktrees}
          localBranches={localBranches}
          onDone={handleDone}
          onError={handleError}
        />
      ) : (
        <RemovePicker
          repoRoot={repoRoot}
          worktrees={worktrees}
          onDone={handleRemoveDone}
          onError={handleError}
        />
      )}
    </box>
  );
}
