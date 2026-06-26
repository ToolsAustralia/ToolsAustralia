import assert from "node:assert/strict";
import { getLandingHeroUrgencyFromDrawDay } from "../promo-hero-images";

/**
 * getLandingHeroUrgencyFromDrawDay keys the landing-hero countdown tier to the draw's
 * AEST calendar day (not a rolling-hours window):
 *   - the whole day before the draw (00:00–24:00 AEST)  → drawn-tomorrow
 *   - the draw's own day, up to the draw moment           → drawn-tonight
 *   - the draw moment onward, and any earlier day         → null
 */

/** Winter draw — AEST (UTC+10), no DST. 27 Jun 2026, 8:30pm AEST. */
function testWinterDrawDay() {
  const draw = { drawDate: "2026-06-27T20:30:00+10:00" };
  const at = (iso: string) => getLandingHeroUrgencyFromDrawDay(draw, new Date(iso));

  assert.equal(at("2026-06-25T12:00:00+10:00"), null, "two days before → base");
  assert.equal(at("2026-06-26T00:00:00+10:00"), "drawn-tomorrow", "midnight day-before → tomorrow");
  assert.equal(at("2026-06-26T23:59:00+10:00"), "drawn-tomorrow", "end of day-before → tomorrow");
  assert.equal(at("2026-06-27T00:00:00+10:00"), "drawn-tonight", "midnight draw-day → tonight");
  assert.equal(at("2026-06-27T20:29:00+10:00"), "drawn-tonight", "just before draw → tonight");
  assert.equal(at("2026-06-27T20:30:00+10:00"), null, "at draw moment → base");
  assert.equal(at("2026-06-27T21:00:00+10:00"), null, "after draw → base");
  assert.equal(at("2026-06-28T09:00:00+10:00"), null, "day after → base");
}

/** Summer draw — AEDT (UTC+11), DST in effect. 15 Jan 2026, 8:30pm AEDT. */
function testSummerDrawDay() {
  const draw = { drawDate: "2026-01-15T20:30:00+11:00" };
  const at = (iso: string) => getLandingHeroUrgencyFromDrawDay(draw, new Date(iso));

  assert.equal(at("2026-01-14T12:00:00+11:00"), "drawn-tomorrow", "day-before (AEDT) → tomorrow");
  assert.equal(at("2026-01-15T00:00:00+11:00"), "drawn-tonight", "midnight draw-day (AEDT) → tonight");
  assert.equal(at("2026-01-15T20:31:00+11:00"), null, "after draw (AEDT) → base");
}

/**
 * Spring-forward boundary: Sydney clocks jump 02:00→03:00 on 4 Oct 2026, so 4 Oct is a
 * 23-hour day. A draw on 5 Oct must still read as drawn-tomorrow throughout 4 Oct.
 */
function testDstSpringForwardDayBefore() {
  const draw = { drawDate: "2026-10-05T20:30:00+11:00" }; // 5 Oct is AEDT
  const at = (iso: string) => getLandingHeroUrgencyFromDrawDay(draw, new Date(iso));

  // 4 Oct early (still AEST +10, before the 2am switch) and late (AEDT +11)
  assert.equal(at("2026-10-04T01:00:00+10:00"), "drawn-tomorrow", "pre-switch 4 Oct → tomorrow");
  assert.equal(at("2026-10-04T22:00:00+11:00"), "drawn-tomorrow", "post-switch 4 Oct → tomorrow");
  assert.equal(at("2026-10-05T09:00:00+11:00"), "drawn-tonight", "5 Oct before draw → tonight");
}

/** Missing / malformed draw dates never throw and never gate the hero. */
function testNoOrInvalidDrawDate() {
  assert.equal(getLandingHeroUrgencyFromDrawDay(null, new Date("2026-06-26T12:00:00+10:00")), null);
  assert.equal(getLandingHeroUrgencyFromDrawDay({}, new Date("2026-06-26T12:00:00+10:00")), null);
  assert.equal(
    getLandingHeroUrgencyFromDrawDay({ drawDate: "not-a-date" }, new Date("2026-06-26T12:00:00+10:00")),
    null
  );
}

function run() {
  testWinterDrawDay();
  testSummerDrawDay();
  testDstSpringForwardDayBefore();
  testNoOrInvalidDrawDate();
  console.log("landing-draw-day-urgency tests passed");
}

run();
