/**
 * One-shot: replace `redeemableissuances.campaignId_1_code_1` — today unique +
 * SPARSE — with an equivalent unique + PARTIAL index that skips code-less rows.
 *
 * WHY THIS EXISTS
 * ---------------
 * A COMPOUND sparse index indexes a document that holds AT LEAST ONE of its
 * keys. `campaignId` is required on every issuance, so a row with no `code` is
 * NOT skipped — it is indexed as `(campaignId, null)`. A `campaignMode: "global"`
 * campaign never writes a per-user `code`, so the SECOND customer enrolled into
 * one collides with the first and the insert throws
 * `E11000 … keyPattern {"campaignId":1,"code":1}`.
 *
 * All three live codes (BACKIN200 / LOCKIN100 / EXTRA100) are global-mode, so
 * until this runs each of them can reach exactly ONE customer, ever. Verified
 * empirically 2026-08-27 against a throwaway collection carrying the identical
 * index; and against both reachable databases every campaign with code-less rows
 * has exactly n=1 of them, because a second one has never been insertable.
 *
 * `partialFilterExpression: { code: { $exists: true } }` leaves code-less rows
 * out of the index entirely. Uniqueness of per-user codes
 * (`campaignMode: "unique" | "both"`) is unchanged.
 *
 * WHY IT IS A MIGRATION AND NOT JUST THE schema.index() CHANGE
 * -----------------------------------------------------------
 * Mongo does NOT re-option an index that already exists: a `createIndex` with
 * the same key and different options is either ignored or an
 * `IndexOptionsConflict`. The declaration on `src/models/RedeemableIssuance.ts`
 * therefore only helps FRESH databases. Every existing environment needs the old
 * index DROPPED and the new one built, which is what this does.
 *
 * SAFETY
 * ------
 * - DRY-RUN BY DEFAULT. `--apply` is the only thing that writes.
 * - Pre-flight refuses to touch anything if the code-bearing rows contain a
 *   duplicate `(campaignId, code)` pair, because the recreate would fail and
 *   leave the collection with NO uniqueness guard on codes at all.
 * - Idempotent: a collection already carrying the partial index exits 0 untouched,
 *   and a run interrupted part-way is simply re-runnable.
 *
 * DROP-THEN-CREATE, and it has to be. Building the replacement under a temporary
 * name first — so the unique guard is never absent — is NOT possible here:
 * MongoDB refuses a second index with the same key and the same options under a
 * different name (`IndexOptionsConflict`, code 85; observed on the first run of
 * this script against dev). So there is a sub-second window between the drop and
 * the create in which `(campaignId, code)` is unguarded. That is acceptable:
 * the only writer of a per-user `code` is `generateUniqueCode`, whose output is
 * random per call and which already retries on collision, and this runs as a
 * deliberate ops action rather than under load.
 *
 * EXIT CODES: 0 = applied or already correct · 2 = refused by a pre-flight check
 * (nothing written) · 3 = fatal error.
 *
 *   npm run migrate:issuance-partial-code-index:dry        # local, dry
 *   npm run migrate:issuance-partial-code-index            # local, apply
 *   npm run migrate:issuance-partial-code-index:prod:dry   # PRODUCTION, dry
 *   npm run migrate:issuance-partial-code-index:prod       # PRODUCTION, apply
 */
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { connectOpsDb } from "../connect-ops-db";

const APPLY = process.argv.includes("--apply");
const IS_PROD = process.argv.includes("--prod");

const COLLECTION = "redeemableissuances";
const INDEX_NAME = "campaignId_1_code_1";
const INDEX_KEY: Record<string, 1> = { campaignId: 1, code: 1 };
const PARTIAL_FILTER = { code: { $exists: true } } as const;

/** Compound index keys are ORDER-SENSITIVE — compare positionally, never as a set. */
function sameKey(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  return ak.every((k, i) => bk[i] === k && String(a[k]) === String(b[k]));
}

function isTargetPartial(idx: { partialFilterExpression?: unknown }): boolean {
  return JSON.stringify(idx.partialFilterExpression ?? null) === JSON.stringify(PARTIAL_FILTER);
}

