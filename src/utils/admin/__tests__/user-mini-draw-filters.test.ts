/**
 * The two mini-draw user filters — proof of the query SHAPE.
 *
 * Run: `npm run test:user-mini-draw-filters`
 *
 * Stubs `MiniDraw.find` (the pattern from PromoAnalyticsRepository-aggregation.test.ts) so this
 * never dials a database, then asserts the Mongo filter `buildUserFilter` produces. The value is
 * in the shape: `$elemMatch` vs two loose conditions, and `$not` vs a negated comparison, are the
 * two ways this silently returns the wrong people.
 */

import assert from "node:assert/strict";

(global as unknown as { mongoose: { conn: unknown; promise: unknown } }).mongoose = {
  conn: { readyState: 1, db: { admin: () => ({ ping: async () => ({}) }) } },
  promise: null,
};

type FindStub = { find: (...args: unknown[]) => unknown };

/** Replace `MiniDraw.find(...).select(...).lean()` with a canned list of active draw ids. */
function stubActiveDraws(model: FindStub, ids: string[]): () => void {
  const original = model.find;
  model.find = () => ({
    select: () => ({ lean: async () => ids.map((id) => ({ _id: id })) }),
  });
  return () => {
    model.find = original;
  };
}

let failures = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Pull the $and clauses so assertions don't depend on ordering of unrelated filters. */
function andClauses(filter: Record<string, unknown>): Array<Record<string, unknown>> {
  return (filter.$and as Array<Record<string, unknown>>) ?? [];
}

const ACTIVE_IDS = ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012"];

async function main() {
  console.log("\nUser mini-draw filters — query shape");

  const MiniDraw = (await import("@/models/MiniDraw")).default as unknown as FindStub;
  const { buildUserFilter } = await import("../userFilterBuilder");

  // ── Mini Pack purchase — the PURCHASE LEDGER, not the participation bucket ──────────────
  const bought = await buildUserFilter({ miniDrawPackage: "yes" });
  check("bought a Mini Pack reads User.miniDrawPackages, not entriesBySource", () => {
    const clause = andClauses(bought).find((c) => "miniDrawPackages.packageId" in c);
    assert.ok(
      clause,
      "must key off the purchase ledger — entriesBySource is reset to 0 when a winner is " +
        "selected, so it reports genuine buyers as never having bought",
    );
    assert.deepEqual(clause, { "miniDrawPackages.packageId": { $exists: true } });

    assert.equal(
      andClauses(bought).some((c) => "miniDrawParticipation" in c),
      false,
      "must NOT touch miniDrawParticipation — upsells and admin entry edits write that bucket too",
    );
  });

  const neverBought = await buildUserFilter({ miniDrawPackage: "no" });
  check("never bought is absence of the field, so users with no array match", () => {
    const clause = andClauses(neverBought).find((c) => "miniDrawPackages.packageId" in c);
    assert.ok(clause, "expected a miniDrawPackages clause");
    assert.deepEqual(clause, { "miniDrawPackages.packageId": { $exists: false } });
  });

  check("the filter is package-id agnostic (Mini Pack 1-3, retired 4-8, additional-*-pack-mini)", () => {
    // The predicate names no package id at all, so renaming a tier or adding one cannot
    // silently drop buyers out of the segment. This asserts that property directly.
    const serialised = JSON.stringify(andClauses(bought));
    for (const id of ["mini-pack-1", "mini-pack-7", "additional-vip-pack-mini", "additional-tradie-pack-mini"]) {
      assert.equal(serialised.includes(id), false, `must not hard-code ${id}`);
    }
  });

  // ── Active participation (resolved from the MiniDraw collection) ────────────────────────
  {
    const restore = stubActiveDraws(MiniDraw, ACTIVE_IDS);
    try {
      const inDraw = await buildUserFilter({ inActiveMiniDraw: "yes" });
      check("in an active mini draw matches draw ids AND entries on the SAME element", () => {
        const clause = andClauses(inDraw).find((c) => "miniDrawParticipation" in c);
        assert.ok(clause, "expected a miniDrawParticipation clause");
        const em = (clause!.miniDrawParticipation as Record<string, unknown>).$elemMatch as Record<
          string,
          unknown
        >;
        assert.ok(em, "must use $elemMatch — separate conditions can match different elements");
        assert.ok(em.miniDrawId, "must constrain the draw id");
        assert.deepEqual(em.totalEntries, { $gt: 0 }, "a zero-entry row is not participation");
        const ids = (em.miniDrawId as { $in: unknown[] }).$in;
        assert.equal(ids.length, ACTIVE_IDS.length, "uses the resolved ACTIVE draws");
      });

      const notInDraw = await buildUserFilter({ inActiveMiniDraw: "no" });
      check("not in an active mini draw negates the whole element match", () => {
        const clause = andClauses(notInDraw).find((c) => "miniDrawParticipation" in c);
        assert.ok(clause, "expected a miniDrawParticipation clause");
        assert.ok((clause!.miniDrawParticipation as Record<string, unknown>).$not);
      });
    } finally {
      restore();
    }
  }

  // ── No active draws at all ──────────────────────────────────────────────────────────────
  {
    const restore = stubActiveDraws(MiniDraw, []);
    try {
      const inDraw = await buildUserFilter({ inActiveMiniDraw: "yes" });
      check("yes with no active draws matches NOBODY, never everybody", () => {
        const clause = andClauses(inDraw).find((c) => "_id" in c);
        assert.ok(clause, "expected an impossible _id clause");
        assert.deepEqual(clause, { _id: { $in: [] } });
      });

      const notInDraw = await buildUserFilter({ inActiveMiniDraw: "no" });
      check("no with no active draws is a no-op — everyone trivially qualifies", () => {
        assert.equal(
          andClauses(notInDraw).some((c) => "miniDrawParticipation" in c),
          false,
        );
      });
    } finally {
      restore();
    }
  }

  // ── Composition ─────────────────────────────────────────────────────────────────────────
  {
    const restore = stubActiveDraws(MiniDraw, ACTIVE_IDS);
    try {
      const reengagement = await buildUserFilter({
        miniDrawPackage: "yes",
        inActiveMiniDraw: "no",
      });
      check("the two filters COMPOSE (bought a pack, not currently in a draw)", () => {
        const all = andClauses(reengagement);
        assert.ok(
          all.some((c) => "miniDrawPackages.packageId" in c),
          "the purchase constraint must survive",
        );
        assert.ok(
          all.some((c) => "miniDrawParticipation" in c),
          "the active-participation constraint must survive",
        );
      });
    } finally {
      restore();
    }
  }

  const none = await buildUserFilter({});
  check("omitting both filters adds no mini-draw constraint", () => {
    assert.equal(
      andClauses(none).some((c) => "miniDrawParticipation" in c),
      false,
    );
  });

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("user-mini-draw-filters tests passed");
}

void main();
