import type { ChildProcess } from "node:child_process";

export async function waitForHttpOk(
  url: string,
  timeoutMs: number,
  opts?: { child?: ChildProcess }
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr = "";
  while (Date.now() < deadline) {
    if (opts?.child && opts.child.exitCode !== null) {
      throw new Error(
        `Server process exited (code ${opts.child.exitCode}) before becoming ready — check e2e-artifacts/logs/server.log`
      );
    }
    try {
      const res = await fetch(url);
      if (res.ok) return;
      lastErr = `HTTP ${res.status}`;
    } catch (e) {
      lastErr = (e as Error).message;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Server not ready after ${timeoutMs / 1000}s at ${url} (last: ${lastErr}). Check e2e-artifacts/logs/server.log`);
}
