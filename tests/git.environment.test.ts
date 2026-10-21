import { expect, it } from "bun:test";
import * as path from "node:path";

it("isolates temporary repositories from inherited Git settings", async () => {
  const proc = Bun.spawn([process.execPath, "test", "tests/git.repo.test.ts"], {
    cwd: path.join(import.meta.dir, ".."),
    env: {
      ...process.env,
      GIT_INDEX_FILE: ".git/index",
      GIT_DIR: "inherited-git-dir",
      GIT_WORK_TREE: "inherited-worktree",
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    Bun.readableStreamToText(proc.stdout),
    Bun.readableStreamToText(proc.stderr),
    proc.exited,
  ]);
  expect(code, stdout + stderr).toBe(0);
});

it.each([
  "argv",
  "options",
] as const)("passes the intended environment through Bun.spawn (%s)", async (form) => {
  const previous = process.env.WT_TEST_SPAWN_ENV;
  process.env.WT_TEST_SPAWN_ENV = "from-test";
  try {
    const cmd = [
      process.execPath,
      "-e",
      "process.stdout.write(process.env.WT_TEST_SPAWN_ENV ?? '')",
    ];
    for (const explicit of [false, true]) {
      const options = {
        stdout: "pipe" as const,
        ...(explicit ? { env: { ...process.env, WT_TEST_SPAWN_ENV: "explicit" } } : {}),
      };
      const proc = form === "argv" ? Bun.spawn(cmd, options) : Bun.spawn({ cmd, ...options });
      const output = await Bun.readableStreamToText(proc.stdout);
      expect(await proc.exited).toBe(0);
      expect(output).toBe(explicit ? "explicit" : "from-test");
    }
  } finally {
    if (previous === undefined) delete process.env.WT_TEST_SPAWN_ENV;
    else process.env.WT_TEST_SPAWN_ENV = previous;
  }
});
