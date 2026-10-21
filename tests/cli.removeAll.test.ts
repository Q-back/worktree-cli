import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { addNewBranch, list } from "../src/git/worktrees.ts";
import { exec } from "../src/lib/exec.ts";

const entry = path.resolve("src/index.tsx");
const terminalDriver = path.resolve("tests/helpers/terminal.py");
const removalPrompt = "Remove all listed worktrees? [y/N]";
const lossPrompt = "Discard data in all affected worktrees? [y/N]";

interface TerminalStep {
  waitFor: string;
  input?: string;
  signal?: string;
  check?: string[];
}

async function terminal(steps: TerminalStep[], cwd = repoRoot, command?: string[]) {
  const proc = Bun.spawn(["python3", terminalDriver], {
    cwd,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  proc.stdin.write(
    JSON.stringify({
      command: command ?? [process.execPath, entry, "--remove-all", "--output-file", outputFile],
      steps,
    }),
  );
  proc.stdin.end();
  const [stdout, stderr, code] = await Promise.all([
    Bun.readableStreamToText(proc.stdout),
    Bun.readableStreamToText(proc.stderr),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(stderr);
  return JSON.parse(stdout) as { stdout: string; stderr: string; code: number };
}
let tmpDir: string;
let repoRoot: string;
let outputFile: string;

async function git(args: string[], cwd = repoRoot) {
  const result = await exec(["git", ...args], { cwd });
  if (result.code !== 0) throw new Error(result.stderr);
  return result.stdout;
}

async function checkout(name: string) {
  const target = path.join(tmpDir, name);
  await addNewBranch(repoRoot, target, name, "main");
  return target;
}

function run(args: readonly string[], cwd = repoRoot) {
  return exec([process.execPath, entry, ...args], { cwd });
}

beforeEach(async () => {
  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "wt-remove-cli-")));
  repoRoot = path.join(tmpDir, "repo");
  outputFile = path.join(tmpDir, "navigation");
  fs.mkdirSync(repoRoot);
  fs.writeFileSync(outputFile, "");
  await git(["init", "-b", "main"]);
  await git(["config", "user.email", "test@test.com"]);
  await git(["config", "user.name", "Test"]);
  fs.writeFileSync(path.join(repoRoot, "README.md"), "hello");
  fs.writeFileSync(path.join(repoRoot, ".gitignore"), "ignored/\n");
  await git(["add", "."]);
  await git(["commit", "-m", "init"]);
});

afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe("terminal bulk removal", () => {
  it("previews every clean target, warns in red, and confirms the whole batch once", async () => {
    const targets = [await checkout("first"), await checkout("second")];
    const result = await terminal([{ waitFor: removalPrompt, input: "y", check: targets }]);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
    for (const target of targets) {
      expect(result.stderr).toContain(target);
      expect(fs.existsSync(target)).toBe(false);
    }
    expect(result.stderr).toContain("Large worktrees can take a while.");
    let lastPosition = -1;
    for (const phase of ["Inspecting", "Rechecking", "Removing"]) {
      for (const [index, target] of targets.entries()) {
        const message = `${phase} worktrees (${index + 1}/2): ${target}`;
        const position = result.stderr.indexOf(message);
        expect(position).toBeGreaterThan(lastPosition);
        lastPosition = position;
      }
    }
    expect(result.stderr).toContain("\x1b[31mWARNING:");
    expect(result.stderr).toContain(
      "original repository, current worktree and branches are preserved",
    );
    expect(result.stderr.split(removalPrompt)).toHaveLength(2);
    expect(result.stderr).not.toContain(lossPrompt);
    expect(fs.readFileSync(outputFile, "utf8")).toBe("");
    expect(await git(["branch", "--format=%(refname:short)"])).toBe("first\nmain\nsecond");
  });

  it("uses one additional data-loss approval for tracked, untracked-only and ignored-only targets", async () => {
    const clean = await checkout("clean");
    const dirty = [];
    for (const name of ["tracked", "untracked", "ignored"]) {
      const target = await checkout(name);
      const file = path.join(target, name === "tracked" ? "README.md" : `${name}/file`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, "uncommitted data");
      dirty.push(target);
    }
    const targets = [clean, ...dirty];
    const result = await terminal([
      { waitFor: removalPrompt, input: "Y", check: targets },
      { waitFor: lossPrompt, input: "y", check: targets },
    ]);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr.split(removalPrompt)).toHaveLength(2);
    expect(result.stderr.split(lossPrompt)).toHaveLength(2);
    expect(result.stderr).toContain(
      "\x1b[31mWARNING: Uncommitted changes, untracked and ignored files will be lost",
    );
    const lossPreview = result.stderr.split(removalPrompt)[1];
    for (const target of dirty) expect(lossPreview).toContain(target);
    for (const target of targets) expect(fs.existsSync(target)).toBe(false);
    expect(fs.readFileSync(outputFile, "utf8")).toBe("");
  });
});

