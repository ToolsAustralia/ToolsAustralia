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
  /**
   * Extract a route param from the URL pathname for `[id]`-style routes. The
   * `position` is the zero-based offset of the param from the END of the path
   * after trimming the trailing slash if present.
   *
   * Examples (registered registry path → call site):
   *   `/v1/winners/:id`                            → ctx.param(0) // → "<id>"
   *   `/v1/affiliate/:id`                          → ctx.param(0) // → "<id>"
   *   `/v1/pending-actions/:id/status`             → ctx.param(1) // → "<id>"
   *   `/v1/charge-past-due/runs/:runId`            → ctx.param(0) // → "<runId>"
   *   `/v1/users/:id/payment-events`               → ctx.param(1) // → "<id>"
   *   `/v1/users/:id/deletion-summary`             → ctx.param(1) // → "<id>"
   *
   * Returns null when the position is out of range. Prefer this over
   * hand-rolling `ctx.url.pathname.split("/")` — keeps trailing-slash and
   * empty-segment handling consistent across all [id] routes.
   */
  param: (position: number) => string | null;
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
    // CRITICAL: clone() so the handler can later re-read the body via
    // ctx.request.json() (e.g. POST-body reads like monthly-coupon.target-users.*).
    // Reading the original request.body would consume the stream once.
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

    // 2. Permission check.
    // Read-tier endpoints bypass the per-permission grant — reads are inherently safe
    // (no mutation, no money movement, no external comms) and the PII boundary lives
    // in each endpoint's responseSchema projection, not in the role grant. Sole-operator
    // governance: kill switch + registry omission + rate limits remain as control levers.
    // Write/trigger tiers still require an explicit grant on the Norm Role.
    await connectDB();
    let permissionGranted = true;
    if (options.tier !== "read") {
      permissionGranted = await hasNormPermission(options.requiredPermission);
      if (!permissionGranted) {
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
      // Pre-compute the URL segments once per request for ctx.param().
      // Trim leading/trailing slashes and drop empty segments so a trailing
      // slash doesn't shift positions (e.g. "/v1/users/abc/" still yields
      // ["v1", "users", "abc"]).
      const pathSegments = url.pathname.split("/").filter(Boolean);
      const ctx: NormCtx = {
        requestId,
        url,
        request,
        param: (position: number) => {
          const idx = pathSegments.length - 1 - position;
          return idx >= 0 && idx < pathSegments.length ? pathSegments[idx] : null;
        },
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
            // Serialise the PARSED value, not the handler's original object. Zod object
            // schemas strip undeclared keys, so this is what actually makes the
            // responseSchema a PII *projection* rather than merely a gate — the guarantee
            // the read-tier permission bypass above (see "the PII boundary lives in each
            // endpoint's responseSchema projection") depends on. Returning `data` here let
            // any field a service happened to hydrate reach Norm undeclared: the concrete
            // case was cancellation-flow-analytics shipping customer email + surname that
            // its schema never mentions. See docs/internal-norm/gotchas.md G11.
            return NextResponse.json({ success: true, data: parsed.data, requestId });
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
