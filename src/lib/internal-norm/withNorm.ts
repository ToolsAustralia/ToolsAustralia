// src/lib/internal-norm/withNorm.ts
import { NextResponse } from "next/server";
import type { z } from "zod";
import connectDB from "@/lib/mongodb";
import type { Permission } from "@/lib/permissions";
import { verifyNormRequest } from "./auth";
import { hasNormPermission } from "./permissions";
import { isEndpointDisabled } from "./killSwitch";
import { checkNormRateLimit } from "./rateLimits";
import { beginAudit, endAudit, newRequestId, sha256 } from "./audit";
import { getEndpoint, type NormTier } from "./classification";

interface WithNormOptions {
  tier: NormTier;
  registryKey: string;
  /** Permission from @/lib/permissions catalog that Norm's Role must hold. */
  requiredPermission: Permission;
  responseSchema?: z.ZodTypeAny;
  perEndpointPerMinute?: number;
  perEndpointPerDay?: number;
}

export interface NormCtx {
  requestId: string;
  url: URL;
  request: Request;
  /** Wrap a successful payload in the success envelope and validate against responseSchema. */
  ok: <T>(data: T) => NextResponse;
  /** Emit a structured error response. */
  error: (status: number, code: string, message: string, details?: unknown) => NextResponse;
}

export type NormHandler = (ctx: NormCtx) => Promise<NextResponse> | NextResponse;

function clientKeyFor(req: Request): string {
  return (req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
}

export function withNorm(options: WithNormOptions, handler: NormHandler) {
  // Validate registry consistency at boot (best-effort — getEndpoint may be undefined for
  // ad-hoc test endpoints, which we allow when the caller passes options.tier directly).
  const known = getEndpoint(options.registryKey);
  if (known && known.tier !== options.tier) {
    console.error(
      `[norm] tier mismatch for ${options.registryKey}: registry=${known.tier}, route=${options.tier}`,
    );
  }

  return async function normRouteHandler(request: Request): Promise<NextResponse> {
    const started = Date.now();
    const requestId = newRequestId();
    const url = new URL(request.url);
    const method = request.method;
    const path = url.pathname;
    const query = url.search.replace(/^\?/, "");
    const rawBody =
      method === "GET" || method === "HEAD" ? "" : await request.clone().text();

    // 1. Auth
    const verdict = await verifyNormRequest({
      method,
      path,
      query,
      rawBody,
      bearer:
        (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "") || null,
      timestamp: request.headers.get("x-norm-timestamp"),
      nonce: request.headers.get("x-norm-nonce"),
      signature: request.headers.get("x-norm-signature"),
    });
    if (!verdict.ok) {
      return NextResponse.json(
        {
          success: false,
          error: `auth: ${verdict.reason}`,
          code: verdict.reason,
          requestId,
        },
        { status: verdict.status },
      );
    }

    // 2. Permission check (Norm's Role must grant requiredPermission)
    await connectDB();
    const permissionGranted = await hasNormPermission(options.requiredPermission);
    if (!permissionGranted) {
      // Audit the rejection too — useful for "why is Norm getting 403?" debugging
      await beginAudit({
        requestId,
        registryKey: options.registryKey,
        tier: options.tier,
        method,
        path,
        queryHash: sha256(query),
        bodyHash: sha256(rawBody),
        ip: clientKeyFor(request),
        userAgent: request.headers.get("user-agent") || "",
        signatureValid: true,
        rateLimitState: { remaining: 0, limit: 0, windowMs: 0 },
        permissionChecked: options.requiredPermission,
        permissionGranted: false,
      });
      await endAudit(requestId, {
        responseStatus: 403,
        durationMs: Date.now() - started,
        responseHash: "",
        errorCode: "permission_denied",
      });
      return NextResponse.json(
        {
          success: false,
          error: `Norm role missing permission: ${options.requiredPermission}`,
          code: "permission_denied",
          requestId,
        },
        { status: 403 },
      );
    }

    // 3. Kill switch
    if (await isEndpointDisabled(options.registryKey)) {
      return NextResponse.json(
        { success: false, error: "endpoint disabled", code: "disabled", requestId },
        { status: 503 },
      );
    }

    // 4. Rate limit
    const rl = checkNormRateLimit({
      tier: options.tier,
      registryKey: options.registryKey,
      clientKey: clientKeyFor(request),
      perEndpointPerMinute: options.perEndpointPerMinute,
      perEndpointPerDay: options.perEndpointPerDay,
    });
    if (!rl.ok) {
      return NextResponse.json(
        { success: false, error: "rate limited", code: "rate_limited", requestId },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
      );
    }

    // 5. Audit begin
    await beginAudit({
      requestId,
      registryKey: options.registryKey,
      tier: options.tier,
      method,
      path,
      queryHash: sha256(query),
      bodyHash: sha256(rawBody),
      ip: clientKeyFor(request),
      userAgent: request.headers.get("user-agent") || "",
      signatureValid: true,
      rateLimitState: { remaining: rl.remaining, limit: rl.limit, windowMs: 60_000 },
      permissionChecked: options.requiredPermission,
      permissionGranted: true,
    });

    // 6. Handler
    let res: NextResponse;
    let responseStatus = 500;
    let responseBody = "";
    let errorCode: string | undefined;
    try {
      const ctx: NormCtx = {
        requestId,
        url,
        request,
        ok: <T,>(data: T) => {
          if (options.responseSchema) {
            const parsed = options.responseSchema.safeParse(data);
            if (!parsed.success) {
              errorCode = "response_schema_invalid";
              console.error("[norm] response schema invalid", parsed.error.issues);
              return NextResponse.json(
                { success: false, error: "internal", code: errorCode, requestId },
                { status: 500 },
              );
            }
          }
          return NextResponse.json({ success: true, data, requestId });
        },
        error: (status, code, message, details) =>
          NextResponse.json(
            { success: false, error: message, code, details, requestId },
            { status },
          ),
      };
      res = await handler(ctx);
      responseStatus = res.status;
      responseBody = await res.clone().text();
    } catch (e) {
      errorCode = "handler_exception";
      console.error("[norm] handler threw", e);
      res = NextResponse.json(
        { success: false, error: "internal", code: errorCode, requestId },
        { status: 500 },
      );
      responseStatus = 500;
      responseBody = await res.clone().text();
    }

    // 7. Audit end
    await endAudit(requestId, {
      responseStatus,
      durationMs: Date.now() - started,
      responseHash: sha256(responseBody),
      ...(errorCode ? { errorCode } : {}),
    });

    return res;
  };
}
