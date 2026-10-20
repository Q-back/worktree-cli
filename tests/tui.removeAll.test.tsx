import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { testRender } from "@opentui/react/test-utils";
import { act } from "react";
import { addNewBranch, list } from "../src/git/worktrees.ts";
import { execOrThrow } from "../src/lib/exec.ts";
import { App } from "../src/tui/App.tsx";
import { RemovePicker } from "../src/tui/RemovePicker.tsx";

let directory: string;
let repoRoot: string;
let current: string;
let alpha: string;
let beta: string;
let ui: Awaited<ReturnType<typeof testRender>> | undefined;
let completed: number;
let toggled: number;
const errors: string[] = [];

const git = (args: string[], cwd = repoRoot) => execOrThrow(["git", ...args], { cwd });

beforeEach(async () => {
  directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "wt-tui-batch-")));
  repoRoot = path.join(directory, "repo");
  fs.mkdirSync(repoRoot);
  await git(["init", "-b", "main"]);
  await git(["config", "user.email", "test@test.com"]);
  await git(["config", "user.name", "Test"]);
  fs.writeFileSync(path.join(repoRoot, "README.md"), "hello");
  fs.writeFileSync(path.join(repoRoot, ".gitignore"), "ignored/\n");
  await git(["add", "."]);
  await git(["commit", "-m", "init"]);
  current = path.join(directory, "current");
  alpha = path.join(directory, "alpha");
  beta = path.join(directory, "beta");
  for (const [name, target] of [
    ["current", current],
    ["alpha", alpha],
    ["beta", beta],
  ]) {
    if (name && target) await addNewBranch(repoRoot, target, name, "main");
  }
  completed = 0;
  toggled = 0;
  errors.length = 0;
});

afterEach(async () => {
  if (ui && !ui.renderer.isDestroyed) await act(() => ui?.renderer.destroy());
  ui = undefined;
  fs.rmSync(directory, { recursive: true, force: true });
});

async function mount() {
  ui = await testRender(
    <RemovePicker
      repoRoot={repoRoot}
      currentWorktreePath={current}
      worktrees={await list(repoRoot)}
      onDone={() => completed++}
      onError={(message) => errors.push(message)}
      onToggleMode={() => toggled++}
    />,
    { width: 150, height: 24, exitOnCtrlC: false },
  );
  await ui.renderOnce();
}

async function key(name: string, modifiers?: { ctrl?: boolean }) {
  await act(async () => {
    ui?.mockInput.pressKey(name, modifiers);
    await Bun.sleep(0);
  });
  if (ui && !ui.renderer.isDestroyed) await ui.renderOnce();
}

async function until(check: () => boolean) {
  for (let attempt = 0; attempt < 200; attempt++) {
    await act(async () => {
      await Bun.sleep(10);
      if (ui && !ui.renderer.isDestroyed) await ui.renderOnce();
    });
    if (check()) return;
  }
  throw new Error(`TUI condition timed out:\n${ui?.captureCharFrame()}`);
}

const frame = () => ui?.captureCharFrame() ?? "";
const preview = () => until(() => frame().includes("WARNING: Remove all other linked worktrees"));

