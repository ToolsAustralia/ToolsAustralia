/**
 * Prize-build recorder — regression guard for the build/engagement beacon's core.
 *
 * Run: `npm run test:prize-build`
 *
 * Side effects are injected, so this asserts the ORCHESTRATION with no DB:
 *  - a bogus built slug never reaches the database;
 *  - a missing visit row is a silent no-op and NEVER creates a row (that would inflate visits);
 *  - switch counts are passed through as absolute totals (the beacon is idempotent).
 */

import assert from "node:assert/strict";
import { recordPrizeBuild } from "../record-prize-build";

/**
 * Repository-level guard (added in review round 1): mutation testing showed that flipping
 * `upsert: false -> true` or swapping `$set -> $inc` in PromoAnalyticsRepository.updateVisitBuild
 * survived every test above unnoticed — those all inject a fake `updateVisitBuild` and never
 * exercise the real Mongo call shape. The tests near the bottom of this file call the REAL
 * repository method against a stubbed `PromoAnalyticsVisit.findOneAndUpdate`, so those two
 * invariants are enforced by CI, not just code review.
 *
 * `updateVisitBuild` calls `connectDB()` first. `connectDB()` (src/lib/mongodb.ts) reads a
 * module-scoped `cached` variable that is assigned ONCE from `global.mongoose` at that module's
 * first evaluation, and returns early without dialing out when `cached.conn` already looks like
 * a healthy connection. Pre-seeding `global.mongoose` here — before anything below dynamically
 * imports the repository/model — makes `connectDB()` take that fast path, so this file still
 * never touches a real database.
 */
(global as unknown as { mongoose: { conn: unknown; promise: unknown } }).mongoose = {
  conn: {
    readyState: 1,
    db: { admin: () => ({ ping: async () => ({}) }) },
  },
  promise: null,
};

let failures = 0;
function run(name: string, fn: () => void | Promise<void>) {
  const done = (error?: unknown) => {
    if (error) {
      failures++;
      console.error(`  ✗ ${name}`);
      console.error(`    ${error instanceof Error ? error.message : String(error)}`);
    } else {
      console.log(`  ✓ ${name}`);
    }
  };
  try {
    const result = fn();
    if (result instanceof Promise) return result.then(() => done()).catch(done);
    done();
  } catch (error) {
    done(error);
  }
  return Promise.resolve();
}

// No `pageType` here on purpose: the core derives it from `slug`, so the two can never
// disagree. The assertion below checks the DERIVED value that reaches the database.
const baseCapture = {
  slug: "makita",
  builtPrizeSlug: "makita-kincrome",
  toolboxSwitches: 2,
  toolsetSwitches: 1,
  interacted: true,
  anonymousId: "anon-1" as string | undefined,
};

