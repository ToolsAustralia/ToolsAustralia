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
  // Each chunk now holds the ORIGINAL KlaviyoProfiles (ready for klaviyo.bulkImportProfiles).
  for (const chunk of chunks) {
    for (const profile of chunk) {
      assert.equal(typeof profile.email, "string");
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
  assert.equal(chunks[0][0].email, "small@example.com");
}

function testSplitsByMaxBytes() {
  // Each profile carries ~1KB of properties and individually fits under
  // maxPerProfileBytes, but two together exceed maxBytes → a new chunk starts.
  const heavyProperties: Record<string, unknown> = { blob: "x".repeat(1000) };
  const profiles: KlaviyoProfile[] = Array.from({ length: 3 }, (_, i) => ({
    email: `heavy${i}@example.com`,
    properties: heavyProperties,
  }));

  const { chunks, skippedNoEmail, oversized } = chunkProfilesForBulkImport(profiles, {
    // Generous count cap (so the split is driven by bytes, not count) but a tight
    // byte budget that fits roughly one profile per chunk.
    maxCount: 100,
    maxBytes: 1500,
    maxPerProfileBytes: 100_000,
  });

  // Byte budget forces one profile per chunk → 3 chunks.
  assert.equal(chunks.length, 3, "3 byte-heavy profiles at maxBytes≈1 each → 3 chunks");
  assert.deepEqual(
    chunks.map((c) => c.length),
    [1, 1, 1],
    "byte budget splits into single-profile chunks"
  );
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  assert.equal(total, 3, "no profile dropped — all fit under the per-profile cap");
  assert.equal(skippedNoEmail, 0);
  assert.equal(oversized, 0);
}

function run() {
  testBuildPayloadShapeAndNoRelationships();
  testChunkSplitsByMaxCount();
  testSplitsByMaxBytes();
  testDropsProfilesWithoutEmail();
  testCountsOversizedProfiles();
  console.error("bulk-import tests passed");
}

run();
