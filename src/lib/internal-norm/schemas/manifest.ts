// src/lib/internal-norm/schemas/manifest.ts
import { z } from "zod";

export const NormManifestEntrySchema = z.object({
  registryKey: z.string(),
  tier: z.enum(["read", "write_safe", "trigger_norm_confirm", "trigger_human_approve"]),
  path: z.string(),
  method: z.string(),
  summary: z.string(),
});

export const NormManifestSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string(),
  endpoints: z.array(NormManifestEntrySchema),
});

export type NormManifest = z.infer<typeof NormManifestSchema>;