/** Adaptive cadence: ~20 progress lines whatever the size, so even a small run visibly moves. */
function makeStepper(totalSteps: number) {
  const startedAt = Date.now();
  let done = 0;
  return (label: string) => {
    done += 1;
    const elapsed = (Date.now() - startedAt) / 1000;
    const pct = ((done / totalSteps) * 100).toFixed(0);
    const rate = done / Math.max(elapsed, 0.001);
    const eta = ((totalSteps - done) / Math.max(rate, 0.001)).toFixed(1);
    console.log(`  [${done}/${totalSteps} ${pct}%] ${label} · ${elapsed.toFixed(1)}s elapsed · ETA ${eta}s`);
  };
}

async function run(): Promise<number> {
  console.log(
    `\nRedeemableIssuance (campaignId, code) sparse → partial\n` +
      `  target : ${IS_PROD ? "PRODUCTION" : "local/dev"}\n` +
      `  mode   : ${APPLY ? "APPLY (writes)" : "DRY-RUN (no writes)"}\n`
  );

  const mongoose = await connectOpsDb("issuance-partial-code-index");
  const db = mongoose.connection.db;
  if (!db) throw new Error("No database handle after connectOpsDb()");
  const coll = db.collection(COLLECTION);

  // ── UP-FRONT COUNTS: the denominator every progress line below is measured against.
  const total = await coll.countDocuments({});
  const codeless = await coll.countDocuments({ code: { $exists: false } });
  const withCode = total - codeless;
  console.log(`Documents in ${COLLECTION}: ${total.toLocaleString()}`);
  console.log(`  with a per-user code : ${withCode.toLocaleString()}  (indexed by the new index)`);
  console.log(`  code-less (global)   : ${codeless.toLocaleString()}  (excluded by the new index)\n`);

  // How many customers the current index has been REFUSING. Every campaign with
  // code-less rows should read n=1 today; anything above 1 means the partial index
  // is already in place here.
  const perCampaign = await coll
    .aggregate<{ _id: unknown; n: number }>([
      { $match: { code: { $exists: false } } },
      { $group: { _id: "$campaignId", n: { $sum: 1 } } },
      { $sort: { n: -1 } },
      { $limit: 10 },
    ])
    .toArray();
  console.log(`Code-less rows per campaign (top ${perCampaign.length}):`);
  for (const row of perCampaign) console.log(`  ${String(row._id)}  n=${row.n}`);
  if (perCampaign.length === 0) console.log("  (none)");
  console.log("");

  const before = await coll.indexes();
  console.log(`Existing indexes (${before.length}):`);
  for (const idx of before) {
    const opts = [
      idx.unique ? "unique" : null,
      idx.sparse ? "sparse" : null,
      idx.partialFilterExpression ? `partial=${JSON.stringify(idx.partialFilterExpression)}` : null,
    ]
      .filter(Boolean)
      .join(" ");
    console.log(`  ${(idx.name ?? "?").padEnd(42)} ${JSON.stringify(idx.key)}  ${opts}`);
  }
  console.log("");

  // EVERY index on this key, not just the canonical name — an interrupted earlier
  // run can leave a differently-named one behind, and Mongo will refuse to create
  // the canonical index while any same-key/same-options index exists.
  const onThisKey = before.filter((i) => sameKey(i.key as Record<string, unknown>, INDEX_KEY));
  const target = onThisKey.find((i) => i.name === INDEX_NAME);

  if (onThisKey.length === 1 && target && isTargetPartial(target) && target.unique && !target.sparse) {
    console.log(`✅ "${target.name}" is already unique + partial — nothing to do.\n`);
    await mongoose.disconnect();
    return 0;
  }

  // ── PRE-FLIGHT. The recreate is the only irreversible-ish step; refuse before it,
  //    not halfway through, if the data cannot satisfy the new index.
  const dupes = await coll
    .aggregate<{ _id: { campaignId: unknown; code: unknown }; n: number }>([
      { $match: { code: { $exists: true } } },
      { $group: { _id: { campaignId: "$campaignId", code: "$code" }, n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } },
      { $limit: 20 },
    ])
    .toArray();

  if (dupes.length > 0) {
    console.error(
      `❌ REFUSED: ${dupes.length} duplicate (campaignId, code) pair(s) exist among code-bearing rows.\n` +
        `   Creating a unique partial index would fail and the collection would be left with NO\n` +
        `   uniqueness guard on codes. Resolve these first:`
    );
    for (const d of dupes) console.error(`   campaignId=${String(d._id.campaignId)} code=${String(d._id.code)} n=${d.n}`);
    console.error("");
    await mongoose.disconnect();
    return 2;
  }
  console.log(`Pre-flight: no duplicate (campaignId, code) pairs among ${withCode.toLocaleString()} code-bearing rows. OK\n`);

  const toDrop = onThisKey.map((i) => i.name).filter((n): n is string => !!n);
  const TOTAL_STEPS = toDrop.length + 1;

  if (!APPLY) {
    console.log(
      `DRY-RUN — would, in this order:\n` +
        toDrop
          .map(
            (n, i) =>
              `  ${i + 1}. drop "${n}" (${onThisKey[i].sparse ? "unique+sparse" : onThisKey[i].partialFilterExpression ? "partial" : "unique"})`
          )
          .join("\n") +
        (toDrop.length ? "\n" : `  (no existing index on ${JSON.stringify(INDEX_KEY)} — nothing to drop)\n`) +
        `  ${TOTAL_STEPS}. create ${JSON.stringify(INDEX_KEY)} unique + partial ${JSON.stringify(PARTIAL_FILTER)} as "${INDEX_NAME}"\n\n` +
        `SUMMARY (dry-run): 0 indexes changed. ${codeless.toLocaleString()} code-less rows would become insertable\n` +
        `without collision; today only 1 per campaign is.\n\n` +
        `Re-run with --apply to write.\n`
    );
    await mongoose.disconnect();
    return 0;
  }

  const step = makeStepper(TOTAL_STEPS);
  let changed = 0;
  let errored = 0;

  try {
    for (const name of toDrop) {
      await coll.dropIndex(name);
      changed += 1;
      step(`dropped "${name}"`);
    }

    await coll.createIndex(INDEX_KEY, {
      name: INDEX_NAME,
      unique: true,
      partialFilterExpression: PARTIAL_FILTER,
      background: true,
    });
    changed += 1;
    step(`created "${INDEX_NAME}" (unique + partial)`);
  } catch (error) {
    errored += 1;
    console.error("❌ Index swap failed part-way — inspect the index list below, then re-run (it is idempotent):", error);
  }

  const after = await coll.indexes();
  console.log(`\nIndexes now (${after.length}):`);
  for (const idx of after) {
    const opts = [
      idx.unique ? "unique" : null,
      idx.sparse ? "sparse" : null,
      idx.partialFilterExpression ? `partial=${JSON.stringify(idx.partialFilterExpression)}` : null,
    ]
      .filter(Boolean)
      .join(" ");
    console.log(`  ${(idx.name ?? "?").padEnd(42)} ${JSON.stringify(idx.key)}  ${opts}`);
  }

  const final = after.find((i) => i.name === INDEX_NAME);
  const ok = !!final && !!final.unique && isTargetPartial(final) && !final.sparse;

  console.log(
    `\nSUMMARY — target=${IS_PROD ? "PRODUCTION" : "local/dev"} · steps applied=${changed}/${TOTAL_STEPS} · errors=${errored}\n` +
      `  ${INDEX_NAME}: ${ok ? "unique + partial ✅" : "NOT in the expected state ❌"}\n` +
      `  ${codeless.toLocaleString()} code-less rows present; a global campaign can now hold as many as it enrols.\n`
  );

  await mongoose.disconnect();
  if (errored > 0 || !ok) return 2;
  return 0;
}

run()
  .then((code) => process.exit(code))
  .catch(async (err) => {
    console.error("❌ Migration failed:", err);
    const mongoose = (await import("mongoose")).default;
    await mongoose.disconnect().catch(() => {});
    process.exit(3);
  });
