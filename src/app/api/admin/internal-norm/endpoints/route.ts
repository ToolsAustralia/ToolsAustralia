import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import NormEndpointSettings from "@/models/NormEndpointSettings";
import {
  NORM_ENDPOINTS,
  type NormEndpointSpec,
} from "@/lib/internal-norm/classification";
import { getNormPermissions } from "@/lib/internal-norm/permissions";

export async function GET() {
  const guard = await requirePermission("settings.view");
  if (guard instanceof NextResponse) return guard;
  await connectDB();
  const [settings, normPerms] = await Promise.all([
    NormEndpointSettings.find({}).lean(),
    getNormPermissions(),
  ]);
  const settingsByKey = new Map(
    settings.map((s) => [s.registryKey, s] as const)
  );
  // Cast each registry entry to NormEndpointSpec to access optional fields
  // (responseSchema, legacyAdminCheck) that the `as const satisfies` inference
  // strips from per-entry types. Mirrors the getEndpoint() cast in classification.ts.
  const entries = Object.entries(NORM_ENDPOINTS) as [string, NormEndpointSpec][];
  const rows = entries.map(([key, spec]) => ({
    registryKey: key,
    tier: spec.tier,
    requiredPermission: spec.requiredPermission,
    normHasPermission: normPerms.has(spec.requiredPermission),
    path: spec.path,
    method: spec.method,
    summary: spec.summary,
    disabled: !!settingsByKey.get(key)?.disabled,
    wired: !!spec.responseSchema,
    legacyAdminCheck: !!spec.legacyAdminCheck,
  }));
  return NextResponse.json({ success: true, data: rows });
}
