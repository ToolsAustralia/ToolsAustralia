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
//
// Also quotes cmd.exe's OWN metacharacters (`|&<>^()`), not just whitespace — found live
// (EXTERNAL mode work, 2026-07): an unquoted `--grep-invert @purchase|@admin` reached
// cmd.exe (shell:true spawns via cmd on win32) with its `|` interpreted as a literal pipe
// operator, splitting the one `npx playwright test ...` command into two ("...@purchase"
// piped into a nonexistent "@admin ..." command) and failing with `'admin' is not
// recognized as an internal or external command`. Same fix shape as the whitespace case:
// quote before the arg ever reaches cmd's parser.
const winq = (a: string): string => (/[\s|&<>^()]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);

/** One `npx playwright test <args>` invocation via spawnAsync (see its docstring for why). */
async function runPlaywrightOnce(
  args: string[],
  env: NodeJS.ProcessEnv
): Promise<{ status: number | null; error?: Error }> {
  const pwArgs = ["playwright", "test", ...args];
  return spawnAsync("npx", process.platform === "win32" ? pwArgs.map(winq) : pwArgs, {
    env, stdio: "inherit", shell: process.platform === "win32",
  });
}

/**
 * Sequential per-project @purchase legs — the ONLY reliable way to run @purchase tests across
 * more than one browser project (see the rationale above `isPurchaseRun`). One
 * `npx playwright test` invocation per browser project, reusing the SAME booted server/seed for
 * all three legs (every purchase spec builds its email/phone from `test.info().project.name`,
 * so there's no collision running the same spec files three times against one un-rewiped
 * database). `baseArgs` must already include whatever `--grep` is needed to scope to @purchase
 * (the caller decides — an explicit `--grep @purchase` run passes its own passthrough args
 * straight through; the full-run split below appends `--grep @purchase` itself). No `--workers`
 * cap here — isolated single-project runs were proven green at Playwright's default worker
 * count, so capping would only slow an already-reliable leg.
 */
