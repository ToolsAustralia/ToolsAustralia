/**
 * Signup attribution — regression guard for the gate that decides whether a signup's
 * promo page, built prize and paid-click platform ever reach the database.
 *
 * Run: `npm run test:signup-attribution`
 *
 * These are PURE functions — zero DB, zero network, zero env. What is pinned here:
 *  - the three-way persist guard (promo OR utm OR click), and that `builtPrizeSlug` is
 *    deliberately NOT a standalone trigger;
 *  - that an invalid built prize is ABSENT from the object rather than present-and-undefined
 *    (a literal `undefined` on a Mongo `$set` still writes the key);
 *  - slug normalisation (lowercase + trim);
 *  - an ARGUMENT-POSITION guard — all four params are optional and stringy, so transposing
 *    two of them type-checks cleanly. Two branches each added a "third parameter" during a
 *    merge; this is the assertion that catches that class of mistake (panel F-038);
 *  - the merge rules F-019 introduced and shipped untested: first-touch-wins for the promo
 *    fields, last-write-wins for everything else.
 */

import assert from "node:assert/strict";
import {
  buildSignupAttribution,
  mergeSignupAttribution,
  plainSignupAttribution,
  type SignupAttribution,
} from "../signup-attribution";

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

// Real slugs only — `isValidPromoSlug` checks membership of the toolset landing list
// (src/config/promo-landing-slugs.ts) and the prize catalog (src/config/prize-summaries.ts).
// An invented slug would be rejected and the test would assert the wrong thing.
const TOOLSET_SLUG = "makita"; // toolset landing page  -> pageType "toolset"
const EVERGREEN_SLUG = "ryobi-kincrome"; // prize combination -> pageType "evergreen"

