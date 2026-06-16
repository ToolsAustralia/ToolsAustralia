/**
 * Bulk Import Profiles — pure helper tests
 *
 * Fences the payload shape (no `relationships` → data-only upsert) and the
 * size-safe chunker (count cap, no-email drop, oversized-profile drop) for
 * `src/utils/integrations/klaviyo/bulk-import.ts`.
 *
 * Run via: `npx tsx src/utils/integrations/klaviyo/__tests__/bulk-import.test.ts`
 */

import assert from "node:assert/strict";
import type { KlaviyoProfile } from "@/types/klaviyo";
import {
  buildBulkImportPayload,
  chunkProfilesForBulkImport,
  type BulkImportProfileEntry,
} from "../bulk-import";

function testBuildPayloadShapeAndNoRelationships() {
  const entry: BulkImportProfileEntry = {
    type: "profile",
    attributes: { email: "a@example.com", first_name: "Ann" },
  };

  const payload = buildBulkImportPayload([entry]);

  assert.deepEqual(payload, {
    data: {
      type: "profile-bulk-import-job",
      attributes: { profiles: { data: [entry] } },
    },
  });

  // Data-only upsert MUST NOT touch list membership/consent.
  assert.equal("relationships" in payload.data, false, "payload.data must not contain a relationships key");
  // Belt-and-braces: no `relationships` anywhere in the serialized body.
  assert.equal(
    JSON.stringify(payload).includes("relationships"),
    false,
    "serialized payload must not contain 'relationships'"
  );
}

function testChunkSplitsByMaxCount() {
  const profiles: KlaviyoProfile[] = Array.from({ length: 5 }, (_, i) => ({
    email: `user${i}@example.com`,
    first_name: `User${i}`,
  }));

  const { chunks, skippedNoEmail, oversized } = chunkProfilesForBulkImport(profiles, { maxCount: 2 });

  assert.equal(chunks.length, 3, "5 profiles at maxCount=2 → 3 chunks");
  assert.deepEqual(
    chunks.map((c) => c.length),
    [2, 2, 1],
    "chunk sizes should be 2, 2, 1"
  );
  assert.equal(skippedNoEmail, 0);
  assert.equal(oversized, 0);
  // Every entry is a well-formed profile resource.
  for (const chunk of chunks) {
    for (const entry of chunk) {
      assert.equal(entry.type, "profile");
      assert.equal(typeof entry.attributes.email, "string");
    }
  }
}

function testDropsProfilesWithoutEmail() {
  const profiles: KlaviyoProfile[] = [
    { email: "has@example.com" },
    { email: "" }, // empty string → dropped
    { email: "   " }, // whitespace-only → dropped (trimmed)
    { email: undefined as unknown as string }, // missing → dropped
    { email: "also@example.com" },
  ];

  const { chunks, skippedNoEmail, oversized } = chunkProfilesForBulkImport(profiles);

  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  assert.equal(total, 2, "only the 2 profiles with a real email survive");
  assert.equal(skippedNoEmail, 3, "3 profiles dropped for missing/empty email");
  assert.equal(oversized, 0);
}

function testCountsOversizedProfiles() {
  // A profile whose serialized JSON exceeds a small per-profile cap is excluded.
  const hugeProperties: Record<string, unknown> = { blob: "x".repeat(1000) };
  const profiles: KlaviyoProfile[] = [
    { email: "small@example.com" },
    { email: "huge@example.com", properties: hugeProperties },
  ];

  const { chunks, skippedNoEmail, oversized } = chunkProfilesForBulkImport(profiles, {
    maxPerProfileBytes: 200,
  });

  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  assert.equal(total, 1, "only the small profile fits");
  assert.equal(oversized, 1, "the huge profile is counted as oversized");
  assert.equal(skippedNoEmail, 0);
  assert.equal(chunks[0][0].attributes.email, "small@example.com");
}

function run() {
  testBuildPayloadShapeAndNoRelationships();
  testChunkSplitsByMaxCount();
  testDropsProfilesWithoutEmail();
  testCountsOversizedProfiles();
  console.error("bulk-import tests passed");
}

run();