describe("batch preview and confirmations", () => {
  it("warns in red and requires one aggregate approval for multiple dirty targets", async () => {
    const untracked = path.join(alpha, "new-data");
    const ignored = path.join(beta, "ignored", "file");
    fs.writeFileSync(untracked, "keep untracked");
    fs.mkdirSync(path.dirname(ignored));
    fs.writeFileSync(ignored, "keep ignored");
    await mount();
    await key("x", { ctrl: true });
    await preview();
    const warning = ui
      ?.captureSpans()
      .lines.flatMap((line) => line.spans)
      .find((span) => span.text.includes("WARNING:"));
    expect(warning?.fg.toInts()).toEqual([248, 113, 113, 255]);
    await key("y");
    expect(frame()).toContain("Uncommitted changes, untracked and ignored files will be lost");
    expect(frame()).toContain(alpha);
    expect(frame()).toContain(beta);
    expect(fs.readFileSync(untracked, "utf8")).toBe("keep untracked");
    expect(fs.readFileSync(ignored, "utf8")).toBe("keep ignored");
    expect(completed).toBe(0);
    await key("y");
    await until(() => completed === 1);
    expect(await list(repoRoot)).toHaveLength(2);
    expect(fs.existsSync(current)).toBe(true);
  });

  for (const stage of ["removal", "data-loss"]) {
    it.each([
      { name: "n" },
      { name: "ESCAPE" },
      { name: "c", ctrl: true },
      { name: "d", ctrl: true },
    ])(`cancels ${stage} on $name before deleting clean or dirty targets`, async (action) => {
      const file = path.join(beta, "README.md");
      fs.writeFileSync(file, "keep changes");
      await mount();
      await key("x", { ctrl: true });
      await preview();
      if (stage === "data-loss") await key("y");
      await key(action.name, { ctrl: "ctrl" in action });
      await until(() => frame().includes("type to filter"));
      expect(fs.readFileSync(file, "utf8")).toBe("keep changes");
      expect(fs.readFileSync(path.join(alpha, "README.md"), "utf8")).toBe("hello");
      expect(completed).toBe(0);
    });
  }

  it("reports an empty batch without confirmation", async () => {
    await git(["worktree", "remove", alpha]);
    await git(["worktree", "remove", beta]);
    await mount();
    await key("x", { ctrl: true });
    await until(() => frame().includes("No other worktrees"));
    await key("y");
    expect(completed).toBe(0);
    expect(frame()).not.toContain("[y]");
    expect(fs.existsSync(current)).toBe(true);
  });

  it("reports inspection errors before showing a confirmation", async () => {
    await git(["worktree", "lock", beta]);
    await mount();
    await key("x", { ctrl: true });
    await until(() => frame().includes("locked"));
    expect(frame()).toContain(beta);
    expect(frame()).not.toContain("[y]");
    await key("y");
    expect(completed).toBe(0);
    expect(fs.existsSync(alpha)).toBe(true);
    expect(fs.existsSync(beta)).toBe(true);
  });

  it("makes long previews accessible with keyboard scrolling in a small viewport", async () => {
    const last = path.join(directory, "z-last-target");
    const wrapped = path.join(directory, "a-long-preview-target-with-extra-context");
    await addNewBranch(repoRoot, wrapped, "wrapped", "main");
    for (const name of [
      "extra-a",
      "extra-b",
      "extra-c",
      "extra-d",
      "extra-e",
      "extra-f",
      "extra-g",
      "extra-h",
      "z-last-target",
    ]) {
      await addNewBranch(repoRoot, path.join(directory, name), name, "main");
    }
    await mount();
    ui?.resize(55, 14);
    await key("x", { ctrl: true });
    await until(() => frame().includes("WARNING:"));
    expect(frame()).not.toContain("z-last-target");
    await key("END");
    expect(frame()).toContain("z-last-target");
    await key("HOME");
    expect(frame()).toContain("alpha");
    expect(frame().replace(/[\s█▀▄]/g, "")).toContain(wrapped);
    expect(fs.existsSync(last)).toBe(true);
    await key("n");
  });
});

describe("batch input routing and execution", () => {
  it("suspends filtering and mode changes, then resets approvals and restores the filter", async () => {
    fs.writeFileSync(path.join(beta, "new-data"), "keep me");
    await mount();
    await act(async () => ui?.mockInput.typeText("alpha"));
    await key("x", { ctrl: true });
    await key("TAB");
    await key("q");
    await preview();
    await key("y");
    expect(frame()).toContain("Discard data across all affected worktrees?");
    await key("x", { ctrl: true });
    await key("TAB");
    await key("q");
    expect(toggled).toBe(0);
    expect(frame()).toContain(beta);
    await key("n");
    expect(frame()).toContain("alpha");
    expect(frame()).not.toContain(beta);
    await key("x", { ctrl: true });
    await preview();
    expect(frame()).not.toContain("Discard data across");
    await key("y");
    expect(frame()).toContain("Discard data across");
    await key("n");
    expect(fs.readFileSync(path.join(beta, "new-data"), "utf8")).toBe("keep me");
    expect(fs.existsSync(alpha)).toBe(true);
    expect(completed).toBe(0);
  });

  it("guards repeated approval and shortcut events during real Git deletion", async () => {
    await mount();
    await key("x", { ctrl: true });
    await preview();
    await act(() => {
      ui?.mockInput.pressKey("y");
      ui?.mockInput.pressKey("y");
      ui?.mockInput.pressKey("x", { ctrl: true });
      ui?.mockInput.pressKey("TAB");
    });
    await until(() => completed === 1);
    expect(toggled).toBe(0);
    expect(errors).toEqual([]);
    expect(fs.existsSync(alpha)).toBe(false);
    expect(fs.existsSync(beta)).toBe(false);
    expect(await list(repoRoot)).toHaveLength(2);
  });

  it("reports newly discovered data loss and requires a fresh preview", async () => {
    await mount();
    await key("x", { ctrl: true });
    await preview();
    const file = path.join(beta, "late-data");
    fs.writeFileSync(file, "not approved");
    await key("y");
    await until(() => frame().includes("fresh preview"));
    expect(completed).toBe(0);
    expect(fs.existsSync(alpha)).toBe(true);
    expect(fs.readFileSync(file, "utf8")).toBe("not approved");
    await key("ESCAPE");
    await until(() => frame().includes("type to filter"));
    await key("x", { ctrl: true });
    await preview();
    await key("y");
    expect(frame()).toContain("Discard data across");
    await key("n");
  });

  it("reports a real partial failure without claiming rollback or deleting later targets", async () => {
    const remaining = path.join(directory, "gamma");
    await addNewBranch(repoRoot, remaining, "gamma", "main");
    await git(["-c", "protocol.file.allow=always", "submodule", "add", repoRoot, "module"], beta);
    await git(["commit", "-am", "add submodule"], beta);
    await mount();
    await key("x", { ctrl: true });
    await preview();
    await key("y");
    await until(() => frame().includes("Removal failed"));
    await key("END");
    expect(frame()).toContain("Completed removals (not undone)");
    expect(frame()).toContain(alpha);
    expect(frame()).toContain("Not attempted");
    expect(frame()).toContain(remaining);
    expect(fs.existsSync(alpha)).toBe(false);
    expect(fs.existsSync(beta)).toBe(true);
    expect(fs.existsSync(remaining)).toBe(true);
    expect(completed).toBe(0);
  });
});

