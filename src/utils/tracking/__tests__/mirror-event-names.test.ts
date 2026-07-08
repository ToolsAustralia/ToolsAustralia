import assert from "node:assert/strict";
import { MIRROR_EVENT_NAMES, mirrorEventNameSchema } from "../mirror-event-names";

function testAcceptsFunnelEvents() {
  for (const name of ["ViewContent", "AddToCart", "InitiateCheckout", "AddPaymentInfo", "Lead", "Search"]) {
    assert.equal(mirrorEventNameSchema.safeParse(name).success, true, `${name} must be accepted`);
  }
}

function testRejectsValueBearingAndArbitraryEvents() {
  // The mirror endpoint is unauthenticated — value-bearing events (Purchase,
  // Subscribe, …) must never be constructible through it, or forged requests
  // inflate Meta-reported revenue invisibly to server dashboards.
  for (const name of [
    "Purchase",
    "Subscribe",
    "StartTrial",
    "CompleteRegistration",
    "PageView",
    "purchase",
    "",
    "CustomEvent",
  ]) {
    assert.equal(mirrorEventNameSchema.safeParse(name).success, false, `"${name}" must be rejected`);
  }
}

function testArrayMatchesClientMirrorContract() {
  const expected = ["ViewContent", "AddToCart", "InitiateCheckout", "AddPaymentInfo", "Lead", "Search"];
  assert.deepEqual([...MIRROR_EVENT_NAMES].sort(), [...expected].sort(), "allowlist matches MirrorEventName");
}

function run() {
  testAcceptsFunnelEvents();
  testRejectsValueBearingAndArbitraryEvents();
  testArrayMatchesClientMirrorContract();
  console.log("mirror event-name allowlist tests passed");
}

try {
  run();
} catch (e) {
  console.error(e);
  process.exit(1);
}
