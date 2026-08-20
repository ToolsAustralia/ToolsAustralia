import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import mongoose from "mongoose";
import MajorDraw from "@/models/MajorDraw";
import Order from "@/models/Order";
import ShopEntryMultiplierConfig, {
  SHOP_ENTRY_MULTIPLIER_CONFIG_ID,
} from "@/models/ShopEntryMultiplierConfig";
import { loadShopEntryCaps } from "@/services/shop/resolveShopEntryMultiplier";
import {
  applyShopEntryCap,
  normaliseCategoryKey,
  resolveCapFor,
  type ShopEntryCaps,
} from "@/utils/shop/entry-multiplier";

/**
 * Shop entry grant — the silent-failure guards.
 *
 * Runs against E2E_MONGODB_URI (the wipeable `toolsaustralia-e2e` database), NEVER
 * the dev database named by MONGODB_URI. This test writes real documents.
 *
 * WHAT THIS COVERS — the failure modes that produce no error at all:
 *
 *   1. `entriesBySource.shop` survives a write. Mongoose strict mode DROPS keys
 *      absent from the schema, silently, on save rather than on assignment — so
 *      the only assertion that catches it reads the value back from Mongo. This
 *      exact bug has shipped twice before on this sub-schema (see the comments in
 *      MajorDraw.ts on the cancellation-upsell and promo-link keys).
 *   2. `Order.products[].includedEntries` survives a write. Same failure mode, and
 *      it is the number the customer was promised at checkout.
 *   3. `entriesGranted` distinguishes absent from zero. If the field defaulted to
 *      0, a grant that never ran would be indistinguishable from an order worth no
 *      entries, and neither support nor the reconcile cron could tell them apart.
 *   4. The base-count arithmetic, including the multiplier and the ladder property
 *      that makes merch inheriting the one-time multiplier fair.
 *   5. The multiplier CAP chain (product -> category -> shop -> inherit). Every
 *      tier is another place a value can be accepted, stored, and then quietly
 *      not applied, so each is asserted separately -- and the category key is
 *      asserted case-insensitively, because Product.category is free text whose
 *      vocabulary is already forked (Apparel beside power-tools).
 *   6. A MIXED cart. Summing every line then multiplying once is only correct
 *      while all products share one rate; per-product caps make that reachable.
 *
 * WHAT THIS DOES NOT COVER, and why it matters that you know:
 *   - The end-to-end grant through processPaymentBenefits (needs a user, an active
 *     draw in a specific state, and a Stripe PaymentIntent).
 *   - Webhook replay idempotency and the already_processed retry path.
 *   - Refund reversal of a shop grant.
 *   These are the e2e suite's job; they are listed in the phase-3 plan, not done.
 */

const URI = process.env.E2E_MONGODB_URI;

/** Every key the MajorDraw sub-schema declares, all zeroed. */
function zeroedSources() {
  return {
    membership: 0,
    "one-time-package": 0,
    upsell: 0,
    "mini-draw": 0,
    referral: 0,
    "bonus-entry-promo": 0,
    "cancellation-upsell": 0,
    "promo-link": 0,
    streak: 0,
    shop: 0,
  };
}

/**
 * The production sum, duplicated here on purpose. finalizeShopOrder computes this
 * inline over a Mongoose document; reproducing the arithmetic keeps the assertion
 * honest about WHAT is being checked (the rule) rather than re-calling the code
 * under test and proving only that it equals itself.
 */
function baseEntriesFor(lines: { includedEntries?: number; quantity: number }[]): number {
  return lines.reduce((sum, l) => sum + (l.includedEntries ?? 0) * l.quantity, 0);
}

