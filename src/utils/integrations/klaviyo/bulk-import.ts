/**
 * Klaviyo Bulk Import Profiles — pure payload builder + size-safe chunker.
 *
 * The fast path for large profile-DATA resyncs: Klaviyo's async
 * `POST /profile-bulk-import-jobs/` upserts up to 10,000 profiles per request
 * (vs the per-profile `upsertProfile`, which hits the Profiles API twice each).
 *
 * These two functions are PURE (type-only imports, no network) so they can be
 * unit-tested without hitting Klaviyo. The actual POST/poll lives on the
 * `KlaviyoClient` in `src/lib/klaviyo.ts` (`bulkImportProfiles`, etc.).
 *
 * IMPORTANT: this is a data-only upsert. We deliberately never emit a
 * `data.relationships.lists` key — a bulk-import job with a list relationship
 * would change list membership/consent, which is NOT what a profile-data
 * resync should do.
 *
 * @module utils/integrations/klaviyo/bulk-import
 */

import type { KlaviyoProfile } from "@/types/klaviyo";

/** One profile entry in the bulk-import-job payload (JSON:API). */
export interface BulkImportProfileEntry {
  type: "profile";
  attributes: {
    email: string;
    first_name?: string;
    last_name?: string;
    phone_number?: string;
    properties?: Record<string, unknown>;
  };
}

/** Build the POST /profile-bulk-import-jobs body for a batch of profiles (no list association). */
export function buildBulkImportPayload(entries: BulkImportProfileEntry[]): {
  data: {
    type: "profile-bulk-import-job";
    attributes: { profiles: { data: BulkImportProfileEntry[] } };
  };
} {
  return {
    data: {
      type: "profile-bulk-import-job",
      attributes: { profiles: { data: entries } },
    },
  };
}

/**
 * Map a `KlaviyoProfile` to a bulk-import entry, omitting absent optional
 * identity fields (keeps the serialized size minimal). `properties` is passed
 * through as-is — the client layer is responsible for `cleanProperties`.
 */
function toEntry(profile: KlaviyoProfile, email: string): BulkImportProfileEntry {
  const attributes: BulkImportProfileEntry["attributes"] = { email };
  if (profile.first_name !== undefined) attributes.first_name = profile.first_name;
  if (profile.last_name !== undefined) attributes.last_name = profile.last_name;
  if (profile.phone_number !== undefined) attributes.phone_number = profile.phone_number;
  if (profile.properties !== undefined) attributes.properties = profile.properties;
  return { type: "profile", attributes };
}

/**
 * Split profiles into chunks that respect Klaviyo's bulk-import limits: at most `maxCount`
 * profiles per chunk AND under `maxBytes` serialized payload size. Skips any single profile
 * whose own JSON exceeds the per-profile cap (returns them in `oversized`). Profiles without a
 * non-empty email are dropped (email is the required identifier) and counted in `skippedNoEmail`.
 *
 * Defaults keep a safety margin under Klaviyo's hard limits (10,000 profiles / 5MB / 100KB
 * per profile): `maxCount = 2000`, `maxBytes = 4_500_000`, `maxPerProfileBytes = 100_000`.
 */
export function chunkProfilesForBulkImport(
  profiles: KlaviyoProfile[],
  opts?: { maxCount?: number; maxBytes?: number; maxPerProfileBytes?: number }
): { chunks: BulkImportProfileEntry[][]; skippedNoEmail: number; oversized: number } {
  const maxCount = opts?.maxCount ?? 2000;
  const maxBytes = opts?.maxBytes ?? 4_500_000;
  const maxPerProfileBytes = opts?.maxPerProfileBytes ?? 100_000;

  const chunks: BulkImportProfileEntry[][] = [];
  let current: BulkImportProfileEntry[] = [];
  let currentBytes = 0;
  let skippedNoEmail = 0;
  let oversized = 0;

  for (const profile of profiles) {
    const email = typeof profile.email === "string" ? profile.email.trim() : "";
    if (email === "") {
      skippedNoEmail += 1;
      continue;
    }

    const entry = toEntry(profile, email);
    const entryBytes = Buffer.byteLength(JSON.stringify(entry));

    // A single profile that alone exceeds the per-profile cap can never fit — drop it.
    if (entryBytes > maxPerProfileBytes) {
      oversized += 1;
      continue;
    }

    // Start a new chunk if adding this entry would exceed either the count or byte budget.
    if (current.length > 0 && (current.length >= maxCount || currentBytes + entryBytes > maxBytes)) {
      chunks.push(current);
      current = [];
      currentBytes = 0;
    }

    current.push(entry);
    currentBytes += entryBytes;
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return { chunks, skippedNoEmail, oversized };
}