async function main() {
  console.log("\nPrize build recorder");

  await run("a valid build updates the visit row with absolute totals", async () => {
    const calls: unknown[] = [];
    const outcome = await recordPrizeBuild(baseCapture, {
      updateVisitBuild: async (payload) => {
        calls.push(payload);
        return true;
      },
    });
    assert.deepEqual(outcome, { recorded: true });
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], {
      anonymousId: "anon-1",
      slug: "makita",
      pageType: "toolset",
      builtPrizeSlug: "makita-kincrome",
      toolboxSwitches: 2,
      toolsetSwitches: 1,
      // Passed straight through, NOT defaulted here. The "absent means engaged" fallback used
      // to live in this core, in the service, and in the repository simultaneously; the route
      // dropped the field and all three fallbacks independently agreed on `true`, so no layer
      // failed and 100% of production rows were written as engaged. The default now exists in
      // exactly one place — the route, resolving the wire schema's optional field.
      interacted: true,
    });
  });

  await run("an explicitly un-engaged visitor is recorded as such, not dropped", async () => {
    // The build is still written — that is what keeps `builders` and `signups` countable over
    // the same population (F-018). The flag is what separates "was on screen" from "engaged",
    // and it cannot be inferred from the counters: cash is a toggle, not a reel touch (F-010).
    const calls: Array<{ interacted?: boolean; toolboxSwitches: number }> = [];
    const outcome = await recordPrizeBuild(
      { ...baseCapture, toolboxSwitches: 0, toolsetSwitches: 0, interacted: false },
      {
        updateVisitBuild: async (payload) => {
          calls.push(payload);
          return true;
        },
      }
    );
    assert.deepEqual(outcome, { recorded: true });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].interacted, false);
    assert.equal(calls[0].toolboxSwitches, 0);
  });

  await run("a cash-only visitor engages without touching either reel", async () => {
    const calls: Array<{ interacted?: boolean; builtPrizeSlug: string }> = [];
    await recordPrizeBuild(
      {
        ...baseCapture,
        builtPrizeSlug: "cash-prize",
        toolboxSwitches: 0,
        toolsetSwitches: 0,
        interacted: true,
      },
      {
        updateVisitBuild: async (payload) => {
          calls.push(payload);
          return true;
        },
      }
    );
    assert.equal(calls.length, 1);
    assert.equal(calls[0].interacted, true, "0/0 counters must not be read as un-engaged");
    assert.equal(calls[0].builtPrizeSlug, "cash-prize");
  });

  await run("an unknown built prize slug is rejected before any write", async () => {
    let called = false;
    const outcome = await recordPrizeBuild(
      { ...baseCapture, builtPrizeSlug: "not-a-real-prize" },
      {
        updateVisitBuild: async () => {
          called = true;
          return true;
        },
      }
    );
    assert.equal(outcome.recorded, false);
    assert.equal(called, false, "a bogus slug must never reach the database");
  });

  await run("an unknown LANDING slug is rejected before any write", async () => {
    let called = false;
    const outcome = await recordPrizeBuild(
      { ...baseCapture, slug: "not-a-real-page" },
      {
        updateVisitBuild: async () => {
          called = true;
          return true;
        },
      }
    );
    assert.equal(outcome.recorded, false);
    assert.equal(called, false);
  });

  await run("no anonymousId is a no-op — there is no row to attach the build to", async () => {
    let called = false;
    const outcome = await recordPrizeBuild(
      { ...baseCapture, anonymousId: undefined },
      {
        updateVisitBuild: async () => {
          called = true;
          return true;
        },
      }
    );
    assert.equal(outcome.recorded, false);
    assert.equal(called, false);
  });

  await run("no matching visit row is a silent no-op, never a create", async () => {
    const outcome = await recordPrizeBuild(baseCapture, {
      updateVisitBuild: async () => false,
    });
    assert.deepEqual(outcome, { recorded: false, reason: "no_visit_row" });
  });

  await run("a write failure is reported, not thrown", async () => {
    const outcome = await recordPrizeBuild(baseCapture, {
      updateVisitBuild: async () => {
        throw new Error("mongo down");
      },
    });
    assert.equal(outcome.recorded, false);
    assert.match(String((outcome as { reason: string }).reason), /mongo down/);
  });

  await run("negative or absurd switch counts are clamped", async () => {
    const calls: { toolboxSwitches: number; toolsetSwitches: number }[] = [];
    await recordPrizeBuild(
      { ...baseCapture, toolboxSwitches: -5, toolsetSwitches: 999_999 },
      {
        updateVisitBuild: async (p) => {
          calls.push(p);
          return true;
        },
      }
    );
    assert.equal(calls[0].toolboxSwitches, 0, "negative counts clamp to 0");
    assert.ok(calls[0].toolsetSwitches <= 1000, "absurd counts clamp to a sane ceiling");
  });

  // ---- Repository-level guard: exercises the REAL updateVisitBuild against a stubbed
  // Mongoose model, so the upsert/$set invariants above are checked by an assertion, not
  // just a code comment.
  const PromoAnalyticsVisit = (await import("@/models/PromoAnalyticsVisit")).default;
  const PromoAnalyticsRepository = (await import("@/repositories/PromoAnalyticsRepository")).default;

  await run(
    "repository guard: updateVisitBuild never upserts, writes via $set (never $inc), sorts newest-first, filters on anonymousId+slug+pageType",
    async () => {
      const original = PromoAnalyticsVisit.findOneAndUpdate;
      let captured: { filter?: unknown; update?: unknown; options?: unknown } = {};
      (
        PromoAnalyticsVisit as unknown as {
          findOneAndUpdate: (filter: unknown, update: unknown, options: unknown) => unknown;
        }
      ).findOneAndUpdate = (filter, update, options) => {
        captured = { filter, update, options };
        // Mirror the real call shape: findOneAndUpdate(...).maxTimeMS(5000).lean()
        return { maxTimeMS: () => ({ lean: async () => ({ _id: "fake-visit-id" }) }) };
      };
      try {
        const updated = await PromoAnalyticsRepository.updateVisitBuild({
          anonymousId: "anon-1",
          slug: "makita",
          pageType: "toolset",
          builtPrizeSlug: "makita-kincrome",
          toolboxSwitches: 2,
          toolsetSwitches: 1,
          // Deliberately `false`: the repository used to write `args.interacted !== false`, so a
          // dropped field defaulted to true. Asserting the `false` case is what proves the value
          // is written through rather than re-defaulted.
          interacted: false,
        });
        assert.equal(updated, true, "a matched row must report success");

        const options = captured.options as { upsert?: boolean; sort?: unknown };
        assert.equal(
          options?.upsert,
          false,
          "upsert must stay false: flipping it to true lets this call CREATE a visit row, inflating the promo visit count — the one metric this whole feature must leave untouched"
        );
        assert.deepEqual(
          options?.sort,
          { timestamp: -1 },
          "must sort newest-first so a build attaches to the visitor's MOST RECENT visit row, not an arbitrary one"
        );

        const update = captured.update as Record<string, unknown>;
        assert.ok(Object.prototype.hasOwnProperty.call(update, "$set"), "must write via $set with absolute totals");
        assert.equal(
          (update.$set as Record<string, unknown>)?.buildInteracted,
          false,
          "buildInteracted must be written from the argument, never re-defaulted: the old `args.interacted !== false` turned a dropped field into `true` on 100% of production rows and erased the only signal that separates an engaged builder from a drive-by visitor"
        );
        assert.ok(
          !Object.prototype.hasOwnProperty.call(update, "$inc"),
          "$inc must never appear: the client sends CUMULATIVE totals, so $inc would double-count on a duplicate beacon flush (debounce landing + pagehide)"
        );

        const filter = captured.filter as Record<string, unknown>;
        assert.deepEqual(
          { anonymousId: filter.anonymousId, slug: filter.slug, pageType: filter.pageType },
          { anonymousId: "anon-1", slug: "makita", pageType: "toolset" },
          "must match the existing visit row on anonymousId + slug + pageType"
        );
      } finally {
        (PromoAnalyticsVisit as unknown as { findOneAndUpdate: unknown }).findOneAndUpdate = original;
      }
    }
  );

  await run(
    "repository guard: no matching row returns false — a null findOneAndUpdate result must never be read as success",
    async () => {
      const original = PromoAnalyticsVisit.findOneAndUpdate;
      (
        PromoAnalyticsVisit as unknown as { findOneAndUpdate: (...args: unknown[]) => unknown }
      ).findOneAndUpdate = () => ({ maxTimeMS: () => ({ lean: async () => null }) });
      try {
        const updated = await PromoAnalyticsRepository.updateVisitBuild({
          anonymousId: "anon-1",
          slug: "makita",
          pageType: "toolset",
          builtPrizeSlug: "makita-kincrome",
          toolboxSwitches: 2,
          toolsetSwitches: 1,
          interacted: true,
        });
        assert.equal(
          updated,
          false,
          "no matching row (null result) must return false — treating null as success would hide a beacon that silently failed to attach, with nothing left to reveal it"
        );
      } finally {
        (PromoAnalyticsVisit as unknown as { findOneAndUpdate: unknown }).findOneAndUpdate = original;
      }
    }
  );

  // ---- Wiring guard: the gap that let the `interacted` drop ship.
  //
  // Every test above injects a fake `updateVisitBuild`, so they all passed while the REAL route
  // dependency — which rebuilds the service payload field-by-field — silently omitted
  // `interacted`. The core was correct, the repository was correct, and the seam between them
  // was not. This exercises PromoAnalyticsService.recordPrizeBuild (the route's actual callee)
  // against a stubbed model and asserts the flag survives the whole chain.
  await run(
    "wiring guard: interacted survives service -> repository -> $set (the seam that dropped it)",
    async () => {
      const PromoAnalyticsService = (await import("@/services/promo-analytics/PromoAnalyticsService"))
        .default;
      const original = PromoAnalyticsVisit.findOneAndUpdate;
      let captured: Record<string, unknown> = {};
      (
        PromoAnalyticsVisit as unknown as {
          findOneAndUpdate: (filter: unknown, update: unknown, options: unknown) => unknown;
        }
      ).findOneAndUpdate = (_filter, update) => {
        captured = (update as Record<string, Record<string, unknown>>).$set;
        return { maxTimeMS: () => ({ lean: async () => ({ _id: "fake-visit-id" }) }) };
      };
      try {
        for (const interacted of [true, false]) {
          const result = await PromoAnalyticsService.recordPrizeBuild({
            anonymousId: "anon-1",
            slug: "makita",
            builtPrizeSlug: "makita-kincrome",
            toolboxSwitches: 0,
            toolsetSwitches: 0,
            interacted,
          });
          assert.equal(result.success, true, `recordPrizeBuild({ interacted: ${interacted} }) must succeed`);
          assert.equal(
            captured.buildInteracted,
            interacted,
            `interacted: ${interacted} must reach $set.buildInteracted unchanged — a layer that re-defaults or drops it is exactly the bug this guards`
          );
        }
      } finally {
        (PromoAnalyticsVisit as unknown as { findOneAndUpdate: unknown }).findOneAndUpdate = original;
      }
    }
  );

  console.log(failures === 0 ? "\nAll passed\n" : `\n${failures} failed\n`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
