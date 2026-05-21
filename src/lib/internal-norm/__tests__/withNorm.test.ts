import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
process.env.NORM_BEARER_TOKEN = "bearer";
process.env.NORM_SIGNING_SECRET = "secret";

import { strict as assert } from "node:assert";
import { createHmac, createHash, randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import { withNorm } from "@/lib/internal-norm/withNorm";
import NormCallLog from "@/models/NormCallLog";
import { __clearNormPermissionsCacheForTests } from "@/lib/internal-norm/permissions";
import { __clearKillSwitchCacheForTests } from "@/lib/internal-norm/killSwitch";
import { __resetForTests as __resetRateLimits } from "@/lib/internal-norm/rateLimits";

const TestSchema = z.object({ status: z.literal("ok"), echo: z.string() });

function buildRequest(method: string, urlPath: string, query: string, body: string) {
  const ts = String(Date.now());
  const nonce = randomBytes(16).toString("hex");
  const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
  const signing = [method, urlPath, query, sha256(body), ts, nonce].join("\n");
  const sig = createHmac("sha256", "secret").update(signing).digest("hex");
  const url = `http://localhost${urlPath}${query ? `?${query}` : ""}`;
  const headers: Record<string, string> = {
    authorization: "Bearer bearer",
    "x-norm-timestamp": ts,
    "x-norm-nonce": nonce,
    "x-norm-signature": sig,
  };
  if (method !== "GET" && method !== "HEAD") {
    headers["content-type"] = "application/json";
  }
  return new Request(url, {
    method,
    headers,
    body: method === "GET" || method === "HEAD" ? undefined : body,
  });
}

async function run() {
  await connectDB();
  // Drop any test logs first
  await NormCallLog.deleteMany({
    registryKey: { $in: ["test.echo", "test.forbidden"] },
  });
  __clearNormPermissionsCacheForTests();
  __clearKillSwitchCacheForTests();
  __resetRateLimits();

  try {
    // Register a test endpoint via the registry would normally happen at import-time. For this
    // unit test we bypass by passing the spec inline. The Norm User + Role must already exist
    // (run npm run migrate:create-norm first). We use "facebookAds.view" because it's in Norm's
    // initial role permission set.
    const handler = withNorm(
      {
        tier: "read",
        registryKey: "test.echo",
        requiredPermission: "facebookAds.view",
        responseSchema: TestSchema,
      },
      async (ctx) => {
        return ctx.ok({
          status: "ok" as const,
          echo: ctx.url.searchParams.get("msg") ?? "",
        });
      },
    );

    // Also build a handler that requires a permission Norm does NOT have, to verify 403.
    // Reads bypass the per-permission grant (see withNorm.ts), so we use a write_safe
    // tier here — the 403 path still applies to writes/triggers.
    const handlerForbidden = withNorm(
      {
        tier: "write_safe",
        registryKey: "test.forbidden",
        requiredPermission: "users.delete",
        responseSchema: TestSchema,
      },
      async (ctx) =>
        ctx.ok({ status: "ok" as const, echo: "should never reach here" }),
    );

    // Happy path
    const req = buildRequest("GET", "/api/internal/norm/v1/test/echo", "msg=hi", "");
    const res = await handler(req);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.echo, "hi");

    // Audit row written
    const log = await NormCallLog.findOne({ requestId: body.requestId });
    assert.ok(log, "NormCallLog row exists");
    assert.equal(log!.responseStatus, 200);
    assert.equal(log!.permissionChecked, "facebookAds.view");
    assert.equal(log!.permissionGranted, true);

    // Bad bearer → 401, no body leak
    const reqBad = new Request("http://localhost/api/internal/norm/v1/test/echo", {
      method: "GET",
      headers: { authorization: "Bearer WRONG" },
    });
    const res401 = await handler(reqBad);
    assert.equal(res401.status, 401);

    // Permission missing → 403
    const reqForbidden = buildRequest(
      "GET",
      "/api/internal/norm/v1/test/forbidden",
      "",
      "",
    );
    const res403 = await handlerForbidden(reqForbidden);
    assert.equal(res403.status, 403);
    const body403 = await res403.json();
    assert.equal(body403.code, "permission_denied");

    console.log(
      "✓ withNorm: happy path + 401 + 403 + NormCallLog written",
    );
  } finally {
    await NormCallLog.deleteMany({
      registryKey: { $in: ["test.echo", "test.forbidden"] },
    });
    await mongoose.disconnect();
  }
}

void run().catch((e) => {
  console.error(e);
  process.exit(1);
});