async function runSequencedPurchaseLegs(
  baseArgs: string[],
  env: NodeJS.ProcessEnv
): Promise<{ status: number; legResults: { project: string; status: number | null }[] }> {
  const projects = ["chromium-desktop", "mobile-chrome", "mobile-safari"];
  const legResults: { project: string; status: number | null }[] = [];
  for (const project of projects) {
    console.log(`[e2e] @purchase leg starting: --project ${project}`);
    const leg = await runPlaywrightOnce([...baseArgs, "--project", project], env);
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
  return { status: legResults.some((r) => r.status !== 0) ? 1 : 0, legResults };
}

/**
 * EXTERNAL mode (E2E_TARGET_URL set): point read-only suites at a deployed environment
 * (e.g. staging) instead of booting a local dev server against the seeded e2e database.
 * Skips the DB guard/wipeAndSeed, server boot + port pre-flight, and the Stripe CLI
 * webhook forwarder entirely — this mode makes NO Stripe calls and never touches a
 * database. `baseURL` is read from `E2E_TARGET_URL` by playwright.config.ts;
 * `E2E_EXTERNAL=1` is set in the Playwright env so the setup project
 * (e2e/setup/auth.setup.ts, no seeded credentials to log in with) and the specs that
 * depend on seeded state (login/registration/my-account/admin-gate/visual — see their
 * describe-level `test.skip`) skip themselves with a visible reason instead of failing.
 *
 * Two refusals are hard-coded and not configurable via flags:
 *  - `@purchase`/`@admin` can never be explicitly requested via --grep — those are
 *    mutating/privileged suites and must never point at a shared/deployed environment.
 *    `--grep-invert "@purchase|@admin"` is ALSO always appended after the caller's own
 *    passthrough args — Playwright's CLI (commander) takes the LAST occurrence of a
 *    repeated single-value option, so this wins even over a caller-supplied
 *    --grep-invert, making the exclusion non-overridable.
 *  - `--proof` is refused — narrated proof-mode runs assume the seeded local environment
 *    (deterministic seed data, a known member email/password to demo with).
 *  - `--env-only` is refused too (not in the original design note, added as a footgun
 *    guard): there is no local server for it to boot and hold open against a deployed
 *    target — without this check it would silently do nothing useful and hang forever.
 */
async function runExternal(targetUrl: string, argv: string[]): Promise<number> {
  const proof = argv.includes("--proof");
  const envOnly = argv.includes("--env-only");
  const grep = getFlagValue(argv, "--grep");
  const passthrough = argv.filter((a) => a !== "--env-only" && a !== "--proof");
  const runId = Date.now().toString(36);

  if (proof) {
    throw new Error(
      "Refusing: --proof is not supported in EXTERNAL mode (E2E_TARGET_URL is set) — narrated runs assume the seeded, isolated local environment. Unset E2E_TARGET_URL to run --proof locally."
    );
  }
  if (envOnly) {
    throw new Error(
      "Refusing: --env-only is not supported in EXTERNAL mode (E2E_TARGET_URL is set) — there is no local server to boot/hold open against a deployed target. Unset E2E_TARGET_URL to use --env-only locally."
    );
  }
  if (grep && (grep.includes("@purchase") || grep.includes("@admin"))) {
    throw new Error(
      `Refusing: --grep "${grep}" explicitly includes @purchase or @admin in EXTERNAL mode (E2E_TARGET_URL is set). Mutating/privileged suites must never run against a shared/deployed environment. Remove @purchase/@admin from --grep, or unset E2E_TARGET_URL to run locally.`
    );
  }

  console.log(
    `[e2e] EXTERNAL mode: target ${targetUrl} — no server boot, no DB wipe/seed, no Stripe. @purchase and @admin are hard-excluded.`
  );

  // Last occurrence wins in Playwright's CLI parsing — appending ours after the caller's
  // own passthrough args (which may contain nothing, or may contain a caller --grep-invert
  // for something else entirely) makes this the authoritative filter either way.
  const finalArgs = [...passthrough, "--grep-invert", "@purchase|@admin"];
  const pwEnv: NodeJS.ProcessEnv = { ...process.env, E2E_RUN_ID: runId, E2E_EXTERNAL: "1" };

  const pw = await runPlaywrightOnce(finalArgs, pwEnv);
  if (pw.error) {
    console.error(`[e2e] failed to launch playwright test: ${pw.error.message}`);
    return 1;
  }
  return pw.status ?? 1;
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

  // EXTERNAL mode: E2E_TARGET_URL set means "point read-only suites at a deployed
  // environment" — a completely separate, much simpler path than everything below (no
  // local-mode DB guard/seed/server/Stripe concerns apply). See runExternal's docstring.
  const targetUrl = process.env.E2E_TARGET_URL;
  if (targetUrl) {
    return runExternal(targetUrl, argv);
  }

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
  const hasExplicitGrep = argv.some((a) => a === "--grep" || a.startsWith("--grep="));
  const hasExplicitProject = argv.some((a) => a === "--project" || a.startsWith("--project="));
  // A bare full run (`npm run e2e`, no --grep, no --project) used to take the plain
  // single-invocation path below (isPurchaseRun requires an EXPLICIT --grep containing
  // "@purchase" — an empty grep never matches), so @purchase specs ran mixed-parallel across
  // all 3 projects during a real full run — exactly the configuration proven always-red above.
  // (Found live: Task 13's first `npm run e2e` runs showed all 15 purchase tests passing
  // (lucky — the mixed-parallel failure mode is load-dependent, not deterministic) but also
  // destabilized `legal-copy`/`@a11y` specs via the same resource contention.) A full run now
  // SPLITS into two sequential phases instead — see step 7. Excludes `--ui` (`npm run e2e:ui`):
  // that's an interactive, human-driven Playwright UI session, not an automated full run, and
  // splitting it would pop a second (then third) UI window for the sequenced @purchase legs the
  // moment the first is closed — the original single-invocation behavior is what a human wants.
  const hasUi = argv.includes("--ui");
  // A caller-supplied --grep-invert must never be clobbered by phase A's own appended one.
  const hasGrepInvert = argv.some((a) => a === "--grep-invert" || a.startsWith("--grep-invert="));
  // Bare `npm run e2e:proof` (no --grep) keeps the old single-invocation path too — splitting
  // would run phase A under the 1-worker proof profile then 3 more sequential legs, ballooning
  // wall time for a mode meant for a quick narrated capture; scope proof runs via --grep instead.
  const isFullRun = !hasExplicitGrep && !hasExplicitProject && !hasUi && !hasGrepInvert && !proof;

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

  // 3. Pre-flight: refuse to boot on top of a stale/zombie server on this port. MUST run
  // before wipeAndSeed below — a busy port likely means a DIFFERENT e2e session (e.g. a
  // held-open `e2e:env` run) already owns this port/db pair, and aborting here must happen
  // BEFORE that session's database gets wiped out from under it.
  await assertPortFree(env.port);

  // 3b. Fresh data
  await wipeAndSeed(env.mongoUri);

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

  if (isFullRun) {
    // Full run, no --grep/--project from the caller: split into two sequential phases instead
    // of one mixed invocation (see the isFullRun comment above for why the old single-invocation
    // path was unsafe here). Phase A covers everything EXCEPT @purchase, all projects together,
    // Playwright's normal parallelism (unaffected by the @purchase mixed-run problem — only
    // @purchase specs drive the concurrent real-Stripe load that's unreliable). Phase B is the
    // existing sequenced-per-project @purchase legs, scoped via an explicit `--grep @purchase`
    // appended here. Overall status is non-zero if EITHER phase failed.
    console.log("[e2e] full run: splitting into phase A (non-@purchase, parallel) + phase B (@purchase, sequenced per project)");

    const phaseA = await runPlaywrightOnce([...passthrough, "--grep-invert", "@purchase"], pwEnv);
    if (phaseA.error) {
      console.error(`[e2e] failed to launch playwright test (phase A): ${phaseA.error.message}`);
      return 1;
    }
    console.log(`[e2e] phase A (non-@purchase, parallel) finished -> exit ${phaseA.status ?? "null (error)"}`);

    const phaseB = await runSequencedPurchaseLegs([...passthrough, "--grep", "@purchase"], pwEnv);
    console.log(`[e2e] phase B (@purchase, sequenced) finished -> exit ${phaseB.status}`);

    pwStatus = phaseA.status !== 0 || phaseB.status !== 0 ? 1 : 0;
  } else if (isPurchaseRun && !hasExplicitProject) {
    // Explicit `--grep @purchase` (e.g. `npm run e2e:purchase`), no --project filter: same
    // sequenced-legs strategy as phase B above, using the caller's own passthrough args
    // (already contains `--grep @purchase`) unchanged from the original behavior.
    const { status } = await runSequencedPurchaseLegs(passthrough, pwEnv);
    pwStatus = status;
  } else {
    // Explicit --grep (not @purchase) and/or explicit --project: single invocation, unchanged.
    const pw = await runPlaywrightOnce(passthrough, pwEnv);
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
