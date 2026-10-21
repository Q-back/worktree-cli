import { useKeyboard, useRenderer } from "@opentui/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type BatchRemovalPlan,
  type BatchRemovalProgress,
  executeBatchRemoval,
  planBatchRemoval,
} from "../git/batchRemoval.ts";
import { theme } from "./theme.ts";

type State =
  | { stage: "planning" }
  | { stage: "cancelled" }
  | { stage: "confirm" | "confirm-loss" | "executing"; plan: BatchRemovalPlan }
  | { stage: "message"; message: string; error: boolean };

interface Props {
  currentWorktreePath: string;
  onCancel: () => void;
  onDone: () => void;
}

export function BatchRemoval({ currentWorktreePath, onCancel, onDone }: Props) {
  const renderer = useRenderer();
  const [state, setState] = useState<State>({ stage: "planning" });
  const [progress, setProgress] = useState<BatchRemovalProgress | null>(null);
  const current = useRef(state);
  const update = useCallback((next: State) => {
    current.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    let active = true;
    planBatchRemoval(currentWorktreePath, (next) => {
      if (active && current.current.stage === "planning") setProgress(next);
    }).then(
      (plan) => {
        if (!active || current.current.stage === "cancelled") return;
        update(
          plan.targets.length > 0
            ? { stage: "confirm", plan }
            : { stage: "message", message: "No other worktrees to remove.", error: false },
        );
      },
      (error: unknown) => {
        if (active && current.current.stage !== "cancelled") {
          update({ stage: "message", message: String(error), error: true });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [currentWorktreePath, update]);

  useKeyboard(async (key) => {
    const pending = current.current;
    if (pending.stage === "executing" || pending.stage === "cancelled") return;
    if (
      key.name === "escape" ||
      key.sequence === "n" ||
      key.sequence === "N" ||
      (key.ctrl && ["c", "d"].includes(key.name))
    ) {
      key.preventDefault();
      update({ stage: "cancelled" });
      onCancel();
      return;
    }
    if (pending.stage !== "confirm" && pending.stage !== "confirm-loss") return;
    if (key.sequence !== "y" && key.sequence !== "Y") return;
    key.preventDefault();
    const { plan } = pending;
    if (pending.stage === "confirm" && plan.targets.some((target) => target.dirty)) {
      update({ stage: "confirm-loss", plan });
      return;
    }
    setProgress(null);
    update({ stage: "executing", plan });
    try {
      await executeBatchRemoval(plan, pending.stage === "confirm-loss", setProgress);
      renderer.destroy();
      onDone();
    } catch (error) {
      update({ stage: "message", message: String(error), error: true });
    }
  });

  if (state.stage === "cancelled") return null;
  if (state.stage === "planning" || state.stage === "executing") {
    const labels = { inspecting: "Inspecting", rechecking: "Rechecking", removing: "Removing" };
    const phase = progress?.phase ?? (state.stage === "planning" ? "inspecting" : "rechecking");
    return (
      <box flexDirection="column" paddingLeft={2}>
        <text fg={theme.accent}>
          {labels[phase]} worktrees{progress ? ` (${progress.current}/${progress.total})` : ""}…
        </text>
        {progress && (
          <text fg={theme.muted} wrapMode="char">
            {progress.path}
          </text>
        )}
        <text fg={theme.muted}>Large worktrees can take a while.</text>
      </box>
    );
  }
  if (state.stage === "message") {
    return (
      <box flexDirection="column" flexGrow={1} minHeight={0} paddingLeft={2}>
        <scrollbox
          focused
          flexGrow={1}
          flexShrink={1}
          minHeight={0}
          scrollX={false}
          contentOptions={{ paddingRight: 1 }}
        >
          <text fg={state.error ? theme.error : theme.muted} wrapMode="char">
            {state.message}
          </text>
        </scrollbox>
        <text fg={theme.muted} flexShrink={0}>
          [n / esc] return to picker · ↑↓ / PgUp / PgDn scroll
        </text>
      </box>
    );
  }
  const dataLoss = state.stage === "confirm-loss";
  const targets = state.plan.targets.filter((target) => !dataLoss || target.dirty);
  return (
    <box flexDirection="column" flexGrow={1} minHeight={0} paddingLeft={2}>
      <text fg={theme.error} flexShrink={0}>
        {dataLoss
          ? "WARNING: Uncommitted changes, untracked and ignored files will be lost"
          : "WARNING: Remove all other linked worktrees"}
      </text>
      <text fg={theme.muted} flexShrink={0}>
        The original repository, current worktree and branches are preserved.
      </text>
      {dataLoss && (
        <text flexShrink={0} wrapMode="char">
          {`Affected worktrees (${targets.length}): every worktree below has data to discard.`}
        </text>
      )}
      <scrollbox
        key={state.stage}
        focused
        flexGrow={1}
        flexShrink={1}
        minHeight={0}
        scrollX={false}
        contentOptions={{ paddingRight: 1 }}
      >
        {targets.map((target) => (
          <text key={target.path} flexShrink={0} wrapMode="char">
            {target.path}
            {dataLoss &&
              `  [${target.reasons.length === 1 && target.reasons[0] === "ignored files" ? "ignored files only" : target.reasons.join(", ")}]`}
          </text>
        ))}
      </scrollbox>
      {dataLoss && (
        <text fg={theme.muted} flexShrink={0} wrapMode="char">
          Clean targets are hidden but will also be removed if confirmed.
        </text>
      )}
      <text fg={theme.error} flexShrink={0}>
        {dataLoss
          ? "Discard data across all affected worktrees?"
          : "Remove the entire listed batch?"}
      </text>
      <text fg={theme.muted} flexShrink={0}>
        [y] confirm [n / esc] cancel · ↑↓ / PgUp / PgDn scroll
      </text>
    </box>
  );
}