async function main() {
  console.log("\nSignup attribution");

  // ---------------------------------------------------------------- buildSignupAttribution

  await run("a promo slug alone persists, with pageType derived from the slug", () => {
    const result = buildSignupAttribution(TOOLSET_SLUG);
    assert.ok(result, "a valid promo slug must persist");
    assert.equal(result.promotionSlug, "makita");
    assert.equal(
      result.promotionPageType,
      "toolset",
      "pageType is DERIVED from the slug, never passed in, so the two cannot disagree"
    );
    assert.ok(result.visitedAt instanceof Date);
  });

  await run("an evergreen promo slug derives pageType 'evergreen'", () => {
    const result = buildSignupAttribution(EVERGREEN_SLUG);
    assert.ok(result);
    assert.equal(result.promotionSlug, "ryobi-kincrome");
    assert.equal(result.promotionPageType, "evergreen");
  });

  await run("UTM alone persists — a homepage ad-lander has no promo slug and no click id", () => {
    const result = buildSignupAttribution(undefined, {
      utm_source: "facebook",
      utm_medium: "cpc",
      utm_campaign: "july-launch",
    });
    assert.ok(result, "attribution without a promo slug must NOT be dropped");
    assert.equal(result.utmSource, "facebook");
    assert.equal(result.utmMedium, "cpc");
    assert.equal(result.utmCampaign, "july-launch");
    assert.equal(result.promotionSlug, undefined);
    assert.equal(result.promotionPageType, undefined);
  });

  await run("a click platform alone persists — a paid click on an untagged landing URL", () => {
    const result = buildSignupAttribution(undefined, undefined, undefined, "meta");
    assert.ok(result, "a click-verified paid signup must not be recorded as organic");
    assert.equal(result.clickPlatform, "meta");
    assert.equal(result.builtPrizeSlug, undefined);
    assert.equal(result.promotionSlug, undefined);
  });

  await run("none of the three triggers → undefined (nothing worth persisting)", () => {
    assert.equal(buildSignupAttribution(), undefined);
    assert.equal(buildSignupAttribution(undefined, {}), undefined);
    assert.equal(
      buildSignupAttribution("not-a-real-promo-page", { utm_content: "x", utm_term: "y" }),
      undefined,
      "an invalid slug is no slug, and utm_content/utm_term are not persist triggers"
    );
  });

  await run("a VALID builtPrizeSlug alone is NOT a standalone persist trigger", () => {
    assert.equal(
      buildSignupAttribution(undefined, undefined, EVERGREEN_SLUG, undefined),
      undefined,
      "builtPrizeSlug only ever arrives alongside a promo slug — letting it persist on its own " +
        "would let a bare crafted param mint an attribution row that means nothing"
    );
  });

  await run("an INVALID builtPrizeSlug beside a valid promo: promo persists, build is absent", () => {
    const result = buildSignupAttribution(TOOLSET_SLUG, undefined, "not-a-real-prize");
    assert.ok(result);
    assert.equal(result.promotionSlug, "makita");
    assert.equal(
      "builtPrizeSlug" in result,
      false,
      "the key must be ABSENT, not present-with-undefined: a literal undefined on a Mongo $set " +
        "still writes the key and would overwrite a previously captured build"
    );
  });

  await run("slugs are normalised — lowercase + trim", () => {
    const result = buildSignupAttribution("  RYOBI-Kincrome  ", undefined, "RYOBI-Kincrome  ");
    assert.ok(result);
    assert.equal(result.promotionSlug, "ryobi-kincrome");
    assert.equal(result.builtPrizeSlug, "ryobi-kincrome");
    assert.equal(result.promotionPageType, "evergreen");
  });

  await run(
    "ARGUMENT-POSITION GUARD: four distinct values, each lands on its own key",
    () => {
      // All four params are optional and stringy/objecty, so transposing two of them
      // type-checks cleanly. Two branches each added a "third parameter" to this function
      // during a merge — nothing in CI would have caught getting the order wrong.
      const result = buildSignupAttribution(
        "makita",
        { utm_source: "meta" },
        "ryobi-kincrome",
        "tiktok"
      );
      assert.ok(result);
      assert.equal(result.promotionSlug, "makita", "arg 1 -> promotionSlug");
      assert.equal(result.promotionPageType, "toolset", "arg 1 also derives promotionPageType");
      assert.equal(result.utmSource, "meta", "arg 2 -> utmSource");
      assert.equal(result.builtPrizeSlug, "ryobi-kincrome", "arg 3 -> builtPrizeSlug");
      assert.equal(result.clickPlatform, "tiktok", "arg 4 -> clickPlatform");
      // The two stringy slug args are the transposable pair — assert they did not swap.
      assert.notEqual(
        result.promotionSlug,
        result.builtPrizeSlug,
        "promotionSlug and builtPrizeSlug must not have been transposed"
      );
    }
  );

  await run("every attribution param maps to its own persisted key", () => {
    const result = buildSignupAttribution(undefined, {
      utm_source: "s",
      utm_medium: "m",
      utm_campaign: "c",
      utm_content: "ct",
      utm_term: "t",
      campaign_id: "111",
      adset_id: "222",
      ad_id: "333",
    });
    assert.ok(result);
    assert.equal(result.utmSource, "s");
    assert.equal(result.utmMedium, "m");
    assert.equal(result.utmCampaign, "c");
    assert.equal(result.utmContent, "ct");
    assert.equal(result.utmTerm, "t");
    assert.equal(result.campaignId, "111");
    assert.equal(result.adsetId, "222");
    assert.equal(result.adId, "333");
  });

  // ---------------------------------------------------------------- mergeSignupAttribution
  // F-019: re-registering on an EXISTING account must MERGE, never replace. `signupAttribution`
  // is an inline nested object, so assigning it wholesale emits a whole-subdocument $set.

  await run(
    "a click-only re-registration keeps the promo page AND the built prize from the first touch",
    () => {
      const previous: SignupAttribution = {
        promotionSlug: "makita",
        promotionPageType: "toolset",
        builtPrizeSlug: "ryobi-kincrome",
        visitedAt: new Date("2026-07-01T00:00:00Z"),
      };
      const next = buildSignupAttribution(undefined, undefined, undefined, "meta");
      assert.ok(next);
      const merged = mergeSignupAttribution(previous, next);
      assert.equal(
        merged.promotionSlug,
        "makita",
        "the abandon-then-return visitor must not lose the page they were acquired on"
      );
      assert.equal(merged.promotionPageType, "toolset");
      assert.equal(
        merged.builtPrizeSlug,
        "ryobi-kincrome",
        "the prize they built at first touch must survive a later bare-click signup"
      );
      assert.equal(merged.clickPlatform, "meta", "the new click platform is still added");
    }
  );

  // ⚠️ The promo-field rule is PRESERVE-WHEN-ABSENT, not strict first-touch-wins. The two
  // differ only when the NEW signup carries a promo field of its own: `...next` then wins,
  // because the preserve branches are guarded on `!next.promotionSlug` / `!next.builtPrizeSlug`.
  // The two tests below pin both halves so the distinction cannot be lost. (The prose in
  // docs/auth/gotchas.md used to say "first-touch-wins" flatly, which overstates it — the
  // wording there has been corrected to match these assertions.)
  await run(
    "a second promo page DOES overwrite promotionSlug — the rule is preserve-when-absent",
    () => {
      const previous: SignupAttribution = {
        promotionSlug: "makita",
        promotionPageType: "toolset",
        visitedAt: new Date("2026-07-01T00:00:00Z"),
      };
      const next = buildSignupAttribution("milwaukee");
      assert.ok(next);
      const merged = mergeSignupAttribution(previous, next);
      assert.equal(
        merged.promotionSlug,
        "milwaukee",
        "a signup that CARRIES a promo slug writes it — the merge only protects the ABSENT case"
      );
      assert.equal(merged.promotionPageType, "toolset", "…and the pageType travels with it");
    }
  );

  await run("a signup carrying its own builtPrizeSlug overwrites the stored one", () => {
    const previous: SignupAttribution = {
      promotionSlug: "makita",
      promotionPageType: "toolset",
      builtPrizeSlug: "makita-kincrome",
      visitedAt: new Date("2026-07-01T00:00:00Z"),
    };
    const next = buildSignupAttribution("makita", undefined, "ryobi-kincrome");
    assert.ok(next);
    const merged = mergeSignupAttribution(previous, next);
    assert.equal(merged.builtPrizeSlug, "ryobi-kincrome");
  });

  await run("…but a signup with NO promo fields leaves both stored values intact", () => {
    // The other half of the same rule, and the one F-019 actually fixed: the returning
    // visitor whose new request carries only a click id.
    const previous: SignupAttribution = {
      promotionSlug: "makita",
      promotionPageType: "toolset",
      builtPrizeSlug: "makita-kincrome",
      visitedAt: new Date("2026-07-01T00:00:00Z"),
    };
    const next = buildSignupAttribution(undefined, { utm_source: "tiktok" });
    assert.ok(next);
    assert.equal(next.promotionSlug, undefined, "precondition: the new signup carries no promo");
    const merged = mergeSignupAttribution(previous, next);
    assert.equal(merged.promotionSlug, "makita");
    assert.equal(merged.promotionPageType, "toolset");
    assert.equal(merged.builtPrizeSlug, "makita-kincrome");
    assert.equal(merged.utmSource, "tiktok");
  });

  await run("previous-only fields survive a signup that does not carry them", () => {
    // Guards the `...previous` spread itself. Without it the merge degenerates back into the
    // wholesale replace F-019 fixed — and the promo fields alone would NOT reveal it, because
    // the explicit preserve branches below re-add those two. The UTM/campaign snapshot is the
    // part only `...previous` protects.
    const previous: SignupAttribution = {
      visitedAt: new Date("2026-07-01T00:00:00Z"),
      utmSource: "facebook",
      utmCampaign: "june-launch",
      campaignId: "111",
      adsetId: "222",
      adId: "333",
    };
    const next = buildSignupAttribution(undefined, undefined, undefined, "meta");
    assert.ok(next);
    const merged = mergeSignupAttribution(previous, next);
    assert.equal(merged.utmSource, "facebook", "the original UTM snapshot must not be dropped");
    assert.equal(merged.utmCampaign, "june-launch");
    assert.equal(merged.campaignId, "111");
    assert.equal(merged.adsetId, "222");
    assert.equal(merged.adId, "333");
    assert.equal(merged.clickPlatform, "meta");
  });

  await run("an explicitly-undefined promo key on `next` still cannot clear the stored one", () => {
    // Why the two preserve branches are not redundant with `...previous`: today
    // `buildSignupAttribution` OMITS absent keys, so `...next` never overwrites with undefined
    // and the branches look like dead code. Change it to emit `promotionSlug: undefined`
    // (a one-character slip — `...(hasPromo && {…})` → an unconditional object) and the spread
    // starts erasing the stored value. The branches are the belt to that braces; this pins them.
    const previous: SignupAttribution = {
      promotionSlug: "makita",
      promotionPageType: "toolset",
      builtPrizeSlug: "makita-kincrome",
      visitedAt: new Date("2026-07-01T00:00:00Z"),
    };
    const next: SignupAttribution = {
      visitedAt: new Date("2026-07-20T00:00:00Z"),
      promotionSlug: undefined,
      promotionPageType: undefined,
      builtPrizeSlug: undefined,
      clickPlatform: "meta",
    };
    assert.equal("promotionSlug" in next, true, "precondition: the key is PRESENT and undefined");
    const merged = mergeSignupAttribution(previous, next);
    assert.equal(merged.promotionSlug, "makita");
    assert.equal(merged.promotionPageType, "toolset");
    assert.equal(merged.builtPrizeSlug, "makita-kincrome");
  });

  await run("no previous attribution → the new one is returned unchanged", () => {
    const next = buildSignupAttribution(TOOLSET_SLUG, { utm_source: "facebook" }, undefined, "meta");
    assert.ok(next);
    const merged = mergeSignupAttribution(undefined, next);
    assert.equal(merged, next, "a brand-new attribution is passed straight through, same object");
    assert.deepEqual(merged, next);
  });

  await run("last write wins for the non-promo fields — a newer UTM overwrites an older one", () => {
    const previous: SignupAttribution = {
      promotionSlug: "makita",
      promotionPageType: "toolset",
      visitedAt: new Date("2026-07-01T00:00:00Z"),
      utmSource: "facebook",
      utmCampaign: "june-launch",
    };
    const next = buildSignupAttribution(undefined, {
      utm_source: "tiktok",
      utm_campaign: "july-launch",
    });
    assert.ok(next);
    const merged = mergeSignupAttribution(previous, next);
    assert.equal(merged.utmSource, "tiktok", "a newer click/UTM must still refresh");
    assert.equal(merged.utmCampaign, "july-launch");
    assert.equal(merged.promotionSlug, "makita", "…without disturbing the first-touch promo page");
    assert.ok(
      merged.visitedAt > previous.visitedAt,
      "visitedAt refreshes to the newer touch (last-write-wins)"
    );
  });

  // ---------------------------------------------------------------- plainSignupAttribution

  await run("a mongoose-wrapped value is unwrapped via toObject before it is merged", () => {
    const stored = {
      promotionSlug: "makita",
      promotionPageType: "toolset" as const,
      visitedAt: new Date("2026-07-01T00:00:00Z"),
    };
    // Mimics a hydrated document's nested object: spreading it directly would drag internal
    // members onto the write, so the reader must go through toObject().
    const wrapped = { $__parent: {}, toObject: () => stored };
    assert.deepEqual(plainSignupAttribution(wrapped), stored);
    assert.equal(plainSignupAttribution(undefined), undefined);
    assert.equal(plainSignupAttribution(null), undefined);
    assert.equal(plainSignupAttribution("not-an-object"), undefined);
    // A plain object (lean read) passes straight through.
    assert.equal(plainSignupAttribution(stored), stored);
  });

  console.log(failures === 0 ? "\nAll passed\n" : `\n${failures} failed\n`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
