export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

export async function exec(cmd: string[], opts: { cwd?: string } = {}): Promise<ExecResult> {
  const proc = Bun.spawn(cmd, {
    ...(opts.cwd !== undefined ? { cwd: opts.cwd } : {}),
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, code] = await Promise.all([
    Bun.readableStreamToText(proc.stdout),
    Bun.readableStreamToText(proc.stderr),
    proc.exited,
  ]);

  return { stdout: stdout.trim(), stderr: stderr.trim(), code };
}

export async function execOrThrow(cmd: string[], opts: { cwd?: string } = {}): Promise<string> {
  const result = await exec(cmd, opts);
  if (result.code !== 0) {
    throw new Error(result.stderr || `Command failed: ${cmd.join(" ")}`);
  }
  return result.stdout;
}