describe("Remove-mode bulk shortcut", () => {
  it("keeps App chrome, the shortcut and scrollable preview separate in a small window", async () => {
    for (const name of ["extra-a", "extra-b", "extra-c", "extra-d", "z-last-target"]) {
      await addNewBranch(repoRoot, path.join(directory, name), name, "main");
    }
    ui = await testRender(
      <App
        repoRoot={repoRoot}
        currentWorktreePath={current}
        worktrees={await list(repoRoot)}
        localBranches={["main", "current", "alpha", "beta"]}
        currentBranch="main"
        outputFile={path.join(directory, "navigation")}
      />,
      { width: 80, height: 14, exitOnCtrlC: false },
    );
    await key("TAB");
    expect(frame()).toContain("ctrl+x remove all others");
    await key("x", { ctrl: true });
    await preview();
    expect(frame()).not.toContain("z-last-target");
    await key("END");
    expect(frame()).toContain("z-last-target");
    const question = frame()
      .split("\n")
      .find((line) => line.includes("Remove the entire listed batch?"));
    expect(question?.trim()).toMatch(/^│\s*Remove the entire listed batch\?\s*│$/);
    await key("n");
    await key("TAB");
    expect(frame()).toContain("type to filter or create");
  });

  it("advertises the shortcut in the Remove footer", async () => {
    await mount();
    expect(frame()).toContain("ctrl+x remove all others");
  });

  it("plans every target despite a filter and protects the invocation checkout", async () => {
    await mount();
    await act(async () => ui?.mockInput.typeText("alpha"));
    await ui?.renderOnce();
    expect(frame()).not.toContain(beta);
    await key("x", { ctrl: true });
    await preview();
    expect(frame()).toContain(alpha);
    expect(frame()).toContain(beta);
    expect(frame()).not.toContain(current);
    await key("y");
    await until(() => completed === 1);
    expect(fs.existsSync(alpha)).toBe(false);
    expect(fs.existsSync(beta)).toBe(false);
    expect(fs.existsSync(current)).toBe(true);
    expect(fs.existsSync(repoRoot)).toBe(true);
    expect(errors).toEqual([]);
  });

  it("keeps plain x as filter text and Enter as single-item removal", async () => {
    await mount();
    await key("x");
    expect(frame()).toContain("No worktrees");
    expect(frame()).not.toContain("WARNING:");
    await key("BACKSPACE");
    await act(async () => ui?.mockInput.typeText("alpha"));
    await key("RETURN");
    expect(frame()).toContain(`Remove ${alpha}?`);
    expect(frame()).not.toContain("WARNING:");
    await key("y");
    await until(() => completed === 1);
    expect(fs.existsSync(alpha)).toBe(false);
    expect(fs.existsSync(beta)).toBe(true);
  });

  it("ignores duplicate triggers and does not bind Ctrl+X globally in Go mode", async () => {
    ui = await testRender(
      <App
        repoRoot={repoRoot}
        currentWorktreePath={current}
        worktrees={await list(repoRoot)}
        localBranches={["main", "current", "alpha", "beta"]}
        currentBranch="main"
        outputFile={path.join(directory, "navigation")}
      />,
      { width: 150, height: 24, exitOnCtrlC: false },
    );
    await key("x", { ctrl: true });
    expect(frame()).not.toContain("WARNING:");
    await key("TAB");
    await act(() => {
      ui?.mockInput.pressKey("x", { ctrl: true });
      ui?.mockInput.pressKey("x", { ctrl: true });
    });
    await preview();
    expect(frame().split("WARNING:")).toHaveLength(2);
    expect(frame()).not.toContain(current);
    await key("ESCAPE");
    await until(() => frame().includes("type to filter"));
    expect(fs.existsSync(alpha)).toBe(true);
    expect(fs.existsSync(beta)).toBe(true);
  });
});
