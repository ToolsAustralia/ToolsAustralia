import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
import { createHmac, createHash, randomBytes } from "node:crypto";

async function main() {
  const bearer = process.env.NORM_BEARER_TOKEN;
  const secret = process.env.NORM_SIGNING_SECRET;
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

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: method !== "GET" ? bodyArg : undefined,
  });
  const text = await res.text();
  console.log(`${res.status} ${res.statusText}`);
  console.log(text);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
