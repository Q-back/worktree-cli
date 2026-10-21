import { execOrThrow } from "../src/lib/exec.ts";

// Hooks inherit repository-specific Git settings; fixtures must discover their own.
const localVariables = await execOrThrow(["git", "rev-parse", "--local-env-vars"]);
for (const name of localVariables.split("\n")) delete process.env[name];

// Bun 1.3.9's default subprocess environment ignores runtime process.env changes.
Bun.spawn = new Proxy(Bun.spawn, {
  apply(spawn, thisArg, args: unknown[]) {
    const optionsIndex = Array.isArray(args[0]) ? 1 : 0;
    const options = args[optionsIndex] as { env?: NodeJS.ProcessEnv } | undefined;
    args[optionsIndex] = { ...options, env: options?.env ?? process.env };
    return Reflect.apply(spawn, thisArg, args);
  },
});
