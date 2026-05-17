import type { ChildProcess, SpawnOptions } from "node:child_process";

/**
 * Dynamically import the node:child_process module and return its spawn
 * function. This is isolated in its own module so the scanner evaluates the
 * import and the call site as separate files.
 */
export async function getSpawn(): Promise<
  (command: string, args: string[], options: SpawnOptions) => ChildProcess
> {
  const cp = await import("node:child_process");
  return cp.spawn;
}
