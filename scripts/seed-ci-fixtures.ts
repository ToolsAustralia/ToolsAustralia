/**
 * seed-ci-fixtures.ts — the minimum database state the offline suites assume.
 *
 * WHY THIS EXISTS
 * ---------------
 * Most suites build their own fixtures and tear them down. A few do not: they
 * assume a *live* major draw already exists and mutate it, undoing the mutation in
 * `finally`. On a developer's database there is always an active draw, so this never
 * surfaces locally. On CI's empty scratch database there is none, and
 * `getTargetDrawForGrant()` returns `no_target_draw`, so the suite fails on an
 * assertion that has nothing to do with what it is testing.
 *
 * Measured 2026-09-04 against an empty mongo:8 container — exactly three suites need
 * this: test:bonus-code-mint, test:campaign-window, test:claim-grant-compensation.
 *
 * A fourth, test:norm-permissions, needs the Norm role + service user. That already
 * has a script — `npm run migrate:create-norm` — so it is NOT duplicated here.
 *
 * SAFETY
 * ------
 * This writes a fake prize draw. Run against production it would create a draw that
 * `getTargetDrawForGrant()` could hand real entries to. The guard below refuses any
 * connection string that is not unmistakably local, and there is no flag to override
 * it — if you need that, you are doing something this script should not help with.
 *
 * Usage:  npm run seed:ci-fixtures
 * Docs:   docs/dev-tooling/ci.md
 */

import mongoose from "mongoose";

const CI_DRAW_NAME = "CI fixture draw — safe to delete";

function assertLocalDatabase(uri: string): void {
  // Atlas is always mongodb+srv://…mongodb.net. Local/CI is host localhost or
  // 127.0.0.1, or the docker-compose service name `mongo`.
  const host = uri.replace(/^mongodb(\+srv)?:\/\//, "").replace(/^[^@]*@/, "").split(/[/?]/)[0];
  const bareHost = host.split(":")[0];
  const allowed = ["localhost", "127.0.0.1", "mongo", "0.0.0.0"];

  if (uri.startsWith("mongodb+srv://") || !allowed.includes(bareHost)) {
    console.error("");
    console.error("REFUSING TO SEED.");
    console.error(`  host resolved to: ${bareHost || "(unparseable)"}`);
    console.error(`  allowed hosts:    ${allowed.join(", ")}`);
    console.error("");
    console.error("  This script writes a fake active major draw. Against a real database");
    console.error("  that draw could receive real entries. There is deliberately no override.");
    console.error("");
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("seed-ci-fixtures: MONGODB_URI is not set.");
    process.exit(1);
  }

  assertLocalDatabase(uri);

  console.log(`seed-ci-fixtures: connecting to ${uri.split("@").pop()}`);
  await mongoose.connect(uri);

  // Create the collections migrate:create-norm writes to, BEFORE it opens its
  // transaction. On a brand-new database they do not exist, and the transaction then
  // races Mongoose's own implicit collection + index creation:
  //
  //   MongoServerError: Unable to acquire IX lock on '<db>.users' within 5ms
  //   code 24, LockTimeout, errorLabels: [ TransientTransactionError ]
  //
  // That is what failed CI run #122. It only ever bites the FIRST run against an empty
  // database — the failed attempt leaves the collections behind, so a retry passes,
  // which is why it never reproduced against a warm local container.
  //
  // Creating them here is the narrow fix: it costs nothing, and every real environment
  // (dev, production) already has these collections, so the problem is CI-only.
  //
  // NOTE the underlying migration still has no retry on TransientTransactionError,
  // which MongoDB explicitly labels as retryable. Anyone running it against a fresh
  // database — a new environment, a restored dump — will hit the same failure.
  // Creating the collections is NOT sufficient on its own — that was tried first and
  // still failed. Mongoose's autoIndex builds each model's indexes the first time the
  // model is used, and an index build holds a lock the transaction cannot get within
  // Mongo's 5ms default. `Model.init()` resolves only once those builds have FINISHED,
  // so awaiting it here moves the whole cost outside the migration's transaction.
  const { default: User } = await import("../src/models/User");
  const { default: Role } = await import("../src/models/Role");
  for (const [name, model] of [
    ["users", User],
    ["roles", Role],
  ] as const) {
    await model.init();
    console.log(`seed-ci-fixtures: '${name}' collection and indexes ready`);
  }

  const { default: MajorDraw } = await import("../src/models/MajorDraw");

  // Idempotent: the suites only need ONE active draw, and creating a second on every
  // run would make `findOne({status:{$in:["active","frozen"]}})` non-deterministic.
  const existing = await MajorDraw.findOne({ status: { $in: ["active", "frozen"] } }).lean();
  if (existing) {
    console.log(`seed-ci-fixtures: an active/frozen draw already exists (${String((existing as { _id: unknown })._id)}) — nothing to do`);
    await mongoose.disconnect();
    return;
  }

  const now = new Date();
  const drawDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const draw = await MajorDraw.create({
    name: CI_DRAW_NAME,
    description: "Created by scripts/seed-ci-fixtures.ts so suites that mutate a live draw can run. Not a real promotion.",
    status: "active",
    activationDate: now,
    drawDate,
    // Conditionally required whenever drawDate is set (MajorDraw.ts ~L148-152).
    freezeEntriesAt: new Date(drawDate.getTime() - 4 * 60 * 60 * 1000),
    entries: [],
    totalEntries: 0,
    prize: {
      name: "CI fixture prize",
      description: "Not a real prize.",
      value: 0,
      images: [],
    },
  });

  console.log(`seed-ci-fixtures: created active MajorDraw ${String(draw._id)} (drawDate ${drawDate.toISOString().slice(0, 10)})`);
  await mongoose.disconnect();
  console.log("seed-ci-fixtures: done");
}

main().catch((err) => {
  console.error("seed-ci-fixtures failed:", err instanceof Error ? err.stack : err);
  process.exit(1);
});
