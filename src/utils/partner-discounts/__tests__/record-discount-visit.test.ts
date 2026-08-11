/**
 * Guards the functional core of partner-discount page analytics.
 *
 * Every assertion here pins a decision that, if reversed, produces a dashboard that LOOKS
 * fine and reports something false — the failure mode this repo has already shipped twice on
 * the promo tab:
 *
 *   1. Dedup FAILS OPEN. A timed-out dedup read must record the visit anyway. Failing closed
 *      would silently drop visits under exactly the load where they matter most, and an
 *      undercounted denominator inflates every rate derived from it.
 *   2. `accessPct` absent is NOT zero. The visit beacon fires before a member's tier resolves,
 *      so collapsing "unknown" into 0 would record members as having no partner access.
 *   3. Locked opens are a SUBSET of offer opens, and a seam cannot be reached where none was
 *      rendered. Both invariants are enforced in the core, so the read side can present
 *      "of which locked" and seam-reach rate without ever rendering a share above 100%.
 *   4. Engagement NEVER creates a visit row. Visits are the one number this feature must
 *      leave untouched.
 *   5. First-touch UTM beats the landing URL, and `utmBasis` records which was used — the
 *      audit column that makes an attribution shift after a deploy falsifiable.
 */
import assert from "node:assert/strict";
import {
  clampAccessPct,
  recordDiscountEngagement,
  recordDiscountVisit,
  type DiscountVisitRecordPayload,
} from "../record-discount-visit";

const baseVisit = {
  surface: "discount" as const,
  anonymousId: "anon-1",
  signedIn: false,
  referrerHeader: "https://toolsaustralia.com.au/discount",
  url: "https://toolsaustralia.com.au/discount",
};

const baseEngagement = {
  surface: "discount" as const,
  anonymousId: "anon-1",
  interacted: true,
  offersOpened: 3,
  lockedOffersOpened: 1,
  seamRendered: true,
  seamReached: true,
  unlockClicks: 1,
  portalHandoff: false,
  zeroResultSearch: false,
};

