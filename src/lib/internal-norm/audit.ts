// src/lib/internal-norm/audit.ts
import NormCallLog from "@/models/NormCallLog";
import { createHash, randomUUID } from "node:crypto";

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export function newRequestId(): string {
  return randomUUID().replace(/-/g, "");
}

export interface AuditBeginInput {
  requestId: string;
  registryKey: string;
  tier: string;
  method: string;
  path: string;
  queryHash: string;
  bodyHash: string;
  ip: string;
  userAgent: string;
  signatureValid: boolean;
  rateLimitState: { remaining: number; limit: number; windowMs: number };
  permissionChecked: string;
  permissionGranted: boolean;
}

export async function beginAudit(input: AuditBeginInput): Promise<unknown> {
  try {
    return await NormCallLog.create({
      ...input,
      responseStatus: 0,
      durationMs: 0,
      tierContext: {},
    });
  } catch (e) {
    console.error("[norm] beginAudit failed", e);
    return null;
  }
}

export async function endAudit(
  requestId: string,
  patch: {
    responseStatus: number;
    durationMs: number;
    responseHash: string;
    errorCode?: string;
    tierContext?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await NormCallLog.updateOne({ requestId }, { $set: patch });
  } catch (e) {
    console.error("[norm] endAudit failed", e);
  }
}
