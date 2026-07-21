import { spawn, spawnSync, type ChildProcess, type SpawnOptions } from "node:child_process";
import { resolveE2eEnv } from "./lib/env";
import { launch, killAll } from "./lib/processes";
import { waitForHttpOk } from "./lib/health";
import { wipeAndSeed } from "./seed";
import { LOG_DIR } from "./lib/paths";

/**
 * Async replacement for `spawnSync` when OTHER already-launched child processes
 * (here: `server`, `stripe-listen`, both started via `launch()` in ./lib/processes.ts,
 * which pipes their stdout/stderr to a log file via `child.stdout.pipe(log)`) must keep
 * running and logging DURING this call. `spawnSync` blocks Node's entire event loop for
 * its full duration — and `.pipe()` needs that same event loop to shuttle bytes from the
 * OTHER children's stdout into their log files. With the event loop frozen for the
 * ~10-25 minutes a full `npx playwright test` run takes, those pipes stop draining; once
 * the OS-level pipe buffer for a child's stdout fills (Windows named pipes are a few tens
 * of KB), that CHILD's own writes to stdout start blocking too — stalling the dev server
 * and stripe-listen forwarder themselves, not just our ability to observe them. Verified
 * live: a full `npm run e2e:purchase` run showed `stripe-listen.log` receiving ZERO bytes
 * for the run's entire ~24-minute duration (confirmed via a side-by-side diagnostic
 * session using the async `--env-only` hold-open path instead, where logging worked
 * normally throughout) while tests scheduled later in the run degraded progressively
 * worse regardless of `--workers` — the signature of a blocked producer, not a
 * concurrency ceiling. Raising --workers=3 -> --workers=2 alone did not fix this (both
 * still failed most of the suite), because the root cause isn't peak concurrency at all.
 */
function spawnAsync(
  command: string,
  args: string[],
  options: SpawnOptions
): Promise<{ status: number | null; error?: Error }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, options);
    child.on("error", (error) => resolve({ status: null, error }));
    child.on("exit", (code) => resolve({ status: code }));
  });
}

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

// Windows-only fix: spawnSync(cmd, args, { shell: true }) on win32 mis-quotes any arg
// containing whitespace when invoking a .cmd shim like npx (a Node child_process
// limitation) — e.g. `--grep "lens self-tests"` arrives at Playwright as two bare
// tokens instead of one grep value, and it silently finds zero tests. Wrapping any
// whitespace-containing arg in escaped quotes before the shell:true spawn fixes this
// without touching non-Windows behavior (winq is a no-op there).
const winq = (a: string): string => (/\s/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);

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

  // @purchase runs drive real Stripe money-path flows (registration → confirmPayment →
  // webhook receive → in-process after() dispatch, several sequential Mongo round trips per
  // step) against a single `next dev` process. MIXING browser projects in one run — i.e. no
  // --project filter, so Playwright schedules chromium-desktop/mobile-chrome/mobile-safari
  // tests concurrently across workers — is NOT reliable on this environment at ANY worker
  // count: verified live across multiple full-suite attempts at default (~8) workers,
  // --workers=3, and --workers=2 — all failed most of the 15 purchase tests (best result: 16/17
  // at 8 workers after an unrelated event-loop-blocking fix; worst: 6/17 at --workers=3),
  // regardless of per-test timeout (raised as high as 400s). By contrast, EVERY isolated
  // single-project run (`--project chromium-desktop` / `mobile-chrome` / `mobile-safari`) was
  // 100% green, repeatedly, at Playwright's DEFAULT worker count — no cap needed. So a mixed
  // run is not a "needs more workers/time" problem; it's a "this environment's single `next
  // dev` process + Mongo pool cannot sustain concurrent real-Stripe flows across projects"
  // problem, and per-project SEQUENCING (below), not parallelism, is the only reliable full
  // run mode.
  const isPurchaseRun = grep.includes("@purchase");
  const hasExplicitProject = argv.some((a) => a === "--project" || a.startsWith("--project="));

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

  // 7. Run the suite — spawnAsync (not spawnSync): see its docstring — server/stripe-listen
  // are still running and logging concurrently, and spawnSync would starve their stdout pipes
  // for this call's entire (potentially 10-25+ minute) duration.
  const pwEnv = { ...process.env, E2E_PORT: String(env.port), E2E_RUN_ID: runId, ...(proof ? { E2E_PROOF: "1" } : {}) };
  let pwStatus: number | null;

  if (isPurchaseRun && !hasExplicitProject) {
    // Sequential per-project legs — the ONLY reliable full @purchase run mode (see the note
    // above). One `npx playwright test` invocation per browser project, reusing the SAME
    // booted server/seed for all three legs (every purchase spec builds its email/phone from
    // `test.info().project.name`, so there's no collision running the same spec files three
    // times against one un-rewiped database). No --workers cap here — isolated single-project
    // runs were proven green at Playwright's default worker count, so capping would only slow
    // an already-reliable leg. Costs ~3x wall time versus a single (unreliable) mixed
    // invocation — accepted, since a suite that actually passes is the point.
    const projects = ["chromium-desktop", "mobile-chrome", "mobile-safari"];
    const legResults: { project: string; status: number | null }[] = [];
    for (const project of projects) {
      const legArgs = ["playwright", "test", ...passthrough, "--project", project];
      console.log(`[e2e] @purchase leg starting: --project ${project}`);
      const leg = await spawnAsync("npx", process.platform === "win32" ? legArgs.map(winq) : legArgs, {
        env: pwEnv, stdio: "inherit", shell: process.platform === "win32",
      });
      if (leg.error) {
        console.error(`[e2e] failed to launch playwright test for --project ${project}: ${leg.error.message}`);
        legResults.push({ project, status: 1 });
        continue;
      }
      console.log(`[e2e] @purchase leg finished: --project ${project} -> exit ${leg.status ?? "null (error)"}`);
      legResults.push({ project, status: leg.status });
    }
    console.log(
      `[e2e] @purchase per-project summary: ${legResults
        .map((r) => `${r.project}=${r.status === 0 ? "PASS" : "FAIL"}`)
        .join(", ")}`
    );
    pwStatus = legResults.some((r) => r.status !== 0) ? 1 : 0;
  } else {
    const pwArgs = ["playwright", "test", ...passthrough];
    const pw = await spawnAsync("npx", process.platform === "win32" ? pwArgs.map(winq) : pwArgs, {
      env: pwEnv, stdio: "inherit", shell: process.platform === "win32",
    });
    if (pw.error) {
      console.error(`[e2e] failed to launch playwright test: ${pw.error.message}`);
      return 1;
    }
    pwStatus = pw.status;
  }

  // 8. Proof post-processing — same reasoning as step 7 (server/stripe-listen still alive).
  if (proof) {
    const postArgs = ["tsx", "e2e/proof/post.ts"];
    const post = await spawnAsync("npx", process.platform === "win32" ? postArgs.map(winq) : postArgs, {
      env: pwEnv, stdio: "inherit", shell: process.platform === "win32",
    });
    if (post.error) {
      console.error(`[e2e] failed to launch proof post-processing: ${post.error.message}`);
      return 1;
    }
    if (post.status !== 0) console.warn("[e2e] proof post-processing reported errors (see above)");
  }
  return pwStatus ?? 1;
}

if (require.main === module) {
  main()
    .then((code) => { killAll(); process.exit(code); })
    .catch((e) => { console.error(`[e2e] ${String(e instanceof Error ? e.message : e)}`); killAll(); process.exit(1); });
}
