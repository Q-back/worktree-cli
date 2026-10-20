/** Read a deliberate single-key answer from stdin, never a pipe or /dev/tty fallback. */
export function confirmTerminal(question: string): Promise<boolean> {
  const input = process.stdin;
  if (!input.isTTY) throw new Error("Confirmation requires an interactive terminal");
  const wasRaw = input.isRaw;
  return new Promise((resolve) => {
    let settled = false;
    const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGHUP"];
    const finish = (accepted: boolean) => {
      if (settled) return;
      settled = true;
      input.off("data", answer);
      for (const event of ["end", "close", "error"]) input.off(event, cancel);
      for (const signal of signals) process.off(signal, cancel);
      if (!input.destroyed) input.setRawMode(wasRaw);
      input.pause();
      process.stderr.write("\n");
      resolve(accepted);
    };
    const cancel = () => finish(false);
    const answer = (chunk: Buffer) => {
      const key = chunk.toString();
      if (key === "y" || key === "Y") finish(true);
      else if (
        key === "n" ||
        key === "N" ||
        ["\x1b", "\x03", "\x04"].some((control) => key.includes(control))
      )
        cancel();
      else process.stderr.write("Use y or n; Escape cancels.\n");
    };
    input.setRawMode(true);
    input.on("data", answer);
    for (const event of ["end", "close", "error"]) input.on(event, cancel);
    for (const signal of signals) process.on(signal, cancel);
    process.stderr.write(question);
    input.resume();
  });
}