async function run() {
  // ── 1. Dedup fails OPEN ────────────────────────────────────────────────
  {
    let created = 0;
    const outcome = await recordDiscountVisit(baseVisit, {
      hasRecentVisit: async () => {
        throw new Error("simulated Mongo timeout");
      },
      createVisit: async () => {
        created += 1;
      },
    });
    assert.equal(outcome.recorded, true, "a dedup read failure must NOT drop the visit");
    assert.equal(created, 1, "the visit is written despite the dedup error");
  }

  // A genuine duplicate inside the window is still suppressed.
  {
    let created = 0;
    const outcome = await recordDiscountVisit(baseVisit, {
      hasRecentVisit: async () => true,
      createVisit: async () => {
        created += 1;
      },
    });
    assert.equal(outcome.recorded, false);
    assert.equal(
      outcome.recorded === false ? outcome.reason : null,
      "duplicate",
      "a real duplicate is reported as such, not as a failure"
    );
    assert.equal(created, 0, "a duplicate writes nothing");
  }

  // A visitor with no anonymousId cookie skips dedup entirely rather than being dropped.
  {
    let created = 0;
    let dedupCalls = 0;
    const outcome = await recordDiscountVisit(
      { ...baseVisit, anonymousId: undefined },
      {
        hasRecentVisit: async () => {
          dedupCalls += 1;
          return true;
        },
        createVisit: async () => {
          created += 1;
        },
      }
    );
    assert.equal(dedupCalls, 0, "no anonymousId means there is nothing to dedup against");
    assert.equal(outcome.recorded, true);
    assert.equal(created, 1, "an un-cookied visitor is still a visit");
  }

  // ── 2. accessPct: absent is not zero ───────────────────────────────────
  assert.equal(clampAccessPct(undefined), undefined, "unknown tier stays unknown");
  assert.equal(clampAccessPct(null), undefined, "null tier stays unknown");
  assert.equal(clampAccessPct(0), 0, "an explicit 0 is a real answer, not unknown");
  assert.equal(clampAccessPct(75), 75);
  assert.equal(clampAccessPct(140), 100, "clamped to the top of the range");
  assert.equal(clampAccessPct(-5), 0, "a malformed value reads as NO access, never full");
  assert.equal(clampAccessPct("nonsense"), 0, "unparseable reads as no access, never full");
  assert.equal(clampAccessPct(74.6), 75, "rounded, not truncated");

  {
    let payload: DiscountVisitRecordPayload | null = null;
    await recordDiscountVisit(
      { ...baseVisit, accessPct: undefined },
      {
        hasRecentVisit: async () => false,
        createVisit: async (p) => {
          payload = p;
        },
      }
    );
    assert.equal(
      (payload as DiscountVisitRecordPayload | null)?.accessPct,
      undefined,
      "an unresolved tier must not be persisted as 0% — that would record members as having no access"
    );
  }

  // ── 3. First-touch UTM wins, and utmBasis says so ──────────────────────
  {
    let payload: DiscountVisitRecordPayload | null = null;
    await recordDiscountVisit(
      {
        ...baseVisit,
        url: "https://toolsaustralia.com.au/discount?utm_source=google&utm_medium=organic",
        firstTouchUtmSource: "facebook",
        firstTouchUtmMedium: "cpc",
        firstTouchUtmCampaign: "winter",
      },
      {
        hasRecentVisit: async () => false,
        createVisit: async (p) => {
          payload = p;
        },
      }
    );
    const p = payload as DiscountVisitRecordPayload | null;
    assert.equal(p?.utmSource, "facebook", "the durable first-touch cookie beats the landing URL");
    assert.equal(p?.utmMedium, "cpc");
    assert.equal(p?.utmCampaign, "winter");
    assert.equal(p?.utmBasis, "first_touch", "the audit column records which basis was used");
  }

  // Falls back to the landing URL when there is no first-touch cookie.
  {
    let payload: DiscountVisitRecordPayload | null = null;
    await recordDiscountVisit(
      { ...baseVisit, url: "https://toolsaustralia.com.au/discount?utm_source=google" },
      {
        hasRecentVisit: async () => false,
        createVisit: async (p) => {
          payload = p;
        },
      }
    );
    const p = payload as DiscountVisitRecordPayload | null;
    assert.equal(p?.utmSource, "google");
    assert.equal(p?.utmBasis, "landing_url");
  }

  // ── 4. Engagement invariants ───────────────────────────────────────────
  {
    let sent: Record<string, unknown> | null = null;
    const outcome = await recordDiscountEngagement(
      { ...baseEngagement, offersOpened: 2, lockedOffersOpened: 9 },
      {
        updateVisitEngagement: async (p) => {
          sent = p as unknown as Record<string, unknown>;
          return true;
        },
      }
    );
    assert.equal(outcome.recorded, true);
    assert.equal(
      (sent as Record<string, unknown> | null)?.lockedOffersOpened,
      2,
      "locked opens are a SUBSET of offer opens — a payload claiming more is clamped, so the panel can never show a share above 100%"
    );
  }

  {
    let sent: Record<string, unknown> | null = null;
    await recordDiscountEngagement(
      { ...baseEngagement, seamRendered: false, seamReached: true },
      {
        updateVisitEngagement: async (p) => {
          sent = p as unknown as Record<string, unknown>;
          return true;
        },
      }
    );
    assert.equal(
      (sent as Record<string, unknown> | null)?.seamReached,
      false,
      "a seam cannot be reached on a visit where none was rendered"
    );
  }

  // Counters are clamped, never rejected — one silly number must not discard the honest columns.
  {
    let sent: Record<string, unknown> | null = null;
    await recordDiscountEngagement(
      { ...baseEngagement, offersOpened: 99_999, lockedOffersOpened: 99_999, unlockClicks: -3 },
      {
        updateVisitEngagement: async (p) => {
          sent = p as unknown as Record<string, unknown>;
          return true;
        },
      }
    );
    const s = sent as Record<string, unknown> | null;
    assert.equal(s?.offersOpened, 1000, "absurd counts are clamped to the ceiling");
    assert.equal(s?.unlockClicks, 0, "a negative count reads as none");
    assert.equal(s?.interacted, true, "the honest columns survive the clamp");
  }

  // ── 5. Engagement NEVER creates a row ──────────────────────────────────
  {
    const outcome = await recordDiscountEngagement(
      { ...baseEngagement, anonymousId: undefined },
      {
        updateVisitEngagement: async () => {
          throw new Error("must not be called without an anonymousId");
        },
      }
    );
    assert.equal(outcome.recorded, false);
    assert.equal(
      outcome.recorded === false ? outcome.reason : null,
      "no_anonymous_id",
      "with no cookie there is no row to attach to, and one must never be invented"
    );
  }

  {
    const outcome = await recordDiscountEngagement(baseEngagement, {
      updateVisitEngagement: async () => false,
    });
    assert.equal(outcome.recorded, false);
    assert.equal(
      outcome.recorded === false ? outcome.reason : null,
      "no_visit_row",
      "a missing visit row is an EXPECTED outcome (dedup race, TTL, rate-limited mount), not an error"
    );
  }

  console.log("record-discount-visit: all assertions passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
