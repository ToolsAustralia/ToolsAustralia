import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const children: ChildProcess[] = [];
let cleanedUp = false;

export function launch(
  name: string,
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  logDir: string
): ChildProcess {
  fs.mkdirSync(logDir, { recursive: true });
  const log = fs.createWriteStream(path.join(logDir, `${name}.log`), { flags: "a" });
  const child = spawn(command, args, {
    env,
    shell: process.platform === "win32", // resolves npm/npx/stripe .cmd shims
    windowsHide: true,
  });
  child.stdout?.pipe(log);
  child.stderr?.pipe(log);
  children.push(child);
  console.log(`[e2e] started ${name} (pid ${child.pid}) — logs: ${path.join(logDir, `${name}.log`)}`);
  return child;
}

export function killAll(): void {
  if (cleanedUp) return;
  cleanedUp = true;
  for (const c of children) {
    if (c.pid && c.exitCode === null) {
      if (process.platform === "win32") {
        spawnSync("taskkill", ["/pid", String(c.pid), "/T", "/F"], { stdio: "ignore" });
      } else {
        c.kill("SIGTERM");
      }
    }
  }
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => { killAll(); process.exit(130); });
}
process.on("exit", killAll);