async function run() {
  if (!URI) {
    console.error("✗ E2E_MONGODB_URI is not set. Refusing to run against MONGODB_URI (the dev database).");
    process.exit(1);
  }

  await mongoose.connect(URI);

  const drawIds: mongoose.Types.ObjectId[] = [];
  const orderIds: mongoose.Types.ObjectId[] = [];
  let failures = 0;

  const check = (name: string, fn: () => void) => {
    try {
      fn();
      console.log(`✓ ${name}`);
    } catch (err) {
      failures++;
      console.error(`✗ ${name}\n   ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  try {
    // ---------------------------------------------------------------- 1. draw
    const userId = new mongoose.Types.ObjectId();
    // `completed` rather than queued/active: this fixture only needs a document
    // that persists the sub-schema, and a live-status draw would drag in the
    // drawDate/activationDate/freezeEntriesAt conditional-required chain and,
    // worse, could be picked up as a real target draw by anything else pointed at
    // this database.
    const drawDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const draw = await MajorDraw.create({
      name: "Shop entry grant test draw",
      description: "Fixture for src/utils/payment/__tests__/shop-entry-grant.test.ts",
      status: "completed",
      drawDate,
      // Conditionally required whenever drawDate is set (MajorDraw.ts ~L148-152).
      freezeEntriesAt: new Date(drawDate.getTime() - 4 * 60 * 60 * 1000),
      entries: [
        {
          userId,
          totalEntries: 5,
          entriesBySource: { ...zeroedSources(), shop: 5 },
          firstAddedDate: new Date(),
          lastUpdatedDate: new Date(),
        },
      ],
      totalEntries: 5,
    });
    drawIds.push(draw._id as mongoose.Types.ObjectId);

    const rereadDraw = await MajorDraw.findById(draw._id).lean<{
      entries: { entriesBySource: Record<string, number>; totalEntries: number }[];
    } | null>();

    check("entriesBySource.shop survives the write (Mongoose strict mode)", () => {
      assert.ok(rereadDraw, "draw did not persist");
      assert.equal(
        rereadDraw!.entries[0].entriesBySource.shop,
        5,
        "the shop key was dropped on save — it is missing from the MajorDraw sub-schema"
      );
    });

    // CONTROL. Without this, "shop persisted" proves nothing — it would also pass
    // on a schema with strict mode off, where every key persists and the guard is
    // vacuous. Writing a key the sub-schema does NOT declare and watching it
    // disappear proves the drop mechanism is live, and therefore that the
    // assertion above is load-bearing rather than decorative.
    const controlDraw = await MajorDraw.create({
      name: "Shop entry grant control draw",
      description: "Control fixture — proves Mongoose strict mode drops undeclared keys",
      status: "completed",
      drawDate,
      freezeEntriesAt: new Date(drawDate.getTime() - 4 * 60 * 60 * 1000),
      entries: [
        {
          userId,
          totalEntries: 5,
          entriesBySource: { ...zeroedSources(), "not-a-real-source": 5 },
          firstAddedDate: new Date(),
          lastUpdatedDate: new Date(),
        },
      ],
      totalEntries: 5,
    });
    drawIds.push(controlDraw._id as mongoose.Types.ObjectId);

    const rereadControl = await MajorDraw.findById(controlDraw._id).lean<{
      entries: { entriesBySource: Record<string, number> }[];
    } | null>();

    check("CONTROL: an undeclared source key IS dropped, so the guard above is real", () => {
      assert.equal(
        rereadControl!.entries[0].entriesBySource["not-a-real-source"],
        undefined,
        "strict mode is not dropping unknown keys — the shop assertion above proves nothing"
      );
    });

    check("the shop bucket agrees with the row total", () => {
      const row = rereadDraw!.entries[0];
      const summed = Object.values(row.entriesBySource).reduce((a, b) => a + b, 0);
      assert.equal(summed, row.totalEntries, "breakdown does not reconcile with totalEntries");
    });

    // --------------------------------------------------------------- 2. order
    const order = await Order.create({
      orderNumber: `SHOP-TEST-${Date.now().toString(36).toUpperCase()}`,
      user: userId,
      products: [
        { product: new mongoose.Types.ObjectId(), name: "Staple Tee", sku: "TEE-M", includedEntries: 5, quantity: 2, price: 45.95, category: "Apparel", entryMultiplierCap: 2 },
        { product: new mongoose.Types.ObjectId(), name: "Torquay Jacket", sku: "JKT-L", includedEntries: 8, quantity: 1, price: 79.95, category: "Apparel" },
      ],
      subtotal: 171.85,
      gstAmount: 15.62,
      shippingCost: 0,
      totalAmount: 171.85,
      status: "pending",
    });
    orderIds.push(order._id as mongoose.Types.ObjectId);

    const rereadOrder = await Order.findById(order._id).lean<{
      products: {
        includedEntries?: number;
        quantity: number;
        category?: string;
        entryMultiplierCap?: number | null;
      }[];
      entriesGranted?: number;
    } | null>();

    check("Order line includedEntries survives the write", () => {
      assert.ok(rereadOrder, "order did not persist");
      assert.equal(rereadOrder!.products[0].includedEntries, 5, "tee entry count was dropped");
      assert.equal(rereadOrder!.products[1].includedEntries, 8, "jacket entry count was dropped");
    });

    check("entriesGranted is ABSENT before the grant runs, not 0", () => {
      assert.equal(
        rereadOrder!.entriesGranted,
        undefined,
        "a default of 0 would make a failed grant indistinguishable from a zero-entry order"
      );
    });

    // ---------------------------------------------------- 3. the arithmetic
    check("base entries sum across lines and quantities", () => {
      assert.equal(baseEntriesFor(rereadOrder!.products), 18, "5×2 + 8×1");
    });

    check("a line with no entry count contributes nothing, and does not throw", () => {
      assert.equal(baseEntriesFor([{ quantity: 3 }]), 0);
    });

    check("the multiplier scales the base count", () => {
      const base = baseEntriesFor(rereadOrder!.products);
      assert.equal(base * 1, 18, "no promo");
      assert.equal(base * 5, 90, "5x promo");
    });

    check("the kill switch survives any multiplier — 0 base grants 0 at 10x", () => {
      const base = baseEntriesFor([{ includedEntries: 0, quantity: 4 }]);
      assert.equal(base * 10, 0, "shipping dark must stay dark during a promo");
    });

    check("merch never overtakes the packs — across every PAIR of multipliers", () => {
      // The previous version divided both sides by the same `m`, so all four
      // iterations were algebraically identical and it asserted nothing about
      // multipliers at all. It could not have failed.
      //
      // The real property needs TWO rates: what the packs run at, and what merch
      // runs at after the cap. Merch must stay worse value per entry for every
      // reachable pair — and the cap is what makes that true, since it can only
      // ever lower the merch rate.
      const apprentice = { price: 25, entries: 3 };
      const tee = { price: 45.95, entries: 5 };
      const jacket = { price: 79.95, entries: 8 };
      const per = (x: { price: number; entries: number }, m: number) => x.price / (x.entries * m);

      for (let packM = 1; packM <= 10; packM++) {
        for (let capValue = 1; capValue <= 10; capValue++) {
          const merchM = applyShopEntryCap(packM, {}, {
            shopCap: capValue,
            categoryCaps: new Map(),
          });
          assert.ok(merchM <= packM, `cap ${capValue} RAISED merch to ${merchM} against pack ${packM}`);
          assert.ok(
            per(apprentice, packM) < per(tee, merchM) && per(tee, merchM) < per(jacket, merchM),
            `ladder inverted: pack ${packM}x, merch ${merchM}x`
          );
        }
      }
    });

    // ------------------------------------------------------------- 5. cap tiers

    const caps = (shopCap: number | null, cats: Record<string, number> = {}): ShopEntryCaps => ({
      shopCap,
      categoryCaps: new Map(Object.entries(cats)),
    });

    check("the product cap wins over category and shop", () => {
      assert.equal(resolveCapFor({ category: "Apparel", entryMultiplierCap: 2 }, caps(9, { apparel: 6 })), 2);
    });

    check("the category cap wins over shop when the product has none", () => {
      const c = caps(9, { apparel: 6 });
      assert.equal(resolveCapFor({ category: "Apparel" }, c), 6);
      assert.equal(resolveCapFor({ category: "Apparel", entryMultiplierCap: null }, c), 6);
    });

    check("a category with no cap falls through to shop-wide, not to 1", () => {
      assert.equal(resolveCapFor({ category: "power-tools" }, caps(9, { apparel: 6 })), 9);
    });

    check("every tier absent inherits unchanged", () => {
      assert.equal(resolveCapFor({ category: "Apparel" }, caps(null)), null);
      assert.equal(applyShopEntryCap(10, { category: "Apparel" }, caps(null)), 10);
    });

    check("category keys match whatever casing or padding was typed", () => {
      // Product.category is free text behind a free-text admin input, and the
      // vocabulary is already forked. Keyed on the raw string, an admin retyping
      // the category would silently orphan the cap.
      const c = caps(null, { [normaliseCategoryKey("Apparel")]: 3 });
      for (const written of ["Apparel", "apparel", "APPAREL", "  Apparel  ", "aPPaRel"]) {
        assert.equal(resolveCapFor({ category: written }, c), 3, `missed on ${JSON.stringify(written)}`);
      }
    });

    check("no tier, at any value, can raise merch above the promo", () => {
      // The invariant itself, over every reachable combination. This assertion
      // would have to fail before merch could become a cheaper route into a draw
      // than the packs.
      for (let inherited = 1; inherited <= 10; inherited++) {
        for (let v = 1; v <= 10; v++) {
          const subjects = [
            { entryMultiplierCap: v },
            { category: "Apparel" },
            { category: "Apparel", entryMultiplierCap: v },
            {},
          ];
          const configs = [caps(v), caps(null, { apparel: v }), caps(v, { apparel: v }), caps(null)];
          for (const c of configs) {
            for (const subject of subjects) {
              const got = applyShopEntryCap(inherited, subject, c);
              assert.ok(got <= inherited, `raised ${inherited} -> ${got}`);
              assert.ok(got >= 1, `dropped below 1: ${got}`);
            }
          }
        }
      }
    });

    check("a mixed cart multiplies each line by its own rate", () => {
      // The defect a single order-level scalar hides: sum-then-multiply applies
      // one line's rate to every line.
      const c = caps(null, { apparel: 1 });
      const lines = [
        { includedEntries: 5, quantity: 2, category: "Apparel" },     // capped at 1x
        { includedEntries: 8, quantity: 1, category: "power-tools" }, // uncapped
      ];
      const inherited = 5;
      const total = lines.reduce(
        (sum, l) => sum + l.includedEntries * l.quantity * applyShopEntryCap(inherited, l, c),
        0
      );
      assert.equal(total, 5 * 2 * 1 + 8 * 1 * 5, "expected 10 + 40");
      assert.notEqual(total, baseEntriesFor(lines) * inherited, "sum-then-multiply must not agree");
    });

    // ------------------------------------------- 6. the cap survives the write

    check("Order line entryMultiplierCap survives the write", () => {
      // Same strict-mode failure as includedEntries, and worse in effect: the
      // ceiling would apply on the product page and silently never reach the
      // grant, because the webhook reads it from the line and nowhere else.
      assert.equal(rereadOrder!.products[0].entryMultiplierCap, 2, "tee ceiling was dropped");
      assert.equal(
        rereadOrder!.products[1].entryMultiplierCap ?? null,
        null,
        "uncapped line should read as null, not as a number"
      );
    });

    const configDoc = await ShopEntryMultiplierConfig.getOrCreate();
    configDoc.cap = 3;
    configDoc.categoryCaps = new Map([
      [normaliseCategoryKey("Apparel"), 2],
      [normaliseCategoryKey("power-tools"), 5],
    ]);
    await configDoc.save();
    const rereadConfig = await ShopEntryMultiplierConfig.findById(configDoc._id).lean<{
      cap: number | null;
      categoryCaps: Record<string, number>;
    } | null>();

    check("the shop cap and the category map both survive the write", () => {
      assert.equal(rereadConfig!.cap, 3, "shop-wide cap was dropped");
      assert.equal(rereadConfig!.categoryCaps.apparel, 2, "apparel cap was dropped");
      assert.equal(rereadConfig!.categoryCaps["power-tools"], 5, "power-tools cap was dropped");
    });

    // Awaited out here because `check` is synchronous — an async callback
    // would have its rejection swallowed and the test would pass regardless.
    const loadedCaps = await loadShopEntryCaps();

    check("loadShopEntryCaps reads back what was saved, as a real Map", () => {
      // Mongoose hands back its own Map subclass here and a plain object from a
      // lean() read; the loader normalises both, and this is the assertion that
      // proves it rather than assuming it.
      const caps = loadedCaps;
      assert.equal(caps.shopCap, 3);
      assert.equal(caps.categoryCaps.get("apparel"), 2);
      assert.equal(resolveCapFor({ category: "Apparel" }, caps), 2, "category tier did not bind");
    });

    // The admin write routes strip unknown keys at the Zod boundary BEFORE
    // Mongoose sees them, so a model-only round-trip passes while the field
    // never actually saves through the UI. Checked at source rather than over
    // HTTP because this suite has no server; the failure it guards against is
    // someone adding a model field and forgetting one of the two routes.
    const routeSources = [
      "src/app/api/admin/products/route.ts",
      "src/app/api/admin/products/[id]/route.ts",
    ].map((f) => ({ f, src: readFileSync(f, "utf8") }));

    check("both admin product routes declare entryMultiplierCap in their Zod schema", () => {
      for (const { f, src } of routeSources) {
        assert.ok(
          src.includes("entryMultiplierCap"),
          `${f} would strip entryMultiplierCap before Mongoose ever sees it`
        );
      }
    });
  } finally {
    if (drawIds.length) await MajorDraw.deleteMany({ _id: { $in: drawIds } });
    if (orderIds.length) await Order.deleteMany({ _id: { $in: orderIds } });
    // The config is a SINGLETON — leaving a cap of 3 behind would silently
    // change what every later run of this suite, and anything else sharing the
    // e2e database, resolves to.
    await ShopEntryMultiplierConfig.deleteOne({ _id: SHOP_ENTRY_MULTIPLIER_CONFIG_ID });
    await mongoose.disconnect();
  }

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log("\nAll shop entry-grant guards passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
