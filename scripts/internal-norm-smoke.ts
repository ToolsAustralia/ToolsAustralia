import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
import { createHmac, createHash, randomBytes } from "node:crypto";

async function main() {
  const bearer = process.env.NORM_BEARER_TOKEN;
  const secret = process.env.NORM_SIGNING_SECRET;
  // NOTE: do NOT default this to `process.env.PORT`. `PORT` in `.env.local` does not control
  // which port `next dev` BINDS to — Next starts at 3000 and auto-increments when that is busy
  // ("Port 3000 is in use ... using available port 3001 instead"), then loads `.env.local` into
  // the app's runtime env afterwards. With several worktrees open, the port `next dev` actually
  // prints is the only reliable one, and it is rarely 3000. Read it off the dev server banner and
  // pass it explicitly:
  //   NORM_SMOKE_BASE=http://localhost:3001 npm run norm:smoke:promo-analytics
  const base = process.env.NORM_SMOKE_BASE || "http://localhost:3000";
  if (!bearer || !secret) {
    console.error("Set NORM_BEARER_TOKEN and NORM_SIGNING_SECRET in .env.local");
    process.exit(1);
  }
  const method = process.argv[2] || "GET";
  const pathArg = process.argv[3] || "/api/internal/norm/v1/health";
  const bodyArg = process.argv[4] || "";
  const url = new URL(base + pathArg);
  const ts = String(Date.now());
  const nonce = randomBytes(16).toString("hex");
  const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
  const signing = [method, url.pathname, url.search.replace(/^\?/, ""), sha256(bodyArg), ts, nonce].join("\n");
  const sig = createHmac("sha256", secret).update(signing).digest("hex");

  const headers: Record<string, string> = {
    authorization: `Bearer ${bearer}`,
    "x-norm-timestamp": ts,
    "x-norm-nonce": nonce,
    "x-norm-signature": sig,
  };
  if (method !== "GET" && bodyArg) headers["content-type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method,
      headers,
      body: method !== "GET" ? bodyArg : undefined,
    });
  } catch (error) {
    // A bare `TypeError: fetch failed` with a nested ECONNREFUSED tells you nothing about the
    // actual problem, which is almost always "no dev server" or "wrong port for this worktree".
    const cause = (error as { cause?: { code?: string } }).cause;
    if (cause?.code === "ECONNREFUSED") {
      console.error(`\n✗ Nothing is listening on ${base}\n`);
      console.error(`  1. Start the app in another terminal:  npm run dev`);
      console.error(`  2. Read the port off its banner — Next starts at 3000 and AUTO-INCREMENTS`);
      console.error(`     when it is busy, so with several worktrees open it is often not 3000.`);
      console.error(`     (\`PORT\` in .env.local does NOT change which port \`next dev\` binds.)`);
      console.error(`  3. Re-run against it:`);
      console.error(`     NORM_SMOKE_BASE=http://localhost:3001 npm run norm:smoke:promo-analytics\n`);
      process.exit(1);
    }
    throw error;
  }
  const text = await res.text();
  console.log(`${res.status} ${res.statusText}`);
  console.log(text);

  // Exit non-zero on a non-2xx. Without this the script printed a 500 and still exited 0, so
  // `npm run norm:smoke` could NEVER fail — which matters because the one failure mode this
  // script exists to catch is a `responseSchema` / handler-output mismatch. That surfaces as a
  // runtime 500 inside `withNorm`, and it is invisible to both `tsc` and `next build`.
  if (!res.ok) {
    console.error(`\n✗ ${method} ${pathArg} returned ${res.status} — smoke FAILED`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
