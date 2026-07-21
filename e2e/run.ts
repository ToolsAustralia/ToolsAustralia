import { spawnSync, type ChildProcess } from "node:child_process";
import { resolveE2eEnv } from "./lib/env";
import { launch, killAll } from "./lib/processes";
import { waitForHttpOk } from "./lib/health";
import { wipeAndSeed } from "./seed";
import { LOG_DIR } from "./lib/paths";

function getStripeListenSecret(): string | null {
  const r = spawnSync("stripe", ["listen", "--print-secret"], {
    encoding: "utf8",
    shell: process.platform === "win32",
    timeout: 30_000,
  });
  const secret = (r.stdout || "").trim();
  return r.status === 0 && secret.startsWith("whsec_") ? secret : null;
}

export function getFlagValue(argv: string[], flag: string): string {
  const i = argv.indexOf(flag);
  if (i >= 0) return argv[i + 1] ?? "";
  const eq = argv.find((a) => a.startsWith(flag + "="));
  return eq ? eq.slice(flag.length + 1) : "";
}

async function assertPortFree(port: number): Promise<void> {
  let busy = false;
  try {
    await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(2000) });
    busy = true; // fetch resolved — something is listening and responded
  } catch (e) {
    const name = (e as { name?: string } | undefined)?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      busy = true; // connection accepted but unresponsive
    }
    // otherwise: connection-refused-style rejection — port is free
  }
  if (busy) {
    throw new Error(`Port ${port} is already in use — a stale server may be running. Kill it or set E2E_PORT to a free port.`);
  }
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const envOnly = argv.includes("--env-only");
  const proof = argv.includes("--proof");
  const isBuild = process.env.E2E_BUILD === "1";
  const grep = getFlagValue(argv, "--grep");
  const smokeOnly = grep === "@smoke";
  const passthrough = argv.filter((a) => a !== "--env-only" && a !== "--proof");
  const runId = Date.now().toString(36);

  // 1. Env + guards (throws on unsafe DB or live Stripe key)
  let env = resolveE2eEnv();

  // 2. Stripe webhook secret (needed before server boot)
  const secret = getStripeListenSecret();
  if (!secret) {
    const msg =
      "Stripe CLI unavailable or not logged in. Install it and run `stripe login` (test mode). " +
      "Purchase specs cannot run without webhook forwarding.";
    if (envOnly || smokeOnly) console.warn(`[e2e] WARN: ${msg} Continuing without webhooks.`);
    else throw new Error(msg);
  } else {
    env = resolveE2eEnv({ webhookSecret: secret });
  }

  // 3. Fresh data
  await wipeAndSeed(env.mongoUri);

  // 3b. Pre-flight: refuse to boot on top of a stale/zombie server on this port
  await assertPortFree(env.port);

  // 4. App server
  let serverChild: ChildProcess;
  if (isBuild) {
    console.log("[e2e] E2E_BUILD=1 — building production bundle (this takes minutes)…");
    const b = spawnSync("npm", ["run", "build"], { env: env.overlay, stdio: "inherit", shell: process.platform === "win32" });
    if (b.status !== 0) throw new Error("next build failed");
    serverChild = launch("server", "npm", ["run", "start", "--", "-p", String(env.port)], env.overlay, LOG_DIR);
  } else {
    serverChild = launch("server", "npm", ["run", "dev", "--", "-p", String(env.port)], env.overlay, LOG_DIR);
  }
  await waitForHttpOk(`${env.baseUrl}/api/test-db`, isBuild ? 120_000 : 240_000, { child: serverChild });
  console.log(`[e2e] server ready at ${env.baseUrl} (db: e2e)`);

  // 5. Webhook forwarder
  if (secret) {
    launch("stripe-listen", "stripe", ["listen", "--forward-to", `localhost:${env.port}/api/stripe/webhook`], process.env, LOG_DIR);
  }

  // 6. Hold-open mode (Playwright MCP / codegen authoring)
  if (envOnly) {
    console.log(`\n[e2e] Environment held open at ${env.baseUrl}`);
    console.log(`[e2e]   member: ${process.env.E2E_TEST_USER_EMAIL || "e2e.member@e2e.local"}`);
    console.log("[e2e]   Attach Playwright MCP or `npx playwright codegen` here. Ctrl+C to tear down.");
    await new Promise(() => {}); // hold until signal
  }

  // 7. Run the suite
  const pwEnv = { ...process.env, E2E_PORT: String(env.port), E2E_RUN_ID: runId, ...(proof ? { E2E_PROOF: "1" } : {}) };
  const pw = spawnSync("npx", ["playwright", "test", ...passthrough], {
    env: pwEnv, stdio: "inherit", shell: process.platform === "win32",
  });
  if (pw.error) {
    console.error(`[e2e] failed to launch playwright test: ${pw.error.message}`);
    return 1;
  }

  // 8. Proof post-processing
  if (proof) {
    const post = spawnSync("npx", ["tsx", "e2e/proof/post.ts"], {
      env: pwEnv, stdio: "inherit", shell: process.platform === "win32",
    });
    if (post.error) {
      console.error(`[e2e] failed to launch proof post-processing: ${post.error.message}`);
      return 1;
    }
    if (post.status !== 0) console.warn("[e2e] proof post-processing reported errors (see above)");
  }
  return pw.status ?? 1;
}

if (require.main === module) {
  main()
    .then((code) => { killAll(); process.exit(code); })
    .catch((e) => { console.error(`[e2e] ${String(e instanceof Error ? e.message : e)}`); killAll(); process.exit(1); });
}