describe("bulk cancellation", () => {
  for (const stage of ["removal", "data-loss"]) {
    it.each([
      { label: "negative response", input: "n" },
      { label: "Escape", input: "\x1b" },
      { label: "EOF key", input: "\x04" },
      { label: "Ctrl+C", input: "\x03" },
      { label: "SIGINT", signal: "SIGINT" },
      { label: "SIGTERM", signal: "SIGTERM" },
      { label: "SIGHUP", signal: "SIGHUP" },
    ])(`cancels ${stage} on $label without deleting any target`, async (action) => {
      const clean = await checkout("clean");
      const dirty = await checkout("dirty");
      const file = path.join(dirty, "new-data");
      fs.writeFileSync(file, "keep me");
      const steps: TerminalStep[] =
        stage === "data-loss" ? [{ waitFor: removalPrompt, input: "y", check: [clean, file] }] : [];
      steps.push({ ...action, waitFor: stage === "removal" ? removalPrompt : lossPrompt });
      const result = await terminal(steps);
      expect(result.code).toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("Cancelled. No worktrees removed");
      expect(fs.readFileSync(path.join(clean, "README.md"), "utf8")).toBe("hello");
      expect(fs.readFileSync(file, "utf8")).toBe("keep me");
      expect(fs.readFileSync(outputFile, "utf8")).toBe("");
      if (stage === "removal") expect(result.stderr).not.toContain(lossPrompt);
    });
  }

  it("does not treat other input or pasted approvals as confirmation", async () => {
    const target = await checkout("target");
    const result = await terminal([
      { waitFor: removalPrompt, input: "yy" },
      { waitFor: "Use y or n", input: "n", check: [target] },
    ]);
    expect(result.code).toBe(0);
    expect(fs.existsSync(target)).toBe(true);
    expect(result.stderr).toContain("Cancelled");
  });

  it("rejects piped affirmative responses", async () => {
    const target = await checkout("target");
    const proc = Bun.spawn([process.execPath, entry, "--remove-all"], {
      cwd: repoRoot,
      stdin: new TextEncoder().encode("y\ny\n"),
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, code] = await Promise.all([
      Bun.readableStreamToText(proc.stdout),
      Bun.readableStreamToText(proc.stderr),
      proc.exited,
    ]);
    expect(code).not.toBe(0);
    expect(stderr).toContain("interactive terminal");
    expect(stdout).toBe("");
    expect(fs.existsSync(target)).toBe(true);
  });
});

describe("shell integration", () => {
  for (const shell of ["bash", "zsh"]) {
    it.each([
      "success",
      "cancellation",
      "error",
    ])(`${shell} preserves cwd and empty stdout on %s`, async (outcome) => {
      const target = await checkout("target");
      if (outcome === "error") await git(["worktree", "lock", target]);
      const installer = fs.readFileSync(path.resolve("install.sh"), "utf8");
      const wrapper = installer.slice(
        installer.indexOf("wt() {"),
        installer.indexOf("# source completions"),
      );
      const binDir = path.join(tmpDir, "bin");
      fs.mkdirSync(binDir);
      fs.symlinkSync(path.resolve("bin/wt-bin"), path.join(binDir, "wt-bin"));
      const script = path.join(tmpDir, "shell-test");
      const state = path.join(tmpDir, "shell-state");
      fs.writeFileSync(
        script,
        `export PATH="$1:$PATH"\nexport TMPDIR="$3"\n${wrapper}\nwt --remove-all\nrc=$?\nprintf '%s\\n%s\\n' "$rc" "$PWD" > "$2"\nexit "$rc"\n`,
      );
      const steps =
        outcome === "error"
          ? []
          : [{ waitFor: removalPrompt, input: outcome === "success" ? "y" : "n" }];
      const result = await terminal(steps, repoRoot, [shell, script, binDir, state, tmpDir]);
      expect(result.code === 0).toBe(outcome !== "error");
      expect(result.stdout).toBe("");
      expect(fs.readFileSync(state, "utf8").trim().split("\n")).toEqual([
        String(result.code),
        repoRoot,
      ]);
      expect(fs.existsSync(target)).toBe(outcome !== "success");
    });
  }

  it("advertises the flag in help and both completion scripts", async () => {
    for (const args of [["--help"], ["completion", "bash"], ["completion", "zsh"]]) {
      const result = await run(args);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain("--remove-all");
    }
  });
});

describe("--remove-all routing", () => {
  it("handles an empty batch without requiring navigation output or a terminal", async () => {
    const result = await run(["--remove-all"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("No other worktrees");
    expect(await list(repoRoot)).toHaveLength(1);
  });

  it("accepts the shell wrapper's output-file option without writing navigation", async () => {
    const result = await run(["--output-file", outputFile, "--remove-all"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).not.toContain("\x1b");
    expect(fs.readFileSync(outputFile, "utf8")).toBe("");
  });

  it.each([
    { args: ["--remove-all", "branch"] },
    { args: ["branch", "--remove-all"] },
    { args: ["--remove-all", "--yes"] },
    { args: ["--remove-all", "--force"] },
    { args: ["--remove-all", "--remove-all"] },
    { args: ["--help", "--remove-all"] },
    { args: ["--remove-all", "--output-file"] },
  ])("rejects incompatible arguments $args", async ({ args }) => {
    const target = await checkout("target");
    const result = await run(args);
    expect(result.code).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Usage:");
    expect(fs.existsSync(target)).toBe(true);
    expect(await git(["branch", "--format=%(refname:short)"])).toBe("main\ntarget");
  });

  it("preserves help and completion output", async () => {
    for (const args of [["--help"], ["completion", "bash"], ["completion", "zsh"]]) {
      const result = await run(args);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain("wt");
      expect(result.stdout).not.toContain("\x1b");
    }
  });

  it("rejects nonterminal input without loading the TUI or creating a branch", async () => {
    const target = await checkout("target");
    const result = await run(["--remove-all", "--output-file", outputFile]);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("interactive terminal");
    expect(result.stdout).toBe("");
    expect(result.stderr).not.toContain("\x1b");
    expect(fs.readFileSync(outputFile, "utf8")).toBe("");
    expect(fs.existsSync(target)).toBe(true);
  });
});
